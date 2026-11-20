import { readFileSync } from 'fs';
import { statfs } from 'node:fs/promises';
import { join } from 'path';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { loadEnv } from './config/env';
import { getPool } from './db/client';
import { buildS3ClientConfig } from './shared/storage/s3-client-config';
import { logger } from './shared/utils/logger';

const DEPENDENCY_TIMEOUT_MS = 5_000;
const MINIMUM_TEMP_FREE_BYTES = 64 * 1024 * 1024;

type DependencyStatus = 'ok' | 'error';

interface DependencyCheckResult {
  ok: boolean;
  dependencies: {
    database: { status: DependencyStatus };
    objectStorage: { status: DependencyStatus };
    tempSpace: { status: DependencyStatus; freeMb?: number };
    configuration: { status: DependencyStatus };
  };
}

let storageClient: S3Client | undefined;

function expectedMigrationCount(): number {
  // Resolve relative to this file (__dirname), not process.cwd(), so readiness
  // works regardless of the working directory the API is started from. The
  // journal sits next to the migrations under db/migrations/meta and is copied
  // into dist via nest-cli `assets` for production builds.
  const journalPath = join(__dirname, 'db/migrations/meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
  return journal.entries.length;
}

async function readinessCheck(): Promise<{ ok: true; migrations: { applied: number; expected: number } } | { ok: false; reason: string }> {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    const expected = expectedMigrationCount();
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations`
    );
    const applied = Number(result.rows[0]?.count ?? 0);
    if (applied < expected) {
      return { ok: false, reason: `MIGRATION_PENDING (${applied}/${expected})` };
    }
    return { ok: true, migrations: { applied, expected } };
  } catch (err) {
    logger.warn({ err }, '[health] readiness check failed');
    const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
    if (code === '42P01') {
      return { ok: false, reason: 'SCHEMA_OUT_OF_DATE' };
    }
    return { ok: false, reason: 'DB_UNAVAILABLE' };
  }
}

function versionMetadata(apiPrefix: string) {
  return {
    service: 'haksan-api',
    commit: process.env.API_RELEASE_ID || process.env.GIT_COMMIT || process.env.RENDER_GIT_COMMIT || 'unknown',
    builtAt: process.env.IMAGE_BUILD_TIME || process.env.BUILD_TIME || null,
    node: process.version,
    apiPrefix,
  };
}

async function withTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), DEPENDENCY_TIMEOUT_MS);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function checkObjectStorage(): Promise<void> {
  const env = loadEnv();
  if (env.S3_PROVIDER === 'supabase') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_STORAGE_CONFIG_MISSING');
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/bucket`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      signal: AbortSignal.timeout(DEPENDENCY_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`SUPABASE_STORAGE_${response.status}`);
    return;
  }

  storageClient ??= new S3Client(buildS3ClientConfig(env));
  const bucket = env.S3_PROVIDER === 's3' ? env.S3_BUCKET_NAME : 'erp-import-raw';
  if (!bucket) throw new Error('OBJECT_STORAGE_BUCKET_MISSING');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEPENDENCY_TIMEOUT_MS);
  timeout.unref();
  try {
    await storageClient.send(new HeadBucketCommand({ Bucket: bucket }), { abortSignal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function dependencyCheck(): Promise<DependencyCheckResult> {
  const dependencies: DependencyCheckResult['dependencies'] = {
    database: { status: 'error' },
    objectStorage: { status: 'error' },
    tempSpace: { status: 'error' },
    configuration: { status: 'ok' },
  };

  const [databaseResult, storageResult, tempResult] = await Promise.allSettled([
    withTimeout(getPool().query('SELECT 1'), 'DATABASE'),
    checkObjectStorage(),
    statfs('/tmp'),
  ]);

  if (databaseResult.status === 'fulfilled') dependencies.database.status = 'ok';
  else logger.warn({ err: databaseResult.reason }, '[health] database dependency failed');

  if (storageResult.status === 'fulfilled') dependencies.objectStorage.status = 'ok';
  else logger.warn({ err: storageResult.reason }, '[health] object storage dependency failed');

  if (tempResult.status === 'fulfilled') {
    const freeBytes = Number(tempResult.value.bavail) * Number(tempResult.value.bsize);
    dependencies.tempSpace = {
      status: freeBytes >= MINIMUM_TEMP_FREE_BYTES ? 'ok' : 'error',
      freeMb: Math.floor(freeBytes / 1024 / 1024),
    };
    if (dependencies.tempSpace.status === 'error') {
      logger.warn({ freeBytes }, '[health] temporary space is low');
    }
  } else {
    logger.warn({ err: tempResult.reason }, '[health] temporary space dependency failed');
  }

  return {
    ok: Object.values(dependencies).every((dependency) => dependency.status === 'ok'),
    dependencies,
  };
}

export function registerHealthRoutes(app: NestFastifyApplication, apiPrefix: string): void {
  const adapter = app.getHttpAdapter();

  adapter.get('/health', (_req: unknown, res: { send: (body: unknown) => void }) => {
    res.send({ ok: true, ts: new Date().toISOString() });
  });

  adapter.get('/health/live', (_req: unknown, res: { send: (body: unknown) => void }) => {
    res.send({ ok: true, ...versionMetadata(apiPrefix), ts: new Date().toISOString() });
  });

  adapter.get('/health/ready', async (_req: unknown, res: { status: (code: number) => { send: (body: unknown) => void } }) => {
    const check = await readinessCheck();
    if (!check.ok) {
      res.status(503).send({ ok: false, reason: check.reason, ts: new Date().toISOString() });
      return;
    }
    res.status(200).send({ ...check, ts: new Date().toISOString() });
  });

  adapter.get('/health/dependencies', async (_req: unknown, res: { status: (code: number) => { send: (body: unknown) => void } }) => {
    const check = await dependencyCheck();
    res.status(check.ok ? 200 : 503).send({
      ...check,
      ...(check.ok ? {} : { reason: 'DEPENDENCY_UNAVAILABLE' }),
      ts: new Date().toISOString(),
    });
  });

  adapter.get('/health/version', (_req: unknown, res: { send: (body: unknown) => void }) => {
    res.send(versionMetadata(apiPrefix));
  });

  const rootPayload = {
    ok: true,
    service: 'haksan-api',
    api: apiPrefix,
    health: '/health',
    live: '/health/live',
    ready: '/health/ready',
    dependencies: '/health/dependencies',
  };
  adapter.get('/', (_req: unknown, res: { send: (body: unknown) => void }) => res.send(rootPayload));
}
