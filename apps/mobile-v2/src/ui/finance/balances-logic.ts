/**
 * Cari Rapor ve Cari Ekstre hesapları — web `CustomerBalancesPage` ile aynı kurallar.
 * Çalışma zamanı importu yok.
 */

export type AgingKey = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';
export type AgingTone = 'success' | 'warning' | 'danger';

export const AGING_BUCKETS: { key: AgingKey; short: string; label: string; tone: AgingTone }[] = [
  { key: 'current', short: 'Güncel', label: 'Vadesi gelmemiş', tone: 'success' },
  { key: 'd1_30', short: '1–30', label: '1–30 gün gecikmiş', tone: 'warning' },
  { key: 'd31_60', short: '31–60', label: '31–60 gün gecikmiş', tone: 'danger' },
  { key: 'd61_90', short: '61–90', label: '61–90 gün gecikmiş', tone: 'danger' },
  { key: 'd90_plus', short: '90+', label: '90+ gün gecikmiş', tone: 'danger' },
];

type CurrencyAging = Record<AgingKey, number> & { currencyCode: string; openTotal: number };

type BalanceRowLike = {
  companyName: string;
  borc: number;
  nearestDueDate: string | null;
  currencies: { currencyCode: string; borc: number; net: number }[];
  aging: {
    byCurrency: CurrencyAging[];
    worstBucket: AgingKey;
    maxOverdueDays: number;
    overdueTotal: { currencyCode: string; amount: number }[];
  } | null;
};

export const openDebtForRow = (row: Pick<BalanceRowLike, 'currencies' | 'borc'>) =>
  row.currencies.reduce((sum, item) => sum + Math.max(0, Number(item.borc ?? 0)), 0) || Number(row.borc ?? 0);

export function bucketTotal(aging: BalanceRowLike['aging'], key: AgingKey): number {
  return (aging?.byCurrency ?? []).reduce((sum, item) => sum + Number(item[key] ?? 0), 0);
}

/** Yaşlandırma ısı haritası etiketi: en kötü dolu kova + en uzun gecikme. */
export function agingState(row: Pick<BalanceRowLike, 'aging'>): { index: number; label: string; tone: AgingTone } {
  const aging = row.aging;
  const openTotal = (aging?.byCurrency ?? []).reduce((sum, item) => sum + Number(item.openTotal ?? 0), 0);
  if (!aging || openTotal <= 0) return { index: 0, label: 'Açık alacak yok', tone: 'success' };
  const index = Math.max(0, AGING_BUCKETS.findIndex((bucket) => bucket.key === aging.worstBucket));
  const bucket = AGING_BUCKETS[index];
  if (!bucket || bucket.key === 'current') return { index, label: 'Güncel', tone: 'success' };
  return { index, label: `${aging.maxOverdueDays} gün gecikmiş`, tone: bucket.tone };
}

const sumBy = (entries: Iterable<[string, number]>) => {
  const totals = new Map<string, number>();
  for (const [code, amount] of entries) totals.set(code, (totals.get(code) ?? 0) + amount);
  return totals;
};

/** KPI: Kayıtlı Firma, Açık Borç (PB bazında), Gecikmiş (adet + PB tutarı), 7 Gün İçinde. */
export function balanceKpis(rows: readonly BalanceRowLike[], now: Date = new Date()) {
  const debt = sumBy(rows.flatMap((row) => row.currencies.map((item): [string, number] => [item.currencyCode, Number(item.borc ?? 0)])));
  const net = sumBy(rows.flatMap((row) => row.currencies.map((item): [string, number] => [item.currencyCode, Number(item.net ?? 0)])));
  const overdue = sumBy(
    rows.flatMap((row) => (row.aging?.overdueTotal ?? []).map((item): [string, number] => [item.currencyCode, Number(item.amount ?? 0)])),
  );
  const byAbs = (map: Map<string, number>) =>
    [...map].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([currencyCode, amount]) => ({ currencyCode, amount }));
  return {
    companies: rows.length,
    openDebt: byAbs(debt),
    netByCurrency: byAbs(net),
    overdueCount: rows.filter((row) => (row.aging?.maxOverdueDays ?? 0) > 0).length,
    overdueTotals: [...overdue].sort((a, b) => b[1] - a[1]).map(([currencyCode, amount]) => ({ currencyCode, amount })),
    dueSoonCount: rows.filter((row) => {
      if (!row.nearestDueDate) return false;
      const days = Math.ceil((new Date(row.nearestDueDate).getTime() - now.getTime()) / 86_400_000);
      return days >= 0 && days <= 7;
    }).length,
  };
}

export type StatementLineLike = {
  id: string;
  date: string;
  debit: number;
  credit: number;
  balance: number;
  currencyCode: string | null;
};

export type StatementBalance = { currencyCode: string; debit: number; credit: number; balance: number };

/** Ekstre üst kartları: para birimi bazında borç/alacak toplamı ve son bakiye. */
export function statementBalances(
  lines: readonly StatementLineLike[],
  fallback: { currencyCode: string; borc: number; alacak: number; net: number }[],
  primaryCurrency: string | null,
): StatementBalance[] {
  if (lines.length > 0) {
    const map = new Map<string, StatementBalance>();
    for (const line of lines) {
      const currencyCode = String(line.currencyCode ?? primaryCurrency ?? 'USD');
      const current = map.get(currencyCode) ?? { currencyCode, debit: 0, credit: 0, balance: 0 };
      current.debit += Number(line.debit ?? 0);
      current.credit += Number(line.credit ?? 0);
      current.balance = Number(line.balance ?? current.balance);
      map.set(currencyCode, current);
    }
    return [...map.values()];
  }
  return fallback.map((item) => ({ currencyCode: item.currencyCode, debit: item.borc, credit: item.alacak, balance: item.net }));
}

/** Dosya adında kullanılamayan karakterler "-" olur. */
export const safeFileName = (value: string) => value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'cari';
