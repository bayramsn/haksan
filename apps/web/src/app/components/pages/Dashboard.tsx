import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Progress } from "../ui/progress";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Users, Briefcase, FileText, AlertTriangle, TrendingUp, TrendingDown,
  Package, Wrench, Target, ArrowUpRight, Calendar,
  CheckCircle2, Clock, Wallet, Truck, BarChart3, LayoutDashboard, ListTodo, LineChart as LineChartIcon,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend, LineChart, Line, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { SALES_STAGES, SALES_STAGE_LABELS, salesStageLabel } from "../../lib/mock";
import { StatusBadge } from "../Layout";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { useFx } from "../../lib/fx";
import { buildSalesMonthly, buildFunnelFromCases, buildPipelineFunnel, buildPipelineStagePie } from "../../lib/chartAggregates";
import { reportService } from "../../../lib/services";
import {
  buildManagementInsights,
  buildWorkItems,
  type KpiDrilldown,
  type ManagementInsight,
  type OperationAction,
  type WorkItem,
} from "../../lib/operations";

const COLORS = ["#000c69", "#cf060c", "#3b82f6", "#10b981", "#f59e0b", "#64748b", "#0ea5e9", "#14b8a6", "#ef4444", "#334155", "#fbbf24", "#60a5fa"];

type AssignedTargetItem = {
  targetType: "sales" | "service" | "finance" | "purchase" | "operations" | "logistics" | "other";
  category: string;
  activity: string;
  description?: string;
  unit: "count" | "amount";
  target: string;
  metricKey?: string | null;
  trackingMode?: "automatic" | "manual";
  actual?: number | null;
  pct?: number | null;
};
type MetricProgress = { target: number | null; actual: number | null; pct: number | null };
type AssignedTarget = {
  period: string;
  targetItems?: AssignedTargetItem[];
  note?: string | null;
  metrics?: Record<string, MetricProgress>;
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

const TARGET_TYPE_ORDER: AssignedTargetItem["targetType"][] = ["sales", "service", "finance", "purchase", "operations", "logistics", "other"];
const TARGET_TYPE_LABEL: Record<AssignedTargetItem["targetType"], string> = {
  sales: "Satış",
  service: "Servis",
  finance: "Finans",
  purchase: "Satınalma",
  operations: "Operasyon",
  logistics: "Lojistik",
  other: "Diğer",
};
const METRIC_LABEL: Record<string, string> = {
  salesAmount: "Satış Cirosu",
  salesNewCustomers: "Yeni Müşteri",
  quoteTarget: "Teklif",
  visitTarget: "Ziyaret",
  callTarget: "Arama",
  serviceCompleted: "Tamamlanan Servis",
  serviceAmount: "Servis Cirosu",
  digitalLeadTarget: "Dijital Lead",
  paymentsInAmount: "Tahsilat",
  purchaseInvoiceAmount: "Alış Faturası",
  purchaseOrderAmount: "Satınalma Tutarı",
  purchaseOrderCount: "Satınalma Siparişi",
  salesOrderAmount: "Satış Sipariş Tutarı",
  salesOrderCount: "Satış Siparişi",
  installationCompleted: "Kurulum",
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
const targetTypeLabel = (type: AssignedTargetItem["targetType"]) => TARGET_TYPE_LABEL[type] ?? type;
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
type DashboardSection = "ozet" | "operasyon" | "grafikler" | "hedefler";

export function DashboardPage({ onAction }: { onAction?: (action: OperationAction) => void }) {
  const store = useStore();
  const { customers, cases: salesCases, service: serviceRequests, machines, users, offers } = store;
  const { user } = useAuth();
  const { convert } = useFx();
  const [targetPeriod, setTargetPeriod] = useState(currentPeriod());
  const [myTarget, setMyTarget] = useState<AssignedTarget | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState("");
  const [section, setSection] = useState<DashboardSection>("ozet");
  const [chartPeriod, setChartPeriod] = useState<"1A" | "3A" | "6A" | "1Y">("6A");
  const [pipelineRows, setPipelineRows] = useState<Array<{ stageName?: string; count?: number; sortOrder?: number }>>([]);
  const monthCount = { "1A": 1, "3A": 3, "6A": 6, "1Y": 12 }[chartPeriod];
  const monthly = useMemo(
    () => buildSalesMonthly(offers, salesCases, 12, (amount, currency) => convert(amount, currency, "USD")),
    [offers, salesCases, convert],
  );
  const monthlyView = monthly.slice(-monthCount);
  const storeFunnel = useMemo(() => buildFunnelFromCases(salesCases, SALES_STAGE_LABELS), [salesCases]);
  const funnelData = useMemo(() => {
    if (pipelineRows.length > 0) {
      const api = buildPipelineFunnel(pipelineRows);
      if (api.length > 0) return api;
    }
    return storeFunnel;
  }, [pipelineRows, storeFunnel]);
  const storeStageData = useMemo(
    () =>
      SALES_STAGES.map((s) => ({
        name: salesStageLabel(s),
        count: salesCases.filter((sc) => sc.stage === s).length,
      })).filter((d) => d.count > 0),
    [salesCases],
  );
  const stageData = useMemo(() => {
    if (pipelineRows.length > 0) {
      const api = buildPipelineStagePie(pipelineRows);
      if (api.length > 0) return api;
    }
    return storeStageData;
  }, [pipelineRows, storeStageData]);
  const radarData = useMemo(() => {
    const total = Math.max(customers.length, 1);
    const openSvc = serviceRequests.filter((s) => s.stage !== "Closed").length;
    const approved = offers.filter((o) => o.status === "Approved").length;
    const overdue = store.payments.filter((p) => p.status === "Overdue").length;
    return [
      { konu: "Satış", deger: Math.min(100, Math.round((salesCases.filter((s) => !s.isLost).length / total) * 100)) },
      { konu: "Teklif", deger: Math.min(100, Math.round((offers.length / Math.max(total, 1)) * 20)) },
      { konu: "Tahsilat", deger: Math.min(100, Math.max(0, 100 - overdue * 15)) },
      { konu: "Servis", deger: Math.min(100, openSvc * 12) },
      { konu: "Stok", deger: Math.min(100, store.stock.filter((s) => s.quantity > 0).length * 8) },
      { konu: "Onay", deger: Math.min(100, approved * 10) },
    ];
  }, [customers.length, salesCases, offers, serviceRequests, store.stock, store.payments]);
  const activeCustomers = customers.filter((c) => c.status === "active").length;
  const openService = serviceRequests.filter((s) => s.stage !== "Closed").length;
  const installedMachines = machines.filter((m) => m.status === "Active").length;
  const workItems = useMemo(() => buildWorkItems(store), [store]);
  const management = useMemo(() => buildManagementInsights(store), [store]);
  const drilldown = (id: string) => management.kpis.find((item) => item.id === id);
  const criticalWork = workItems.filter((item) => item.severity === "critical").length;
  const warningWork = workItems.filter((item) => item.severity === "warning").length;
  const openSalesCount = salesCases.filter((s) => !s.isLost && s.stage !== "Completed" && s.stage !== "delivered").length;
  const overdueCount = Number(drilldown("kpi:overdue")?.records.length ?? 0);
  const priorityWork = useMemo(
    () => [...workItems].sort((a, b) => {
      const rank = { critical: 0, warning: 1, info: 2, success: 3 };
      return rank[a.severity] - rank[b.severity];
    }).slice(0, 5),
    [workItems],
  );
  const topRisks = management.risks.slice(0, 2);
  const topOpportunities = management.opportunities.slice(0, 2);

  const totalPipeline = salesCases.filter((s) => !s.isLost).reduce((a, s) => a + s.estimatedAmount, 0);
  const myTargetItems = useMemo(() => {
    const items = Array.isArray(myTarget?.targetItems) ? myTarget!.targetItems! : [];
    return items.length > 0 ? items : synthesizeTargetItems(myTarget);
  }, [myTarget]);

  const targetAchievements = useMemo(() => {
    const metrics = myTarget?.metrics ?? {};
    return Object.entries(metrics)
      .filter(([, metric]) => metric.target != null && metric.target > 0)
      .map(([key, metric]) => {
        const pct = metric.pct ?? 0;
        const target = metric.target ?? 0;
        const actual = metric.actual ?? 0;
        return {
          label: METRIC_LABEL[key] ?? key,
          pct,
          hint: `${actual.toLocaleString("tr-TR")} / ${target.toLocaleString("tr-TR")}`,
          tone: pct >= 100 ? ("ok" as const) : pct < 60 ? ("warn" as const) : undefined,
        };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8);
  }, [myTarget]);

  useEffect(() => {
    let cancelled = false;
    reportService
      .pipelineSummary()
      .then((rows) => {
        if (!cancelled && Array.isArray(rows)) setPipelineRows(rows);
      })
      .catch(() => {
        if (!cancelled) setPipelineRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTargetLoading(true);
    setTargetError("");
    reportService.myTargetProgress({ period: targetPeriod })
      .then((progress) => {
        if (cancelled) return;
        const subject = Array.isArray(progress?.subjects) ? progress.subjects[0] : null;
        setMyTarget(subject ? {
          period: targetPeriod,
          targetItems: Array.isArray(subject.targetItems) ? subject.targetItems : [],
          metrics: subject.metrics ?? {},
          note: subject.note ?? "",
        } : null);
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
            <div className="text-[15px] tracking-tight">Hoş geldin {user?.fullName?.split(" ")[0] ?? "ekip"} 👋</div>
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
            onClick={() => setSection("operasyon")}
          >
            <Calendar className="size-4" /> Bugün
          </Button>
          <Button
            size="sm"
            className="bg-white text-primary hover:bg-white/90"
            onClick={() => onAction?.({ kind: "navigate", nav: "payments", focus: "overdue" })}
          >
            Gecikenler
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
      </div>

      <Tabs value={section} onValueChange={(v) => setSection(v as DashboardSection)} className="gap-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-muted/60 p-1 sm:inline-flex sm:h-10 sm:w-auto">
          <TabsTrigger value="ozet" className="gap-1.5 px-3">
            <LayoutDashboard className="size-4" />
            Özet
          </TabsTrigger>
          <TabsTrigger value="operasyon" className="gap-1.5 px-3">
            <ListTodo className="size-4" />
            Operasyon
            {workItems.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                {workItems.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="grafikler" className="gap-1.5 px-3">
            <LineChartIcon className="size-4" />
            Grafikler
          </TabsTrigger>
          <TabsTrigger value="hedefler" className="gap-1.5 px-3">
            <Target className="size-4" />
            Hedefler
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ozet" className="mt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi icon={<Users className="size-[18px]" />} tone="violet" label="Aktif Müşteri" value={activeCustomers} sub="bu ay" onClick={() => onAction?.({ kind: "navigate", nav: "customers" })} />
            <KpiFromDrilldown icon={<Wallet className="size-[18px]" />} tone="emerald" item={drilldown("kpi:revenue")} onAction={onAction} />
            <Kpi icon={<Briefcase className="size-[18px]" />} tone="blue" label="Pipeline" value={`$${(totalPipeline / 1000).toFixed(0)}K`} sub="açık" onClick={() => onAction?.({ kind: "navigate", nav: "sales-cases", focus: "open" })} />
            <KpiFromDrilldown icon={<AlertTriangle className="size-[18px]" />} tone="red" item={drilldown("kpi:overdue")} alarm onAction={onAction} />
            <KpiFromDrilldown icon={<Wrench className="size-[18px]" />} tone="amber" item={drilldown("kpi:service-open")} onAction={onAction} />
            <Kpi icon={<Wrench className="size-[18px]" />} tone="amber" label="Aktif Makine" value={installedMachines} sub="garantili" onClick={() => onAction?.({ kind: "navigate", nav: "machines" })} />
          </div>

          <OverviewPulseBar
            workItems={workItems.length}
            criticalWork={criticalWork}
            warningWork={warningWork}
            openSales={openSalesCount}
            openService={openService}
            overdue={overdueCount}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="border-border/60 shadow-sm lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="tracking-tight text-base">Satış Trendi</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">Son 6 ay · teklif ve kazanılan</p>
                </div>
                <Button size="sm" variant="ghost" className="h-8 text-primary" onClick={() => setSection("grafikler")}>
                  Detay <ArrowUpRight className="size-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="h-52 pl-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyView} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ozet-g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#000c69" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#000c69" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ozet-g2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="ay" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} width={28} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 11 }} />
                    <Area type="monotone" dataKey="teklif" name="Teklif" stroke="#000c69" strokeWidth={2} fill="url(#ozet-g1)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="kazanan" name="Kazanan" stroke="#10b981" strokeWidth={2} fill="url(#ozet-g2)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="tracking-tight text-base">Pipeline Dağılımı</CardTitle>
                <p className="text-xs text-muted-foreground">{openSalesCount} açık kart</p>
              </CardHeader>
              <CardContent className="h-52">
                {stageData.length === 0 ? (
                  <div className="grid h-full place-items-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-center">
                    <p className="text-xs text-muted-foreground">Açık satış kartı yok</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stageData} dataKey="count" nameKey="name" outerRadius={68} innerRadius={42} paddingAngle={2} isAnimationActive={false}>
                        {stageData.map((d, i) => (
                          <Cell key={`ozet-pc-${d.name}`} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 9 }} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <OverviewPriorityPanel items={priorityWork} onAction={onAction} onViewAll={() => setSection("operasyon")} />
            <OverviewSignalsPanel risks={topRisks} opportunities={topOpportunities} onAction={onAction} onViewAll={() => setSection("operasyon")} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <QuickSectionCard
              title="Operasyon"
              metric={String(workItems.length)}
              metricLabel="takip işi"
              description={`${criticalWork} kritik · ${warningWork} yakın takip`}
              icon={<ListTodo className="size-5" />}
              accent="blue"
              onClick={() => setSection("operasyon")}
            />
            <QuickSectionCard
              title="Grafikler & KPI"
              metric="6"
              metricLabel="grafik"
              description="Performans, huni, ciro ve departman analizi"
              icon={<LineChartIcon className="size-5" />}
              accent="emerald"
              onClick={() => setSection("grafikler")}
            />
            <QuickSectionCard
              title="Hedeflerim"
              metric={myTargetItems.length > 0 ? String(myTargetItems.length) : "—"}
              metricLabel="aktif hedef"
              description={targetLoading ? "Yükleniyor…" : myTargetItems.length > 0 ? `${targetPeriod} dönemi` : "Bu dönem hedefi yok"}
              icon={<Target className="size-5" />}
              accent="violet"
              onClick={() => setSection("hedefler")}
            />
          </div>
        </TabsContent>

        <TabsContent value="operasyon" className="mt-0 space-y-4">
          <ManagementCommandCenter summary={management} onAction={onAction} />
          <TodayWorkPanel items={workItems} onAction={onAction} />
          <OpenRecordsPanel
            salesCases={salesCases}
            customers={customers}
            users={users}
            serviceRequests={serviceRequests}
            machines={machines}
            openService={openService}
            onAction={onAction}
          />
        </TabsContent>

        <TabsContent value="grafikler" className="mt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
            <KpiFromDrilldown icon={<FileText className="size-[18px]" />} tone="indigo" item={drilldown("kpi:conversion")} onAction={onAction} />
            <KpiFromDrilldown icon={<Wrench className="size-[18px]" />} tone="amber" item={drilldown("kpi:service-open")} onAction={onAction} />
            <KpiFromDrilldown icon={<Package className="size-[18px]" />} tone="blue" item={drilldown("kpi:stock-risk")} onAction={onAction} />
            <KpiFromDrilldown icon={<Truck className="size-[18px]" />} tone="violet" item={drilldown("kpi:shipments")} onAction={onAction} />
            <KpiFromDrilldown icon={<BarChart3 className="size-[18px]" />} tone="emerald" item={drilldown("kpi:profit")} onAction={onAction} />
            <Kpi icon={<Wrench className="size-[18px]" />} tone="amber" label="Aktif Makine" value={installedMachines} sub="garantili" onClick={() => onAction?.({ kind: "navigate", nav: "machines" })} />
          </div>

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
                  aria-pressed={chartPeriod === p}
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
            <p className="text-xs text-muted-foreground">
              {pipelineRows.length > 0 ? "API pipeline özeti" : "Lead → Kurulum dönüşümü"}
            </p>
          </CardHeader>
          <CardContent className="h-72 pl-2">
            {funnelData.length === 0 ? (
              <div
                role="status"
                className="grid h-full place-items-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-center text-sm text-muted-foreground px-4"
              >
                Henüz satış kartı aşaması verisi yok.
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%" aria-label="Satış hunisi grafiği">
              <BarChart data={funnelData} layout="vertical" margin={{ top: 4, right: 16, left: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" horizontal={false} />
                <XAxis type="number" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="#6b7280" fontSize={11} width={75} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#f4f0f3" }} contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Bar dataKey="value" barSize={22} fill="#000c69" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            )}
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

      {/* Bar chart */}
      <Card className="border-border/60 shadow-sm">
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

        </TabsContent>

        <TabsContent value="hedefler" className="mt-0 space-y-4">
          <MyTargetsPanel
            period={targetPeriod}
            onPeriodChange={setTargetPeriod}
            items={myTargetItems}
            loading={targetLoading}
            error={targetError}
            note={myTarget?.note ?? ""}
          />
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="tracking-tight">Hedef Gerçekleşme</CardTitle>
              <p className="text-xs text-muted-foreground">Dönem özeti</p>
            </CardHeader>
            <CardContent className="grid gap-4 pt-2 sm:grid-cols-2">
              {targetAchievements.length === 0 ? (
                <div className="sm:col-span-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  Bu dönem için ölçülebilir hedef kalemi yok.
                </div>
              ) : (
                targetAchievements.map((g) => (
                  <Goal key={g.label} label={g.label} value={g.pct} hint={g.hint} tone={g.tone} />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewPulseBar({
  workItems,
  criticalWork,
  warningWork,
  openSales,
  openService,
  overdue,
}: {
  workItems: number;
  criticalWork: number;
  warningWork: number;
  openSales: number;
  openService: number;
  overdue: number;
}) {
  const pills = [
    { label: "Takip işi", value: workItems, tone: "bg-slate-100 text-slate-700" },
    { label: "Kritik", value: criticalWork, tone: criticalWork > 0 ? "bg-red-50 text-red-700 ring-1 ring-red-100" : "bg-slate-50 text-slate-500" },
    { label: "Yakın takip", value: warningWork, tone: warningWork > 0 ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100" : "bg-slate-50 text-slate-500" },
    { label: "Açık satış", value: openSales, tone: "bg-blue-50 text-blue-700 ring-1 ring-blue-100" },
    { label: "Açık servis", value: openService, tone: "bg-amber-50/80 text-amber-800 ring-1 ring-amber-100" },
    { label: "Geciken", value: overdue, tone: overdue > 0 ? "bg-red-50 text-red-700 ring-1 ring-red-100" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" },
  ];

  return (
    <Card className="border-border/60 bg-gradient-to-r from-muted/30 via-card to-muted/20 shadow-sm">
      <CardContent className="flex flex-wrap items-center gap-2 p-3 sm:gap-3 sm:p-4">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Canlı durum</span>
        {pills.map((pill) => (
          <span key={pill.label} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${pill.tone}`}>
            <span className="font-semibold tabular-nums">{pill.value}</span>
            <span className="text-[11px] opacity-80">{pill.label}</span>
          </span>
        ))}
      </CardContent>
    </Card>
  );
}

function OverviewPriorityPanel({
  items,
  onAction,
  onViewAll,
}: {
  items: WorkItem[];
  onAction?: (action: OperationAction) => void;
  onViewAll: () => void;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="tracking-tight text-base">Öncelikli İşler</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Bugün ilk bakılması gerekenler</p>
        </div>
        <Button size="sm" variant="ghost" className="h-8 text-primary" onClick={onViewAll}>
          Tümü <ArrowUpRight className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <div className="grid min-h-36 place-items-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 text-center">
            <div>
              <CheckCircle2 className="mx-auto size-8 text-emerald-500" />
              <p className="mt-2 text-sm font-medium">Acil iş yok</p>
              <p className="mt-1 text-xs text-muted-foreground">Güncel kayıtlar burada listelenir.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {items.map((item) => {
              const tone = WORK_TONE[item.severity];
              return (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full items-start gap-3 py-2.5 text-left transition-colors hover:bg-muted/30"
                  onClick={() => onAction?.(item.action)}
                >
                  <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border ${tone.cls}`}>
                    {tone.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{item.title}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{tone.label}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.subtitle}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewSignalsPanel({
  risks,
  opportunities,
  onAction,
  onViewAll,
}: {
  risks: ManagementInsight[];
  opportunities: ManagementInsight[];
  onAction?: (action: OperationAction) => void;
  onViewAll: () => void;
}) {
  const signals = [
    ...risks.map((item) => ({ ...item, kind: "risk" as const })),
    ...opportunities.map((item) => ({ ...item, kind: "opportunity" as const })),
  ].slice(0, 4);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="tracking-tight text-base">Sinyaller</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Risk ve fırsat özeti</p>
        </div>
        <Button size="sm" variant="ghost" className="h-8 text-primary" onClick={onViewAll}>
          Merkez <ArrowUpRight className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {signals.length === 0 ? (
          <div className="grid min-h-36 place-items-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 text-center">
            <p className="text-sm text-muted-foreground">Aktif sinyal yok</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {signals.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onAction?.(item.action)}
                className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/30 ${
                  item.kind === "risk" ? "border-red-100/80 bg-red-50/40" : "border-emerald-100/80 bg-emerald-50/40"
                }`}
              >
                <span className={`mt-0.5 text-[10px] font-semibold uppercase tracking-wide ${item.kind === "risk" ? "text-red-600" : "text-emerald-600"}`}>
                  {item.kind === "risk" ? "Risk" : "Fırsat"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.metric}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickSectionCard({
  title,
  metric,
  metricLabel,
  description,
  icon,
  accent = "blue",
  onClick,
}: {
  title: string;
  metric: string;
  metricLabel: string;
  description: string;
  icon: React.ReactNode;
  accent?: "blue" | "emerald" | "violet";
  onClick: () => void;
}) {
  const accents = {
    blue: "from-brand-blue/10 to-brand-blue/5 border-brand-blue/20 text-brand-blue",
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-600",
    violet: "from-violet-500/10 to-violet-500/5 border-violet-500/20 text-violet-600",
  };
  const accentCls = accents[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full flex-col rounded-xl border bg-gradient-to-br p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${accentCls}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/80 shadow-sm">
          {icon}
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{metric}</span>
        <span className="text-xs text-muted-foreground">{metricLabel}</span>
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</div>
    </button>
  );
}

function OpenRecordsPanel({
  salesCases,
  customers,
  users,
  serviceRequests,
  machines,
  openService,
  onAction,
}: {
  salesCases: ReturnType<typeof useStore>["cases"];
  customers: ReturnType<typeof useStore>["customers"];
  users: ReturnType<typeof useStore>["users"];
  serviceRequests: ReturnType<typeof useStore>["service"];
  machines: ReturnType<typeof useStore>["machines"];
  openService: number;
  onAction?: (action: OperationAction) => void;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <Card className="border-border/60 shadow-sm lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="tracking-tight">Açık Satış Kartları</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Takip edilmesi gerekenler</p>
          </div>
          <Button size="sm" variant="ghost" className="h-8 text-primary" onClick={() => onAction?.({ kind: "navigate", nav: "sales-cases", focus: "open" })}>
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
                  className="-mx-3 flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-3 transition-colors hover:bg-muted/40"
                  onClick={() => onAction?.({ kind: "salesCase", salesCaseId: s.id })}
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-xs text-primary">
                    {(c?.name ?? "—").split(" ").slice(0, 2).map((p) => p[0]).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm leading-tight">{c?.name ?? "Firma bulunamadı"}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{s.requestedProduct} · {s.requestedModel} · {(u?.name ?? "Atanmadı").split(" ")[0]}</div>
                  </div>
                  <div className="shrink-0 text-sm tabular-nums">{s.estimatedAmount.toLocaleString()} USD</div>
                  <StatusBadge status={s.stage} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="tracking-tight">Açık Servis Talepleri</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Aktif {openService} kayıt</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-primary"
            onClick={() => onAction?.({ kind: "navigate", nav: "service-requests" })}
          >
            Tümü <ArrowUpRight className="size-3.5" />
          </Button>
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
                    <div className="grid size-8 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-600">
                      <Wrench className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm leading-tight">{c?.name ?? "Firma bulunamadı"}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{m ? `${m.model} · ${m.serialNumber}` : "Makine bağlı değil"}</div>
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
  delta?: number;
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
  const groups = TARGET_TYPE_ORDER
    .map((targetType) => ({
      targetType,
      items: items.filter((item) => item.targetType === targetType),
    }))
    .filter((group) => group.items.length > 0);
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
          <p className="mt-1 text-xs text-muted-foreground">Size atanmış aylık hedefler · ölçülebilenler sistemden takip edilir</p>
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
              <TargetSummary label="Aktif Hedef" value={`${items.filter((item) => item.target?.trim()).length}/${items.length}`} />
              <TargetSummary label="Otomatik Takip" value={`${items.filter((item) => item.trackingMode !== "manual" && item.metricKey).length}`} />
              <TargetSummary label="Para Birimi" value="USD" />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {groups.map((group) => (
                <TargetList key={group.targetType} title={`${targetTypeLabel(group.targetType)} Hedefleri`} items={group.items} />
              ))}
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
                  {item.actual != null && item.pct != null && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Gerçekleşen: {item.actual.toLocaleString("tr-TR")}</span>
                        <span>%{item.pct}</span>
                      </div>
                      <Progress value={Math.min(Math.max(item.pct, 0), 100)} className="mt-1 h-1.5" />
                    </div>
                  )}
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
}: { icon: React.ReactNode; label: string; value: number | string; delta?: number; sub: string; tone?: keyof typeof TONES; alarm?: boolean; onClick?: () => void }) {
  const t = TONES[tone];
  const positive = (delta ?? 0) >= 0;
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
          {delta !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full ${
              alarm
                ? "bg-red-50 text-red-700"
                : positive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-zinc-100 text-zinc-600"
            }`}
            aria-hidden
          >
            {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {alarm ? Math.abs(delta) : `${Math.abs(delta)}%`}
          </span>
          )}
        </div>
        <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <div className="text-[22px] tabular-nums tracking-tight leading-none truncate">{value}</div>
          <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
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
