/**
 * Ödemeler & Kasa hesapları — web `PaymentsPage` + store eşlemesiyle aynı kurallar.
 * Web tutarları USD'ye çevirir; mobilde kur ucu olmadığından her hesap para birimi
 * bazında tutulur ve farklı para birimleri asla toplanmaz.
 */

export type CashStatus = 'Paid' | 'Pending' | 'Overdue' | 'Cancelled';
export type CashSource = 'receivable' | 'payment';

type CompanyRef = { legalTitle: string; shortName: string | null } | null;
type CodeRef = { code: string } | null;

export type ReceivableLike = {
  id: string;
  companyId: string;
  invoiceNo: string | null;
  amount: string;
  dueDate: string;
  notes: string | null;
  paymentMethod: string | null;
  company: CompanyRef;
  status: CodeRef;
  currency: CodeRef;
};

export type PaymentLike = {
  id: string;
  companyId: string;
  invoiceNo: string | null;
  direction: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string | null;
  notes: string | null;
  company: CompanyRef;
  status: CodeRef;
  currency: CodeRef;
};

export type CashMovement = {
  id: string;
  source: CashSource;
  direction: 'in' | 'out';
  companyId: string;
  companyName: string;
  amount: number;
  currencyCode: string;
  dueDate: string;
  paidDate: string | null;
  status: CashStatus;
  invoiceNo: string | null;
  notes: string | null;
  paymentMethod: string | null;
};

const DAY_MS = 86_400_000;

export function cashStatus(code: string | null | undefined): CashStatus {
  if (code === 'paid') return 'Paid';
  if (code === 'overdue') return 'Overdue';
  if (code === 'cancelled') return 'Cancelled';
  return 'Pending';
}

const companyName = (company: CompanyRef) => company?.shortName ?? company?.legalTitle ?? 'Firma';
const amountOf = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Web store: alacaklar "giren" + vade; ödemeler kendi yönü + ödeme tarihi. */
export function mergeCashMovements(receivables: readonly ReceivableLike[], payments: readonly PaymentLike[]): CashMovement[] {
  const rows: CashMovement[] = [
    ...receivables.map((row): CashMovement => {
      const status = cashStatus(row.status?.code);
      return {
        id: row.id,
        source: 'receivable',
        direction: 'in',
        companyId: row.companyId,
        companyName: companyName(row.company),
        amount: amountOf(row.amount),
        currencyCode: row.currency?.code ?? 'USD',
        dueDate: row.dueDate,
        paidDate: null,
        status,
        invoiceNo: row.invoiceNo,
        notes: row.notes,
        paymentMethod: row.paymentMethod,
      };
    }),
    ...payments.map((row): CashMovement => {
      const status = cashStatus(row.status?.code);
      return {
        id: row.id,
        source: 'payment',
        direction: row.direction === 'out' ? 'out' : 'in',
        companyId: row.companyId,
        companyName: companyName(row.company),
        amount: amountOf(row.amount),
        currencyCode: row.currency?.code ?? 'USD',
        dueDate: row.paymentDate,
        paidDate: status === 'Paid' ? row.paymentDate : null,
        status,
        invoiceNo: row.invoiceNo,
        notes: row.notes,
        paymentMethod: row.paymentMethod,
      };
    }),
  ];
  return rows.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
}

export type DirectionFilter = 'all' | 'in' | 'out';
export type StatusFilter = 'all' | 'Paid' | 'Pending' | 'Overdue';

const fold = (value: string) =>
  value.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');

export function filterCashMovements(
  rows: readonly CashMovement[],
  filter: { direction: DirectionFilter; status: StatusFilter; search: string },
): CashMovement[] {
  const term = fold(filter.search.trim());
  return rows.filter((row) => {
    if (filter.direction !== 'all' && row.direction !== filter.direction) return false;
    if (filter.status !== 'all' && row.status !== filter.status) return false;
    if (!term) return true;
    return fold([row.companyName, row.id, row.invoiceNo ?? '', row.notes ?? ''].join(' ')).includes(term);
  });
}

export function cashCounts(rows: readonly CashMovement[], direction: DirectionFilter) {
  const scoped = rows.filter((row) => direction === 'all' || row.direction === direction);
  return {
    direction: {
      all: rows.length,
      in: rows.filter((row) => row.direction === 'in').length,
      out: rows.filter((row) => row.direction === 'out').length,
    },
    status: {
      all: scoped.length,
      Paid: scoped.filter((row) => row.status === 'Paid').length,
      Pending: scoped.filter((row) => row.status === 'Pending').length,
      Overdue: scoped.filter((row) => row.status === 'Overdue').length,
    },
  };
}

export type CurrencyCash = {
  currencyCode: string;
  incoming: number;
  outgoing: number;
  net: number;
  pendingIn: number;
  pendingOut: number;
};

const isOpen = (row: CashMovement) => row.status === 'Pending' || row.status === 'Overdue';

/** "Kasa Bakiyesi": gerçekleşen giren/çıkan + bekleyenler, para birimi bazında. */
export function cashByCurrency(rows: readonly CashMovement[]): CurrencyCash[] {
  const map = new Map<string, CurrencyCash>();
  for (const row of rows) {
    if (row.status === 'Cancelled') continue;
    const entry = map.get(row.currencyCode) ?? {
      currencyCode: row.currencyCode,
      incoming: 0,
      outgoing: 0,
      net: 0,
      pendingIn: 0,
      pendingOut: 0,
    };
    if (row.status === 'Paid') {
      if (row.direction === 'in') entry.incoming += row.amount;
      else entry.outgoing += row.amount;
    } else if (row.direction === 'in') entry.pendingIn += row.amount;
    else entry.pendingOut += row.amount;
    entry.net = entry.incoming - entry.outgoing;
    map.set(row.currencyCode, entry);
  }
  return [...map.values()].sort((a, b) => b.incoming + b.pendingIn - (a.incoming + a.pendingIn));
}

const startOfDay = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

export function overdueDays(row: Pick<CashMovement, 'dueDate' | 'status'>, now: Date = new Date()): number {
  if (row.status === 'Paid' || row.status === 'Cancelled') return 0;
  const days = Math.floor((startOfDay(now) - startOfDay(new Date(row.dueDate))) / DAY_MS);
  return days > 0 ? days : 0;
}

/** "Yaklaşan Vadeler": açık hareketler, bugünden itibaren 60 gün, ilk 5. */
export function upcomingDues(rows: readonly CashMovement[], now: Date = new Date(), days = 60, limit = 5): CashMovement[] {
  const start = startOfDay(now);
  const end = start + days * DAY_MS;
  return rows
    .filter((row) => {
      const time = new Date(row.dueDate).getTime();
      return isOpen(row) && time >= start && time <= end;
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, limit);
}

export const AGING_LABELS = ['0–30', '31–60', '61–90', '90+'] as const;

export type CurrencyAging = { currencyCode: string; buckets: [number, number, number, number]; total: number };

/** "Yaşlandırma": vadesi geçmiş açık tahsilatlar, gecikme gününe göre. */
export function agingByCurrency(rows: readonly CashMovement[], now: Date = new Date()): CurrencyAging[] {
  const map = new Map<string, CurrencyAging>();
  for (const row of rows) {
    if (row.direction !== 'in' || !isOpen(row)) continue;
    const days = overdueDays(row, now);
    if (days <= 0) continue;
    const entry = map.get(row.currencyCode) ?? { currencyCode: row.currencyCode, buckets: [0, 0, 0, 0], total: 0 };
    const index = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
    entry.buckets[index] += row.amount;
    entry.total += row.amount;
    map.set(row.currencyCode, entry);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export type Debtor = { companyId: string; companyName: string; currencyCode: string; amount: number; count: number };

/** "En Yüksek Borçlular": açık tahsilatlar firma + para birimi bazında. */
export function topDebtors(rows: readonly CashMovement[], limit = 5): Debtor[] {
  const map = new Map<string, Debtor>();
  for (const row of rows) {
    if (row.direction !== 'in' || !isOpen(row)) continue;
    const key = `${row.companyId}|${row.currencyCode}`;
    const entry = map.get(key) ?? {
      companyId: row.companyId,
      companyName: row.companyName,
      currencyCode: row.currencyCode,
      amount: 0,
      count: 0,
    };
    entry.amount += row.amount;
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export type TrendMonth = { key: string; label: string; collected: number; pending: number };

/** "Tahsilat & Bekleyen Trendi": son 6 ay, tek para birimi. */
export function collectionTrend(
  rows: readonly CashMovement[],
  currencyCode: string,
  now: Date = new Date(),
  months = 6,
): TrendMonth[] {
  const buckets: TrendMonth[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({ key: monthKey(date), label: TR_MONTHS[date.getMonth()] ?? '', collected: 0, pending: 0 });
  }
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const row of rows) {
    if (row.direction !== 'in' || row.currencyCode !== currencyCode) continue;
    if (row.status === 'Paid' && row.paidDate) {
      const bucket = byKey.get(monthKey(new Date(row.paidDate)));
      if (bucket) bucket.collected += row.amount;
    } else if (isOpen(row)) {
      const bucket = byKey.get(monthKey(new Date(row.dueDate)));
      if (bucket) bucket.pending += row.amount;
    }
  }
  return buckets;
}

export type DailyFlow = { key: string; label: string; incoming: number; outgoing: number };

/** "Günlük Nakit Akışı": gerçekleşen giren/çıkan, son N gün, tek para birimi. */
export function dailyCashFlow(
  rows: readonly CashMovement[],
  currencyCode: string,
  now: Date = new Date(),
  days = 14,
): DailyFlow[] {
  const result: DailyFlow[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
    result.push({ key, label: String(date.getDate()), incoming: 0, outgoing: 0 });
  }
  const byKey = new Map(result.map((day) => [day.key, day]));
  for (const row of rows) {
    if (row.status !== 'Paid' || !row.paidDate || row.currencyCode !== currencyCode) continue;
    const date = new Date(row.paidDate);
    const day = byKey.get(`${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`);
    if (!day) continue;
    if (row.direction === 'in') day.incoming += row.amount;
    else day.outgoing += row.amount;
  }
  return result;
}

/** "Para Birimi Dağılımı": hareket adedi payı (kur olmadan tutarlar karşılaştırılamaz). */
export function currencyDistribution(rows: readonly CashMovement[]): { currencyCode: string; count: number; share: number }[] {
  const active = rows.filter((row) => row.status !== 'Cancelled');
  const counts = new Map<string, number>();
  for (const row of active) counts.set(row.currencyCode, (counts.get(row.currencyCode) ?? 0) + 1);
  return [...counts]
    .map(([currencyCode, count]) => ({ currencyCode, count, share: active.length ? count / active.length : 0 }))
    .sort((a, b) => b.count - a.count);
}
