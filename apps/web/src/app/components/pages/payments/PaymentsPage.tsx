import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { StatusBadge } from "../../Layout";
import { CreatePaymentDialog } from "../../dialogs/CreateDialogs";
import { PayKpi } from "../../shared/MiniKpi";
import { useStore } from "../../../lib/store";
import { buildPaymentMonthly, buildCurrencyPie } from "../../../lib/chartAggregates";
import { useFx, FxRateBadge, type FxCurrency } from "../../../lib/fx";
import { Payment } from "../../../lib/mock";
import { toast } from "sonner";
import { financeService, fileService } from "../../../../lib/services";
import { usePaged, Pager } from "../../ui/list-controls";
import { CreateAccountingInvoiceDialog } from "../finance/CreateAccountingInvoiceDialog";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import type { OperationFocus } from "../../../lib/operations";
import {
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area, PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import {
  Plus, Search, ArrowDownRight, ArrowUpRight, Wallet, Clock, Building2, Mail, Phone,
  Upload, FileText, Receipt, Eye, Save, Trash2,
} from "lucide-react";

export function PaymentsPage({ focus }: { focus?: OperationFocus }) {
  const { payments, customers, cases, refresh } = useStore();
  const { convert } = useFx();
  const [upcomingDues, setUpcomingDues] = useState<Array<{ id: string; companyName: string; dueDate: string; amount: number; currencyCode: string; type: string }>>([]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (p.paymentType === "expected" && p.salesCaseId) {
        const sc = cases.find((c) => c.id === p.salesCaseId);
        if (sc && sc.stage !== "delivered") {
          return false;
        }
      }
      return true;
    });
  }, [payments, cases]);

  useEffect(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 60);
    financeService
      .dueDates({ from: from.toISOString(), to: to.toISOString() })
      .then((rows) => setUpcomingDues((rows ?? []).slice(0, 5)))
      .catch(() => setUpcomingDues([]));
  }, [filteredPayments.length]);
  // Farklı para birimleri toplanamaz → USD bazına çevirip topla (genel/baz birim USD).
  const toUsd = (p: Payment) => convert(p.amount, p.currency, "USD");
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Paid" | "Pending" | "Overdue">("all");
  // Kasa yönü: tümü / alınan (giren) / ödenen (çıkan)
  const [dirFilter, setDirFilter] = useState<"all" | "in" | "out">("all");
  // Tıklanan kasa hareketi → detay + fiş/fatura pop-up'ı
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (focus === "overdue") setStatusFilter("Overdue");
    if (focus === "pending" || focus === "upcoming") setStatusFilter("Pending");
    if (focus === "paid") setStatusFilter("Paid");
  }, [focus]);

  // Tahsilat metrikleri yalnızca GİREN (alınan) hareketler üzerinden hesaplanır (USD karşılığı).
  const inflow = filteredPayments.filter((p) => p.direction === "in");
  const outflow = filteredPayments.filter((p) => p.direction === "out");
  const totalPaid = inflow.filter((p) => p.status === "Paid").reduce((s, p) => s + toUsd(p), 0);
  const totalPending = inflow.filter((p) => p.status === "Pending").reduce((s, p) => s + toUsd(p), 0);
  const totalOverdue = inflow.filter((p) => p.status === "Overdue").reduce((s, p) => s + toUsd(p), 0);

  // Kasa bakiyesi: gerçekleşen (Paid) giriş/çıkış, para birimi bazında ayrı.
  // Farklı para birimleri toplanamaz; her biri kendi satırında gösterilir.
  const KASA_CURRENCIES: Array<Payment["currency"]> = ["USD", "EUR", "TRY"];
  const kasa = KASA_CURRENCIES.map((cur) => {
    const gir = filteredPayments.filter((p) => p.direction === "in" && p.status === "Paid" && p.currency === cur).reduce((s, p) => s + p.amount, 0);
    const cik = filteredPayments.filter((p) => p.direction === "out" && p.status === "Paid" && p.currency === cur).reduce((s, p) => s + p.amount, 0);
    return { cur, gir, cik, net: gir - cik };
  }).filter((k) => k.gir || k.cik);
  const curSymbol = (c: Payment["currency"]) => (c === "USD" ? "$" : c === "EUR" ? "€" : "₺");
  const outPaidCount = outflow.filter((p) => p.status === "Paid").length;
  const outPendingTotalByCur = KASA_CURRENCIES.map((cur) => ({
    cur,
    amt: outflow.filter((p) => p.status !== "Paid" && p.currency === cur).reduce((s, p) => s + p.amount, 0),
  })).filter((x) => x.amt > 0);

  // Aging buckets (days past dueDate, Overdue + Pending past due)
  const today = new Date();
  const buckets = [
    { key: "0-30", label: "0–30 gün", color: "#fbbf24", value: 0 },
    { key: "31-60", label: "31–60 gün", color: "#f59e0b", value: 0 },
    { key: "61-90", label: "61–90 gün", color: "#f97316", value: 0 },
    { key: "90+", label: "90+ gün", color: "#ef4444", value: 0 },
  ];
  filteredPayments.forEach((p) => {
    if (p.status !== "Overdue") return;
    const d = (today.getTime() - new Date(p.dueDate).getTime()) / (1000 * 60 * 60 * 24);
    if (d <= 30) buckets[0].value += toUsd(p);
    else if (d <= 60) buckets[1].value += toUsd(p);
    else if (d <= 90) buckets[2].value += toUsd(p);
    else buckets[3].value += toUsd(p);
  });

  // Top debtors
  const debtorMap = new Map<string, number>();
  filteredPayments.filter((p) => p.status === "Overdue" || p.status === "Pending").forEach((p) => {
    debtorMap.set(p.customerId, (debtorMap.get(p.customerId) ?? 0) + toUsd(p));
  });
  const topDebtors = [...debtorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cid, amt]) => ({ cid, name: customerName(cid), amount: amt }));

  const filtered = filteredPayments.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (dirFilter !== "all" && p.direction !== dirFilter) return false;
    if (q && !customerName(p.customerId).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const { page, setPage, totalPages, pageItems } = usePaged(filtered, 12);

  const deletePayment = async (payment: Payment, event?: MouseEvent) => {
    event?.stopPropagation();
    if (payment.source !== "payment") {
      toast.error("Bu satır ödeme kaydı değil", { description: "Bekleyen alacak/vade satırları kasa hareketi olarak silinemez." });
      return;
    }
    if (!window.confirm(`${customerName(payment.customerId)} için ${payment.amount.toLocaleString("tr-TR")} ${payment.currency} kasa hareketini silmek istediğinize emin misiniz?`)) return;
    setDeletingPaymentId(payment.id);
    try {
      await financeService.deletePayment(payment.id);
      toast.success("Kasa hareketi silindi");
      if (selectedPayment?.id === payment.id) setSelectedPayment(null);
      refresh();
    } catch (err: any) {
      toast.error("Kasa hareketi silinemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setDeletingPaymentId(null);
    }
  };

  const payMonthly = useMemo(() => buildPaymentMonthly(filteredPayments, 6, (amount, currency) => convert(amount, currency as FxCurrency, "USD")), [filteredPayments, convert]);
  const currencyPie = useMemo(() => {
    const pie = buildCurrencyPie(filteredPayments);
    return pie.length ? pie : [{ name: "USD", value: 0, fill: "#000c69" }];
  }, [filteredPayments]);
  const cashflow = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const inMonth = filteredPayments.filter((p) => String(p.paidDate ?? "").startsWith(key) && p.status === "Paid");
    const days = [1, 5, 10, 15, 20, 25, 30];
    return days.map((gun) => {
      const dayRows = inMonth.filter((p) => new Date(p.paidDate ?? "").getDate() <= gun);
      const giris = dayRows.filter((p) => p.direction !== "out").reduce((s, p) => s + convert(p.amount, p.currency, "USD"), 0);
      const cikis = dayRows.filter((p) => p.direction === "out").reduce((s, p) => s + convert(p.amount, p.currency, "USD"), 0);
      return { gun: String(gun), giris: Math.round(giris / 1000), cikis: Math.round(cikis / 1000) };
    });
  }, [filteredPayments, convert]);

  return (
    <div className="space-y-5">
      {/* KPI strip — kasa odaklı */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PayKpi
          tone="emerald"
          icon={<ArrowDownRight className="size-[18px]" />}
          label="Alınan (Giren)"
          value={`$ ${(totalPaid / 1000).toFixed(1)}K`}
          sub={`${inflow.filter((p) => p.status === "Paid").length} tahsilat`}
        />
        <PayKpi
          tone="red"
          icon={<ArrowUpRight className="size-[18px]" />}
          label="Ödenen (Çıkan)"
          value={kasa.length ? kasa.map((k) => `${curSymbol(k.cur)}${(k.cik / 1000).toFixed(1)}K`).join(" · ") : "—"}
          sub={`${outPaidCount} ödeme`}
        />
        <PayKpi
          tone="violet"
          icon={<Wallet className="size-[18px]" />}
          label="Net Kasa"
          value={kasa.length ? kasa.map((k) => `${curSymbol(k.cur)}${(k.net / 1000).toFixed(1)}K`).join(" · ") : "—"}
          sub="gerçekleşen"
        />
        <PayKpi
          tone="amber"
          icon={<Clock className="size-[18px]" />}
          label="Bekleyen Tahsilat"
          value={`$ ${(totalPending / 1000).toFixed(1)}K`}
          sub={`${inflow.filter((p) => p.status === "Pending").length} kayıt`}
        />
      </div>

      {/* Kasa bakiyesi — para birimi bazında giren/çıkan/net */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="tracking-tight flex items-center gap-2"><Wallet className="size-4 text-emerald-600" /> Kasa Bakiyesi</CardTitle>
              <p className="text-xs text-muted-foreground">Gerçekleşen (ödenmiş) hareketler · para birimi bazında</p>
            </div>
            <FxRateBadge />
          </div>
        </CardHeader>
        <CardContent className="pt-1">
          {kasa.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Henüz gerçekleşmiş kasa hareketi yok.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {kasa.map((k) => (
                <div key={k.cur} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{k.cur} Kasa</span>
                    <span className={`text-sm tabular-nums font-medium ${k.net >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {curSymbol(k.cur)} {k.net.toLocaleString("tr-TR")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="inline-flex items-center gap-1 text-emerald-700"><ArrowDownRight className="size-3.5" /> Giren</span>
                    <span className="tabular-nums">{curSymbol(k.cur)} {k.gir.toLocaleString("tr-TR")}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] mt-1">
                    <span className="inline-flex items-center gap-1 text-red-600"><ArrowUpRight className="size-3.5" /> Çıkan</span>
                    <span className="tabular-nums">{curSymbol(k.cur)} {k.cik.toLocaleString("tr-TR")}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground">Net Bakiye</span>
                    <span className={`tabular-nums font-medium ${k.net >= 0 ? "text-emerald-700" : "text-red-600"}`}>{curSymbol(k.cur)} {k.net.toLocaleString("tr-TR")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {outPendingTotalByCur.length > 0 && (
            <div className="mt-3 text-[12px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Bekleyen ödeme (çıkış):</span>
              {outPendingTotalByCur.map((x) => (
                <span key={x.cur} className="tabular-nums text-amber-700">{curSymbol(x.cur)} {x.amt.toLocaleString("tr-TR")}</span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {upcomingDues.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight flex items-center gap-2 text-base">
              <Clock className="size-4 text-amber-600" /> Yaklaşan Vadeler
            </CardTitle>
            <p className="text-xs text-muted-foreground">Önümüzdeki 60 gün · en yakın 5 kayıt</p>
          </CardHeader>
          <CardContent className="divide-y divide-border/60">
            {upcomingDues.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.companyName}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(d.dueDate).toLocaleDateString("tr-TR")} · {d.type === "alacak" ? "Ödenecek" : "Tahsil"}
                  </div>
                </div>
                <div className="tabular-nums shrink-0 font-medium">
                  {d.amount.toLocaleString("tr-TR")} {d.currencyCode}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div>
              <CardTitle className="tracking-tight">Tahsilat & Bekleyen Trendi</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Son 6 ay · bin USD</p>
            </div>
            <div className="flex items-center gap-1">
              {["Haftalık", "Aylık", "Yıllık"].map((p, i) => (
                <Button key={p} size="sm" variant={i === 1 ? "secondary" : "ghost"} className="h-7 px-2.5 text-xs">{p}</Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="h-72 pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={payMonthly} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pgT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="pgB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="pgO" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="ay" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="tahsilat" name="Tahsilat" stroke="#10b981" strokeWidth={2} fill="url(#pgT)" isAnimationActive={false} />
                <Area type="monotone" dataKey="beklenen" name="Bekleyen" stroke="#f59e0b" strokeWidth={2} fill="url(#pgB)" isAnimationActive={false} />
                <Area type="monotone" dataKey="gecikmis" name="Gecikmiş" stroke="#ef4444" strokeWidth={2} fill="url(#pgO)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Para Birimi Dağılımı</CardTitle>
            <p className="text-xs text-muted-foreground">Aktif cari bakiye</p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={currencyPie} dataKey="value" nameKey="name" outerRadius={80} innerRadius={50} paddingAngle={3} isAnimationActive={false}>
                  {currencyPie.map((d) => (
                    <Cell key={`cur-${d.name}`} fill={d.fill} stroke="#fff" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} formatter={(v: any) => `%${v}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Aging + cashflow + top debtors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Yaşlandırma (Aging)</CardTitle>
            <p className="text-xs text-muted-foreground">Vadesi geçen alacaklar</p>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {buckets.map((b) => {
              const max = Math.max(...buckets.map((x) => x.value), 1);
              const pct = (b.value / max) * 100;
              return (
                <div key={b.key}>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="text-muted-foreground">{b.label}</span>
                    <span className="tabular-nums">$ {b.value.toLocaleString()}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: b.color }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-3 mt-2 border-t border-border/60 flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground">Toplam Gecikmiş</span>
              <span className="tabular-nums text-red-600">$ {totalOverdue.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Günlük Nakit Akışı</CardTitle>
            <p className="text-xs text-muted-foreground">Bu ay · giriş vs çıkış</p>
          </CardHeader>
          <CardContent className="h-56 pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashflow} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="gun" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="giris" name="Giriş" stroke="#10b981" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "#fff", stroke: "#10b981" }} isAnimationActive={false} />
                <Line type="monotone" dataKey="cikis" name="Çıkış" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "#fff", stroke: "#ef4444" }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div>
              <CardTitle className="tracking-tight">En Yüksek Borçlular</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Açık bakiye TOP 5</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-primary"
              onClick={() => {
                setStatusFilter("Overdue");
                setDirFilter("in");
              }}
            >
              Tümü
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border/60">
              {topDebtors.map((d, i) => {
                const cust = customers.find((c) => c.id === d.cid);
                const mail = cust?.email?.trim();
                const phone = (cust?.phone2 || cust?.phone || "").replace(/\s/g, "");
                return (
                <div key={d.cid} className="flex items-center gap-3 py-2.5 group hover:bg-muted/40 -mx-3 px-3 rounded-md transition-colors">
                  <div className="size-7 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center text-[10px] shrink-0">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] leading-tight truncate">{d.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">açık bakiye</div>
                  </div>
                  <div className="text-[13px] tabular-nums shrink-0">$ {d.amount.toLocaleString()}</div>
                  <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      disabled={!mail}
                      aria-label="E-posta gönder"
                      onClick={() => mail && (window.location.href = `mailto:${mail}`)}
                    >
                      <Mail className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      disabled={!phone}
                      aria-label="Telefon et"
                      onClick={() => phone && (window.location.href = `tel:${phone}`)}
                    >
                      <Phone className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );})}
              {topDebtors.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground">Açık bakiye yok</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="tracking-tight mr-2">Kasa Hareketleri</CardTitle>
            <Tabs value={dirFilter} onValueChange={(v) => setDirFilter(v as any)}>
              <TabsList className="h-8 bg-muted/60">
                <TabsTrigger value="all" className="text-xs">Tümü</TabsTrigger>
                <TabsTrigger value="in" className="text-xs gap-1.5">
                  <ArrowDownRight className="size-3 text-emerald-600" /> Alınan
                  <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] rounded-full bg-emerald-100 text-emerald-700">{inflow.length}</span>
                </TabsTrigger>
                <TabsTrigger value="out" className="text-xs gap-1.5">
                  <ArrowUpRight className="size-3 text-red-500" /> Ödenen
                  <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] rounded-full bg-red-100 text-red-700">{outflow.length}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <TabsList className="h-8 bg-muted/60">
                <TabsTrigger value="all" className="text-xs">Tümü</TabsTrigger>
                <TabsTrigger value="Paid" className="text-xs gap-1.5">
                  Tahsil
                  <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] rounded-full bg-emerald-100 text-emerald-700">
                    {filteredPayments.filter((p) => p.status === "Paid").length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="Pending" className="text-xs gap-1.5">
                  Bekleyen
                  <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] rounded-full bg-amber-100 text-amber-700">
                    {filteredPayments.filter((p) => p.status === "Pending").length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="Overdue" className="text-xs gap-1.5">
                  Gecikmiş
                  <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] rounded-full bg-red-100 text-red-700">
                    {filteredPayments.filter((p) => p.status === "Overdue").length}
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-auto lg:justify-end">
            <div className="relative w-full sm:w-64">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Firma ara..." className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ExportExcelButton path="/exports/finance" filename="kasa-hareketleri.xlsx" className="h-9 justify-center" />
            <CreateAccountingInvoiceDialog onCreated={refresh} trigger={<Button size="sm" variant="outline" className="h-9 gap-1"><Receipt className="size-4" /> Muhasebe Faturası</Button>} />
            <CreatePaymentDialog
              onCreated={refresh}
              defaultDirection={dirFilter === "out" ? "out" : "in"}
              trigger={<Button size="sm" className="h-9 gap-1 justify-center"><Plus className="size-4" /> Yeni Hareket</Button>}
            />
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[280px]">Firma</TableHead>
                <TableHead>Yön</TableHead>
                <TableHead>Fatura No</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Vade</TableHead>
                <TableHead>Ödeme Tarihi</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Not</TableHead>
                <TableHead className="w-20 text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((p) => {
                const overdueDays = p.status === "Overdue"
                  ? Math.floor((today.getTime() - new Date(p.dueDate).getTime()) / (1000 * 60 * 60 * 24))
                  : null;
                return (
                  <TableRow
                    key={p.id}
                    className="group cursor-pointer"
                    onClick={() => setSelectedPayment(p)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedPayment(p)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${customerName(p.customerId)} kasa hareketi, ${p.amount} ${p.currency}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                          <Building2 className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm leading-tight truncate">{customerName(p.customerId)}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">#{p.id.toUpperCase()}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
                        p.direction === "in"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}>
                        {p.direction === "in" ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
                        {p.direction === "in" ? "Alınan" : "Ödenen"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.invoiceNo || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={`text-sm ${p.direction === "in" ? "text-emerald-700" : "text-red-600"}`}>
                        {p.direction === "in" ? "+" : "−"}{p.amount.toLocaleString()}
                      </span>{" "}
                      <span className="text-[11px] text-muted-foreground">{p.currency}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm tabular-nums">{p.dueDate}</div>
                      {overdueDays !== null && overdueDays > 0 && (
                        <div className="text-[11px] text-red-600 mt-0.5">+{overdueDays} gün gecikmiş</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{p.paidDate ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground line-clamp-1 max-w-[220px]">{p.note}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Detay"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPayment(p);
                          }}
                        >
                          <Eye className="size-4" />
                        </Button>
                        {p.source === "payment" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-red-600"
                            title="Kasa hareketini sil"
                            disabled={deletingPaymentId === p.id}
                            onClick={(event) => deletePayment(p, event)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                    Bu filtreye uyan hareket bulunamadı.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/60 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            <b className="text-foreground">{filtered.length}</b> hareket · toplam ≈{" "}
            <b className="text-foreground">$ {Math.round(filtered.reduce((s, p) => s + toUsd(p), 0)).toLocaleString()}</b>
            <span className="ml-1 text-[11px]">(USD karşılığı)</span>
          </div>
          <Pager page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      </Card>

      <PaymentDetailDialog
        payment={selectedPayment}
        customerName={customerName}
        onClose={() => setSelectedPayment(null)}
      />
    </div>
  );
}

const PAYMENT_EXT_TO_MIME = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;
type PaymentUploadExt = keyof typeof PAYMENT_EXT_TO_MIME;
const fmtBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const paymentDocLabel = (t: string) =>
  t === "AccountingInvoice" ? "Fiş" : t === "CommercialInvoice" ? "Fatura" : t;
const STATUS_LABELS_TR: Record<Payment["status"], string> = {
  Pending: "Bekliyor",
  Paid: "Ödendi",
  Overdue: "Gecikmiş",
  Cancelled: "İptal",
};
const PAYMENT_METHOD_LABELS: Record<NonNullable<Payment["paymentMethod"]>, string> = {
  bank_transfer: "Havale/EFT",
  cash: "Nakit",
  credit_card: "Kredi Kartı",
  check: "Çek",
  other: "Diğer",
};
const PAYMENT_METHOD_OPTIONS = Object.keys(PAYMENT_METHOD_LABELS) as Array<NonNullable<Payment["paymentMethod"]>>;

function DetailRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm tabular-nums ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

/** Kasa hareketi detayı + firmaya bağlı fiş/fatura ekleme & önizleme. */
function PaymentDetailDialog({
  payment,
  customerName,
  onClose,
}: {
  payment: Payment | null;
  customerName: (id: string) => string;
  onClose: () => void;
}) {
  const { documents, addDocument, refresh } = useStore();
  const { convert } = useFx();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<"AccountingInvoice" | "CommercialInvoice">("CommercialInvoice");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<Payment["status"]>("Pending");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState(false);
  const [editForm, setEditForm] = useState({
    amount: "",
    paymentDate: "",
    paymentMethod: "bank_transfer" as NonNullable<Payment["paymentMethod"]>,
    invoiceNo: "",
    notes: "",
  });

  useEffect(() => {
    if (payment) {
      setFile(null);
      setDocType("CommercialInvoice");
      setStatus(payment.status);
      setEditForm({
        amount: String(payment.amount ?? ""),
        paymentDate: payment.paidDate ?? payment.dueDate ?? new Date().toISOString().slice(0, 10),
        paymentMethod: payment.paymentMethod ?? "bank_transfer",
        invoiceNo: payment.invoiceNo ?? "",
        notes: payment.note ?? "",
      });
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [payment]);

  const STATUS_CODE: Record<Payment["status"], string> = {
    Pending: "pending",
    Paid: "paid",
    Overdue: "overdue",
    Cancelled: "cancelled",
  };

  const changeStatus = async (next: Payment["status"]) => {
    if (!payment || next === status) return;
    const prev = status;
    setStatus(next); // iyimser
    setSavingStatus(true);
    try {
      const code = STATUS_CODE[next];
      if (payment.source === "receivable") await financeService.updateReceivableStatus(payment.id, code);
      else await financeService.updatePaymentStatus(payment.id, code);
      toast.success("Durum güncellendi", { description: STATUS_LABELS_TR[next] });
      refresh();
    } catch (err: any) {
      setStatus(prev);
      toast.error("Durum güncellenemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setSavingStatus(false);
    }
  };

  const savePayment = async () => {
    if (!payment || payment.source !== "payment") return;
    const amount = Number(String(editForm.amount).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Geçerli tutar girin");
    if (!editForm.paymentDate) return toast.error("Ödeme tarihi girin");
    setSavingPayment(true);
    try {
      await financeService.updatePayment(payment.id, {
        amount,
        currencyCode: payment.currency,
        paymentDate: new Date(editForm.paymentDate),
        paymentMethod: editForm.paymentMethod,
        invoiceNo: editForm.invoiceNo || undefined,
        notes: editForm.notes || undefined,
        direction: payment.direction,
        companyId: payment.customerId,
      });
      toast.success("Kasa hareketi güncellendi");
      refresh();
    } catch (err: any) {
      toast.error("Kasa hareketi güncellenemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setSavingPayment(false);
    }
  };

  const deletePayment = async () => {
    if (!payment || payment.source !== "payment") return;
    if (!window.confirm(`${customerName(payment.customerId)} için ${payment.amount.toLocaleString("tr-TR")} ${payment.currency} kasa hareketini silmek istediğinize emin misiniz?`)) return;
    setDeletingPayment(true);
    try {
      await financeService.deletePayment(payment.id);
      toast.success("Kasa hareketi silindi");
      refresh();
      onClose();
    } catch (err: any) {
      toast.error("Kasa hareketi silinemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setDeletingPayment(false);
    }
  };

  const related = payment
    ? documents.filter(
        (d) =>
          ((d.companyId && d.companyId === payment.customerId) ||
            (d.salesCaseId && payment.salesCaseId && d.salesCaseId === payment.salesCaseId)) &&
          ["AccountingInvoice", "CommercialInvoice", "Other"].includes(d.type)
      )
    : [];

  const preview = async (d: (typeof documents)[number]) => {
    if (!d.fileId) return toast.message(d.fileName, { description: paymentDocLabel(d.type) });
    try {
      const signed = await fileService.signedDownload(d.fileId);
      window.open(signed.downloadUrl, "_blank", "noopener");
    } catch (err: any) {
      toast.error("Önizleme açılamadı", { description: err?.message ?? "İstek başarısız." });
    }
  };

  const upload = async () => {
    if (!payment || !file) return toast.error("Dosya seçin");
    if (file.size > 25 * 1024 * 1024) return toast.error("Dosya boyutu 25 MB'ı aşamaz");
    const rawExt = file.name.split(".").pop()?.toLocaleLowerCase("tr-TR") ?? "";
    const ext = rawExt in PAYMENT_EXT_TO_MIME ? (rawExt as PaymentUploadExt) : null;
    if (!ext) {
      return toast.error("Desteklenmeyen dosya tipi", { description: "PDF, PNG, JPG, WEBP, DOCX veya XLSX" });
    }
    const mime = PAYMENT_EXT_TO_MIME[ext];
    setUploading(true);
    try {
      const up = await fileService.signedUpload({
        bucket: "erp-invoice-documents",
        entityType: "company",
        entityId: payment.customerId,
        filename: file.name,
        mimeType: mime,
        extension: ext,
        sizeBytes: file.size,
      });
      await fileService.uploadBinary(up, file, mime);
      await fileService.link({
        fileId: up.fileId,
        entityType: "company",
        entityId: payment.customerId,
        documentTypeCode: "commercial_invoice_pdf",
        description: `Kasa hareketi #${payment.id.toUpperCase()} · ${paymentDocLabel(docType)}`,
      });
      await addDocument({
        id: up.fileId,
        fileId: up.fileId,
        salesCaseId: payment.salesCaseId || "",
        companyId: payment.customerId,
        type: docType,
        fileName: file.name,
        size: fmtBytes(file.size),
        mimeType: mime,
      });
      toast.success("Fiş/Fatura eklendi", { description: file.name });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err: any) {
      toast.error("Eklenemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(620px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[90dvh] overflow-hidden p-0 gap-0">
        {payment && (
          <>
            <DialogHeader className="border-b border-border/60 px-5 pt-5 pb-4 pr-12">
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="size-5 text-primary" /> Kasa Hareketi Detayı
              </DialogTitle>
              <DialogDescription>#{payment.id.toUpperCase()} · {customerName(payment.customerId)}</DialogDescription>
            </DialogHeader>

            <div className="max-h-[calc(90dvh-150px)] overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="Firma" value={customerName(payment.customerId)} />
                <DetailRow label="Yön" value={payment.direction === "in" ? "Alınan (Giren)" : "Ödenen (Çıkan)"} />
                <DetailRow
                  label="Tutar"
                  value={`${payment.direction === "in" ? "+" : "−"}${payment.amount.toLocaleString("tr-TR")} ${payment.currency}`}
                  accent={payment.direction === "in" ? "text-emerald-600" : "text-red-600"}
                />
                <DetailRow label="USD karşılığı" value={`≈ $ ${Math.round(convert(payment.amount, payment.currency, "USD")).toLocaleString()}`} />
                <DetailRow label="Vade" value={payment.dueDate} />
                <DetailRow label="Fatura No" value={payment.invoiceNo || "—"} />
                <DetailRow label="Ödeme Tarihi" value={payment.paidDate ?? "—"} />
                <div className="rounded-lg border border-border/60 bg-white px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Durum</div>
                  <Select value={status} onValueChange={(v) => changeStatus(v as Payment["status"])} disabled={savingStatus}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["Pending", "Paid", "Overdue", "Cancelled"] as const).map((st) => (
                        <SelectItem key={st} value={st} className="text-sm">{STATUS_LABELS_TR[st]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DetailRow label="Kayıt Tipi" value={payment.paymentType === "received" ? "Tahsilat" : "Beklenen"} />
              </div>

              {payment.source === "payment" && (
                <div className="rounded-lg border border-border/60 p-3 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Wallet className="size-4 text-primary" /> Kasa Hareketi
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Tutar</Label>
                      <Input
                        className="mt-1 h-9"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.amount}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, amount: event.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Ödeme Tarihi</Label>
                      <Input
                        className="mt-1 h-9"
                        type="date"
                        value={editForm.paymentDate}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, paymentDate: event.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Ödeme Yöntemi</Label>
                      <Select
                        value={editForm.paymentMethod}
                        onValueChange={(value) => setEditForm((prev) => ({ ...prev, paymentMethod: value as NonNullable<Payment["paymentMethod"]> }))}
                      >
                        <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHOD_OPTIONS.map((method) => (
                            <SelectItem key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Fatura No</Label>
                      <Input
                        className="mt-1 h-9"
                        value={editForm.invoiceNo}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, invoiceNo: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Not</Label>
                    <Textarea
                      className="mt-1"
                      rows={2}
                      value={editForm.notes}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" className="gap-1" disabled={savingPayment} onClick={savePayment}>
                      <Save className="size-4" /> {savingPayment ? "Kaydediliyor…" : "Kaydet"}
                    </Button>
                  </div>
                </div>
              )}

              {payment.note && (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Not</div>
                  <p className="text-sm whitespace-pre-wrap">{payment.note}</p>
                </div>
              )}

              <div className="rounded-lg border border-border/60 p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Receipt className="size-4 text-primary" /> Fiş / Fatura
                  {related.length > 0 && (
                    <span className="ml-auto text-[11px] text-muted-foreground">{related.length} belge</span>
                  )}
                </div>

                {related.length > 0 ? (
                  <div className="divide-y divide-border/60 rounded-md border border-border/60">
                    {related.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 px-3 py-2">
                        <FileText className="size-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{d.fileName}</div>
                          <div className="text-[11px] text-muted-foreground">{paymentDocLabel(d.type)} · {d.size}</div>
                        </div>
                        <Button size="icon" variant="ghost" className="size-7" title="Önizle" onClick={() => preview(d)}>
                          <Eye className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Bu firmaya bağlı fiş/fatura yok. Aşağıdan ekleyebilirsiniz.</div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Select value={docType} onValueChange={(v) => setDocType(v as "AccountingInvoice" | "CommercialInvoice")}>
                      <SelectTrigger className="h-9 w-24 bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AccountingInvoice">Fiş</SelectItem>
                        <SelectItem value="CommercialInvoice">Fatura</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="flex-1 min-w-0 rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-left text-sm hover:bg-muted/40 truncate"
                    >
                      <input
                        ref={inputRef}
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx"
                        className="hidden"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                      {file ? `${file.name} · ${fmtBytes(file.size)}` : "Dosya seç (PDF, görsel, ...)"}
                    </button>
                  </div>
                  <Button className="w-full gap-1" disabled={uploading || !file} onClick={upload}>
                    <Upload className="size-4" /> {uploading ? "Yükleniyor…" : "Fiş/Fatura Ekle"}
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-border/60 bg-muted/20 px-5 py-4">
              {payment.source === "payment" && (
                <Button
                  variant="outline"
                  className="mr-auto gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={deletingPayment}
                  onClick={deletePayment}
                >
                  <Trash2 className="size-4" /> Sil
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>Kapat</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
