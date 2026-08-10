import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import { StatusBadge } from "../../shared/StatusBadge";
import { MiniKpi } from "../../shared/MiniKpi";
import { EmptyState } from "../../shared/EmptyState";
import { RemoteCompanyCombobox } from "../../shared/RemoteCompanyCombobox";
import { FormField, SummaryLine } from "../shared/formFields";
import { CreateAccountingInvoiceDialog, type AccountingInvoicePrefill } from "../finance/CreateAccountingInvoiceDialog";
import { purchaseOrderService, productService } from "../../../../lib/services";
import { useAuth } from "../../../../lib/auth";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { formatCurrency, formatDate } from "../../../lib/pageHelpers";
import { CheckCircle2, ClipboardCheck, Eye, Mail, Plus, Search, ShoppingCart, Package, Receipt, Clock, Trash2, XCircle, Building2 } from "lucide-react";
import { toast } from "sonner";

export function PurchaseOrdersPage() {
  const { hasRole } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "draft" | "sent" | "pending_manager_approval" | "approved" | "received" | "cancelled">("all");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const canApprovePurchaseOrders = hasRole("super_admin");

  const loadOrders = (cancelledRef?: { current: boolean }) => {
    setLoading(true);
    purchaseOrderService
      .list({ pageSize: 100 })
      .then((res) => {
        if (!cancelledRef?.current) setOrders(res.data);
      })
      .catch(() => {
        if (!cancelledRef?.current) {
          setOrders([]);
          toast.error("Satın alma siparişleri yüklenemedi");
        }
      })
      .finally(() => {
        if (!cancelledRef?.current) setLoading(false);
      });
  };

  useEffect(() => {
    const cancelledRef = { current: false };
    loadOrders(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const total = orders.length;
  const commercial = orders.filter((p) => (p.purchaseType ?? "commercial") === "commercial").length;
  const administrative = orders.filter((p) => p.purchaseType === "administrative").length;
  const pending = orders.filter((p) => ["draft", "sent", "pending_manager_approval"].includes(p.status?.code)).length;
  const totalAmount = orders.reduce((a, p) => a + Number(p.grandTotal ?? 0), 0);

  const filtered = orders.filter((p) => {
    if (tab !== "all" && p.status?.code !== tab) return false;
    const supplier = p.supplier?.shortName || p.supplier?.legalTitle || "";
    return [p.orderNo, p.invoiceNo, supplier].some((value) => String(value ?? "").toLowerCase().includes(q.toLowerCase()));
  });

  const supplierStats = Array.from(new Set(filtered.map((p) => p.supplier?.shortName || p.supplier?.legalTitle || "—")))
    .map((s) => ({
      name: s,
      count: filtered.filter((p) => (p.supplier?.shortName || p.supplier?.legalTitle || "—") === s).length,
      pending: filtered.filter((p) => (p.supplier?.shortName || p.supplier?.legalTitle || "—") === s && !["received", "cancelled"].includes(p.status?.code)).length,
      tutar: filtered
        .filter((p) => (p.supplier?.shortName || p.supplier?.legalTitle || "—") === s)
        .reduce((a, p) => a + Number(p.grandTotal ?? 0), 0),
    }))
    .sort((a, b) => b.count - a.count);

  const purchaseStep = (code?: string) => {
    if (code === "received") return 4;
    if (code === "approved") return 3;
    if (code === "pending_manager_approval") return 2;
    if (code === "sent") return 1;
    return 0;
  };

  const etaState = (value?: string | null) => {
    if (!value) return { label: "ETA yok", className: "border-border bg-muted text-muted-foreground" };
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { label: formatDate(value), className: "border-border bg-muted text-muted-foreground" };
    const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
    if (days < 0) return { label: `${Math.abs(days)} gün gecikmiş`, className: "border-destructive/20 bg-destructive-soft text-destructive" };
    if (days <= 7) return { label: days === 0 ? "Bugün" : `${days} gün kaldı`, className: "border-warning/20 bg-warning-soft text-warning" };
    return { label: `${days} gün kaldı`, className: "border-success/20 bg-success-soft text-success" };
  };

  const poExportParams = q ? { search: q } : undefined;
  const openOrderDetail = async (order: any) => {
    setSelectedOrder(order);
    setSelectedDetail(null);
    setDetailLoading(true);
    try {
      const detail = await purchaseOrderService.get(order.id);
      setSelectedDetail(detail);
    } catch (err: any) {
      toast.error("Satın alma detayı yüklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setDetailLoading(false);
    }
  };

  const runPurchaseAction = async (order: any, action: "send" | "approve" | "received" | "cancelled") => {
    try {
      if (action === "send") await purchaseOrderService.send(order.id);
      else if (action === "approve") await purchaseOrderService.approve(order.id);
      else await purchaseOrderService.setStatus(order.id, { statusCode: action });
      toast.success(
        action === "send"
          ? "Satın alma gönderildi"
          : action === "approve"
          ? "Satın alma onaylandı"
          : action === "received"
          ? "Teslim alındı"
          : "Satın alma iptal edildi",
      );
      loadOrders();
      if (selectedOrder?.id === order.id) {
        const detail = await purchaseOrderService.get(order.id).catch(() => null);
        if (detail) setSelectedDetail(detail);
      }
    } catch (err: any) {
      toast.error("İşlem başarısız", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="violet" icon={<ShoppingCart className="size-[18px]" />} label="Toplam Sipariş" value={total} sub={formatCurrency(totalAmount, "USD")} delta={6} onClick={() => setTab("all")} active={tab === "all"} />
        <MiniKpi tone="emerald" icon={<Package className="size-[18px]" />} label="Ticari" value={commercial} sub="mal/hizmet alımı" delta={3} />
        <MiniKpi tone="blue" icon={<Receipt className="size-[18px]" />} label="İdari" value={administrative} sub="genel gider" delta={2} />
        <MiniKpi tone="amber" icon={<Clock className="size-[18px]" />} label="Bekleyen" value={pending} sub="onay bekliyor" delta={1} onClick={() => setTab("pending_manager_approval")} active={tab === "pending_manager_approval"} />
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
          <div><CardTitle className="tracking-tight">Tedarikçi İçgörüsü</CardTitle><p className="text-xs text-muted-foreground">Sipariş hacmi ve açık teslim yükü</p></div>
          <Badge variant="outline" className="bg-white">{supplierStats.length} tedarikçi</Badge>
        </CardHeader>
        <CardContent className="grid gap-2 pt-2 sm:grid-cols-2 xl:grid-cols-4">
          {supplierStats.slice(0, 4).map((supplier) => (
            <div key={supplier.name} className="rounded-lg border border-border/60 bg-muted/15 p-3">
              <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-md bg-brand-blue-soft text-primary"><Building2 className="size-4" /></span><div className="min-w-0"><div className="truncate text-xs font-semibold">{supplier.name}</div><div className="text-[10px] text-muted-foreground">{supplier.count} sipariş</div></div></div>
              <div className="mt-3 flex items-center justify-between border-t border-dashed border-border pt-2 text-[10px]"><span className="text-muted-foreground">Açık teslim</span><Badge variant="outline" className={supplier.pending ? "border-warning/20 bg-warning-soft text-warning" : "border-success/20 bg-success-soft text-success"}>{supplier.pending}</Badge></div>
            </div>
          ))}
          {supplierStats.length === 0 && <div className="col-span-full py-5 text-center text-xs text-muted-foreground">Tedarikçi içgörüsü için sipariş bekleniyor.</div>}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col items-start gap-2 lg:flex-row lg:flex-wrap lg:items-center">
            <CardTitle className="tracking-tight lg:mr-2">Satın Alma Siparişleri</CardTitle>
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full lg:w-auto">
              <TabsList className="h-8 w-full justify-start bg-muted/60 lg:w-fit">
                <TabsTrigger value="all" className="text-xs">Tümü</TabsTrigger>
                <TabsTrigger value="draft" className="text-xs">Taslak</TabsTrigger>
                <TabsTrigger value="sent" className="text-xs">Gönderilen</TabsTrigger>
                <TabsTrigger value="pending_manager_approval" className="text-xs">Onay</TabsTrigger>
                <TabsTrigger value="approved" className="text-xs">Onaylı</TabsTrigger>
                <TabsTrigger value="received" className="text-xs">Teslim</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="PO / tedarikçi..." className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ExportExcelButton path="/exports/purchase-orders" filename="satinalma-siparisleri.xlsx" params={poExportParams} className="h-9" />
            <CreatePurchaseOrderDialog onCreated={() => loadOrders()} />
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground">
                <TableHead>Tedarikçi</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead>Ödeme</TableHead>
                <TableHead>Sipariş</TableHead>
                <TableHead>Fatura No</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead className="text-right">KDV</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow
                  key={p.id}
                  className="group cursor-pointer hover:bg-primary/[0.025]"
                  onClick={() => openOrderDetail(p)}
                  onKeyDown={(e) => e.key === "Enter" && openOrderDetail(p)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Satın alma ${p.orderNo ?? p.id}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                        <ShoppingCart className="size-4" />
                      </div>
                      <div>
                        <div className="text-sm leading-tight">{p.supplier?.shortName || p.supplier?.legalTitle || "—"}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">#{p.id.toUpperCase()}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="h-6 text-[11px]">{purchaseTypeLabel(p.purchaseType)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{paymentTypeLabel(p.paymentType)}</TableCell>
                  <TableCell className="text-sm tabular-nums">{p.orderNo}</TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">{p.invoiceNo || "—"}</TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">{formatDate(p.orderDate)}</TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    <div>{formatDate(p.expectedDate)}</div>
                    <Badge variant="outline" className={`mt-1 h-5 px-1.5 text-[9px] ${etaState(p.expectedDate).className}`}>{etaState(p.expectedDate).label}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {formatCurrency(Number(p.vatAmount ?? 0), p.currency?.code ?? "USD")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatCurrency(Number(p.grandTotal ?? 0), p.currency?.code ?? "USD")}
                  </TableCell>
                  <TableCell className="min-w-[270px]">
                    <div className="flex flex-col gap-2">
                      {p.status?.code !== "cancelled" ? (
                        <div>
                          <div className="flex items-center" aria-label={`Sipariş yolculuğu: ${p.status?.name ?? p.status?.code}`}>
                            {["Taslak", "Gönderildi", "Onay", "Hazır", "Teslim"].map((label, index) => (
                              <div key={label} className="flex flex-1 items-center last:flex-none"><span className={`grid size-4 place-items-center rounded-full border text-[7px] font-bold ${index <= purchaseStep(p.status?.code) ? "border-primary bg-primary text-white" : "border-border bg-white text-muted-foreground"}`}>{index + 1}</span>{index < 4 && <span className={`h-px flex-1 ${index < purchaseStep(p.status?.code) ? "bg-primary" : "bg-border"}`} />}</div>
                            ))}
                          </div>
                          <div className="mt-1 flex justify-between text-[7px] uppercase tracking-wide text-muted-foreground"><span>Taslak</span><span>Gönder</span><span>Onay</span><span>Hazır</span><span>Teslim</span></div>
                        </div>
                      ) : <Badge variant="outline" className="w-fit border-destructive/20 bg-destructive-soft text-destructive">İptal edildi</Badge>}
                      <div className="flex items-center gap-2">
                        <StatusBadge status={p.status?.name ?? p.status?.code ?? "Taslak"} />
                        {p.status?.code === "pending_manager_approval" && canApprovePurchaseOrders && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-6 px-2 text-[10px] uppercase tracking-wider font-semibold border-warning/30 text-warning hover:bg-warning-soft"
                          onClick={(event) => {
                            event.stopPropagation();
                            void runPurchaseAction(p, "approve");
                          }}
                        >
                          Onayla
                        </Button>
                        )}
                        {p.status?.code === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px] uppercase tracking-wider font-semibold"
                            onClick={(event) => {
                              event.stopPropagation();
                              void runPurchaseAction(p, "send");
                            }}
                          >
                            Gönder
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 opacity-0 group-hover:opacity-100 sm:opacity-100"
                          title="Satın alma detayı"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openOrderDetail(p);
                          }}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </div>
                      {p.approvalReason && <span className="text-[11px] text-warning">{p.approvalReason}</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-4">
                    <EmptyState
                      scene="search"
                      title="Satın alma siparişi bulunamadı"
                      description="Arama terimini veya durum sekmesini değiştirerek tekrar deneyin."
                    />
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-sm text-muted-foreground">
                    Siparişler yükleniyor...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <PurchaseOrderDetailDialog
        order={selectedOrder}
        detail={selectedDetail}
        loading={detailLoading}
        canApprove={canApprovePurchaseOrders}
        onClose={() => {
          setSelectedOrder(null);
          setSelectedDetail(null);
        }}
        onAction={runPurchaseAction}
        onInvoiceCreated={loadOrders}
      />
    </div>
  );
}

function purchaseInvoicePrefill(order: any): AccountingInvoicePrefill {
  const grandTotal = Number(order?.grandTotal ?? 0);
  const vatAmount = Number(order?.vatAmount ?? 0);
  const amount = Number(order?.subtotal ?? Math.max(0, grandTotal - vatAmount));
  return {
    companyId: order?.supplierCompanyId ?? order?.supplier?.id ?? "",
    invoiceCategory: (order?.purchaseType ?? "commercial") === "administrative" ? "administrative" : "commercial",
    type: "purchase",
    invoiceNo: order?.invoiceNo || `MF-${order?.orderNo ?? "PO"}`,
    invoiceDate: order?.orderDate,
    amount,
    vatAmount,
    grandTotal,
    vatRate: amount > 0 && vatAmount > 0 ? (vatAmount / amount) * 100 : 20,
    currencyCode: order?.currency?.code ?? "USD",
    paymentType: order?.paymentType,
    paymentTermDays: order?.paymentTermDays,
    previousPaymentTermDays: order?.previousPaymentTermDays,
    termChangeReason: order?.termChangeReason,
    incoterm: order?.incoterm,
    shipmentReference: order?.shipmentReference,
    orderNo: order?.orderNo,
    expectedDate: order?.expectedDate,
    firstDueDate: order?.expectedDate ?? order?.orderDate,
    notes: `Satın alma siparişi ${order?.orderNo ?? ""} kaynaklı`,
    commercialPurchaseLines: (order?.items ?? []).map((item: any) => ({
      productModelId: item.productModelId,
      description: item.description,
      quantity: item.quantity,
      listPrice: item.listPrice,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      vatRate: item.vatRate,
      expectedDate: item.expectedDate,
    })),
  };
}

function PurchaseOrderDetailDialog({
  order,
  detail,
  loading,
  canApprove,
  onClose,
  onAction,
  onInvoiceCreated,
}: {
  order: any | null;
  detail: any | null;
  loading: boolean;
  canApprove: boolean;
  onClose: () => void;
  onAction: (order: any, action: "send" | "approve" | "received" | "cancelled") => Promise<void>;
  onInvoiceCreated: () => void;
}) {
  const current = order ? { ...order, ...(detail ?? {}), supplier: order.supplier, status: order.status, currency: order.currency } : null;
  if (!order) return null;
  const items = detail?.items ?? [];
  const supplierName = current?.supplier?.shortName || current?.supplier?.legalTitle || "Firma seçilmemiş";
  const canCreateInvoice = Boolean(current?.supplierCompanyId || current?.supplier?.id);

  return (
    <Dialog open={!!order} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(900px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[88dvh] grid-rows-[auto_1fr_auto] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-start gap-3">
            <div className="size-11 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
              <ShoppingCart className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg truncate">{current?.orderNo ?? "Satın alma"}</DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2 flex-wrap">
                <StatusBadge status={current?.status?.name ?? current?.status?.code ?? "Taslak"} />
                <span className="text-muted-foreground">{purchaseTypeLabel(current?.purchaseType)}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground tabular-nums">{formatDate(current?.orderDate)}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto">
          <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <DetailStat icon={<Receipt className="size-4" />} label="Tutar" value={formatCurrency(Number(current?.grandTotal ?? 0), current?.currency?.code ?? "USD")} />
            <DetailStat icon={<Package className="size-4" />} label="Kalem" value={loading ? "..." : items.length} />
            <DetailStat icon={<Clock className="size-4" />} label="ETA" value={formatDate(current?.expectedDate)} />
            <DetailStat icon={<ClipboardCheck className="size-4" />} label="Ödeme" value={paymentTypeLabel(current?.paymentType)} />
          </div>

          <div className="px-6 pb-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-white p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Tedarikçi</div>
              <div className="text-sm font-medium">{supplierName}</div>
              <div className="mt-2 grid grid-cols-[96px_1fr] gap-2 text-sm">
                <span className="text-muted-foreground">Fatura No</span><span>{current?.invoiceNo || "—"}</span>
                <span className="text-muted-foreground">Referans</span><span>{current?.shipmentReference || "—"}</span>
                <span className="text-muted-foreground">Incoterm</span><span>{current?.incoterm || "—"}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-white p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Onay Akışı</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Durum</span><StatusBadge status={current?.status?.name ?? current?.status?.code ?? "Taslak"} /></div>
                <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Vade</span><span>{current?.paymentTermDays ?? 0} gün</span></div>
                <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Sebep</span><span className="text-right">{current?.approvalReason || "—"}</span></div>
              </div>
            </div>
          </div>

          <div className="px-6 pb-6">
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead>Kalem</TableHead>
                    <TableHead className="text-right">Adet</TableHead>
                    <TableHead className="text-right">Birim</TableHead>
                    <TableHead className="text-right">KDV</TableHead>
                    <TableHead className="text-right">Toplam</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="text-sm">{item.description}</div>
                        {item.expectedDate && <div className="text-[11px] text-muted-foreground">ETA {formatDate(item.expectedDate)}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{Number(item.quantity ?? 0).toLocaleString("tr-TR")}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(Number(item.unitPrice ?? 0), current?.currency?.code ?? "USD")}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(Number(item.vatAmount ?? 0), current?.currency?.code ?? "USD")}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(Number(item.lineTotal ?? 0) + Number(item.vatAmount ?? 0), current?.currency?.code ?? "USD")}</TableCell>
                    </TableRow>
                  ))}
                  {!loading && items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">Kalem yok.</TableCell>
                    </TableRow>
                  )}
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">Kalemler yükleniyor...</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border/60 bg-muted/20 flex-row flex-wrap items-center justify-end gap-2">
          {current?.status?.code === "draft" && (
            <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => onAction(current, "send")}>
              <Mail className="size-4" /> Gönder
            </Button>
          )}
          {current?.status?.code === "pending_manager_approval" && canApprove && (
            <Button variant="default" size="sm" className="h-9 gap-1" onClick={() => onAction(current, "approve")}>
              <CheckCircle2 className="size-4" /> Onayla
            </Button>
          )}
          {current?.status?.code === "approved" && (
            <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => onAction(current, "received")}>
              <ClipboardCheck className="size-4" /> Teslim Al
            </Button>
          )}
          <CreateAccountingInvoiceDialog
            prefill={purchaseInvoicePrefill(current)}
            onCreated={onInvoiceCreated}
            trigger={
              <Button variant="outline" size="sm" className="h-9 gap-1" disabled={!canCreateInvoice}>
                <Receipt className="size-4" /> Alış Faturası
              </Button>
            }
          />
          {current?.status?.code !== "cancelled" && (
            <Button variant="outline" size="sm" className="h-9 gap-1 border-destructive/30 text-destructive hover:bg-brand-red-soft hover:text-destructive" onClick={() => onAction(current, "cancelled")}>
              <XCircle className="size-4" /> İptal
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-9 ml-auto sm:ml-2" onClick={onClose}>Kapat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-sm font-medium tabular-nums truncate">{value}</div>
    </div>
  );
}

type PurchaseType = "commercial" | "administrative";
type PurchaseLineForm = {
  productModelId: string;
  description: string;
  quantity: string;
  listPrice: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  expectedDate: string;
};

const purchaseTypeLabel = (value?: string) => value === "administrative" ? "İdari" : "Ticari";
const paymentTypeLabel = (value?: string) => {
  if (value === "leasing") return "Leasing";
  if (value === "term") return "Vadeli";
  return "Peşin";
};
const todayInput = () => new Date().toISOString().slice(0, 10);
const VAT_OPTIONS = ["20", "18", "10", "8", "1", "0"] as const;
const blankPurchaseLine = (type: PurchaseType): PurchaseLineForm => ({
  productModelId: "",
  description: type === "administrative" ? "İdari satın alma gideri" : "",
  quantity: "1",
  listPrice: "",
  unitPrice: "",
  discountAmount: "0",
  vatRate: "20",
  expectedDate: "",
});
const toDecimal = (value: string | number | undefined) => {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
};
const valueToInput = (value: unknown) => (value === null || value === undefined || value === "" ? "" : String(value));
const productTitle = (product: any) =>
  product?.fullName || [product?.brand?.name ?? product?.brandName ?? product?.brand, product?.modelCode ?? product?.model].filter(Boolean).join(" · ");
const lineTotals = (line: PurchaseLineForm) => {
  const gross = toDecimal(line.quantity) * toDecimal(line.unitPrice);
  const discount = toDecimal(line.discountAmount);
  const taxable = Math.max(gross - discount, 0);
  const vat = taxable * (toDecimal(line.vatRate) / 100);
  return { gross, discount, taxable, vat, total: taxable + vat };
};

function CreatePurchaseOrderDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    purchaseType: "commercial" as PurchaseType,
    paymentType: "cash" as "cash" | "leasing" | "term",
    paymentTermDays: "0",
    previousPaymentTermDays: "",
    termChangeReason: "",
    supplierCompanyId: "",
    invoiceNo: "",
    orderNo: "",
    orderDate: todayInput(),
    expectedDate: "",
    currencyCode: "USD" as "USD" | "EUR" | "TRY",
    incoterm: "",
    shipmentReference: "",
    notes: "",
    lines: [blankPurchaseLine("commercial")],
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    productService.list({ pageSize: 200 }).catch(() => ({ data: [] })).then((productRes) => {
      if (cancelled) return;
      setProducts(productRes.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const setPurchaseType = (purchaseType: PurchaseType) => {
    setForm((current) => ({
      ...current,
      purchaseType,
      incoterm: purchaseType === "administrative" ? "" : current.incoterm,
      shipmentReference: purchaseType === "administrative" ? "" : current.shipmentReference,
      lines: current.lines.map((line, index) => ({
        ...line,
        productModelId: purchaseType === "administrative" ? "" : line.productModelId,
        description: line.description || blankPurchaseLine(purchaseType).description || (index === 0 ? "" : line.description),
      })),
    }));
  };

  const updateLine = (index: number, patch: Partial<PurchaseLineForm>) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };

  const addLine = () => {
    setForm((current) => ({ ...current, lines: [...current.lines, blankPurchaseLine(current.purchaseType)] }));
  };

  const removeLine = (index: number) => {
    setForm((current) => {
      const lines = current.lines.filter((_, i) => i !== index);
      return { ...current, lines: lines.length ? lines : [blankPurchaseLine(current.purchaseType)] };
    });
  };

  const totals = form.lines.reduce(
    (acc, line) => {
      const t = lineTotals(line);
      acc.subtotal += t.taxable;
      acc.discount += t.discount;
      acc.vat += t.vat;
      acc.total += t.total;
      return acc;
    },
    { subtotal: 0, discount: 0, vat: 0, total: 0 }
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // İdari satın almada firma opsiyonel; sadece ticari için zorunlu.
    if (form.purchaseType !== "administrative" && !form.supplierCompanyId) {
      toast.error("Ticari satın alma için firma seçimi zorunludur");
      return;
    }
    const cleanLines = form.lines
      .map((line) => ({ ...line, description: line.description.trim() }))
      .filter((line) => line.description && toDecimal(line.quantity) > 0 && toDecimal(line.unitPrice) > 0);
    if (!cleanLines.length) {
      toast.error("En az bir geçerli satın alma kalemi girin", { description: "Açıklama, adet ve olur fiyatı zorunludur." });
      return;
    }
    const invalidDiscountLine = cleanLines.find((line) => toDecimal(line.discountAmount) > toDecimal(line.quantity) * toDecimal(line.unitPrice));
    if (invalidDiscountLine) {
      toast.error("İndirim kalem tutarını aşamaz", { description: invalidDiscountLine.description });
      return;
    }
    setSubmitting(true);
    let createdOrderId: string | null = null;
    try {
      const created = await purchaseOrderService.create({
        supplierCompanyId: form.supplierCompanyId || undefined,
        purchaseType: form.purchaseType,
        paymentType: form.paymentType,
        paymentTermDays: form.paymentTermDays === "" ? undefined : Math.max(0, Math.trunc(toDecimal(form.paymentTermDays))),
        previousPaymentTermDays: form.previousPaymentTermDays === "" ? undefined : Math.max(0, Math.trunc(toDecimal(form.previousPaymentTermDays))),
        termChangeReason: form.termChangeReason.trim() || undefined,
        invoiceNo: form.invoiceNo.trim() || undefined,
        orderNo: form.orderNo.trim() || undefined,
        orderDate: new Date(form.orderDate),
        expectedDate: form.expectedDate ? new Date(form.expectedDate) : undefined,
        currencyCode: form.currencyCode,
        incoterm: form.purchaseType === "commercial" ? form.incoterm.trim() || undefined : undefined,
        shipmentReference: form.shipmentReference.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      createdOrderId = created.id;
      for (const [index, line] of cleanLines.entries()) {
        const description = form.purchaseType === "administrative" && line.productModelId
          ? `${line.productModelId.trim()} - ${line.description}`
          : line.description;
        await purchaseOrderService.addItem(created.id, {
          productModelId: form.purchaseType === "commercial" && line.productModelId ? line.productModelId : undefined,
          description,
          quantity: toDecimal(line.quantity),
          unitCode: "adet",
          unitPrice: toDecimal(line.unitPrice),
          listPrice: line.listPrice === "" ? undefined : toDecimal(line.listPrice),
          approvedPrice: toDecimal(line.unitPrice),
          discountAmount: toDecimal(line.discountAmount),
          vatRate: toDecimal(line.vatRate),
          expectedDate: line.expectedDate || form.expectedDate ? new Date(line.expectedDate || form.expectedDate) : undefined,
          sortOrder: index + 1,
        });
      }
      toast.success("Satın alma siparişi oluşturuldu", { description: created.orderNo });
      setOpen(false);
      setForm({
        purchaseType: "commercial",
        paymentType: "cash",
        paymentTermDays: "0",
        previousPaymentTermDays: "",
        termChangeReason: "",
        supplierCompanyId: "",
        invoiceNo: "",
        orderNo: "",
        orderDate: todayInput(),
        expectedDate: "",
        currencyCode: "USD",
        incoterm: "",
        shipmentReference: "",
        notes: "",
        lines: [blankPurchaseLine("commercial")],
      });
      onCreated();
    } catch (err: any) {
      if (createdOrderId) {
        await purchaseOrderService.remove(createdOrderId).catch(() => undefined);
      }
      toast.error("Satın alma siparişi oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Sipariş</Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-[1100px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Satın Alma Siparişi Oluştur</DialogTitle>
          <DialogDescription>Ticari veya idari satın alma için firma, fatura ve kalem bilgilerini girin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 min-w-0">
          <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <Label className="text-xs">Satın Alma Tipi</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["commercial", "administrative"] as PurchaseType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPurchaseType(type)}
                    className={`rounded-md border px-3 py-2 text-left text-xs font-medium ${
                      form.purchaseType === type ? "border-primary bg-primary/10 text-primary" : "border-border/70 bg-white hover:border-primary/50"
                    }`}
                  >
                    {purchaseTypeLabel(type)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <FormField label={form.purchaseType === "administrative" ? "Firma / Müşteri (opsiyonel)" : "Firma / Müşteri Listesi"}>
                <RemoteCompanyCombobox
                  value={form.supplierCompanyId}
                  onValueChange={(supplierCompanyId) => setForm({ ...form, supplierCompanyId })}
                  placeholder={form.purchaseType === "administrative" ? "Firma seçin (opsiyonel)…" : "Firma seçin…"}
                />
                {form.purchaseType === "administrative" && form.supplierCompanyId && (
                  <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-1.5 text-xs" onClick={() => setForm({ ...form, supplierCompanyId: "" })}>
                    Firma seçimini kaldır
                  </Button>
                )}
              </FormField>
              <FormField label="Ödeme Tipi">
                <Select
                  value={form.paymentType}
                  onValueChange={(paymentType) => {
                    const nextPaymentType = paymentType as "cash" | "leasing" | "term";
                    setForm({ ...form, paymentType: nextPaymentType, paymentTermDays: nextPaymentType === "cash" ? "0" : form.paymentTermDays });
                  }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Peşin</SelectItem>
                    <SelectItem value="leasing">Leasing</SelectItem>
                    <SelectItem value="term">Vadeli</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Fatura Numarası">
                <Input className="h-9" value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} placeholder="FTR-..." />
              </FormField>
              <FormField label="Sipariş No">
                <Input className="h-9" value={form.orderNo} onChange={(e) => setForm({ ...form, orderNo: e.target.value })} placeholder="Boşsa otomatik" />
              </FormField>
              <FormField label="Para Birimi">
                <Select value={form.currencyCode} onValueChange={(currencyCode: "USD" | "EUR" | "TRY") => setForm({ ...form, currencyCode })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="TRY">TL</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Sipariş Tarihi">
                <Input className="h-9" type="date" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} />
              </FormField>
              <FormField label="Beklenen Tarih">
                <Input className="h-9" type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
              </FormField>
              <FormField label="Yeni Vade (Gün)">
                <Input className="h-9" inputMode="numeric" value={form.paymentTermDays} onChange={(e) => setForm({ ...form, paymentTermDays: e.target.value })} placeholder="0" />
              </FormField>
              <FormField label="Önceki Vade (Gün)">
                <Input className="h-9" inputMode="numeric" value={form.previousPaymentTermDays} onChange={(e) => setForm({ ...form, previousPaymentTermDays: e.target.value })} placeholder="Opsiyonel" />
              </FormField>
              <FormField label={form.purchaseType === "commercial" ? "Incoterm" : "İdari Kategori"}>
                <Input
                  className="h-9"
                  value={form.incoterm}
                  onChange={(e) => setForm({ ...form, incoterm: e.target.value })}
                  placeholder={form.purchaseType === "commercial" ? "EXW / FOB / CIF" : "Ofis / bakım / hizmet"}
                />
              </FormField>
              <FormField label="Referans">
                <Input className="h-9" value={form.shipmentReference} onChange={(e) => setForm({ ...form, shipmentReference: e.target.value })} placeholder="İrsaliye / talep no" />
              </FormField>
              <FormField label="Vade Notu">
                <Input className="h-9" value={form.termChangeReason} onChange={(e) => setForm({ ...form, termChangeReason: e.target.value })} placeholder="Opsiyonel" />
              </FormField>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 overflow-x-auto">
            <div className="grid min-w-[1280px] grid-cols-[320px_280px_80px_120px_120px_105px_96px_130px_40px] gap-2 bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <div>{form.purchaseType === "commercial" ? "Ürün" : "Gider Türü"}</div>
              <div>Açıklama</div>
              <div>Adet</div>
              <div>Liste Fiyatı</div>
              <div>Olur Fiyatı</div>
              <div>İndirim</div>
              <div>KDV</div>
              <div className="text-right">Son Tutar</div>
              <div />
            </div>
            <div className="divide-y divide-border/60">
              {form.lines.map((line, index) => {
                const t = lineTotals(line);
                return (
                  <div key={index} className="grid min-w-[1280px] grid-cols-[320px_280px_80px_120px_120px_105px_96px_130px_40px] gap-2 px-3 py-2 items-center">
                    {form.purchaseType === "commercial" ? (
                      <Select value={line.productModelId || "__none"} onValueChange={(value) => {
                        if (value === "__none") {
                          updateLine(index, { productModelId: "" });
                          return;
                        }
                        const product = products.find((p) => p.id === value);
                        const productListPrice = valueToInput(product?.listPrice);
                        const productUnitPrice = valueToInput(product?.cashPrice ?? product?.approvedPrice ?? product?.listPrice);
                        updateLine(index, {
                          productModelId: value,
                          description: product ? productTitle(product) || line.description : line.description,
                          listPrice: productListPrice || line.listPrice,
                          unitPrice: productUnitPrice || line.unitPrice,
                          vatRate: valueToInput(product?.vatRate) || line.vatRate,
                        });
                      }}>
                        <SelectTrigger className="h-8 min-w-0"><SelectValue placeholder="Ürün seç" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Ürün seçmeden</SelectItem>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {productTitle(product)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input aria-label={`Kalem ${index + 1} gider türü`} className="h-8" value={line.productModelId} onChange={(e) => updateLine(index, { productModelId: e.target.value })} placeholder="Ofis, bakım..." />
                    )}
                    <Input aria-label={`Kalem ${index + 1} açıklaması`} className="h-8" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} placeholder="Kalem açıklaması" />
                    <Input aria-label={`Kalem ${index + 1} adedi`} className="h-8 text-right font-data" inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
                    <Input aria-label={`Kalem ${index + 1} liste fiyatı`} className="h-8 text-right font-data" inputMode="decimal" value={line.listPrice} onChange={(e) => updateLine(index, { listPrice: e.target.value })} placeholder="0" />
                    <Input aria-label={`Kalem ${index + 1} olur fiyatı`} className="h-8 text-right font-data" inputMode="decimal" value={line.unitPrice} onChange={(e) => updateLine(index, { unitPrice: e.target.value })} placeholder="0" />
                    <Input aria-label={`Kalem ${index + 1} indirimi`} className="h-8 text-right font-data" inputMode="decimal" value={line.discountAmount} onChange={(e) => updateLine(index, { discountAmount: e.target.value })} />
                    <Select value={line.vatRate} onValueChange={(vatRate) => updateLine(index, { vatRate })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {!VAT_OPTIONS.includes(line.vatRate as typeof VAT_OPTIONS[number]) && line.vatRate ? (
                          <SelectItem value={line.vatRate}>%{line.vatRate}</SelectItem>
                        ) : null}
                        {VAT_OPTIONS.map((rate) => <SelectItem key={rate} value={rate}>%{rate}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="text-right text-sm tabular-nums">{formatCurrency(t.total, form.currencyCode)}</div>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Kalem ${index + 1} satırını sil`} title="Kalemi sil" className="size-8" onClick={() => removeLine(index)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-start justify-between gap-4">
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addLine}>
              <Plus className="size-4" /> Kalem Ekle
            </Button>
            <div className="grid w-full max-w-md grid-cols-2 gap-2 text-sm">
              <SummaryLine label="Ara Toplam" value={formatCurrency(totals.subtotal, form.currencyCode)} />
              <SummaryLine label="İndirim" value={formatCurrency(totals.discount, form.currencyCode)} />
              <SummaryLine label="KDV" value={formatCurrency(totals.vat, form.currencyCode)} />
              <SummaryLine label="Son Tutar" value={formatCurrency(totals.total, form.currencyCode)} strong />
            </div>
          </div>

          <FormField label="Notlar">
            <Textarea className="min-h-[72px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Kaydediliyor..." : "Sipariş Oluştur"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
