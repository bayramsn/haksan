/**
 * Older deployments may have the generic files resource in shared code but
 * lack its catalog rows because the lookup seed had already run. Add the
 * catalog first, then reconcile the existing role matrix for every tenant.
 */
import { PERMISSION_ACTIONS } from '@haksan/shared';
import type { DbClient } from '../client';
import { schema } from '../client';
import { up as syncRolePermissions } from './001_sync_role_permissions';

export async function up(db: DbClient): Promise<void> {
  await db
    .insert(schema.permissions)
    .values(
      PERMISSION_ACTIONS.map((action) => ({
        code: `files.${action}`,
        name: `files - ${action}`,
        resource: 'files',
        action,
      }))
    )
    .onConflictDoNothing({ target: schema.permissions.code });

  await syncRolePermissions(db);
}
