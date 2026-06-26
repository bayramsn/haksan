import type { DbClient } from '../client';
import { up as standardizeRemainingCncSpecs } from './007_standardize_remaining_cnc_specs';

export async function up(db: DbClient): Promise<void> {
  await standardizeRemainingCncSpecs(db);
}
