import { readFileSync } from 'fs';
import { join } from 'path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { getPool } from './db/client';
import { logger } from './shared/utils/logger';

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

export function registerHealthRoutes(app: NestFastifyApplication, apiPrefix: string): void {
  const adapter = app.getHttpAdapter();

  adapter.get('/health', (_req: unknown, res: { send: (body: unknown) => void }) => {
    res.send({ ok: true, ts: new Date().toISOString() });
  });

  adapter.get('/health/ready', async (_req: unknown, res: { status: (code: number) => { send: (body: unknown) => void } }) => {
    const check = await readinessCheck();
    if (!check.ok) {
      res.status(503).send({ ok: false, reason: check.reason, ts: new Date().toISOString() });
      return;
    }
    res.status(200).send({ ...check, ts: new Date().toISOString() });
  });

  adapter.get('/health/version', (_req: unknown, res: { send: (body: unknown) => void }) => {
    res.send({
      service: 'haksan-api',
      commit: process.env.GIT_COMMIT || process.env.RENDER_GIT_COMMIT || 'unknown',
      builtAt: process.env.BUILD_TIME || null,
      node: process.version,
      apiPrefix,
    });
  });

  const rootPayload = { ok: true, service: 'haksan-api', api: apiPrefix, health: '/health', ready: '/health/ready' };
  adapter.get('/', (_req: unknown, res: { send: (body: unknown) => void }) => res.send(rootPayload));
}
