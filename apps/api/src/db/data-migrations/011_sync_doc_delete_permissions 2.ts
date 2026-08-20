import type { DbClient } from '../client';
import { up as syncRolePermissions } from './001_sync_role_permissions';

export async function up(db: DbClient): Promise<void> {
  await syncRolePermissions(db);
}
