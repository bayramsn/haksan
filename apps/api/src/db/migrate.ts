/**
 * Run pending Drizzle migrations against the configured database.
 * Usage: npm run db:migrate
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, closeDb } from './client';

async function main() {
  const db = getDb();
  console.log('[migrate] running pending migrations from ./src/db/migrations …');
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  console.log('[migrate] done.');
  await closeDb();
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
