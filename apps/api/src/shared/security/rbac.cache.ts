import { eq } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { userRoles, rolePermissions, permissions } from '../../db/schema/users';
import { inArray } from 'drizzle-orm';

/**
 * Tiny in-memory permission cache keyed by user id.
 * For multi-instance deployments swap for Redis later.
 */
const cache = new Map<string, { expiresAt: number; perms: Set<string> }>();
const TTL_MS = 60_000; // 1 minute

export async function rolePermissionsCacheKey(db: DbClient, userId: string): Promise<Set<string>> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.perms;

  const userRoleRows = await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId));
  const roleIds = userRoleRows.map((r) => r.roleId);
  if (!roleIds.length) {
    const empty = new Set<string>();
    cache.set(userId, { expiresAt: Date.now() + TTL_MS, perms: empty });
    return empty;
  }

  const rpRows = await db
    .select({ permissionId: rolePermissions.permissionId })
    .from(rolePermissions)
    .where(inArray(rolePermissions.roleId, roleIds));
  const permIds = rpRows.map((r) => r.permissionId);
  if (!permIds.length) {
    const empty = new Set<string>();
    cache.set(userId, { expiresAt: Date.now() + TTL_MS, perms: empty });
    return empty;
  }

  const permRows = await db.select({ code: permissions.code }).from(permissions).where(inArray(permissions.id, permIds));
  const set = new Set(permRows.map((p) => p.code));
  cache.set(userId, { expiresAt: Date.now() + TTL_MS, perms: set });
  return set;
}

export function invalidateRbacCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
