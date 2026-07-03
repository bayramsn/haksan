/**
 * Data migration: re-run the lookup sync so lookup rows added to
 * seed/_data.ts AFTER 003_sync_lookups was applied reach existing
 * environments — specifically the KARSI_AYNA and CANLI_TAKIM product
 * spec groups introduced with the machine-specific spec templates.
 *
 * 003's sync is idempotent/additive (onConflictDoUpdate keyed on code),
 * so this simply replays it under a new migration id.
 */
import type { DbClient } from '../client';
import { up as syncLookups } from './003_sync_lookups';

export async function up(db: DbClient): Promise<void> {
  await syncLookups(db);
}
