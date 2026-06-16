/**
 * Pre-deploy database backup to S3/R2.
 *
 * Streams `pg_dump` (gzip) of DATABASE_URL into the configured object store
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
import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { loadEnv } from '../config/env';

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function main(): Promise<void> {
  if (process.env.DB_BACKUP_ENABLED !== 'true') {
    console.log('[backup] DB_BACKUP_ENABLED!=true — skipped.');
    return;
  }
  const required = process.env.DB_BACKUP_REQUIRED === 'true';
  const env = loadEnv();
  const bucket = process.env.S3_BACKUP_BUCKET ?? `${env.S3_BUCKET_PREFIX}-backups`;
  const key = `db-backups/haksan_${timestamp()}.sql.gz`;

  // pg_dump --no-owner --no-acl <DATABASE_URL>; spawn (no shell) avoids injection.
  const dump = spawn('pg_dump', ['--no-owner', '--no-acl', env.DATABASE_URL], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const missingTool = await new Promise<boolean>((resolve) => {
    dump.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') resolve(true);
      else {
        console.error('[backup] pg_dump spawn error:', err);
        resolve(false);
      }
    });
    // If it starts producing data, the tool exists.
    dump.stdout.once('data', () => resolve(false));
  });

  if (missingTool) {
    const msg = '[backup] pg_dump not found on PATH.';
    if (required) {
      console.error(`${msg} DB_BACKUP_REQUIRED=true — failing deploy.`);
      process.exit(1);
    }
    console.warn(`${msg} Skipping backup (set DB_BACKUP_REQUIRED=true to enforce).`);
    return;
  }

  let stderr = '';
  dump.stderr.on('data', (d) => {
    stderr += String(d);
  });

  const gzipped = await streamToBuffer(dump.stdout.pipe(createGzip()));
  const exitCode: number = await new Promise((resolve) => dump.on('close', resolve));
  if (exitCode !== 0) {
    console.error(`[backup] pg_dump exited ${exitCode}: ${stderr.trim()}`);
    if (required) process.exit(1);
    return;
  }

  const s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: gzipped, ContentType: 'application/gzip' })
  );

  console.log(`[backup] uploaded s3://${bucket}/${key} (${(gzipped.length / 1024 / 1024).toFixed(2)} MB).`);
}

main().catch((err) => {
  console.error('[backup] failed:', err);
  // A backup failure should not silently pass when explicitly required.
  if (process.env.DB_BACKUP_REQUIRED === 'true') process.exit(1);
});
