import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Progress } from "../ui/progress";
import { Button } from "../ui/button";
import {
  Users, Briefcase, FileText, AlertTriangle, TrendingUp, TrendingDown,
  Package, Wrench, Target, ArrowUpRight, MoreHorizontal, Calendar,
  CheckCircle2, Clock,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend, LineChart, Line, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { SALES_STAGES, salesStageLabel } from "../../lib/mock";
import { StatusBadge } from "../Layout";
import { useStore } from "../../lib/store";

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

export function DashboardPage() {
  const { customers, cases: salesCases, payments, service: serviceRequests, stock: stockItems, machines, users } = useStore();
  const activeCustomers = customers.filter((c) => c.status === "active").length;
  const openCases = salesCases.filter((s) => !s.isLost && s.stage !== "Completed" && s.stage !== "delivered").length;
  const overdue = payments.filter((p) => p.status === "Overdue").length;
  const overdueAmount = payments.filter((p) => p.status === "Overdue").reduce((a, p) => a + p.amount, 0);
  const openService = serviceRequests.filter((s) => s.stage !== "Closed").length;
  const availableStock = stockItems.filter((s) => s.status === "Available").length;
  const installedMachines = machines.filter((m) => m.status === "Active").length;

  const stageData = SALES_STAGES.map((s) => ({
    name: salesStageLabel(s),
    count: salesCases.filter((sc) => sc.stage === s).length,
  })).filter((d) => d.count > 0);

  const totalPipeline = salesCases.filter((s) => !s.isLost).reduce((a, s) => a + s.estimatedAmount, 0);

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
              Bugün <b className="text-white">3</b> teklif onayı, <b className="text-white">2</b> sevkiyat ve <b className="text-white">1</b> servis ziyareti planlı.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" className="bg-white/15 hover:bg-white/25 text-white border-0 backdrop-blur">
            <Calendar className="size-4" /> Bugün
          </Button>
          <Button size="sm" className="bg-white text-primary hover:bg-white/90">
            Görevlerim
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={<Users className="size-[18px]" />} tone="violet" label="Aktif Müşteri" value={activeCustomers} delta={12} sub="bu ay" />
        <Kpi icon={<Briefcase className="size-[18px]" />} tone="blue" label="Açık Kart" value={openCases} delta={5} sub="yeni" />
        <Kpi icon={<FileText className="size-[18px]" />} tone="indigo" label="Pipeline" value={`€${(totalPipeline / 1000).toFixed(0)}K`} delta={8} sub="aylık" />
        <Kpi icon={<Package className="size-[18px]" />} tone="emerald" label="Hazır Stok" value={availableStock} delta={-2} sub="adet" />
        <Kpi icon={<Wrench className="size-[18px]" />} tone="amber" label="Aktif Makine" value={installedMachines} delta={1} sub="garantili" />
        <Kpi icon={<AlertTriangle className="size-[18px]" />} tone="red" label="Gecikmiş" value={`€${(overdueAmount / 1000).toFixed(1)}K`} delta={overdue} sub="kayıt" alarm />
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
              {["1A", "3A", "6A", "1Y"].map((p, i) => (
                <Button key={p} size="sm" variant={i === 2 ? "secondary" : "ghost"} className="h-7 px-2.5 text-xs">{p}</Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="h-72 pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
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
            <p className="text-xs text-muted-foreground">Bin Euro</p>
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
            <Goal label="Aylık Satış" value={62} hint="€260k / €420k" />
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
            <Button size="sm" variant="ghost" className="text-primary h-8">
              Tümü <ArrowUpRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border/60">
              {salesCases.filter((s) => !s.isLost && s.stage !== "Completed" && s.stage !== "delivered").slice(0, 6).map((s) => {
                const c = customers.find((x) => x.id === s.customerId);
                const u = users.find((x) => x.id === s.assignedUserId);
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-3 hover:bg-muted/40 -mx-3 px-3 rounded-md transition-colors cursor-pointer">
                    <div className="size-9 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0 text-xs">
                      {(c?.name ?? "—").split(" ").slice(0, 2).map((p) => p[0]).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-tight truncate">{c?.name ?? "Firma bulunamadı"}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{s.requestedProduct} · {s.requestedModel} · {(u?.name ?? "Atanmadı").split(" ")[0]}</div>
                    </div>
                    <div className="text-sm tabular-nums shrink-0">{s.estimatedAmount.toLocaleString()} {s.currency}</div>
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

const TONES: Record<string, { bg: string; ic: string; ring: string }> = {
  violet: { bg: "bg-brand-blue-soft", ic: "text-brand-blue", ring: "ring-blue-100" },
  blue: { bg: "bg-blue-50", ic: "text-blue-600", ring: "ring-blue-100" },
  indigo: { bg: "bg-indigo-50", ic: "text-indigo-600", ring: "ring-indigo-100" },
  emerald: { bg: "bg-emerald-50", ic: "text-emerald-600", ring: "ring-emerald-100" },
  amber: { bg: "bg-amber-50", ic: "text-amber-600", ring: "ring-amber-100" },
  red: { bg: "bg-red-50", ic: "text-red-600", ring: "ring-red-100" },
};

function Kpi({
  icon, label, value, delta, sub, tone = "violet", alarm,
}: { icon: React.ReactNode; label: string; value: number | string; delta: number; sub: string; tone?: keyof typeof TONES; alarm?: boolean }) {
  const t = TONES[tone];
  const positive = delta >= 0;
  return (
    <Card className="border-border/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
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
