import { kv } from '@/src/offline/storage';

const DIVISION_KEY = 'active_division_id';
const DEPARTMENT_KEY = 'active_department_id';

export type ActiveScope = {
  divisionId: string | null;
  departmentId: string | null;
};

export function activeScope(): ActiveScope {
  return {
    divisionId: kv.getString(DIVISION_KEY) ?? null,
    departmentId: kv.getString(DEPARTMENT_KEY) ?? null,
  };
}

export function setActiveScope(scope: ActiveScope): void {
  if (scope.divisionId) kv.set(DIVISION_KEY, scope.divisionId);
  else kv.delete(DIVISION_KEY);
  if (scope.departmentId) kv.set(DEPARTMENT_KEY, scope.departmentId);
  else kv.delete(DEPARTMENT_KEY);
}

export function clearActiveScope(): void {
  kv.delete(DIVISION_KEY);
  kv.delete(DEPARTMENT_KEY);
}
