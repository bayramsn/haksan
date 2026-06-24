/**
 * Static registry of data migrations, in apply order.
 *
 * A static list (rather than fs scanning + dynamic import) keeps the runner
 * working identically under tsx (dev) and compiled node (prod), and makes the
 * apply order explicit and reviewable.
 */
import type { DbClient } from '../client';
import { up as syncRolePermissions } from './001_sync_role_permissions';
import { up as backfillDivisionIsolation } from './002_backfill_division_isolation';
import { up as syncLookups } from './003_sync_lookups';

export interface DataMigration {
  id: string;
  up: (db: DbClient) => Promise<void>;
}

export const dataMigrations: DataMigration[] = [
  { id: '001_sync_role_permissions', up: syncRolePermissions },
  { id: '002_backfill_division_isolation', up: backfillDivisionIsolation },
  { id: '003_sync_lookups', up: syncLookups },
];
