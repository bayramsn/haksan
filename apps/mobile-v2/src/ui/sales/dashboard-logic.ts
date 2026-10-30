import type { SalesFocus } from './sales-logic.ts';

/**
 * Gösterge paneli "Öncelikli işler / Sinyaller": web `buildWorkItems` tüm
 * kayıtları istemcide tararken mobil yalnız sunucunun sayaç uçlarını
 * birleştirir; sıfır olan sinyal listeye girmez.
 */
export type WorkSeverity = 'critical' | 'warning' | 'info';

export type WorkTarget =
  | { kind: 'opportunities'; focus: SalesFocus }
  | { kind: 'tasks' }
  | { kind: 'receivables' }
  | { kind: 'service' };

export type WorkSignal = { id: string; severity: WorkSeverity; title: string; detail: string; count: number; target: WorkTarget };

export type WorkSignalInput = {
  overdueTasks: number | null;
  todayTasks: number | null;
  lead: { slaBreaches: number; actionlessLeads: number; unassignedLeads: number } | null;
  overdueReceivables: number | null;
  openServices: number | null;
  delayedCards: number | null;
};

const RANK: Record<WorkSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function buildWorkSignals(input: WorkSignalInput): WorkSignal[] {
  const out: WorkSignal[] = [];
  const push = (count: number | null | undefined, signal: Omit<WorkSignal, 'count'>) => {
    if (count && count > 0) out.push({ ...signal, count });
  };
  push(input.overdueTasks, {
    id: 'tasks-overdue',
    severity: 'critical',
    title: 'Geciken görev',
    detail: `${input.overdueTasks} görevin son tarihi geçti`,
    target: { kind: 'tasks' },
  });
  push(input.lead?.slaBreaches, {
    id: 'lead-sla',
    severity: 'critical',
    title: 'SLA riski',
    detail: `${input.lead?.slaBreaches} lead ilk temas süresini aştı`,
    target: { kind: 'opportunities', focus: 'sla_risk' },
  });
  push(input.overdueReceivables, {
    id: 'receivables-overdue',
    severity: 'critical',
    title: 'Geciken alacak',
    detail: `${input.overdueReceivables} vadesi geçmiş tahsilat`,
    target: { kind: 'receivables' },
  });
  push(input.todayTasks, {
    id: 'tasks-today',
    severity: 'warning',
    title: 'Bugün biten görev',
    detail: `${input.todayTasks} görevin son günü bugün`,
    target: { kind: 'tasks' },
  });
  push(input.delayedCards, {
    id: 'cards-delayed',
    severity: 'warning',
    title: 'Geciken satış kartı',
    detail: `${input.delayedCards} kartta aşama süresi veya takip tarihi geçti`,
    target: { kind: 'opportunities', focus: 'open' },
  });
  push(input.lead?.unassignedLeads, {
    id: 'lead-unassigned',
    severity: 'warning',
    title: 'Sahipsiz lead',
    detail: `${input.lead?.unassignedLeads} lead için sorumlu atanmadı`,
    target: { kind: 'opportunities', focus: 'unassigned' },
  });
  push(input.lead?.actionlessLeads, {
    id: 'lead-actionless',
    severity: 'warning',
    title: 'Aksiyonsuz lead',
    detail: `${input.lead?.actionlessLeads} lead için sonraki aksiyon planlanmadı`,
    target: { kind: 'opportunities', focus: 'no_action' },
  });
  push(input.openServices, {
    id: 'service-open',
    severity: 'info',
    title: 'Açık servis',
    detail: `${input.openServices} servis talebi çözüm bekliyor`,
    target: { kind: 'service' },
  });
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.count - a.count);
}

/** Brifing satırı: "Bugün N takip işi var; X kritik, Y yakın takip." */
export function briefingCounts(signals: WorkSignal[]): { total: number; critical: number; warning: number } {
  const sum = (severity?: WorkSeverity) =>
    signals.filter((signal) => !severity || signal.severity === severity).reduce((acc, signal) => acc + signal.count, 0);
  return { total: sum(), critical: sum('critical'), warning: sum('warning') };
}

export type ChartRange = '1A' | '3A' | '6A' | '1Y';
export const CHART_RANGE_MONTHS: Record<ChartRange, number> = { '1A': 1, '3A': 3, '6A': 6, '1Y': 12 };

/** Ekip aktivitesi kovası (ISO) → okunur etiket; saat dilimi İstanbul. */
export function activityBucketLabel(bucket: string, kind: 'hour' | 'day' | 'month'): string {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return bucket;
  const tz = { timeZone: 'Europe/Istanbul' } as const;
  if (kind === 'hour') return `${date.toLocaleTimeString('tr-TR', { ...tz, hour: '2-digit', hour12: false }).slice(0, 2)}:00`;
  if (kind === 'month') return date.toLocaleDateString('tr-TR', { ...tz, month: 'short' });
  return date.toLocaleDateString('tr-TR', { ...tz, day: '2-digit', month: '2-digit' });
}
