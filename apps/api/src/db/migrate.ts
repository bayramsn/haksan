/**
 * Run pending Drizzle migrations against the configured database.
 * Usage: npm run db:migrate
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, closeDb } from './client';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function main() {
  const db = getDb();
  console.log(`[migrate] running pending migrations from ${migrationsFolder} …`);
  await migrate(db, { migrationsFolder });
  console.log('[migrate] done.');
  await closeDb();
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
