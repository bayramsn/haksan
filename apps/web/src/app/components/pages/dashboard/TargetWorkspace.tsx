import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarRange,
  CheckCircle2,
  Download,
  Layers3,
  PenLine,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { adminService, reportService } from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";
import { exportToCsv } from "../../../../lib/exportCsv";
import { printOrWarn } from "../../../lib/pageHelpers";
import { esc, haksanHeader, printAssetBase, type PrintDocument } from "../../../lib/print";
import {
  TargetDialog,
  currentPeriod,
  targetFromApi,
  targetToApi,
  type TargetScope,
  type UserTarget,
} from "../../admin/TargetDialog";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Progress } from "../../ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { cn } from "../../ui/utils";

type ScopeKind = "user" | "department" | "division";

type DirectoryRow = {
  id: string;
  name: string;
  subtitle?: string;
};

type TargetMetric = {
  target: number | null;
  actual: number | null;
  pct: number | null;
  status?: TargetStatus;
};

type TargetItem = {
  targetType?: string;
  category?: string;
  activity?: string;
  description?: string;
  unit?: "count" | "amount" | string;
  target?: string | number | null;
  actual?: number | null;
  pct?: number | null;
  metricKey?: string | null;
  trackingMode?: "automatic" | "manual" | string;
};

type TargetSubject = {
  subject: { kind: ScopeKind; id: string; name: string; departmentName?: string | null; departmentNames?: string[] };
  hasTarget: boolean;
  note?: string | null;
  metrics?: Record<string, TargetMetric>;
  targetItems?: TargetItem[];
};

type TargetStatus =
  | "achieved"
  | "on_track"
  | "at_risk"
  | "missed"
  | "scheduled"
  | "manual"
  | "not_configured";

type ReportLine = {
  id: string;
  label: string;
  category: string;
  unit: "count" | "amount" | string;
  target: number;
  actual: number | null;
  pct: number | null;
  status: TargetStatus;
  trackingMode: "automatic" | "manual";
  detail?: string;
};

type PeriodResult = {
  period: string;
  expectedPct: number;
  subject: TargetSubject | null;
  lines: ReportLine[];
  averagePct: number | null;
  achievedCount: number;
  riskCount: number;
  manualCount: number;
};

const SCOPE_META: Record<ScopeKind, { label: string; plural: string; icon: typeof Users }> = {
  user: { label: "Kişi", plural: "Kullanıcılar", icon: Users },
  department: { label: "Departman", plural: "Departmanlar", icon: Building2 },
  division: { label: "Bölüm", plural: "Bölümler", icon: Layers3 },
};

const METRIC_LABELS: Record<string, string> = {
  salesAmount: "Satış cirosu",
  salesNewCustomers: "Yeni müşteri",
  quoteTarget: "Teklif",
  visitTarget: "Ziyaret",
  callTarget: "Arama",
  serviceCompleted: "Tamamlanan servis",
  serviceAmount: "Servis cirosu",
  digitalLeadTarget: "Dijital fırsat",
  digitalConversionTarget: "Dijital dönüşüm",
  digitalBudget: "Dijital bütçe",
  paymentsInAmount: "Tahsilat",
  purchaseInvoiceAmount: "Alış faturası",
  purchaseOrderAmount: "Satınalma tutarı",
  purchaseOrderCount: "Satınalma siparişi",
  salesOrderAmount: "Satış siparişi tutarı",
  salesOrderCount: "Satış siparişi",
  installationCompleted: "Kurulum",
};

const STATUS_META: Record<TargetStatus, { label: string; className: string }> = {
  achieved: { label: "Tamamlandı", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  on_track: { label: "Yolunda", className: "border-sky-200 bg-sky-50 text-sky-700" },
  at_risk: { label: "Riskte", className: "border-amber-200 bg-amber-50 text-amber-800" },
  missed: { label: "Tamamlanmadı", className: "border-red-200 bg-red-50 text-red-700" },
  scheduled: { label: "Planlandı", className: "border-slate-200 bg-slate-50 text-slate-700" },
  manual: { label: "Manuel takip", className: "border-violet-200 bg-violet-50 text-violet-700" },
  not_configured: { label: "Hedef yok", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

const amountMetricKeys = new Set([
  "salesAmount",
  "serviceAmount",
  "digitalBudget",
  "paymentsInAmount",
  "purchaseInvoiceAmount",
  "purchaseOrderAmount",
  "salesOrderAmount",
]);

const parseTargetNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const compact = String(value).trim().replace(/\s/g, "");
  const normalized = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(compact)
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const shiftMonth = (period: string, delta: number) => {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const monthRange = (from: string, to: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(from) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(to) || from > to) {
    throw new Error("Başlangıç dönemi bitiş döneminden sonra olamaz.");
  }
  const periods: string[] = [];
  let cursor = from;
  while (cursor <= to && periods.length < 18) {
    periods.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  if (cursor <= to) throw new Error("Tek raporda en fazla 18 aylık dönem seçilebilir.");
  return periods;
};

const periodLabel = (period: string) => {
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { month: "short", year: "numeric" }).format(new Date(year, month - 1, 1));
};

const targetStatus = (
  period: string,
  pct: number | null,
  expectedPct: number,
  manual: boolean,
): TargetStatus => {
  if (manual || pct == null) return "manual";
  if (pct >= 100) return "achieved";
  const current = currentPeriod();
  if (period < current) return "missed";
  if (period > current) return "scheduled";
  return pct + 10 < expectedPct ? "at_risk" : "on_track";
};

/**
 * Aynı otomatik metriğe bağlı alt hedefleri tek sayaçta birleştirir. Backend şu
 * anda örneğin bütün ziyaret satırlarına aynı toplam ziyareti verdiği için,
 * satırları ayrı ayrı ortalamaya katmak performansı yapay olarak yükseltirdi.
 */
export const reportLines = (subject: TargetSubject | null, period: string, expectedPct: number): ReportLine[] => {
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
      category: "Ana metrik",
      unit: amountMetricKeys.has(metricKey) ? "amount" : "count",
      target: metric.target,
      actual: metric.actual,
      pct: metric.pct,
      status: metric.status ?? targetStatus(period, metric.pct, expectedPct, manual),
      trackingMode: manual ? "manual" : "automatic",
    });
  }

  const automaticGroups = new Map<string, { rows: TargetItem[]; target: number; actual: number | null }>();
  const manualRows: TargetItem[] = [];
  for (const item of subject.targetItems ?? []) {
    const target = parseTargetNumber(item.target);
    if (target == null || target <= 0) continue;
    const automatic = item.trackingMode === "automatic" && Boolean(item.metricKey);
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
    const first = group.rows[0];
    lines.push({
      id: `item-group:${metricKey}`,
      label: group.rows.length > 1 ? `${METRIC_LABELS[metricKey] ?? first.activity ?? metricKey} · ${group.rows.length} alt kalem` : first.activity ?? METRIC_LABELS[metricKey] ?? metricKey,
      category: first.category ?? "Özel hedef",
      unit: first.unit ?? (amountMetricKeys.has(metricKey) ? "amount" : "count"),
      target: group.target,
      actual: group.actual,
      pct,
      status: targetStatus(period, pct, expectedPct, false),
      trackingMode: "automatic",
      detail: group.rows.length > 1 ? "Alt kalemler aynı sistem sayacını kullandığı için tek hedef olarak değerlendirilir." : first.description,
    });
  }

  for (const item of manualRows) {
    const target = parseTargetNumber(item.target);
    if (target == null || target <= 0) continue;
    lines.push({
      id: `manual:${item.targetType ?? "other"}:${item.category ?? ""}:${item.activity ?? lines.length}`,
      label: item.activity ?? "Manuel hedef",
      category: item.category ?? "Özel hedef",
      unit: item.unit ?? "count",
      target,
      actual: null,
      pct: null,
      status: "manual",
      trackingMode: "manual",
      detail: item.description,
    });
  }

  return lines;
};

export const buildPeriodResult = (period: string, response: any): PeriodResult => {
  const expectedPct = Number(response?.expectedProgressPct ?? 0);
  const subject = (Array.isArray(response?.subjects) ? response.subjects[0] : null) as TargetSubject | null;
  const lines = reportLines(subject, period, expectedPct);
  const measurable = lines.filter((line) => line.pct != null);
  const averagePct = measurable.length
    ? Math.round(measurable.reduce((sum, line) => sum + Math.min(100, Math.max(0, line.pct ?? 0)), 0) / measurable.length)
    : null;
  return {
    period,
    expectedPct,
    subject,
    lines,
    averagePct,
    achievedCount: lines.filter((line) => line.status === "achieved").length,
    riskCount: lines.filter((line) => line.status === "at_risk" || line.status === "missed").length,
    manualCount: lines.filter((line) => line.status === "manual").length,
  };
};

const formatValue = (value: number | null, unit: string) => {
  if (value == null) return "—";
  const shown = value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  return unit === "amount" ? `${shown} USD` : `${shown} adet`;
};

const targetReportDocument = (input: {
  scopeLabel: string;
  subjectName: string;
  from: string;
  to: string;
  results: PeriodResult[];
}): PrintDocument => {
  const rows = input.results.flatMap((result) => result.lines.map((line) => `
    <tr>
      <td>${esc(periodLabel(result.period))}</td>
      <td><b>${esc(line.label)}</b><br><small>${esc(line.category)}</small></td>
      <td>${line.trackingMode === "automatic" ? "Otomatik" : "Manuel"}</td>
      <td class="num">${esc(formatValue(line.target, line.unit))}</td>
      <td class="num">${esc(formatValue(line.actual, line.unit))}</td>
      <td class="num">${line.pct == null ? "—" : `%${line.pct}`}</td>
      <td>${esc(STATUS_META[line.status].label)}</td>
    </tr>`)).join("");
  const measurable = input.results.filter((result) => result.averagePct != null);
  const average = measurable.length
    ? Math.round(measurable.reduce((sum, result) => sum + (result.averagePct ?? 0), 0) / measurable.length)
    : null;
  return {
    title: `Hedef Raporu · ${input.subjectName}`,
    css: `
      .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #000c69;padding-bottom:4mm;margin-bottom:5mm}
      .eyebrow{font-size:8pt;font-weight:700;letter-spacing:1px;color:#000c69;text-transform:uppercase}h1{font-size:18pt;margin:1mm 0 0}.meta{text-align:right;font-size:8pt;color:#475569}
      .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin:0 0 5mm}.summary>div{border:1px solid #dbe1eb;border-top:2px solid #000c69;padding:3mm}.summary small{color:#64748b}.summary b{display:block;font-size:15pt;margin-top:1mm}
      table{width:100%;border-collapse:collapse;font-size:7.5pt}th{background:#000c69;color:white;text-align:left;padding:2mm}td{border:1px solid #dbe1eb;padding:1.8mm;vertical-align:top}tr:nth-child(even){background:#f8fafc}.num{text-align:right;font-variant-numeric:tabular-nums}small{color:#64748b}
    `,
    body: `<main class="page">${haksanHeader(printAssetBase())}
      <div class="head"><div><div class="eyebrow">Hedef Kontrol Merkezi</div><h1>Hedef Gerçekleşme Raporu</h1></div><div class="meta"><b>${esc(input.subjectName)}</b><br>${esc(input.scopeLabel)}<br>${esc(periodLabel(input.from))} — ${esc(periodLabel(input.to))}</div></div>
      <section class="summary"><div><small>Dönem</small><b>${input.results.length}</b></div><div><small>Ortalama</small><b>${average == null ? "—" : `%${average}`}</b></div><div><small>Tamamlanan</small><b>${input.results.reduce((sum, row) => sum + row.achievedCount, 0)}</b></div><div><small>Riskli</small><b>${input.results.reduce((sum, row) => sum + row.riskCount, 0)}</b></div></section>
      ${rows ? `<table><thead><tr><th>Dönem</th><th>Hedef</th><th>Takip</th><th>Hedef değer</th><th>Gerçekleşen</th><th>İlerleme</th><th>Durum</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>Seçili aralıkta hedef bulunamadı.</p>"}
    </main>`,
  };
};

type TeamRow = {
  id: string;
  name: string;
  department: string | null;
  averagePct: number | null;
  /** Ay içi beklenen tempo ile fark; eksi değer "geride" demek. */
  pace: number | null;
  achievedCount: number;
  riskCount: number;
  lineCount: number;
};
type TeamSort = "pace" | "name" | "progress";

/** Tempo rozeti: ölçülemeyen satır "hedef yok" der, sayı yerine yön gösterir. */
export const paceMeta = (pace: number | null) => {
  if (pace == null) return { label: "Hedef yok", className: STATUS_META.not_configured.className };
  if (pace >= 0) return { label: `+${pace} puan`, className: STATUS_META.on_track.className };
  if (pace >= -15) return { label: `${pace} puan`, className: STATUS_META.at_risk.className };
  return { label: `${pace} puan`, className: STATUS_META.missed.className };
};

/** Tek çağrılık `all-users` yanıtını karne satırlarına indirger. */
export const buildTeamRows = (response: any): TeamRow[] => {
  const expectedPct = Number(response?.expectedProgressPct ?? 0);
  const subjects = (Array.isArray(response?.subjects) ? response.subjects : []) as TargetSubject[];
  return subjects.map((subject) => {
    const lines = reportLines(subject, String(response?.period ?? ""), expectedPct);
    const measurable = lines.filter((line) => line.pct != null);
    const averagePct = measurable.length
      ? Math.round(measurable.reduce((sum, line) => sum + Math.min(100, Math.max(0, line.pct ?? 0)), 0) / measurable.length)
      : null;
    return {
      id: subject.subject.id,
      name: subject.subject.name,
      department: subject.subject.departmentNames?.[0] ?? subject.subject.departmentName ?? null,
      averagePct,
      pace: averagePct == null ? null : averagePct - expectedPct,
      achievedCount: lines.filter((line) => line.status === "achieved").length,
      riskCount: lines.filter((line) => line.status === "at_risk" || line.status === "missed").length,
      lineCount: lines.length,
    };
  });
};

/** Hedefi olmayan ve ölçülemeyen satırlar her sıralamada en sona düşer. */
export const sortTeamRows = (rows: TeamRow[], sort: TeamSort): TeamRow[] =>
  [...rows].sort((left, right) => {
    if (sort === "name") return left.name.localeCompare(right.name, "tr-TR");
    const leftValue = sort === "pace" ? left.pace : left.averagePct;
    const rightValue = sort === "pace" ? right.pace : right.averagePct;
    if (leftValue == null && rightValue == null) return left.name.localeCompare(right.name, "tr-TR");
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    return leftValue - rightValue;
  });

export function TargetWorkspace() {
  const { user, hasRole } = useAuth();
  const canManageTargets = hasRole("super_admin") || hasRole("admin");
  const nowPeriod = currentPeriod();
  const [scopeKind, setScopeKind] = useState<ScopeKind>("user");
  const [subjectId, setSubjectId] = useState(user?.id ?? "");
  const [fromPeriod, setFromPeriod] = useState(() => shiftMonth(nowPeriod, -2));
  const [toPeriod, setToPeriod] = useState(nowPeriod);
  const [directories, setDirectories] = useState<Record<ScopeKind, DirectoryRow[]>>({ user: [], department: [], division: [] });
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [results, setResults] = useState<PeriodResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [targetScope, setTargetScope] = useState<TargetScope | null>(null);
  const [editingTarget, setEditingTarget] = useState<UserTarget | undefined>();
  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamSort, setTeamSort] = useState<TeamSort>("pace");

  useEffect(() => {
    if (!user?.id) return;
    if (!canManageTargets) {
      setDirectories((current) => ({
        ...current,
        user: [{ id: user.id, name: user.fullName ?? user.email ?? "Hedeflerim", subtitle: "Kendi hedeflerim" }],
      }));
      setSubjectId(user.id);
      return;
    }
    let alive = true;
    setDirectoryLoading(true);
    Promise.all([adminService.users(), adminService.departments(), adminService.divisions()])
      .then(([users, departments, divisions]) => {
        if (!alive) return;
        const userRows = users
          .filter((row: any) => row.status !== "passive" && !row.deletedAt)
          .map((row: any) => ({ id: row.id, name: row.fullName ?? row.email, subtitle: row.email }));
        const departmentRows = departments.map((row: any) => ({ id: row.id, name: row.name, subtitle: row.code }));
        const divisionRows = divisions.filter((row: any) => row.isActive !== false).map((row: any) => ({ id: row.id, name: row.name, subtitle: row.code }));
        setDirectories({ user: userRows, department: departmentRows, division: divisionRows });
        setSubjectId((current) => current || userRows[0]?.id || "");
      })
      .catch((reason: any) => setError(reason?.message ?? "Hedef kapsamları yüklenemedi."))
      .finally(() => alive && setDirectoryLoading(false));
    return () => { alive = false; };
  }, [canManageTargets, user?.email, user?.fullName, user?.id]);

  const scopeRows = directories[scopeKind];
  const selectedSubject = scopeRows.find((row) => row.id === subjectId) ?? null;

  useEffect(() => {
    if (!scopeRows.length) return;
    if (!scopeRows.some((row) => row.id === subjectId)) setSubjectId(scopeRows[0].id);
  }, [scopeRows, subjectId]);

  const loadReport = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    setError("");
    try {
      const periods = monthRange(fromPeriod, toPeriod);
      const responses = await Promise.all(periods.map((period) => {
        if (!canManageTargets && scopeKind === "user" && subjectId === user?.id) {
          return reportService.myTargetProgress({ period });
        }
        return reportService.targetProgress({ period, scope: scopeKind, id: subjectId });
      }));
      setResults(responses.map((response, index) => buildPeriodResult(periods[index], response)));
      setLastUpdatedAt(new Date());
    } catch (reason: any) {
      setResults([]);
      setError(reason?.message ?? "Hedef raporu oluşturulamadı.");
    } finally {
      setLoading(false);
    }
  }, [canManageTargets, fromPeriod, scopeKind, subjectId, toPeriod, user?.id]);

  useEffect(() => {
    if (subjectId) void loadReport();
  }, [loadReport, subjectId]);

  // Ekip karnesi tek istekle gelir (`all-users`), yalnız son dönem için:
  // "kim geride" sorusu ay bazlıdır, aralık ortalaması onu gizler.
  useEffect(() => {
    if (!canManageTargets) return;
    let alive = true;
    setTeamLoading(true);
    reportService
      .targetProgress({ period: toPeriod, scope: "all-users" })
      .then((response: any) => { if (alive) setTeamRows(buildTeamRows({ ...response, period: toPeriod })); })
      .catch(() => { if (alive) setTeamRows([]); })
      .finally(() => { if (alive) setTeamLoading(false); });
    return () => { alive = false; };
  }, [canManageTargets, toPeriod]);

  const latest = results[results.length - 1] ?? null;
  const measurablePeriods = results.filter((row) => row.averagePct != null);
  const overallAverage = measurablePeriods.length
    ? Math.round(measurablePeriods.reduce((sum, row) => sum + (row.averagePct ?? 0), 0) / measurablePeriods.length)
    : null;
  const totalAchieved = results.reduce((sum, row) => sum + row.achievedCount, 0);
  const totalRisk = results.reduce((sum, row) => sum + row.riskCount, 0);
  const totalManual = results.reduce((sum, row) => sum + row.manualCount, 0);
  const chartData = results.map((row) => ({ period: periodLabel(row.period), gerçekleşme: row.averagePct, beklenen: row.expectedPct }));

  const openTargetDialog = async () => {
    if (!selectedSubject || !canManageTargets) return;
    try {
      const rows = scopeKind === "user"
        ? await adminService.userTargets({ period: toPeriod })
        : scopeKind === "department"
          ? await adminService.departmentTargets({ period: toPeriod })
          : await adminService.divisionTargets({ period: toPeriod });
      const key = scopeKind === "user" ? "userId" : scopeKind === "department" ? "departmentId" : "divisionId";
      const row = rows.find((item: any) => item[key] === selectedSubject.id);
      setEditingTarget(row ? targetFromApi(row) : undefined);
      setTargetScope({ kind: scopeKind, id: selectedSubject.id, name: selectedSubject.name, subtitle: selectedSubject.subtitle });
    } catch (reason: any) {
      toast.error("Hedef bilgisi alınamadı", { description: reason?.message ?? "API isteği başarısız oldu." });
    }
  };

  const saveTarget = async (scope: TargetScope, target: UserTarget) => {
    const payload = targetToApi({ ...target, period: toPeriod });
    if (scope.kind === "user") await adminService.saveUserTarget(scope.id, payload);
    else if (scope.kind === "department") await adminService.saveDepartmentTarget(scope.id, payload);
    else if (scope.kind === "division") await adminService.saveDivisionTarget(scope.id, payload);
    else throw new Error("Bu çalışma alanında rol hedefi desteklenmiyor.");
    await loadReport();
  };

  const exportReport = () => {
    const rows = results.flatMap((result) => result.lines.map((line) => [
      result.period,
      selectedSubject?.name,
      SCOPE_META[scopeKind].label,
      line.category,
      line.label,
      line.trackingMode === "automatic" ? "Otomatik" : "Manuel",
      line.unit === "amount" ? "USD" : "adet",
      line.target,
      line.actual,
      line.pct,
      STATUS_META[line.status].label,
    ]));
    exportToCsv(
      `hedef-raporu-${scopeKind}-${fromPeriod}-${toPeriod}.csv`,
      ["Dönem", "Kapsam", "Kapsam Türü", "Kategori", "Hedef", "Takip", "Birim", "Hedef Değer", "Gerçekleşen", "Gerçekleşme %", "Durum"],
      rows,
    );
  };

  const printReport = () => {
    if (!selectedSubject) return;
    printOrWarn(targetReportDocument({
      scopeLabel: SCOPE_META[scopeKind].label,
      subjectName: selectedSubject.name,
      from: fromPeriod,
      to: toPeriod,
      results,
    }));
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-slate-800 bg-slate-950 text-white shadow-xl shadow-slate-950/10">
        <CardContent className="relative p-0">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(14,165,233,0.22),transparent_35%),linear-gradient(120deg,transparent_35%,rgba(255,255,255,0.035)_35%,rgba(255,255,255,0.035)_36%,transparent_36%)]" />
          <div className="relative grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
                <BarChart3 className="size-4" /> Hedef Kontrol Merkezi
              </div>
              <h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">Atamadan gerçekleşmeye, tek ekranda net performans resmi.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">Kişi, departman veya bölüm seçin; dönemler arasında ilerlemeyi karşılaştırın ve yönetim raporunu doğrudan hazırlayın.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"><Zap className="size-3.5 text-emerald-300" /> Otomatik sistem sayaçları</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"><PenLine className="size-3.5 text-violet-300" /> Manuel hedef ayrımı</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/15 pb-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Search className="size-4 text-primary" /> Rapor kapsamı ve dönem</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">En fazla 18 aylık karşılaştırmalı rapor oluşturabilirsiniz.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={exportReport} disabled={!results.some((row) => row.lines.length)}><Download className="size-4" /> CSV / Excel</Button>
              <Button variant="outline" size="sm" onClick={printReport} disabled={!results.some((row) => row.lines.length)}><Printer className="size-4" /> Yazdır / PDF</Button>
              {canManageTargets && <Button size="sm" onClick={openTargetDialog} disabled={!selectedSubject}><Settings2 className="size-4" /> Hedef ata / düzenle</Button>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {canManageTargets && (
            <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-muted/30 p-1">
              {(Object.keys(SCOPE_META) as ScopeKind[]).map((kind) => {
                const Icon = SCOPE_META[kind].icon;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setScopeKind(kind)}
                    className={cn("inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-medium transition", scopeKind === kind ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/60")}
                  >
                    <Icon className="size-4" /> {SCOPE_META[kind].plural}
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_180px_180px_auto]">
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">{SCOPE_META[scopeKind].label}</div>
              <Select value={subjectId} onValueChange={setSubjectId} disabled={directoryLoading || !scopeRows.length}>
                <SelectTrigger><SelectValue placeholder={directoryLoading ? "Kapsamlar yükleniyor…" : `${SCOPE_META[scopeKind].label} seçin`} /></SelectTrigger>
                <SelectContent>
                  {scopeRows.map((row) => <SelectItem key={row.id} value={row.id}>{row.name}{row.subtitle ? ` · ${row.subtitle}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Başlangıç</div>
              <Input type="month" value={fromPeriod} onChange={(event) => setFromPeriod(event.target.value || fromPeriod)} />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Bitiş / atama dönemi</div>
              <Input type="month" value={toPeriod} onChange={(event) => setToPeriod(event.target.value || toPeriod)} />
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={() => void loadReport()} disabled={loading || !subjectId}>
                {loading ? <RefreshCw className="size-4 animate-spin" /> : <TrendingUp className="size-4" />}
                {loading ? "Hesaplanıyor…" : "Rapor oluştur"}
              </Button>
            </div>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Seçili kapsam" value={selectedSubject?.name ?? "—"} detail={SCOPE_META[scopeKind].label} icon={SCOPE_META[scopeKind].icon} />
        <SummaryCard label="Ortalama gerçekleşme" value={overallAverage == null ? "—" : `%${overallAverage}`} detail={`${results.length} dönem`} icon={TrendingUp} tone="blue" />
        <SummaryCard label="Tamamlanan" value={String(totalAchieved)} detail="hedef kalemi" icon={CheckCircle2} tone="success" />
        <SummaryCard label="Yakın takip" value={String(totalRisk)} detail="riskli / eksik" icon={AlertTriangle} tone="warning" />
        <SummaryCard label="Manuel takip" value={String(totalManual)} detail="kanıt bekleyen" icon={PenLine} tone="violet" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,.75fr)]">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
            <div><CardTitle className="text-base">Dönemsel performans eğrisi</CardTitle><p className="mt-1 text-xs text-muted-foreground">Gerçekleşme ile ay içi beklenen tempo karşılaştırması</p></div>
            {lastUpdatedAt && <span className="text-[11px] text-muted-foreground">{lastUpdatedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} güncel</span>}
          </CardHeader>
          <CardContent className="h-72 pt-4">
            {loading ? <div className="grid h-full place-items-center text-sm text-muted-foreground"><RefreshCw className="mb-2 size-5 animate-spin" />Hedef kayıtları taranıyor</div> : chartData.some((row) => row.gerçekleşme != null) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 14, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="period" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} formatter={(value: number) => `%${value}`} />
                  <Line type="monotone" dataKey="gerçekleşme" name="Gerçekleşme" stroke="var(--brand-blue)" strokeWidth={3} dot={{ r: 4 }} connectNulls />
                  <Line type="monotone" dataKey="beklenen" name="Beklenen tempo" stroke="var(--warning)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyReport />}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 pb-3"><CardTitle className="text-base">Dönem özeti</CardTitle><p className="mt-1 text-xs text-muted-foreground">Her ayın ölçülebilir hedef ortalaması</p></CardHeader>
          <CardContent className="max-h-72 space-y-2 overflow-y-auto pt-4">
            {results.length ? results.map((row) => (
              <div key={row.period} className="rounded-lg border border-border/60 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{periodLabel(row.period)}</span><span className="text-sm font-semibold tabular-nums">{row.averagePct == null ? "—" : `%${row.averagePct}`}</span></div>
                <Progress value={Math.min(100, row.averagePct ?? 0)} className="mt-2 h-1.5" />
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground"><span>{row.lines.length} hedef</span><span>·</span><span>{row.achievedCount} tamam</span><span>·</span><span>{row.riskCount} riskli</span><span>·</span><span>{row.manualCount} manuel</span></div>
              </div>
            )) : <EmptyReport />}
          </CardContent>
        </Card>
      </div>

      {canManageTargets && (
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="flex flex-col gap-2 border-b border-border/60 bg-muted/15 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Users className="size-4 text-primary" /> Ekip karnesi · {periodLabel(toPeriod)}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Tempo, gerçekleşme ile ayın geçen kısmı arasındaki fark. Satıra tıklayınca o kişinin detayı açılır.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([["pace", "Tempo"], ["progress", "Gerçekleşme"], ["name", "İsim"]] as [TeamSort, string][]).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={teamSort === value ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setTeamSort(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {teamLoading ? (
              <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" /> Ekip karnesi hazırlanıyor</div>
            ) : teamRows.length ? (
              <div className="divide-y divide-border/60">
                {sortTeamRows(teamRows, teamSort).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4"
                    onClick={() => { setScopeKind("user"); setSubjectId(row.id); }}
                  >
                    <div className="min-w-0 sm:w-56">
                      <div className="truncate text-sm font-medium">{row.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{row.department ?? "Departman atanmamış"}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Progress value={Math.min(100, row.averagePct ?? 0)} className="h-1.5" />
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>{row.lineCount} hedef</span><span>·</span><span>{row.achievedCount} tamam</span>
                        {row.riskCount > 0 && <><span>·</span><span className="text-amber-700">{row.riskCount} riskli</span></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:w-44 sm:justify-end">
                      <span className="text-sm font-semibold tabular-nums">{row.averagePct == null ? "—" : `%${row.averagePct}`}</span>
                      <Badge variant="outline" className={paceMeta(row.pace).className}>{paceMeta(row.pace).label}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            ) : <div className="p-5"><EmptyReport /></div>}
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="flex flex-col gap-2 border-b border-border/60 bg-muted/15 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="flex items-center gap-2 text-base"><CalendarRange className="size-4 text-primary" /> {latest ? `${periodLabel(latest.period)} hedef detayları` : "Hedef detayları"}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Otomatik kalemler sistem kayıtlarından hesaplanır; manuel kalemler açıkça ayrılır.</p></div>
          {latest?.subject?.note && <Badge variant="outline" className="max-w-full whitespace-normal text-left">Not: {latest.subject.note}</Badge>}
        </CardHeader>
        <CardContent className="p-0">
          {latest?.lines.length ? (
            <div className="divide-y divide-border/60">
              {latest.lines.map((line) => <TargetDetailRow key={line.id} line={line} />)}
            </div>
          ) : <div className="p-5"><EmptyReport /></div>}
        </CardContent>
      </Card>

      <TargetDialog
        scope={targetScope}
        target={editingTarget}
        period={toPeriod}
        onClose={() => { setTargetScope(null); setEditingTarget(undefined); }}
        onSave={saveTarget}
      />
    </div>
  );
}

function SummaryCard({ label, value, detail, icon: Icon, tone = "default" }: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
  tone?: "default" | "blue" | "success" | "warning" | "violet";
}) {
  const tones = {
    default: "bg-slate-100 text-slate-700",
    blue: "bg-sky-50 text-sky-700",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-800",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <Card className="border-border/70 shadow-sm"><CardContent className="flex items-center gap-3 p-4"><div className={cn("grid size-10 shrink-0 place-items-center rounded-lg", tones[tone])}><Icon className="size-5" /></div><div className="min-w-0"><div className="truncate text-xs text-muted-foreground">{label}</div><div className="mt-0.5 truncate text-lg font-semibold tracking-tight">{value}</div><div className="text-[11px] text-muted-foreground">{detail}</div></div></CardContent></Card>
  );
}

function TargetDetailRow({ line }: { line: ReportLine }) {
  return (
    <div className="grid gap-3 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_140px_140px_170px] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{line.label}</span><Badge variant="outline" className={cn("text-[10px]", STATUS_META[line.status].className)}>{STATUS_META[line.status].label}</Badge>{line.trackingMode === "automatic" ? <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700"><Zap className="size-3" /> Otomatik</span> : <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-700"><PenLine className="size-3" /> Manuel</span>}</div>
        <div className="mt-1 text-xs text-muted-foreground">{line.category}{line.detail ? ` · ${line.detail}` : ""}</div>
        {line.pct != null && <Progress value={Math.min(100, Math.max(0, line.pct))} className="mt-2 h-1.5 max-w-xl" />}
      </div>
      <MetricCell label="Hedef" value={formatValue(line.target, line.unit)} />
      <MetricCell label="Gerçekleşen" value={formatValue(line.actual, line.unit)} />
      <MetricCell label="İlerleme" value={line.pct == null ? "Manuel değerlendirme" : `%${line.pct}`} strong />
    </div>
  );
}

function MetricCell({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2 lg:block lg:bg-transparent lg:px-0 lg:py-0"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span><div className={cn("mt-0.5 text-sm tabular-nums", strong && "font-semibold text-primary")}>{value}</div></div>;
}

function EmptyReport() {
  return <div className="grid min-h-28 place-items-center text-center text-sm text-muted-foreground"><div><Target className="mx-auto mb-2 size-6 opacity-40" /><div>Seçili kapsam ve dönemde ölçülebilir hedef bulunamadı.</div><div className="mt-1 text-xs">Hedef atayabilir veya farklı bir dönem seçebilirsiniz.</div></div></div>;
}
