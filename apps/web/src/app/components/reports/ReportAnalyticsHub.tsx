import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { adminService, reportService } from "../../../lib/services";
import { ExportExcelButton } from "../ui/ExportExcelButton";
import { useAuth } from "../../../lib/auth";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(period: string) {
  const [year, month] = period.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1));
  return {
    from: `${period}-01`,
    to: new Date(nextMonth.getTime() - 1).toISOString(),
  };
}

type DeptPerfRow = {
  departmentId: string;
  departmentName: string;
  memberCount: number;
  targets: { departmentSalesAmount: number; departmentQuoteTarget: number };
  actuals: { wonValue: number; quotesCreated: number; wonOpportunities: number; openOpportunities: number };
  attainment: { salesPct: number | null; quotePct: number | null };
};

const COMPLAINT_SOURCE_LABELS: Record<string, string> = {
  qr: "QR",
  web: "Web",
  phone: "Telefon",
  whatsapp: "WhatsApp",
  email: "E-posta",
  manual: "İç kayıt",
};

const COMPLAINT_SEVERITY_LABELS: Record<string, string> = {
  low: "Düşük",
  normal: "Normal",
  high: "Yüksek",
  critical: "Kritik",
};

export function ReportAnalyticsHub() {
  const { hasPermission } = useAuth();
  const canExport = hasPermission("reports.export");
  const [period, setPeriod] = useState(currentPeriod());
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [deptReport, setDeptReport] = useState<DeptPerfRow[]>([]);
  const [pipeline, setPipeline] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [complaintSummary, setComplaintSummary] = useState<any | null>(null);
  const [warrantyExpiring, setWarrantyExpiring] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [depts, deptPerf, pipe, st, vis, complaints, warranty] = await Promise.all([
        adminService.departments(),
        reportService.departmentPerformance({
          period,
          ...(departmentId !== "all" ? { departmentId } : {}),
        }),
        reportService.pipelineSummary(),
        reportService.stockSummary(),
        reportService.monthlyActivities(monthRange(period)),
        reportService.serviceComplaintsSummary(),
        reportService.warrantyExpiring({ days: 60 }),
      ]);
      setDepartments(depts as any[]);
      setDeptReport((deptPerf as any)?.departments ?? []);
      setPipeline(Array.isArray(pipe) ? pipe : []);
      setStock(Array.isArray(st) ? st : []);
      setActivities(Array.isArray(vis) ? vis : []);
      setComplaintSummary(complaints ?? null);
      setWarrantyExpiring(Array.isArray(warranty) ? warranty : []);
    } catch (err: any) {
      toast.error("Analitik veriler yüklenemedi", { description: err?.message });
    } finally {
      setLoading(false);
    }
  }, [period, departmentId]);

  useEffect(() => {
    load();
  }, [load]);

  const deptChart = useMemo(
    () =>
      deptReport.map((d) => ({
        name: d.departmentName,
        hedef: d.targets.departmentSalesAmount,
        gerceklesen: d.actuals.wonValue,
        teklifHedef: d.targets.departmentQuoteTarget,
        teklif: d.actuals.quotesCreated,
      })),
    [deptReport]
  );

  const pipelineChart = useMemo(
    () =>
      pipeline.map((p) => ({
        name: p.stageName ?? p.stageCode ?? "—",
        adet: Number(p.count ?? 0),
        tutar: Number(p.totalValue ?? 0),
      })),
    [pipeline]
  );

  const stockChart = useMemo(
    () =>
      stock.map((s) => ({
        name: s.statusName ?? s.status ?? "—",
        adet: Number(s.count ?? 0),
      })),
    [stock]
  );

  const activityChart = useMemo(
    () =>
      activities.map((v) => ({
        name: v.bucket ?? "—",
        aktivite: Number(v.count ?? 0),
      })),
    [activities]
  );

  const complaintSourceChart = useMemo(
    () =>
      (complaintSummary?.bySource ?? []).map((row: any) => ({
        name: COMPLAINT_SOURCE_LABELS[row.source] ?? row.source ?? "—",
        adet: Number(row.count ?? 0),
      })),
    [complaintSummary]
  );

  const complaintSeverityChart = useMemo(
    () =>
      (complaintSummary?.bySeverity ?? []).map((row: any) => ({
        name: COMPLAINT_SEVERITY_LABELS[row.severity] ?? row.severity ?? "—",
        adet: Number(row.count ?? 0),
      })),
    [complaintSummary]
  );

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Veri Görselleştirme & Excel Raporları</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Departman hedef/gerçekleşme, fırsat, stok ve aktivite analitiği — sunucu verisi.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">Dönem</Label>
              <Input type="month" className="mt-1 h-9 w-[150px]" value={period} onChange={(e) => setPeriod(e.target.value || currentPeriod())} />
            </div>
            <div>
              <Label className="text-xs">Departman</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="mt-1 h-9 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" className="gap-1" onClick={load} disabled={loading}>
              <RefreshCw className="size-4" /> Yenile
            </Button>
            {canExport && (
              <>
                <ExportExcelButton
                  path="/reports/export/department-performance"
                  filename={`departman-raporu-${period}.xlsx`}
                  params={{ period, ...(departmentId !== "all" ? { departmentId } : {}) }}
                  label="Departman Excel"
                />
                <ExportExcelButton
                  path="/reports/export/pipeline-summary"
                  filename="pipeline-summary.xlsx"
                  label="Fırsat Excel"
                  variant="secondary"
                />
                <ExportExcelButton
                  path="/reports/export/stock-summary"
                  filename="stock-summary.xlsx"
                  label="Stok Excel"
                  variant="secondary"
                />
                <ExportExcelButton
                  path="/exports/deliveries"
                  filename="teslimatlar.xlsx"
                  label="Teslimat Excel"
                  variant="secondary"
                />
                <ExportExcelButton
                  path="/exports/shipments"
                  filename="sevkiyatlar.xlsx"
                  label="Sevkiyat Excel"
                  variant="secondary"
                />
                <ExportExcelButton
                  path="/exports/service-tickets"
                  filename="servis-talepleri.xlsx"
                  label="Servis Excel"
                  variant="secondary"
                />
                <ExportExcelButton
                  path="/exports/service-complaints"
                  filename="sikayet-kutusu.xlsx"
                  label="Şikayet Excel"
                  variant="secondary"
                />
              </>
            )}
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Şikayet Kutusu Özeti" className="lg:col-span-2">
            <div className="grid gap-3 md:grid-cols-6">
              {[
                ["Toplam", complaintSummary?.total ?? 0],
                ["Yeni", complaintSummary?.new ?? 0],
                ["İnceleniyor", complaintSummary?.reviewing ?? 0],
                ["Servise Çevrildi", complaintSummary?.converted ?? 0],
                ["Reddedildi", complaintSummary?.rejected ?? 0],
                ["Garanti İşaretli", complaintSummary?.warrantyClaim ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-border/60 bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 text-xl font-semibold">{Number(value).toLocaleString("tr-TR")}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={complaintSourceChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="adet" name="Kaynak" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={complaintSeverityChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="adet" name="Öncelik" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Garanti Süresi Yaklaşan Makineler">
            <div className="space-y-2">
              {warrantyExpiring.slice(0, 6).map((row: any) => (
                <div key={row.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.serialNumber ?? row.id}</div>
                    <div className="text-xs text-muted-foreground">Firma: {row.companyId ?? "—"}</div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">{row.warrantyEndDate?.slice?.(0, 10) ?? "Tarih yok"}</div>
                </div>
              ))}
              {warrantyExpiring.length === 0 && (
                <div className="rounded-md border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                  Önümüzdeki 60 gün içinde garanti bitişi görünmüyor.
                </div>
              )}
            </div>
          </ChartCard>

          <ChartCard title="Departman — Satış Hedef vs Gerçekleşen (USD)">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="hedef" name="Hedef" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gerceklesen" name="Gerçekleşen" fill="#000c69" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Departman — Teklif Hedef vs Gerçekleşen">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="teklifHedef" name="Teklif Hedefi" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="teklif" name="Oluşturulan Teklif" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Satış Fırsatları">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pipelineChart} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="adet" name="Fırsat" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Stok Durumu">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stockChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="adet" name="Adet" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {activityChart.length > 0 && (
            <ChartCard title="Aylık Aktivite Trendi" className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={activityChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="aktivite" name="Aktivite" stroke="#000c69" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          <Card className="border-border/60 shadow-sm lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Departman Özet Tablosu</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Departman</th>
                    <th className="py-2 pr-3">Üye</th>
                    <th className="py-2 pr-3">Satış Hedef</th>
                    <th className="py-2 pr-3">Satış Gerç.</th>
                    <th className="py-2 pr-3">%</th>
                    <th className="py-2 pr-3">Teklif Hedef</th>
                    <th className="py-2 pr-3">Teklif</th>
                    <th className="py-2">Açık Fırsat Tutarı</th>
                  </tr>
                </thead>
                <tbody>
                  {deptReport.map((d) => (
                    <tr key={d.departmentId} className="border-b border-border/40">
                      <td className="py-2 pr-3 font-medium">{d.departmentName}</td>
                      <td className="py-2 pr-3">{d.memberCount}</td>
                      <td className="py-2 pr-3">{d.targets.departmentSalesAmount.toLocaleString("tr-TR")}</td>
                      <td className="py-2 pr-3">{d.actuals.wonValue.toLocaleString("tr-TR")}</td>
                      <td className="py-2 pr-3">{d.attainment.salesPct != null ? `%${d.attainment.salesPct}` : "—"}</td>
                      <td className="py-2 pr-3">{d.targets.departmentQuoteTarget}</td>
                      <td className="py-2 pr-3">{d.actuals.quotesCreated}</td>
                      <td className="py-2">{d.actuals.openOpportunities}</td>
                    </tr>
                  ))}
                  {deptReport.length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Bu dönem için departman verisi yok.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`border-border/60 shadow-sm ${className ?? ""}`}>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
