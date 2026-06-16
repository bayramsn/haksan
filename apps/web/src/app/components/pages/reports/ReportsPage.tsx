import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { useStore } from "../../../lib/store";
import { buildManagementInsights, type ManagementInsight, type OperationAction } from "../../../lib/operations";
import { reportService, type YearEndReport } from "../../../../lib/services";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { formatCurrency } from "../../../lib/pageHelpers";
import { ReportAnalyticsHub } from "../../reports/ReportAnalyticsHub";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function ReportsPage({ onAction }: { onAction?: (action: OperationAction) => void }) {
  const store = useStore();
  const { cases, offers, service } = store;
  const [mode, setMode] = useState<"operasyonel" | "karlilik" | "analitik">("operasyonel");
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
      <div className="inline-flex rounded-md border border-border bg-white p-0.5">
        <button
          onClick={() => setMode("operasyonel")}
          className={`px-3 py-1.5 text-sm rounded ${mode === "operasyonel" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted"}`}
        >
          Operasyonel
        </button>
        <button
          onClick={() => setMode("karlilik")}
          className={`px-3 py-1.5 text-sm rounded ${mode === "karlilik" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted"}`}
        >
          Karlılık (Yıl Sonu)
        </button>
        <button
          onClick={() => setMode("analitik")}
          className={`px-3 py-1.5 text-sm rounded ${mode === "analitik" ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted"}`}
        >
          Analitik & Excel
        </button>
      </div>

      {mode !== "analitik" && (
      <ReportExecutiveSummary
        summary={management}
        sourceId={sourceId}
        onSourceChange={setSourceId}
        onAction={onAction}
      />
      )}

      {mode === "karlilik" && <YearEndReportView />}

      {mode === "analitik" && <ReportAnalyticsHub />}

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
        <div className="grid gap-3 lg:grid-cols-4">
          <ReportInsightList title="Riskler" empty="Aktif risk yok" items={summary.risks.slice(0, 3)} onAction={onAction} />
          <ReportInsightList title="Fırsatlar" empty="Fırsat sinyali yok" items={summary.opportunities.slice(0, 3)} onAction={onAction} />
          <ReportInsightList title="Aksiyonlar" empty="Aksiyon bekleyen kayıt yok" items={summary.actions.slice(0, 3)} onAction={onAction} />
          <ReportInsightList title="Trendler" empty="Trend hesaplanamadı" items={summary.trends.slice(0, 3)} onAction={onAction} />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-lg border border-border/60">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <div className="text-sm font-medium">KPI Kaynakları</div>
              <span className="text-[11px] text-muted-foreground">Sayıya giren kayıtlar</span>
            </div>
            <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
              {summary.kpis.map((kpi) => (
                <button
                  key={kpi.id}
                  type="button"
                  className={`rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/40 ${
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

          <div className="rounded-lg border border-border/60">
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
        @media print{body{margin:12mm}}
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
