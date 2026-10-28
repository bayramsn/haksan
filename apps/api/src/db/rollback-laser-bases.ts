/** Preview by default; --execute restores an unchanged consolidation in one transaction. */
import { sql } from 'drizzle-orm';
import { getDb, closeDb, type DbClient } from './client';
import { down } from './data-migrations/024_laser_series_base_models';

async function main() {
  const db = getDb();
  if (!process.argv.includes('--execute')) {
    const result = await db.execute(sql`SELECT migration_id, applied_at, rolled_back_at, jsonb_array_length(changes) AS change_count FROM public.__laser_base_snapshots WHERE migration_id = '024_laser_series_base_models'`);
    console.log(JSON.stringify(result.rows));
    console.log('Preview only. Pass --execute to restore untouched bases/options and source visibility.');
    return;
  }
  await db.transaction(tx => down(tx as unknown as DbClient));
  console.log('Laser base rollback completed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(closeDb);
