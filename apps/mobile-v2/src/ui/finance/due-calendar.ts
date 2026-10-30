/**
 * Vade takvimi hesapları — web `DueDatesCalendarPage` ile aynı kurallar.
 * node:test doğrudan içe aktarır; çalışma zamanı importu yok.
 */

export type DueItemLike = {
  id: string;
  dueDate: string;
  amount: number;
  currencyCode: string;
  type: 'borc' | 'alacak';
};

export type MonthCursor = { year: number; month: number };

export type CalendarCell = { day: number; key: string } | null;

const DAY_MS = 86_400_000;

/** Web `hasRole("admin") || hasRole("super_admin")`. */
export function isFinanceAdmin(roles: readonly string[] | null | undefined): boolean {
  return Boolean(roles?.includes('admin') || roles?.includes('super_admin'));
}

/** Admin olmayanlara tedarikçi ödemeleri ("alacak") gösterilmez. */
export function visibleDueItems<T extends DueItemLike>(items: readonly T[], isAdmin: boolean): T[] {
  return items.filter((item) => item.type !== 'alacak' || isAdmin);
}

const pad = (value: number) => String(value).padStart(2, '0');

export function dayKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthRange(cursor: MonthCursor): { from: string; to: string } {
  const from = new Date(cursor.year, cursor.month, 1);
  const to = new Date(cursor.year, cursor.month + 1, 0, 23, 59, 59);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function shiftMonth(cursor: MonthCursor, step: number): MonthCursor {
  const date = new Date(cursor.year, cursor.month + step, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function monthTitle(cursor: MonthCursor): string {
  return new Date(cursor.year, cursor.month, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

/** Pazartesi ile başlayan haftalara bölünmüş ay ızgarası; boş hücreler `null`. */
export function monthGrid(cursor: MonthCursor): CalendarCell[][] {
  const first = new Date(cursor.year, cursor.month, 1).getDay();
  const leading = first === 0 ? 6 : first - 1;
  const total = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: CalendarCell[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: total }, (_, index) => ({
      day: index + 1,
      key: `${cursor.year}-${pad(cursor.month + 1)}-${pad(index + 1)}`,
    })),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: CalendarCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

export function groupByDay<T extends DueItemLike>(items: readonly T[], cursor: MonthCursor): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const date = new Date(item.dueDate);
    if (date.getFullYear() !== cursor.year || date.getMonth() !== cursor.month) continue;
    const key = dayKey(date);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function nextSevenDays<T extends DueItemLike>(items: readonly T[], now: Date = new Date()): T[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 7 * DAY_MS;
  return items.filter((item) => {
    const time = new Date(item.dueDate).getTime();
    return time >= start && time < end;
  });
}

const byDueThenAmount = (a: DueItemLike, b: DueItemLike) =>
  new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime() || b.amount - a.amount;

/** Seçili gün varsa o günün, yoksa önümüzdeki 7 günün vadeleri. */
export function agendaItems<T extends DueItemLike>(
  byDay: Map<string, T[]>,
  selectedKey: string | null,
  next7: readonly T[],
): T[] {
  const source = selectedKey ? byDay.get(selectedKey) ?? [] : next7;
  return [...source].sort(byDueThenAmount);
}

export function isOverdue(item: Pick<DueItemLike, 'dueDate'>, now: Date = new Date()): boolean {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return new Date(item.dueDate).getTime() < start;
}

/** "1.250 USD · 300 EUR" — para birimleri asla toplanmaz. */
export function sumByCurrency(items: readonly DueItemLike[]): string {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.currencyCode, (totals.get(item.currencyCode) ?? 0) + item.amount);
  return [...totals].map(([code, amount]) => `${amount.toLocaleString('tr-TR')} ${code}`).join(' · ');
}
