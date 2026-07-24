import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { useStore } from "../../../lib/store";
import { buildManagementInsights, type ManagementInsight, type OperationAction } from "../../../lib/operations";
import { reportService, type YearEndReport } from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { formatCurrency, printOrWarn } from "../../../lib/pageHelpers";
import { esc, haksanHeader, printAssetBase, type PrintDocument } from "../../../lib/print";
import { ReportAnalyticsHub } from "../../reports/ReportAnalyticsHub";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { AlertTriangle, ArrowRight, Bookmark, Building2, CheckCircle2, Clock3, FileText, Printer, RefreshCw, Sparkles, Target, UserRound, XCircle } from "lucide-react";
import { toast } from "sonner";

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function ReportsPage({ onAction }: { onAction?: (action: OperationAction) => void }) {
  const store = useStore();
  const { cases, offers, service } = store;
  const [mode, setMode] = useState<"operasyonel" | "karlilik" | "hedefler" | "analitik">("operasyonel");
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const management = useMemo(() => buildManagementInsights(store), [store]);
  const [sourceId, setSourceId] = useState<string | null>(null);

  const now = new Date();
  const currentYear = now.getFullYear();
  const [year, setYear] = useState<number>(currentYear);

  const allYears = Array.from(
    new Set([
      ...cases.map((s) => Number(s.createdAt.slice(0, 4))),
      ...offers.map((o) => Number(o.date.slice(0, 4))),
      ...service.map((s) => Number(s.createdAt.slice(0, 4))),
      currentYear,
    ]),
  ).sort((a, b) => a - b);

  /* ---------- Monthly aggregates for the selected year ---------- */
  const monthly = TR_MONTHS.map((m, i) => {
    const inMonth = (d: string) => d.startsWith(`${year}-${String(i + 1).padStart(2, "0")}`);
    const monthCases = cases.filter((s) => inMonth(s.createdAt));
    const monthOffers = offers.filter((o) => inMonth(o.date));
    const monthService = service.filter((s) => inMonth(s.createdAt));
    const wonCases = monthCases.filter((s) => s.stage === "Completed" || s.stage === "delivered");
    return {
      name: m,
      teklif: monthOffers.length,
      onaylanan: monthOffers.filter((o) => o.status === "Approved").length,
      reddedilen: monthOffers.filter((o) => o.status === "Rejected").length,
      kazanilan: wonCases.length,
      kaybedilen: monthCases.filter((s) => s.isLost).length,
      servis: monthService.length,
      ciro: wonCases.reduce((a, s) => a + s.estimatedAmount, 0),
    };
  });

  /* ---------- Yearly aggregates ---------- */
  const yearly = allYears.map((y) => {
    const yc = cases.filter((s) => s.createdAt.startsWith(`${y}-`));
    const yo = offers.filter((o) => o.date.startsWith(`${y}-`));
    const ys = service.filter((s) => s.createdAt.startsWith(`${y}-`));
    const won = yc.filter((s) => s.stage === "Completed" || s.stage === "delivered");
    return {
      name: String(y),
      teklif: yo.length,
      onaylanan: yo.filter((o) => o.status === "Approved").length,
      reddedilen: yo.filter((o) => o.status === "Rejected").length,
      kazanilan: won.length,
      kaybedilen: yc.filter((s) => s.isLost).length,
      servis: ys.length,
      ciro: won.reduce((a, s) => a + s.estimatedAmount, 0),
    };
  });

  const chartData = period === "monthly" ? monthly : yearly;

  const totals = chartData.reduce(
    (acc, r) => ({
      teklif: acc.teklif + r.teklif,
      onaylanan: acc.onaylanan + r.onaylanan,
      reddedilen: acc.reddedilen + r.reddedilen,
      kazanilan: acc.kazanilan + r.kazanilan,
      kaybedilen: acc.kaybedilen + r.kaybedilen,
      servis: acc.servis + r.servis,
      ciro: acc.ciro + r.ciro,
    }),
    { teklif: 0, onaylanan: 0, reddedilen: 0, kazanilan: 0, kaybedilen: 0, servis: 0, ciro: 0 },
  );

  const conversion = totals.teklif > 0 ? Math.round((totals.onaylanan / totals.teklif) * 100) : 0;

  const reportCards: { title: string; keys: { dataKey: string; label: string; color: string }[] }[] = [
    {
      title: "Teklif Raporu",
      keys: [
        { dataKey: "teklif", label: "Toplam Teklif", color: "#000c69" },
        { dataKey: "onaylanan", label: "Onaylanan", color: "#10b981" },
        { dataKey: "reddedilen", label: "Reddedilen", color: "#ef4444" },
      ],
    },
    {
      title: "Satış Dönüşüm",
      keys: [
        { dataKey: "kazanilan", label: "Kazanılan", color: "#10b981" },
        { dataKey: "kaybedilen", label: "Kaybedilen", color: "#ef4444" },
      ],
    },
    {
      title: "Servis Raporu",
      keys: [{ dataKey: "servis", label: "Servis Talebi", color: "#3b82f6" }],
    },
    {
      title: "Ciro (Tahmini)",
      keys: [{ dataKey: "ciro", label: "USD", color: "#000c69" }],
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 border-border/60 bg-[linear-gradient(110deg,rgba(0,12,105,0.04),white_45%)] p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/5 text-primary"><Bookmark className="size-4" /></span>
          <div className="min-w-0">
            <div className="font-data text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">Kayıtlı rapor görünümleri</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Sık kullanılan yönetim kesitlerine tek tıkla geçin</div>
          </div>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-white p-1">
        <button
          onClick={() => setMode("operasyonel")}
          className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${mode === "operasyonel" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:bg-muted"}`}
        >
          Operasyonel
        </button>
        <button
          onClick={() => setMode("karlilik")}
          className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${mode === "karlilik" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:bg-muted"}`}
        >
          Karlılık (Yıl Sonu)
        </button>
        <button
          onClick={() => setMode("hedefler")}
          className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${mode === "hedefler" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:bg-muted"}`}
        >
          Hedef Takibi
        </button>
        <button
          onClick={() => setMode("analitik")}
          className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${mode === "analitik" ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:bg-muted"}`}
        >
          Analitik & Excel
        </button>
        </div>
      </Card>

      {mode !== "analitik" && mode !== "hedefler" && (
      <ReportExecutiveSummary
        summary={management}
        sourceId={sourceId}
        onSourceChange={setSourceId}
        onAction={onAction}
      />
      )}

      {mode === "karlilik" && <YearEndReportView />}

      {mode === "analitik" && <ReportAnalyticsHub />}

      {mode === "hedefler" && <TargetPerformanceReport />}

      {mode === "operasyonel" && (
      <>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-md border border-border bg-white p-0.5">
          <button
            onClick={() => setPeriod("monthly")}
            className={`px-3 py-1.5 text-sm rounded ${period === "monthly" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted"}`}
          >
            Aylık
          </button>
          <button
            onClick={() => setPeriod("yearly")}
            className={`px-3 py-1.5 text-sm rounded ${period === "yearly" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted"}`}
          >
            Yıllık
          </button>
        </div>

        {period === "monthly" && (
          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Yıl:</span>
            {allYears.map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`text-xs px-2 py-0.5 rounded ${year === y ? "bg-primary/10 text-primary" : "text-foreground/70 hover:bg-muted"}`}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />
        <ExportExcelButton
          path="/exports/operational"
          filename={period === "monthly" ? `rapor-${year}.xlsx` : "rapor-yillik.xlsx"}
          params={{ year, period }}
        />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Toplam Teklif" value={totals.teklif.toString()} accent="bg-primary/10 text-primary" />
        <KpiCard label="Onaylanan / Reddedilen" value={`${totals.onaylanan} / ${totals.reddedilen}`} accent="bg-emerald-50 text-emerald-700" />
        <KpiCard label="Dönüşüm Oranı" value={`%${conversion}`} accent="bg-indigo-50 text-indigo-700" />
        <KpiCard label="Toplam Ciro" value={`$ ${totals.ciro.toLocaleString()}`} accent="bg-amber-50 text-amber-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {reportCards.map((rc) => (
          <Card key={rc.title} className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{rc.title}</CardTitle>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                {period === "monthly" ? `${year}` : "Yıllık"}
              </span>
            </CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                  {rc.keys.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />}
                  {rc.keys.map((k) => (
                    <Bar key={k.dataKey} dataKey={k.dataKey} name={k.label} fill={k.color} barSize={18} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm">{period === "monthly" ? `${year} - Aylık Detay` : "Yıllık Detay"}</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>{period === "monthly" ? "Ay" : "Yıl"}</TableHead>
                <TableHead className="text-right">Teklif</TableHead>
                <TableHead className="text-right">Onaylanan</TableHead>
                <TableHead className="text-right">Reddedilen</TableHead>
                <TableHead className="text-right">Kazanılan</TableHead>
                <TableHead className="text-right">Kaybedilen</TableHead>
                <TableHead className="text-right">Servis</TableHead>
                <TableHead className="text-right">Ciro (USD)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chartData.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="text-sm">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.teklif}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{r.onaylanan}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-700">{r.reddedilen}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.kazanilan}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.kaybedilen}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.servis}</TableCell>
                  <TableCell className="text-right tabular-nums">$ {r.ciro.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/20">
                <TableCell className="text-sm">Toplam</TableCell>
                <TableCell className="text-right tabular-nums">{totals.teklif}</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-700">{totals.onaylanan}</TableCell>
                <TableCell className="text-right tabular-nums text-red-700">{totals.reddedilen}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.kazanilan}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.kaybedilen}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.servis}</TableCell>
                <TableCell className="text-right tabular-nums">$ {totals.ciro.toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
      </>
      )}
    </div>
  );
}

type TargetStatus = "completed" | "on_track" | "at_risk" | "missed" | "scheduled" | "manual" | "no_target";
type TargetSubjectRow = {
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
  metrics?: Record<string, { target: number | null; actual: number | null; pct: number | null }>;
  targetItems?: Array<{
    activity?: string;
    target?: string | number | null;
    actual?: number | null;
    pct?: number | null;
    metricKey?: string | null;
    trackingMode?: "automatic" | "manual";
  }>;
};

type CurrencyNormalization = {
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
};

const parseGoalNumber = (value: unknown) => {
  if (value == null || value === "") return null;
  const normalized = String(value).trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};

const statusForProgress = (completionPct: number, expectedPct: number, period: string): TargetStatus => {
  const current = new Date().toISOString().slice(0, 7);
  if (completionPct >= 100) return "completed";
  if (period < current) return "missed";
  if (period > current) return "scheduled";
  return completionPct + 10 < expectedPct ? "at_risk" : "on_track";
};

function analyzeTargetSubject(row: TargetSubjectRow, expectedPct: number, period: string) {
  const measured: Array<{ label: string; pct: number }> = [];
  const configuredMainMetrics = new Set<string>();
  for (const [key, metric] of Object.entries(row.metrics ?? {})) {
    if (metric.target != null && metric.target > 0 && metric.actual != null && metric.pct != null) {
      measured.push({ label: TARGET_METRIC_LABELS[key] ?? key, pct: metric.pct });
      configuredMainMetrics.add(key);
    }
  }
  const itemGroups = new Map<string, { label: string; target: number; actual: number }>();
  for (const item of row.targetItems ?? []) {
    const target = parseGoalNumber(item.target);
    if (item.trackingMode !== "automatic" || target == null || target <= 0 || item.actual == null) continue;
    if (item.metricKey && configuredMainMetrics.has(item.metricKey)) continue;
    const key = item.metricKey || item.activity || `item-${itemGroups.size}`;
    const existing = itemGroups.get(key);
    itemGroups.set(key, {
      label: item.activity || TARGET_METRIC_LABELS[item.metricKey ?? ""] || "Otomatik hedef",
      target: (existing?.target ?? 0) + target,
      // Aynı metrikte API toplam gerçekleşmeyi her satırda döndürür; tekrar toplamayız.
      actual: Math.max(existing?.actual ?? 0, item.actual),
    });
  }
  for (const item of itemGroups.values()) {
    measured.push({ label: item.label, pct: Math.round((item.actual / item.target) * 100) });
  }
  if (!row.hasTarget) return { status: "no_target" as TargetStatus, completionPct: null, unmet: [] as string[], measuredCount: 0 };
  if (measured.length === 0) return { status: "manual" as TargetStatus, completionPct: null, unmet: [] as string[], measuredCount: 0 };
  const completionPct = Math.round(measured.reduce((sum, item) => sum + Math.min(100, Math.max(0, item.pct)), 0) / measured.length);
  return {
    status: statusForProgress(completionPct, expectedPct, period),
    completionPct,
    unmet: measured.filter((item) => item.pct < 100).map((item) => item.label),
    measuredCount: measured.length,
  };
}

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

function TargetProgressCell({ value, expected }: { value: number | null; expected: number }) {
  if (value == null) return <span className="text-xs text-muted-foreground">Otomatik veri yok</span>;
  return (
    <div className="min-w-[150px]">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold tabular-nums">%{value}</span>
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

type TargetPrintDepartment = {
  name: string;
  source: string;
  memberCount: number;
  problemCount: number;
  completionPct: number | null;
  status: TargetStatus;
};

type TargetPrintPerson = {
  name: string;
  departments: string;
  completionPct: number | null;
  unmet: string[];
  status: TargetStatus;
};

const reportPct = (value: number | null) => value == null ? "—" : `%${value}`;

function targetPerformancePrintDoc(input: {
  period: string;
  filter: "problems" | "all";
  expectedPct: number;
  averagePct: number | null;
  targetedPeople: number;
  completedCount: number;
  riskCount: number;
  missedCount: number;
  departments: TargetPrintDepartment[];
  people: TargetPrintPerson[];
  currencyNormalization: CurrencyNormalization | null;
}): PrintDocument {
  const [year, month] = input.period.split("-").map(Number);
  const periodLabel = Number.isFinite(year) && Number.isFinite(month)
    ? new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1))
    : input.period;
  const generatedAt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const statusLabel = (status: TargetStatus) => TARGET_STATUS_META[status].label;
  const statusClass = (status: TargetStatus) =>
    status === "completed" ? "ok" : status === "at_risk" ? "risk" : status === "missed" ? "missed" : "neutral";
  const departmentRows = input.departments.map((row) => `
    <tr>
      <td><b>${esc(row.name)}</b></td>
      <td>${esc(row.source)}</td>
      <td class="num">${row.memberCount}</td>
      <td class="num">${row.problemCount}</td>
      <td class="num">${esc(reportPct(row.completionPct))}</td>
      <td><span class="status ${statusClass(row.status)}">${esc(statusLabel(row.status))}</span></td>
    </tr>`).join("");
  const peopleRows = input.people.map((row) => `
    <tr>
      <td><b>${esc(row.name)}</b></td>
      <td>${esc(row.departments || "—")}</td>
      <td class="num">${esc(reportPct(row.completionPct))}</td>
      <td>${esc(row.unmet.length ? row.unmet.join(", ") : "—")}</td>
      <td><span class="status ${statusClass(row.status)}">${esc(statusLabel(row.status))}</span></td>
    </tr>`).join("");
  const currencyNote = input.currencyNormalization
    ? `Parasal gerçekleşmeler ${input.currencyNormalization.base} bazında; kur tarihi ${input.currencyNormalization.rateDate}.`
    : "Parasal gerçekleşmeler USD bazında raporlanır.";

  return {
    title: `Hedef Gerçekleşme Raporu · ${periodLabel}`,
    css: `
      .target-report .letterhead { margin-bottom: 5mm; }
      .report-head { display:flex; align-items:flex-end; justify-content:space-between; gap:8mm; border-bottom:2px solid #000c69; padding-bottom:3mm; }
      .eyebrow { color:#000c69; font-size:8pt; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; }
      h1 { margin-top:1mm; font-size:18pt; line-height:1.1; }
      .meta { text-align:right; font-size:8.5pt; line-height:1.5; color:#4b5563; }
      .summary { display:grid; grid-template-columns:repeat(5,1fr); gap:2mm; margin:5mm 0; }
      .summary-item { border:1px solid #d9deea; border-top:2px solid #000c69; padding:2.5mm; min-height:18mm; }
      .summary-label { color:#64748b; font-size:7.5pt; line-height:1.25; }
      .summary-value { margin-top:2mm; color:#111827; font-size:15pt; font-weight:700; }
      .pulse { display:flex; justify-content:space-between; gap:5mm; margin-bottom:5mm; padding:2.5mm 3mm; background:#f4f6fb; border-left:3px solid #000c69; font-size:8.5pt; }
      h2 { margin:5mm 0 2mm; color:#000c69; font-size:11pt; }
      .report-table { width:100%; table-layout:fixed; font-size:7.5pt; }
      .report-table th { background:#000c69; color:#fff; padding:2mm 1.5mm; text-align:left; font-weight:700; }
      .report-table td { border:1px solid #d8dde8; padding:1.8mm 1.5mm; vertical-align:top; line-height:1.3; overflow-wrap:anywhere; }
      .report-table tbody tr:nth-child(even) { background:#f8fafc; }
      .num { text-align:right; font-variant-numeric:tabular-nums; }
      .status { display:inline-block; padding:.8mm 1.6mm; border-radius:8mm; border:1px solid #cbd5e1; white-space:nowrap; }
      .status.ok { border-color:#86cfa7; color:#12633a; background:#edf9f2; }
      .status.risk { border-color:#e7c168; color:#7a4b08; background:#fff8e5; }
      .status.missed { border-color:#e9a3a3; color:#9c2727; background:#fff0f0; }
      .status.neutral { color:#475569; background:#f8fafc; }
      .empty { border:1px solid #d8dde8; padding:4mm; text-align:center; color:#64748b; }
      .footnote { margin-top:4mm; color:#64748b; font-size:7.5pt; line-height:1.4; }
    `,
    body: `
      <main class="page target-report">
        ${haksanHeader(printAssetBase())}
        <header class="report-head">
          <div><div class="eyebrow">Yönetim Raporu</div><h1>Hedef Gerçekleşme Raporu</h1></div>
          <div class="meta"><b>${esc(periodLabel)}</b><br>${esc(generatedAt)} tarihinde oluşturuldu<br>Kapsam: ${input.filter === "all" ? "Tüm kullanıcılar" : "Eksik ve riskli kullanıcılar"}</div>
        </header>
        <section class="summary">
          <div class="summary-item"><div class="summary-label">Hedef atanan kişi</div><div class="summary-value">${input.targetedPeople}</div></div>
          <div class="summary-item"><div class="summary-label">Tamamlanan</div><div class="summary-value">${input.completedCount}</div></div>
          <div class="summary-item"><div class="summary-label">Riskte</div><div class="summary-value">${input.riskCount}</div></div>
          <div class="summary-item"><div class="summary-label">Tamamlanmadı</div><div class="summary-value">${input.missedCount}</div></div>
          <div class="summary-item"><div class="summary-label">Ortalama gerçekleşme</div><div class="summary-value">${esc(reportPct(input.averagePct))}</div></div>
        </section>
        <div class="pulse"><span>Dönem temposu: beklenen <b>%${input.expectedPct}</b></span><span>Gerçekleşen ekip ortalaması <b>${esc(reportPct(input.averagePct))}</b></span></div>
        <h2>Departman bazlı durum</h2>
        ${departmentRows ? `<table class="report-table"><thead><tr><th style="width:22%">Departman</th><th style="width:24%">Kaynak</th><th style="width:8%">Üye</th><th style="width:12%">Eksik / Riskli</th><th style="width:14%">İlerleme</th><th style="width:20%">Durum</th></tr></thead><tbody>${departmentRows}</tbody></table>` : `<div class="empty">Departman kaydı bulunmuyor.</div>`}
        <h2>Kişi bazlı durum</h2>
        ${peopleRows ? `<table class="report-table"><thead><tr><th style="width:18%">Kullanıcı</th><th style="width:18%">Departman</th><th style="width:11%">İlerleme</th><th style="width:35%">Eksik hedefler</th><th style="width:18%">Durum</th></tr></thead><tbody>${peopleRows}</tbody></table>` : `<div class="empty">Seçili filtrede kullanıcı kaydı bulunmuyor.</div>`}
        <p class="footnote">${esc(currencyNote)} Otomatik hedefler sistem kayıtlarından, manuel hedefler kullanıcı girişlerinden alınır.</p>
      </main>`,
  };
}

function TargetPerformanceReport() {
  const { hasPermission } = useAuth();
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [filter, setFilter] = useState<"problems" | "all">("problems");
  const [userRows, setUserRows] = useState<TargetSubjectRow[]>([]);
  const [departmentRows, setDepartmentRows] = useState<TargetSubjectRow[]>([]);
  const [expectedPct, setExpectedPct] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [currencyNormalization, setCurrencyNormalization] = useState<CurrencyNormalization | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!lastUpdatedAt) setLoading(true);
    setRefreshing(true);
    setError(null);
    Promise.all([
      reportService.targetProgress({ period, scope: "all-users" }),
      reportService.targetProgress({ period, scope: "department" }),
    ])
      .then(([usersResponse, departmentsResponse]) => {
        if (!alive) return;
        setUserRows(Array.isArray(usersResponse?.subjects) ? usersResponse.subjects : []);
        setDepartmentRows(Array.isArray(departmentsResponse?.subjects) ? departmentsResponse.subjects : []);
        setExpectedPct(Number(usersResponse?.expectedProgressPct ?? departmentsResponse?.expectedProgressPct ?? 0));
        setCurrencyNormalization(usersResponse?.currencyNormalization ?? departmentsResponse?.currencyNormalization ?? null);
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
  }, [period, refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshKey((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const people = useMemo(
    () =>
      userRows
        .map((row) => ({ row, analysis: analyzeTargetSubject(row, expectedPct, period) }))
        .sort((a, b) => {
          const priority: Record<TargetStatus, number> = { missed: 0, at_risk: 1, on_track: 2, completed: 3, manual: 4, no_target: 5, scheduled: 6 };
          return priority[a.analysis.status] - priority[b.analysis.status] || a.row.subject.name.localeCompare(b.row.subject.name, "tr");
        }),
    [expectedPct, period, userRows]
  );
  const visiblePeople = filter === "all" ? people : people.filter(({ analysis }) => analysis.status === "at_risk" || analysis.status === "missed");
  const targetedPeople = people.filter(({ analysis }) => analysis.status !== "no_target");
  const completedCount = people.filter(({ analysis }) => analysis.status === "completed").length;
  const riskCount = people.filter(({ analysis }) => analysis.status === "at_risk").length;
  const missedCount = people.filter(({ analysis }) => analysis.status === "missed").length;
  const measurablePeople = people.filter(({ analysis }) => analysis.completionPct != null);
  const averagePct = measurablePeople.length
    ? Math.round(measurablePeople.reduce((sum, item) => sum + (item.analysis.completionPct ?? 0), 0) / measurablePeople.length)
    : null;

  const departments = useMemo(
    () =>
      departmentRows.map((row) => {
        const members = people.filter(({ row: person }) =>
          person.subject.departmentIds?.includes(row.subject.id) || person.subject.departmentId === row.subject.id
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
          status,
          memberCount: row.subject.memberCount ?? members.length,
          problemCount: members.filter(({ analysis }) => analysis.status === "at_risk" || analysis.status === "missed").length,
          source: direct.completionPct == null && memberAverage != null ? "Kişisel hedef ortalaması" : "Departman hedefi",
        };
      }),
    [departmentRows, expectedPct, people, period]
  );

  const handlePrintReport = () => {
    printOrWarn(targetPerformancePrintDoc({
      period,
      filter,
      expectedPct,
      averagePct,
      targetedPeople: targetedPeople.length,
      completedCount,
      riskCount,
      missedCount,
      currencyNormalization,
      departments: departments.map((item) => ({
        name: item.row.subject.name,
        source: item.source,
        memberCount: item.memberCount,
        problemCount: item.problemCount,
        completionPct: item.completionPct,
        status: item.status,
      })),
      people: visiblePeople.map(({ row, analysis }) => ({
        name: row.subject.name,
        departments: row.subject.departmentNames?.length ? row.subject.departmentNames.join(", ") : row.subject.departmentName || "",
        completionPct: analysis.completionPct,
        unmet: analysis.unmet,
        status: analysis.status,
      })),
    }));
  };

  return (
    <div className="space-y-4">
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
              onChange={(event) => {
                setLastUpdatedAt(null);
                setPeriod(event.target.value || period);
              }}
              className="h-9 w-[150px] bg-white"
            />
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
                <KpiCard label="Ortalama Gerçekleşme" value={averagePct == null ? "—" : `%${averagePct}`} accent="bg-indigo-50 text-indigo-700" />
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
              <Badge variant="secondary">{departments.length} departman</Badge>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-muted/30"><TableHead>Departman</TableHead><TableHead>Kaynak</TableHead><TableHead>Üye</TableHead><TableHead>Eksik / Riskli</TableHead><TableHead>İlerleme</TableHead><TableHead>Durum</TableHead></TableRow></TableHeader>
                <TableBody>
                  {departments.map((item) => (
                    <TableRow key={item.row.subject.id}>
                      <TableCell className="font-medium">{item.row.subject.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.source}</TableCell>
                      <TableCell className="tabular-nums">{item.memberCount}</TableCell>
                      <TableCell className={`tabular-nums ${item.problemCount ? "font-semibold text-red-700" : "text-muted-foreground"}`}>{item.problemCount}</TableCell>
                      <TableCell><TargetProgressCell value={item.completionPct} expected={expectedPct} /></TableCell>
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
                <TableHeader><TableRow className="bg-muted/30"><TableHead>Kullanıcı</TableHead><TableHead>Departman</TableHead><TableHead>İlerleme</TableHead><TableHead>Eksik Hedefler</TableHead><TableHead>Durum</TableHead></TableRow></TableHeader>
                <TableBody>
                  {visiblePeople.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Bu filtrede eksik veya riskli hedef bulunmuyor.</TableCell></TableRow>
                  ) : visiblePeople.map(({ row, analysis }) => (
                    <TableRow key={row.subject.id}>
                      <TableCell className="font-medium">{row.subject.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.subject.departmentNames?.length ? row.subject.departmentNames.join(", ") : row.subject.departmentName || "—"}
                      </TableCell>
                      <TableCell><TargetProgressCell value={analysis.completionPct} expected={expectedPct} /></TableCell>
                      <TableCell>
                        {analysis.unmet.length ? (
                          <div className="max-w-[360px] text-xs leading-relaxed text-muted-foreground" title={analysis.unmet.join(", ")}>{analysis.unmet.slice(0, 3).join(", ")}{analysis.unmet.length > 3 ? ` +${analysis.unmet.length - 3}` : ""}</div>
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

const MGMT_TONE: Record<ManagementInsight["severity"], string> = {
  critical: "border-red-100 bg-red-50 text-red-700",
  warning: "border-amber-100 bg-amber-50 text-amber-700",
  info: "border-blue-100 bg-blue-50 text-blue-700",
  success: "border-emerald-100 bg-emerald-50 text-emerald-700",
};

function ReportExecutiveSummary({
  summary,
  sourceId,
  onSourceChange,
  onAction,
}: {
  summary: ReturnType<typeof buildManagementInsights>;
  sourceId: string | null;
  onSourceChange: (id: string | null) => void;
  onAction?: (action: OperationAction) => void;
}) {
  const selectedSource = summary.kpis.find((item) => item.id === sourceId) ?? summary.kpis[0] ?? null;
  const sourceRecords = selectedSource?.records ?? [];
  const priorityInsight = summary.risks.find((item) => item.severity === "critical") ?? summary.actions[0] ?? summary.opportunities[0] ?? null;

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="tracking-tight">Yönetici Özeti</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Risk, fırsat, aksiyon ve KPI kaynakları mevcut kayıtlardan türetilir</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="h-7 px-2">{summary.risks.length} risk</Badge>
          <Badge variant="secondary" className="h-7 px-2">{summary.opportunities.length} fırsat</Badge>
          <Badge variant="secondary" className="h-7 px-2">{summary.actions.length} aksiyon</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {priorityInsight && (
          <button
            type="button"
            className="group flex w-full flex-col gap-3 rounded-xl border border-primary/15 bg-[linear-gradient(100deg,rgba(0,12,105,0.07),rgba(255,255,255,0.92)_52%,rgba(230,0,18,0.035))] p-4 text-left transition-colors hover:border-primary/30 sm:flex-row sm:items-center"
            onClick={() => onAction?.(priorityInsight.action)}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-sm"><Sparkles className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="font-data text-[9px] font-semibold uppercase tracking-[0.16em] text-primary">Öncelikli yönetim içgörüsü</span>
              <span className="mt-1 block text-base font-semibold">{priorityInsight.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{priorityInsight.description}</span>
            </span>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium ${MGMT_TONE[priorityInsight.severity]}`}>
              {priorityInsight.metric}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReportInsightList title="Riskler" empty="Aktif risk yok" items={summary.risks.slice(0, 3)} onAction={onAction} />
          <ReportInsightList title="Fırsatlar" empty="Fırsat sinyali yok" items={summary.opportunities.slice(0, 3)} onAction={onAction} />
          <ReportInsightList title="Aksiyonlar" empty="Aksiyon bekleyen kayıt yok" items={summary.actions.slice(0, 3)} onAction={onAction} />
          <ReportInsightList title="Trendler" empty="Trend hesaplanamadı" items={summary.trends.slice(0, 3)} onAction={onAction} />
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0 rounded-lg border border-border/60">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-1 border-b border-border/60 px-3 py-2">
              <div className="text-sm font-medium">KPI Kaynakları</div>
              <span className="text-[11px] text-muted-foreground">Sayıya giren kayıtlar</span>
            </div>
            <div className="grid min-w-0 gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
              {summary.kpis.map((kpi) => (
                <button
                  key={kpi.id}
                  type="button"
                  className={`min-w-0 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/40 ${
                    selectedSource?.id === kpi.id ? "border-primary/30 bg-primary/5" : "border-border/60 bg-white"
                  }`}
                  onClick={() => onSourceChange(kpi.id)}
                >
                  <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{kpi.label}</div>
                  <div className="mt-1 text-base font-medium tabular-nums">{kpi.value}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{kpi.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-lg border border-border/60">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{selectedSource?.label ?? "Kaynak"}</div>
                <div className="truncate text-[11px] text-muted-foreground">{selectedSource?.description ?? "Kayıt seçin"}</div>
              </div>
              {selectedSource && (
                <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => onAction?.(selectedSource.action)}>
                  Listeye Git
                </Button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {sourceRecords.length === 0 ? (
                <div className="grid min-h-32 place-items-center rounded-md border border-dashed border-border/70 bg-muted/20 px-4 text-center text-sm text-muted-foreground">
                  Kaynak kayıt yok.
                </div>
              ) : (
                <div className="space-y-1">
                  {sourceRecords.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted"
                      onClick={() => onAction?.(record.action)}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                        <FileText className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{record.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{record.subtitle}</span>
                      </span>
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{record.type}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportInsightList({
  title,
  empty,
  items,
  onAction,
}: {
  title: string;
  empty: string;
  items: ManagementInsight[];
  onAction?: (action: OperationAction) => void;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/15">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="text-sm font-medium">{title}</div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-muted-foreground">{items.length}</span>
      </div>
      <div className="divide-y divide-border/60">
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">{empty}</div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-white/70"
              onClick={() => onAction?.(item.action)}
            >
              <span className={`mt-0.5 inline-flex min-w-10 justify-center rounded-md border px-2 py-1 text-[11px] tabular-nums ${MGMT_TONE[item.severity]}`}>
                {item.metric}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{item.description}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-1.5 inline-flex px-2 py-0.5 rounded ${accent}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

/**
 * Karlılık / Yıl Sonu Raporu — backend'in /reports/year-end ucundan beslenir.
 * Seçilen yıl için kazanma/kaybetme oranları, nedenlere göre kırılım, rakip
 * kaybı, aylık trend, teklif fiyat ortalamaları ve temsilci performansını gösterir.
 */
function YearEndReportView() {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear];
  const [year, setYear] = useState<number>(currentYear);
  const [data, setData] = useState<YearEndReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    reportService
      .yearEnd(year)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(e?.message ?? "Rapor yüklenemedi"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [year]);

  const num = (s: string | null | undefined) => Number(s ?? 0);
  const money = (s: string | null | undefined) => formatCurrency(num(s));

  const s = data?.summary;
  const pieData = s
    ? [
        { name: "Kazanılan", value: s.won, color: "#10b981" },
        { name: "Kaybedilen", value: s.lost, color: "#ef4444" },
        { name: "Açık", value: s.open, color: "#94a3b8" },
      ]
    : [];
  const monthlyChart = TR_MONTHS.map((name, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    const row = data?.monthly.find((m) => m.month === key);
    return { name, kazanilan: row?.won ?? 0, kaybedilen: row?.lost ?? 0 };
  });

  // Yazdırılabilir / PDF çıktısı
  // pencerede açıp otomatik yazdırır (document.write kullanılmaz).
  const handlePrint = () => {
    if (!data || !s) return;
    const esc = (v: any) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const monthName = (m: string) => TR_MONTHS[Number(m.slice(5, 7)) - 1] ?? m;
    const table = (title: string, head: string[], body: string[][]) =>
      `<h2>${esc(title)}</h2><table><thead><tr>${head
        .map((h, i) => `<th class="${i === 0 ? "" : "r"}">${esc(h)}</th>`)
        .join("")}</tr></thead><tbody>${
        body.length
          ? body
              .map((row) => `<tr>${row.map((c, i) => `<td class="${i === 0 ? "" : "r"}">${esc(c)}</td>`).join("")}</tr>`)
              .join("")
          : `<tr><td colspan="${head.length}" class="empty">Kayıt yok.</td></tr>`
      }</tbody></table>`;
    const kpi = (label: string, value: string) =>
      `<div class="kpi"><div class="kl">${esc(label)}</div><div class="kv">${esc(value)}</div></div>`;
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Karlılık Raporu ${year}</title>
      <style>
        *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;margin:32px;font-size:12px}
        h1{font-size:20px;margin:0 0 2px} .sub{color:#6b7280;margin:0 0 18px}
        h2{font-size:13px;margin:22px 0 6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
        .kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px}
        .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;min-width:150px}
        .kl{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
        .kv{font-size:16px;margin-top:2px}
        table{width:100%;border-collapse:collapse;margin-top:2px}
        th,td{border:1px solid #e5e7eb;padding:5px 8px;text-align:left} th{background:#f3f4f6;font-size:11px}
        td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}
        .empty{text-align:center;color:#9ca3af}
        @media print{
          @page{size:A4 landscape;margin:12mm}
          body{margin:0}
          thead{display:table-header-group}
          tr,.kpi,h2{break-inside:avoid;page-break-inside:avoid}
          h2{break-after:avoid;page-break-after:avoid}
        }
      </style></head><body>
      <h1>Karlılık / Yıl Sonu Raporu</h1>
      <p class="sub">Yıl: ${year} · Haksan Makina · ${new Date().toLocaleDateString("tr-TR")}</p>
      <div class="kpis">
        ${kpi("Toplam Fırsat", String(s.total))}
        ${kpi("Kazanılan / Kaybedilen", `${s.won} / ${s.lost}`)}
        ${kpi("Açık", String(s.open))}
        ${kpi("Kazanma Oranı", `%${s.winRate}`)}
        ${kpi("Kaybetme Oranı", `%${s.lossRate}`)}
        ${kpi("Ort. Kazanılan Değer", money(s.avgWonValue))}
        ${kpi("Ort. Kaybedilen Değer", money(s.avgLostValue))}
        ${kpi("Ort. Teklif Değeri", money(s.avgQuoteValue))}
      </div>
      ${table("Kaybetme Nedenleri", ["Neden", "Adet", "Değer"], data.lostReasons.map((r) => [r.name ?? r.code ?? "Belirtilmemiş", String(r.count), money(r.value)]))}
      ${table("Kazanma Nedenleri", ["Neden", "Adet", "Değer"], data.wonReasons.map((r) => [r.reason ?? "Belirtilmemiş", String(r.count), money(r.value)]))}
      ${table("Rakip Kaybı", ["Rakip", "Adet", "Değer"], data.competitors.map((c) => [c.name, String(c.count), money(c.value)]))}
      ${table("Teklif Fiyat Ortalamaları", ["Durum", "Adet", "Toplam", "Ortalama"], data.quotesByStatus.map((q) => [q.name ?? q.code ?? "—", String(q.count), money(q.totalValue), money(q.avgValue)]))}
      ${table("Aylık Trend", ["Ay", "Kazanılan", "Kaybedilen", "Kazanılan Değer", "Kaybedilen Değer"], data.monthly.map((m) => [monthName(m.month), String(m.won), String(m.lost), money(m.wonValue), money(m.lostValue)]))}
      ${table("Temsilci Bazlı Performans", ["Temsilci", "Toplam", "Kazanılan", "Kaybedilen", "Kazanılan Değer"], data.byUser.map((u) => [u.name ?? "—", String(u.total), String(u.won), String(u.lost), money(u.wonValue)]))}
      <script>window.onload=function(){setTimeout(function(){window.print();},300);};</` + `script>
      </body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const w = window.open(url, "_blank");
    if (!w) {
      toast.error("Yazdırma penceresi açılamadı", { description: "Lütfen pop-up engelleyiciyi kapatın." });
      URL.revokeObjectURL(url);
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Yıl:</span>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`text-xs px-2 py-0.5 rounded ${year === y ? "bg-primary/10 text-primary" : "text-foreground/70 hover:bg-muted"}`}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handlePrint} disabled={!data}>
          <Printer className="size-4" /> Yazdır / PDF
        </Button>
        <ExportExcelButton
          path="/reports/export/year-end"
          filename={`karlilik-raporu-${year}.xlsx`}
          params={{ year }}
          disabled={!data}
        />
      </div>

      {loading && <div className="text-sm text-muted-foreground py-8 text-center">Rapor yükleniyor…</div>}
      {error && <div className="text-sm text-red-600 py-8 text-center">{error}</div>}

      {!loading && !error && s && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="Toplam Fırsat" value={String(s.total)} accent="bg-primary/10 text-primary" />
            <KpiCard label="Kazanılan / Kaybedilen" value={`${s.won} / ${s.lost}`} accent="bg-emerald-50 text-emerald-700" />
            <KpiCard label="Kazanma Oranı" value={`%${s.winRate}`} accent="bg-indigo-50 text-indigo-700" />
            <KpiCard label="Ort. Kazanılan Değer" value={money(s.avgWonValue)} accent="bg-emerald-50 text-emerald-700" />
            <KpiCard label="Ort. Teklif Değeri" value={money(s.avgQuoteValue)} accent="bg-amber-50 text-amber-700" />
          </div>

          {/* Win/Loss + monthly trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Kazanma / Kaybetme Dağılımı</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} isAnimationActive={false}>
                      {pieData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Aylık Trend ({year})</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="kazanilan" name="Kazanılan" fill="#10b981" barSize={14} isAnimationActive={false} />
                    <Bar dataKey="kaybedilen" name="Kaybedilen" fill="#ef4444" barSize={14} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Reasons + competitors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ReasonTable title="Kaybetme Nedenleri" empty="Bu yıl kaybedilen fırsat yok." rows={data.lostReasons.map((r) => ({ label: r.name ?? r.code ?? "Belirtilmemiş", count: r.count, value: money(r.value) }))} />
            <ReasonTable title="Kazanma Nedenleri" empty="Bu yıl kazanılan fırsat yok." rows={data.wonReasons.map((w) => ({ label: w.reason ?? "Belirtilmemiş", count: w.count, value: money(w.value) }))} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ReasonTable title="Rakip Kaybı" empty="Rakibe kaybedilen fırsat kaydı yok." rows={data.competitors.map((c) => ({ label: c.name, count: c.count, value: money(c.value) }))} />

            {/* Teklif fiyat ortalamaları */}
            <Card className="border-border/60 shadow-sm overflow-hidden">
              <CardHeader>
                <CardTitle className="text-sm">Teklif Fiyat Ortalamaları</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>Durum</TableHead>
                      <TableHead className="text-right">Adet</TableHead>
                      <TableHead className="text-right">Toplam</TableHead>
                      <TableHead className="text-right">Ortalama</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.quotesByStatus.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Bu yıla ait teklif yok.</TableCell>
                      </TableRow>
                    ) : (
                      data.quotesByStatus.map((q) => (
                        <TableRow key={q.code ?? q.name ?? Math.random()}>
                          <TableCell className="text-sm">{q.name ?? q.code ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{q.count}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(q.totalValue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(q.avgValue)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>

          {/* Temsilci bazlı */}
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm">Temsilci Bazlı Performans</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead>Temsilci</TableHead>
                    <TableHead className="text-right">Toplam</TableHead>
                    <TableHead className="text-right">Kazanılan</TableHead>
                    <TableHead className="text-right">Kaybedilen</TableHead>
                    <TableHead className="text-right">Kazanılan Değer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byUser.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Veri yok.</TableCell>
                    </TableRow>
                  ) : (
                    data.byUser.map((u) => (
                      <TableRow key={u.userId ?? u.name ?? Math.random()}>
                        <TableCell className="text-sm">{u.name ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.total}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">{u.won}</TableCell>
                        <TableCell className="text-right tabular-nums text-red-700">{u.lost}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(u.wonValue)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/** Neden/adet/değer üçlüsünü gösteren küçük tablo kartı (kazanma/kaybetme/rakip). */
function ReasonTable({ title, rows, empty }: { title: string; empty: string; rows: Array<{ label: string; count: number; value: string }> }) {
  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>{title.includes("Rakip") ? "Rakip" : "Neden"}</TableHead>
              <TableHead className="text-right">Adet</TableHead>
              <TableHead className="text-right">Değer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">{empty}</TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={`${r.label}-${i}`}>
                  <TableCell className="text-sm">{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.value}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
