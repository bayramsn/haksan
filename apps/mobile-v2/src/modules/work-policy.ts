export type WorkKind = 'tasks' | 'approvals' | 'sales' | 'service' | 'installations' | 'operations' | 'finance';
export const workOrder: WorkKind[] = ['sales', 'service', 'installations', 'operations', 'finance', 'tasks', 'approvals'];

/** Stored choices never override a revoked permission. Ties preserve domain order. */
export function selectWorkKind(allowed: WorkKind[], saved?: string, assigned: Partial<Record<WorkKind, number>> = {}, preferred?: WorkKind): WorkKind | null {
  if (saved && allowed.includes(saved as WorkKind)) return saved as WorkKind;
  const hasAssigned = allowed.some((kind) => (assigned[kind] ?? 0) > 0);
  if (!hasAssigned && preferred && allowed.includes(preferred)) return preferred;
  return workOrder.filter((kind) => allowed.includes(kind))
    .sort((a, b) => (assigned[b] ?? 0) - (assigned[a] ?? 0))[0] ?? null;
}

export function workPreferenceKey(userId: string, tenantId: string, divisionId: string | null, departmentId: string | null): string {
  return `work-kind:${tenantId}:${userId}:${divisionId ?? 'all'}:${departmentId ?? 'all'}`;
}

/** Role is only an empty-queue default; permissions and actual assignments win. */
export function roleWorkDefault(roles: readonly string[]): WorkKind {
  if (roles.includes('service')) return 'service';
  if (roles.includes('stock')) return 'operations';
  if (roles.includes('finance')) return 'finance';
  if (roles.includes('sales')) return 'sales';
  return 'tasks';
}
