/** Preview by default. Apply: npx tsx src/db/rollback-machine-taxonomy.ts --execute */
import { sql } from 'drizzle-orm';
import { getDb, closeDb, type DbClient } from './client';
import { down } from './data-migrations/023_consolidate_machine_taxonomy';

async function main() {
  const db = getDb();
  if (!process.argv.includes('--execute')) {
    const result = await db.execute(sql`SELECT migration_id, applied_at, rolled_back_at, jsonb_array_length(changes) AS change_count
      FROM public.__machine_taxonomy_snapshots WHERE migration_id = '023_consolidate_machine_taxonomy'`);
    console.log(JSON.stringify(result.rows));
    console.log('Preview only. Pass --execute to restore the recorded taxonomy in one transaction.');
    return;
  }
  await db.transaction(async tx => down(tx as unknown as DbClient));
  console.log('Machine taxonomy rollback completed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(closeDb);
