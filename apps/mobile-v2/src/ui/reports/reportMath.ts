/**
 * Raporlar ekranının saf hesapları. Web `pages/reports/*` ile aynı kurallar;
 * node:test doğrudan bu dosyayı içe aktarır, bu yüzden çalışma zamanı importu yok.
 */

export const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export const usd = (n: number): string => `$ ${Math.round(n).toLocaleString('tr-TR')}`;
export const pct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 100) : 0);

/** `2026-03` → "Mar"; yıllık kova olduğu gibi kalır. */
export const bucketLabel = (bucket: string): string =>
  bucket.length === 7 ? TR_MONTHS[Number(bucket.slice(5)) - 1] ?? bucket : bucket;

export type OperationalTotals = {
  quotes: number;
  approved: number;
  rejected: number;
  won: number;
  lost: number;
  service: number;
  revenueUsd: number;
};

export type OperationalRowLike = OperationalTotals & { bucket: string };

export function sumOperational(rows: OperationalRowLike[]): OperationalTotals {
  return rows.reduce<OperationalTotals>(
    (acc, row) => ({
      quotes: acc.quotes + row.quotes,
      approved: acc.approved + row.approved,
      rejected: acc.rejected + row.rejected,
      won: acc.won + row.won,
      lost: acc.lost + row.lost,
      service: acc.service + row.service,
      revenueUsd: acc.revenueUsd + row.revenueUsd,
    }),
    { quotes: 0, approved: 0, rejected: 0, won: 0, lost: 0, service: 0, revenueUsd: 0 },
  );
}

/**
 * Kıyas penceresi: içinde bulunulan yılda yalnız geçen aylar, geçmiş yılda tüm yıl;
 * aksi hâlde henüz gelmemiş aylar geçen yılı şişirir.
 */
export function comparedMonths(year: number, now = new Date()): number {
  return year === now.getFullYear() ? now.getMonth() + 1 : 12;
}

export function rowsUpToMonth<T extends { bucket: string }>(rows: T[], month: number): T[] {
  return rows.filter((row) => Number(row.bucket.slice(5)) <= month);
}

export type Delta = { diff: number; label: string } | null;

/** Önceki dönemle fark; kıyas yoksa boş. `puan` yüzde farkı, `usd` para. */
export function delta(current: number, previous: number | null | undefined, unit: 'adet' | 'puan' | 'usd' = 'adet'): Delta {
  if (previous == null) return null;
  const diff = current - previous;
  const text = unit === 'usd' ? usd(Math.abs(diff)).replace('$ ', '') : String(Math.abs(diff));
  return {
    diff,
    label: diff === 0 ? 'geçen yılla aynı' : `${diff > 0 ? '▲' : '▼'} ${text}${unit === 'puan' ? ' puan' : unit === 'usd' ? ' USD' : ''}`,
  };
}

/* ------------------------------------------------------------ yıl sonu ---- */

export const money = (value: string | number | null | undefined): string => {
  const n = Number(value ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
};

/** Son üç yıl (web YearEndReportView çipleri). */
export const recentYears = (now = new Date()): number[] => {
  const y = now.getFullYear();
  return [y - 2, y - 1, y];
};

/* ----------------------------------------------------------- analitik ---- */

/** Yerel takvim ayı (`YYYY-MM`); `toISOString` UTC verir, ay başında kayar. */
export const currentMonth = (now = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

/** `YYYY-MM` → [yıl, ay]; eksik parça NaN olur. */
function ym(period: string): [number, number] {
  const [year, month] = period.split('-');
  return [Number(year), Number(month)];
}

/** Bir önceki/sonraki ay: 2026-01 ↔ 2025-12. */
export function shiftMonth(period: string, step: number): string {
  const [year, month] = ym(period);
  const date = new Date(Date.UTC(year, month - 1 + step, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const previousPeriod = (period: string): string => shiftMonth(period, -1);

/** "2026-03" → "Mart 2026". */
export function monthTitle(period: string): string {
  const [year, month] = ym(period);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return period;
  return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

/** Web ReportAnalyticsHub `monthRange`: ayın ilk günü → son günün sonu. */
export function monthRange(period: string): { from: string; to: string } {
  const [year, month] = ym(period);
  const last = new Date(Date.UTC(year, month, 0));
  return {
    from: `${period}-01`,
    to: new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate(), 23, 59, 59, 999)).toISOString(),
  };
}

export type Granularity = 'weekly' | 'monthly' | 'yearly';

/**
 * Haftalık/aylık/yıllık aktivite uçlarına gönderilecek aralık. Haftalıkta seçili
 * ayın son 12 haftası, aylıkta seçili yılın tamamı, yıllıkta son beş yıl.
 */
export function granularityRange(granularity: Granularity, period: string): { from: string; to: string } {
  const [year, month] = ym(period);
  if (granularity === 'yearly') return { from: `${year - 4}-01-01`, to: `${year}-12-31T23:59:59.999Z` };
  if (granularity === 'monthly') return { from: `${year}-01-01`, to: `${year}-12-31T23:59:59.999Z` };
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const start = new Date(end.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString() };
}

/** Aktivite kovası etiketi: `2026-14` (ISO hafta) → "H14", `2026-03` → "Mar", `2026` → "2026". */
export function activityBucketLabel(bucket: string, granularity: Granularity): string {
  if (granularity === 'weekly') return `H${Number(bucket.slice(-2))}`;
  if (granularity === 'monthly') return bucketLabel(bucket);
  return bucket;
}

export type QuoteProductRow = {
  productId: string | null;
  productName: string | null;
  brand: string | null;
  currency: string | null;
  count: number;
  totalValue: string | number | null;
};

export type QuoteProductAggregate = {
  key: string;
  productName: string;
  brand: string | null;
  count: number;
  totals: { currency: string; amount: number }[];
};

/**
 * Web "Ürün Bazlı Teklif": aynı ürünün farklı para birimli kalemleri tek satırda,
 * tutarlar para birimine göre ayrı toplanır; en çok teklif edilen 12 ürün.
 */
export function aggregateQuoteProducts(rows: QuoteProductRow[], limit = 12): QuoteProductAggregate[] {
  const map = new Map<string, QuoteProductAggregate>();
  for (const row of rows) {
    const key = row.productId ?? row.productName ?? 'unknown';
    const entry = map.get(key) ?? { key, productName: row.productName ?? 'Tanımsız ürün', brand: row.brand, count: 0, totals: [] };
    entry.count += Number(row.count) || 0;
    const currency = row.currency ?? '—';
    const amount = Number(row.totalValue ?? 0) || 0;
    const existing = entry.totals.find((t) => t.currency === currency);
    if (existing) existing.amount += amount;
    else entry.totals.push({ currency, amount });
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export const totalsLabel = (totals: { currency: string; amount: number }[]): string =>
  totals.length
    ? totals.map((t) => `${t.amount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${t.currency}`).join(' + ')
    : '—';

/* -------------------------------------------------------- hedef takibi ---- */

export type TargetStatus = 'completed' | 'on_track' | 'at_risk' | 'missed' | 'scheduled' | 'manual' | 'no_target';

export type TargetSubjectRow = {
  subject: {
    kind: 'user' | 'department' | 'role';
    id: string;
    name: string;
    departmentId?: string | null;
    departmentName?: string | null;
    departmentIds?: string[];
    departmentNames?: string[];
    memberCount?: number;
  };
  hasTarget: boolean;
  note?: string | null;
  metrics?: Record<string, { target: number | null; actual: number | null; pct: number | null }>;
  targetItems?: Array<{
    activity?: string;
    description?: string;
    unit?: string;
    target?: string | number | null;
    actual?: number | null;
    pct?: number | null;
    metricKey?: string | null;
    trackingMode?: 'automatic' | 'manual';
  }>;
};

export type MetricLine = { label: string; target: number; actual: number; pct: number; unit: 'USD' | 'adet' };
export type ManualLine = { label: string; target: string };
export type SubjectAnalysis = { status: TargetStatus; completionPct: number | null; metrics: MetricLine[]; manual: ManualLine[] };

export const TARGET_METRIC_LABELS: Record<string, string> = {
  salesAmount: 'Satış cirosu',
  salesNewCustomers: 'Yeni müşteri',
  quoteTarget: 'Teklif',
  visitTarget: 'Ziyaret',
  callTarget: 'Arama',
  serviceCompleted: 'Tamamlanan servis',
  serviceAmount: 'Servis cirosu',
  digitalLeadTarget: 'Dijital lead',
  paymentsInAmount: 'Tahsilat',
  purchaseInvoiceAmount: 'Alış faturası',
  purchaseOrderAmount: 'Satınalma tutarı',
  purchaseOrderCount: 'Satınalma siparişi',
  salesOrderAmount: 'Satış siparişi tutarı',
  salesOrderCount: 'Satış siparişi',
  installationCompleted: 'Kurulum',
  machineDeliveredCount: 'Teslim edilen tezgah',
  digitalConversionTarget: 'Dijital dönüşüm',
  digitalBudget: 'Dijital bütçe',
};

export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  completed: 'Tamamlandı',
  on_track: 'Yolunda',
  at_risk: 'Riskte',
  missed: 'Tamamlanmadı',
  scheduled: 'Planlandı',
  manual: 'Manuel takip',
  no_target: 'Hedef yok',
};

const isMoneyMetric = (key: string) => /amount|budget/i.test(key);

/** API `parseTargetItemNumber` ile birebir: ayrışırsa ekrandaki yüzde ile Excel'deki tutmaz. */
export function parseGoalNumber(value: unknown): number | null {
  const compact = String(value ?? '').trim().replace(/\s/g, '');
  if (!compact) return null;
  const turkishThousands = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
  const plainNumber = /^\d+([.,]\d+)?$/;
  if (!turkishThousands.test(compact) && !plainNumber.test(compact)) return null;
  const numeric = Number(turkishThousands.test(compact) ? compact.replace(/\./g, '').replace(',', '.') : compact.replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

const formatNumber = (value: number) => value.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const formatGoal = (value: number | string | null, unit: 'USD' | 'adet') =>
  typeof value === 'number' ? `${formatNumber(value)}${unit === 'USD' ? ' USD' : ''}` : String(value ?? '');

export function statusForProgress(completionPct: number, expectedPct: number, period: string, now = new Date()): TargetStatus {
  const current = currentMonth(now);
  if (completionPct >= 100) return 'completed';
  if (period < current) return 'missed';
  if (period > current) return 'scheduled';
  return completionPct + 10 < expectedPct ? 'at_risk' : 'on_track';
}

export function analyzeTargetSubject(row: TargetSubjectRow, expectedPct: number, period: string, now = new Date()): SubjectAnalysis {
  const metrics: MetricLine[] = [];
  const manual: ManualLine[] = [];
  const seenMetricKeys = new Set<string>();
  for (const [key, metric] of Object.entries(row.metrics ?? {})) {
    if (metric.target == null || metric.target <= 0) continue;
    seenMetricKeys.add(key);
    const unit = isMoneyMetric(key) ? 'USD' : 'adet';
    if (metric.actual != null && metric.pct != null) {
      metrics.push({ label: TARGET_METRIC_LABELS[key] ?? key, target: metric.target, actual: metric.actual, pct: metric.pct, unit });
    } else {
      manual.push({ label: TARGET_METRIC_LABELS[key] ?? key, target: formatGoal(metric.target, unit) });
    }
  }
  const itemGroups = new Map<string, MetricLine>();
  for (const item of row.targetItems ?? []) {
    if (item.metricKey && seenMetricKeys.has(item.metricKey)) continue;
    const target = parseGoalNumber(item.target);
    const label = item.activity || item.description || TARGET_METRIC_LABELS[item.metricKey ?? ''] || 'Hedef';
    if (target == null || target <= 0 || item.actual == null) {
      const text = String(item.target ?? '').trim();
      if (text) manual.push({ label, target: item.unit === 'amount' ? formatGoal(target ?? text, 'USD') : text });
      continue;
    }
    const key = item.metricKey || item.activity || `item-${itemGroups.size}`;
    const existing = itemGroups.get(key);
    itemGroups.set(key, {
      label,
      target: (existing?.target ?? 0) + target,
      actual: Math.max(existing?.actual ?? 0, item.actual),
      pct: 0,
      unit: item.unit === 'amount' || isMoneyMetric(item.metricKey ?? '') ? 'USD' : 'adet',
    });
  }
  for (const item of itemGroups.values()) metrics.push({ ...item, pct: Math.round((item.actual / item.target) * 100) });
  if (!row.hasTarget) return { status: 'no_target', completionPct: null, metrics, manual };
  if (metrics.length === 0) return { status: 'manual', completionPct: null, metrics, manual };
  const completionPct = Math.round(metrics.reduce((sum, item) => sum + Math.min(100, Math.max(0, item.pct)), 0) / metrics.length);
  return { status: statusForProgress(completionPct, expectedPct, period, now), completionPct, metrics, manual };
}

/** "6 / 10 (%60) · 4 eksik · 0,3/gün". */
export function metricLineText(line: MetricLine, daysLeft = 0): string {
  const base = `${formatNumber(line.actual)} / ${formatNumber(line.target)}${line.unit === 'USD' ? ' USD' : ''} (%${line.pct})`;
  const missing = line.target - line.actual;
  if (missing <= 0) return base;
  const pace = daysLeft > 0 ? ` · ${(missing / daysLeft).toLocaleString('tr-TR', { maximumFractionDigits: missing / daysLeft < 10 ? 1 : 0 })}/gün` : '';
  return `${base} · ${formatNumber(missing)} eksik${pace}`;
}

/** Ölçütleri etiketine göre toplar: ekip/departman geneli tek satırda okunur. */
export function sumMetrics(lists: MetricLine[][]): MetricLine[] {
  const totals = new Map<string, MetricLine>();
  for (const line of lists.flat()) {
    const existing = totals.get(line.label);
    if (existing) {
      existing.target += line.target;
      existing.actual += line.actual;
    } else {
      totals.set(line.label, { ...line });
    }
  }
  return [...totals.values()].map((line) => ({ ...line, pct: line.target > 0 ? Math.round((line.actual / line.target) * 100) : 0 }));
}

/** Dönemin bitmesine kalan gün: geçmiş dönemde 0, gelecekte ayın tamamı. */
export function daysLeftInPeriod(period: string, now = new Date()): number {
  const [year, month] = ym(period);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 0;
  const lastDay = new Date(year, month, 0).getDate();
  const current = currentMonth(now);
  if (period < current) return 0;
  if (period > current) return lastDay;
  return Math.max(0, lastDay - now.getDate() + 1);
}

const STATUS_PRIORITY: Record<TargetStatus, number> = { missed: 0, at_risk: 1, on_track: 2, completed: 3, manual: 4, no_target: 5, scheduled: 6 };

export type PersonTarget = { row: TargetSubjectRow; analysis: SubjectAnalysis; previousPct: number | null };

/** Sorunlu kişiler üstte; aynı durumdakiler ada göre. */
export function sortPeople(people: PersonTarget[]): PersonTarget[] {
  return [...people].sort(
    (a, b) => STATUS_PRIORITY[a.analysis.status] - STATUS_PRIORITY[b.analysis.status] || a.row.subject.name.localeCompare(b.row.subject.name, 'tr'),
  );
}

export const inDepartment = (person: PersonTarget, departmentId: string | null): boolean =>
  !departmentId || Boolean(person.row.subject.departmentIds?.includes(departmentId)) || person.row.subject.departmentId === departmentId;

export function averageCompletion(people: PersonTarget[]): number | null {
  const measurable = people.filter((p) => p.analysis.completionPct != null);
  return measurable.length ? Math.round(measurable.reduce((sum, p) => sum + (p.analysis.completionPct ?? 0), 0) / measurable.length) : null;
}

/* ------------------------------------------------------- aktivite raporu ---- */

/** İstanbul takvimindeki gün (`YYYY-MM-DD`). */
const isoDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

/** Varsayılan aralık: içinde bulunulan haftanın pazartesi → cumartesi (web ActivityLogReportCard). */
export function defaultActivityRange(now = new Date()): { from: string; to: string } {
  const today = new Date(`${isoDay(now)}T00:00:00Z`);
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return { from: day(monday), to: day(saturday) };
}

/** API kuralı: YYYY-MM-DD, bitiş başlangıçtan önce olamaz, en çok 366 gün. */
export function validateActivityRange(range: { from: string; to: string }): string | null {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(range.from) || !pattern.test(range.to)) return 'Tarihleri YYYY-AA-GG biçiminde girin.';
  const from = Date.parse(`${range.from}T00:00:00Z`);
  const to = Date.parse(`${range.to}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 'Geçerli bir tarih girin.';
  if (to < from) return 'Bitiş tarihi başlangıçtan önce olamaz';
  if ((to - from) / 86_400_000 > 366) return 'Aralık en fazla 366 gün olabilir.';
  return null;
}

/* ------------------------------------------------------- yönetici özeti ---- */

export type ExecutiveInput = {
  current?: OperationalTotals | null;
  previous?: OperationalTotals | null;
  openOpportunities?: number | null;
  warrantyExpiring?: number | null;
  newComplaints?: number | null;
  availableStock?: number | null;
};

export type ExecutiveItem = {
  key: string;
  kind: 'risk' | 'opportunity' | 'action';
  title: string;
  detail: string;
  target: 'quotes' | 'opportunities' | 'service-complaints' | 'customer-devices' | 'inventory';
};

/**
 * Yönetici özeti: web store'dan türetiyordu; mobilde aynı sinyaller rapor
 * uçlarının döndürdüğü gerçek sayılardan kurulur (sahte veri yok).
 */
export function buildExecutiveSummary(input: ExecutiveInput): ExecutiveItem[] {
  const items: ExecutiveItem[] = [];
  const cur = input.current;
  const prev = input.previous;
  if (cur && prev) {
    const conv = pct(cur.approved, cur.quotes);
    const prevConv = pct(prev.approved, prev.quotes);
    if (cur.quotes > 0 && conv + 5 < prevConv) {
      items.push({ key: 'conversion-drop', kind: 'risk', title: 'Teklif dönüşümü geriledi', detail: `%${conv} (geçen yıl aynı dönem %${prevConv})`, target: 'quotes' });
    }
    if (cur.revenueUsd < prev.revenueUsd) {
      items.push({ key: 'revenue-drop', kind: 'risk', title: 'Ciro geçen yılın gerisinde', detail: `${usd(cur.revenueUsd)} / ${usd(prev.revenueUsd)}`, target: 'opportunities' });
    } else if (cur.revenueUsd > prev.revenueUsd) {
      items.push({ key: 'revenue-up', kind: 'opportunity', title: 'Ciro geçen yılın önünde', detail: `${usd(cur.revenueUsd)} / ${usd(prev.revenueUsd)}`, target: 'opportunities' });
    }
  }
  if (cur && cur.lost > cur.won && cur.lost > 0) {
    items.push({ key: 'loss-ratio', kind: 'risk', title: 'Kaybedilen fırsat kazanılandan fazla', detail: `${cur.won} kazanılan / ${cur.lost} kaybedilen`, target: 'opportunities' });
  }
  if ((input.newComplaints ?? 0) > 0) {
    items.push({ key: 'complaints', kind: 'action', title: 'Yeni şikayetler yanıt bekliyor', detail: `${input.newComplaints} yeni şikayet`, target: 'service-complaints' });
  }
  if ((input.warrantyExpiring ?? 0) > 0) {
    items.push({ key: 'warranty', kind: 'opportunity', title: 'Garantisi biten makineler', detail: `${input.warrantyExpiring} makine · bakım/servis teklifi fırsatı`, target: 'customer-devices' });
  }
  if ((input.openOpportunities ?? 0) > 0) {
    items.push({ key: 'pipeline', kind: 'action', title: 'Açık fırsatları takip edin', detail: `${input.openOpportunities} açık fırsat`, target: 'opportunities' });
  }
  if ((input.availableStock ?? 0) > 0) {
    items.push({ key: 'stock', kind: 'opportunity', title: 'Satışa hazır stok', detail: `${input.availableStock} stok kalemi`, target: 'inventory' });
  }
  return items;
}
