/**
 * Run pending DATA migrations (DML reconciliation), separate from Drizzle
 * SCHEMA migrations. Each entry in ./data-migrations runs exactly once per
 * environment, tracked in public.__data_migrations.
 *
 * Usage (dev/CI):  npm run db:data-migrate       (tsx)
 * Usage (prod):    node dist/db/data-migrate.js   (compiled, after schema migrate)
 *
 * Designed to run on every deploy right after `db:migrate`: it is idempotent and
 * additive (e.g. attaches newly-added permissions to existing roles).
 */
import { sql } from 'drizzle-orm';
import { getDb, getPool, closeDb, type DbClient } from './client';
import { dataMigrations } from './data-migrations';

const TRACKING_TABLE = '__data_migrations';

async function ensureTrackingTable(): Promise<void> {
  await getPool().query(
    `CREATE TABLE IF NOT EXISTS public.${TRACKING_TABLE} (
       id text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`
  );
}

async function appliedIds(): Promise<Set<string>> {
  const res = await getPool().query<{ id: string }>(`SELECT id FROM public.${TRACKING_TABLE}`);
  return new Set(res.rows.map((r) => r.id));
}

async function main(): Promise<void> {
  await ensureTrackingTable();
  const done = await appliedIds();
  const db = getDb();

  let ran = 0;
  for (const migration of dataMigrations) {
    if (done.has(migration.id)) continue;
    console.log(`[data-migrate] applying ${migration.id} …`);
    await db.transaction(async (tx) => {
      await migration.up(tx as unknown as DbClient);
      await tx.execute(sql`INSERT INTO public.__data_migrations (id) VALUES (${migration.id})`);
    });
    ran++;
  }

  if (ran === 0) {
    console.log('[data-migrate] no pending data migrations.');
  } else {
    console.log(`[data-migrate] applied ${ran} data migration(s).`);
  }

  await closeDb();
}

main().catch((err) => {
  console.error('[data-migrate] failed:', err);
  process.exit(1);
});
