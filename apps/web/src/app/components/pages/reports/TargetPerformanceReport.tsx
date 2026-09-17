// Raporlar > Hedef Takibi: kişi ve departman bazlı hedef gerçekleşmesi + yazdırılabilir
// yönetim raporu. API (`/reports/target-progress`) her ölçüt için hedef/gerçekleşen/%
// ve kalem kalem hedefleri döndürür; PDF bunların hepsini basar — yalnız yüzde değil.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { reportService } from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";
import { printOrWarn } from "../../../lib/pageHelpers";
import { esc, haksanHeader, printAssetBase, type PrintDocument } from "../../../lib/print";
import { AlertTriangle, Building2, CheckCircle2, Clock3, Printer, RefreshCw, Target, UserRound, XCircle } from "lucide-react";

export type TargetStatus = "completed" | "on_track" | "at_risk" | "missed" | "scheduled" | "manual" | "no_target";

export type TargetSubjectRow = {
  subject: {
    kind: "user" | "department" | "role";
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
    trackingMode?: "automatic" | "manual";
  }>;
};

export type CurrencyNormalization = {
  base: "USD";
  rateDate: string;
  source: "live" | "period_average" | "last_known" | "fallback";
  live: boolean;
  unsupportedCurrencies: string[];
};

const TARGET_METRIC_LABELS: Record<string, string> = {
  salesAmount: "Satış cirosu",
  salesNewCustomers: "Yeni müşteri",
  quoteTarget: "Teklif",
  visitTarget: "Ziyaret",
  callTarget: "Arama",
  serviceCompleted: "Tamamlanan servis",
  serviceAmount: "Servis cirosu",
  digitalLeadTarget: "Dijital lead",
  paymentsInAmount: "Tahsilat",
  purchaseInvoiceAmount: "Alış faturası",
  purchaseOrderAmount: "Satınalma tutarı",
  purchaseOrderCount: "Satınalma siparişi",
  salesOrderAmount: "Satış siparişi tutarı",
  salesOrderCount: "Satış siparişi",
  installationCompleted: "Kurulum",
  digitalConversionTarget: "Dijital dönüşüm",
  digitalBudget: "Dijital bütçe",
};

/** Parasal ölçütler USD'de raporlanır; API'nin Excel'iyle aynı kural (amount/budget). */
const isMoneyMetric = (key: string) => /amount|budget/i.test(key);

/**
 * Hedef metnini sayıya çevirir. Kural API'deki `parseTargetItemNumber` ile birebir
 * aynıdır (apps/api/src/modules/reports/reports.service.ts); ayrışırsa aynı hedef
 * için ekrandaki yüzde ile Excel'deki yüzde birbirini tutmaz.
 */
const parseGoalNumber = (value: unknown) => {
  const compact = String(value ?? "").trim().replace(/\s/g, "");
  if (!compact) return null;
  const turkishThousands = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
  const plainNumber = /^\d+([.,]\d+)?$/;
  if (!turkishThousands.test(compact) && !plainNumber.test(compact)) return null;
  const numeric = Number(turkishThousands.test(compact) ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
};

/** Yerel takvim ayı: `toISOString` UTC verir, 1 Ekim 02:00'de hâlâ Eylül'dür. */
export const currentMonth = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

export const statusForProgress = (completionPct: number, expectedPct: number, period: string): TargetStatus => {
  const current = currentMonth();
  if (completionPct >= 100) return "completed";
  if (period < current) return "missed";
  if (period > current) return "scheduled";
  return completionPct + 10 < expectedPct ? "at_risk" : "on_track";
};

export type MetricLine = { label: string; target: number; actual: number; pct: number; unit: "USD" | "adet" };
export type ManualLine = { label: string; target: string };

export type SubjectAnalysis = {
  status: TargetStatus;
  completionPct: number | null;
  /** Otomatik ölçülen kalemler: hedef, gerçekleşen, yüzde. */
  metrics: MetricLine[];
  /** Sistemin ölçemediği, elle takip edilen hedefler. */
  manual: ManualLine[];
};

export function analyzeTargetSubject(row: TargetSubjectRow, expectedPct: number, period: string): SubjectAnalysis {
  const metrics: MetricLine[] = [];
  const manual: ManualLine[] = [];
  // Üst hedefte görülen her anahtar: aynı hedef `targetItems` içinde tekrar
  // geldiğinde ikinci kez (çoğu zaman öteki kolonda) listelenmesin.
  const seenMetricKeys = new Set<string>();
  for (const [key, metric] of Object.entries(row.metrics ?? {})) {
    if (metric.target == null || metric.target <= 0) continue;
    seenMetricKeys.add(key);
    if (metric.actual != null && metric.pct != null) {
      metrics.push({ label: TARGET_METRIC_LABELS[key] ?? key, target: metric.target, actual: metric.actual, pct: metric.pct, unit: isMoneyMetric(key) ? "USD" : "adet" });
    } else {
      manual.push({ label: TARGET_METRIC_LABELS[key] ?? key, target: formatGoal(metric.target, isMoneyMetric(key) ? "USD" : "adet") });
    }
  }
  const itemGroups = new Map<string, MetricLine>();
  for (const item of row.targetItems ?? []) {
    if (item.metricKey && seenMetricKeys.has(item.metricKey)) continue;
    const target = parseGoalNumber(item.target);
    const label = item.activity || item.description || TARGET_METRIC_LABELS[item.metricKey ?? ""] || "Hedef";
    if (item.trackingMode !== "automatic" || target == null || target <= 0 || item.actual == null) {
      const text = String(item.target ?? "").trim();
      if (text) manual.push({ label, target: item.unit === "amount" ? formatGoal(target ?? text, "USD") : text });
      continue;
    }
    const key = item.metricKey || item.activity || `item-${itemGroups.size}`;
    const existing = itemGroups.get(key);
    itemGroups.set(key, {
      label,
      target: (existing?.target ?? 0) + target,
      // Aynı metrikte API toplam gerçekleşmeyi her satırda döndürür; tekrar toplamayız.
      actual: Math.max(existing?.actual ?? 0, item.actual),
      pct: 0,
      unit: item.unit === "amount" || isMoneyMetric(item.metricKey ?? "") ? "USD" : "adet",
    });
  }
  for (const item of itemGroups.values()) {
    metrics.push({ ...item, pct: Math.round((item.actual / item.target) * 100) });
  }
  if (!row.hasTarget) return { status: "no_target", completionPct: null, metrics, manual };
  if (metrics.length === 0) return { status: "manual", completionPct: null, metrics, manual };
  const completionPct = Math.round(metrics.reduce((sum, item) => sum + Math.min(100, Math.max(0, item.pct)), 0) / metrics.length);
  return {
    status: statusForProgress(completionPct, expectedPct, period),
    completionPct,
    metrics,
    manual,
  };
}

const formatNumber = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
const formatGoal = (value: number | string | null, unit: "USD" | "adet") =>
  typeof value === "number" ? `${formatNumber(value)}${unit === "USD" ? " USD" : ""}` : String(value ?? "");
/** "6 / 10 (%60)" ya da "41.200 / 60.000 USD (%69)". */
export const metricLineText = (line: MetricLine) =>
  `${formatNumber(line.actual)} / ${formatNumber(line.target)}${line.unit === "USD" ? " USD" : ""} (%${line.pct})`;

const TARGET_STATUS_META: Record<TargetStatus, { label: string; className: string; icon: typeof Target }> = {
  completed: { label: "Tamamlandı", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  on_track: { label: "Yolunda", className: "border-blue-200 bg-blue-50 text-blue-700", icon: Clock3 },
  at_risk: { label: "Riskte", className: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangle },
  missed: { label: "Tamamlanmadı", className: "border-red-200 bg-red-50 text-red-700", icon: XCircle },
  scheduled: { label: "Planlandı", className: "border-slate-200 bg-slate-50 text-slate-700", icon: Clock3 },
  manual: { label: "Manuel takip", className: "border-slate-200 bg-slate-50 text-slate-700", icon: UserRound },
  no_target: { label: "Hedef yok", className: "border-slate-200 bg-white text-slate-500", icon: Target },
};

function TargetStatusBadge({ status }: { status: TargetStatus }) {
  const meta = TARGET_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${meta.className}`}>
      <Icon className="size-3" /> {meta.label}
    </span>
  );
}

function TargetProgressCell({ value, expected, previous }: { value: number | null; expected: number; previous?: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">Otomatik veri yok</span>;
  return (
    <div className="min-w-[150px]">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold tabular-nums">
          %{value}
          {previous != null && <span className={`ml-1 font-normal ${value > previous ? "text-emerald-700" : value < previous ? "text-red-700" : "text-muted-foreground"}`}>{trendArrow(value, previous)}</span>}
        </span>
        <span className="text-muted-foreground">Beklenen %{expected}</span>
      </div>
      <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${value + 10 < expected ? "bg-amber-500" : value >= 100 ? "bg-emerald-500" : "bg-primary"}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
        <span className="absolute inset-y-0 w-px bg-slate-700/60" style={{ left: `${Math.min(99, Math.max(0, expected))}%` }} />
      </div>
    </div>
  );
}

/** Geçen dönemle kıyas: "%62 → %71 ▲". Geçen dönem ölçülemediyse boş. */
const trendArrow = (current: number, previous: number) => (current > previous ? `▲ %${previous}'den` : current < previous ? `▼ %${previous}'den` : "= geçen ay");

/** Bir önceki ay: 2026-01 → 2025-12. */
export const previousPeriod = (period: string) => {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

type PersonRow = { row: TargetSubjectRow; analysis: SubjectAnalysis; previousPct: number | null; rank: number | null };

type DepartmentSummary = {
  row: TargetSubjectRow;
  completionPct: number | null;
  previousPct: number | null;
  status: TargetStatus;
  memberCount: number;
  problemCount: number;
  source: string;
  metrics: MetricLine[];
  members: PersonRow[];
};

/**
 * Departman durumu: departmanın kendi hedefi varsa ondan, yoksa üyelerinin kişisel
 * hedef ortalamasından. Üyelik ana + ikincil departman atamalarıdır; bir kişi iki
 * departmanda da görünebilir.
 */
function summarizeDepartments(
  departmentRows: TargetSubjectRow[],
  people: PersonRow[],
  expectedPct: number,
  period: string,
  previousDepartments: Map<string, number | null>,
): DepartmentSummary[] {
  return departmentRows.map((row) => {
    const members = people.filter(({ row: person }) =>
      person.subject.departmentIds?.includes(row.subject.id) || person.subject.departmentId === row.subject.id,
    );
    const direct = analyzeTargetSubject(row, expectedPct, period);
    const measurableMembers = members.filter(({ analysis }) => analysis.completionPct != null);
    const memberAverage = measurableMembers.length
      ? Math.round(measurableMembers.reduce((sum, item) => sum + (item.analysis.completionPct ?? 0), 0) / measurableMembers.length)
      : null;
    const completionPct = direct.completionPct ?? memberAverage;
    const status = completionPct == null
      ? direct.status
      : direct.completionPct == null
        ? statusForProgress(completionPct, expectedPct, period)
        : direct.status;
    return {
      row,
      completionPct,
      previousPct: previousDepartments.get(row.subject.id) ?? null,
      status,
      memberCount: row.subject.memberCount ?? members.length,
      problemCount: members.filter(({ analysis }) => analysis.status === "at_risk" || analysis.status === "missed").length,
      source: direct.completionPct == null && memberAverage != null ? "Kişisel hedef ortalaması" : "Departman hedefi",
      metrics: direct.metrics,
      members,
    };
  });
}

/** Geçen dönemin departman yüzdeleri; kıyas okunda kullanılır. */
function departmentCompletionMap(departmentRows: TargetSubjectRow[], userRows: TargetSubjectRow[], period: string) {
  const people = userRows.map((row) => ({ row, analysis: analyzeTargetSubject(row, 100, period), previousPct: null, rank: null }));
  const map = new Map<string, number | null>();
  for (const dept of summarizeDepartments(departmentRows, people, 100, period, new Map())) map.set(dept.row.subject.id, dept.completionPct);
  return map;
}

/* ---------------- Yazdırma ---------------- */

export type TargetPrintPerson = {
  /** Tekilleştirme anahtarı: bir kişi birden çok departman bloğunda görünebilir. */
  id: string;
  rank: number | null;
  name: string;
  departments: string;
  completionPct: number | null;
  previousPct: number | null;
  status: TargetStatus;
  metrics: MetricLine[];
  manual: ManualLine[];
  note: string | null;
};

export type TargetPrintDepartment = {
  name: string;
  source: string;
  memberCount: number;
  problemCount: number;
  completionPct: number | null;
  previousPct: number | null;
  status: TargetStatus;
  metrics: MetricLine[];
  note: string | null;
  members: TargetPrintPerson[];
};

export type TargetPrintInput = {
  period: string;
  filter: "problems" | "all";
  departmentFilterName: string | null;
  expectedPct: number;
  averagePct: number | null;
  previousAveragePct: number | null;
  targetedPeople: number;
  completedCount: number;
  riskCount: number;
  missedCount: number;
  departments: TargetPrintDepartment[];
  /** Hiçbir departmana atanmamış kişiler; boşsa blok basılmaz. */
  unassigned: TargetPrintPerson[];
  currencyNormalization: CurrencyNormalization | null;
  preparedBy: string | null;
  assetBase: string;
};

const reportPct = (value: number | null) => (value == null ? "—" : `%${value}`);

export function targetPerformancePrintDoc(input: TargetPrintInput): PrintDocument {
  const [year, month] = input.period.split("-").map(Number);
  const periodLabel = Number.isFinite(year) && Number.isFinite(month)
    ? new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1))
    : input.period;
  const generatedAt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const statusLabel = (status: TargetStatus) => TARGET_STATUS_META[status].label;
  const statusClass = (status: TargetStatus) =>
    status === "completed" ? "ok" : status === "at_risk" ? "risk" : status === "missed" ? "missed" : "neutral";
  const trend = (current: number | null, previous: number | null) => {
    if (current == null || previous == null) return "";
    const cls = current > previous ? "up" : current < previous ? "down" : "flat";
    const glyph = current > previous ? "▲" : current < previous ? "▼" : "=";
    return `<span class="trend ${cls}">${glyph} %${previous}</span>`;
  };
  const bar = (value: number | null, expected: number) => {
    if (value == null) return `<span class="muted">Otomatik veri yok</span>`;
    const tone = value >= 100 ? "ok" : value + 10 < expected ? "risk" : "on";
    return `<div class="bar ${tone}"><i style="width:${Math.min(100, Math.max(0, value))}%"></i><b style="left:${Math.min(99, Math.max(0, expected))}%"></b></div>`;
  };
  const metricList = (lines: MetricLine[]) =>
    lines.length
      ? `<ul class="metrics">${lines.map((line) => `<li><span class="${line.pct >= 100 ? "ok" : line.pct + 10 < input.expectedPct ? "risk" : ""}">${esc(line.label)}</span> ${esc(metricLineText(line))}</li>`).join("")}</ul>`
      : `<span class="muted">—</span>`;
  const manualList = (lines: ManualLine[]) =>
    lines.length ? `<ul class="metrics manual">${lines.map((line) => `<li>${esc(line.label)}: ${esc(line.target)}</li>`).join("")}</ul>` : `<span class="muted">—</span>`;

  const personRows = (people: TargetPrintPerson[]) =>
    people.map((row) => `
      <tr>
        <td class="num rank">${row.rank == null ? "—" : row.rank}</td>
        <td><b>${esc(row.name)}</b>${row.departments ? `<div class="muted small">${esc(row.departments)}</div>` : ""}${row.note ? `<div class="note">${esc(row.note)}</div>` : ""}</td>
        <td><div class="pct">${esc(reportPct(row.completionPct))} ${trend(row.completionPct, row.previousPct)}</div>${bar(row.completionPct, input.expectedPct)}</td>
        <td>${metricList(row.metrics)}</td>
        <td>${manualList(row.manual)}</td>
        <td><span class="status ${statusClass(row.status)}">${esc(statusLabel(row.status))}</span></td>
      </tr>`).join("");
  const personTable = (people: TargetPrintPerson[]) =>
    `<table class="report-table people">
      <thead><tr><th style="width:5%">#</th><th style="width:20%">Kullanıcı</th><th style="width:17%">İlerleme</th><th style="width:28%">Ölçütler (gerçekleşen / hedef)</th><th style="width:17%">Manuel hedefler</th><th style="width:13%">Durum</th></tr></thead>
      <tbody>${personRows(people)}</tbody>
    </table>`;

  const departmentBlocks = input.departments.map((dept) => `
    <section class="dept-block">
      <div class="dept-head">
        <div>
          <div class="dept-name">${esc(dept.name)}</div>
          <div class="muted small">${esc(dept.source)} · ${dept.memberCount} üye${dept.members.length === dept.memberCount ? "" : ` (${dept.members.length} listelendi)`} · ${dept.problemCount} eksik/riskli${dept.note ? ` · ${esc(dept.note)}` : ""}</div>
          ${dept.metrics.length ? metricList(dept.metrics) : ""}
        </div>
        <div class="dept-progress">
          <div class="pct">${esc(reportPct(dept.completionPct))} ${trend(dept.completionPct, dept.previousPct)}</div>
          ${bar(dept.completionPct, input.expectedPct)}
          <span class="status ${statusClass(dept.status)}">${esc(statusLabel(dept.status))}</span>
        </div>
      </div>
      ${dept.members.length ? personTable(dept.members) : `<div class="empty">Seçili filtrede bu departmandan kullanıcı yok.</div>`}
    </section>`).join("");

  const allPeople = [...input.departments.flatMap((d) => d.members), ...input.unassigned];
  const ranked = [...new Map(allPeople.filter((p) => p.completionPct != null).map((p) => [p.id, p])).values()]
    .sort((a, b) => (b.completionPct ?? 0) - (a.completionPct ?? 0));
  const highlight = (list: TargetPrintPerson[], title: string, empty: string) =>
    `<div class="highlight"><div class="highlight-title">${title}</div>${
      list.length
        ? `<ol>${list.map((p) => `<li><b>${esc(p.name)}</b> <span class="num">${esc(reportPct(p.completionPct))}</span> <span class="status ${statusClass(p.status)}">${esc(statusLabel(p.status))}</span></li>`).join("")}</ol>`
        : `<div class="muted small">${esc(empty)}</div>`
    }</div>`;
  const top = ranked.slice(0, 3);
  // "Riskli" durumu riskte/tamamlanmadı olanlardır; yüzdesi düşük ama ayın
  // temposuna uyan kişi bu kutuda görünmez.
  const bottom = ranked.filter((p) => p.status === "at_risk" || p.status === "missed").slice(-3).reverse();

  const currencyNote = input.currencyNormalization
    ? `Parasal gerçekleşmeler ${input.currencyNormalization.base} bazında; kur tarihi ${input.currencyNormalization.rateDate}${input.currencyNormalization.unsupportedCurrencies.length ? `; çevrilemeyen: ${input.currencyNormalization.unsupportedCurrencies.join(", ")}` : ""}.`
    : "Parasal gerçekleşmeler USD bazında raporlanır.";
  const scope = [
    input.filter === "all" ? "Tüm kullanıcılar" : "Eksik ve riskli kullanıcılar",
    input.departmentFilterName ? `Departman: ${input.departmentFilterName}` : null,
  ].filter(Boolean).join(" · ");

  return {
    // Tarayıcı "PDF olarak kaydet" dosya adını pencere başlığından alır; yanındaki
    // Excel dışa aktarımıyla aynı ad kullanılır ki iki dosya klasörde yan yana dursun.
    title: `hedef-gerceklesme-${input.period}`,
    css: `
      /* Akan (sayfa sayısı önceden bilinmeyen) belge: üst/alt pay her sayfada @page'den,
         yan paylar .page dolgusundan gelir. Sayfa numarasını tarayıcının kendi alt bilgisi
         basar — Chrome @page kenar kutularını (@bottom-right) desteklemiyor. */
      @page { size: A4; margin: 10mm 0; }
      .page.target-report { display:block; min-height: 0; padding-top: 0; padding-bottom: 0; }
      .report-head { display:flex; align-items:flex-end; justify-content:space-between; gap:8mm; border-bottom:2px solid #000c69; padding-bottom:3mm; margin-top:5mm; }
      .eyebrow { color:#000c69; font-size:8pt; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; }
      h1 { margin-top:1mm; font-size:18pt; line-height:1.1; }
      .meta { text-align:right; font-size:8.5pt; line-height:1.5; color:#4b5563; }
      .summary { display:grid; grid-template-columns:repeat(5,1fr); gap:2mm; margin:5mm 0 3mm; }
      .summary-item { border:1px solid #d9deea; border-top:2px solid #000c69; padding:2.5mm; min-height:18mm; }
      .summary-label { color:#64748b; font-size:7.5pt; line-height:1.25; }
      .summary-value { margin-top:2mm; color:#111827; font-size:15pt; font-weight:700; }
      .pulse { display:flex; justify-content:space-between; gap:5mm; margin-bottom:4mm; padding:2.5mm 3mm; background:#f4f6fb; border-left:3px solid #000c69; font-size:8.5pt; }
      .highlights { display:grid; grid-template-columns:1fr 1fr; gap:3mm; margin-bottom:5mm; }
      .highlight { border:1px solid #d9deea; padding:2.5mm 3mm; font-size:8pt; }
      .highlight-title { font-weight:700; color:#000c69; margin-bottom:1.5mm; }
      .highlight ol { padding-left:5mm; } .highlight li { margin:1mm 0; }
      h2 { margin:5mm 0 2mm; color:#000c69; font-size:11pt; }
      .dept-block { break-inside: avoid; page-break-inside: avoid; margin-bottom:5mm; border:1px solid #d9deea; }
      .dept-head { display:flex; justify-content:space-between; gap:6mm; padding:2.5mm 3mm; background:#f4f6fb; border-bottom:1px solid #d9deea; }
      .dept-name { font-size:10.5pt; font-weight:700; color:#000c69; }
      .dept-head .metrics { margin-top:1mm; font-size:8pt; }
      .dept-progress { min-width:48mm; text-align:right; }
      .dept-progress .status { margin-top:1.5mm; }
      .report-table { width:100%; table-layout:fixed; font-size:7.5pt; }
      .report-table th { background:#000c69; color:#fff; padding:2mm 1.5mm; text-align:left; font-weight:700; }
      .report-table td { border:1px solid #d8dde8; padding:1.8mm 1.5mm; vertical-align:top; line-height:1.3; overflow-wrap:anywhere; }
      .report-table tbody tr:nth-child(even) { background:#f8fafc; }
      .num { text-align:right; font-variant-numeric:tabular-nums; } .rank { color:#64748b; }
      .pct { font-weight:700; font-variant-numeric:tabular-nums; margin-bottom:1mm; }
      .trend { font-weight:400; font-size:7pt; } .trend.up { color:#12633a; } .trend.down { color:#9c2727; } .trend.flat { color:#64748b; }
      .bar { position:relative; height:2.2mm; background:#e5e9f2; border-radius:2mm; overflow:hidden; }
      .bar i { display:block; height:100%; background:#000c69; } .bar.ok i { background:#12633a; } .bar.risk i { background:#c98a12; }
      .bar b { position:absolute; top:0; bottom:0; width:0.4mm; background:#334155; }
      .metrics { list-style:none; padding:0; margin:0; } .metrics li { margin:0.4mm 0; } .metrics li span { font-weight:700; }
      .metrics li span.ok { color:#12633a; } .metrics li span.risk { color:#9c2727; } .metrics.manual { color:#475569; }
      .note { margin-top:1mm; padding:1mm 1.5mm; background:#fffbe6; border-left:2px solid #e7c168; font-size:7pt; color:#5b4a0c; }
      .muted { color:#64748b; } .small { font-size:7pt; }
      .status { display:inline-block; padding:.8mm 1.6mm; border-radius:8mm; border:1px solid #cbd5e1; white-space:nowrap; font-size:7pt; }
      .status.ok { border-color:#86cfa7; color:#12633a; background:#edf9f2; }
      .status.risk { border-color:#e7c168; color:#7a4b08; background:#fff8e5; }
      .status.missed { border-color:#e9a3a3; color:#9c2727; background:#fff0f0; }
      .status.neutral { color:#475569; background:#f8fafc; }
      .empty { border:1px solid #d8dde8; padding:4mm; text-align:center; color:#64748b; font-size:8pt; }
      .evaluation { break-inside: avoid; page-break-inside: avoid; margin-top:6mm; border:1px solid #d9deea; padding:3mm; }
      .evaluation h3 { font-size:9pt; color:#000c69; margin-bottom:2mm; }
      .lines div { border-bottom:1px dotted #94a3b8; height:6mm; }
      .signatures { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6mm; margin-top:5mm; font-size:8pt; }
      .signatures div { border-top:1px solid #334155; padding-top:1.5mm; }
      .footnote { margin-top:4mm; color:#64748b; font-size:7.5pt; line-height:1.4; }
    `,
    body: `
      <main class="page target-report">
        ${haksanHeader(input.assetBase)}
        <header class="report-head">
          <div><div class="eyebrow">Yönetim Raporu</div><h1>Hedef Gerçekleşme Raporu</h1></div>
          <div class="meta"><b>${esc(periodLabel)}</b><br>${esc(generatedAt)} tarihinde oluşturuldu${input.preparedBy ? ` · ${esc(input.preparedBy)}` : ""}<br>Kapsam: ${esc(scope)}</div>
        </header>
        <section class="summary">
          <div class="summary-item"><div class="summary-label">Hedef atanan kişi</div><div class="summary-value">${input.targetedPeople}</div></div>
          <div class="summary-item"><div class="summary-label">Tamamlanan</div><div class="summary-value">${input.completedCount}</div></div>
          <div class="summary-item"><div class="summary-label">Riskte</div><div class="summary-value">${input.riskCount}</div></div>
          <div class="summary-item"><div class="summary-label">Tamamlanmadı</div><div class="summary-value">${input.missedCount}</div></div>
          <div class="summary-item"><div class="summary-label">Ortalama gerçekleşme</div><div class="summary-value">${esc(reportPct(input.averagePct))} ${trend(input.averagePct, input.previousAveragePct)}</div></div>
        </section>
        <div class="pulse"><span>Dönem temposu: beklenen <b>%${input.expectedPct}</b></span><span>Gerçekleşen ekip ortalaması <b>${esc(reportPct(input.averagePct))}</b>${input.previousAveragePct != null ? ` · geçen ay <b>%${input.previousAveragePct}</b>` : ""}</span></div>
        <section class="highlights">
          ${highlight(top, input.filter === "all" ? "En iyi 3" : "Listedeki en iyi 3", "Ölçülebilir hedef yok.")}
          ${highlight(bottom, "En riskli 3", "Riskli kullanıcı yok.")}
        </section>
        <h2>Departman bazlı durum</h2>
        ${departmentBlocks || `<div class="empty">Departman kaydı bulunmuyor.</div>`}
        ${input.unassigned.length ? `<section class="dept-block"><div class="dept-head"><div><div class="dept-name">Departmansız</div><div class="muted small">${input.unassigned.length} kullanıcı</div></div></div>${personTable(input.unassigned)}</section>` : ""}
        <section class="evaluation">
          <h3>Yönetici değerlendirmesi</h3>
          <div class="lines"><div></div><div></div><div></div></div>
          <div class="signatures">
            <div>Hazırlayan${input.preparedBy ? `<br><b>${esc(input.preparedBy)}</b>` : ""}</div>
            <div>Onaylayan</div>
            <div>Tarih / İmza</div>
          </div>
        </section>
        <p class="footnote">${esc(currencyNote)} Otomatik hedefler sistem kayıtlarından, manuel hedefler kullanıcı girişlerinden alınır. Sıra numarası, ölçülebilir hedefi olan tüm ekip içindeki gerçekleşme yüzdesi sırasıdır (departman süzgeci sırayı değiştirmez); kıyas oku bir önceki ayın kapanış yüzdesidir.</p>
      </main>`,
  };
}

/* ---------------- Ekran ---------------- */

const ALL = "all";

export function TargetPerformanceReport() {
  const { hasPermission, user } = useAuth();
  const [period, setPeriod] = useState(currentMonth);
  const [filter, setFilter] = useState<"problems" | "all">("problems");
  const [departmentFilter, setDepartmentFilter] = useState<string>(ALL);
  const [userRows, setUserRows] = useState<TargetSubjectRow[]>([]);
  const [departmentRows, setDepartmentRows] = useState<TargetSubjectRow[]>([]);
  const [previous, setPrevious] = useState<{ period: string; users: TargetSubjectRow[]; departments: TargetSubjectRow[] } | null>(null);
  const [expectedPct, setExpectedPct] = useState(0);
  const [loading, setLoading] = useState(true);
  /** Ekrandaki verinin ait olduğu dönem; seçili dönemden farklıysa yükleniyoruz. */
  const [loadedPeriod, setLoadedPeriod] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [currencyNormalization, setCurrencyNormalization] = useState<CurrencyNormalization | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (loadedPeriod !== period) setLoading(true);
    setRefreshing(true);
    setError(null);
    // Departman kapsamı yalnız yöneticilere açık (API `assertScopeAllowed` 403 atar).
    // O istek düşerse departman bloğu boş kalır, kişi bazlı rapor yine gösterilir.
    Promise.allSettled([
      reportService.targetProgress({ period, scope: "all-users" }),
      reportService.targetProgress({ period, scope: "department" }),
    ])
      .then(([usersResult, departmentsResult]) => {
        if (!alive) return;
        if (usersResult.status === "rejected") throw usersResult.reason;
        const usersResponse = usersResult.value;
        const departmentsResponse = departmentsResult.status === "fulfilled" ? departmentsResult.value : null;
        setUserRows(Array.isArray(usersResponse?.subjects) ? usersResponse.subjects : []);
        setDepartmentRows(Array.isArray(departmentsResponse?.subjects) ? departmentsResponse.subjects : []);
        const expected = Number(usersResponse?.expectedProgressPct ?? departmentsResponse?.expectedProgressPct ?? 0);
        setExpectedPct(Number.isFinite(expected) ? expected : 0);
        setCurrencyNormalization(usersResponse?.currencyNormalization ?? departmentsResponse?.currencyNormalization ?? null);
        setLoadedPeriod(period);
        setLastUpdatedAt(new Date());
      })
      .catch((reason) => alive && setError(reason?.message ?? "Hedef raporu yüklenemedi"))
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      alive = false;
    };
    // loadedPeriod kasıtlı olarak bağımlılık değil: yükleme bayrağını kurmak için okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, refreshKey]);

  // Geçen ay kapanmıştır; dakikada bir yenilenen canlı döngüye girmez, dönem başına bir kez.
  useEffect(() => {
    let alive = true;
    const prev = previousPeriod(period);
    setPrevious(null);
    Promise.allSettled([
      reportService.targetProgress({ period: prev, scope: "all-users" }),
      reportService.targetProgress({ period: prev, scope: "department" }),
    ])
      .then(([usersResult, departmentsResult]) => {
        if (!alive || usersResult.status === "rejected") return;
        const departmentsResponse = departmentsResult.status === "fulfilled" ? departmentsResult.value : null;
        setPrevious({
          period: prev,
          users: Array.isArray(usersResult.value?.subjects) ? usersResult.value.subjects : [],
          departments: Array.isArray(departmentsResponse?.subjects) ? departmentsResponse.subjects : [],
        });
      })
      .catch(() => alive && setPrevious(null));
    return () => {
      alive = false;
    };
  }, [period]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) setRefreshKey((value) => value + 1); }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const previousPctByUser = useMemo(() => {
    const map = new Map<string, number | null>();
    if (previous) for (const row of previous.users) map.set(row.subject.id, analyzeTargetSubject(row, 100, previous.period).completionPct);
    return map;
  }, [previous]);
  const previousPctByDepartment = useMemo(
    () => (previous ? departmentCompletionMap(previous.departments, previous.users, previous.period) : new Map<string, number | null>()),
    [previous],
  );

  const people = useMemo<PersonRow[]>(() => {
    const analyzed = userRows.map((row) => ({ row, analysis: analyzeTargetSubject(row, expectedPct, period), previousPct: previousPctByUser.get(row.subject.id) ?? null, rank: null as number | null }));
    // Sıra: ölçülebilir hedefi olanlar gerçekleşme yüzdesine göre; diğerleri sırasız.
    const ranked = analyzed.filter((p) => p.analysis.completionPct != null).sort((a, b) => (b.analysis.completionPct ?? 0) - (a.analysis.completionPct ?? 0));
    ranked.forEach((p, index) => { p.rank = index + 1; });
    const priority: Record<TargetStatus, number> = { missed: 0, at_risk: 1, on_track: 2, completed: 3, manual: 4, no_target: 5, scheduled: 6 };
    return analyzed.sort((a, b) => priority[a.analysis.status] - priority[b.analysis.status] || a.row.subject.name.localeCompare(b.row.subject.name, "tr"));
  }, [expectedPct, period, userRows, previousPctByUser]);

  const departments = useMemo(
    () => summarizeDepartments(departmentRows, people, expectedPct, period, previousPctByDepartment),
    [departmentRows, expectedPct, people, period, previousPctByDepartment],
  );
  const inDepartment = (person: PersonRow) =>
    departmentFilter === ALL || person.row.subject.departmentIds?.includes(departmentFilter) || person.row.subject.departmentId === departmentFilter;
  const isProblem = ({ analysis }: PersonRow) => analysis.status === "at_risk" || analysis.status === "missed";
  const scopedPeople = useMemo(() => people.filter(inDepartment), [people, departmentFilter]);
  const visiblePeople = scopedPeople.filter((person) => filter === "all" || isProblem(person));
  const visibleDepartments = departments.filter((dept) => departmentFilter === ALL || dept.row.subject.id === departmentFilter);
  const targetedPeople = scopedPeople.filter(({ analysis }) => analysis.status !== "no_target");
  const completedCount = scopedPeople.filter(({ analysis }) => analysis.status === "completed").length;
  const riskCount = scopedPeople.filter(({ analysis }) => analysis.status === "at_risk").length;
  const missedCount = scopedPeople.filter(({ analysis }) => analysis.status === "missed").length;
  const average = (list: PersonRow[]) => {
    const measurable = list.filter(({ analysis }) => analysis.completionPct != null);
    return measurable.length ? Math.round(measurable.reduce((sum, item) => sum + (item.analysis.completionPct ?? 0), 0) / measurable.length) : null;
  };
  const averagePct = average(scopedPeople);
  // Kıyas yalnız iki ayda da ölçülebilen kişilerden hesaplanır; yoksa hedefi
  // henüz girilmemiş bir ay, geçen aya göre düşüş gibi görünür.
  const comparable = scopedPeople.filter((p) => p.analysis.completionPct != null && p.previousPct != null);
  const previousAveragePct = comparable.length
    ? Math.round(comparable.reduce((sum, p) => sum + (p.previousPct ?? 0), 0) / comparable.length)
    : null;

  const toPrintPerson = ({ row, analysis, previousPct, rank }: PersonRow): TargetPrintPerson => ({
    id: row.subject.id,
    rank,
    name: row.subject.name,
    departments: row.subject.departmentNames?.length ? row.subject.departmentNames.join(", ") : row.subject.departmentName || "",
    completionPct: analysis.completionPct,
    previousPct,
    status: analysis.status,
    metrics: analysis.metrics,
    manual: analysis.manual,
    note: row.note?.trim() || null,
  });

  const handlePrintReport = () => {
    const visibleIds = new Set(visiblePeople.map((p) => p.row.subject.id));
    const assigned = new Set<string>();
    const printDepartments: TargetPrintDepartment[] = visibleDepartments
      // Üyesi ve hedefi olmayan departman kâğıtta boş blok olarak yer kaplamasın.
      .filter((dept) => dept.members.length > 0 || dept.row.hasTarget)
      .map((dept) => {
      const members = dept.members.filter((m) => visibleIds.has(m.row.subject.id));
      members.forEach((m) => assigned.add(m.row.subject.id));
      return {
        name: dept.row.subject.name,
        source: dept.source,
        memberCount: dept.memberCount,
        problemCount: dept.problemCount,
        completionPct: dept.completionPct,
        previousPct: dept.previousPct,
        status: dept.status,
        metrics: dept.metrics,
        note: dept.row.note?.trim() || null,
        members: members.map(toPrintPerson),
      };
    });
    printOrWarn(targetPerformancePrintDoc({
      period,
      filter,
      departmentFilterName: departmentFilter === ALL ? null : departments.find((d) => d.row.subject.id === departmentFilter)?.row.subject.name ?? null,
      expectedPct,
      averagePct,
      previousAveragePct,
      targetedPeople: targetedPeople.length,
      completedCount,
      riskCount,
      missedCount,
      currencyNormalization,
      departments: printDepartments,
      unassigned: visiblePeople.filter((p) => !assigned.has(p.row.subject.id)).map(toPrintPerson),
      preparedBy: user?.fullName ?? null,
      assetBase: printAssetBase(),
    }));
  };

  return (
    <div className="crm-page">
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 bg-muted/15 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Target className="size-5 text-primary" /> Otomatik Hedef Takibi</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Fatura, teklif, sipariş, tahsilat, ziyaret, arama, servis ve kurulum kayıtlarından anlık hesaplanır.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportExcelButton
              path="/reports/export/target-progress"
              filename={`hedef-gerceklesme-${period}.xlsx`}
              params={{ period }}
              label="Excel Raporu"
              disabled={loading || refreshing || Boolean(error)}
              className="h-9 bg-white"
            />
            {hasPermission("reports.export") && (
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 bg-white" onClick={handlePrintReport} disabled={loading || refreshing || Boolean(error)}>
                <Printer className="size-4" /> Yazdır / PDF
              </Button>
            )}
            <div className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-2.5 text-[11px] text-muted-foreground">
              <span className={`size-2 rounded-full ${refreshing ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`} />
              {refreshing ? "Kayıtlar taranıyor" : lastUpdatedAt ? `${lastUpdatedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} güncel` : "Canlı takip"}
            </div>
            <Button type="button" variant="outline" size="icon" className="size-9 bg-white" onClick={() => setRefreshKey((value) => value + 1)} disabled={refreshing} aria-label="Hedef verilerini yenile">
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value || period)}
              className="h-9 w-[150px] bg-white"
            />
            {departments.length > 0 && (
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="h-9 w-[180px] bg-white" aria-label="Departman"><SelectValue placeholder="Departman" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tüm departmanlar</SelectItem>
                  {departments.map((dept) => <SelectItem key={dept.row.subject.id} value={dept.row.subject.id}>{dept.row.subject.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="inline-flex rounded-md border border-border bg-white p-0.5">
              <button type="button" onClick={() => setFilter("problems")} className={`rounded px-3 py-1.5 text-xs ${filter === "problems" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Eksik / Riskli</button>
              <button type="button" onClick={() => setFilter("all")} className={`rounded px-3 py-1.5 text-xs ${filter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Tümü</button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {currencyNormalization && (
            <div className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${currencyNormalization.unsupportedCurrencies.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-100 bg-sky-50/70 text-sky-900"}`}>
              <span>
                Parasal gerçekleşmeler USD’ye çevrildi · {currencyNormalization.source === "period_average" ? "Dönem ortalama kuru" : currencyNormalization.live ? "Güncel kur" : "Yedek kur"} · {currencyNormalization.rateDate}
              </span>
              {currencyNormalization.unsupportedCurrencies.length > 0 && (
                <span className="font-medium">Dönüştürülemeyen: {currencyNormalization.unsupportedCurrencies.join(", ")}</span>
              )}
            </div>
          )}
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Program kayıtları taranıyor…</div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">{error}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <KpiCard label="Hedef Atanan Kişi" value={String(targetedPeople.length)} accent="bg-primary/10 text-primary" />
                <KpiCard label="Tamamlanan" value={String(completedCount)} accent="bg-emerald-50 text-emerald-700" />
                <KpiCard label="Riskte" value={String(riskCount)} accent="bg-amber-50 text-amber-800" />
                <KpiCard label="Tamamlanmadı" value={String(missedCount)} accent="bg-red-50 text-red-700" />
                <KpiCard label="Ortalama Gerçekleşme" value={averagePct == null ? "—" : `%${averagePct}`} sub={previousAveragePct != null ? `geçen ay %${previousAveragePct}` : undefined} accent="bg-indigo-50 text-indigo-700" />
              </div>

              <div className="rounded-lg border border-border/60 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <div className="font-medium">Dönem nabzı</div>
                    <div className="text-xs text-muted-foreground">Bugün itibarıyla beklenen tempo ile ekip ortalaması</div>
                  </div>
                  <div className="flex items-center gap-4 text-xs tabular-nums">
                    <span>Beklenen <b>%{expectedPct}</b></span>
                    <span>Gerçekleşen <b>{averagePct == null ? "—" : `%${averagePct}`}</b></span>
                  </div>
                </div>
                <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${averagePct != null && averagePct + 10 < expectedPct ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(100, Math.max(0, averagePct ?? 0))}%` }} />
                  <span className="absolute inset-y-0 w-0.5 bg-slate-900/60" style={{ left: `${Math.min(99, Math.max(0, expectedPct))}%` }} />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!loading && !error && (
        <>
          <Card className="overflow-hidden border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm"><Building2 className="size-4 text-primary" /> Departman Bazlı Durum</CardTitle>
              <Badge variant="secondary">{visibleDepartments.length} departman</Badge>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-muted/30"><TableHead>Departman</TableHead><TableHead>Kaynak</TableHead><TableHead>Üye</TableHead><TableHead>Eksik / Riskli</TableHead><TableHead>Ölçütler</TableHead><TableHead>İlerleme</TableHead><TableHead>Durum</TableHead></TableRow></TableHeader>
                <TableBody>
                  {visibleDepartments.map((item) => (
                    <TableRow key={item.row.subject.id}>
                      <TableCell className="font-medium">{item.row.subject.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.source}</TableCell>
                      <TableCell className="tabular-nums">{item.memberCount}</TableCell>
                      <TableCell className={`tabular-nums ${item.problemCount ? "font-semibold text-red-700" : "text-muted-foreground"}`}>{item.problemCount}</TableCell>
                      <TableCell><MetricLines lines={item.metrics} /></TableCell>
                      <TableCell><TargetProgressCell value={item.completionPct} expected={expectedPct} previous={item.previousPct} /></TableCell>
                      <TableCell><TargetStatusBadge status={item.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="overflow-hidden border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm"><UserRound className="size-4 text-primary" /> Kişi Bazlı Durum</CardTitle>
              <Badge variant={visiblePeople.length ? "secondary" : "outline"}>{visiblePeople.length} kayıt</Badge>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-muted/30"><TableHead>#</TableHead><TableHead>Kullanıcı</TableHead><TableHead>Departman</TableHead><TableHead>İlerleme</TableHead><TableHead>Ölçütler</TableHead><TableHead>Manuel</TableHead><TableHead>Durum</TableHead></TableRow></TableHeader>
                <TableBody>
                  {visiblePeople.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Bu filtrede eksik veya riskli hedef bulunmuyor.</TableCell></TableRow>
                  ) : visiblePeople.map(({ row, analysis, previousPct, rank }) => (
                    <TableRow key={row.subject.id}>
                      <TableCell className="tabular-nums text-muted-foreground">{rank ?? "—"}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.subject.name}</div>
                        {row.note?.trim() && <div className="mt-0.5 max-w-[260px] text-xs text-amber-800">{row.note.trim()}</div>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.subject.departmentNames?.length ? row.subject.departmentNames.join(", ") : row.subject.departmentName || "—"}
                      </TableCell>
                      <TableCell><TargetProgressCell value={analysis.completionPct} expected={expectedPct} previous={previousPct} /></TableCell>
                      <TableCell><MetricLines lines={analysis.metrics} expected={expectedPct} /></TableCell>
                      <TableCell>
                        {analysis.manual.length ? (
                          <div className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">{analysis.manual.map((m) => `${m.label}: ${m.target}`).join(" · ")}</div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><TargetStatusBadge status={analysis.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricLines({ lines, expected = 0 }: { lines: MetricLine[]; expected?: number }) {
  if (!lines.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <ul className="max-w-[300px] space-y-0.5 text-xs leading-relaxed">
      {lines.map((line, index) => (
        <li key={`${line.label}-${index}`}>
          <span className={`font-medium ${line.pct >= 100 ? "text-emerald-700" : line.pct + 10 < expected ? "text-red-700" : ""}`}>{line.label}</span>{" "}
          <span className="tabular-nums text-muted-foreground">{metricLineText(line)}</span>
        </li>
      ))}
    </ul>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-1.5 inline-flex px-2 py-0.5 rounded ${accent}`}>{value}</div>
        {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
