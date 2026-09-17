// Raporlar > Operasyonel: dönem başına teklif / fırsat / servis / ciro.
// Sayılar sunucudan gelir (/reports/operational) — tarayıcıdaki mağaza yalnız
// belleğe inen kayıtları görüyordu ve kazanma tanımı yıl sonu raporundan sapıyordu.
// Excel ve yazdırma aynı satırları kullanır; tablo hücreleri ilgili listeye iner.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { useStore } from "../../../lib/store";
import { usePersistentState } from "../../../lib/persist";
import { monthQuery } from "../../../lib/monthQuery";
import { printOrWarn } from "../../../lib/pageHelpers";
import { esc, haksanHeader, printAssetBase, type PrintDocument } from "../../../lib/print";
import type { OperationAction, OperationFocus, OperationNav } from "../../../lib/operations";
import { reportService, type OperationalReport as OperationalReportData, type OperationalReportRow } from "../../../../lib/services";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Printer, RefreshCw } from "lucide-react";

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const ALL = "all";

type Period = "monthly" | "yearly";
type Filters = { period: Period; year: number; ownerUserId: string; departmentId: string };

const currentYear = new Date().getFullYear();
const DEFAULT_FILTERS: Filters = { period: "monthly", year: currentYear, ownerUserId: ALL, departmentId: ALL };

/** localStorage'daki eski/bozuk blob ekranı düşürmesin — tip şeması burada doğrulanır. */
const isFilters = (value: unknown): value is Filters => {
  const v = value as Partial<Filters> | null;
  return Boolean(
    v && (v.period === "monthly" || v.period === "yearly")
      && Number.isInteger(v.year) && typeof v.ownerUserId === "string" && typeof v.departmentId === "string",
  );
};

type Totals = Omit<OperationalReportRow, "bucket">;
const EMPTY: Totals = { quotes: 0, approved: 0, rejected: 0, won: 0, lost: 0, service: 0, revenueUsd: 0 };
const sumRows = (rows: OperationalReportRow[]): Totals =>
  rows.reduce(
    (acc, r) => ({
      quotes: acc.quotes + r.quotes,
      approved: acc.approved + r.approved,
      rejected: acc.rejected + r.rejected,
      won: acc.won + r.won,
      lost: acc.lost + r.lost,
      service: acc.service + r.service,
      revenueUsd: acc.revenueUsd + r.revenueUsd,
    }),
    EMPTY,
  );

const usd = (n: number) => `$ ${Math.round(n).toLocaleString("tr-TR")}`;
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
const bucketLabel = (bucket: string) => (bucket.length === 7 ? TR_MONTHS[Number(bucket.slice(5)) - 1] ?? bucket : bucket);

const REPORT_CARDS: { title: string; keys: { dataKey: keyof Totals; label: string; color: string }[] }[] = [
  {
    title: "Teklif Raporu",
    keys: [
      { dataKey: "quotes", label: "Toplam Teklif", color: "var(--brand-blue)" },
      { dataKey: "approved", label: "Onaylanan", color: "var(--success)" },
      { dataKey: "rejected", label: "Reddedilen", color: "var(--destructive)" },
    ],
  },
  {
    title: "Satış Dönüşüm",
    keys: [
      { dataKey: "won", label: "Kazanılan", color: "var(--success)" },
      { dataKey: "lost", label: "Kaybedilen", color: "var(--destructive)" },
    ],
  },
  { title: "Servis Raporu", keys: [{ dataKey: "service", label: "Servis Talebi", color: "var(--info)" }] },
  { title: "Ciro (Kazanılan, USD)", keys: [{ dataKey: "revenueUsd", label: "USD", color: "var(--brand-blue)" }] },
];

/** Tablo sütunu → inilecek liste. Servis listesi dönem süzgeci tanımıyor; sekme yeter. */
const DRILL: Partial<Record<keyof Totals, { nav: OperationNav; focus?: OperationFocus; month: boolean }>> = {
  quotes: { nav: "offers", month: true },
  approved: { nav: "offers", focus: "won", month: true },
  rejected: { nav: "offers", focus: "lost", month: true },
  won: { nav: "sales-cases", focus: "won", month: true },
  lost: { nav: "sales-cases", focus: "lost", month: true },
  service: { nav: "service-requests", month: false },
};

export function OperationalReport({ onAction }: { onAction?: (action: OperationAction) => void }) {
  const { cases, offers, service, users } = useStore();
  const [stored, setStored] = usePersistentState<Filters>("reports.operational", DEFAULT_FILTERS);
  const owners = useMemo(() => users.filter((u) => u.active !== false).sort((a, b) => a.name.localeCompare(b.name, "tr")), [users]);
  const departments = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) if (u.departmentId && u.department) map.set(u.departmentId, u.department);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [users]);
  const filters = useMemo<Filters>(() => {
    const base = isFilters(stored) ? stored : DEFAULT_FILTERS;
    // Saklanan temsilci pasife alındıysa seçici boş görünür ama sunucuya id gitmeye
    // devam ederdi — daralmış rakam "Tüm temsilciler" sanılırdı. Listede yoksa tümüne düş.
    return {
      ...base,
      ownerUserId: base.ownerUserId === ALL || (users.length > 0 && !owners.some((u) => u.id === base.ownerUserId)) ? ALL : base.ownerUserId,
      departmentId: base.departmentId === ALL || (users.length > 0 && !departments.some((d) => d.id === base.departmentId)) ? ALL : base.departmentId,
    };
  }, [stored, users.length, owners, departments]);
  const patch = (next: Partial<Filters>) => setStored({ ...filters, ...next });
  const { period, year, ownerUserId, departmentId } = filters;

  const [report, setReport] = useState<OperationalReportData | null>(null);
  const [previous, setPrevious] = useState<OperationalReportRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const years = useMemo(
    () =>
      Array.from(
        new Set([
          ...cases.map((s) => Number(s.createdAt.slice(0, 4))),
          ...offers.map((o) => Number(o.date.slice(0, 4))),
          ...service.map((s) => Number(s.createdAt.slice(0, 4))),
          currentYear,
        ]),
      )
        .filter((y) => Number.isFinite(y) && y > 2000)
        .sort((a, b) => a - b),
    [cases, offers, service],
  );
  const params = useMemo(
    () => ({
      period,
      year,
      ...(ownerUserId !== ALL ? { ownerUserId } : {}),
      ...(departmentId !== ALL ? { departmentId } : {}),
    }),
    [period, year, ownerUserId, departmentId],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      reportService.operational(params),
      // Kıyas yalnız aylıkta: aynı süzgeçle bir önceki yıl; düşerse rapor düşmesin, kıyas boş kalsın.
      period === "monthly" ? reportService.operational({ ...params, year: year - 1 }).catch(() => null) : Promise.resolve(null),
    ])
      .then(([current, prev]) => {
        if (!alive) return;
        setReport(current);
        setPrevious(prev?.rows ?? null);
      })
      .catch((reason) => alive && setError(reason?.message ?? "Rapor yüklenemedi"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [params, refreshKey]);

  const rows = report?.rows ?? [];
  const totals = useMemo(() => sumRows(rows), [rows]);
  // Kıyas penceresi: içinde bulunulan yılda yalnız geçen aylar (Ocak–bugünün ayı),
  // geçmiş yılda tüm yıl; aksi hâlde henüz gelmemiş aylar geçen yılı şişirir.
  const comparedMonths = year === currentYear ? new Date().getMonth() + 1 : 12;
  const prevTotals = useMemo(
    () => (previous ? sumRows(previous.filter((r) => Number(r.bucket.slice(5)) <= comparedMonths)) : null),
    [previous, comparedMonths],
  );
  const curTotals = useMemo(
    () => (period === "monthly" ? sumRows(rows.filter((r) => Number(r.bucket.slice(5)) <= comparedMonths)) : totals),
    [rows, period, comparedMonths, totals],
  );
  const conversion = pct(totals.approved, totals.quotes);
  const conversionDelta = delta(pct(curTotals.approved, curTotals.quotes), prevTotals ? pct(prevTotals.approved, prevTotals.quotes) : null, "puan");
  const chartData = rows.map((r) => ({ ...r, name: bucketLabel(r.bucket) }));
  const fx = report?.currencyNormalization;

  const drill = (key: keyof Totals, bucket?: string) => {
    const target = DRILL[key];
    if (!target || !onAction) return;
    onAction({ kind: "navigate", nav: target.nav, focus: target.focus, query: target.month && bucket ? monthQuery(bucket) : undefined });
  };

  const handlePrint = () =>
    printOrWarn(
      operationalPrintDoc({
        rows,
        totals,
        period,
        year,
        conversion,
        ownerName: owners.find((u) => u.id === ownerUserId)?.name ?? null,
        departmentName: departments.find((d) => d.id === departmentId)?.name ?? null,
        rateNote: fx ? `Ciro USD bazında; kur tarihi ${fx.rateDate}${fx.unsupportedCurrencies.length ? `, çevrilemeyen: ${fx.unsupportedCurrencies.join(", ")}` : ""}.` : "",
        assetBase: printAssetBase(),
      }),
    );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-card p-0.5">
          {(["monthly", "yearly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => patch({ period: value })}
              className={`rounded px-3 py-1.5 text-sm ${period === value ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-muted"}`}
            >
              {value === "monthly" ? "Aylık" : "Yıllık"}
            </button>
          ))}
        </div>

        {period === "monthly" && (
          <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1">
            <span className="mr-1 text-xs uppercase tracking-wider text-muted-foreground">Yıl:</span>
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => patch({ year: y })}
                className={`rounded px-2 py-0.5 text-xs ${year === y ? "bg-primary/10 text-primary" : "text-foreground/70 hover:bg-muted"}`}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        <Select value={ownerUserId} onValueChange={(value) => patch({ ownerUserId: value, departmentId: ALL })}>
          <SelectTrigger className="h-9 w-[190px] bg-card" aria-label="Temsilci"><SelectValue placeholder="Temsilci" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tüm temsilciler</SelectItem>
            {owners.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {departments.length > 0 && (
          <Select value={departmentId} onValueChange={(value) => patch({ departmentId: value, ownerUserId: ALL })}>
            <SelectTrigger className="h-9 w-[190px] bg-card" aria-label="Departman"><SelectValue placeholder="Departman" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tüm departmanlar</SelectItem>
              {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <div className="flex-1" />
        <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => setRefreshKey((v) => v + 1)} disabled={loading} aria-label="Raporu yenile">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={handlePrint} disabled={loading || !report}>
          <Printer className="size-4" /> Yazdır / PDF
        </Button>
        <ExportExcelButton
          path="/exports/operational"
          filename={period === "monthly" ? `rapor-${year}.xlsx` : "rapor-yillik.xlsx"}
          params={params}
          disabled={loading || !report}
        />
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">{error}</div>}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Toplam Teklif" value={String(totals.quotes)} accent="bg-primary/10 text-primary" delta={delta(curTotals.quotes, prevTotals?.quotes)} onClick={() => drill("quotes")} />
        <KpiCard label="Onaylanan / Reddedilen" value={`${totals.approved} / ${totals.rejected}`} accent="bg-emerald-50 text-emerald-700" delta={delta(curTotals.approved, prevTotals?.approved)} onClick={() => drill("approved")} />
        <KpiCard label="Dönüşüm Oranı" value={`%${conversion}`} accent="bg-indigo-50 text-indigo-700" delta={conversionDelta} />
        <KpiCard label="Kazanılan / Kaybedilen" value={`${totals.won} / ${totals.lost}`} accent="bg-sky-50 text-sky-700" delta={delta(curTotals.won, prevTotals?.won)} onClick={() => drill("won")} />
        <KpiCard label="Ciro (USD)" value={usd(totals.revenueUsd)} accent="bg-amber-50 text-amber-700" delta={delta(curTotals.revenueUsd, prevTotals?.revenueUsd, "usd")} />
      </div>
      {period === "monthly" && prevTotals && (
        <p className="-mt-1 text-[11px] text-muted-foreground">
          Kıyas: {year - 1} yılının {year === currentYear ? `Ocak–${TR_MONTHS[comparedMonths - 1]}` : "tamamı"} · kırılım kaydın açıldığı tarihe göre
          {fx && ` · kur ${fx.rateDate}${fx.unsupportedCurrencies.length ? ` (çevrilemeyen: ${fx.unsupportedCurrencies.join(", ")})` : ""}`}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {REPORT_CARDS.map((rc) => (
          <Card key={rc.title} className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{rc.title}</CardTitle>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{period === "monthly" ? `${year}` : "Yıllık"}</span>
            </CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--chart-tooltip-border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} />
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

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm">{period === "monthly" ? `${year} - Aylık Detay` : "Yıllık Detay"}</CardTitle>
          <p className="text-xs text-muted-foreground">Hücreye tıklayınca o dönemin kayıtları açılır</p>
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
              {loading && rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Rapor yükleniyor…</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.bucket}>
                  <TableCell className="text-sm">{bucketLabel(r.bucket)}</TableCell>
                  <DrillCell value={r.quotes} onClick={() => drill("quotes", r.bucket)} />
                  <DrillCell value={r.approved} className="text-emerald-700" onClick={() => drill("approved", r.bucket)} />
                  <DrillCell value={r.rejected} className="text-red-700" onClick={() => drill("rejected", r.bucket)} />
                  <DrillCell value={r.won} onClick={() => drill("won", r.bucket)} />
                  <DrillCell value={r.lost} onClick={() => drill("lost", r.bucket)} />
                  <DrillCell value={r.service} onClick={() => drill("service", r.bucket)} />
                  <TableCell className="text-right tabular-nums">{usd(r.revenueUsd)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/20">
                <TableCell className="text-sm">Toplam</TableCell>
                <TableCell className="text-right tabular-nums">{totals.quotes}</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-700">{totals.approved}</TableCell>
                <TableCell className="text-right tabular-nums text-red-700">{totals.rejected}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.won}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.lost}</TableCell>
                <TableCell className="text-right tabular-nums">{totals.service}</TableCell>
                <TableCell className="text-right tabular-nums">{usd(totals.revenueUsd)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}

function DrillCell({ value, className = "", onClick }: { value: number; className?: string; onClick: () => void }) {
  return (
    <TableCell className={`text-right tabular-nums ${className}`}>
      {value > 0 ? (
        <button type="button" className="rounded px-1 underline-offset-2 hover:bg-muted hover:underline" onClick={onClick}>{value}</button>
      ) : (
        <span className="text-muted-foreground">0</span>
      )}
    </TableCell>
  );
}

type Delta = { diff: number; label: string } | null;

/** Önceki dönemle fark; kıyas yoksa boş. `puan` yüzde farkı, `usd` para. */
function delta(current: number, previous: number | null | undefined, unit: "adet" | "puan" | "usd" = "adet"): Delta {
  if (previous == null) return null;
  const diff = current - previous;
  const text = unit === "usd" ? usd(Math.abs(diff)).replace("$ ", "") : String(Math.abs(diff));
  return { diff, label: diff === 0 ? "geçen yılla aynı" : `${diff > 0 ? "▲" : "▼"} ${text}${unit === "puan" ? " puan" : unit === "usd" ? " USD" : ""}` };
}

function KpiCard({ label, value, accent, delta, onClick }: { label: string; value: string; accent: string; delta: Delta; onClick?: () => void }) {
  const body = (
    <>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1.5 inline-flex rounded px-2 py-0.5 ${accent}`}>{value}</div>
      {delta && (
        <div className={`mt-1 text-[11px] tabular-nums ${delta.diff > 0 ? "text-emerald-700" : delta.diff < 0 ? "text-red-700" : "text-muted-foreground"}`}>{delta.label}</div>
      )}
    </>
  );
  return (
    <Card className="border-border/60 shadow-sm">
      {onClick ? (
        <button type="button" className="w-full px-6 py-4 text-left hover:bg-muted/40" onClick={onClick}>{body}</button>
      ) : (
        <CardContent className="py-4">{body}</CardContent>
      )}
    </Card>
  );
}

export function operationalPrintDoc(input: {
  rows: OperationalReportRow[];
  totals: Totals;
  period: Period;
  year: number;
  conversion: number;
  ownerName: string | null;
  departmentName: string | null;
  rateNote: string;
  /** Antet görselinin kökü; saf kalsın diye çağıran verir (testte window yok). */
  assetBase: string;
}): PrintDocument {
  const generatedAt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const scope = [input.ownerName && `Temsilci: ${input.ownerName}`, input.departmentName && `Departman: ${input.departmentName}`]
    .filter(Boolean)
    .join(" · ") || "Tüm ekip";
  const periodLabel = input.period === "monthly" ? `${input.year} · aylık` : "Yıllık";
  const cell = (n: number) => `<td class="num">${n}</td>`;
  const body = input.rows
    .map((r) => `<tr><td><b>${esc(bucketLabel(r.bucket))}</b></td>${cell(r.quotes)}${cell(r.approved)}${cell(r.rejected)}${cell(r.won)}${cell(r.lost)}${cell(r.service)}<td class="num">${esc(usd(r.revenueUsd))}</td></tr>`)
    .join("");
  const t = input.totals;
  return {
    title: `Operasyonel Rapor · ${periodLabel}`,
    css: `
      .report-head { display:flex; align-items:flex-end; justify-content:space-between; gap:8mm; border-bottom:2px solid #000c69; padding-bottom:3mm; margin-top:5mm; }
      .eyebrow { color:#000c69; font-size:8pt; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; }
      h1 { margin-top:1mm; font-size:18pt; line-height:1.1; }
      .meta { text-align:right; font-size:8.5pt; line-height:1.5; color:#4b5563; }
      .summary { display:grid; grid-template-columns:repeat(5,1fr); gap:2mm; margin:5mm 0; }
      .summary-item { border:1px solid #d9deea; border-top:2px solid #000c69; padding:2.5mm; }
      .summary-label { color:#64748b; font-size:7.5pt; }
      .summary-value { margin-top:2mm; color:#111827; font-size:14pt; font-weight:700; }
      .report-table { width:100%; table-layout:fixed; font-size:8pt; border-collapse:collapse; }
      .report-table th { background:#000c69; color:#fff; padding:2mm 1.5mm; text-align:left; font-weight:700; }
      .report-table th.num, .num { text-align:right; font-variant-numeric:tabular-nums; }
      .report-table td { border:1px solid #d8dde8; padding:1.8mm 1.5mm; }
      .report-table tbody tr:nth-child(even) { background:#f8fafc; }
      .report-table tfoot td { font-weight:700; background:#eef2ff; }
      .footnote { margin-top:4mm; color:#64748b; font-size:7.5pt; line-height:1.4; }
    `,
    body: `
      <main class="page">
        ${haksanHeader(input.assetBase)}
        <header class="report-head">
          <div><div class="eyebrow">Yönetim Raporu</div><h1>Operasyonel Rapor</h1></div>
          <div class="meta"><b>${esc(periodLabel)}</b><br>${esc(generatedAt)} tarihinde oluşturuldu<br>${esc(scope)}</div>
        </header>
        <section class="summary">
          <div class="summary-item"><div class="summary-label">Toplam teklif</div><div class="summary-value">${t.quotes}</div></div>
          <div class="summary-item"><div class="summary-label">Onaylanan / Reddedilen</div><div class="summary-value">${t.approved} / ${t.rejected}</div></div>
          <div class="summary-item"><div class="summary-label">Dönüşüm</div><div class="summary-value">%${input.conversion}</div></div>
          <div class="summary-item"><div class="summary-label">Kazanılan / Kaybedilen</div><div class="summary-value">${t.won} / ${t.lost}</div></div>
          <div class="summary-item"><div class="summary-label">Ciro (USD)</div><div class="summary-value">${esc(usd(t.revenueUsd))}</div></div>
        </section>
        <table class="report-table">
          <thead><tr><th style="width:14%">${input.period === "monthly" ? "Ay" : "Yıl"}</th><th class="num">Teklif</th><th class="num">Onaylanan</th><th class="num">Reddedilen</th><th class="num">Kazanılan</th><th class="num">Kaybedilen</th><th class="num">Servis</th><th class="num" style="width:18%">Ciro (USD)</th></tr></thead>
          <tbody>${body}</tbody>
          <tfoot><tr><td>Toplam</td>${cell(t.quotes)}${cell(t.approved)}${cell(t.rejected)}${cell(t.won)}${cell(t.lost)}${cell(t.service)}<td class="num">${esc(usd(t.revenueUsd))}</td></tr></tfoot>
        </table>
        <p class="footnote">Kırılım kaydın açıldığı tarihe göredir; kazanma ve kaybetme fırsatın WIN / LOST derecesinden okunur, iptal edilen fırsatlar kayıp sayılmaz. ${esc(input.rateNote)}</p>
      </main>`,
  };
}
