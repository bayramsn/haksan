/**
 * Drop ALL data from ALL tables (TRUNCATE … CASCADE).
 * Use only in dev/test. Will refuse in production.
 */
import { sql } from 'drizzle-orm';
import { getDb, closeDb } from './client';
import { loadEnv } from '../config/env';

async function main() {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') {
    throw new Error('db:reset is forbidden in production.');
  }
  const db = getDb();
  console.log('[reset] truncating all tables (cascade) …');
  await db.execute(sql`
    DO $$
    DECLARE
      stmt text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE'
        INTO stmt
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename NOT LIKE '\\_\\_drizzle%' ESCAPE '\\';
      IF stmt IS NOT NULL THEN
        EXECUTE stmt;
      END IF;
    END $$;
  `);
  console.log('[reset] done.');
  await closeDb();
}

main().catch((err) => {
  console.error('[reset] failed:', err);
  process.exit(1);
});
