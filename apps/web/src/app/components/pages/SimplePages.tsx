import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Skeleton } from "../ui/skeleton";
import { StatusBadge } from "../Layout";
import { CreateStockDialog, CreateServiceRequestDialog, CreateInstallationDialog, CreatePaymentDialog, CreateShipmentDialog, CreateDeliveryDialog, DeliveryFormFields, deliveryFormToPayload, deliveryToFormState, type DeliveryFormState } from "../dialogs/CreateDialogs";
import { QuoteDialog } from "../dialogs/QuoteDialog";
import { DocumentUploadDialog } from "../dialogs/DocumentUploadDialog";
import { DocumentPreviewDialog } from "../dialogs/DocumentPreviewDialog";
import { CreateUserDialog, UserDepartmentDialog } from "../admin/UserAdminDialogs";
import { EmptyState } from "../shared/EmptyState";
import { MiniKpi } from "../shared/MiniKpi";
import { DepartmentTargetButton } from "../admin/DepartmentTargetDialog";
import { safeLoad } from "../../../lib/safeLoad";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  salesStageLabel,
  SHIPMENT_STATUSES, DELIVERY_STATUSES,
} from "../../lib/mock";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area, PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import {
  Plus, Search, Upload, AlertTriangle, CheckCircle2, Clock,
  TrendingUp, ArrowDownRight, ArrowUpRight, Wallet, Receipt, Filter, Download, Printer, Mail, Phone, Building2,
  FileText, Package, Truck, Wrench, ClipboardCheck, ShoppingCart, MapPin, Calendar,
  ShieldCheck, FileSignature, Image as ImageIcon, MoreHorizontal, Eye, User as UserIcon, Trash2, RotateCcw,
  Lock, Save, X, Settings, Play, Pause, Square, MessageSquare, XCircle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

const initials = (n: string) => n.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
import { KanbanBoard, KanbanColumn } from "../KanbanBoard";
import { useStore } from "../../lib/store";
import { buildOfferTrend, buildPaymentMonthly, buildCurrencyPie } from "../../lib/chartAggregates";
import { useFx, FxRateBadge } from "../../lib/fx";
import { Customer, Delivery, DocumentItem, Offer, Payment, SalesCase, ServiceRequest, ServiceStage, User } from "../../lib/mock";
import { INSTALLATION_LOCATION_LABELS, formatDuration, type InstallationLocationType } from "@haksan/shared";
import { useAuth } from "../../../lib/auth";
import { toast } from "sonner";
import { adminService, companyService, productService, purchaseOrderService, salesOrderService, serviceService, reportService, fileService, quoteService, type YearEndReport } from "../../../lib/services";
import { exportToCsv } from "../../../lib/exportCsv";
import { ExportExcelButton } from "../ui/ExportExcelButton";
import { FilterPopover, usePaged, Pager } from "../ui/list-controls";
import {
  buildManagementInsights,
  type ManagementInsight,
  type OperationAction,
  type OperationFocus,
} from "../../lib/operations";
import {
  openPrintWindow, printAssetBase, trLongDate, trShortDate,
  proformaDoc, contractDoc, installationFormDoc, serviceFormDoc, quoteDoc, serviceQuoteDoc,
  dispatchNoteDoc,
  QUOTE_NOTE_VARIANTS, SERVICE_NOTE_VARIANTS, PROFORMA_NOTE_VARIANTS, fillNotePlaceholders,
} from "../../lib/print";
import { printOrWarn, openInMaps, formatDate, formatCurrency, splitVat } from "../../lib/pageHelpers";

export { OffersPage } from "./offers/OffersPage";
export { DocumentsPage } from "./documents/DocumentsPage";
export { PaymentsPage } from "./payments/PaymentsPage";
export { CustomerBalancesPage } from "./finance/CustomerBalancesPage";
export { DueDatesCalendarPage } from "./finance/DueDatesCalendarPage";
export { AccountingInvoicesPage } from "./finance/AccountingInvoicesPage";
export { StockPage } from "./stock/StockPage";
export { ServiceRequestsPage, ServiceKanbanPage } from "./service/ServicePages";
export { MachinesPage } from "./machines/MachinesPage";
export { SettingsPage } from "./settings/SettingsPage";

export function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

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
  const pending = orders.filter((p) => p.status?.code === "draft" || p.status?.code === "sent").length;
  const totalAmount = orders.reduce((a, p) => a + Number(p.grandTotal ?? 0), 0);

  const filtered = orders.filter((p) => {
    const supplier = p.supplier?.shortName || p.supplier?.legalTitle || "";
    return [p.orderNo, p.invoiceNo, supplier].some((value) => String(value ?? "").toLowerCase().includes(q.toLowerCase()));
  });

  const supplierStats = Array.from(new Set(filtered.map((p) => p.supplier?.shortName || p.supplier?.legalTitle || "—")))
    .map((s) => ({
      name: s,
      tutar: filtered
        .filter((p) => (p.supplier?.shortName || p.supplier?.legalTitle || "—") === s)
        .reduce((a, p) => a + Number(p.grandTotal ?? 0), 0),
    }));

  const poExportParams = q ? { search: q } : undefined;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="violet" icon={<ShoppingCart className="size-[18px]" />} label="Toplam Sipariş" value={total} sub={formatCurrency(totalAmount, "USD")} delta={6} />
        <MiniKpi tone="emerald" icon={<Package className="size-[18px]" />} label="Ticari" value={commercial} sub="mal/hizmet alımı" delta={3} />
        <MiniKpi tone="blue" icon={<Receipt className="size-[18px]" />} label="İdari" value={administrative} sub="genel gider" delta={2} />
        <MiniKpi tone="amber" icon={<Clock className="size-[18px]" />} label="Bekleyen" value={pending} sub="onay bekliyor" delta={1} />
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="tracking-tight">Tedarikçi Yüküne Göre</CardTitle>
          <p className="text-xs text-muted-foreground">Açık siparişlerdeki adet</p>
        </CardHeader>
        <CardContent className="h-56 pl-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={supplierStats} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" horizontal={false} />
              <XAxis type="number" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" stroke="#6b7280" fontSize={11} width={120} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
              <Bar dataKey="tutar" fill="#000c69" barSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="tracking-tight">Satın Alma Siparişleri</CardTitle>
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
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Tedarikçi</TableHead>
                <TableHead>Tip</TableHead>
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
                <TableRow key={p.id} className="group">
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
                  <TableCell className="text-sm tabular-nums">{p.orderNo}</TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">{p.invoiceNo || "—"}</TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">{formatDate(p.orderDate)}</TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">{formatDate(p.expectedDate)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {formatCurrency(Number(p.vatAmount ?? 0), p.currency?.code ?? "USD")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatCurrency(Number(p.grandTotal ?? 0), p.currency?.code ?? "USD")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={p.status?.name ?? p.status?.code ?? "Taslak"} />
                      {p.status?.code === "pending_manager_approval" && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-6 px-2 text-[10px] uppercase tracking-wider font-semibold border-amber-200 text-amber-700 hover:bg-amber-50"
                          onClick={async () => {
                            try {
                              await purchaseOrderService.approve(p.id);
                              toast.success("Yönetici onayı verildi");
                              loadOrders();
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : "API isteği başarısız oldu.";
                              toast.error("Onay başarısız", { description: msg });
                            }
                          }}
                        >
                          Onayla
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                    Satın alma siparişi bulunamadı.
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                    Siparişler yükleniyor...
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

type PurchaseType = "commercial" | "administrative";
type PurchaseLineForm = {
  productModelId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  expectedDate: string;
};

const purchaseTypeLabel = (value?: string) => value === "administrative" ? "İdari" : "Ticari";
const todayInput = () => new Date().toISOString().slice(0, 10);
const blankPurchaseLine = (type: PurchaseType): PurchaseLineForm => ({
  productModelId: "",
  description: type === "administrative" ? "İdari satın alma gideri" : "",
  quantity: "1",
  unitPrice: "",
  discountAmount: "0",
  vatRate: "20",
  expectedDate: "",
});
const toDecimal = (value: string | number | undefined) => {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
};
const lineTotals = (line: PurchaseLineForm) => {
  const gross = toDecimal(line.quantity) * toDecimal(line.unitPrice);
  const discount = toDecimal(line.discountAmount);
  const taxable = Math.max(gross - discount, 0);
  const vat = taxable * (toDecimal(line.vatRate) / 100);
  return { gross, discount, taxable, vat, total: taxable + vat };
};

function CreatePurchaseOrderDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    purchaseType: "commercial" as PurchaseType,
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
    Promise.all([
      companyService.list({ pageSize: 200 }).catch(() => ({ data: [] })),
      productService.list({ pageSize: 200 }).catch(() => ({ data: [] })),
    ]).then(([companyRes, productRes]) => {
      if (cancelled) return;
      setCompanies(companyRes.data ?? []);
      setProducts(productRes.data ?? []);
      setForm((current) => ({
        ...current,
        supplierCompanyId: current.supplierCompanyId || companyRes.data?.[0]?.id || "",
      }));
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
      .filter((line) => line.description && toDecimal(line.quantity) > 0 && toDecimal(line.unitPrice) >= 0);
    if (!cleanLines.length) {
      toast.error("En az bir satın alma kalemi girin");
      return;
    }
    setSubmitting(true);
    try {
      const created = await purchaseOrderService.create({
        supplierCompanyId: form.supplierCompanyId || undefined,
        purchaseType: form.purchaseType,
        invoiceNo: form.invoiceNo.trim() || undefined,
        orderNo: form.orderNo.trim() || undefined,
        orderDate: form.orderDate,
        expectedDate: form.expectedDate || undefined,
        currencyCode: form.currencyCode,
        incoterm: form.purchaseType === "commercial" ? form.incoterm.trim() || undefined : undefined,
        shipmentReference: form.shipmentReference.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
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
          discountAmount: toDecimal(line.discountAmount),
          vatRate: toDecimal(line.vatRate),
          expectedDate: line.expectedDate || form.expectedDate || undefined,
          sortOrder: index + 1,
        });
      }
      toast.success("Satın alma siparişi oluşturuldu", { description: created.orderNo });
      setOpen(false);
      setForm({
        purchaseType: "commercial",
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
                <Select
                  value={form.supplierCompanyId || "__none"}
                  onValueChange={(v) => setForm({ ...form, supplierCompanyId: v === "__none" ? "" : v })}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Firma seçin" /></SelectTrigger>
                  <SelectContent>
                    {form.purchaseType === "administrative" && <SelectItem value="__none">Firma seçmeden</SelectItem>}
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>{company.shortName || company.legalTitle}</SelectItem>
                    ))}
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
            </div>
          </div>

          <div className="rounded-lg border border-border/60 overflow-x-auto">
            <div className="grid min-w-[900px] grid-cols-[1.1fr_1.7fr_90px_120px_110px_90px_120px_40px] gap-2 bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <div>{form.purchaseType === "commercial" ? "Ürün" : "Gider Türü"}</div>
              <div>Açıklama</div>
              <div>Adet</div>
              <div>Birim Fiyat</div>
              <div>İndirim</div>
              <div>KDV</div>
              <div className="text-right">Son Tutar</div>
              <div />
            </div>
            <div className="divide-y divide-border/60">
              {form.lines.map((line, index) => {
                const t = lineTotals(line);
                return (
                  <div key={index} className="grid min-w-[900px] grid-cols-[1.1fr_1.7fr_90px_120px_110px_90px_120px_40px] gap-2 px-3 py-2 items-center">
                    {form.purchaseType === "commercial" ? (
                      <Select value={line.productModelId || "__none"} onValueChange={(value) => {
                        const product = products.find((p) => p.id === value);
                        updateLine(index, {
                          productModelId: value === "__none" ? "" : value,
                          description: product ? product.fullName ?? product.modelCode ?? line.description : line.description,
                        });
                      }}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Ürün seç" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Ürün seçmeden</SelectItem>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {[product.brand?.name, product.modelCode, product.fullName].filter(Boolean).join(" · ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input className="h-8" value={line.productModelId} onChange={(e) => updateLine(index, { productModelId: e.target.value })} placeholder="Ofis, bakım..." />
                    )}
                    <Input className="h-8" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} placeholder="Kalem açıklaması" />
                    <Input className="h-8 text-right" inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
                    <Input className="h-8 text-right" inputMode="decimal" value={line.unitPrice} onChange={(e) => updateLine(index, { unitPrice: e.target.value })} placeholder="0" />
                    <Input className="h-8 text-right" inputMode="decimal" value={line.discountAmount} onChange={(e) => updateLine(index, { discountAmount: e.target.value })} />
                    <Select value={line.vatRate} onValueChange={(vatRate) => updateLine(index, { vatRate })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1%</SelectItem>
                        <SelectItem value="10">10%</SelectItem>
                        <SelectItem value="20">20%</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-right text-sm tabular-nums">{formatCurrency(t.total, form.currencyCode)}</div>
                    <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => removeLine(index)}>
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

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-md border border-border/60 px-3 py-2 ${strong ? "bg-primary/10 text-primary" : "bg-muted/20"}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-right text-sm tabular-nums font-medium">{value}</div>
    </div>
  );
}

export function ShipmentsPage({ focus }: { focus?: OperationFocus }) {
  const { shipments, updateShipmentStatus, cases, customers } = useStore();
  const liveCustomerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const inTransit = shipments.filter((s) => s.status === "Yolda").length;
  const customs = shipments.filter((s) => s.status === "Gümrükte").length;
  const delivered = shipments.filter((s) => s.status === "Teslim Edildi").length;
  const visibleShipments =
    focus === "shipments" || focus === "pending"
      ? shipments.filter((s) => s.status !== "Teslim Edildi")
      : focus === "delivered"
      ? shipments.filter((s) => s.status === "Teslim Edildi")
      : shipments;

  const carrierMap = Array.from(new Set(shipments.map((s) => s.carrier)))
    .map((c, i) => ({
      name: c,
      value: shipments.filter((s) => s.carrier === c).length,
      fill: ["#000c69", "#cf060c", "#3b82f6", "#10b981"][i % 4],
    }));

  /** Sevkiyat detayını (satır kalemleri/seri no dahil) çekip HAKSAN antetli irsaliye basar. */
  const printDispatchNote = async (s: (typeof shipments)[number]) => {
    try {
      const full = await serviceService.shipment(s.id);
      const cust =
        customers.find((c) => c.id === full.companyId) ??
        customers.find((c) => c.id === cases.find((x) => x.id === s.salesCaseId)?.customerId);
      const adres = cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : undefined;
      const doc = dispatchNoteDoc(
        {
          irsaliyeNo: full.shipmentNo || full.trackingNo || s.trackingNo || String(full.id).slice(0, 8),
          tarih: full.shippedAt || full.createdAt,
          carrier: full.carrier ?? s.carrier,
          trackingNo: full.trackingNo ?? s.trackingNo,
          origin: full.origin ?? s.origin,
          destination: full.destination ?? s.destination,
          incoterm: full.incoterm ?? undefined,
          eta: full.eta ?? s.eta,
          firma: full.company?.legalTitle ?? full.company?.shortName ?? cust?.name,
          adres,
          items: (full.items ?? []).map((it: any) => ({
            description: it.description,
            serialNumber: it.serialNumber ?? undefined,
            quantity: Number(it.quantity ?? 1),
          })),
        },
        printAssetBase()
      );
      printOrWarn(doc);
    } catch (err: any) {
      toast.error("İrsaliye hazırlanamadı", { description: err?.message ?? "Sevkiyat detayı alınamadı." });
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="violet" icon={<Truck className="size-[18px]" />} label="Toplam Sevkiyat" value={shipments.length} sub="aktif izlenen" delta={4} />
        <MiniKpi tone="blue" icon={<Truck className="size-[18px]" />} label="Yolda" value={inTransit} sub="taşıma sürüyor" delta={1} />
        <MiniKpi tone="amber" icon={<ShieldCheck className="size-[18px]" />} label="Gümrükte" value={customs} sub="işlem bekliyor" delta={0} />
        <MiniKpi tone="emerald" icon={<CheckCircle2 className="size-[18px]" />} label="Teslim Edilen" value={delivered} sub="bu ay" delta={5} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="tracking-tight">Sevkiyat Takibi</CardTitle>
            <div className="flex items-center gap-2">
              <ExportExcelButton path="/exports/shipments" filename="sevkiyatlar.xlsx" className="h-9" />
              <CreateShipmentDialog trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Sevkiyat</Button>} />
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Takip</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead>Taşıyıcı</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleShipments.map((s) => {
                  const sc = cases.find((x) => x.id === s.salesCaseId);
                  return (
                    <TableRow key={s.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                            <Truck className="size-4" />
                          </div>
                          <div>
                            <div className="text-sm leading-tight tabular-nums">{s.trackingNo}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{s.carrier}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{liveCustomerName(sc?.customerId ?? "")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                            <MapPin className="size-3" />{s.origin}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                            <MapPin className="size-3" />{s.destination}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{s.carrier}</TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">{s.eta}</TableCell>
                      <TableCell>
                        <Select value={s.status} onValueChange={async (v) => {
                          try {
                            await updateShipmentStatus(s.id, v as any);
                            toast.success(`Sevkiyat durumu: ${v}`);
                          } catch (err: any) {
                            toast.error("Sevkiyat durumu güncellenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
                          }
                        }}>
                          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SHIPMENT_STATUSES.map((st) => <SelectItem key={st} value={st} className="text-xs">{st}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100" title="Sevk İrsaliyesi yazdır"
                          onClick={() => printDispatchNote(s)}>
                          <Printer className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {visibleShipments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState
                        icon={<Truck className="size-5" />}
                        title="Henüz sevkiyat kaydı yok"
                        description="Yeni sevkiyat ekleyerek lojistik takibine başlayın."
                        action={<CreateShipmentDialog trigger={<Button size="sm" className="gap-1"><Plus className="size-4" /> Yeni Sevkiyat</Button>} />}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Taşıyıcı Dağılımı</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={carrierMap} dataKey="value" nameKey="name" outerRadius={75} innerRadius={45} paddingAngle={2} isAnimationActive={false}>
                  {carrierMap.map((d) => (
                    <Cell key={`cr-${d.name}`} fill={d.fill} stroke="#fff" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function InstallationsPage() {
  const { customers, machines } = useStore();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInstallations = async () => {
    setLoading(true);
    try {
      const res = await serviceService.installations({ pageSize: 200 });
      setRows(res.data);
    } catch (err: any) {
      toast.error("Kurulumlar yüklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstallations();
  }, []);

  const installationRows = rows.map((i) => ({
    id: i.id,
    customerId: i.companyId ?? "",
    customerName: i.company?.shortName || i.company?.legalTitle || customers.find((c) => c.id === i.companyId)?.name || "—",
    contactName: i.contact?.fullName ?? "",
    deviceId: i.customerDeviceId ?? "",
    technician: i.assignedTo?.fullName ?? "—",
    scheduledDate: (i.scheduledDate as string | undefined)?.slice(0, 10) ?? "—",
    completedDate: (i.completedAt as string | undefined)?.slice(0, 10) ?? "",
    status: i.status?.name ?? i.status?.code ?? "Planlandı",
    location: i.location ?? "",
    locationType: (i.locationType as InstallationLocationType | null) ?? null,
    durationMinutes: i.durationMinutes != null ? Number(i.durationMinutes) : null,
    feeAmount: i.feeAmount != null ? Number(i.feeAmount) : null,
  }));

  // Toplam kurulum geliri (kaydedilmiş ücretler, USD).
  const totalFee = installationRows.reduce((s, i) => s + (i.feeAmount ?? 0), 0);

  // Kurulum Tutanağı çıktısı — müşteri bilgileri CRM'den, tezgah/CNC bilgileri
  // kuruluma bağlı makineden (yoksa müşterinin makinesinden) gelir; CRM'de
  // olmayan alanlar sahada elle doldurulmak üzere boş basılır.
  const printInstallationForm = (row: (typeof installationRows)[number], index: number) => {
    const cust = customers.find((c) => c.id === row.customerId);
    const m =
      machines.find((x) => x.id === row.deviceId) ??
      machines.find((x) => x.customerId === row.customerId);
    printOrWarn(
      installationFormDoc(
        {
          teslimTarihi: m?.deliveryDate ? trShortDate(m.deliveryDate) : "",
          kurulumTarihi: row.completedDate
            ? trShortDate(row.completedDate)
            : row.scheduledDate !== "—"
              ? trShortDate(row.scheduledDate)
              : "",
          formNo: String(index + 1).padStart(5, "0"),
          tezgah: m ? { marka: m.brand, tip: m.type, model: m.model, seriNo: m.serialNumber } : undefined,
          cnc: m?.controlUnit
            ? {
                marka: m.controlUnit.split(" ")[0],
                model: m.controlUnit.split(" ").slice(1).join(" ") || undefined,
                seriNo: m.controlUnitSerial,
              }
            : undefined,
          firma: cust?.name ?? row.customerName,
          ilgili: row.contactName || cust?.contactPerson,
          adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : row.location,
          telefon: cust?.phone,
          faks: cust?.fax,
          gsm: cust?.phone2,
          eposta: cust?.email,
          kurulumuYapan: row.technician !== "—" ? row.technician : "",
        },
        printAssetBase()
      )
    );
  };

  const planned = installationRows.filter((i) => ["Planlandı", "scheduled"].includes(i.status)).length;
  const completed = installationRows.filter((i) => ["Tamamlandı", "completed"].includes(i.status)).length;
  const upcoming = [...installationRows]
    .filter((i) => ["Planlandı", "scheduled"].includes(i.status))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MiniKpi tone="violet" icon={<Wrench className="size-[18px]" />} label="Toplam Kurulum" value={installationRows.length} sub="tüm zamanlar" delta={6} />
        <MiniKpi tone="amber" icon={<Calendar className="size-[18px]" />} label="Planlı" value={planned} sub="gelecek" delta={2} />
        <MiniKpi tone="emerald" icon={<CheckCircle2 className="size-[18px]" />} label="Tamamlandı" value={completed} sub="bu çeyrek" delta={4} />
        <MiniKpi tone="blue" icon={<TrendingUp className="size-[18px]" />} label="Başarı" value={`%${installationRows.length ? Math.round((completed / installationRows.length) * 100) : 0}`} sub="ilk seferde" delta={1} />
        <MiniKpi tone="emerald" icon={<Wallet className="size-[18px]" />} label="Kurulum Geliri" value={`$ ${totalFee.toLocaleString("tr-TR")}`} sub="hesaplanan ücret" delta={0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="tracking-tight">Tüm Kurulumlar</CardTitle>
            <CreateInstallationDialog
              onCreated={loadInstallations}
              trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Kurulum</Button>}
            />
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Teknisyen</TableHead>
                  <TableHead>Planlanan Tarih</TableHead>
                  <TableHead>Konum / Süre</TableHead>
                  <TableHead className="text-right">Ücret</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-16 text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installationRows.map((i, idx) => (
                  <TableRow key={i.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                          <Building2 className="size-4" />
                        </div>
                        <div>
                          <div className="text-sm leading-tight">{i.customerName}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">#{i.id.toUpperCase()}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{i.technician}</TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{i.scheduledDate}</TableCell>
                    <TableCell>
                      {i.locationType ? (
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex w-fit items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] ${
                            i.locationType === "istanbul_disi"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>
                            <MapPin className="size-3" />{INSTALLATION_LOCATION_LABELS[i.locationType]}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{formatDuration(i.durationMinutes ?? 0)}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i.feeAmount != null ? (
                        <span className="text-sm text-emerald-700">$ {i.feeAmount.toLocaleString("tr-TR")}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={i.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="size-7" title="Kurulum Tutanağı yazdır / PDF"
                        onClick={() => printInstallationForm(i, idx)}>
                        <Printer className="size-4 text-muted-foreground hover:text-primary" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && installationRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
                      Henüz kurulum kaydı yok.
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
                      Kurulumlar yükleniyor...
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Yaklaşan Ziyaretler</CardTitle>
            <p className="text-xs text-muted-foreground">Sıradaki saha çıkışları</p>
          </CardHeader>
          <CardContent className="space-y-2 pt-2">
            {upcoming.length === 0 && <div className="text-xs text-muted-foreground py-6 text-center">Planlı ziyaret yok</div>}
            {upcoming.map((i) => (
              <div key={i.id} className="flex items-center gap-3 py-2 border-b last:border-0 border-border/60">
                <div className="size-9 rounded-md bg-amber-50 text-amber-600 grid place-items-center shrink-0">
                  <Calendar className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-tight truncate">{i.customerName}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{i.technician}</div>
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums shrink-0">{i.scheduledDate.slice(5)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function DeliveriesPage() {
  const { deliveries, updateDeliveryStatus, customers } = useStore();
  const liveCustomerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const [selectedDelivery, setSelectedDelivery] = useState<(typeof deliveries)[number] | null>(null);
  const completed = deliveries.filter((d) => d.status === "Tamamlandı").length;
  const pending = deliveries.filter((d) => d.status === "Bekliyor").length;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MiniKpi tone="violet" icon={<ClipboardCheck className="size-[18px]" />} label="Toplam Teslimat" value={deliveries.length} sub="kayıt" delta={3} />
        <MiniKpi tone="emerald" icon={<CheckCircle2 className="size-[18px]" />} label="Tamamlandı" value={completed} sub="imzalı" delta={2} />
        <MiniKpi tone="amber" icon={<Clock className="size-[18px]" />} label="Bekleyen" value={pending} sub="imza bekliyor" delta={1} />
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="tracking-tight">Teslimat Kayıtları</CardTitle>
          <div className="flex items-center gap-2">
            <ExportExcelButton path="/exports/deliveries" filename="teslimatlar.xlsx" className="h-9" />
            <CreateDeliveryDialog trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Teslimat</Button>} />
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Müşteri</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead>Teslim Alan</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((d) => (
                <TableRow key={d.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                        <Building2 className="size-4" />
                      </div>
                      <div className="text-sm">{liveCustomerName(d.customerId)}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">{d.date}</TableCell>
                  <TableCell className="text-sm">{d.signedBy}</TableCell>
                  <TableCell>
                    <Select
                      value={d.status}
                      onValueChange={(v) => {
                        updateDeliveryStatus(d.id, v as any)
                          .then(() => toast.success(`Teslimat durumu: ${v}`))
                          .catch((err: any) => toast.error("Teslimat durumu güncellenemedi", { description: err?.message ?? "Backend isteği başarısız oldu." }));
                      }}
                    >
                      <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DELIVERY_STATUSES.map((st) => <SelectItem key={st} value={st} className="text-xs">{st}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100" title="Teslim formu / düzenle"
                      onClick={() => setSelectedDelivery(d)}>
                      <FileSignature className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {deliveries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState
                      icon={<ClipboardCheck className="size-5" />}
                      title="Henüz teslimat kaydı yok"
                      description="Müşteri teslim formu oluşturarak imza sürecini başlatın."
                      action={<CreateDeliveryDialog trigger={<Button size="sm" className="gap-1"><Plus className="size-4" /> Yeni Teslimat</Button>} />}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <DeliveryDetailDialog
        delivery={selectedDelivery}
        customerName={liveCustomerName}
        onClose={() => setSelectedDelivery(null)}
      />
    </div>
  );
}

function DeliveryDetailDialog({
  delivery,
  customerName,
  onClose,
}: {
  delivery: Delivery | null;
  customerName: (id: string) => string;
  onClose: () => void;
}) {
  const { customers, cases, machines, updateDelivery } = useStore();
  const [form, setForm] = useState<DeliveryFormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!delivery) {
      setForm(null);
      return;
    }
    const cust = customers.find((c) => c.id === delivery.customerId);
    setForm(deliveryToFormState(delivery, cust?.contactPerson));
  }, [delivery, customers]);

  const casesForCustomer = cases.filter((c) => c.customerId === form?.customerId);
  const machinesForCustomer = machines.filter((m) => m.customerId === form?.customerId);

  const save = async () => {
    if (!delivery || !form) return;
    setSaving(true);
    try {
      await updateDelivery(delivery.id, {
        customerId: form.customerId,
        salesCaseId: form.salesCaseId,
        date: form.date,
        signedBy: form.signedBy.trim() || "—",
        status: form.status,
        formData: deliveryFormToPayload(form),
      });
      toast.success("Teslimat güncellendi");
    } catch (err: any) {
      toast.error("Kaydedilemedi", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  /** DR.MAK Kurulum Tutanağı — PDF şablonu ile aynı düzen. */
  const printForm = () => {
    if (!delivery || !form) return;
    const cust = customers.find((c) => c.id === delivery.customerId);
    const fd = deliveryFormToPayload(form);
    const formNo = fd.formNo || String(delivery.id).slice(-5).padStart(5, "0");
    const doc = installationFormDoc(
      {
        teslimTarihi: form.date ? trShortDate(form.date) : "",
        kurulumTarihi: form.kurulumTarihi ? trShortDate(form.kurulumTarihi) : "",
        formNo,
        tezgah: fd.tezgah,
        cnc: fd.cnc,
        firma: cust?.name ?? customerName(delivery.customerId),
        ilgili: form.ilgili || cust?.contactPerson,
        adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : undefined,
        telefon: cust?.phone,
        faks: cust?.fax,
        gsm: cust?.phone2,
        eposta: cust?.email,
        kurulumuYapan: form.kurulumuYapan || undefined,
        teslimAlan: form.signedBy && form.signedBy !== "—" ? form.signedBy : undefined,
      },
      printAssetBase()
    );
    printOrWarn(doc);
  };

  return (
    <Dialog open={!!delivery} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(760px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        {delivery && form && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" /> Kurulum Tutanağı</DialogTitle>
              <DialogDescription>{customerName(delivery.customerId)}</DialogDescription>
            </DialogHeader>
            <DeliveryFormFields
              form={form}
              setForm={setForm}
              customers={customers}
              casesForCustomer={casesForCustomer}
              machinesForCustomer={machinesForCustomer}
            />
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" className="gap-1" onClick={printForm}><Printer className="size-4" /> Formu Yazdır</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Kapat</Button>
                <Button onClick={save} disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

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

type UserTargetType = "sales" | "service";
type UserTargetUnit = "count" | "amount";

export type UserTargetItem = {
  targetType: UserTargetType;
  category: string;
  activity: string;
  description: string;
  unit: UserTargetUnit;
  defaultTarget: string;
  target: string;
};

type TargetTemplateItem = Omit<UserTargetItem, "target">;

export type UserTarget = {
  period: string;
  salesAmount: string;
  currency: "USD";
  salesNewCustomers: string;
  serviceAmount: string;
  serviceCompleted: string;
  digitalLeadTarget: string;
  digitalConversionTarget: string;
  digitalBudget: string;
  visitTarget: string;
  callTarget: string;
  quoteTarget: string;
  targetItems: UserTargetItem[];
  note: string;
};

const currentPeriod = () => new Date().toISOString().slice(0, 7);
const sharedVisitTargets: Omit<TargetTemplateItem, "targetType">[] = [
  {
    category: "ZİYARET",
    activity: "MÜŞTERİ ZİYARETİ",
    description: "Halihazırdaki cari hesaplarda bulunan müşterimize yapılan ziyaret",
    unit: "count",
    defaultTarget: "20",
  },
  {
    category: "ZİYARET",
    activity: "TEKLİF TAKİP ZİYARETİ",
    description: "Verilen teklifler ile ilgili müşterilerle değerlendirme toplantısı yapılacak.",
    unit: "count",
    defaultTarget: "30",
  },
  {
    category: "ZİYARET",
    activity: "YENİ MÜŞTERİ ZİYARETİ",
    description: "Sistemimizde kayıtlı olmayan, daha önce teklif verilmemiş ve ziyaret edilmemiş potansiyel müşteri ziyareti",
    unit: "count",
    defaultTarget: "30",
  },
  {
    category: "ZİYARET",
    activity: "FUAR ZİYARETİ",
    description: "Sektörel ve ilgili potansiyel sektör fuarları ziyaret edilecek, müşterilerimizin standları ziyaret edilip, potansiyel firmalar ile görüşmeler sağlanacak.",
    unit: "count",
    defaultTarget: "2",
  },
];
const sharedDigitalTargets: Omit<TargetTemplateItem, "targetType">[] = [
  {
    category: "DİJİTAL PAZARLAMA",
    activity: "ÇEVRİMİÇİ TOPLANTI",
    description: "Potansiyel müşterilerle ilk tanışma toplantısı ve şirket sunumu için Zoom veya Windows Teams üzerinden toplantı yapılacak",
    unit: "count",
    defaultTarget: "8",
  },
  {
    category: "DİJİTAL PAZARLAMA",
    activity: "LINKEDIN PAYLAŞIMI",
    description: "Kurumsal sosyal medya hesaplarının gönderilerinin yeniden paylaşılması, web sitesi ürünlerinin link ile paylaşılması, üretici firmaların gönderilerinin yeniden paylaşılması",
    unit: "count",
    defaultTarget: "10",
  },
  {
    category: "DİJİTAL PAZARLAMA",
    activity: "INSTAGRAM PAYLAŞIMI",
    description: "Şirket ve ürünler ile ilgili hikaye paylaşımı",
    unit: "count",
    defaultTarget: "4",
  },
  {
    category: "DİJİTAL PAZARLAMA",
    activity: "YOUTUBE PAYLAŞIMI",
    description: "Haksan Makina Youtube hesabındaki videoların linkedin ve instagram hesaplarında paylaşılması",
    unit: "count",
    defaultTarget: "4",
  },
  {
    category: "DİJİTAL PAZARLAMA",
    activity: "WHATSAPP DURUM",
    description: "Şahsi ve şirket hatlarında Haksan Makina paylaşımı",
    unit: "count",
    defaultTarget: "10",
  },
];
const sharedQuoteTargets: Omit<TargetTemplateItem, "targetType">[] = [
  {
    category: "TEKLİF",
    activity: "YENİ TEKLİF",
    description: "Yeni tekliflerde firma baz alınacak",
    unit: "count",
    defaultTarget: "30",
  },
  {
    category: "TEKLİF",
    activity: "TEKLİF DURUM GÜNCELLEMESİ",
    description: "Sistemde açık olan tekliflerin durumlarının müşteri ile iletişim kurularak güncellenmesi, iptal veya kayıp olan tekliflerin teklif sahipleri ile iletişim kurularak güncellenmesi",
    unit: "count",
    defaultTarget: "30",
  },
];
const withTargetType = (targetType: UserTargetType, rows: Omit<TargetTemplateItem, "targetType">[]): TargetTemplateItem[] =>
  rows.map((row) => ({ targetType, ...row }));
const TARGET_TEMPLATES: Record<UserTargetType, TargetTemplateItem[]> = {
  sales: withTargetType("sales", [
    {
      category: "SATIŞ",
      activity: "SATIŞ HEDEFİ",
      description: "Tezgah teslimi yapıldığında hedef gerçekleşmiş olur.",
      unit: "count",
      defaultTarget: "3",
    },
    {
      category: "SATIŞ",
      activity: "TAHSİLAT HEDEFİ",
      description: "Satılan tezgahların bedellerinin tahsil edilmesi, sıralı ödemelerin takip edilmesi, açık kalan bakiyenin aylık ciro içindeki payı maksimum %5 olmalı.",
      unit: "amount",
      defaultTarget: "",
    },
    ...sharedVisitTargets,
    {
      category: "ARAMA",
      activity: "MÜŞTERİ MEMNUNİYET ARAMASI",
      description: "Halihazırdaki cari hesaplarda bulunan müşterimize yapılan telefon araması",
      unit: "count",
      defaultTarget: "60",
    },
    {
      category: "ARAMA",
      activity: "TEKLİF TAKİP ARAMASI",
      description: "Özellikle şehir dışı müşterilerin teklif durumları ile ilgili aramalar",
      unit: "count",
      defaultTarget: "40",
    },
    {
      category: "ARAMA",
      activity: "YENİ MÜŞTERİ ARAMASI",
      description: "Sistemimizde kayıtlı olmayan, daha önce teklif verilmemiş ve aranmamış potansiyel müşteri araması",
      unit: "count",
      defaultTarget: "40",
    },
    ...sharedDigitalTargets,
    ...sharedQuoteTargets,
  ]),
  service: withTargetType("service", [
    {
      category: "SATIŞ",
      activity: "DIŞ SERVİS",
      description: "Satışını bizim yapmadığımız, tezgahımızı kullanmayan firmalara servis hizmet verme",
      unit: "amount",
      defaultTarget: "50000",
    },
    {
      category: "SATIŞ",
      activity: "PERİYODİK BAKIM",
      description: "Periyodik bakım hizmet satışı",
      unit: "count",
      defaultTarget: "3",
    },
    {
      category: "SATIŞ",
      activity: "YEDEK PARÇA & AKSESUAR SATIŞI",
      description: "Yedek parça ve tezgah aksesuarlarının satışı",
      unit: "amount",
      defaultTarget: "25000",
    },
    ...sharedVisitTargets,
    {
      category: "ARAMA",
      activity: "HİZMET MEMNUNİYET ARAMASI",
      description: "Servis hizmeti verdiğimiz müşterilerin servis hizmet sonrası aranması, tezgahın bakım/onarım sonrası durumu hakkında bilgi alınması ve hizmet kalitemiz için müşterinin aranması",
      unit: "count",
      defaultTarget: "40",
    },
    {
      category: "ARAMA",
      activity: "TEKLİF TAKİP ARAMASI",
      description: "Teklif verdiğimiz müşterinin teklifin durumu hakkında aranması",
      unit: "count",
      defaultTarget: "40",
    },
    {
      category: "ARAMA",
      activity: "YENİ MÜŞTERİ ARAMASI",
      description: "Servis hizmeti verebileceğimiz yeni müşteri tarama araması",
      unit: "count",
      defaultTarget: "25",
    },
    ...sharedDigitalTargets,
    ...sharedQuoteTargets,
    {
      category: "TEKNİK",
      activity: "DEMO PARÇA ÜRETİMİ",
      description: "Tezgahlarımızın teknik kabiliyet ve kapasitesini gösteren demo parça işlenmesi, video çekimi",
      unit: "count",
      defaultTarget: "30",
    },
    {
      category: "TEKNİK",
      activity: "MÜŞTERİ BİLGİ PAYLAŞIMI",
      description: "Tezgahların kullanım kolaylığı sağlayan fonksiyonlarını, gizli özelliklerini, bakım ipuçları v.s. gibi müşterilere mail yoluyla bilgi paylaşımı, Youtube kanalımıza kısa video hazırlanması",
      unit: "count",
      defaultTarget: "30",
    },
    {
      category: "TEKNİK",
      activity: "TEZGAH ARGE ÇALIŞMASI",
      description: "Tezgahların teknik olarak eksik kalan, yetersiz kalan ve geliştirilmesi gerek konuların raporlanması",
      unit: "count",
      defaultTarget: "1",
    },
  ]),
};
const allTargetTemplates = () => [...TARGET_TEMPLATES.sales, ...TARGET_TEMPLATES.service];
const targetItemKey = (item: Pick<UserTargetItem, "targetType" | "category" | "activity">) => `${item.targetType}:${item.category}:${item.activity}`;
const defaultTargetItems = (): UserTargetItem[] => allTargetTemplates().map((item) => ({ ...item, target: item.defaultTarget }));
const emptyTarget = (): UserTarget => ({
  period: currentPeriod(),
  salesAmount: "",
  currency: "USD",
  salesNewCustomers: "",
  serviceAmount: "",
  serviceCompleted: "",
  digitalLeadTarget: "",
  digitalConversionTarget: "",
  digitalBudget: "",
  visitTarget: "",
  callTarget: "",
  quoteTarget: "",
  targetItems: defaultTargetItems(),
  note: "",
});
const targetValue = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const mergeTargetItems = (items: unknown): UserTargetItem[] => {
  const incoming = Array.isArray(items) ? items : [];
  const byKey = new Map<string, any>();
  incoming.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const maybe = item as Partial<UserTargetItem>;
    if (!maybe.targetType || !maybe.category || !maybe.activity) return;
    byKey.set(targetItemKey(maybe as UserTargetItem), maybe);
  });
  return allTargetTemplates().map((template) => {
    const existing = byKey.get(targetItemKey(template as UserTargetItem));
    return {
      ...template,
      target: targetValue(existing?.target ?? template.defaultTarget),
    };
  });
};
const targetNumberOrNull = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
};
const targetFromApi = (row: any): UserTarget => ({
  period: row.period ?? currentPeriod(),
  currency: "USD",
  salesAmount: targetValue(row.salesAmount),
  salesNewCustomers: targetValue(row.salesNewCustomers),
  serviceAmount: targetValue(row.serviceAmount),
  serviceCompleted: targetValue(row.serviceCompleted),
  digitalLeadTarget: targetValue(row.digitalLeadTarget),
  digitalConversionTarget: targetValue(row.digitalConversionTarget),
  digitalBudget: targetValue(row.digitalBudget),
  visitTarget: targetValue(row.visitTarget),
  callTarget: targetValue(row.callTarget),
  quoteTarget: targetValue(row.quoteTarget),
  targetItems: mergeTargetItems(row.targetItems),
  note: row.note ?? "",
});
const targetToApi = (target: UserTarget) => ({
  period: target.period,
  currency: "USD",
  salesAmount: targetNumberOrNull(target.salesAmount),
  salesNewCustomers: targetNumberOrNull(target.salesNewCustomers),
  serviceAmount: targetNumberOrNull(target.serviceAmount),
  serviceCompleted: targetNumberOrNull(target.serviceCompleted),
  digitalLeadTarget: targetNumberOrNull(target.digitalLeadTarget),
  digitalConversionTarget: targetNumberOrNull(target.digitalConversionTarget),
  digitalBudget: targetNumberOrNull(target.digitalBudget),
  visitTarget: targetNumberOrNull(target.visitTarget),
  callTarget: targetNumberOrNull(target.callTarget),
  quoteTarget: targetNumberOrNull(target.quoteTarget),
  targetItems: target.targetItems.map(({ targetType, category, activity, description, unit, target }) => ({
    targetType,
    category,
    activity,
    description,
    unit,
    target: target.trim(),
  })),
  note: target.note.trim() || undefined,
});
const hasTargetValue = (t?: UserTarget) =>
  !!t &&
  ([
    t.salesAmount,
    t.salesNewCustomers,
    t.serviceAmount,
    t.serviceCompleted,
    t.digitalLeadTarget,
    t.digitalConversionTarget,
    t.digitalBudget,
    t.visitTarget,
    t.callTarget,
    t.quoteTarget,
  ].some((value) => !!value?.trim()) ||
    t.targetItems.some((item) => !!item.target.trim()));
const targetFilledCount = (target: UserTarget, targetType: UserTargetType) =>
  target.targetItems.filter((item) => item.targetType === targetType && !!item.target.trim()).length;
const targetTotalCount = (targetType: UserTargetType) => TARGET_TEMPLATES[targetType].length;

function TargetPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue-soft px-2 py-0.5 text-[11px] text-brand-blue">
      <TrendingUp className="size-3" />
      <span>{label}</span>
      <span className="text-blue-500">{value}</span>
    </span>
  );
}

type AssignableRole = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isSystemRole?: boolean;
};

type AdminUserRow = User & {
  roleCodes: string[];
  roleNames: string[];
  departmentId?: string | null;
};

const FALLBACK_ROLE_CODES: Record<string, string> = {
  SuperAdmin: "super_admin",
  Admin: "admin",
  Sales: "sales",
  Service: "service",
};

const normalizeStoreUser = (user: User): AdminUserRow => ({
  ...user,
  roleCodes: [FALLBACK_ROLE_CODES[user.role] ?? user.role],
  roleNames: [user.role],
});

const normalizeAdminUser = (user: any, fallback?: User): AdminUserRow => {
  const roles = Array.isArray(user.roles) ? user.roles : [];
  const roleCodes = roles.map((role: any) => String(role?.code ?? "")).filter(Boolean);
  const roleNames = roles.map((role: any) => String(role?.name ?? role?.code ?? "")).filter(Boolean);
  const fallbackRole = fallback?.role ?? "Admin";

  return {
    id: user.id,
    name: user.fullName ?? user.name ?? fallback?.name ?? user.email ?? "—",
    email: user.email ?? fallback?.email ?? "",
    role: ((roleNames[0] ?? fallbackRole) as User["role"]) || fallbackRole,
    department: user.department?.name ?? fallback?.department ?? "",
    departmentId: user.departmentId ?? user.department?.id ?? fallback?.departmentId ?? null,
    active: user.status ? user.status !== "passive" : fallback?.active ?? true,
    avatarUrl: user.avatarUrl ?? user.photoUrl ?? fallback?.avatarUrl,
    purchaseApprovalLimit: user.purchaseApprovalLimit ? Number(user.purchaseApprovalLimit) : fallback?.purchaseApprovalLimit,
    managerId: user.managerId ?? fallback?.managerId,
    roleCodes: roleCodes.length ? roleCodes : [FALLBACK_ROLE_CODES[fallbackRole] ?? fallbackRole],
    roleNames: roleNames.length ? roleNames : [fallbackRole],
  };
};

export function UsersPage() {
  const { users } = useStore();
  const { hasRole, hasPermission } = useAuth();
  // Hedef oluşturma süper admin (ve admin) yetkisine bağlı.
  const canSetTargets = hasRole("super_admin") || hasRole("admin");
  const canAssignRoles = hasRole("super_admin") || hasPermission("users.update");
  const canCreateUser = hasRole("super_admin") || hasPermission("users.create");
  const canUpdateUser = hasRole("super_admin") || hasPermission("users.update");
  const canShowActions = canSetTargets || canAssignRoles || canUpdateUser;
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [availableRoles, setAvailableRoles] = useState<AssignableRole[]>([]);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [targetPeriod, setTargetPeriod] = useState(currentPeriod());
  const [targets, setTargets] = useState<Record<string, UserTarget>>({});
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [roleUser, setRoleUser] = useState<AdminUserRow | null>(null);
  const [limitUser, setLimitUser] = useState<User | null>(null);
  const [deptUser, setDeptUser] = useState<AdminUserRow | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [savingLimit, setSavingLimit] = useState(false);
  const [savingDept, setSavingDept] = useState(false);

  const loadAdminUsers = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const [userRows, roleRows, deptRows] = await Promise.all([
        adminService.users(),
        canAssignRoles || canCreateUser ? adminService.roles() : Promise.resolve([]),
        adminService.departments().catch(() => []),
      ]);
      const fallbackById = new Map(users.map((user) => [user.id, user]));
      setAdminUsers((Array.isArray(userRows) ? userRows : []).map((user) => normalizeAdminUser(user, fallbackById.get(user.id))));
      setDepartments((Array.isArray(deptRows) ? deptRows : []).map((d: any) => ({ id: d.id, name: d.name, code: d.code })));
      setAvailableRoles(
        (Array.isArray(roleRows) ? roleRows : [])
          .map((role: any) => ({
            id: role.id,
            code: role.code,
            name: role.name,
            description: role.description,
            isSystemRole: role.isSystemRole,
          }))
          .sort((a, b) => {
            if (!!b.isSystemRole !== !!a.isSystemRole) return Number(!!b.isSystemRole) - Number(!!a.isSystemRole);
            return a.name.localeCompare(b.name, "tr");
          })
      );
    } catch (err: any) {
      setAdminError(err?.message ?? "Kullanıcılar yüklenemedi.");
      setAdminUsers([]);
      setAvailableRoles([]);
    } finally {
      setAdminLoading(false);
    }
  }, [canAssignRoles, canCreateUser, users]);

  useEffect(() => {
    loadAdminUsers();
  }, [loadAdminUsers]);

  const displayUsers = adminUsers.length ? adminUsers : users.map(normalizeStoreUser);

  const fetchTargets = useCallback(async () => {
    if (!canSetTargets) return;
    try {
      const rows = await adminService.userTargets({ period: targetPeriod });
      const next: Record<string, UserTarget> = {};
      rows.forEach((row: any) => {
        next[row.userId] = targetFromApi(row);
      });
      setTargets(next);
    } catch (err: any) {
      toast.error("Hedefler yüklenemedi", { description: err?.message ?? "Backend isteği başarısız oldu." });
    }
  }, [canSetTargets, targetPeriod]);

  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  const handleSaveTarget = async (userId: string, target: UserTarget) => {
    const saved = await adminService.saveUserTarget(userId, targetToApi({ ...target, period: targetPeriod }));
    setTargets((prev) => ({ ...prev, [userId]: targetFromApi(saved) }));
  };

  const handleSaveLimit = async (userId: string, limit: number | undefined, managerId: string | undefined) => {
    setSavingLimit(true);
    try {
      await adminService.updateUser(userId, {
        purchaseApprovalLimit: limit ?? 0,
        managerId: managerId ?? null,
      });
      toast.success("Kullanıcı limitleri güncellendi");
      setLimitUser(null);
      await loadAdminUsers();
    } catch (err: any) {
      toast.error("Limitler güncellenemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setSavingLimit(false);
    }
  };

  const handleSaveRoles = async (userId: string, roleCodes: string[]) => {
    setSavingRoles(true);
    try {
      await adminService.updateUser(userId, { roleCodes });
      toast.success("Roller güncellendi");
      setRoleUser(null);
      await loadAdminUsers();
    } catch (err: any) {
      toast.error("Roller güncellenemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setSavingRoles(false);
    }
  };

  const handleSaveDepartment = async (userId: string, departmentId: string | null, active: boolean) => {
    setSavingDept(true);
    try {
      await adminService.updateUser(userId, { departmentId, status: active ? "active" : "passive" });
      toast.success("Kullanıcı güncellendi");
      setDeptUser(null);
      await loadAdminUsers();
    } catch (err: any) {
      toast.error("Güncellenemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setSavingDept(false);
    }
  };

  return (
    <>
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Kullanıcılar</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {canSetTargets && (
              <Input
                type="month"
                className="h-9 w-full sm:w-[150px]"
                value={targetPeriod}
                onChange={(e) => setTargetPeriod(e.target.value || currentPeriod())}
              />
            )}
            {canCreateUser && (
              <Button className="gap-1" onClick={() => setCreateUserOpen(true)}><Plus className="size-4" /> Kullanıcı Ekle</Button>
            )}
          </div>
        </CardHeader>
        {adminError && (
          <div className="mx-4 mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {adminError}
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Soyad</TableHead>
                <TableHead>E-posta</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Departman</TableHead>
                <TableHead>Hedef</TableHead>
                <TableHead>Onay Limiti</TableHead>
                <TableHead>Yönetici</TableHead>
                <TableHead>Aktif</TableHead>
                {canShowActions && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminLoading && displayUsers.length === 0 ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <TableRow key={`users-loading-${index}`}>
                    {Array.from({ length: canShowActions ? 9 : 8 }).map((__, cellIndex) => (
                      <TableCell key={cellIndex}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : displayUsers.map((u) => {
                const t = targets[u.id];
                return (
                  <TableRow key={u.id}>
                    <TableCell>{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {u.roleNames.map((role) => (
                          <Badge key={role} variant="secondary">{role}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {canUpdateUser ? (
                        <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setDeptUser(u)}>
                          {u.department || "— Atanmadı —"}
                        </Button>
                      ) : (
                        u.department || "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {hasTargetValue(t) ? (
                        <div className="flex flex-wrap gap-1">
                          <TargetPill label="Satış" value={`${targetFilledCount(t, "sales")}/${targetTotalCount("sales")}`} />
                          <TargetPill label="Servis" value={`${targetFilledCount(t, "service")}/${targetTotalCount("service")}`} />
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.purchaseApprovalLimit ? `${u.purchaseApprovalLimit.toLocaleString("tr-TR")} ₺` : <span className="text-muted-foreground text-xs">Limitsiz</span>}
                    </TableCell>
                    <TableCell>
                      {u.managerId ? displayUsers.find((x) => x.id === u.managerId)?.name : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.active}
                        disabled={!canUpdateUser}
                        onCheckedChange={canUpdateUser ? (checked) => void handleSaveDepartment(u.id, u.departmentId ?? null, checked) : undefined}
                      />
                    </TableCell>
                    {canShowActions && (
                      <TableCell className="text-right whitespace-nowrap">
                        {canUpdateUser && (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setDeptUser(u)}>
                            <Building2 className="size-3.5" /> Departman
                          </Button>
                        )}
                        {canAssignRoles && (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setRoleUser(u)}>
                            <ShieldCheck className="size-3.5" /> Rol Ata
                          </Button>
                        )}
                        {canSetTargets && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setTargetUser(u)}>
                              <TrendingUp className="size-3.5" /> Hedef
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setLimitUser(u)}>
                              <Settings className="size-3.5" /> Limit
                            </Button>
                          </>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {canSetTargets && (
        <UserTargetDialog
          user={targetUser}
          target={targetUser ? targets[targetUser.id] : undefined}
          period={targetPeriod}
          onClose={() => setTargetUser(null)}
          onSave={handleSaveTarget}
        />
      )}
      {canAssignRoles && (
        <UserRoleDialog
          user={roleUser}
          roles={availableRoles}
          saving={savingRoles}
          onClose={() => setRoleUser(null)}
          onSave={handleSaveRoles}
        />
      )}
      {canSetTargets && (
        <UserLimitDialog
          user={limitUser}
          users={displayUsers}
          saving={savingLimit}
          onClose={() => setLimitUser(null)}
          onSave={handleSaveLimit}
        />
      )}
      {canUpdateUser && (
        <UserDepartmentDialog
          user={deptUser}
          departments={departments}
          saving={savingDept}
          onClose={() => setDeptUser(null)}
          onSave={handleSaveDepartment}
        />
      )}
      {canCreateUser && (
        <CreateUserDialog
          open={createUserOpen}
          onOpenChange={setCreateUserOpen}
          departments={departments}
          roles={availableRoles}
          onCreated={loadAdminUsers}
        />
      )}
    </>
  );
}

function UserRoleDialog({ user, roles, saving, onClose, onSave }: {
  user: AdminUserRow | null;
  roles: AssignableRole[];
  saving: boolean;
  onClose: () => void;
  onSave: (userId: string, roleCodes: string[]) => Promise<void>;
}) {
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  useEffect(() => {
    if (user) setSelectedCodes(user.roleCodes);
  }, [user]);

  if (!user) return null;

  const toggleRole = (code: string, checked: boolean) => {
    setSelectedCodes((current) =>
      checked ? [...new Set([...current, code])].sort() : current.filter((item) => item !== code)
    );
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave(user.id, selectedCodes);
  };

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Rol Ata · {user.name}</DialogTitle>
          <DialogDescription>Kullanıcının erişim rollerini seçin. Kaydettiğinizde roller mevcut seçimle değiştirilir.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
            <div className="font-medium">{user.email}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {user.roleNames.map((role) => <Badge key={role} variant="outline">{role}</Badge>)}
            </div>
          </div>
          {roles.length === 0 ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>Rol listesi yüklenemedi</AlertTitle>
              <AlertDescription>Rol ataması yapabilmek için rol okuma yetkisi veya bağlantı gerekir.</AlertDescription>
            </Alert>
          ) : (
            <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">
              {roles.map((role) => {
                const checked = selectedCodes.includes(role.code);
                return (
                  <label
                    key={role.id}
                    htmlFor={`assign-role-${role.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border/60 p-3 transition-colors hover:bg-muted/40"
                  >
                    <Checkbox
                      id={`assign-role-${role.id}`}
                      checked={checked}
                      onCheckedChange={(value) => toggleRole(role.code, value === true)}
                      disabled={saving}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-medium leading-none">{role.name}</span>
                        {role.isSystemRole && <Badge variant="secondary" className="text-[10px]">Sistem</Badge>}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{role.description || role.code}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
            <Button type="submit" disabled={saving || roles.length === 0}>
              {saving ? "Kaydediliyor..." : "Rolleri Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserLimitDialog({ user, users, saving, onClose, onSave }: {
  user: User | null;
  users: User[];
  saving: boolean;
  onClose: () => void;
  onSave: (userId: string, limit: number | undefined, managerId: string | undefined) => Promise<void>;
}) {
  const [limit, setLimit] = useState<string>(user?.purchaseApprovalLimit?.toString() || "");
  const [managerId, setManagerId] = useState<string>(user?.managerId || "none");

  useEffect(() => {
    if (user) {
      setLimit(user.purchaseApprovalLimit?.toString() || "");
      setManagerId(user.managerId || "none");
    }
  }, [user]);

  if (!user) return null;

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Satınalma Limit & Onay Yetkisi</DialogTitle>
          <DialogDescription>{user.name} için satınalma onay limitini ve yöneticisini ayarlayın.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Onay Limiti (₺)</Label>
            <Input
              type="number"
              placeholder="Limitsiz için boş bırakın"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Bağlı Olduğu Yönetici</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger>
                <SelectValue placeholder="Yönetici Seçin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Yok (Doğrudan Onaylar)</SelectItem>
                {users.filter(u => u.id !== user.id).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">Limit aşıldığında sipariş bu yöneticinin onayına sunulur.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              await onSave(user.id, limit ? Number(limit) : undefined, managerId === "none" ? undefined : managerId);
            }}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserTargetDialog({ user, target, period, onClose, onSave }: {
  user: User | null;
  target?: UserTarget;
  period: string;
  onClose: () => void;
  onSave: (userId: string, target: UserTarget) => Promise<void>;
}) {
  const [form, setForm] = useState<UserTarget>(emptyTarget());
  const [activeTargetType, setActiveTargetType] = useState<UserTargetType>("sales");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm(target ? { ...emptyTarget(), ...target, period, targetItems: mergeTargetItems(target.targetItems) } : { ...emptyTarget(), period });
    setActiveTargetType("sales");
  }, [user, target, period]);

  if (!user) return null;

  const updateField = (key: keyof UserTarget, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateItemTarget = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      targetItems: prev.targetItems.map((item) => (targetItemKey(item) === key ? { ...item, target: value } : item)),
    }));
  };
  const resetActiveDefaults = () => {
    setForm((prev) => ({
      ...prev,
      targetItems: prev.targetItems.map((item) => (item.targetType === activeTargetType ? { ...item, target: item.defaultTarget } : item)),
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(user.id, {
        ...form,
        period,
        salesAmount: form.salesAmount.trim(),
        salesNewCustomers: form.salesNewCustomers.trim(),
        serviceAmount: form.serviceAmount.trim(),
        serviceCompleted: form.serviceCompleted.trim(),
        digitalLeadTarget: form.digitalLeadTarget.trim(),
        digitalConversionTarget: form.digitalConversionTarget.trim(),
        digitalBudget: form.digitalBudget.trim(),
        visitTarget: form.visitTarget.trim(),
        callTarget: form.callTarget.trim(),
        quoteTarget: form.quoteTarget.trim(),
        targetItems: form.targetItems.map((item) => ({ ...item, target: item.target.trim() })),
        note: form.note.trim(),
      });
      toast.success("Hedef kaydedildi", { description: `${user.name} · ${period}` });
      onClose();
    } catch (err: any) {
      toast.error("Hedef kaydedilemedi", { description: err?.message ?? "Backend isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-none gap-0 overflow-hidden p-0 sm:w-[min(1180px,calc(100vw-2rem))] sm:max-w-none max-h-[92dvh]">
        <form onSubmit={submit} className="flex max-h-[92dvh] flex-col">
          <DialogHeader className="border-b border-border/60 px-4 py-4 pr-11 sm:px-5">
            <DialogTitle className="leading-snug">Hedef Belirle · {user.name}</DialogTitle>
            <DialogDescription>{user.role} · {user.department} — {period} dönemi aylık hedefleri.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="grid gap-3 sm:grid-cols-[160px_120px_1fr]">
              <FormField label="Dönem">
                <Input type="month" className="h-9" value={period} disabled />
              </FormField>
              <FormField label="Para Birimi">
                <Input className="h-9 bg-muted/50 font-medium" value="USD" disabled />
              </FormField>
              <FormField label="Not">
                <Textarea className="min-h-[36px] resize-none" value={form.note} onChange={(e) => updateField("note", e.target.value)} />
              </FormField>
            </div>

            <Tabs value={activeTargetType} onValueChange={(value) => setActiveTargetType(value as UserTargetType)}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <TabsList className="grid h-9 w-full grid-cols-2 bg-muted/60 sm:w-auto">
                  <TabsTrigger value="sales" className="gap-1.5 whitespace-nowrap">
                    <TrendingUp className="size-3.5" /> Satış Hedefleri
                  </TabsTrigger>
                  <TabsTrigger value="service" className="gap-1.5 whitespace-nowrap">
                    <Wrench className="size-3.5" /> Servis Hedefleri
                  </TabsTrigger>
                </TabsList>
                <Button type="button" variant="outline" size="sm" className="h-8 w-full gap-1.5 sm:w-auto" onClick={resetActiveDefaults}>
                  <RotateCcw className="size-3.5" /> Şablondan Doldur
                </Button>
              </div>
              <TabsContent value="sales" className="mt-3">
                <TargetTemplateTable
                  items={form.targetItems.filter((item) => item.targetType === "sales")}
                  onTargetChange={updateItemTarget}
                />
              </TabsContent>
              <TabsContent value="service" className="mt-3">
                <TargetTemplateTable
                  items={form.targetItems.filter((item) => item.targetType === "service")}
                  onTargetChange={updateItemTarget}
                />
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter className="border-t border-border/60 px-4 py-3 sm:px-5 sm:py-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>İptal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const targetCurrencyLabel = () => "USD";

function groupTargetItems(items: UserTargetItem[]) {
  const groups: { category: string; items: UserTargetItem[] }[] = [];
  items.forEach((item) => {
    const last = groups[groups.length - 1];
    if (last?.category === item.category) {
      last.items.push(item);
    } else {
      groups.push({ category: item.category, items: [item] });
    }
  });
  return groups;
}

function TargetTemplateTable({ items, onTargetChange }: {
  items: UserTargetItem[];
  onTargetChange: (key: string, value: string) => void;
}) {
  const groups = groupTargetItems(items);
  return (
    <div className="space-y-3">
      <div className="md:hidden space-y-3">
        {groups.map((group) => (
          <div key={group.category} className="space-y-2">
            <div className="sticky top-0 z-10 rounded-md bg-background/95 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
              {group.category}
            </div>
            {group.items.map((item) => (
              <div key={targetItemKey(item)} className="rounded-md border border-border/60 bg-background p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug">{item.activity}</div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</div>
                  </div>
                  <div className="shrink-0">
                    {item.unit === "amount" && <div className="mb-1 text-right text-[11px] text-muted-foreground">{targetCurrencyLabel()}</div>}
                    <Input
                      className="h-8 w-24 text-right tabular-nums"
                      inputMode={item.unit === "amount" ? "decimal" : "numeric"}
                      value={item.target}
                      onChange={(e) => onTargetChange(targetItemKey(item), e.target.value)}
                      placeholder={item.unit === "amount" ? "tutar" : "adet"}
                    />
                    {item.unit === "count" && <div className="mt-1 text-right text-[11px] text-muted-foreground">adet</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-md border border-border/60 md:block">
      <div className="max-h-[54vh] overflow-auto">
        <Table className="min-w-[900px] table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-[130px]">Kategori</TableHead>
              <TableHead className="w-[250px]">Aktivite</TableHead>
              <TableHead>Aktivite Açıklaması</TableHead>
              <TableHead className="w-[180px] text-right">Aylık Hedef</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) =>
              group.items.map((item, index) => (
                <TableRow key={targetItemKey(item)} className={index === 0 ? "border-t border-border/70" : undefined}>
                  <TableCell className="align-top text-xs font-semibold text-muted-foreground">
                    {index === 0 ? group.category : ""}
                  </TableCell>
                  <TableCell className="align-top text-sm font-medium whitespace-normal break-words">{item.activity}</TableCell>
                  <TableCell className="align-top text-xs leading-relaxed text-muted-foreground whitespace-normal break-words">{item.description}</TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center justify-end gap-1.5">
                      {item.unit === "amount" && <span className="min-w-8 text-right text-xs text-muted-foreground">{targetCurrencyLabel()}</span>}
                      <Input
                        className="h-8 w-24 text-right tabular-nums"
                        inputMode={item.unit === "amount" ? "decimal" : "numeric"}
                        value={item.target}
                        onChange={(e) => onTargetChange(targetItemKey(item), e.target.value)}
                        placeholder={item.unit === "amount" ? "tutar" : "adet"}
                      />
                      {item.unit === "count" && <span className="w-8 text-xs text-muted-foreground">adet</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      </div>
    </div>
  );
}

type PermissionAction = "read" | "create" | "update" | "delete" | "approve" | "reject" | "export";
type PermissionDto = {
  id: string;
  code: string;
  name: string;
  resource: string;
  action: PermissionAction;
  description?: string | null;
};
type RoleDto = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isSystemRole?: boolean;
  permissions: Array<{ code: string; name: string }>;
};

const PERMISSION_ACTIONS: PermissionAction[] = ["read", "create", "update", "delete", "approve", "reject", "export"];
const ACTION_LABEL: Record<PermissionAction, string> = {
  read: "Oku",
  create: "Ekle",
  update: "Düzenle",
  delete: "Sil",
  approve: "Onay",
  reject: "Ret",
  export: "Dışa Aktar",
};
const RESOURCE_LABEL: Record<string, string> = {
  tenants: "Tenant",
  users: "Kullanıcılar",
  roles: "Roller",
  departments: "Departmanlar",
  companies: "Firmalar",
  contacts: "Kontaklar",
  leads: "Lead",
  opportunities: "Fırsatlar",
  activities: "Aktiviteler",
  competitors: "Rakipler",
  brands: "Markalar",
  products: "Ürünler",
  product_specs: "Ürün Özellikleri",
  price_lists: "Fiyat Listeleri",
  warehouses: "Depolar",
  inventory: "Stok",
  customer_devices: "Müşteri Cihazları",
  quotes: "Teklifler",
  sales_orders: "Satış Siparişleri",
  proformas: "Proformalar",
  contracts: "Sözleşmeler",
  commercial_invoices: "Ticari Faturalar",
  accounting_invoices: "Muhasebe Faturaları",
  purchase_orders: "Satın Alma",
  shipments: "Sevkiyat",
  installations: "Kurulumlar",
  service_tickets: "Servis Talepleri",
  receivables: "Cari",
  payments: "Ödemeler",
  files: "Dosyalar",
  reports: "Raporlar",
  audit: "Denetim Kayıtları",
};

const roleCodeFromName = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

const sameCodes = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((code) => set.has(code));
};

const buildPermissionRows = (permissions: PermissionDto[]) => {
  const map = new Map<string, Partial<Record<PermissionAction, PermissionDto>>>();
  for (const permission of permissions) {
    if (!map.has(permission.resource)) map.set(permission.resource, {});
    map.get(permission.resource)![permission.action] = permission;
  }
  return Array.from(map.entries())
    .map(([resource, actions]) => ({ resource, actions }))
    .sort((a, b) => (RESOURCE_LABEL[a.resource] ?? a.resource).localeCompare(RESOURCE_LABEL[b.resource] ?? b.resource, "tr"));
};

function PermissionMatrix({
  permissions,
  selectedCodes,
  editable,
  onToggle,
  maxHeight = "max-h-[620px]",
}: {
  permissions: PermissionDto[];
  selectedCodes: Set<string>;
  editable: boolean;
  onToggle: (code: string) => void;
  maxHeight?: string;
}) {
  const rows = useMemo(() => buildPermissionRows(permissions), [permissions]);
  return (
    <div className={`overflow-auto rounded-md border border-border/60 bg-white ${maxHeight}`}>
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur">
          <tr className="border-b border-border/60">
            <th className="w-[230px] px-3 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground">Modül</th>
            {PERMISSION_ACTIONS.map((action) => (
              <th key={action} className="px-2 py-2.5 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
                {ACTION_LABEL[action]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.resource} className="border-b border-border/40 last:border-0 hover:bg-muted/25">
              <td className="px-3 py-2.5">
                <div className="font-medium leading-tight">{RESOURCE_LABEL[row.resource] ?? row.resource}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{row.resource}</div>
              </td>
              {PERMISSION_ACTIONS.map((action) => {
                const permission = row.actions[action];
                const checked = !!permission && selectedCodes.has(permission.code);
                return (
                  <td key={action} className="px-2 py-2.5 text-center">
                    {permission ? (
                      <Checkbox
                        checked={checked}
                        disabled={!editable}
                        onCheckedChange={() => onToggle(permission.code)}
                        aria-label={`${RESOURCE_LABEL[row.resource] ?? row.resource} ${ACTION_LABEL[action]}`}
                        className="mx-auto"
                      />
                    ) : (
                      <span className="mx-auto block h-px w-5 bg-border/70" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RolesPage() {
  const { hasRole } = useAuth();
  const canManageRoles = hasRole("super_admin");
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [permissions, setPermissions] = useState<PermissionDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftCodes, setDraftCodes] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", code: "", description: "", permissionCodes: [] as string[] });

  const load = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [roleRows, permissionRows] = await Promise.all([adminService.roles(), adminService.permissions()]);
      const normalizedRoles = (roleRows as RoleDto[]).sort((a, b) => {
        if (!!b.isSystemRole !== !!a.isSystemRole) return Number(!!b.isSystemRole) - Number(!!a.isSystemRole);
        return a.name.localeCompare(b.name, "tr");
      });
      setRoles(normalizedRoles);
      setPermissions(permissionRows as PermissionDto[]);
      const nextId = preferredId && normalizedRoles.some((role) => role.id === preferredId) ? preferredId : normalizedRoles[0]?.id ?? null;
      setSelectedId(nextId);
    } catch (err: any) {
      setError(err?.message ?? "Roller yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedRole = roles.find((role) => role.id === selectedId) ?? null;
  const selectedRolePermissionCodes = useMemo(() => selectedRole?.permissions.map((p) => p.code).sort() ?? [], [selectedRole]);

  useEffect(() => {
    if (!selectedRole) {
      setDraftName("");
      setDraftDescription("");
      setDraftCodes([]);
      return;
    }
    setDraftName(selectedRole.name);
    setDraftDescription(selectedRole.description ?? "");
    setDraftCodes(selectedRole.permissions.map((p) => p.code).sort());
  }, [selectedRole?.id, selectedRole?.name, selectedRole?.description, selectedRolePermissionCodes.join("|")]);

  const selectedCodes = useMemo(() => new Set(draftCodes), [draftCodes]);
  const roleResources = useMemo(() => {
    const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission]));
    return new Set(draftCodes.map((code) => permissionByCode.get(code)?.resource).filter(Boolean)).size;
  }, [draftCodes, permissions]);
  const dirty =
    !!selectedRole &&
    (draftName.trim() !== selectedRole.name ||
      draftDescription.trim() !== (selectedRole.description ?? "") ||
      !sameCodes(draftCodes, selectedRolePermissionCodes));

  const filteredRoles = roles.filter((role) => {
    const term = query.trim().toLocaleLowerCase("tr-TR");
    if (!term) return true;
    return role.name.toLocaleLowerCase("tr-TR").includes(term) || role.code.toLocaleLowerCase("tr-TR").includes(term);
  });

  const toggleDraftPermission = (code: string) => {
    if (!canManageRoles) return;
    setDraftCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code].sort()
    );
  };

  const toggleNewPermission = (code: string) => {
    setNewRole((current) => ({
      ...current,
      permissionCodes: current.permissionCodes.includes(code)
        ? current.permissionCodes.filter((item) => item !== code)
        : [...current.permissionCodes, code].sort(),
    }));
  };

  const resetDraft = () => {
    if (!selectedRole) return;
    setDraftName(selectedRole.name);
    setDraftDescription(selectedRole.description ?? "");
    setDraftCodes(selectedRolePermissionCodes);
  };

  const saveRole = async () => {
    if (!selectedRole || !canManageRoles) return;
    setSaving(true);
    try {
      await adminService.updateRole(selectedRole.id, {
        name: draftName.trim(),
        description: draftDescription.trim() || null,
        permissionCodes: draftCodes,
      });
      toast.success("Rol güncellendi");
      await load(selectedRole.id);
    } catch (err: any) {
      toast.error("Rol güncellenemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setSaving(false);
    }
  };

  const createRole = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageRoles) return;
    const code = roleCodeFromName(newRole.code || newRole.name);
    if (!newRole.name.trim() || !code) {
      toast.error("Rol adı ve kod gerekli");
      return;
    }
    setCreating(true);
    try {
      const created = await adminService.createRole({
        code,
        name: newRole.name.trim(),
        description: newRole.description.trim() || undefined,
        permissionCodes: newRole.permissionCodes,
      });
      toast.success("Rol oluşturuldu");
      setCreateOpen(false);
      setNewRole({ name: "", code: "", description: "", permissionCodes: [] });
      await load(created.id);
    } catch (err: any) {
      toast.error("Rol oluşturulamadı", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="border-border/60 p-4 shadow-sm">
          <Skeleton className="h-9 w-full" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}
          </div>
        </Card>
        <Card className="border-border/60 p-5 shadow-sm">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-3 h-16 w-full" />
          <Skeleton className="mt-5 h-[420px] w-full" />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-3xl">
        <AlertTriangle />
        <AlertTitle>Roller yüklenemedi</AlertTitle>
        <AlertDescription>
          <span>{error}</span>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => load(selectedId)}>
            <RotateCcw className="size-4" /> Tekrar dene
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!roles.length) {
    return (
      <Card className="border-border/60 p-8 text-center shadow-sm">
        <div className="mx-auto grid size-11 place-items-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div className="mt-3 text-base font-medium">Henüz rol yok</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Rol listesi boş. Süper Admin yeni rol oluşturarak başlayabilir.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="min-h-[660px] overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="border-b border-border/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Roller</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{roles.length} rol · {permissions.length} yetki</p>
            </div>
            {canManageRoles && (
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 gap-1.5">
                    <Plus className="size-4" /> Rol
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>Yeni rol oluştur</DialogTitle>
                    <DialogDescription>Rol bilgilerini ve başlangıç yetkilerini belirleyin.</DialogDescription>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={createRole}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Rol Adı</Label>
                        <Input
                          value={newRole.name}
                          onChange={(event) => {
                            const name = event.target.value;
                            setNewRole((current) => ({ ...current, name, code: roleCodeFromName(name) }));
                          }}
                          placeholder="Örn: Bölge Müdürü"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Rol Kodu</Label>
                        <Input
                          value={newRole.code}
                          onChange={(event) => setNewRole((current) => ({ ...current, code: roleCodeFromName(event.target.value) }))}
                          placeholder="bolge_muduru"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Açıklama</Label>
                      <Textarea
                        value={newRole.description}
                        onChange={(event) => setNewRole((current) => ({ ...current, description: event.target.value }))}
                        placeholder="Bu rolün hangi ekip veya süreç için kullanılacağını yazın."
                      />
                    </div>
                    <PermissionMatrix
                      permissions={permissions}
                      selectedCodes={new Set(newRole.permissionCodes)}
                      editable
                      onToggle={toggleNewPermission}
                      maxHeight="max-h-[360px]"
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>İptal</Button>
                      <Button type="submit" disabled={creating}>{creating ? "Oluşturuluyor..." : "Rol Oluştur"}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rol adı veya kodu ara..."
              className="h-9 bg-white pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-2">
          <div className="space-y-1">
            {filteredRoles.map((role) => {
              const active = role.id === selectedId;
              return (
                <button
                  key={role.id}
                  onClick={() => setSelectedId(role.id)}
                  className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-primary/10 text-primary" : "hover:bg-muted/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium leading-tight">{role.name}</div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{role.code}</div>
                    </div>
                    <Badge variant="secondary" className={role.isSystemRole ? "bg-zinc-100 text-zinc-700" : "bg-primary/10 text-primary"}>
                      {role.isSystemRole ? "Sistem" : "Özel"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <ShieldCheck className="size-3.5" />
                    <span>{role.permissions.length} yetki</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        {selectedRole ? (
          <>
            <CardHeader className="border-b border-border/60 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="bg-primary/10 text-primary">{selectedRole.code}</Badge>
                    {selectedRole.isSystemRole && <Badge variant="secondary">Sistem rolü</Badge>}
                    {!canManageRoles && (
                      <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-700">
                        <Lock className="size-3" /> Salt görüntüleme
                      </Badge>
                    )}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Rol Adı</Label>
                      <Input
                        value={draftName}
                        disabled={!canManageRoles}
                        onChange={(event) => setDraftName(event.target.value)}
                        className="h-10 bg-white text-base font-medium"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md border border-border/60 bg-muted/25 px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">Seçili Yetki</div>
                        <div className="mt-0.5 text-lg font-medium tabular-nums">{draftCodes.length}</div>
                      </div>
                      <div className="rounded-md border border-border/60 bg-muted/25 px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">Modül</div>
                        <div className="mt-0.5 text-lg font-medium tabular-nums">{roleResources}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Açıklama</Label>
                    <Textarea
                      value={draftDescription}
                      disabled={!canManageRoles}
                      onChange={(event) => setDraftDescription(event.target.value)}
                      className="min-h-[68px] bg-white"
                      placeholder="Rol açıklaması yok."
                    />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {dirty && (
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={resetDraft} disabled={saving}>
                      <X className="size-4" /> Vazgeç
                    </Button>
                  )}
                  <Button size="sm" className="h-9 gap-1.5" onClick={saveRole} disabled={!canManageRoles || !dirty || saving}>
                    <Save className="size-4" /> {saving ? "Kaydediliyor..." : "Kaydet"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {!canManageRoles && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                  <Lock />
                  <AlertTitle>Rolleri yalnızca Süper Admin düzenleyebilir</AlertTitle>
                  <AlertDescription>Bu sayfada rol ve yetki matrisi görüntülenebilir; değişiklik yapmak için süper admin hesabı gerekir.</AlertDescription>
                </Alert>
              )}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">Yetki Matrisi</div>
                    <div className="text-xs text-muted-foreground">Kaynak bazında aksiyon yetkileri</div>
                  </div>
                  {dirty && <Badge variant="secondary" className="bg-primary/10 text-primary">Kaydedilmemiş değişiklik</Badge>}
                </div>
                <PermissionMatrix permissions={permissions} selectedCodes={selectedCodes} editable={canManageRoles} onToggle={toggleDraftPermission} />
              </div>
            </CardContent>
          </>
        ) : (
          <CardContent className="grid min-h-[520px] place-items-center p-8 text-center">
            <div>
              <ShieldCheck className="mx-auto size-9 text-muted-foreground" />
              <div className="mt-3 text-sm font-medium">Rol seçilmedi</div>
              <p className="mt-1 text-sm text-muted-foreground">Detay ve yetki matrisi için soldan bir rol seçin.</p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

type DeptItem = { id: string; code?: string; name: string; description?: string };

export function DepartmentsPage() {
  const { hasRole, hasPermission } = useAuth();
  const canManage = hasRole("super_admin") || hasRole("admin") || hasPermission("departments.create");
  const canSetTargets = hasRole("super_admin") || hasRole("admin");
  const [rows, setRows] = useState<DeptItem[]>([]);
  const [deptTargets, setDeptTargets] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetPeriod, setTargetPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", description: "" });

  const loadTargets = useCallback(async (depts: DeptItem[]) => {
    if (!canSetTargets) return;
    const targets = await safeLoad("department-targets", () =>
      adminService.departmentTargets({ period: targetPeriod })
    );
    if (targets) {
      const map: Record<string, boolean> = {};
      (targets as any[]).forEach((t) => {
        map[t.departmentId] = !!(t.salesAmount || t.quoteTarget || t.visitTarget);
      });
      setDeptTargets(map);
    } else {
      setDeptTargets(Object.fromEntries(depts.map((d) => [d.id, false])));
    }
  }, [canSetTargets, targetPeriod]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const depts = await safeLoad("departments", () => adminService.departments() as Promise<DeptItem[]>);
    if (depts) {
      setRows(depts);
      await loadTargets(depts);
    } else {
      setLoadError("Departmanlar yüklenemedi.");
    }
    setLoading(false);
  }, [loadTargets]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) return toast.error("Ad ve kod zorunlu");
    setSaving(true);
    try {
      const created = await adminService.createDept({
        name: form.name.trim(),
        code: form.code.trim().toLowerCase().replace(/\s+/g, "_"),
        description: form.description.trim() || undefined,
      });
      toast.success("Departman eklendi");
      setOpen(false);
      setForm({ name: "", code: "", description: "" });
      setRows((prev) => {
        const next = [...prev.filter((d) => d.id !== created.id), created as DeptItem];
        return next.sort((a, b) => a.name.localeCompare(b.name, "tr"));
      });
      await load();
    } catch (err: any) {
      toast.error("Departman eklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Departmanlar</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {canSetTargets && (
            <Input type="month" className="h-9 w-[150px]" value={targetPeriod} onChange={(e) => setTargetPeriod(e.target.value)} />
          )}
          {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1"><Plus className="size-4" /> Departman</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Yeni Departman</DialogTitle>
                <DialogDescription>Bu tenant'a yeni bir departman ekleyin.</DialogDescription>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <Label className="text-xs">Ad *</Label>
                  <Input className="mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Satış" />
                </div>
                <div>
                  <Label className="text-xs">Kod *</Label>
                  <Input className="mt-1.5" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="sales" />
                </div>
                <div>
                  <Label className="text-xs">Açıklama</Label>
                  <Textarea className="mt-1.5" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
                  <Button type="submit" disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </CardHeader>
      {loadError && (
        <div className="mx-4 mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {loadError}
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Departman</TableHead>
              <TableHead>Kod</TableHead>
              <TableHead>Açıklama</TableHead>
              {canSetTargets && <TableHead className="w-28">Hedef</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.name}</TableCell>
                <TableCell className="text-muted-foreground">{d.code ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{d.description ?? "—"}</TableCell>
                {canSetTargets && (
                  <TableCell>
                    <DepartmentTargetButton department={d} period={targetPeriod} hasTarget={!!deptTargets[d.id]} onSaved={load} />
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={canSetTargets ? 4 : 3} className="text-center py-8 text-sm text-muted-foreground">Henüz departman yok.</TableCell></TableRow>
            )}
            {loading && (
              <TableRow><TableCell colSpan={canSetTargets ? 4 : 3} className="text-center py-8 text-sm text-muted-foreground">Yükleniyor...</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
