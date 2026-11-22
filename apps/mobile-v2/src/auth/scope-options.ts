import type { AuthUser } from '@/src/api/endpoints';
import type { ActiveScope } from './scope';

type ScopeUser = Pick<AuthUser, 'divisions' | 'departments' | 'accessScopes' | 'canViewAllDivisions'>;
export function scopeOptions(user: ScopeUser, departmentId: string | null, resource: string) {
  const rows = user.accessScopes.filter(row => row.resource === resource);
  const eligible = rows.filter(row => !departmentId || row.departmentId === null || row.departmentId === departmentId);
  const legacy = rows.length === 0;
  const canPickAll = legacy ? user.canViewAllDivisions : eligible.some(row => row.divisionId === null);
  const divisions = legacy || canPickAll ? user.divisions : user.divisions.filter(division => eligible.some(row => row.divisionId === division.id));
  const departments = legacy || rows.some(row => row.departmentId === null) ? user.departments : user.departments.filter(department => rows.some(row => row.departmentId === department.id));
  const primary = eligible.find(row => row.isPrimary && row.divisionId && divisions.some(division => division.id === row.divisionId))?.divisionId
    ?? divisions.find(division => division.isPrimary)?.id ?? divisions[0]?.id ?? null;
  return { divisions, departments, canPickAll, primary, legacy, available: canPickAll || divisions.length > 0 };
}
/** No new access is granted: the API remains authoritative for every resource. */
export function reconcileScope(user: ScopeUser, next: ActiveScope, resource: string): ActiveScope | null {
  const initial = scopeOptions(user, next.departmentId, resource);
  const departmentId = next.departmentId && initial.departments.some(row => row.id === next.departmentId)
    ? next.departmentId : initial.departments.find(row => row.isPrimary)?.id ?? initial.departments[0]?.id ?? null;
  const options = scopeOptions(user, departmentId, resource);
  if (!options.available) return null;
  const divisionId = next.divisionId === null && options.canPickAll ? null
    : options.divisions.some(row => row.id === next.divisionId) ? next.divisionId : options.primary;
  return { departmentId, divisionId };
}
export function isScopeCompatible(user: ScopeUser, scope: ActiveScope, resource: string) {
  const options = scopeOptions(user, scope.departmentId, resource);
  if (scope.departmentId && !options.departments.some(row => row.id === scope.departmentId)) return false;
  return scope.divisionId === null ? options.canPickAll : options.divisions.some(row => row.id === scope.divisionId);
}
