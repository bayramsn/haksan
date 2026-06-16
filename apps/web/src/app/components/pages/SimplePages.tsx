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
import { CreateStockDialog, CreateServiceRequestDialog, CreateInstallationDialog, CreateMachineDialog, CreatePaymentDialog, CreateShipmentDialog, CreateDeliveryDialog, DeliveryFormFields, deliveryFormToPayload, deliveryToFormState, type DeliveryFormState } from "../dialogs/CreateDialogs";
import { QuoteDialog } from "../dialogs/QuoteDialog";
import { DocumentUploadDialog } from "../dialogs/DocumentUploadDialog";
import { DocumentPreviewDialog } from "../dialogs/DocumentPreviewDialog";
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
  Lock, Save, X, Settings, Play, Pause, Square, MessageSquare,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

const initials = (n: string) => n.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
import { KanbanBoard, KanbanColumn } from "../KanbanBoard";
import { useStore } from "../../lib/store";
import { useFx, FxRateBadge } from "../../lib/fx";
import { Customer, Delivery, DocumentItem, Offer, Payment, SalesCase, ServiceRequest, ServiceStage, User } from "../../lib/mock";
import { INSTALLATION_LOCATION_LABELS, formatDuration, type InstallationLocationType } from "@haksan/shared";
import { useAuth } from "../../../lib/auth";
import { toast } from "sonner";
import { adminService, companyService, productService, purchaseOrderService, salesOrderService, serviceService, reportService, fileService, quoteService, type YearEndReport } from "../../../lib/services";
import { exportToCsv } from "../../../lib/exportCsv";
import { FilterPopover, usePaged, Pager } from "../ui/list-controls";
import {
  buildManagementInsights,
  type ManagementInsight,
  type OperationAction,
  type OperationFocus,
} from "../../lib/operations";
import {
  openPrintWindow, printAssetBase, trLongDate, trShortDate, type PrintDocument,
  proformaDoc, contractDoc, installationFormDoc, serviceFormDoc, quoteDoc, serviceQuoteDoc,
  dispatchNoteDoc,
  QUOTE_NOTE_VARIANTS, SERVICE_NOTE_VARIANTS, PROFORMA_NOTE_VARIANTS, fillNotePlaceholders,
} from "../../lib/print";

const printOrWarn = (doc: PrintDocument) => {
  if (!openPrintWindow(doc)) {
    toast.error("Yazdırma penceresi açılamadı", { description: "Lütfen pop-up engelleyiciyi kapatın." });
  }
};

/** Adres parçalarını birleştirip harita uygulamasında açar (mobilde Maps app'e gider). */
const openInMaps = (parts: Array<string | undefined | null>) => {
  const q = parts.filter(Boolean).join(" ").trim();
  if (!q) {
    toast.message("Konum bulunamadı", { description: "Bu firma için adres bilgisi girilmemiş." });
    return;
  }
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, "_blank", "noopener");
};

const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("tr-TR").format(new Date(value)) : "—";
const formatCurrency = (value: number, currency = "USD") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

/**
 * Bir teklif/tutar için KDV kırılımını döndürür (yazdırma belgeleri için).
 * - Gerçek kırılım (subtotal/vatTotal) varsa onu kullanır (indirim ve KDV'siz teklifleri doğru yansıtır).
 * - Yoksa `gross` brüt (KDV dahil) kabul edilir ve `defaultRate` ile içeriden ayrıştırılır.
 * Her durumda: net + kdv = gross (genel toplam değişmez).
 */
const splitVat = (
  gross: number,
  opts?: { subtotal?: number; vatTotal?: number; defaultRate?: number }
): { net: number; kdv: number; oran: number } => {
  const defaultRate = opts?.defaultRate ?? 20;
  if (opts?.subtotal && opts.subtotal > 0) {
    const kdv = opts.vatTotal && opts.vatTotal > 0 ? opts.vatTotal : 0;
    const oran = Math.round((kdv / opts.subtotal) * 100);
    return { net: opts.subtotal, kdv, oran };
  }
  const net = gross / (1 + defaultRate / 100);
  return { net, kdv: gross - net, oran: defaultRate };
};

const OFFER_TREND = [
  { ay: "Ara", gonderilen: 12, onaylanan: 5 },
  { ay: "Oca", gonderilen: 16, onaylanan: 7 },
  { ay: "Şub", gonderilen: 22, onaylanan: 10 },
  { ay: "Mar", gonderilen: 19, onaylanan: 9 },
  { ay: "Nis", gonderilen: 26, onaylanan: 13 },
  { ay: "May", gonderilen: 18, onaylanan: 8 },
];

export function OffersPage({ focus }: { focus?: OperationFocus }) {
  const { offers: rawOffers, cases, customers, users, moveCase } = useStore();
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

  const filtered = offers.filter((o) => {
    if (focusExpired && !offerExpired(o)) return false;
    if (tab !== "all" && o.status !== tab) return false;
    if (q) {
      const sc = cases.find((s) => s.id === o.salesCaseId);
      const cName = sc ? customerName(sc.customerId) : "";
      return o.quoteNo.toLowerCase().includes(q.toLowerCase()) || cName.toLowerCase().includes(q.toLowerCase());
    }
    return true;
  });
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

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="violet" icon={<FileText className="size-[18px]" />} label="Toplam Teklif" value={total} sub="bu çeyrek" delta={11} />
        <MiniKpi tone="emerald" icon={<CheckCircle2 className="size-[18px]" />} label="Onaylanan" value={approved} sub={`$ ${(approvedAmount / 1000).toFixed(0)}K`} delta={8} />
        <MiniKpi tone="blue" icon={<Mail className="size-[18px]" />} label="Gönderilen" value={sent} sub="cevap bekleniyor" delta={4} />
        <MiniKpi tone="amber" icon={<TrendingUp className="size-[18px]" />} label="Kazanma Oranı" value={`%${winRate}`} sub={`hedef %50`} delta={3} progress={winRate} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Teklif Trendi</CardTitle>
            <p className="text-xs text-muted-foreground">Gönderilen vs onaylanan · son 6 ay</p>
          </CardHeader>
          <CardContent className="h-64 pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={OFFER_TREND} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
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
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() =>
                exportToCsv(
                  "teklifler",
                  ["Teklif No", "Müşteri", "Tutar", "Para Birimi", "Durum", "Tarih"],
                  filtered.map((o) => {
                    const sc = cases.find((s) => s.id === o.salesCaseId);
                    return [o.quoteNo, sc ? customerName(sc.customerId) : "", o.amount, o.currency, o.status, o.date];
                  })
                )
              }
            >
              <Download className="size-4" /> Excel
            </Button>
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
                  <TableRow key={o.id} className="group cursor-pointer" onClick={() => setSelectedOfferId(o.id)}>
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                          <FileText className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm leading-tight truncate">{o.quoteNo}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">#{sc ? sc.id.slice(0,8).toUpperCase() : "—"}</div>
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
                          className="size-8 opacity-0 group-hover:opacity-100"
                          title="Teklif detayı"
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
                </TableRow>
              ))}
              {!salesOrdersLoading && salesOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">
                    Henüz satış siparişi yok.
                  </TableCell>
                </TableRow>
              )}
              {salesOrdersLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">
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

function OfferDetailDialog({
  offer,
  salesCase,
  customer,
  assignee,
  revisions,
  order,
  onClose,
}: {
  offer: Offer | null;
  salesCase: SalesCase | null;
  customer: Customer | null;
  assignee: User | null;
  revisions: Offer[];
  order?: any;
  onClose: () => void;
}) {
  const { products } = useStore();
  const [noteVariant, setNoteVariant] = useState(QUOTE_NOTE_VARIANTS[2].key);
  // Bu teklife özel seçilen opsiyonel donanımlar (QuoteDialog'da "↳ Opsiyon:"
  // önekiyle kaydedilen kalemler). Yazdırmada standart donanım gibi listelenir.
  const [offerOptionEquip, setOfferOptionEquip] = useState<string[]>([]);
  useEffect(() => {
    if (!offer?.id) {
      setOfferOptionEquip([]);
      return;
    }
    let alive = true;
    quoteService
      .get(offer.id)
      .then((full: any) => {
        if (!alive) return;
        const opts = (full?.items ?? [])
          .map((it: any) => String(it?.description ?? ""))
          .filter((d: string) => d.trimStart().startsWith("↳ Opsiyon:"))
          .map((d: string) => d.replace(/^\s*↳\s*Opsiyon:\s*/, "").split(" — ")[0].trim())
          .filter(Boolean);
        setOfferOptionEquip([...new Set<string>(opts)]);
      })
      .catch(() => alive && setOfferOptionEquip([]));
    return () => {
      alive = false;
    };
  }, [offer?.id]);
  if (!offer) return null;

  const productText = salesCase
    ? [salesCase.requestedProduct, salesCase.requestedModel].filter(Boolean).join(" · ")
    : "Satış kartı bağlantısı yok";

  // Teklif yazdırma: ürün kataloğundan model eşleşirse teknik bilgiler ve
  // donanım sayfaları da basılır; alt notlar seçilen teslim şekline göre gelir.
  const handlePrint = () => {
    const model = salesCase?.requestedModel ?? "";
    const product = products.find(
      (p) => p.model && model && (model.includes(p.model) || p.model.includes(model) || (p.modelName && model.includes(p.modelName)))
    );
    const variant = QUOTE_NOTE_VARIANTS.find((v) => v.key === noteVariant) ?? QUOTE_NOTE_VARIANTS[2];
    // Brüt teklif tutarını net + KDV olarak ayrıştır (genel toplam = offer.amount kalır).
    const vat = splitVat(offer.amount, { subtotal: offer.subtotal, vatTotal: offer.vatTotal });
    printOrWarn(
      quoteDoc(
        {
          firma: customer?.name ?? "",
          ilgili: customer?.contactPerson,
          mobil: customer?.phone2 ?? "",
          adres: [customer?.address, customer?.district, customer?.city].filter(Boolean).join(" "),
          tel: customer?.phone,
          faks: customer?.fax,
          email: customer?.email,
          tarih: trShortDate(offer.date),
          belgeNo: offer.quoteNo,
          gecerlilik: offer.validityDays ? `${offer.validityDays} Gün` : "",
          projeIlgilisi: assignee?.name,
          projeIlgilisiUnvan: assignee?.department,
          projeIlgilisiEmail: assignee?.email,
          marka: product?.brand,
          model: product?.model ?? salesCase?.requestedModel,
          tip: product?.type ?? salesCase?.requestedProduct,
          imageUrl: product?.imageUrl || undefined,
          specs: product?.specs,
          // Bu teklife özel seçilen opsiyonel donanım, müşteriye standart
          // donanımmış gibi sunulur: standart listenin sonuna eklenir.
          standartDonanim: [...(product?.standardEquipment ?? []), ...offerOptionEquip],
          opsiyonelDonanim: product?.optionalEquipment,
          items: [
            {
              urun: productText,
              birim: `${salesCase?.quantity ?? 1} Adet`,
              tutar: vat.net,
            },
          ],
          kdvOran: vat.oran,
          kdvTutar: vat.kdv,
          currency: offer.currency,
          notes: variant,
        },
        printAssetBase()
      )
    );
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
            <Select value={noteVariant} onValueChange={setNoteVariant}>
              <SelectTrigger className="h-9 w-full bg-white sm:w-56">
                <SelectValue placeholder="Alt not seti" />
              </SelectTrigger>
              <SelectContent>
                {QUOTE_NOTE_VARIANTS.map((v) => (
                  <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-1 sm:w-auto" onClick={handlePrint}>
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

const DOC_ICONS: Record<string, React.ReactNode> = {
  Proforma: <FileText className="size-4" />,
  Contract: <FileSignature className="size-4" />,
  CommercialInvoice: <Receipt className="size-4" />,
  AccountingInvoice: <Receipt className="size-4" />,
  DeliveryForm: <ClipboardCheck className="size-4" />,
  InstallationForm: <Wrench className="size-4" />,
  Other: <FileText className="size-4" />,
};

const DOC_TYPE_LABELS: Record<DocumentItem["type"], string> = {
  Proforma: "Proforma",
  Contract: "Sözleşme",
  CommercialInvoice: "Ticari fatura",
  AccountingInvoice: "Muhasebe faturası",
  DeliveryForm: "Teslim formu",
  InstallationForm: "Kurulum formu",
  Other: "Diğer",
};

export function DocumentsPage({
  initialType,
  initialQuery,
  title = "Dokümanlar",
  description = "Proforma, sözleşme, fatura ve servis/teslim formları",
}: {
  initialType?: DocumentItem["type"];
  initialQuery?: string;
  title?: string;
  description?: string;
}) {
  const { documents, cases, customers, users, offers, payments, products } = useStore();
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "—";

  // Yazdırma için belge satırını CRM verisiyle eşler: müşteri, satış kartı,
  // en güncel teklif ve ürün kataloğu kaydı.
  const resolveDocContext = (d: (typeof documents)[number]) => {
    const sc = cases.find((s) => s.id === d.salesCaseId) ?? null;
    const cust = customers.find((c) => c.id === (d.companyId || sc?.customerId)) ?? null;
    const offer = offers
      .filter((o) => (sc && o.salesCaseId === sc.id) || (d.companyId && o.companyId === d.companyId))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const model = sc?.requestedModel ?? "";
    const product = products.find(
      (p) => p.model && model && (model.includes(p.model) || p.model.includes(model))
    );
    return {
      sc,
      cust,
      offer,
      product,
      amount: offer?.amount ?? sc?.estimatedAmount ?? 0,
      currency: (offer?.currency ?? sc?.currency ?? "USD") as "USD" | "EUR" | "TRY",
      adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : "",
      urunAdi: product?.shortDescription || [sc?.requestedProduct, sc?.requestedModel].filter(Boolean).join(" ") || d.fileName,
    };
  };

  const printProforma = (d: (typeof documents)[number], variantKey: string) => {
    const variant = PROFORMA_NOTE_VARIANTS.find((v) => v.key === variantKey) ?? PROFORMA_NOTE_VARIANTS[0];
    const ctx = resolveDocContext(d);
    const vat = splitVat(ctx.amount, { subtotal: ctx.offer?.subtotal, vatTotal: ctx.offer?.vatTotal });
    printOrWarn(
      proformaDoc(
        {
          firma: ctx.cust?.name ?? "",
          ilgili: ctx.cust?.contactPerson,
          mobil: ctx.cust?.phone2,
          adres: ctx.adres,
          tel: ctx.cust?.phone,
          faks: ctx.cust?.fax,
          vergiDairesi: ctx.cust?.taxOffice,
          vergiNo: ctx.cust?.taxNumber,
          tarih: trLongDate(d.uploadedAt) || trLongDate(new Date()),
          belgeNo: d.fileName,
          items: [
            {
              aciklama: ctx.urunAdi,
              marka: ctx.product?.brand,
              mensei: ctx.product?.originCountry,
              gtip: ctx.product?.hsCode,
              birim: `${ctx.sc?.quantity ?? 1} Adet`,
              tutar: vat.net,
            },
          ],
          kdvOran: vat.oran,
          kdvTutar: vat.kdv,
          currency: ctx.currency,
          notlar: fillNotePlaceholders(variant.notlar, { alici: ctx.cust?.name }),
        },
        printAssetBase()
      )
    );
  };

  const printContract = (d: (typeof documents)[number]) => {
    const ctx = resolveDocContext(d);
    // Sözleşme KDV hariç fiyatlandırılır (madde 3.3) → net tutar kullan.
    const vat = splitVat(ctx.amount, { subtotal: ctx.offer?.subtotal, vatTotal: ctx.offer?.vatTotal });
    // Ödeme planı: teklife bağlı beklenen tahsilatlar; yoksa tek satır peşin.
    const expected = payments
      .filter((p) => p.paymentType === "expected" && ctx.offer && p.salesCaseId === ctx.offer.id)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const odemePlani = expected.length
      ? expected.map((p, i) => ({
          label: i === 0 ? "Peşin" : `Vade ${trShortDate(p.dueDate)}`,
          tutar: p.amount,
          senet: i > 0,
        }))
      : [{ label: "Peşin", tutar: vat.net }];
    printOrWarn(
      contractDoc(
        {
          alici: {
            unvan: ctx.cust?.name ?? "",
            yetkili: ctx.cust?.contactPerson,
            adres: ctx.adres,
            vergiDairesi: ctx.cust?.taxOffice,
            vergiNo: ctx.cust?.taxNumber,
            tel: ctx.cust?.phone,
            faks: ctx.cust?.fax,
          },
          sozlesmeTarihi: d.uploadedAt || new Date().toISOString().slice(0, 10),
          model: ctx.urunAdi,
          adet: ctx.sc?.quantity ?? 1,
          ozellikler: ctx.product?.specs?.slice(0, 14) ?? [],
          aksesuarlar: ctx.product?.standardEquipment ?? [],
          fiyat: vat.net,
          currency: ctx.currency,
          teslimSekli: "Millileştirilmiş",
          kdvOran: vat.oran,
          odemePlani,
        },
        printAssetBase()
      )
    );
  };
  const [q, setQ] = useState("");
  const [docType, setDocType] = useState("all");
  const [previewDoc, setPreviewDoc] = useState<(typeof documents)[number] | null>(null);
  const types = ["Proforma", "Contract", "CommercialInvoice", "AccountingInvoice", "DeliveryForm", "InstallationForm", "Other"];
  const visibleTypes = initialType ? [initialType] : types;
  const counts = visibleTypes.map((t) => ({ type: t, count: documents.filter((d) => d.type === t).length }));

  useEffect(() => {
    setDocType(initialType ?? "all");
  }, [initialType]);

  useEffect(() => {
    if (initialQuery) setQ(initialQuery);
  }, [initialQuery]);

  const filtered = documents.filter((d) => {
    const sc = cases.find((s) => s.id === d.salesCaseId);
    const companyId = d.companyId || sc?.customerId || "";
    if (docType !== "all" && d.type !== docType) return false;
    return (
      d.fileName.toLowerCase().includes(q.toLowerCase()) ||
      customerName(companyId).toLowerCase().includes(q.toLowerCase())
    );
  });

  const exportExcel = () =>
    exportToCsv(
      "dokumanlar",
      ["Dosya", "Tip", "Müşteri", "Boyut", "Yükleyen", "Tarih"],
      filtered.map((d) => {
        const sc = cases.find((s) => s.id === d.salesCaseId);
        return [d.fileName, d.type, customerName(sc?.customerId || d.companyId || ""), d.size, userName(d.uploadedBy), d.uploadedAt];
      })
    );

  const downloadDocument = async (d: (typeof documents)[number]) => {
    const sc = cases.find((s) => s.id === d.salesCaseId);
    const fallbackCustomer = customerName(sc?.customerId || d.companyId || "");
    if (!d.fileId) {
      exportToCsv(d.fileName || "dokuman", ["Dosya", "Tip", "Müşteri", "Boyut", "Tarih"], [[d.fileName, d.type, fallbackCustomer, d.size, d.uploadedAt]]);
      return;
    }
    try {
      const signed = await fileService.signedDownload(d.fileId);
      const a = document.createElement("a");
      a.href = signed.downloadUrl;
      a.download = signed.filename || d.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      toast.error("Doküman indirilemedi", { description: err?.message ?? "İstek başarısız oldu." });
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {counts.map((c) => (
          <Card key={c.type} className="border-border/60 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-3 flex items-center gap-2.5">
              <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                {DOC_ICONS[c.type]}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{DOC_TYPE_LABELS[c.type as DocumentItem["type"]] ?? c.type}</div>
                <div className="text-[18px] tabular-nums leading-none mt-1">{c.count}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="tracking-tight">{title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-auto lg:justify-end">
            <div className="relative w-full sm:w-64">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Dosya / müşteri ara..." className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {!initialType && (
              <FilterPopover
                filters={[{ label: "Tip", value: docType, onChange: setDocType, options: types.map((t) => ({ value: t, label: DOC_TYPE_LABELS[t as DocumentItem["type"]] ?? t })) }]}
              />
            )}
            <Button variant="outline" size="sm" className="h-9 justify-center" onClick={exportExcel}><Download className="size-4" /> Excel</Button>
            <DocumentUploadDialog
              defaultType={initialType}
              trigger={<Button size="sm" className="h-9 justify-center gap-1"><Upload className="size-4" /> {initialType ? `${DOC_TYPE_LABELS[initialType]} Yükle` : "Yükle"}</Button>}
            />
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Dosya</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Boyut</TableHead>
                <TableHead>Yükleyen</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="w-20 text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => {
                const sc = cases.find((s) => s.id === d.salesCaseId);
                const companyId = sc?.customerId || d.companyId || "";
                return (
                  <TableRow key={d.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                          {DOC_ICONS[d.type]}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm leading-tight truncate">{d.fileName}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{sc ? `#${sc.id.toUpperCase()}` : d.companyId ? "Firma dokümanı" : "—"}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={d.type} /></TableCell>
                    <TableCell className="text-sm">{customerName(companyId)}</TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{d.size}</TableCell>
                    <TableCell className="text-sm">{userName(d.uploadedBy)}</TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{d.uploadedAt}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {d.type === "Proforma" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-7" title="Proforma yazdır / PDF">
                                <Printer className="size-4 text-muted-foreground hover:text-primary" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {PROFORMA_NOTE_VARIANTS.map((v) => (
                                <DropdownMenuItem key={v.key} onClick={() => printProforma(d, v.key)}>
                                  {v.label} notları ile yazdır
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        {d.type === "Contract" && (
                          <Button variant="ghost" size="icon" className="size-7" title="Satış sözleşmesi yazdır / PDF"
                            onClick={() => printContract(d)}>
                            <Printer className="size-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="size-7" title="Önizle"
                          onClick={() => setPreviewDoc(d)}>
                          <Eye className="size-4 text-muted-foreground hover:text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" title="İndir"
                          onClick={() => downloadDocument(d)}>
                          <Download className="size-4 text-muted-foreground hover:text-primary" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                    Doküman bulunamadı.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <DocumentPreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}

const PAY_MONTHLY = [
  { ay: "Ara", tahsilat: 145, beklenen: 90, gecikmis: 22 },
  { ay: "Oca", tahsilat: 168, beklenen: 110, gecikmis: 28 },
  { ay: "Şub", tahsilat: 210, beklenen: 130, gecikmis: 18 },
  { ay: "Mar", tahsilat: 195, beklenen: 145, gecikmis: 35 },
  { ay: "Nis", tahsilat: 248, beklenen: 160, gecikmis: 24 },
  { ay: "May", tahsilat: 220, beklenen: 175, gecikmis: 41 },
];

const CASHFLOW = [
  { gun: "1", giris: 12, cikis: 8 },
  { gun: "5", giris: 24, cikis: 14 },
  { gun: "10", giris: 18, cikis: 22 },
  { gun: "15", giris: 35, cikis: 18 },
  { gun: "20", giris: 28, cikis: 26 },
  { gun: "25", giris: 42, cikis: 20 },
  { gun: "30", giris: 38, cikis: 30 },
];

const CURRENCY_PIE = [
  { name: "USD", value: 86, fill: "#000c69" },
  { name: "TRY", value: 14, fill: "#06b6d4" },
];

export function PaymentsPage({ focus }: { focus?: OperationFocus }) {
  const { payments, customers, refresh } = useStore();
  const { convert } = useFx();
  // Farklı para birimleri toplanamaz → USD bazına çevirip topla (genel/baz birim USD).
  const toUsd = (p: Payment) => convert(p.amount, p.currency, "USD");
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Paid" | "Pending" | "Overdue">("all");
  // Kasa yönü: tümü / alınan (giren) / ödenen (çıkan)
  const [dirFilter, setDirFilter] = useState<"all" | "in" | "out">("all");
  // Tıklanan kasa hareketi → detay + fiş/fatura pop-up'ı
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  useEffect(() => {
    if (focus === "overdue") setStatusFilter("Overdue");
    if (focus === "pending" || focus === "upcoming") setStatusFilter("Pending");
    if (focus === "paid") setStatusFilter("Paid");
  }, [focus]);

  // Tahsilat metrikleri yalnızca GİREN (alınan) hareketler üzerinden hesaplanır (USD karşılığı).
  const inflow = payments.filter((p) => p.direction === "in");
  const outflow = payments.filter((p) => p.direction === "out");
  const totalPaid = inflow.filter((p) => p.status === "Paid").reduce((s, p) => s + toUsd(p), 0);
  const totalPending = inflow.filter((p) => p.status === "Pending").reduce((s, p) => s + toUsd(p), 0);
  const totalOverdue = inflow.filter((p) => p.status === "Overdue").reduce((s, p) => s + toUsd(p), 0);
  const total = totalPaid + totalPending + totalOverdue;
  const collectionRate = total > 0 ? Math.round((totalPaid / total) * 100) : 0;

  // Kasa bakiyesi: gerçekleşen (Paid) giriş/çıkış, para birimi bazında ayrı.
  // Farklı para birimleri toplanamaz; her biri kendi satırında gösterilir.
  const KASA_CURRENCIES: Array<Payment["currency"]> = ["USD", "EUR", "TRY"];
  const kasa = KASA_CURRENCIES.map((cur) => {
    const gir = payments.filter((p) => p.direction === "in" && p.status === "Paid" && p.currency === cur).reduce((s, p) => s + p.amount, 0);
    const cik = payments.filter((p) => p.direction === "out" && p.status === "Paid" && p.currency === cur).reduce((s, p) => s + p.amount, 0);
    return { cur, gir, cik, net: gir - cik };
  }).filter((k) => k.gir || k.cik);
  const curSymbol = (c: Payment["currency"]) => (c === "USD" ? "$" : c === "EUR" ? "€" : "₺");
  const outPaidCount = outflow.filter((p) => p.status === "Paid").length;
  const outPendingTotalByCur = KASA_CURRENCIES.map((cur) => ({
    cur,
    amt: outflow.filter((p) => p.status !== "Paid" && p.currency === cur).reduce((s, p) => s + p.amount, 0),
  })).filter((x) => x.amt > 0);

  // Aging buckets (days past dueDate, Overdue + Pending past due)
  const today = new Date("2026-05-13");
  const buckets = [
    { key: "0-30", label: "0–30 gün", color: "#fbbf24", value: 0 },
    { key: "31-60", label: "31–60 gün", color: "#f59e0b", value: 0 },
    { key: "61-90", label: "61–90 gün", color: "#f97316", value: 0 },
    { key: "90+", label: "90+ gün", color: "#ef4444", value: 0 },
  ];
  payments.forEach((p) => {
    if (p.status !== "Overdue") return;
    const d = (today.getTime() - new Date(p.dueDate).getTime()) / (1000 * 60 * 60 * 24);
    if (d <= 30) buckets[0].value += toUsd(p);
    else if (d <= 60) buckets[1].value += toUsd(p);
    else if (d <= 90) buckets[2].value += toUsd(p);
    else buckets[3].value += toUsd(p);
  });

  // Top debtors
  const debtorMap = new Map<string, number>();
  payments.filter((p) => p.status === "Overdue" || p.status === "Pending").forEach((p) => {
    debtorMap.set(p.customerId, (debtorMap.get(p.customerId) ?? 0) + toUsd(p));
  });
  const topDebtors = [...debtorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cid, amt]) => ({ cid, name: customerName(cid), amount: amt }));

  const filtered = payments.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (dirFilter !== "all" && p.direction !== dirFilter) return false;
    if (q && !customerName(p.customerId).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const { page, setPage, totalPages, pageItems } = usePaged(filtered, 12);
  const exportExcel = () =>
    exportToCsv(
      "kasa-hareketleri",
      ["Firma", "Yön", "Tutar", "Para Birimi", "Vade", "Ödeme Tarihi", "Durum", "Not"],
      filtered.map((p) => [
        customerName(p.customerId),
        p.direction === "in" ? "Alınan (Giren)" : "Ödenen (Çıkan)",
        p.amount,
        p.currency,
        p.dueDate,
        p.paidDate ?? "",
        p.status,
        p.note,
      ])
    );

  return (
    <div className="space-y-5">
      {/* KPI strip — kasa odaklı */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PayKpi
          tone="emerald"
          icon={<ArrowDownRight className="size-[18px]" />}
          label="Alınan (Giren)"
          value={`$ ${(totalPaid / 1000).toFixed(1)}K`}
          delta={12}
          sub={`${inflow.filter((p) => p.status === "Paid").length} tahsilat`}
        />
        <PayKpi
          tone="red"
          icon={<ArrowUpRight className="size-[18px]" />}
          label="Ödenen (Çıkan)"
          value={kasa.length ? kasa.map((k) => `${curSymbol(k.cur)}${(k.cik / 1000).toFixed(1)}K`).join(" · ") : "—"}
          delta={-4}
          sub={`${outPaidCount} ödeme`}
        />
        <PayKpi
          tone="violet"
          icon={<Wallet className="size-[18px]" />}
          label="Net Kasa"
          value={kasa.length ? kasa.map((k) => `${curSymbol(k.cur)}${(k.net / 1000).toFixed(1)}K`).join(" · ") : "—"}
          delta={3}
          sub="gerçekleşen"
        />
        <PayKpi
          tone="amber"
          icon={<Clock className="size-[18px]" />}
          label="Bekleyen Tahsilat"
          value={`$ ${(totalPending / 1000).toFixed(1)}K`}
          delta={4}
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
              <AreaChart data={PAY_MONTHLY} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
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
                <Pie data={CURRENCY_PIE} dataKey="value" nameKey="name" outerRadius={80} innerRadius={50} paddingAngle={3} isAnimationActive={false}>
                  {CURRENCY_PIE.map((d) => (
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
              <LineChart data={CASHFLOW} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
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
            <Button size="sm" variant="ghost" className="h-7 text-primary">Tümü</Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border/60">
              {topDebtors.map((d, i) => (
                <div key={d.cid} className="flex items-center gap-3 py-2.5 group hover:bg-muted/40 -mx-3 px-3 rounded-md transition-colors">
                  <div className="size-7 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center text-[10px] shrink-0">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] leading-tight truncate">{d.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">açık bakiye</div>
                  </div>
                  <div className="text-[13px] tabular-nums shrink-0">$ {d.amount.toLocaleString()}</div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="size-7"><Mail className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="size-7"><Phone className="size-3.5" /></Button>
                  </div>
                </div>
              ))}
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
                    {payments.filter((p) => p.status === "Paid").length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="Pending" className="text-xs gap-1.5">
                  Bekleyen
                  <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] rounded-full bg-amber-100 text-amber-700">
                    {payments.filter((p) => p.status === "Pending").length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="Overdue" className="text-xs gap-1.5">
                  Gecikmiş
                  <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] rounded-full bg-red-100 text-red-700">
                    {payments.filter((p) => p.status === "Overdue").length}
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
            <Button variant="outline" size="sm" className="h-9 justify-center" onClick={exportExcel}><Download className="size-4" /> Excel</Button>
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
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Vade</TableHead>
                <TableHead>Ödeme Tarihi</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Not</TableHead>
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
                    title="Detay ve fiş/fatura için tıklayın"
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
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
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

const PAYMENT_EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
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

  useEffect(() => {
    if (payment) {
      setFile(null);
      setDocType("CommercialInvoice");
      setStatus(payment.status);
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
    const ext = file.name.split(".").pop()?.toLocaleLowerCase("tr-TR") ?? "";
    const mime = file.type || PAYMENT_EXT_TO_MIME[ext];
    if (!PAYMENT_EXT_TO_MIME[ext] || !mime) {
      return toast.error("Desteklenmeyen dosya tipi", { description: "PDF, PNG, JPG, WEBP, DOCX veya XLSX" });
    }
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
      const res = await fetch(up.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": mime } });
      if (!res.ok) throw new Error(`Depoya yükleme başarısız (${res.status})`);
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
              <Button variant="outline" onClick={onClose}>Kapat</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const PAY_TONES: Record<string, { bg: string; ic: string; ring: string }> = {
  emerald: { bg: "bg-emerald-50", ic: "text-emerald-600", ring: "ring-emerald-100" },
  amber: { bg: "bg-amber-50", ic: "text-amber-600", ring: "ring-amber-100" },
  red: { bg: "bg-red-50", ic: "text-red-600", ring: "ring-red-100" },
  violet: { bg: "bg-brand-blue-soft", ic: "text-brand-blue", ring: "ring-blue-100" },
  blue: { bg: "bg-blue-50", ic: "text-blue-600", ring: "ring-blue-100" },
};

function MiniKpi({
  icon, label, value, sub, delta, tone = "violet", progress,
}: {
  icon: React.ReactNode; label: string; value: number | string; sub?: string;
  delta?: number; tone?: keyof typeof PAY_TONES; progress?: number;
}) {
  const t = PAY_TONES[tone];
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="border-border/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className={`size-9 rounded-lg ${t.bg} ${t.ic} grid place-items-center shrink-0 ring-4 ${t.ring}`}>
            {icon}
          </div>
          {delta !== undefined && (
            <span className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full ${
              positive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
            }`}>
              {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              %{Math.abs(delta)}
            </span>
          )}
        </div>
        <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <div className="text-[22px] tabular-nums tracking-tight leading-none truncate">{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
        </div>
        {progress !== undefined && (
          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${t.ic.replace("text-", "bg-")}`} style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PayKpi({
  icon, label, value, delta, sub, tone = "emerald", alarm, progress,
}: {
  icon: React.ReactNode; label: string; value: string; delta: number; sub: string;
  tone?: keyof typeof PAY_TONES; alarm?: boolean; progress?: number;
}) {
  const t = PAY_TONES[tone];
  const positive = delta >= 0;
  return (
    <Card className="border-border/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className={`size-9 rounded-lg ${t.bg} ${t.ic} grid place-items-center shrink-0 ring-4 ${t.ring}`}>
            {icon}
          </div>
          <span className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full ${
            alarm ? "bg-red-50 text-red-700" : positive ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
          }`}>
            {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            %{Math.abs(delta)}
          </span>
        </div>
        <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <div className="text-[22px] tabular-nums tracking-tight leading-none truncate">{value}</div>
          <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
        </div>
        {progress !== undefined && (
          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${t.ic.replace("text-", "bg-")}`} style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function exportStockCsv(rows: ReturnType<typeof useStore>["stock"]) {
  const headers = ["Stok Kodu", "Marka", "Tip", "Model", "Seri No", "Kontrol Paneli", "Depo", "Durum"];
  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([r.stockCode, r.brand, r.counterType, r.model, r.serialNumber, r.controlPanel, r.warehouse, r.status].map(escape).join(","));
  }
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stok-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function StockPage({ focus, initialQuery }: { focus?: OperationFocus; initialQuery?: string }) {
  const { stock, updateStockStatus } = useStore();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "Available" | "Reserved" | "Sold" | "Inactive">("all");

  useEffect(() => {
    if (focus === "reserved") setTab("Reserved");
    if (focus === "available") setTab("Available");
    if (focus === "low") setTab("all");
  }, [focus]);

  useEffect(() => {
    if (initialQuery) setQ(initialQuery);
  }, [initialQuery]);

  const counts = {
    Available: stock.filter((s) => s.status === "Available").length,
    Reserved: stock.filter((s) => s.status === "Reserved").length,
    Sold: stock.filter((s) => s.status === "Sold").length,
    Inactive: stock.filter((s) => s.status === "Inactive").length,
  };

  const warehouses = Array.from(new Set(stock.map((s) => s.warehouse)))
    .map((w) => ({ name: w, count: stock.filter((s) => s.warehouse === w).length }));

  const brandPie = Array.from(new Set(stock.map((s) => s.brand)))
    .map((b, i) => ({
      name: b,
      value: stock.filter((s) => s.brand === b).length,
      fill: ["#000c69", "#cf060c", "#3b82f6", "#10b981", "#f59e0b"][i % 5],
    }));

  const filtered = stock.filter((s) => {
    if (focus === "low" && s.status !== "Reserved" && s.status !== "Inactive") return false;
    if (focus !== "low" && tab !== "all" && s.status !== tab) return false;
    return (
      s.serialNumber.toLowerCase().includes(q.toLowerCase()) ||
      s.stockCode.toLowerCase().includes(q.toLowerCase()) ||
      s.counterModel.toLowerCase().includes(q.toLowerCase())
    );
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="emerald" icon={<Package className="size-[18px]" />} label="Hazır Stok" value={counts.Available} sub="adet" delta={5} />
        <MiniKpi tone="amber" icon={<Clock className="size-[18px]" />} label="Rezerve" value={counts.Reserved} sub="bekleyen sipariş" delta={2} />
        <MiniKpi tone="violet" icon={<CheckCircle2 className="size-[18px]" />} label="Satılan" value={counts.Sold} sub="bu çeyrek" delta={9} />
        <MiniKpi tone="red" icon={<AlertTriangle className="size-[18px]" />} label="Pasif" value={counts.Inactive} sub="kullanım dışı" delta={0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Depo Bazında Stok</CardTitle>
            <p className="text-xs text-muted-foreground">Toplam {stock.length} kalem</p>
          </CardHeader>
          <CardContent className="h-56 pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={warehouses} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Bar dataKey="count" name="Kalem" fill="#000c69" barSize={32} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Marka Dağılımı</CardTitle>
            <p className="text-xs text-muted-foreground">Aktif kalemler</p>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={brandPie} dataKey="value" nameKey="name" outerRadius={70} innerRadius={42} paddingAngle={2} isAnimationActive={false}>
                  {brandPie.map((d) => (
                    <Cell key={`br-${d.name}`} fill={d.fill} stroke="#fff" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="tracking-tight mr-2">Stok Kalemleri</CardTitle>
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="h-8 bg-muted/60">
                <TabsTrigger value="all" className="text-xs">Tümü</TabsTrigger>
                <TabsTrigger value="Available" className="text-xs">Hazır</TabsTrigger>
                <TabsTrigger value="Reserved" className="text-xs">Rezerve</TabsTrigger>
                <TabsTrigger value="Sold" className="text-xs">Satılan</TabsTrigger>
                <TabsTrigger value="Inactive" className="text-xs">Pasif</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Seri / kod / model..." className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={() => exportStockCsv(filtered)}>
              <Download className="size-4" /> Excel
            </Button>
            <CreateStockDialog
              trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Stok</Button>}
            />
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Stok</TableHead>
                <TableHead>Marka</TableHead>
                <TableHead>Tip / Model</TableHead>
                <TableHead>Seri No</TableHead>
                <TableHead>Kontrol Paneli</TableHead>
                <TableHead>Depo</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                        <Package className="size-4" />
                      </div>
                      <div className="text-sm">{s.stockCode}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{s.brand}</TableCell>
                  <TableCell className="text-sm">{s.counterType} · {s.counterModel}</TableCell>
                  <TableCell className="text-sm tabular-nums">{s.serialNumber}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.controlPanel}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-muted text-foreground/70">
                      <MapPin className="size-3" />{s.warehouse}
                    </span>
                  </TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(["Available", "Reserved", "Sold", "Inactive"] as const).map((st) => (
                          <DropdownMenuItem
                            key={st}
                            disabled={s.status === st}
                            onClick={() => {
                              updateStockStatus(s.id, st);
                              toast.success("Durum güncellendi", { description: `${s.stockCode} → ${st}` });
                            }}
                          >
                            {st} olarak işaretle
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-sm text-muted-foreground">Kayıt bulunamadı.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

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

  const downloadCsv = () => {
    const headers = ["Tip", "Sipariş", "Fatura No", "Tedarikçi", "Tarih", "ETA", "Ara Toplam", "KDV", "Son Tutar", "Para Birimi", "Durum"];
    const escape = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      headers.join(","),
      ...filtered.map((p) =>
        [
          purchaseTypeLabel(p.purchaseType),
          p.orderNo,
          p.invoiceNo ?? "",
          p.supplier?.shortName || p.supplier?.legalTitle || "",
          formatDate(p.orderDate),
          formatDate(p.expectedDate),
          Number(p.subtotal ?? 0).toFixed(2),
          Number(p.vatAmount ?? 0).toFixed(2),
          Number(p.grandTotal ?? 0).toFixed(2),
          p.currency?.code ?? "USD",
          p.status?.name ?? "",
        ].map(escape).join(",")
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `satinalma-siparisleri-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
            <Button variant="outline" size="sm" className="h-9" onClick={downloadCsv}><Download className="size-4" /> Excel</Button>
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
                          onClick={() => {
                            toast.success("Yönetici onayı verildi!");
                            // purchaseOrderService.setStatus(p.id, { statusCode: "approved" }).then(() => loadOrders());
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
              <Button variant="outline" size="sm" className="h-9"
                onClick={() => exportToCsv("sevkiyatlar", ["Takip No", "Taşıyıcı", "Çıkış", "Varış", "Durum", "ETA"], visibleShipments.map((s) => [s.trackingNo, s.carrier, s.origin, s.destination, s.status, s.eta]))}>
                <Download className="size-4" /> Excel
              </Button>
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
            <Button variant="outline" size="sm" className="h-9"
              onClick={() => exportToCsv("teslimatlar", ["Müşteri", "Tarih", "Teslim Alan", "Durum"], deliveries.map((d) => [liveCustomerName(d.customerId), d.date, d.signedBy, d.status]))}>
              <Download className="size-4" /> Excel
            </Button>
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

export function MachinesPage() {
  const { machines, service, customers } = useStore();
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Makineler / Varlıklar</CardTitle>
          <CreateMachineDialog>
            <Button size="sm">Yeni Makine Ekle</Button>
          </CreateMachineDialog>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        {machines.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="size-12 rounded-full bg-muted grid place-items-center mb-3">
              <svg className="size-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="font-medium">Kayıtlı Makine Yok</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Şu anda sisteme kayıtlı bir makine bulunmuyor. Yeni bir makine/varlık ekleyerek servis süreçlerini başlatabilirsiniz.
            </p>
            <CreateMachineDialog>
              <Button className="mt-4">Yeni Makine Ekle</Button>
            </CreateMachineDialog>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seri No</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Müşteri</TableHead>
                <TableHead>Kurulum</TableHead>
                <TableHead>Garanti Bitiş</TableHead>
                <TableHead>Servis Sayısı</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {machines.map((m) => {
                const srCount = service.filter((s) => s.machineId === m.id).length;
                return (
                  <TableRow key={m.id}>
                    <TableCell>{m.serialNumber}</TableCell>
                    <TableCell>{m.model}</TableCell>
                    <TableCell>{customerName(m.customerId)}</TableCell>
                    <TableCell className="text-muted-foreground">{m.installationDate}</TableCell>
                    <TableCell className="text-muted-foreground">{m.warrantyEnd}</TableCell>
                    <TableCell className="tabular-nums">{srCount}</TableCell>
                    <TableCell><StatusBadge status={m.status} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </Card>
  );
}

const SERVICE_STAGES = ["Request Opened", "Diagnosis", "Quote Needed", "Quote Sent", "Approval", "Scheduled", "Service In Progress", "Service Completed", "Signed Form", "Closed"];
const SERVICE_CURRENCIES = ["USD", "EUR", "TRY"] as const;

const serviceNoteText = (s: ServiceRequest) =>
  s.serviceNote || s.diagnosisNote || s.description || s.issueType || "Not girilmedi";

const timestamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

const formatElapsed = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const serviceElapsedSeconds = (s: ServiceRequest, nowMs = Date.now()) => {
  const base = s.timerElapsedSeconds ?? 0;
  if (s.timerStatus !== "running" || !s.timerStartedAt) return base;
  const started = new Date(s.timerStartedAt).getTime();
  if (!Number.isFinite(started)) return base;
  return base + Math.max(0, Math.floor((nowMs - started) / 1000));
};

const moneyText = (value: number, currency = "USD") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);

const serviceAgeDays = (s: ServiceRequest) => {
  const time = new Date(s.createdAt).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000)));
};

const matchesServiceFocus = (s: ServiceRequest, focus?: OperationFocus) => {
  if (focus === "open") return s.stage !== "Closed";
  if (focus === "sla" || focus === "late") return s.stage !== "Closed" && serviceAgeDays(s) > 7;
  if (focus === "scheduled") return s.stage === "Scheduled";
  return true;
};

export function ServiceRequestsPage({ initialView = "list", focus }: { initialView?: "list" | "board"; focus?: OperationFocus }) {
  const { service, machines, customers } = useStore();
  const [view, setView] = useState<"list" | "board">(initialView);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const selectedService = selectedServiceId ? service.find((s) => s.id === selectedServiceId) ?? null : null;
  const visibleService = service.filter((s) => matchesServiceFocus(s, focus));

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  // DR.MAK Servis Formu — müşteri ve makine bilgileri CRM'den, işlem/parça
  // alanları sahada doldurulmak üzere boş basılır.
  const printServiceForm = (s: ServiceRequest, index: number) => {
    const cust = customers.find((c) => c.id === s.customerId);
    const m = machines.find((x) => x.id === s.machineId);
    const sikayet = (s as any).description || s.diagnosisNote || (s as any).issueType || "";
    printOrWarn(
      serviceFormDoc(
        {
          firma: cust?.name,
          ilgili: cust?.contactPerson,
          adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : "",
          tel: cust?.phone,
          faks: cust?.fax,
          gsm: cust?.phone2,
          eposta: cust?.email,
          vergiDairesi: cust?.taxOffice,
          vergiNo: cust?.taxNumber,
          formNo: String(index + 1),
          tarih: trShortDate(s.createdAt),
          tezgah: m ? { marka: m.brand, tip: m.type, model: m.model, seriNo: m.serialNumber } : undefined,
          cnc: m?.controlUnit
            ? {
                marka: m.controlUnit.split(" ")[0],
                model: m.controlUnit.split(" ").slice(1).join(" ") || undefined,
                seriNo: m.controlUnitSerial,
              }
            : undefined,
          sikayet,
          servisTipi: "ariza",
          yukumluluk: m && m.status === "Active" ? "garanti" : "ucretli",
        },
        printAssetBase()
      )
    );
  };

  // Teknik Servis Teklifi — seçilen not setiyle (teknik servis / periyodik
  // bakım / söküm-kurulum / eğitim) basılır; kalemler teklif aşamasında girilir.
  const printServiceQuote = (s: ServiceRequest, variantKey: string) => {
    const variant = SERVICE_NOTE_VARIANTS.find((v) => v.key === variantKey) ?? SERVICE_NOTE_VARIANTS[0];
    const cust = customers.find((c) => c.id === s.customerId);
    const m = machines.find((x) => x.id === s.machineId);
    printOrWarn(
      serviceQuoteDoc(
        {
          firma: cust?.name ?? "",
          ilgili: cust?.contactPerson,
          mobil: cust?.phone2,
          adres: cust ? [cust.address, cust.district, cust.city].filter(Boolean).join(" ") : "",
          tel: cust?.phone,
          email: cust?.email,
          tarih: trShortDate(new Date()),
          belgeNo: `SRV-${s.id.slice(0, 6).toUpperCase()}`,
          konu: m ? `${m.model} · ${m.serialNumber}` : undefined,
          items: [],
          kdvOran: 20,
          kdvTutar: 0,
          currency: "USD",
          baslik: variant.label.toLocaleUpperCase("tr-TR"),
          notlar: variant.notlar,
        },
        printAssetBase()
      )
    );
  };

  return (
    <>
    <Tabs value={view} onValueChange={(v) => setView(v as "list" | "board")}>
      <TabsList>
        <TabsTrigger value="list">Liste</TabsTrigger>
        <TabsTrigger value="board">Servis Akışı</TabsTrigger>
      </TabsList>
      <TabsContent value="list" className="mt-4">
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Servis Talepleri</CardTitle>
            <CreateServiceRequestDialog
              trigger={<Button className="gap-1"><Plus className="size-4" /> Yeni Talep</Button>}
            />
          </CardHeader>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firma</TableHead>
                <TableHead>Not</TableHead>
                <TableHead>Aşama</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="w-16 text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleService.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Bu filtreye uyan servis talebi bulunmuyor.
                  </TableCell>
                </TableRow>
              ) : (
              visibleService.map((s, idx) => {
                return (
                  <TableRow key={s.id} className="cursor-pointer group" onClick={() => setSelectedServiceId(s.id)}>
                    <TableCell className="font-medium">{customerName(s.customerId)}</TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground line-clamp-1">{serviceNoteText(s)}</span>
                    </TableCell>
                    <TableCell><StatusBadge status={s.stage} /></TableCell>
                    <TableCell className="text-muted-foreground">{s.createdAt}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        title="Konumu haritada aç"
                        onClick={(event) => {
                          event.stopPropagation();
                          const c = customers.find((x) => x.id === s.customerId);
                          openInMaps([c?.address, c?.district, c?.city]);
                        }}
                      >
                        <MapPin className="size-4 text-muted-foreground hover:text-primary" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title="Yazdır / PDF"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Printer className="size-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenuItem onClick={() => printServiceForm(s, idx)}>
                            Servis Formu yazdır
                          </DropdownMenuItem>
                          {SERVICE_NOTE_VARIANTS.map((v) => (
                            <DropdownMenuItem key={v.key} onClick={() => printServiceQuote(s, v.key)}>
                              Servis Teklifi · {v.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }))}
            </TableBody>
          </Table>
          </div>
        </Card>
      </TabsContent>
      <TabsContent value="board" className="mt-4">
        <ServiceBoard onOpen={(s) => setSelectedServiceId(s.id)} focus={focus} />
      </TabsContent>
    </Tabs>
    <ServiceDetailDialog serviceRequest={selectedService} onClose={() => setSelectedServiceId(null)} />
    </>
  );
}

type ServiceColumnKey =
  | "Servis Talep"
  | "Müşteri İletişim"
  | "Servis Teklifi"
  | "Bakım/Onarım & Yedek Parça"
  | "Servis Devam Ediyor"
  | "Servis Tamamlandı Formu";

const SERVICE_COLUMNS: { key: ServiceColumnKey; stages: ServiceStage[]; primary: ServiceStage; dot: string }[] = [
  { key: "Servis Talep", stages: ["Request Opened"], primary: "Request Opened", dot: "bg-zinc-400" },
  { key: "Müşteri İletişim", stages: ["Diagnosis"], primary: "Diagnosis", dot: "bg-blue-400" },
  { key: "Servis Teklifi", stages: ["Quote Needed", "Quote Sent", "Approval"], primary: "Quote Sent", dot: "bg-indigo-500" },
  { key: "Bakım/Onarım & Yedek Parça", stages: ["Scheduled"], primary: "Scheduled", dot: "bg-amber-500" },
  { key: "Servis Devam Ediyor", stages: ["Service In Progress"], primary: "Service In Progress", dot: "bg-sky-500" },
  { key: "Servis Tamamlandı Formu", stages: ["Service Completed", "Signed Form", "Closed"], primary: "Signed Form", dot: "bg-emerald-600" },
];

const STAGE_TO_COLUMN: Record<ServiceStage, ServiceColumnKey> = SERVICE_COLUMNS.reduce((acc, col) => {
  for (const st of col.stages) acc[st] = col.key;
  return acc;
}, {} as Record<ServiceStage, ServiceColumnKey>);

type ServiceDetailTab = "summary" | "communication" | "notes" | "activities" | "operations";

const SERVICE_ACTIVITY_ENABLED_STAGES = new Set<ServiceStage>(["Service In Progress", "Service Completed", "Signed Form", "Closed"]);
const SERVICE_FEE_ENABLED_STAGES = new Set<ServiceStage>(["Service Completed", "Signed Form", "Closed"]);

const isServiceDetailTabEnabled = (stage: ServiceStage, tab: ServiceDetailTab) => {
  if (tab === "activities") return SERVICE_ACTIVITY_ENABLED_STAGES.has(stage);
  if (tab === "operations") return SERVICE_FEE_ENABLED_STAGES.has(stage);
  return true;
};

export function ServiceKanbanPage({ focus }: { focus?: OperationFocus }) {
  return <ServiceRequestsPage initialView="board" focus={focus} />;
}

function ServiceBoard({ onOpen, focus }: { onOpen?: (s: ServiceRequest) => void; focus?: OperationFocus }) {
  const { service, moveService, customers } = useStore();
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const visibleService = service.filter((s) => matchesServiceFocus(s, focus));
  const columns: KanbanColumn<ServiceRequest>[] = SERVICE_COLUMNS.map((col) => {
    const items = visibleService.filter((s) => STAGE_TO_COLUMN[s.stage] === col.key);
    return {
      key: col.key,
      title: col.key,
      dot: col.dot,
      items,
      footer: (
        <div className="flex items-center justify-between">
          <span>Toplam</span>
          <span>{items.length} kayıt</span>
        </div>
      ),
    };
  });
  return (
    <KanbanBoard<ServiceRequest>
      columns={columns}
      fit={false}
      columnWidth={260}
      onMove={async (id, _from, to) => {
        const target = SERVICE_COLUMNS.find((c) => c.key === to);
        if (!target) return;
        try {
          await moveService(id, target.primary);
          toast.success("Servis kartı taşındı", { description: `Yeni aşama: ${target.key}` });
        } catch (err: any) {
          toast.error("Servis kartı taşınamadı", { description: err?.message ?? "Aşama geçişi reddedildi." });
        }
      }}
      renderCard={(s) => {
        const c = customers.find((x) => x.id === s.customerId);
        return (
          <Card
            onClick={() => onOpen?.(s)}
            className="p-3 hover:shadow-md hover:border-primary/40 transition-all border-border/60 group bg-white cursor-pointer"
          >
            <div className="flex items-start gap-2">
              <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center text-[10px] shrink-0">
                {c?.type === "company" ? <Building2 className="size-3.5" /> : <Wrench className="size-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] leading-tight truncate group-hover:text-primary transition-colors">{customerName(s.customerId)}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-3 break-words mt-1.5">{serviceNoteText(s)}</div>
              </div>
            </div>
          </Card>
        );
      }}
    />
  );
}

type ServiceActor = {
  id?: string;
  name: string;
  email?: string;
  department?: string;
  avatarUrl?: string;
};

function ServiceActorAvatar({ actor, className = "size-8" }: { actor?: ServiceActor | null; className?: string }) {
  const fallback = initials(actor?.name ?? "Kullanıcı") || "K";
  return (
    <Avatar className={`${className} border border-border/60 bg-white`}>
      {actor?.avatarUrl && <AvatarImage src={actor.avatarUrl} alt={actor.name} />}
      <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-medium">{fallback}</AvatarFallback>
    </Avatar>
  );
}

function ServiceHistoryCard({
  text,
  createdAt,
  actor,
}: {
  text: string;
  createdAt?: string;
  actor?: ServiceActor | null;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
      <div className="flex items-start gap-3">
        <ServiceActorAvatar actor={actor} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium truncate">{actor?.name ?? "Bilinmeyen kullanıcı"}</span>
            {actor?.department && <span className="text-[11px] text-muted-foreground">{actor.department}</span>}
            {createdAt && <span className="text-[11px] text-muted-foreground tabular-nums">{createdAt}</span>}
          </div>
          <div className="mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words">{text}</div>
        </div>
      </div>
    </div>
  );
}

function ServiceDetailDialog({
  serviceRequest,
  onClose,
}: {
  serviceRequest: ServiceRequest | null;
  onClose: () => void;
}) {
  const { updateService, customers, machines, users } = useStore();
  const { user: authUser } = useAuth();
  const [nowMs, setNowMs] = useState(Date.now());
  const [note, setNote] = useState("");
  const [complaint, setComplaint] = useState("");
  const [operationDescription, setOperationDescription] = useState("");
  const [operationQty, setOperationQty] = useState("1");
  const [operationPrice, setOperationPrice] = useState("0");
  const [operationCurrency, setOperationCurrency] = useState<(typeof SERVICE_CURRENCIES)[number]>("USD");
  const [detailTab, setDetailTab] = useState<ServiceDetailTab>("summary");

  useEffect(() => {
    setNote("");
    setComplaint("");
    setOperationDescription("");
    setOperationQty("1");
    setOperationPrice("0");
    setOperationCurrency(serviceRequest?.serviceCurrency ?? "USD");
    setDetailTab("summary");
  }, [serviceRequest?.id, serviceRequest?.serviceCurrency, serviceRequest?.stage]);

  useEffect(() => {
    if (serviceRequest?.timerStatus !== "running") return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [serviceRequest?.timerStatus, serviceRequest?.timerStartedAt]);

  if (!serviceRequest) return null;

  const customer = customers.find((c) => c.id === serviceRequest.customerId);
  const machine = machines.find((m) => m.id === serviceRequest.machineId);
  const assignee = users.find((u) => u.id === serviceRequest.assignedUserId);
  const resolveActor = (id?: string): ServiceActor | null => {
    const localUser = users.find((u) => u.id === id);
    if (localUser) {
      return {
        id: localUser.id,
        name: localUser.name,
        email: localUser.email,
        department: localUser.department,
        avatarUrl: localUser.avatarUrl,
      };
    }
    if (authUser && (!id || id === authUser.id)) {
      return {
        id: authUser.id,
        name: authUser.fullName,
        email: authUser.email,
        department: authUser.roles?.[0]?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toLocaleUpperCase("tr-TR")),
      };
    }
    return null;
  };
  const currentActorId = authUser?.id ?? serviceRequest.assignedUserId;
  const currentActor = resolveActor(currentActorId) ?? resolveActor(serviceRequest.assignedUserId);
  const fallbackActor = resolveActor(serviceRequest.assignedUserId) ?? currentActor;
  const actorFor = (id?: string) => resolveActor(id) ?? fallbackActor;
  const elapsed = serviceElapsedSeconds(serviceRequest, nowMs);
  const hourlyRate = serviceRequest.serviceHourlyRate ?? 0;
  const serviceCurrency = serviceRequest.serviceCurrency ?? "USD";
  const serviceFee = (elapsed / 3600) * hourlyRate;
  const operations = serviceRequest.operations ?? [];
  const manualTotal = operations
    .filter((op) => op.currency === serviceCurrency)
    .reduce((sum, op) => sum + op.quantity * op.unitPrice, 0);
  const activityTabEnabled = isServiceDetailTabEnabled(serviceRequest.stage, "activities");
  const feeTabEnabled = isServiceDetailTabEnabled(serviceRequest.stage, "operations");
  const setAllowedDetailTab = (value: string) => {
    const next = value as ServiceDetailTab;
    if (!isServiceDetailTabEnabled(serviceRequest.stage, next)) return;
    setDetailTab(next);
  };

  const makeHistoryItem = (prefix: string, text: string) => ({
    id: `${prefix}-${Date.now()}`,
    text,
    createdAt: timestamp(),
    byUserId: currentActorId,
  });

  const withActivity = (text: string, patch: Partial<ServiceRequest> = {}) => ({
    ...patch,
    activityHistory: [
      ...(serviceRequest.activityHistory ?? []),
      makeHistoryItem("srv-act", text),
    ],
  });

  const startTimer = async () => {
    await updateService(
      serviceRequest.id,
      withActivity("Sayaç başlatıldı.", {
        timerStatus: "running",
        timerStartedAt: new Date().toISOString(),
      })
    );
  };

  const pauseTimer = async () => {
    await updateService(
      serviceRequest.id,
      withActivity("Sayaç beklemeye alındı.", {
        timerStatus: "paused",
        timerStartedAt: undefined,
        timerElapsedSeconds: elapsed,
      })
    );
  };

  const stopTimer = async () => {
    await updateService(
      serviceRequest.id,
      withActivity("Sayaç durduruldu.", {
        timerStatus: "stopped",
        timerStartedAt: undefined,
        timerElapsedSeconds: elapsed,
      })
    );
  };

  const addNote = async () => {
    const text = note.trim();
    if (!text) return;
    await updateService(
      serviceRequest.id,
      withActivity("Not eklendi.", {
        serviceNote: text,
        noteHistory: [
          ...(serviceRequest.noteHistory ?? []),
          makeHistoryItem("srv-note", text),
        ],
      })
    );
    setNote("");
  };

  const addComplaint = async () => {
    const text = complaint.trim();
    if (!text) return;
    await updateService(
      serviceRequest.id,
      withActivity("Şikayet kaydı eklendi.", {
        diagnosisNote: text,
        complaints: [
          ...(serviceRequest.complaints ?? []),
          makeHistoryItem("srv-complaint", text),
        ],
      })
    );
    setComplaint("");
  };

  const addOperation = async () => {
    const description = operationDescription.trim();
    if (!description) return;
    const quantity = Math.max(1, Number(operationQty) || 1);
    const unitPrice = Math.max(0, Number(operationPrice) || 0);
    await updateService(
      serviceRequest.id,
      withActivity("Manuel servis işlemi eklendi.", {
        operations: [
          ...operations,
          {
            id: `srv-op-${Date.now()}`,
            description,
            quantity,
            unitPrice,
            currency: operationCurrency,
            createdAt: timestamp(),
            byUserId: currentActorId,
          },
        ],
      })
    );
    setOperationDescription("");
    setOperationQty("1");
    setOperationPrice("0");
  };

  return (
    <Dialog open={!!serviceRequest} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(1120px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[90dvh] overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b border-border/60 px-5 pt-5 pb-4 pr-12">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Wrench className="size-5 text-primary" />
            <span className="min-w-0 truncate">{customer?.name ?? "Firma bulunamadı"}</span>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={serviceRequest.stage} />
            {machine && <span>{machine.model} · {machine.serialNumber}</span>}
            {assignee && <span>Atanan: {assignee.name}</span>}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={detailTab} onValueChange={setAllowedDetailTab} className="flex min-h-0 flex-col">
          <div className="border-b border-border/60 px-5 py-3">
            <TabsList className="h-auto w-full justify-start overflow-x-auto">
              <TabsTrigger value="summary">Özet</TabsTrigger>
              <TabsTrigger value="communication">Müşteri İletişim</TabsTrigger>
              <TabsTrigger value="notes">Not Geçmişi</TabsTrigger>
              <TabsTrigger value="activities" disabled={!activityTabEnabled} title="Servis Devam Ediyor aşamasından sonra açılır">
                {!activityTabEnabled && <Lock className="size-3" />}
                Aktivite Geçmişi
              </TabsTrigger>
              <TabsTrigger value="operations" disabled={!feeTabEnabled} title="Servis Tamamlandı alanında aktif olur">
                {!feeTabEnabled && <Lock className="size-3" />}
                Ücret
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 max-h-[calc(90dvh-146px)] overflow-y-auto px-5 py-4">

          <TabsContent value="summary" className="m-0 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Card className="lg:col-span-2 border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Servis Notu</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{serviceNoteText(serviceRequest)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Saha Süresi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-3xl tabular-nums tracking-tight">{formatElapsed(elapsed)}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" className="gap-1" onClick={startTimer} disabled={serviceRequest.timerStatus === "running"}>
                      <Play className="size-4" /> Başlat
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={pauseTimer} disabled={serviceRequest.timerStatus !== "running"}>
                      <Pause className="size-4" /> Beklet
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1" onClick={stopTimer} disabled={serviceRequest.timerStatus === "idle" || serviceRequest.timerStatus === "stopped"}>
                      <Square className="size-4" /> Durdur
                    </Button>
                  </div>
                  <div className="rounded-md border border-border/60 bg-primary/5 px-3 py-2 text-sm flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span>Servis Ücreti Kalemi</span>
                    <b className="tabular-nums">{moneyText(serviceFee, serviceCurrency)}</b>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Firma</div>
                <div className="mt-1 text-sm">{customer?.name ?? "—"}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Açılış</div>
                <div className="mt-1 text-sm tabular-nums">{serviceRequest.createdAt}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Teklif</div>
                <div className="mt-1 text-sm">{serviceRequest.quoteRequired ? "Gerekli" : "Gerekli değil"}</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="communication" className="m-0 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="size-4" /> Şikayetler</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="Şikayet / müşteri iletişim notu" className="min-h-20" />
                  <Button className="self-start gap-1 sm:w-auto" onClick={addComplaint}><Plus className="size-4" /> Ekle</Button>
                </div>
                <div className="space-y-2">
                  {(serviceRequest.complaints ?? []).map((item) => (
                    <ServiceHistoryCard
                      key={item.id}
                      text={item.text}
                      createdAt={item.createdAt}
                      actor={actorFor(item.byUserId)}
                    />
                  ))}
                  {(serviceRequest.complaints ?? []).length === 0 && <div className="text-sm text-muted-foreground">Şikayet kaydı yok.</div>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="m-0 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Not Geçmişi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Servis notu" className="min-h-20" />
                  <Button className="self-start gap-1" onClick={addNote}><Plus className="size-4" /> Ekle</Button>
                </div>
                <div className="space-y-2">
                  {(serviceRequest.noteHistory ?? []).map((item) => (
                    <ServiceHistoryCard
                      key={item.id}
                      text={item.text}
                      createdAt={item.createdAt}
                      actor={actorFor(item.byUserId)}
                    />
                  ))}
                  {(serviceRequest.noteHistory ?? []).length === 0 && <div className="text-sm text-muted-foreground">Not kaydı yok.</div>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activities" className="m-0">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Aktivite Geçmişi</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="relative space-y-3">
                  {(serviceRequest.activityHistory ?? []).map((item) => (
                    <li key={item.id}>
                      <ServiceHistoryCard
                        text={item.text}
                        createdAt={item.createdAt}
                        actor={actorFor(item.byUserId)}
                      />
                    </li>
                  ))}
                  {(serviceRequest.activityHistory ?? []).length === 0 && <div className="text-sm text-muted-foreground">Aktivite kaydı yok.</div>}
                </ol>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operations" className="m-0 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Servis Ücreti</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <Label>Saatlik Ücret</Label>
                  <Input
                    type="number"
                    className="mt-1"
                    value={hourlyRate}
                    onChange={(e) => updateService(serviceRequest.id, { serviceHourlyRate: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Para Birimi</Label>
                  <Select
                    value={serviceCurrency}
                    onValueChange={(v) => updateService(serviceRequest.id, { serviceCurrency: v as typeof serviceCurrency })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_CURRENCIES.map((cur) => <SelectItem key={cur} value={cur}>{cur}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Geçirilen Süre</Label>
                  <div className="mt-1 h-10 rounded-md border border-border/60 bg-muted/30 px-3 flex items-center tabular-nums">{formatElapsed(elapsed)}</div>
                </div>
                <div>
                  <Label>Servis Ücreti Kalemi</Label>
                  <div className="mt-1 h-10 rounded-md border border-border/60 bg-primary/5 px-3 flex items-center tabular-nums font-medium">
                    {moneyText(serviceFee, serviceCurrency)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Manuel İşlemler</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_96px_120px_110px_auto] gap-2 items-end">
                  <div>
                    <Label>İşlem</Label>
                    <Input className="mt-1" value={operationDescription} onChange={(e) => setOperationDescription(e.target.value)} placeholder="Yapılan işlem" />
                  </div>
                  <div>
                    <Label>Adet</Label>
                    <Input className="mt-1" type="number" value={operationQty} onChange={(e) => setOperationQty(e.target.value)} />
                  </div>
                  <div>
                    <Label>Birim</Label>
                    <Input className="mt-1" type="number" value={operationPrice} onChange={(e) => setOperationPrice(e.target.value)} />
                  </div>
                  <div>
                    <Label>Para</Label>
                    <Select value={operationCurrency} onValueChange={(v) => setOperationCurrency(v as typeof operationCurrency)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SERVICE_CURRENCIES.map((cur) => <SelectItem key={cur} value={cur}>{cur}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="gap-1 lg:w-auto" onClick={addOperation}><Plus className="size-4" /> Ekle</Button>
                </div>

                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <Table className="min-w-[620px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead>İşlem</TableHead>
                        <TableHead>Ekleyen</TableHead>
                        <TableHead>Tarih</TableHead>
                        <TableHead className="text-right">Adet</TableHead>
                        <TableHead className="text-right">Birim</TableHead>
                        <TableHead className="text-right">Tutar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {operations.map((op) => (
                        <TableRow key={op.id}>
                          <TableCell className="min-w-[220px]">{op.description}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[170px]">
                              <ServiceActorAvatar actor={actorFor(op.byUserId ?? serviceRequest.assignedUserId)} className="size-7" />
                              <div className="min-w-0">
                                <div className="text-sm truncate">{actorFor(op.byUserId ?? serviceRequest.assignedUserId)?.name ?? "Bilinmeyen kullanıcı"}</div>
                                <div className="text-[11px] text-muted-foreground truncate">{actorFor(op.byUserId ?? serviceRequest.assignedUserId)?.department ?? "—"}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">{op.createdAt ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{op.quantity}</TableCell>
                          <TableCell className="text-right tabular-nums">{moneyText(op.unitPrice, op.currency)}</TableCell>
                          <TableCell className="text-right tabular-nums">{moneyText(op.quantity * op.unitPrice, op.currency)}</TableCell>
                        </TableRow>
                      ))}
                      {operations.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Manuel işlem yok.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2 text-sm flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span>Servis ücreti + aynı para birimindeki manuel işlemler</span>
                  <b className="tabular-nums">{moneyText(serviceFee + manualTotal, serviceCurrency)}</b>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function ReportsPage({ onAction }: { onAction?: (action: OperationAction) => void }) {
  const store = useStore();
  const { cases, offers, service } = store;
  const [mode, setMode] = useState<"operasyonel" | "karlilik">("operasyonel");
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
      </div>

      <ReportExecutiveSummary
        summary={management}
        sourceId={sourceId}
        onSourceChange={setSourceId}
        onAction={onAction}
      />

      {mode === "karlilik" && <YearEndReportView />}

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
        <Button variant="outline" size="sm"
          onClick={() => {
            if (!chartData.length) return;
            const keys = Object.keys(chartData[0]);
            exportToCsv(period === "monthly" ? `rapor-${year}` : "rapor-yillik", keys, chartData.map((r) => keys.map((k) => (r as any)[k])));
          }}>
          <Download className="size-4" /> Excel İndir
        </Button>
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
  const [downloading, setDownloading] = useState(false);

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

  // Gerçek (çok sayfalı) .xlsx indirme — backend export ucundan.
  const handleExcel = async () => {
    try {
      setDownloading(true);
      await reportService.downloadYearEnd(year);
    } catch (e: any) {
      toast.error("Excel indirilemedi", { description: e?.message ?? "Bilinmeyen hata" });
    } finally {
      setDownloading(false);
    }
  };

  // Yazdırılabilir / PDF çıktısı — biçimlendirilmiş raporu blob URL ile yeni
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
        <Button variant="outline" size="sm" onClick={handleExcel} disabled={!data || downloading}>
          <Download className="size-4" /> {downloading ? "İndiriliyor…" : "Excel İndir"}
        </Button>
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
  const canShowActions = canSetTargets || canAssignRoles;
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [availableRoles, setAvailableRoles] = useState<AssignableRole[]>([]);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [targetPeriod, setTargetPeriod] = useState(currentPeriod());
  const [targets, setTargets] = useState<Record<string, UserTarget>>({});
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [roleUser, setRoleUser] = useState<AdminUserRow | null>(null);
  const [limitUser, setLimitUser] = useState<User | null>(null);
  const [savingRoles, setSavingRoles] = useState(false);
  const [savingLimit, setSavingLimit] = useState(false);

  const loadAdminUsers = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const [userRows, roleRows] = await Promise.all([
        adminService.users(),
        canAssignRoles ? adminService.roles() : Promise.resolve([]),
      ]);
      const fallbackById = new Map(users.map((user) => [user.id, user]));
      setAdminUsers((Array.isArray(userRows) ? userRows : []).map((user) => normalizeAdminUser(user, fallbackById.get(user.id))));
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
  }, [canAssignRoles, users]);

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
            <Button className="gap-1"><Plus className="size-4" /> Kullanıcı Ekle</Button>
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
                    <TableCell>{u.department}</TableCell>
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
                    <TableCell><Switch checked={u.active} /></TableCell>
                    {canShowActions && (
                      <TableCell className="text-right whitespace-nowrap">
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
  const { hasRole } = useAuth();
  const canManage = hasRole("super_admin");
  const [rows, setRows] = useState<DeptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await adminService.departments()) as DeptItem[]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) return toast.error("Ad ve kod zorunlu");
    setSaving(true);
    try {
      await adminService.createDept({ name: form.name.trim(), code: form.code.trim(), description: form.description.trim() || undefined });
      toast.success("Departman eklendi");
      setOpen(false);
      setForm({ name: "", code: "", description: "" });
      await load();
    } catch (err: any) {
      toast.error("Departman eklenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Departmanlar</CardTitle>
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
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Departman</TableHead>
              <TableHead>Kod</TableHead>
              <TableHead>Açıklama</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.name}</TableCell>
                <TableCell className="text-muted-foreground">{d.code ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{d.description ?? "—"}</TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center py-8 text-sm text-muted-foreground">Henüz departman yok.</TableCell></TableRow>
            )}
            {loading && (
              <TableRow><TableCell colSpan={3} className="text-center py-8 text-sm text-muted-foreground">Yükleniyor...</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader><CardTitle>Şirket Bilgileri</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Şirket Adı" defaultValue="Opera Endüstri A.Ş." />
          <Field label="VKN" defaultValue="1234567890" />
          <Field label="E-posta" defaultValue="info@opera.com" />
          <Field label="Telefon" defaultValue="+90 212 555 0000" />
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader><CardTitle>Bildirimler</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Toggle label="Yeni satış kartı oluşturulduğunda" defaultChecked />
          <Toggle label="Teklif onaylandığında" defaultChecked />
          <Toggle label="Ödeme gecikmesinde" defaultChecked />
          <Toggle label="Yeni servis talebinde" />
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader><CardTitle>Para Birimi & Bölge</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Varsayılan Para Birimi" defaultValue="USD" />
          <Field label="Saat Dilimi" defaultValue="Europe/Istanbul" />
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader><CardTitle>Depolama</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Sağlayıcı" defaultValue="S3 Compatible" />
          <Field label="Bucket" defaultValue="opera-crm-prod" />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue?: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input defaultValue={defaultValue} className="mt-1" />
    </div>
  );
}

function Toggle({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="font-normal text-sm">{label}</Label>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}
