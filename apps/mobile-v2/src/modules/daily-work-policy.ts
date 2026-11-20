export type DailyTask = { status: string; overdue: boolean; dueAt: string | null; priority: string };
const priority: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
export function prioritizeTasks<T extends DailyTask>(tasks: T[]): T[] {
  return tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled').sort((a, b) =>
    Number(b.overdue) - Number(a.overdue)
    || (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity)
    || (priority[a.priority] ?? 2) - (priority[b.priority] ?? 2));
}
export function outstandingService<T extends { status: { code: string } | null }>(rows: T[]): T[] {
  return rows.filter((row) => !['resolved', 'closed'].includes(row.status?.code ?? ''));
}
/** Explicitly stale/revoked preferences must not suppress assignment loading. */
export function validWorkPreference(allowed: readonly string[], saved: string | undefined): boolean {
  return Boolean(saved && allowed.includes(saved));
}
