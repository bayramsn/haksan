import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Progress } from "../ui/progress";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Users, Briefcase, FileText, AlertTriangle, TrendingUp, TrendingDown,
  Package, Wrench, Target, ArrowUpRight, MoreHorizontal, Calendar,
  CheckCircle2, Clock, Wallet, Truck, BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend, LineChart, Line, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { SALES_STAGES, salesStageLabel } from "../../lib/mock";
import { StatusBadge } from "../Layout";
import { useStore } from "../../lib/store";
import { adminService } from "../../../lib/services";
import {
  buildManagementInsights,
  buildWorkItems,
  type KpiDrilldown,
  type ManagementInsight,
  type OperationAction,
  type WorkItem,
} from "../../lib/operations";

const monthly = [
  { ay: "Ara", teklif: 12, kazanan: 5, kayip: 2, ciro: 180 },
  { ay: "Oca", teklif: 16, kazanan: 7, kayip: 3, ciro: 240 },
  { ay: "Şub", teklif: 22, kazanan: 10, kayip: 4, ciro: 320 },
  { ay: "Mar", teklif: 19, kazanan: 9, kayip: 3, ciro: 295 },
  { ay: "Nis", teklif: 26, kazanan: 13, kayip: 5, ciro: 410 },
  { ay: "May", teklif: 18, kazanan: 8, kayip: 2, ciro: 260 },
];

const funnelData = [
  { name: "Lead", value: 120, fill: "#93c5fd" },
  { name: "Teklif", value: 78, fill: "#3b82f6" },
  { name: "Onay", value: 42, fill: "#000c69" },
  { name: "Sözleşme", value: 28, fill: "#0a192f" },
  { name: "Kurulum", value: 19, fill: "#cf060c" },
];

const radarData = [
  { konu: "Satış", deger: 85 },
  { konu: "Teklif", deger: 72 },
  { konu: "Tahsilat", deger: 64 },
  { konu: "Servis", deger: 78 },
  { konu: "Stok", deger: 90 },
  { konu: "Memnuniyet", deger: 81 },
];

const sparkData = [
  { v: 12 }, { v: 18 }, { v: 14 }, { v: 22 }, { v: 19 }, { v: 28 }, { v: 26 },
];

const COLORS = ["#000c69", "#cf060c", "#3b82f6", "#10b981", "#f59e0b", "#64748b", "#0ea5e9", "#14b8a6", "#ef4444", "#334155", "#fbbf24", "#60a5fa"];

type AssignedTargetItem = {
  targetType: "sales" | "service";
  category: string;
  activity: string;
  description?: string;
  unit: "count" | "amount";
  target: string;
};
type AssignedTarget = {
  period: string;
  targetItems?: AssignedTargetItem[];
  note?: string | null;
  // Özet sayısal alanlar (detaylı targetItems yoksa bunlardan hedef türetilir).
  salesAmount?: string | number | null;
  salesNewCustomers?: string | number | null;
  serviceAmount?: string | number | null;
  serviceCompleted?: string | number | null;
  visitTarget?: string | number | null;
  callTarget?: string | number | null;
  quoteTarget?: string | number | null;
  digitalLeadTarget?: string | number | null;
  digitalConversionTarget?: string | number | null;
  digitalBudget?: string | number | null;
};

/** Özet alanlardan hedef kalemleri türetir (targetItems boşken görünürlük için). */
const synthesizeTargetItems = (t: AssignedTarget | null): AssignedTargetItem[] => {
  if (!t) return [];
  const out: AssignedTargetItem[] = [];
  const num = (v: AssignedTarget["salesAmount"]) => (v == null || v === "" ? null : Number(v));
  const add = (
    targetType: AssignedTargetItem["targetType"],
    activity: string,
    unit: AssignedTargetItem["unit"],
    v: AssignedTarget["salesAmount"]
  ) => {
    const n = num(v);
    if (n && n > 0) out.push({ targetType, category: targetType === "sales" ? "Satış" : "Servis", activity, unit, target: String(n) });
  };
  add("sales", "Satış Tutarı", "amount", t.salesAmount);
  add("sales", "Yeni Müşteri", "count", t.salesNewCustomers);
  add("sales", "Ziyaret", "count", t.visitTarget);
  add("sales", "Arama", "count", t.callTarget);
  add("sales", "Teklif", "count", t.quoteTarget);
  add("sales", "Dijital Lead", "count", t.digitalLeadTarget);
  add("sales", "Dijital Dönüşüm", "count", t.digitalConversionTarget);
  add("sales", "Dijital Bütçe", "amount", t.digitalBudget);
  add("service", "Servis Cirosu", "amount", t.serviceAmount);
  add("service", "Tamamlanan Servis", "count", t.serviceCompleted);
  return out;
};

const currentPeriod = () => new Date().toISOString().slice(0, 7);
const targetTypeLabel = (type: AssignedTargetItem["targetType"]) => (type === "sales" ? "Satış" : "Servis");
const formatTargetValue = (item: AssignedTargetItem) => {
  const value = item.target?.trim();
  if (!value) return "Belirlenmedi";
  if (item.unit === "amount") {
    const number = Number(value.replace(",", "."));
    const shown = Number.isFinite(number) ? number.toLocaleString("tr-TR") : value;
    return `${shown} USD`;
  }
  return `${value} adet`;
};
const filledTargetCount = (items: AssignedTargetItem[], type: AssignedTargetItem["targetType"]) =>
  items.filter((item) => item.targetType === type && !!item.target?.trim()).length;
const totalTargetCount = (items: AssignedTargetItem[], type: AssignedTargetItem["targetType"]) =>
  items.filter((item) => item.targetType === type).length;

export function DashboardPage({ onAction }: { onAction?: (action: OperationAction) => void }) {
  const store = useStore();
  const { customers, cases: salesCases, service: serviceRequests, machines, users } = store;
  const [targetPeriod, setTargetPeriod] = useState(currentPeriod());
  const [myTarget, setMyTarget] = useState<AssignedTarget | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState("");
  // Satış performansı grafiği için dönem seçimi (son N ay).
  const [chartPeriod, setChartPeriod] = useState<"1A" | "3A" | "6A" | "1Y">("6A");
  const monthlyView = monthly.slice(-({ "1A": 1, "3A": 3, "6A": 6, "1Y": 12 }[chartPeriod]));
  const activeCustomers = customers.filter((c) => c.status === "active").length;
  const openService = serviceRequests.filter((s) => s.stage !== "Closed").length;
  const installedMachines = machines.filter((m) => m.status === "Active").length;
  const workItems = useMemo(() => buildWorkItems(store), [store]);
  const management = useMemo(() => buildManagementInsights(store), [store]);
  const drilldown = (id: string) => management.kpis.find((item) => item.id === id);
  const criticalWork = workItems.filter((item) => item.severity === "critical").length;
  const warningWork = workItems.filter((item) => item.severity === "warning").length;

  const stageData = SALES_STAGES.map((s) => ({
    name: salesStageLabel(s),
    count: salesCases.filter((sc) => sc.stage === s).length,
  })).filter((d) => d.count > 0);

  const totalPipeline = salesCases.filter((s) => !s.isLost).reduce((a, s) => a + s.estimatedAmount, 0);
  const myTargetItems = useMemo(() => {
    const items = Array.isArray(myTarget?.targetItems) ? myTarget!.targetItems! : [];
    // Detaylı kalem yoksa özet alanlardan türet → atanan hedef yine görünür olur.
    return items.length > 0 ? items : synthesizeTargetItems(myTarget);
  }, [myTarget]);

  useEffect(() => {
    let cancelled = false;
    setTargetLoading(true);
    setTargetError("");
    adminService.myTargets({ period: targetPeriod })
      .then((rows) => {
        if (!cancelled) setMyTarget(rows[0] ?? null);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setMyTarget(null);
          setTargetError(err?.message ?? "Hedefler yüklenemedi.");
        }
      })
      .finally(() => {
        if (!cancelled) setTargetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetPeriod]);

  return (
    <div className="space-y-5">
      {/* Welcome strip */}
      <div className="rounded-xl border-t-2 border-brand-red bg-gradient-to-br from-brand-dark via-brand-blue to-[#0a1440] text-white p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-16 w-[196px] rounded-lg bg-white/10 backdrop-blur grid place-items-center shrink-0 border border-white/10">
            <img src="/brand/haksan-logo-white.png" alt="Haksan Makina" className="h-12 w-auto max-w-[166px] object-contain" />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] tracking-tight">Hoş geldin Ayşe 👋</div>
            <div className="text-[13px] text-white/75 mt-0.5">
              Bugün <b className="text-white">{workItems.length}</b> takip işi var; <b className="text-white">{criticalWork}</b> kritik, <b className="text-white">{warningWork}</b> yakın takip.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            className="bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur"
            onClick={() => onAction?.({ kind: "navigate", nav: "dashboard", focus: "today" })}
          >
            <Calendar className="size-4" /> Bugün
          </Button>
          <Button
            size="sm"
            className="bg-white text-primary hover:bg-white/90"
            onClick={() => onAction?.({ kind: "navigate", nav: "payments", focus: "overdue" })}
          >
            Görevlerim
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
      </div>

      <ManagementCommandCenter summary={management} onAction={onAction} />

      <TodayWorkPanel items={workItems} onAction={onAction} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Kpi icon={<Users className="size-[18px]" />} tone="violet" label="Aktif Müşteri" value={activeCustomers} delta={12} sub="bu ay" onClick={() => onAction?.({ kind: "navigate", nav: "customers" })} />
        <KpiFromDrilldown icon={<Wallet className="size-[18px]" />} tone="emerald" item={drilldown("kpi:revenue")} delta={8} onAction={onAction} />
        <KpiFromDrilldown icon={<FileText className="size-[18px]" />} tone="indigo" item={drilldown("kpi:conversion")} delta={3} onAction={onAction} />
        <KpiFromDrilldown icon={<Wrench className="size-[18px]" />} tone="amber" item={drilldown("kpi:service-open")} delta={openService} onAction={onAction} />
        <KpiFromDrilldown icon={<AlertTriangle className="size-[18px]" />} tone="red" item={drilldown("kpi:overdue")} delta={Number(drilldown("kpi:overdue")?.records.length ?? 0)} alarm onAction={onAction} />
        <KpiFromDrilldown icon={<Package className="size-[18px]" />} tone="blue" item={drilldown("kpi:stock-risk")} delta={Number(drilldown("kpi:stock-risk")?.records.length ?? 0)} onAction={onAction} />
        <KpiFromDrilldown icon={<Truck className="size-[18px]" />} tone="violet" item={drilldown("kpi:shipments")} delta={Number(drilldown("kpi:shipments")?.records.length ?? 0)} onAction={onAction} />
        <KpiFromDrilldown icon={<BarChart3 className="size-[18px]" />} tone="emerald" item={drilldown("kpi:profit")} delta={4} onAction={onAction} />
        <Kpi icon={<Briefcase className="size-[18px]" />} tone="blue" label="Pipeline" value={`$${(totalPipeline / 1000).toFixed(0)}K`} delta={8} sub="açık" onClick={() => onAction?.({ kind: "navigate", nav: "sales-cases", focus: "open" })} />
        <Kpi icon={<Wrench className="size-[18px]" />} tone="amber" label="Aktif Makine" value={installedMachines} delta={1} sub="garantili" onClick={() => onAction?.({ kind: "navigate", nav: "machines" })} />
      </div>

      <MyTargetsPanel
        period={targetPeriod}
        onPeriodChange={setTargetPeriod}
        items={myTargetItems}
        loading={targetLoading}
        error={targetError}
        note={myTarget?.note ?? ""}
      />

      {/* Main charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
            <div>
              <CardTitle className="tracking-tight">Aylık Satış Performansı</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Son 6 ay · teklif vs kazanılan</p>
            </div>
            <div className="flex items-center gap-1">
              {(["1A", "3A", "6A", "1Y"] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={chartPeriod === p ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setChartPeriod(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="h-72 pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyView} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#000c69" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#000c69" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="ay" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="teklif" name="Teklif" stroke="#000c69" strokeWidth={2} fill="url(#g1)" isAnimationActive={false} />
                <Area type="monotone" dataKey="kazanan" name="Kazanan" stroke="#10b981" strokeWidth={2} fill="url(#g2)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Pipeline Dağılımı</CardTitle>
            <p className="text-xs text-muted-foreground">Aşamalara göre kart sayısı</p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stageData} dataKey="count" nameKey="name" outerRadius={75} innerRadius={48} paddingAngle={2} isAnimationActive={false}>
                  {stageData.map((d, i) => (
                    <Cell key={`pc-${d.name}`} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Secondary charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Satış Hunisi</CardTitle>
            <p className="text-xs text-muted-foreground">Lead → Kurulum dönüşümü</p>
          </CardHeader>
          <CardContent className="h-72 pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" margin={{ top: 4, right: 16, left: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" horizontal={false} />
                <XAxis type="number" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="#6b7280" fontSize={11} width={75} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#f4f0f3" }} contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Bar dataKey="value" barSize={22} fill="#000c69" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Departman Performansı</CardTitle>
            <p className="text-xs text-muted-foreground">KPI · 0–100 endeks</p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="konu" fontSize={11} stroke="#6b7280" />
                <PolarRadiusAxis angle={30} domain={[0, 100]} fontSize={9} stroke="#9ca3af" />
                <Radar dataKey="deger" stroke="#000c69" fill="#000c69" fillOpacity={0.35} strokeWidth={2} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Aylık Ciro</CardTitle>
            <p className="text-xs text-muted-foreground">Bin USD</p>
          </CardHeader>
          <CardContent className="h-72 pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="ay" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Line type="monotone" dataKey="ciro" stroke="#000c69" strokeWidth={2.5} dot={{ r: 4, fill: "#000c69", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bar + Goals */}
      <div className="grid grid-cols-1 items-start lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Kazanan vs Kaybedilen</CardTitle>
            <p className="text-xs text-muted-foreground">Aylık karşılaştırma</p>
          </CardHeader>
          <CardContent className="h-64 pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="ay" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="kazanan" name="Kazanan" fill="#10b981" barSize={18} isAnimationActive={false} />
                <Bar dataKey="kayip" name="Kaybedilen" fill="#ef4444" barSize={18} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Hedef Gerçekleşme</CardTitle>
            <p className="text-xs text-muted-foreground">Mayıs 2026</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <Goal label="Aylık Satış" value={62} hint="$260k / $420k" />
            <Goal label="Yeni Müşteri" value={78} hint="11 / 14" />
            <Goal label="Servis Memnuniyeti" value={91} hint="4.55 / 5.0" tone="ok" />
            <Goal label="Stok Devir Hızı" value={45} hint="Hedef altı" tone="warn" />
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 items-start lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div>
              <CardTitle className="tracking-tight">Açık Satış Kartları</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Takip edilmesi gerekenler</p>
            </div>
            <Button size="sm" variant="ghost" className="text-primary h-8" onClick={() => onAction?.({ kind: "navigate", nav: "sales-cases", focus: "open" })}>
              Tümü <ArrowUpRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border/60">
              {salesCases.filter((s) => !s.isLost && s.stage !== "Completed" && s.stage !== "delivered").slice(0, 6).map((s) => {
                const c = customers.find((x) => x.id === s.customerId);
                const u = users.find((x) => x.id === s.assignedUserId);
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 py-3 hover:bg-muted/40 -mx-3 px-3 rounded-md transition-colors cursor-pointer"
                    onClick={() => onAction?.({ kind: "salesCase", salesCaseId: s.id })}
                  >
                    <div className="size-9 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0 text-xs">
                      {(c?.name ?? "—").split(" ").slice(0, 2).map((p) => p[0]).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-tight truncate">{c?.name ?? "Firma bulunamadı"}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{s.requestedProduct} · {s.requestedModel} · {(u?.name ?? "Atanmadı").split(" ")[0]}</div>
                    </div>
                    <div className="text-sm tabular-nums shrink-0">{s.estimatedAmount.toLocaleString()} USD</div>
                    <StatusBadge status={s.stage} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div>
              <CardTitle className="tracking-tight">Açık Servis Talepleri</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Aktif {openService} kayıt</p>
            </div>
            <Button size="icon" variant="ghost" className="size-7"><MoreHorizontal className="size-4" /></Button>
          </CardHeader>
          <CardContent className="pt-0">
            {openService === 0 ? (
              <div className="grid min-h-[180px] place-items-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center">
                <div>
                  <div className="mx-auto grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="size-5" />
                  </div>
                  <div className="mt-3 text-sm font-medium">Açık servis talebi yok</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Yeni talep geldiğinde bu alanda takip edilecek.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {serviceRequests.filter((s) => s.stage !== "Closed").map((sr) => {
                const m = machines.find((x) => x.id === sr.machineId);
                const c = customers.find((x) => x.id === sr.customerId);
                return (
                  <div key={sr.id} className="flex items-center justify-between gap-2.5 py-3">
                    <div className="size-8 rounded-md bg-amber-50 text-amber-600 grid place-items-center shrink-0">
                      <Wrench className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-tight truncate">{c?.name ?? "Firma bulunamadı"}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{m ? `${m.model} · ${m.serialNumber}` : "Makine bağlı değil"}</div>
                    </div>
                    <StatusBadge status={sr.stage} />
                  </div>
                );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const WORK_TONE: Record<WorkItem["severity"], { cls: string; icon: React.ReactNode; label: string }> = {
  critical: { cls: "bg-red-50 text-red-700 border-red-100", icon: <AlertTriangle className="size-4" />, label: "Kritik" },
  warning: { cls: "bg-amber-50 text-amber-700 border-amber-100", icon: <Clock className="size-4" />, label: "Takip" },
  info: { cls: "bg-blue-50 text-blue-700 border-blue-100", icon: <Calendar className="size-4" />, label: "Bilgi" },
  success: { cls: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: <CheckCircle2 className="size-4" />, label: "Tamam" },
};

function KpiFromDrilldown({
  icon,
  item,
  tone,
  delta,
  alarm,
  onAction,
}: {
  icon: React.ReactNode;
  item?: KpiDrilldown;
  tone: keyof typeof TONES;
  delta: number;
  alarm?: boolean;
  onAction?: (action: OperationAction) => void;
}) {
  if (!item) return null;
  return (
    <Kpi
      icon={icon}
      tone={tone}
      label={item.label}
      value={item.value}
      delta={delta}
      sub={`${item.records.length} kayıt`}
      alarm={alarm || item.severity === "critical"}
      onClick={() => onAction?.(item.action)}
    />
  );
}

function ManagementCommandCenter({
  summary,
  onAction,
}: {
  summary: { risks: ManagementInsight[]; opportunities: ManagementInsight[]; actions: ManagementInsight[]; trends: ManagementInsight[] };
  onAction?: (action: OperationAction) => void;
}) {
  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="tracking-tight">Yönetim Merkezi</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Riskler, fırsatlar ve bugünkü aksiyonlar mevcut kayıtlardan otomatik hesaplanır</p>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={() => onAction?.({ kind: "navigate", nav: "reports" })}>
          Rapor Detayı <ArrowUpRight className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-4">
        <InsightColumn title="Riskler" empty="Aktif yönetim riski yok" items={summary.risks.slice(0, 3)} onAction={onAction} />
        <InsightColumn title="Fırsatlar" empty="Yeni fırsat sinyali yok" items={summary.opportunities.slice(0, 3)} onAction={onAction} />
        <InsightColumn title="Aksiyon" empty="Acil aksiyon yok" items={summary.actions.slice(0, 3)} onAction={onAction} />
        <InsightColumn title="Trend" empty="Trend verisi yok" items={summary.trends.slice(0, 3)} onAction={onAction} />
      </CardContent>
    </Card>
  );
}

function InsightColumn({
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
          items.map((item) => {
            const tone = WORK_TONE[item.severity];
            return (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-white/70"
                onClick={() => onAction?.(item.action)}
              >
                <span className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border ${tone.cls}`}>
                  {tone.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{item.title}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{item.metric}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function TodayWorkPanel({ items, onAction }: { items: WorkItem[]; onAction?: (action: OperationAction) => void }) {
  const shown = items.slice(0, 8);

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="tracking-tight">Bugün Yapılacaklar</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Ödeme, satış, servis, sevkiyat ve stoktan otomatik türetilen operasyon listesi</p>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={() => onAction?.({ kind: "navigate", nav: "payments", focus: "overdue" })}>
          Gecikenler <ArrowUpRight className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {shown.length === 0 ? (
          <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-5 text-center">
            <div>
              <div className="mx-auto grid size-9 place-items-center rounded-md bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="size-5" />
              </div>
              <div className="mt-2 text-sm font-medium">Acil takip işi yok</div>
              <p className="mt-1 text-xs text-muted-foreground">Yeni kayıtlar veya yaklaşan vadeler oluştuğunda burada görünecek.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {shown.map((item) => {
              const tone = WORK_TONE[item.severity];
              return (
                <button
                  key={item.id}
                  type="button"
                  className="min-w-0 rounded-lg border border-border/60 bg-white p-3 text-left transition-colors hover:border-primary/30 hover:bg-muted/30"
                  onClick={() => onAction?.(item.action)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${tone.cls}`}>
                      {tone.icon}
                      {tone.label}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{item.owner}</span>
                  </div>
                  <div className="mt-2 truncate text-sm font-medium">{item.title}</div>
                  <div className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">{item.subtitle}</div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{item.meta}</span>
                    <ArrowUpRight className="size-3.5 shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MyTargetsPanel({
  period,
  onPeriodChange,
  items,
  loading,
  error,
  note,
}: {
  period: string;
  onPeriodChange: (period: string) => void;
  items: AssignedTargetItem[];
  loading: boolean;
  error: string;
  note?: string | null;
}) {
  const salesItems = items.filter((item) => item.targetType === "sales");
  const serviceItems = items.filter((item) => item.targetType === "service");
  const hasItems = items.length > 0;

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 tracking-tight">
            <span className="grid size-8 place-items-center rounded-md bg-brand-blue-soft text-brand-blue">
              <Target className="size-4" />
            </span>
            Hedeflerim
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Size atanmış aylık satış ve servis hedefleri · USD sabit</p>
        </div>
        <Input
          type="month"
          className="h-9 w-full sm:w-[150px]"
          value={period}
          onChange={(e) => onPeriodChange(e.target.value || currentPeriod())}
        />
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {loading ? (
          <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-sm text-muted-foreground">
            Hedefler yükleniyor…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : !hasItems ? (
          <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center">
            <div>
              <div className="mx-auto grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-500">
                <Target className="size-5" />
              </div>
              <div className="mt-3 text-sm font-medium">Bu dönem için hedef atanmadı</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Yöneticiniz hedef atadığında bu alanda görüntülenecek.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <TargetSummary label="Satış" value={`${filledTargetCount(items, "sales")}/${totalTargetCount(items, "sales")}`} />
              <TargetSummary label="Servis" value={`${filledTargetCount(items, "service")}/${totalTargetCount(items, "service")}`} />
              <TargetSummary label="Para Birimi" value="USD" />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <TargetList title="Satış Hedefleri" items={salesItems} />
              <TargetList title="Servis Hedefleri" items={serviceItems} />
            </div>
            {note && <div className="rounded-md bg-muted/35 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{note}</div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TargetSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function TargetList({ title, items }: { title: string; items: AssignedTargetItem[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/25 px-3 py-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{items.filter((item) => item.target?.trim()).length} aktif</div>
      </div>
      <div className="max-h-[340px] divide-y divide-border/60 overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Hedef yok.</div>
        ) : (
          items.map((item) => (
            <div key={`${item.targetType}:${item.category}:${item.activity}`} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">{item.category} · {targetTypeLabel(item.targetType)}</div>
                  <div className="mt-0.5 text-sm font-medium leading-snug">{item.activity}</div>
                  {item.description && <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</div>}
                </div>
                <div className="shrink-0 rounded-md bg-brand-blue-soft px-2 py-1 text-right text-xs font-medium tabular-nums text-brand-blue">
                  {formatTargetValue(item)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const TONES: Record<string, { bg: string; ic: string; ring: string }> = {
  violet: { bg: "bg-brand-blue-soft", ic: "text-brand-blue", ring: "ring-blue-100" },
  blue: { bg: "bg-blue-50", ic: "text-blue-600", ring: "ring-blue-100" },
  indigo: { bg: "bg-indigo-50", ic: "text-indigo-600", ring: "ring-indigo-100" },
  emerald: { bg: "bg-emerald-50", ic: "text-emerald-600", ring: "ring-emerald-100" },
  amber: { bg: "bg-amber-50", ic: "text-amber-600", ring: "ring-amber-100" },
  red: { bg: "bg-red-50", ic: "text-red-600", ring: "ring-red-100" },
};

function Kpi({
  icon, label, value, delta, sub, tone = "violet", alarm, onClick,
}: { icon: React.ReactNode; label: string; value: number | string; delta: number; sub: string; tone?: keyof typeof TONES; alarm?: boolean; onClick?: () => void }) {
  const t = TONES[tone];
  const positive = delta >= 0;
  return (
    <Card
      className={`border-border/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden ${onClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35" : ""}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className={`size-9 rounded-lg ${t.bg} ${t.ic} grid place-items-center shrink-0 ring-4 ${t.ring}`}>
            {icon}
          </div>
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full ${
              alarm
                ? "bg-red-50 text-red-700"
                : positive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {Math.abs(delta)}{!alarm && "%"}
          </span>
        </div>
        <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <div className="text-[22px] tabular-nums tracking-tight leading-none truncate">{value}</div>
          <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
        </div>
        <div className="h-7 -mx-1 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line type="monotone" dataKey="v" stroke={alarm ? "#ef4444" : "#000c69"} strokeWidth={1.8} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function Goal({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: "warn" | "ok" }) {
  const color = tone === "warn" ? "text-red-600" : tone === "ok" ? "text-emerald-600" : "text-foreground";
  const Icon = tone === "warn" ? AlertTriangle : tone === "ok" ? CheckCircle2 : Clock;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          <Icon className={`size-3.5 ${color}`} />
          <span>{label}</span>
        </div>
        <span className={`tabular-nums text-[13px] ${color}`}>{value}%</span>
      </div>
      <Progress value={value} className="h-1.5 mt-1.5" />
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}
