import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { StatusBadge } from "../../Layout";
import { QuoteDialog } from "../../dialogs/QuoteDialog";
import { CreateProformaDialog } from "../../dialogs/CreateProformaDialog";
import { CreateContractDialog } from "../../dialogs/CreateContractDialog";
import { MiniKpi } from "../../shared/MiniKpi";
import { salesStageLabel } from "../../../lib/mock";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  Plus, Search, CheckCircle2, TrendingUp, Mail, FileText, FileSignature, ClipboardCheck, Building2,
  Wallet, Receipt, Calendar, Printer, Download, Eye, RotateCcw, XCircle, Pencil,
} from "lucide-react";
import { useStore } from "../../../lib/store";
import { buildOfferTrend } from "../../../lib/chartAggregates";
import { useFx } from "../../../lib/fx";
import { Customer, Offer, SalesCase, User } from "../../../lib/mock";
import { toast } from "sonner";
import { salesOrderService, quoteService } from "../../../../lib/services";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { CreateAccountingInvoiceDialog, type AccountingInvoicePrefill } from "../finance/CreateAccountingInvoiceDialog";
import type { OperationFocus } from "../../../lib/operations";
import { loadQuotePrintData, printAssetBase, quoteDoc } from "../../../lib/print";
import { printOrWarn, splitVat, formatDate, formatCurrency } from "../../../lib/pageHelpers";

function invoicePrefillFromOffer(offer: Offer, customer: Customer | null, order?: any): AccountingInvoicePrefill {
  const vat = splitVat(offer.amount, { subtotal: offer.subtotal, vatTotal: offer.vatTotal });
  return {
    companyId: offer.companyId ?? customer?.id ?? "",
    amount: vat.net,
    vatAmount: vat.kdv,
    grandTotal: offer.amount,
    currencyCode: offer.currency,
    invoiceNo: `MF-${offer.quoteNo}`,
    quoteId: offer.id,
    salesOrderId: order?.id,
    notes: order?.orderNo
      ? `Satış siparişi ${order.orderNo} / teklif ${offer.quoteNo}`
      : `Teklif ${offer.quoteNo} kaynaklı`,
    type: "sales",
  };
}

function invoicePrefillFromOrder(order: any): AccountingInvoicePrefill {
  const grandTotal = Number(order.grandTotal ?? 0);
  return {
    companyId: order.companyId ?? order.company?.id ?? "",
    amount: grandTotal,
    grandTotal,
    vatAmount: 0,
    currencyCode: order.currency?.code ?? "USD",
    invoiceNo: `MF-${order.orderNo}`,
    quoteId: order.quoteId ?? order.quote?.id,
    salesOrderId: order.id,
    notes: `Satış siparişi ${order.orderNo} kaynaklı`,
    type: "sales",
  };
}

export function OffersPage({ focus }: { focus?: OperationFocus }) {
  const { offers: rawOffers, cases, customers, users, moveCase, refresh } = useStore();
  const { convert } = useFx();
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const backToSales = async (caseId: string) => {
    try {
      await moveCase(caseId, "sales");
      toast.success("Satış kartı satışa geri alındı");
    } catch (err: any) {
      toast.error("İşlem başarısız", { description: err?.message ?? "Aşama değiştirilemedi." });
    }
  };
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "Draft" | "Sent" | "Approved" | "Rejected">("all");
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [salesOrdersLoading, setSalesOrdersLoading] = useState(false);
  const focusExpired = focus === "expired";
  const offerExpired = (o: Offer) => {
    if (o.status !== "Sent") return false;
    const age = Math.max(0, Math.floor((Date.now() - new Date(o.date).getTime()) / (24 * 60 * 60 * 1000)));
    return age > (o.validityDays ?? 20);
  };

  useEffect(() => {
    let cancelled = false;
    setSalesOrdersLoading(true);
    salesOrderService
      .list({ pageSize: 20 })
      .then((res) => {
        if (!cancelled) setSalesOrders(res.data);
      })
      .catch(() => {
        if (!cancelled) setSalesOrders([]);
      })
      .finally(() => {
        if (!cancelled) setSalesOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const offers = rawOffers.map((o) => {
    const sc = cases.find((s) => s.id === o.salesCaseId);
    return sc?.isLost ? { ...o, status: "Rejected" as const } : o;
  });

  useEffect(() => {
    if (focus === "open" || focus === "pending" || focus === "expired") setTab("Sent");
    if (focus === "won") setTab("Approved");
    if (focus === "lost") setTab("Rejected");
  }, [focus]);

  const total = offers.length;
  const approved = offers.filter((o) => o.status === "Approved").length;
  const sent = offers.filter((o) => o.status === "Sent").length;
  // Farklı para birimleri USD bazına çevrilerek toplanır (baz birim USD).
  const totalAmount = offers.reduce((a, o) => a + convert(o.amount, o.currency, "USD"), 0);
  const approvedAmount = offers.filter((o) => o.status === "Approved").reduce((a, o) => a + convert(o.amount, o.currency, "USD"), 0);
  const winRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  const filtered = offers
    .filter((o) => {
      if (focusExpired && !offerExpired(o)) return false;
      if (tab !== "all" && o.status !== tab) return false;
      if (q) {
        const sc = cases.find((s) => s.id === o.salesCaseId);
        const cName = sc ? customerName(sc.customerId) : "";
        return o.quoteNo.toLowerCase().includes(q.toLowerCase()) || cName.toLowerCase().includes(q.toLowerCase());
      }
      return true;
    })
    // Teklif no'ya göre azalan: yeni teklifler üstte; aynı no için revizyon büyükten küçüğe.
    .sort((a, b) => {
      const cmp = b.quoteNo.localeCompare(a.quoteNo, "tr", { numeric: true, sensitivity: "base" });
      if (cmp !== 0) return cmp;
      return (b.revision ?? 0) - (a.revision ?? 0);
    });
  const offerExportParams = {
    ...(q ? { search: q } : {}),
    ...(tab !== "all" ? { statusCode: tab.toLowerCase() } : {}),
  };
  const selectedOffer = selectedOfferId ? offers.find((o) => o.id === selectedOfferId) ?? null : null;
  const selectedCase = selectedOffer ? cases.find((s) => s.id === selectedOffer.salesCaseId) ?? null : null;
  const selectedCustomer = selectedOffer
    ? customers.find((c) => c.id === selectedOffer.companyId) ?? (selectedCase ? customers.find((c) => c.id === selectedCase.customerId) ?? null : null)
    : null;
  const selectedAssignee = selectedCase ? users.find((u) => u.id === selectedCase.assignedUserId) ?? null : null;
  const selectedRevisions = selectedCase
    ? offers.filter((o) => o.salesCaseId === selectedCase.id).sort((a, b) => b.revision - a.revision)
    : selectedOffer
    ? [selectedOffer]
    : [];
  const selectedOrder = selectedOffer
    ? salesOrders.find((order) => order.quoteId === selectedOffer.id || order.quote?.id === selectedOffer.id)
    : null;

  const offerTrend = useMemo(() => buildOfferTrend(offers, 6), [offers]);

  const runQuoteAction = async (offerId: string, action: "send" | "approve" | "reject") => {
    try {
      if (action === "send") await quoteService.send(offerId);
      else if (action === "approve") await quoteService.approve(offerId);
      else await quoteService.reject(offerId);
      toast.success(action === "send" ? "Teklif gönderildi" : action === "approve" ? "Teklif onaylandı" : "Teklif reddedildi");
      await refresh();
    } catch (err: any) {
      toast.error("İşlem başarısız", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="violet" icon={<FileText className="size-[18px]" />} label="Toplam Teklif" value={total} sub="bu çeyrek" />
        <MiniKpi tone="emerald" icon={<CheckCircle2 className="size-[18px]" />} label="Onaylanan" value={approved} sub={`$ ${(approvedAmount / 1000).toFixed(0)}K`} />
        <MiniKpi tone="blue" icon={<Mail className="size-[18px]" />} label="Gönderilen" value={sent} sub="cevap bekleniyor" />
        <MiniKpi tone="amber" icon={<TrendingUp className="size-[18px]" />} label="Kazanma Oranı" value={`%${winRate}`} sub={`hedef %50`} progress={winRate} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Teklif Trendi</CardTitle>
            <p className="text-xs text-muted-foreground">Gönderilen vs onaylanan · son 6 ay</p>
          </CardHeader>
          <CardContent className="h-64 pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={offerTrend} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="ay" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="gonderilen" name="Gönderilen" fill="#000c69" barSize={18} isAnimationActive={false} />
                <Bar dataKey="onaylanan" name="Onaylanan" fill="#10b981" barSize={18} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Durum Dağılımı</CardTitle>
            <p className="text-xs text-muted-foreground">Toplam $ {(totalAmount / 1000).toFixed(0)}K</p>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {(["Draft", "Sent", "Approved", "Rejected"] as const).map((st) => {
              const items = offers.filter((o) => o.status === st);
              const pct = total > 0 ? (items.length / total) * 100 : 0;
              const color = st === "Approved" ? "#10b981" : st === "Sent" ? "#3b82f6" : st === "Rejected" ? "#ef4444" : "#9ca3af";
              return (
                <div key={st}>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: color }} />
                      <span>{st}</span>
                    </div>
                    <span className="tabular-nums text-muted-foreground">{items.length} · {Math.round(pct)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="tracking-tight mr-2">Tüm Teklifler</CardTitle>
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="h-8 bg-muted/60">
                <TabsTrigger value="all" className="text-xs">Tümü</TabsTrigger>
                <TabsTrigger value="Draft" className="text-xs">Taslak</TabsTrigger>
                <TabsTrigger value="Sent" className="text-xs">Gönderilen</TabsTrigger>
                <TabsTrigger value="Approved" className="text-xs">Onaylı</TabsTrigger>
                <TabsTrigger value="Rejected" className="text-xs">Reddedilen</TabsTrigger>
              </TabsList>
            </Tabs>
            {focusExpired && (
              <span className="inline-flex h-8 items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs text-amber-700">
                Süresi geçen
              </span>
            )}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Teklif no / müşteri..." className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ExportExcelButton path="/exports/quotes" filename="teklifler.xlsx" params={offerExportParams} className="h-9" />
            <QuoteDialog
              trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Teklif</Button>}
            />
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Teklif</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Rev.</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Not</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => {
                const sc = cases.find((s) => s.id === o.salesCaseId);
                return (
                  <TableRow
                    key={o.id}
                    className="group cursor-pointer"
                    onClick={() => setSelectedOfferId(o.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedOfferId(o.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Teklif ${o.quoteNo}, ${o.status}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                          <FileText className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm leading-tight truncate">{o.quoteNo}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {[sc?.requestedProduct, sc?.requestedModel].filter(Boolean).join(" · ") || (sc ? `#${sc.id.slice(0, 8).toUpperCase()}` : "—")}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{sc ? customerName(sc.customerId) : "—"}</TableCell>
                    <TableCell><span className="inline-flex px-1.5 py-0.5 rounded text-[11px] bg-muted text-foreground/70">R{o.revision}</span></TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{o.date}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="text-sm">{o.amount.toLocaleString()}</span>{" "}
                      <span className="text-[11px] text-muted-foreground">{o.currency}</span>
                    </TableCell>
                    <TableCell><StatusBadge status={o.status} /></TableCell>
                    <TableCell><span className="text-xs text-muted-foreground line-clamp-1 max-w-[220px]">{o.note}</span></TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {o.status === "Draft" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              void runQuoteAction(o.id, "send");
                            }}
                          >
                            <Mail className="size-3.5" /> Gönder
                          </Button>
                        )}
                        {o.status === "Sent" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 text-xs border-emerald-200 text-emerald-700"
                              onClick={(event) => {
                                event.stopPropagation();
                                void runQuoteAction(o.id, "approve");
                              }}
                            >
                              <CheckCircle2 className="size-3.5" /> Onayla
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 text-xs border-red-200 text-red-600"
                              onClick={(event) => {
                                event.stopPropagation();
                                void runQuoteAction(o.id, "reject");
                              }}
                            >
                              <XCircle className="size-3.5" /> Reddet
                            </Button>
                          </>
                        )}
                        {sc?.isLost && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              backToSales(sc.id);
                            }}
                          >
                            <RotateCcw className="size-3.5" /> Satışa Al
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 opacity-0 group-hover:opacity-100 sm:opacity-100"
                          title="Teklif detayı"
                          aria-label="Teklif detayı"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedOfferId(o.id);
                          }}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-sm text-muted-foreground">Kayıt bulunamadı.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <OfferDetailDialog
        offer={selectedOffer}
        salesCase={selectedCase}
        customer={selectedCustomer}
        assignee={selectedAssignee}
        revisions={selectedRevisions}
        order={selectedOrder}
        onClose={() => setSelectedOfferId(null)}
        onQuoteAction={runQuoteAction}
        onOrderCreated={refresh}
      />

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="tracking-tight">Satış Siparişleri</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Onaylanan tekliften stok rezervasyonuna giden sipariş kayıtları</p>
          </div>
          <Badge variant="secondary" className="h-6">{salesOrders.length} kayıt</Badge>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Sipariş</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                        <ClipboardCheck className="size-4" />
                      </div>
                      <div>
                        <div className="text-sm leading-tight">{order.orderNo}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{order.quoteId ? "Teklif bağlantılı" : "Manuel"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{order.company?.shortName || order.company?.legalTitle || "—"}</TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">{formatDate(order.orderDate)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatCurrency(Number(order.grandTotal ?? 0), order.currency?.code ?? "USD")}
                  </TableCell>
                  <TableCell><StatusBadge status={order.status?.name ?? order.status?.code ?? "Taslak"} /></TableCell>
                  <TableCell>
                    <CreateAccountingInvoiceDialog
                      prefill={invoicePrefillFromOrder(order)}
                      onCreated={refresh}
                      trigger={
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
                          <Receipt className="size-3.5" /> Muhasebe Faturası
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
              {!salesOrdersLoading && salesOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-sm text-muted-foreground">
                    Henüz satış siparişi yok.
                  </TableCell>
                </TableRow>
              )}
              {salesOrdersLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-sm text-muted-foreground">
                    Satış siparişleri yükleniyor...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

export function OfferDetailDialog({
  offer,
  salesCase,
  customer,
  assignee,
  revisions,
  order,
  onClose,
  onQuoteAction,
  onOrderCreated,
}: {
  offer: Offer | null;
  salesCase: SalesCase | null;
  customer: Customer | null;
  assignee: User | null;
  revisions: Offer[];
  order?: any;
  onClose: () => void;
  onQuoteAction?: (offerId: string, action: "send" | "approve" | "reject") => Promise<void>;
  onOrderCreated?: () => void;
}) {
  const { products, users, contacts } = useStore();
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  if (!offer) return null;

  const productText = salesCase
    ? [salesCase.requestedProduct, salesCase.requestedModel].filter(Boolean).join(" · ")
    : "Satış kartı bağlantısı yok";

  // Teklif yazdırma: ürün kataloğundan model eşleşirse teknik bilgiler ve
  // donanım sayfaları da basılır; alt notlar seçilen teslim şekline göre gelir.
  const handlePrint = async () => {
    const loading = toast.loading("Teklif hazırlanıyor…");
    try {
      const data = await loadQuotePrintData({ offer, customer, salesCase, users, contacts, products });
      printOrWarn(quoteDoc(data, printAssetBase()));
    } catch (error: unknown) {
      toast.error("Teklif yazdırılamadı", {
        description: error instanceof Error ? error.message : "Teklif ayrıntıları alınamadı.",
      });
    } finally {
      toast.dismiss(loading);
    }
  };

  return (
    <Dialog open={!!offer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(900px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[88dvh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-start gap-3">
            <div className="size-11 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg truncate">{offer.quoteNo}</DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2 flex-wrap">
                <StatusBadge status={offer.status} />
                <span className="text-muted-foreground">R{offer.revision}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground tabular-nums">{offer.date}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 max-h-[calc(88dvh-154px)] overflow-y-auto">
        <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <OfferStat icon={<Wallet className="size-4" />} label="Tutar" value={formatCurrency(offer.amount, offer.currency)} accent="text-emerald-600" />
          <OfferStat icon={<Receipt className="size-4" />} label="Revizyon" value={`R${offer.revision}`} accent="text-primary" />
          <OfferStat icon={<Calendar className="size-4" />} label="Tarih" value={formatDate(offer.date)} accent="text-blue-600" />
          <OfferStat icon={<ClipboardCheck className="size-4" />} label="Sipariş" value={order?.orderNo ?? "Yok"} accent="text-amber-600" />
        </div>

        <div className="px-6 pb-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/60 bg-white p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Müşteri</div>
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-lg bg-muted text-primary grid place-items-center shrink-0">
                <Building2 className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{customer?.name ?? "Müşteri bulunamadı"}</div>
                <div className="text-xs text-muted-foreground mt-1">{customer?.city ?? "—"} {customer?.district ? `· ${customer.district}` : ""}</div>
                <div className="text-xs text-muted-foreground mt-1">{customer?.email ?? "E-posta yok"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-white p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Satış kartı</div>
            <div className="space-y-2.5">
              <OfferInfo label="Kart No" value={salesCase ? `#${salesCase.id.slice(0, 8).toUpperCase()}` : "—"} />
              <OfferInfo label="Ürün / Model" value={productText} />
              <OfferInfo label="Aşama" value={salesCase ? salesStageLabel(salesCase.stage) : "—"} />
              <OfferInfo label="Atanan" value={assignee?.name ?? "Atanmadı"} />
              <OfferInfo label="Adet" value={salesCase ? `${salesCase.quantity}` : "—"} />
            </div>
          </div>
        </div>

        <div className="px-6 pb-5">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Teklif notu</div>
            <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">{offer.note?.trim() || "Not girilmemiş."}</p>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Revizyon geçmişi</div>
            <Badge variant="secondary">{revisions.length} kayıt</Badge>
          </div>
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Teklif</TableHead>
                  <TableHead>Rev.</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.map((rev) => (
                  <TableRow key={rev.id} className={rev.id === offer.id ? "bg-primary/5" : ""}>
                    <TableCell className="font-medium">{rev.quoteNo}</TableCell>
                    <TableCell>R{rev.revision}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{rev.date}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(rev.amount, rev.currency)}</TableCell>
                    <TableCell><StatusBadge status={rev.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-muted/20 gap-2 sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button variant="outline" className="gap-1 sm:w-auto" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> Düzenle
            </Button>
            <QuoteDialog
              offerId={offer.id}
              open={editOpen}
              onOpenChange={(o) => {
                setEditOpen(o);
                if (!o) onOrderCreated?.();
              }}
            />
            <Button variant="outline" className="gap-1 sm:w-auto" onClick={() => void handlePrint()}>
              <Printer className="size-4" /> Yazdır
            </Button>
            <Button
              variant="outline"
              className="gap-1 sm:w-auto"
              onClick={async () => {
                try {
                  await quoteService.openPdf(offer.id);
                } catch (err: any) {
                  toast.error("PDF açılamadı", { description: err?.message ?? "Sunucu hatası." });
                }
              }}
            >
              <Eye className="size-4" /> PDF Aç
            </Button>
            <Button
              variant="outline"
              className="gap-1 sm:w-auto"
              onClick={async () => {
                try {
                  await quoteService.downloadPdf(offer.id, offer.quoteNo);
                } catch (err: any) {
                  toast.error("PDF indirilemedi", { description: err?.message ?? "Sunucu hatası." });
                }
              }}
            >
              <Download className="size-4" /> PDF İndir
            </Button>
            <CreateProformaDialog
              defaultQuoteId={offer.id}
              onCreated={() => onOrderCreated?.()}
              trigger={
                <Button variant="outline" className="gap-1 sm:w-auto">
                  <FileText className="size-4" /> Proforma Oluştur
                </Button>
              }
            />
            <CreateContractDialog
              defaultQuoteId={offer.id}
              onCreated={() => onOrderCreated?.()}
              trigger={
                <Button variant="outline" className="gap-1 sm:w-auto">
                  <FileSignature className="size-4" /> Sözleşme Oluştur
                </Button>
              }
            />
            {offer.status === "Draft" && onQuoteAction && (
              <Button className="gap-1 sm:w-auto" onClick={() => onQuoteAction(offer.id, "send")}>
                <Mail className="size-4" /> Gönder
              </Button>
            )}
            {offer.status === "Approved" && (
              <CreateAccountingInvoiceDialog
                prefill={invoicePrefillFromOffer(offer, customer, order)}
                onCreated={onOrderCreated}
                trigger={
                  <Button variant="outline" className="gap-1 sm:w-auto">
                    <Receipt className="size-4" /> Muhasebe Faturası Oluştur
                  </Button>
                }
              />
            )}
            {offer.status === "Approved" && !order && (
              <Button
                variant="default"
                className="gap-1 sm:w-auto"
                disabled={creatingOrder}
                onClick={async () => {
                  setCreatingOrder(true);
                  try {
                    await salesOrderService.createFromQuote(offer.id, { copyItems: true, reserveStock: false });
                    toast.success("Satış siparişi oluşturuldu");
                    onOrderCreated?.();
                  } catch (err: any) {
                    toast.error("Sipariş oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
                  } finally {
                    setCreatingOrder(false);
                  }
                }}
              >
                <ClipboardCheck className="size-4" /> {creatingOrder ? "Oluşturuluyor…" : "Sipariş Oluştur"}
              </Button>
            )}
            {offer.status === "Sent" && onQuoteAction && (
              <>
                <Button variant="default" className="gap-1 sm:w-auto bg-emerald-600 hover:bg-emerald-700" onClick={() => onQuoteAction(offer.id, "approve")}>
                  <CheckCircle2 className="size-4" /> Onayla
                </Button>
                <Button variant="outline" className="gap-1 sm:w-auto border-red-200 text-red-600" onClick={() => onQuoteAction(offer.id, "reject")}>
                  <XCircle className="size-4" /> Reddet
                </Button>
              </>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>Kapat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfferStat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className={accent}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-sm font-medium tabular-nums truncate">{value}</div>
    </div>
  );
}

function OfferInfo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3 text-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{value}</div>
    </div>
  );
}
