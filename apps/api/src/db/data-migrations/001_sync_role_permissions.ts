/**
 * Data migration: sync the role-permission matrix for ALL tenants.
 *
 * When new permissions are added to the catalog (rolePermissionMatrix), existing
 * system roles in already-provisioned tenants do not automatically receive them.
 * Re-running bootstrap only covers the single tenant given via env. This data
 * migration walks every tenant and inserts any missing (role, permission) pairs
 * that the matrix prescribes. It is idempotent: existing pairs are skipped via
 * onConflictDoNothing, and it never removes permissions.
 */
import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../client';
import { schema } from '../client';
import { allRoles, rolePermissionMatrix } from '../seed/_data';

export async function up(db: DbClient): Promise<void> {
  const allPerms = await db.query.permissions.findMany();
  const permsByCode = new Map(allPerms.map((p) => [p.code, p]));
  const allResources = Array.from(new Set(allPerms.map((p) => p.resource)));

  const tenants = await db.query.tenants.findMany();
  let inserted = 0;

  for (const tenant of tenants) {
    for (const roleCode of allRoles) {
      const role = await db.query.roles.findFirst({
        where: and(eq(schema.roles.tenantId, tenant.id), eq(schema.roles.code, roleCode)),
      });
      // Only sync roles that already exist for this tenant; provisioning new
      // roles is bootstrap's job.
      if (!role) continue;

      const matrix = rolePermissionMatrix[roleCode] ?? {};
      const permCodes: string[] = [];
      for (const [resource, actions] of Object.entries(matrix)) {
        const resourceList = resource === '*' ? allResources : [resource];
        for (const r of resourceList) {
          const actionList =
            actions === '*'
              ? Array.from(new Set(allPerms.filter((p) => p.resource === r).map((p) => p.action)))
              : (actions as string[]);
          for (const a of actionList) permCodes.push(`${r}.${a}`);
        }
      }

      const rows = permCodes
        .map((code) => permsByCode.get(code))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({ roleId: role.id, permissionId: p.id }));

      if (rows.length) {
        const res = await db.insert(schema.rolePermissions).values(rows).onConflictDoNothing();
        inserted += res.rowCount ?? 0;
      }
    }
  }

  console.log(`[data-migrate] 001_sync_role_permissions: ${tenants.length} tenant(s), ${inserted} new role-permission row(s).`);
}
