/**
 * Hedef çalışma alanının saf mantığı. Web'deki
 * `pages/dashboard/TargetWorkspace.tsx` ve `admin/TargetDialog.tsx` ile aynı
 * kurallar; mobil ekranlar ve birim testleri buradan okur.
 */

export type ScopeKind = 'user' | 'department' | 'division';
export type TargetStatus = 'achieved' | 'on_track' | 'at_risk' | 'missed' | 'scheduled' | 'manual' | 'not_configured';
export type TargetTone = 'success' | 'info' | 'warning' | 'destructive' | 'neutral' | 'stage';

export type TargetMetric = { target: number | null; actual: number | null; pct: number | null; status?: TargetStatus };

export type TargetProgressItem = {
  targetType?: string;
  category?: string;
  activity?: string;
  description?: string;
  unit?: string;
  target?: string | number | null;
  actual?: number | null;
  pct?: number | null;
  metricKey?: string | null;
  trackingMode?: string;
};

export type TargetSubject = {
  subject: { kind: string; id: string; name: string; departmentName?: string | null; departmentNames?: string[] };
  hasTarget: boolean;
  note?: string | null;
  metrics?: Record<string, TargetMetric>;
  targetItems?: TargetProgressItem[];
};

export type TargetProgressResponse = {
  period?: string;
  expectedProgressPct?: number;
  subjects?: TargetSubject[];
};

export type ReportLine = {
  id: string;
  label: string;
  category: string;
  unit: string;
  target: number;
  actual: number | null;
  pct: number | null;
  status: TargetStatus;
  trackingMode: 'automatic' | 'manual';
  source?: string;
  detail?: string;
};

export type PeriodResult = {
  period: string;
  expectedPct: number;
  subject: TargetSubject | null;
  lines: ReportLine[];
  averagePct: number | null;
  achievedCount: number;
  riskCount: number;
  manualCount: number;
};

export type TeamRow = {
  id: string;
  name: string;
  department: string | null;
  averagePct: number | null;
  pace: number | null;
  achievedCount: number;
  riskCount: number;
  lineCount: number;
};
export type TeamSort = 'pace' | 'name' | 'progress';

export const SCOPE_META: Record<ScopeKind, { label: string; plural: string }> = {
  user: { label: 'Kişi', plural: 'Kullanıcılar' },
  department: { label: 'Departman', plural: 'Departmanlar' },
  division: { label: 'Bölüm', plural: 'Bölümler' },
};

export const METRIC_SOURCES: Record<string, string> = {
  salesAmount: 'satış faturası tutarından',
  salesNewCustomers: 'dönemde açılan yeni firma kaydından',
  quoteTarget: 'oluşturulan teklif sayısından',
  visitTarget: 'ziyaret formu + ziyaret aktivitelerinden',
  callTarget: 'arama formu + arama aktivitelerinden',
  serviceCompleted: 'kapatılan servis kaydından',
  serviceAmount: 'tamamlanan kurulum ücretlerinden',
  digitalLeadTarget: 'oluşturulan lead sayısından',
  paymentsInAmount: 'tahsil edilen ödemelerden',
  purchaseInvoiceAmount: 'alış faturası tutarından',
  purchaseOrderAmount: 'satınalma sipariş tutarından',
  purchaseOrderCount: 'satınalma siparişi sayısından',
  salesOrderAmount: 'satış sipariş tutarından',
  salesOrderCount: 'satış siparişi sayısından',
  installationCompleted: 'tamamlanan kurulum sayısından',
};

export const METRIC_LABELS: Record<string, string> = {
  salesAmount: 'Satış cirosu',
  salesNewCustomers: 'Yeni müşteri',
  quoteTarget: 'Teklif',
  visitTarget: 'Ziyaret',
  callTarget: 'Arama',
  serviceCompleted: 'Tamamlanan servis',
  serviceAmount: 'Servis cirosu',
  digitalLeadTarget: 'Dijital fırsat',
  digitalConversionTarget: 'Dijital dönüşüm',
  digitalBudget: 'Dijital bütçe',
  paymentsInAmount: 'Tahsilat',
  purchaseInvoiceAmount: 'Alış faturası',
  purchaseOrderAmount: 'Satınalma tutarı',
  purchaseOrderCount: 'Satınalma siparişi',
  salesOrderAmount: 'Satış siparişi tutarı',
  salesOrderCount: 'Satış siparişi',
  installationCompleted: 'Kurulum',
};

export const STATUS_META: Record<TargetStatus, { label: string; tone: TargetTone }> = {
  achieved: { label: 'Tamamlandı', tone: 'success' },
  on_track: { label: 'Yolunda', tone: 'info' },
  at_risk: { label: 'Riskte', tone: 'warning' },
  missed: { label: 'Tamamlanmadı', tone: 'destructive' },
  scheduled: { label: 'Planlandı', tone: 'neutral' },
  manual: { label: 'Manuel takip', tone: 'stage' },
  not_configured: { label: 'Hedef yok', tone: 'neutral' },
};

const amountMetricKeys = new Set([
  'salesAmount',
  'serviceAmount',
  'digitalBudget',
  'paymentsInAmount',
  'purchaseInvoiceAmount',
  'purchaseOrderAmount',
  'salesOrderAmount',
]);

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Dönem YEREL takvimden okunur; UTC ayın ilk saatlerinde önceki ayı seçiyordu. */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function isPeriod(value: string): boolean {
  return PERIOD_RE.test(value);
}

/** Rapor tarafındaki gevşek sayı okuma (TargetWorkspace `parseTargetNumber`). */
export function parseReportNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const compact = String(value).trim().replace(/\s/g, '');
  const normalized = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(compact)
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function shiftMonth(period: string, delta: number): string {
  const [year = 1970, month = 1] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(from: string, to: string): string[] {
  if (!PERIOD_RE.test(from) || !PERIOD_RE.test(to) || from > to) {
    throw new Error('Başlangıç dönemi bitiş döneminden sonra olamaz.');
  }
  const periods: string[] = [];
  let cursor = from;
  while (cursor <= to && periods.length < 18) {
    periods.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  if (cursor <= to) throw new Error('Tek raporda en fazla 18 aylık dönem seçilebilir.');
  return periods;
}

export function projectedPct(averagePct: number | null, elapsedPct: number): number | null {
  if (averagePct == null || elapsedPct < 5 || elapsedPct >= 100) return null;
  return Math.min(999, Math.round((averagePct / elapsedPct) * 100));
}

export function quarterRange(period: string): { from: string; to: string } {
  const [year = 1970, month = 1] = period.split('-').map(Number);
  const first = Math.floor((month - 1) / 3) * 3 + 1;
  return { from: `${year}-${String(first).padStart(2, '0')}`, to: `${year}-${String(first + 2).padStart(2, '0')}` };
}

export function yearRange(period: string): { from: string; to: string } {
  const [year = 1970] = period.split('-').map(Number);
  return { from: `${year}-01`, to: `${year}-12` };
}

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const TR_MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return `${TR_MONTHS[month - 1]} ${year}`;
}

export function periodLabelLong(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return `${TR_MONTHS_LONG[month - 1]} ${year}`;
}

export function targetStatus(
  period: string,
  pct: number | null,
  expectedPct: number,
  manual: boolean,
  now: Date = new Date()
): TargetStatus {
  if (manual || pct == null) return 'manual';
  if (pct >= 100) return 'achieved';
  const current = currentPeriod(now);
  if (period < current) return 'missed';
  if (period > current) return 'scheduled';
  return pct + 10 < expectedPct ? 'at_risk' : 'on_track';
}

/**
 * Aynı otomatik metriğe bağlı alt hedefleri tek sayaçta birleştirir; sunucu
 * bütün ziyaret satırlarına aynı toplamı verdiği için ayrı saymak ortalamayı şişirir.
 */
export function reportLines(
  subject: TargetSubject | null,
  period: string,
  expectedPct: number,
  now: Date = new Date()
): ReportLine[] {
  if (!subject) return [];
  const lines: ReportLine[] = [];
  const configuredMetricKeys = new Set<string>();

  for (const [metricKey, metric] of Object.entries(subject.metrics ?? {})) {
    if (metric.target == null || metric.target <= 0) continue;
    configuredMetricKeys.add(metricKey);
    const manual = metric.actual == null;
    lines.push({
      id: `metric:${metricKey}`,
      label: METRIC_LABELS[metricKey] ?? metricKey,
      category: 'Ana metrik',
      unit: amountMetricKeys.has(metricKey) ? 'amount' : 'count',
      target: metric.target,
      actual: metric.actual,
      pct: metric.pct,
      status: metric.status ?? targetStatus(period, metric.pct, expectedPct, manual, now),
      trackingMode: manual ? 'manual' : 'automatic',
      source: manual ? undefined : METRIC_SOURCES[metricKey],
    });
  }

  const automaticGroups = new Map<string, { rows: TargetProgressItem[]; target: number; actual: number | null }>();
  const manualRows: TargetProgressItem[] = [];
  for (const item of subject.targetItems ?? []) {
    const target = parseReportNumber(item.target);
    if (target == null || target <= 0) continue;
    const automatic = item.trackingMode === 'automatic' && Boolean(item.metricKey);
    if (!automatic || !item.metricKey) {
      manualRows.push(item);
      continue;
    }
    if (configuredMetricKeys.has(item.metricKey)) continue;
    const existing = automaticGroups.get(item.metricKey) ?? { rows: [], target: 0, actual: null };
    existing.rows.push(item);
    existing.target += target;
    if (item.actual != null) existing.actual = Math.max(existing.actual ?? 0, item.actual);
    automaticGroups.set(item.metricKey, existing);
  }

  for (const [metricKey, group] of automaticGroups) {
    const pct = group.actual == null ? null : Math.round((group.actual / group.target) * 100);
    const first = group.rows[0] ?? {};
    lines.push({
      id: `item-group:${metricKey}`,
      label:
        group.rows.length > 1
          ? `${METRIC_LABELS[metricKey] ?? first.activity ?? metricKey} · ${group.rows.length} alt kalem`
          : first.activity ?? METRIC_LABELS[metricKey] ?? metricKey,
      category: first.category ?? 'Özel hedef',
      unit: first.unit ?? (amountMetricKeys.has(metricKey) ? 'amount' : 'count'),
      target: group.target,
      actual: group.actual,
      pct,
      status: targetStatus(period, pct, expectedPct, false, now),
      trackingMode: 'automatic',
      source: METRIC_SOURCES[metricKey],
      detail:
        group.rows.length > 1
          ? 'Alt kalemler aynı sistem sayacını kullandığı için tek hedef olarak değerlendirilir.'
          : first.description,
    });
  }

  for (const item of manualRows) {
    const target = parseReportNumber(item.target);
    if (target == null || target <= 0) continue;
    lines.push({
      id: `manual:${item.targetType ?? 'other'}:${item.category ?? ''}:${item.activity ?? lines.length}`,
      label: item.activity ?? 'Manuel hedef',
      category: item.category ?? 'Özel hedef',
      unit: item.unit ?? 'count',
      target,
      actual: null,
      pct: null,
      status: 'manual',
      trackingMode: 'manual',
      detail: item.description,
    });
  }
  return lines;
}

function averageOf(lines: ReportLine[]): number | null {
  const measurable = lines.filter((line) => line.pct != null);
  return measurable.length
    ? Math.round(measurable.reduce((sum, line) => sum + Math.min(100, Math.max(0, line.pct ?? 0)), 0) / measurable.length)
    : null;
}

export function buildPeriodResult(period: string, response: TargetProgressResponse | null | undefined, now: Date = new Date()): PeriodResult {
  const expectedPct = Number(response?.expectedProgressPct ?? 0);
  const subject = Array.isArray(response?.subjects) ? response.subjects[0] ?? null : null;
  const lines = reportLines(subject, period, expectedPct, now);
  return {
    period,
    expectedPct,
    subject,
    lines,
    averagePct: averageOf(lines),
    achievedCount: lines.filter((line) => line.status === 'achieved').length,
    riskCount: lines.filter((line) => line.status === 'at_risk' || line.status === 'missed').length,
    manualCount: lines.filter((line) => line.status === 'manual').length,
  };
}

export function formatTargetValue(value: number | null, unit: string): string {
  if (value == null) return '—';
  const shown = value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  return unit === 'amount' ? `${shown} USD` : `${shown} adet`;
}

export function paceMeta(pace: number | null): { label: string; tone: TargetTone } {
  if (pace == null) return { label: 'Hedef yok', tone: STATUS_META.not_configured.tone };
  if (pace >= 0) return { label: `+${pace} puan`, tone: STATUS_META.on_track.tone };
  if (pace >= -15) return { label: `${pace} puan`, tone: STATUS_META.at_risk.tone };
  return { label: `${pace} puan`, tone: STATUS_META.missed.tone };
}

export function buildTeamRows(response: TargetProgressResponse | null | undefined, now: Date = new Date()): TeamRow[] {
  const expectedPct = Number(response?.expectedProgressPct ?? 0);
  const subjects = Array.isArray(response?.subjects) ? response.subjects : [];
  return subjects.map((subject) => {
    const lines = reportLines(subject, String(response?.period ?? ''), expectedPct, now);
    const averagePct = averageOf(lines);
    return {
      id: subject.subject.id,
      name: subject.subject.name,
      department: subject.subject.departmentNames?.[0] ?? subject.subject.departmentName ?? null,
      averagePct,
      pace: averagePct == null ? null : averagePct - expectedPct,
      achievedCount: lines.filter((line) => line.status === 'achieved').length,
      riskCount: lines.filter((line) => line.status === 'at_risk' || line.status === 'missed').length,
      lineCount: lines.length,
    };
  });
}

/** Hedefi olmayan ve ölçülemeyen satırlar her sıralamada en sona düşer. */
export function sortTeamRows(rows: TeamRow[], sort: TeamSort): TeamRow[] {
  return [...rows].sort((left, right) => {
    if (sort === 'name') return left.name.localeCompare(right.name, 'tr-TR');
    const leftValue = sort === 'pace' ? left.pace : left.averagePct;
    const rightValue = sort === 'pace' ? right.pace : right.averagePct;
    if (leftValue == null && rightValue == null) return left.name.localeCompare(right.name, 'tr-TR');
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    return leftValue - rightValue;
  });
}

export type ResultsSummary = {
  overallAverage: number | null;
  totalAchieved: number;
  totalRisk: number;
  totalManual: number;
  monthEndProjection: number | null;
};

export function summarizeResults(results: PeriodResult[], now: Date = new Date()): ResultsSummary {
  const latest = results[results.length - 1] ?? null;
  const measurable = results.filter((row) => row.averagePct != null);
  return {
    overallAverage: measurable.length
      ? Math.round(measurable.reduce((sum, row) => sum + (row.averagePct ?? 0), 0) / measurable.length)
      : null,
    totalAchieved: results.reduce((sum, row) => sum + row.achievedCount, 0),
    totalRisk: results.reduce((sum, row) => sum + row.riskCount, 0),
    totalManual: results.reduce((sum, row) => sum + row.manualCount, 0),
    monthEndProjection:
      latest && latest.period === currentPeriod(now) ? projectedPct(latest.averagePct, latest.expectedPct) : null,
  };
}

function csvCell(value: unknown): string {
  if (value == null) return '';
  const text = String(value);
  // Hücre başındaki formül karakterleri Excel'de komut olarak çalışmasın.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Web "CSV / Excel" çıktısıyla aynı sütunlar; ayırıcı Türkçe Excel için `;`. */
export function targetReportCsv(input: { scopeKind: ScopeKind; subjectName: string; results: PeriodResult[] }): string {
  const header = ['Dönem', 'Kapsam', 'Kapsam Türü', 'Kategori', 'Hedef', 'Takip', 'Birim', 'Hedef Değer', 'Gerçekleşen', 'Gerçekleşme %', 'Durum'];
  const rows = input.results.flatMap((result) =>
    result.lines.map((line) => [
      result.period,
      input.subjectName,
      SCOPE_META[input.scopeKind].label,
      line.category,
      line.label,
      line.trackingMode === 'automatic' ? 'Otomatik' : 'Manuel',
      line.unit === 'amount' ? 'USD' : 'adet',
      line.target,
      line.actual,
      line.pct,
      STATUS_META[line.status].label,
    ])
  );
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * "Yazdır / PDF" için betiksiz, kendi içinde HTML rapor. Tüm değerler kaçışlanır;
 * paylaşım sayfasındaki Yazdır seçeneği PDF olarak kaydetmeye izin verir.
 */
export function targetReportHtml(input: { scopeKind: ScopeKind; subjectName: string; results: PeriodResult[]; generatedAt?: Date }): string {
  const summary = summarizeResults(input.results, input.generatedAt);
  const rows = input.results
    .flatMap((result) =>
      result.lines.map(
        (line) =>
          `<tr><td>${escapeHtml(periodLabel(result.period))}</td><td>${escapeHtml(line.category)}</td><td>${escapeHtml(line.label)}</td><td>${escapeHtml(
            formatTargetValue(line.target, line.unit)
          )}</td><td>${escapeHtml(formatTargetValue(line.actual, line.unit))}</td><td>${line.pct == null ? '—' : `%${escapeHtml(line.pct)}`}</td><td>${escapeHtml(
            STATUS_META[line.status].label
          )}</td></tr>`
      )
    )
    .join('');
  const generated = (input.generatedAt ?? new Date()).toLocaleString('tr-TR');
  return [
    '<!doctype html><html lang="tr"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Hedef Raporu</title>',
    '<style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:black;margin:24px}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 12px;color:dimgray;font-size:12px}',
    'table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid lightgray;padding:6px;text-align:left}th{background:whitesmoke}',
    '.kpi{display:inline-block;margin:0 16px 12px 0;font-size:12px}.kpi b{display:block;font-size:16px}</style></head><body>',
    `<h1>Hedef Kontrol Merkezi · ${escapeHtml(input.subjectName)}</h1>`,
    `<p>${escapeHtml(SCOPE_META[input.scopeKind].label)} · ${escapeHtml(input.results[0] ? periodLabel(input.results[0].period) : '')} – ${escapeHtml(
      input.results.length ? periodLabel(input.results[input.results.length - 1]!.period) : ''
    )} · Oluşturulma: ${escapeHtml(generated)}</p>`,
    `<div class="kpi">Ortalama gerçekleşme<b>${summary.overallAverage == null ? '—' : `%${summary.overallAverage}`}</b></div>`,
    `<div class="kpi">Tamamlanan<b>${summary.totalAchieved}</b></div>`,
    `<div class="kpi">Yakın takip<b>${summary.totalRisk}</b></div>`,
    `<div class="kpi">Manuel takip<b>${summary.totalManual}</b></div>`,
    '<table><thead><tr><th>Dönem</th><th>Kategori</th><th>Hedef</th><th>Hedef Değer</th><th>Gerçekleşen</th><th>Gerçekleşme</th><th>Durum</th></tr></thead>',
    `<tbody>${rows || '<tr><td colspan="7">Seçili kapsam ve dönemde ölçülebilir hedef bulunamadı.</td></tr>'}</tbody></table>`,
    '</body></html>',
  ].join('');
}

/* ------------------------------------------------- hedef formu (TargetDialog) ---- */

export type UserTargetType = 'sales' | 'service' | 'finance' | 'purchase' | 'operations' | 'logistics' | 'other';
export type TargetUnit = 'count' | 'amount';
export type TrackingMode = 'automatic' | 'manual';

export type TargetFormItem = {
  targetType: UserTargetType;
  category: string;
  activity: string;
  description: string;
  unit: TargetUnit;
  defaultTarget: string;
  target: string;
  metricKey?: string | null;
  trackingMode?: TrackingMode;
  manualActual: string;
};

type TemplateItem = Omit<TargetFormItem, 'target' | 'manualActual'>;
type TemplateRow = Omit<TemplateItem, 'targetType'>;

export const MAIN_TARGET_FIELDS = [
  { key: 'salesAmount', label: 'Satış Cirosu', unit: 'USD' },
  { key: 'salesNewCustomers', label: 'Yeni Müşteri', unit: 'adet' },
  { key: 'quoteTarget', label: 'Teklif', unit: 'adet' },
  { key: 'visitTarget', label: 'Ziyaret', unit: 'adet' },
  { key: 'callTarget', label: 'Arama', unit: 'adet' },
  { key: 'serviceAmount', label: 'Servis Cirosu', unit: 'USD' },
  { key: 'serviceCompleted', label: 'Tamamlanan Servis', unit: 'adet' },
  { key: 'digitalLeadTarget', label: 'Dijital Fırsat', unit: 'adet' },
  { key: 'digitalConversionTarget', label: 'Dijital Dönüşüm', unit: 'adet' },
  { key: 'digitalBudget', label: 'Dijital Bütçe', unit: 'USD' },
] as const;

export type MainTargetKey = (typeof MAIN_TARGET_FIELDS)[number]['key'];

export type TargetForm = Record<MainTargetKey, string> & {
  period: string;
  targetItems: TargetFormItem[];
  note: string;
};

export const TARGET_TYPE_ORDER: UserTargetType[] = ['sales', 'service', 'finance', 'purchase', 'operations', 'logistics', 'other'];

export const TARGET_TYPE_LABELS: Record<UserTargetType, { label: string; title: string }> = {
  sales: { label: 'Satış', title: 'Satış Hedefleri' },
  service: { label: 'Servis', title: 'Servis Hedefleri' },
  finance: { label: 'Finans', title: 'Finans Hedefleri' },
  purchase: { label: 'Satınalma', title: 'Satınalma Hedefleri' },
  operations: { label: 'Operasyon', title: 'Operasyon Hedefleri' },
  logistics: { label: 'Lojistik', title: 'Lojistik Hedefleri' },
  other: { label: 'Diğer', title: 'Diğer Hedefler' },
};

const sharedVisitTargets: TemplateRow[] = [
  { category: 'ZİYARET', activity: 'MÜŞTERİ ZİYARETİ', description: 'Halihazırdaki cari hesaplarda bulunan müşterimize yapılan ziyaret', unit: 'count', defaultTarget: '20' },
  { category: 'ZİYARET', activity: 'TEKLİF TAKİP ZİYARETİ', description: 'Verilen teklifler ile ilgili müşterilerle değerlendirme toplantısı yapılacak.', unit: 'count', defaultTarget: '30' },
  { category: 'ZİYARET', activity: 'YENİ MÜŞTERİ ZİYARETİ', description: 'Sistemimizde kayıtlı olmayan, daha önce teklif verilmemiş ve ziyaret edilmemiş potansiyel müşteri ziyareti', unit: 'count', defaultTarget: '30' },
  { category: 'ZİYARET', activity: 'FUAR ZİYARETİ', description: 'Sektörel ve ilgili potansiyel sektör fuarları ziyaret edilecek, müşterilerimizin standları ziyaret edilip, potansiyel firmalar ile görüşmeler sağlanacak.', unit: 'count', defaultTarget: '2' },
];
const sharedDigitalTargets: TemplateRow[] = [
  { category: 'DİJİTAL PAZARLAMA', activity: 'ÇEVRİMİÇİ TOPLANTI', description: 'Potansiyel müşterilerle ilk tanışma toplantısı ve şirket sunumu için Zoom veya Windows Teams üzerinden toplantı yapılacak', unit: 'count', defaultTarget: '8' },
  { category: 'DİJİTAL PAZARLAMA', activity: 'LINKEDIN PAYLAŞIMI', description: 'Kurumsal sosyal medya hesaplarının gönderilerinin yeniden paylaşılması, web sitesi ürünlerinin link ile paylaşılması, üretici firmaların gönderilerinin yeniden paylaşılması', unit: 'count', defaultTarget: '10' },
  { category: 'DİJİTAL PAZARLAMA', activity: 'INSTAGRAM PAYLAŞIMI', description: 'Şirket ve ürünler ile ilgili hikaye paylaşımı', unit: 'count', defaultTarget: '4' },
  { category: 'DİJİTAL PAZARLAMA', activity: 'YOUTUBE PAYLAŞIMI', description: 'Haksan Makina Youtube hesabındaki videoların linkedin ve instagram hesaplarında paylaşılması', unit: 'count', defaultTarget: '4' },
  { category: 'DİJİTAL PAZARLAMA', activity: 'WHATSAPP DURUM', description: 'Şahsi ve şirket hatlarında Haksan Makina paylaşımı', unit: 'count', defaultTarget: '10' },
];
const sharedQuoteTargets: TemplateRow[] = [
  { category: 'TEKLİF', activity: 'YENİ TEKLİF', description: 'Yeni tekliflerde firma baz alınacak', unit: 'count', defaultTarget: '30' },
  { category: 'TEKLİF', activity: 'TEKLİF DURUM GÜNCELLEMESİ', description: 'Sistemde açık olan tekliflerin durumlarının müşteri ile iletişim kurularak güncellenmesi, iptal veya kayıp olan tekliflerin teklif sahipleri ile iletişim kurularak güncellenmesi', unit: 'count', defaultTarget: '30' },
];

export function inferTemplateMetricKey(targetType: UserTargetType, row: TemplateRow): string | null {
  const text = `${row.category} ${row.activity}`.toLocaleUpperCase('tr-TR');
  if (text.includes('DİJİTAL PAZARLAMA')) return null;
  if (text.includes('TAHSİLAT')) return 'paymentsInAmount';
  if (targetType === 'sales' && text.includes('SATIŞ HEDEF')) return 'machineDeliveredCount';
  if (targetType === 'sales' && row.unit === 'amount') return 'salesAmount';
  if (targetType === 'service' && text.includes('KURULUM')) return 'installationCompleted';
  if (targetType === 'service' && (text.includes('SERVİS') || text.includes('BAKIM'))) return row.unit === 'amount' ? 'serviceAmount' : 'serviceCompleted';
  if (targetType === 'finance' && text.includes('ALIŞ FATUR')) return 'purchaseInvoiceAmount';
  if (targetType === 'finance' && row.unit === 'amount') return 'paymentsInAmount';
  if (targetType === 'purchase') return row.unit === 'amount' ? 'purchaseOrderAmount' : 'purchaseOrderCount';
  if (targetType === 'operations' && text.includes('SATIŞ SİPARİŞ')) return row.unit === 'amount' ? 'salesOrderAmount' : 'salesOrderCount';
  if (targetType === 'operations' && text.includes('KURULUM')) return 'installationCompleted';
  if (text.includes('ZİYARET')) return 'visitTarget';
  if (text.includes('ARAMA')) return 'callTarget';
  if (text.includes('TEKLİF')) return 'quoteTarget';
  if (text.includes('LEAD')) return 'digitalLeadTarget';
  if (row.unit === 'amount') return 'salesAmount';
  return null;
}

function withTargetType(targetType: UserTargetType, rows: TemplateRow[]): TemplateItem[] {
  return rows.map((row) => {
    const metricKey = row.metricKey ?? inferTemplateMetricKey(targetType, row);
    return { targetType, ...row, metricKey, trackingMode: row.trackingMode ?? (metricKey ? 'automatic' : 'manual') };
  });
}

export const TARGET_TEMPLATES: Record<UserTargetType, TemplateItem[]> = {
  sales: withTargetType('sales', [
    { category: 'SATIŞ', activity: 'SATIŞ HEDEFİ', description: 'Tezgah teslimi yapıldığında hedef gerçekleşmiş olur.', unit: 'count', defaultTarget: '3' },
    { category: 'SATIŞ', activity: 'TAHSİLAT HEDEFİ', description: 'Satılan tezgahların bedellerinin tahsil edilmesi, sıralı ödemelerin takip edilmesi, açık kalan bakiyenin aylık ciro içindeki payı maksimum %5 olmalı.', unit: 'amount', defaultTarget: '' },
    ...sharedVisitTargets,
    { category: 'ARAMA', activity: 'MÜŞTERİ MEMNUNİYET ARAMASI', description: 'Halihazırdaki cari hesaplarda bulunan müşterimize yapılan telefon araması', unit: 'count', defaultTarget: '60' },
    { category: 'ARAMA', activity: 'TEKLİF TAKİP ARAMASI', description: 'Özellikle şehir dışı müşterilerin teklif durumları ile ilgili aramalar', unit: 'count', defaultTarget: '40' },
    { category: 'ARAMA', activity: 'YENİ MÜŞTERİ ARAMASI', description: 'Sistemimizde kayıtlı olmayan, daha önce teklif verilmemiş ve aranmamış potansiyel müşteri araması', unit: 'count', defaultTarget: '40' },
    ...sharedDigitalTargets,
    ...sharedQuoteTargets,
  ]),
  service: withTargetType('service', [
    { category: 'SATIŞ', activity: 'DIŞ SERVİS', description: 'Satışını bizim yapmadığımız, tezgahımızı kullanmayan firmalara servis hizmet verme', unit: 'amount', defaultTarget: '50000' },
    { category: 'SATIŞ', activity: 'PERİYODİK BAKIM', description: 'Periyodik bakım hizmet satışı', unit: 'count', defaultTarget: '3' },
    { category: 'SATIŞ', activity: 'YEDEK PARÇA & AKSESUAR SATIŞI', description: 'Yedek parça ve tezgah aksesuarlarının satışı', unit: 'amount', defaultTarget: '25000' },
    ...sharedVisitTargets,
    { category: 'ARAMA', activity: 'HİZMET MEMNUNİYET ARAMASI', description: 'Servis hizmeti verdiğimiz müşterilerin servis hizmet sonrası aranması, tezgahın bakım/onarım sonrası durumu hakkında bilgi alınması ve hizmet kalitemiz için müşterinin aranması', unit: 'count', defaultTarget: '40' },
    { category: 'ARAMA', activity: 'TEKLİF TAKİP ARAMASI', description: 'Teklif verdiğimiz müşterinin teklifin durumu hakkında aranması', unit: 'count', defaultTarget: '40' },
    { category: 'ARAMA', activity: 'YENİ MÜŞTERİ ARAMASI', description: 'Servis hizmeti verebileceğimiz yeni müşteri tarama araması', unit: 'count', defaultTarget: '25' },
    ...sharedDigitalTargets,
    ...sharedQuoteTargets,
    { category: 'TEKNİK', activity: 'DEMO PARÇA ÜRETİMİ', description: 'Tezgahlarımızın teknik kabiliyet ve kapasitesini gösteren demo parça işlenmesi, video çekimi', unit: 'count', defaultTarget: '30' },
    { category: 'TEKNİK', activity: 'MÜŞTERİ BİLGİ PAYLAŞIMI', description: 'Tezgahların kullanım kolaylığı sağlayan fonksiyonlarını, gizli özelliklerini, bakım ipuçları v.s. gibi müşterilere mail yoluyla bilgi paylaşımı, Youtube kanalımıza kısa video hazırlanması', unit: 'count', defaultTarget: '30' },
    { category: 'TEKNİK', activity: 'TEZGAH ARGE ÇALIŞMASI', description: 'Tezgahların teknik olarak eksik kalan, yetersiz kalan ve geliştirilmesi gerek konuların raporlanması', unit: 'count', defaultTarget: '1' },
  ]),
  finance: withTargetType('finance', [
    { category: 'FİNANS', activity: 'TAHSİLAT', description: 'Dönem içinde müşterilerden gelen tahsilat toplamı.', unit: 'amount', defaultTarget: '', metricKey: 'paymentsInAmount' },
    { category: 'FİNANS', activity: 'ALIŞ FATURASI KONTROLÜ', description: 'Dönem içinde işlenen alış faturalarının toplam tutarı.', unit: 'amount', defaultTarget: '', metricKey: 'purchaseInvoiceAmount' },
    { category: 'FİNANS', activity: 'CARİ MUTABAKAT', description: 'Müşteri ve tedarikçi cari mutabakatlarının tamamlanması.', unit: 'count', defaultTarget: '20', trackingMode: 'manual' },
    { category: 'FİNANS', activity: 'VADE TAKİBİ', description: 'Vadesi yaklaşan ve geciken ödemelerin takip edilmesi.', unit: 'count', defaultTarget: '30', trackingMode: 'manual' },
  ]),
  purchase: withTargetType('purchase', [
    { category: 'SATINALMA', activity: 'SATINALMA SİPARİŞİ', description: 'Dönem içinde oluşturulan satınalma siparişi adedi.', unit: 'count', defaultTarget: '20', metricKey: 'purchaseOrderCount' },
    { category: 'SATINALMA', activity: 'SATINALMA SİPARİŞ TUTARI', description: 'Dönem içinde oluşturulan satınalma siparişlerinin toplam tutarı.', unit: 'amount', defaultTarget: '', metricKey: 'purchaseOrderAmount' },
    { category: 'TEDARİK', activity: 'TEDARİKÇİ GÖRÜŞMESİ', description: 'Fiyat, teslim ve termin takibi için yapılan tedarikçi görüşmeleri.', unit: 'count', defaultTarget: '30', trackingMode: 'manual' },
  ]),
  operations: withTargetType('operations', [
    { category: 'OPERASYON', activity: 'SATIŞ SİPARİŞİ', description: 'Dönem içinde satış siparişine çevrilen işler.', unit: 'count', defaultTarget: '15', metricKey: 'salesOrderCount' },
    { category: 'OPERASYON', activity: 'SATIŞ SİPARİŞ TUTARI', description: 'Dönem içinde oluşturulan satış siparişlerinin toplam tutarı.', unit: 'amount', defaultTarget: '', metricKey: 'salesOrderAmount' },
    { category: 'OPERASYON', activity: 'KURULUM TAMAMLAMA', description: 'Dönem içinde tamamlanan kurulum işleri.', unit: 'count', defaultTarget: '8', metricKey: 'installationCompleted' },
  ]),
  logistics: withTargetType('logistics', [
    { category: 'LOJİSTİK', activity: 'SEVKİYAT PLANLAMA', description: 'Dönem içinde planlanan sevkiyat operasyonları.', unit: 'count', defaultTarget: '20', trackingMode: 'manual' },
    { category: 'LOJİSTİK', activity: 'TESLİMAT TAKİBİ', description: 'Teslimat, evrak ve gümrük adımlarının takip edilmesi.', unit: 'count', defaultTarget: '20', trackingMode: 'manual' },
    { category: 'LOJİSTİK', activity: 'GECİKME AKSİYONU', description: 'Geciken teslimatlarda müşteri ve tedarikçi iletişimi.', unit: 'count', defaultTarget: '10', trackingMode: 'manual' },
  ]),
  other: withTargetType('other', [
    { category: 'GENEL', activity: 'PROJE / İYİLEŞTİRME', description: 'Departmana özel proje, süreç iyileştirme veya operasyonel iş hedefi.', unit: 'count', defaultTarget: '1', trackingMode: 'manual' },
    { category: 'GENEL', activity: 'EĞİTİM / DOKÜMANTASYON', description: 'Ekip içi eğitim, süreç dokümantasyonu veya bilgi paylaşımı.', unit: 'count', defaultTarget: '2', trackingMode: 'manual' },
  ]),
};

const allTemplates = (): TemplateItem[] => TARGET_TYPE_ORDER.flatMap((targetType) => TARGET_TEMPLATES[targetType]);

export function targetItemKey(item: Pick<TargetFormItem, 'targetType' | 'category' | 'activity'>): string {
  return `${item.targetType}:${item.category}:${item.activity}`;
}

/** Yeni hedef BOŞ açılır; şablon değerleri yalnız "Şablondan doldur" ile gelir. */
export function emptyTargetForm(period: string = currentPeriod()): TargetForm {
  return {
    period,
    salesAmount: '',
    salesNewCustomers: '',
    serviceAmount: '',
    serviceCompleted: '',
    digitalLeadTarget: '',
    digitalConversionTarget: '',
    digitalBudget: '',
    visitTarget: '',
    callTarget: '',
    quoteTarget: '',
    targetItems: allTemplates().map((item) => ({ ...item, target: '', manualActual: '' })),
    note: '',
  };
}

/** Form tarafındaki katı sayı okuma: yalnız Türkçe binlik veya düz sayı kabul edilir. */
export function parseTargetNumber(value: string): number | null {
  const compact = value.trim().replace(/\s/g, '');
  if (!compact) return null;
  const turkishThousands = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
  const plainNumber = /^\d+([.,]\d+)?$/;
  if (!turkishThousands.test(compact) && !plainNumber.test(compact)) return null;
  const normalized = turkishThousands.test(compact) ? compact.replace(/\./g, '').replace(',', '.') : compact.replace(',', '.');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

const asText = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

export function mergeTargetItems(items: unknown): TargetFormItem[] {
  const incoming = Array.isArray(items) ? items : [];
  const byKey = new Map<string, Record<string, unknown>>();
  for (const item of incoming) {
    if (!item || typeof item !== 'object') continue;
    const maybe = item as Record<string, unknown>;
    if (!maybe.targetType || !maybe.category || !maybe.activity) continue;
    byKey.set(`${String(maybe.targetType)}:${String(maybe.category)}:${String(maybe.activity)}`, maybe);
  }
  return allTemplates().map((template) => {
    const existing = byKey.get(targetItemKey(template));
    return {
      ...template,
      target: asText(existing?.target ?? ''),
      manualActual: asText(existing?.manualActual ?? ''),
      metricKey: template.metricKey,
      trackingMode: template.trackingMode,
    };
  });
}

export type TargetApiRow = Partial<Record<MainTargetKey, string | number | null>> & {
  period?: string | null;
  targetItems?: unknown;
  note?: string | null;
};

export function targetFormFromApi(row: TargetApiRow, period: string): TargetForm {
  return {
    period: row.period ?? period,
    salesAmount: asText(row.salesAmount),
    salesNewCustomers: asText(row.salesNewCustomers),
    serviceAmount: asText(row.serviceAmount),
    serviceCompleted: asText(row.serviceCompleted),
    digitalLeadTarget: asText(row.digitalLeadTarget),
    digitalConversionTarget: asText(row.digitalConversionTarget),
    digitalBudget: asText(row.digitalBudget),
    visitTarget: asText(row.visitTarget),
    callTarget: asText(row.callTarget),
    quoteTarget: asText(row.quoteTarget),
    targetItems: mergeTargetItems(row.targetItems),
    note: row.note ?? '',
  };
}

export type TargetUpsertBody = {
  period: string;
  currency: 'USD';
  salesAmount: number | null;
  salesNewCustomers: number | null;
  serviceAmount: number | null;
  serviceCompleted: number | null;
  digitalLeadTarget: number | null;
  digitalConversionTarget: number | null;
  digitalBudget: number | null;
  visitTarget: number | null;
  callTarget: number | null;
  quoteTarget: number | null;
  targetItems: {
    targetType: UserTargetType;
    category: string;
    activity: string;
    description: string;
    unit: TargetUnit;
    target: string;
    metricKey?: string;
    trackingMode: TrackingMode;
    manualActual: string;
  }[];
  note?: string;
};

export function targetFormToApi(form: TargetForm): TargetUpsertBody {
  return {
    period: form.period,
    currency: 'USD',
    salesAmount: parseTargetNumber(form.salesAmount),
    salesNewCustomers: parseTargetNumber(form.salesNewCustomers),
    serviceAmount: parseTargetNumber(form.serviceAmount),
    serviceCompleted: parseTargetNumber(form.serviceCompleted),
    digitalLeadTarget: parseTargetNumber(form.digitalLeadTarget),
    digitalConversionTarget: parseTargetNumber(form.digitalConversionTarget),
    digitalBudget: parseTargetNumber(form.digitalBudget),
    visitTarget: parseTargetNumber(form.visitTarget),
    callTarget: parseTargetNumber(form.callTarget),
    quoteTarget: parseTargetNumber(form.quoteTarget),
    targetItems: form.targetItems.map((item) => ({
      targetType: item.targetType,
      category: item.category,
      activity: item.activity,
      description: item.description,
      unit: item.unit,
      target: item.target.trim(),
      metricKey: item.metricKey ?? undefined,
      trackingMode: item.trackingMode ?? (item.metricKey ? 'automatic' : 'manual'),
      manualActual: item.manualActual.trim(),
    })),
    note: form.note.trim() || undefined,
  };
}

function isInvalidNumberFor(unit: TargetUnit | 'USD' | 'adet', raw: string): boolean {
  if (!raw.trim()) return false;
  const numeric = parseTargetNumber(raw);
  if (numeric === null || numeric < 0) return true;
  return (unit === 'count' || unit === 'adet') && !Number.isInteger(numeric);
}

export function isInvalidTargetItem(item: TargetFormItem): boolean {
  return isInvalidNumberFor(item.unit, item.target) || isInvalidNumberFor(item.unit, item.manualActual);
}

export function isInvalidMainField(key: MainTargetKey, raw: string): boolean {
  const field = MAIN_TARGET_FIELDS.find((row) => row.key === key);
  return isInvalidNumberFor(field?.unit ?? 'adet', raw);
}

/** Adet alanları tam sayı, tutar alanları pozitif sayı olmalı. */
export function invalidTargetFieldCount(form: TargetForm): number {
  const main = MAIN_TARGET_FIELDS.filter((field) => isInvalidMainField(field.key, form[field.key])).length;
  return main + form.targetItems.filter(isInvalidTargetItem).length;
}

export function fillFromTemplate(form: TargetForm, targetType?: UserTargetType): TargetForm {
  return {
    ...form,
    targetItems: form.targetItems.map((item) =>
      !targetType || item.targetType === targetType ? { ...item, target: item.defaultTarget } : item
    ),
  };
}

export function clearTargets(form: TargetForm, targetType?: UserTargetType): TargetForm {
  return {
    ...form,
    targetItems: form.targetItems.map((item) =>
      !targetType || item.targetType === targetType ? { ...item, target: '', manualActual: '' } : item
    ),
  };
}

export function targetFilledCount(form: TargetForm, targetType: UserTargetType): number {
  return form.targetItems.filter((item) => item.targetType === targetType && Boolean(item.target.trim())).length;
}

export function hasTargetValue(form: TargetForm): boolean {
  return (
    MAIN_TARGET_FIELDS.some((field) => Boolean(form[field.key].trim())) ||
    form.targetItems.some((item) => Boolean(item.target.trim()) || Boolean(item.manualActual.trim()))
  );
}
