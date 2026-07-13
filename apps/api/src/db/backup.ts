/**
 * Pre-deploy database backup to S3/R2.
 *
 * Streams `pg_dump` (gzip) into the configured object store
 * using the same S3_* credentials as file storage. Intended to run in Render's
 * preDeployCommand BEFORE migrations, so a bad migration can be rolled back from
 * a fresh snapshot.
 *
 * Behaviour (fail-safe by design):
 *   - Disabled unless DB_BACKUP_ENABLED=true (no-op exit 0).
 *   - If pg_dump is not installed: warn and exit 0, UNLESS DB_BACKUP_REQUIRED=true
 *     (then exit 1 to block the deploy).
 *
 * Env:
 *   DB_BACKUP_ENABLED   "true" to enable (default off)
 *   DB_BACKUP_REQUIRED  "true" to make a failed backup block the deploy
 *   S3_BACKUP_BUCKET    target bucket (default `${S3_BUCKET_PREFIX}-backups`)
 *
 * Usage (prod): node dist/db/backup.js
 */
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { finished } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { CopyObjectCommand, DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { loadEnv } from '../config/env';

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function escapePgpass(value: string): string {
  return value.replace(/([\\:])/g, '\\$1');
}

async function createPgpass(databaseUrl: string): Promise<{ directory: string; file: string; safeDatabaseUrl: string }> {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres or postgresql scheme');
  }

  const host = url.hostname;
  const port = url.port || '5432';
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!host || !database || !username || !password) {
    throw new Error('DATABASE_URL must include host, database, username and password for backup');
  }

  const directory = await mkdtemp(join(tmpdir(), 'haksan-pgpass-'));
  const file = join(directory, '.pgpass');
  await writeFile(
    file,
    `${escapePgpass(host)}:${escapePgpass(port)}:${escapePgpass(database)}:${escapePgpass(username)}:${escapePgpass(password)}\n`,
    { mode: 0o600 }
  );

  // Preserve SSL/query settings while ensuring the password never becomes a
  // pg_dump command-line argument.
  url.password = '';
  url.searchParams.delete('password');
  return { directory, file, safeDatabaseUrl: url.toString() };
}

function waitForSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
}

function waitForClose(child: ChildProcess): Promise<number> {
  return new Promise((resolve) => child.once('close', (code) => resolve(code ?? 1)));
}

function copySource(bucket: string, key: string): string {
  return `${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.DB_BACKUP_ENABLED) {
    console.log('[backup] DB_BACKUP_ENABLED!=true — skipped.');
    return;
  }
  const required = env.DB_BACKUP_REQUIRED;
  const bucket = env.S3_BACKUP_BUCKET ?? `${env.S3_BUCKET_PREFIX}-backups`;
  const key = `db-backups/haksan_${timestamp()}.sql.gz`;
  const s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    // MinIO accepts the signed streaming upload, but not the optional flexible
    // checksum trailer that recent AWS SDK releases enable by default. With an
    // unknown-length pg_dump stream that trailer can also produce an undefined
    // x-amz-decoded-content-length header on Node 22. S3 does not require the
    // optional checksum for PutObject, so only calculate one when an operation
    // explicitly requires it.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  const pgpass = await createPgpass(env.DATABASE_URL);
  const temporaryKey = `${key}.partial-${randomUUID()}`;
  let temporaryObjectExists = false;
  let killTimer: NodeJS.Timeout | undefined;

  try {
    const childEnv: NodeJS.ProcessEnv = { ...process.env, PGPASSFILE: pgpass.file };
    delete childEnv.DATABASE_URL;
    delete childEnv.PGPASSWORD;
    const dump = spawn('pg_dump', ['--no-owner', '--no-acl', '--dbname', pgpass.safeDatabaseUrl], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const closePromise = waitForClose(dump);

    try {
      await waitForSpawn(dump);
    } catch (err) {
      const message = (err as NodeJS.ErrnoException).code === 'ENOENT'
        ? '[backup] pg_dump not found on PATH.'
        : `[backup] pg_dump could not start: ${err instanceof Error ? err.message : String(err)}`;
      if (required) throw new Error(message);
      console.warn(`${message} Skipping backup.`);
      return;
    }

    if (!dump.stdout || !dump.stderr) throw new Error('[backup] pg_dump streams were unavailable');
    let stderr = '';
    dump.stderr.on('data', (data) => {
      stderr += String(data);
    });
    let timedOut = false;
    killTimer = setTimeout(() => {
      timedOut = true;
      dump.kill('SIGTERM');
      const forceKillTimer = setTimeout(() => dump.kill('SIGKILL'), 10_000);
      forceKillTimer.unref();
    }, env.DB_BACKUP_TIMEOUT_SECONDS * 1_000);
    killTimer.unref();

    const uploadBody = new PassThrough();
    const gzip = createGzip();
    const streamFinished = finished(uploadBody);
    temporaryObjectExists = true;
    const upload = s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: temporaryKey, Body: uploadBody, ContentType: 'application/gzip' })
    );
    dump.stdout.pipe(gzip).pipe(uploadBody);

    const exitCode = await closePromise;
    await streamFinished;
    await upload;
    clearTimeout(killTimer);
    killTimer = undefined;

    if (timedOut || exitCode !== 0) {
      const reason = timedOut
        ? `pg_dump exceeded ${env.DB_BACKUP_TIMEOUT_SECONDS} seconds`
        : `pg_dump exited ${exitCode}: ${stderr.trim()}`;
      if (required) throw new Error(`[backup] ${reason}`);
      console.warn(`[backup] ${reason}; backup skipped.`);
      return;
    }

    await s3.send(new CopyObjectCommand({ Bucket: bucket, Key: key, CopySource: copySource(bucket, temporaryKey) }));
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: temporaryKey }));
    temporaryObjectExists = false;
    console.log(`[backup] uploaded s3://${bucket}/${key}.`);
  } finally {
    if (killTimer) clearTimeout(killTimer);
    if (temporaryObjectExists) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: temporaryKey })).catch(() => undefined);
    }
    await rm(pgpass.directory, { recursive: true, force: true });
  }
}

function rawBoolean(value: string | undefined): boolean {
  return ['true', '1', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');
}

main().catch((err) => {
  console.error('[backup] failed:', err);
  // A backup failure should not silently pass when explicitly required.
  if (rawBoolean(process.env.DB_BACKUP_REQUIRED)) process.exitCode = 1;
});
