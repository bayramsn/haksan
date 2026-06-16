/**
 * Run pending Drizzle migrations against the configured database.
 * Usage (dev/CI):  npm run db:migrate          (tsx, reads ./src/db/migrations)
 * Usage (prod):    node dist/db/migrate.js      (compiled, reads ./dist/db/migrations)
 *
 * The migrations folder is resolved relative to this file (__dirname) so the
 * runner is independent of the process working directory. In both execution
 * modes the sibling `migrations/` folder holds the SQL + meta/_journal.json
 * (copied into dist via nest-cli `assets`).
 */
import { join } from 'path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, closeDb } from './client';

async function main() {
  const db = getDb();
  const migrationsFolder = join(__dirname, 'migrations');
  console.log(`[migrate] running pending migrations from ${migrationsFolder} …`);
  await migrate(db, { migrationsFolder });
  console.log('[migrate] done.');
  await closeDb();
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
