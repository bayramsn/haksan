import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Badge } from "../../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { RadioGroup, RadioGroupItem } from "../../ui/radio-group";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { StatusBadge } from "../../shared/StatusBadge";
import { QuoteDialog } from "../../dialogs/QuoteDialog";
import { DocumentUploadDialog } from "../../dialogs/DocumentUploadDialog";
import { CreateProformaDialog } from "../../dialogs/CreateProformaDialog";
import { CreateContractDialog } from "../../dialogs/CreateContractDialog";
import { MiniKpi } from "../../shared/MiniKpi";
import { CommercialDocumentRail } from "../../shared/CommercialDocumentRail";
import { salesStageLabel } from "../../../lib/mock";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  Plus, Search, CheckCircle2, TrendingUp, Mail, FileText, ClipboardCheck, Building2,
  Wallet, Receipt, Calendar, Printer, Download, Eye, RotateCcw, XCircle, Pencil, ChevronDown, Trash2,
  BellRing, Image as ImageIcon, ImageOff, Upload,
} from "lucide-react";
import { useStore } from "../../../lib/store";
import { useAuth } from "../../../../lib/auth";
import { buildOfferTrend } from "../../../lib/chartAggregates";
import { useFx } from "../../../lib/fx";
import { Customer, Offer, SalesCase, User } from "../../../lib/mock";
import { toast } from "sonner";
import { fileService, salesOrderService, quoteService } from "../../../../lib/services";
import { ExportExcelButton } from "../../ui/ExportExcelButton";
import { CreateAccountingInvoiceDialog, type AccountingInvoicePrefill } from "../finance/CreateAccountingInvoiceDialog";
import type { OperationFocus } from "../../../lib/operations";
import { loadQuotePrintData, printAssetBase, quoteDoc, quoteFilename } from "../../../lib/print";
import type { QuoteHeaderLogoMode } from "../../../lib/print";
import { downloadPrintOrWarn, previewPrintOrWarn, printOrWarn, splitVat, formatDate, formatCurrency } from "../../../lib/pageHelpers";
import type { QuoteWorkflowStatus } from "@haksan/shared";
import { ComposeMailDialog, type MailRecipient } from "../../mail/ComposeMailDialog";
import { useCompanyDetail } from "../../../lib/companyServerData";
import { contactQueryKeys, loadAllCompanyContacts, type ContactQueryScope } from "../../../lib/contactServerData";

const FOLLOW_UP_OFFER_STATUSES: Offer["status"][] = ["Price Waiting", "Budget Waiting", "On Hold", "Postponed"];

const QUOTE_WORKFLOW_STATUS_LABELS: Record<QuoteWorkflowStatus, string> = {
  cancelled: "İptal",
  price_waiting: "Fiyat Bekleniyor",
  budget_waiting: "Bütçe Bekleniyor",
  on_hold: "Askıya Alındı",
  postponed: "Ertelendi",
};

function OfferSheetPreview({ offer, compact = false }: { offer: Offer; compact?: boolean }) {
  return <div className={`relative shrink-0 overflow-hidden rounded-md border border-primary/10 bg-white shadow-xs ${compact ? "h-12 w-9" : "h-36 w-28"}`} aria-hidden="true"><div className="h-1.5 bg-primary" /><div className={compact ? "space-y-1 p-1" : "space-y-2 p-3"}><div className="flex justify-between gap-1"><span className={`${compact ? "text-[5px]" : "text-[8px]"} font-bold uppercase text-primary`}>Teklif</span>{!compact && <span className="font-data text-[7px] text-muted-foreground">R{offer.revision}</span>}</div><div className="h-px bg-border" />{[82, 56, 74, 91].map((width) => <div key={width} className="h-0.5 rounded-full bg-slate-200" style={{ width: `${width}%` }} />)}{!compact && <><div className="mt-3 grid grid-cols-3 gap-1"><span className="h-4 rounded-sm bg-brand-blue-soft" /><span className="h-4 rounded-sm bg-muted" /><span className="h-4 rounded-sm bg-muted" /></div><div className="absolute inset-x-3 bottom-3 border-t border-border pt-1.5 text-right font-data text-[8px] font-bold text-primary">{offer.amount.toLocaleString("tr-TR")} {offer.currency}</div></>}</div></div>;
}

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
  const vatAmount = Number(order.vatAmount ?? order.vatTotal ?? 0);
  const amount = Number(order.subtotal ?? Math.max(0, grandTotal - vatAmount) ?? grandTotal);
  const vatRate = amount > 0 && vatAmount > 0 ? (vatAmount / amount) * 100 : 20;
  return {
    companyId: order.companyId ?? order.company?.id ?? "",
    amount,
    grandTotal,
    vatAmount,
    vatRate,
    currencyCode: order.currency?.code ?? "USD",
    invoiceNo: `MF-${order.orderNo}`,
    quoteId: order.quoteId ?? order.quote?.id,
    salesOrderId: order.id,
    notes: `Satış siparişi ${order.orderNo} kaynaklı`,
    type: "sales",
  };
}

export function OffersPage({
  focus,
  initialQuery,
  onOpenOpportunity,
  onOpenDocuments,
}: {
  focus?: OperationFocus;
  initialQuery?: string;
  onOpenOpportunity?: (salesCaseId: string) => void;
  onOpenDocuments?: (query?: string) => void;
}) {
  const { offers: rawOffers, cases, customers, users, documents, moveCase, refresh } = useStore();
  const { hasRole, hasPermission, user, activeDivision, setActiveDivision } = useAuth();
  const { convert } = useFx();
  const isSuperAdmin = hasRole("super_admin");
  const customerName = (id: string, fallback?: string) => customers.find((c) => c.id === id)?.name ?? fallback ?? "—";
  const backToSales = async (caseId: string) => {
    try {
      await moveCase(caseId, "sales");
      toast.success("Satış kartı satışa geri alındı");
    } catch (err: any) {
      toast.error("İşlem başarısız", { description: err?.message ?? "Aşama değiştirilemedi." });
    }
  };
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "Draft" | "Sent" | "follow-up" | "Approved" | "closed">("all");
  const divisionOptions = user?.divisions ?? [];
  const [divisionTab, setDivisionTab] = useState(activeDivision !== "all" ? activeDivision : "all");
  useEffect(() => setDivisionTab(activeDivision !== "all" ? activeDivision : "all"), [activeDivision]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [pendingDeleteOffer, setPendingDeleteOffer] = useState<Offer | null>(null);
  const [statusOffer, setStatusOffer] = useState<Offer | null>(null);
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
  const divisionOffers = divisionTab === "all" ? offers : offers.filter((offer) => offer.divisionId === divisionTab);
  const externalQuotes = documents.filter((documentItem) => {
    if (documentItem.type !== "ExternalQuote") return false;
    const salesCase = documentItem.salesCaseId
      ? cases.find((item) => item.id === documentItem.salesCaseId)
      : null;
    if (divisionTab !== "all" && salesCase && salesCase.divisionId !== divisionTab) return false;
    if (!q) return true;
    const company = customers.find((item) => item.id === (documentItem.companyId || salesCase?.customerId));
    return [
      documentItem.fileName,
      company?.name ?? documentItem.companyNameText ?? salesCase?.leadCompanyTitle,
      salesCase?.requestedProduct,
      salesCase?.requestedModel,
    ].some((value) => (value ?? "").toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR")));
  });

  const downloadExternalQuote = async (fileId: string | undefined, fileName: string) => {
    if (!fileId) return;
    try {
      const signed = await fileService.signedDownload(fileId);
      const anchor = document.createElement("a");
      anchor.href = signed.downloadUrl;
      anchor.download = signed.filename || fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (error: any) {
      toast.error("Dış teklif indirilemedi", {
        description: error?.message ?? "Dosya bağlantısı alınamadı.",
      });
    }
  };

  useEffect(() => {
    if (focus === "open" || focus === "pending" || focus === "expired") setTab("Sent");
    if (focus === "won") setTab("Approved");
    if (focus === "lost") setTab("closed");
  }, [focus]);

  useEffect(() => {
    if (initialQuery !== undefined) setQ(initialQuery);
  }, [initialQuery]);

  const total = divisionOffers.length;
  const approved = divisionOffers.filter((o) => o.status === "Approved").length;
  const sent = divisionOffers.filter((o) => o.status === "Sent").length;
  // Farklı para birimleri USD bazına çevrilerek toplanır (baz birim USD).
  const totalAmount = divisionOffers.reduce((a, o) => a + convert(o.amount, o.currency, "USD"), 0);
  const approvedAmount = divisionOffers.filter((o) => o.status === "Approved").reduce((a, o) => a + convert(o.amount, o.currency, "USD"), 0);
  const winRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  const filtered = divisionOffers
    .filter((o) => {
      if (focusExpired && !offerExpired(o)) return false;
      if (tab === "follow-up" && !FOLLOW_UP_OFFER_STATUSES.includes(o.status)) return false;
      if (tab === "closed" && o.status !== "Rejected" && o.status !== "Cancelled") return false;
      if (tab !== "all" && tab !== "follow-up" && tab !== "closed" && o.status !== tab) return false;
      if (q) {
        const sc = cases.find((s) => s.id === o.salesCaseId);
        const cName = sc ? customerName(sc.customerId, sc.leadCompanyTitle) : "";
        const productName = o.productName || [sc?.requestedProduct, sc?.requestedModel].filter(Boolean).join(" ");
        return [o.quoteNo, cName, productName, o.businessLine, o.divisionName]
          .some((value) => (value ?? "").toLowerCase().includes(q.toLowerCase()));
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
    ...(tab !== "all" && tab !== "follow-up" && tab !== "closed" ? { statusCode: tab.toLowerCase() } : {}),
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

  const offerTrend = useMemo(() => buildOfferTrend(divisionOffers, 6), [divisionOffers]);
  const rejectionReasons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const salesCase of cases.filter((item) => item.isLost)) {
      const reason = salesCase.lostReason?.trim() || "Neden belirtilmemiş";
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [cases]);

  const runQuoteAction = async (offerId: string, action: "send" | "approve" | "reject" | "approve-price" | "reject-price") => {
    try {
      if (action === "send") await quoteService.send(offerId);
      else if (action === "approve") await quoteService.approve(offerId);
      else if (action === "approve-price") await quoteService.approvePrice(offerId);
      else if (action === "reject-price") await quoteService.rejectPrice(offerId);
      else await quoteService.reject(offerId);
      toast.success(
        action === "send"
          ? "Teklif gönderildi olarak işaretlendi"
          : action === "approve"
            ? "Teklif onaylandı"
            : action === "approve-price"
              ? "Fiyat onaylandı"
              : action === "reject-price"
                ? "Fiyat reddedildi"
                : "Teklif reddedildi"
      );
      await refresh();
    } catch (err: any) {
      toast.error("İşlem başarısız", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  const deleteOffer = async (offer: Offer) => {
    try {
      await quoteService.remove(offer.id);
      toast.success("Teklif silindi", { description: offer.quoteNo });
      if (selectedOfferId === offer.id) setSelectedOfferId(null);
      setPendingDeleteOffer(null);
      await refresh();
    } catch (err: any) {
      toast.error("Teklif silinemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  const changeQuoteStatus = async (
    offer: Offer,
    body: { statusCode: QuoteWorkflowStatus; followUpAt?: Date | null; note?: string | null }
  ) => {
    try {
      await quoteService.changeStatus(offer.id, body);
      toast.success(
        body.statusCode === "cancelled" ? "Teklif iptal edildi" : "Teklif durumu ve hatırlatma kaydedildi",
        {
          description:
            body.statusCode === "cancelled"
              ? offer.quoteNo
              : `${QUOTE_WORKFLOW_STATUS_LABELS[body.statusCode]} · ${formatDate(body.followUpAt?.toISOString())}`,
        }
      );
      setStatusOffer(null);
      await refresh();
    } catch (err: any) {
      toast.error("Durum güncellenemedi", { description: err?.message ?? "API isteği başarısız oldu." });
    }
  };

  return (
    <div className="crm-page">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="violet" icon={<FileText className="size-[18px]" />} label="Toplam Teklif" value={total} sub="bu çeyrek" />
        <MiniKpi tone="emerald" icon={<CheckCircle2 className="size-[18px]" />} label="Onaylanan" value={approved} sub={`$ ${(approvedAmount / 1000).toFixed(0)}K`} />
        <MiniKpi tone="blue" icon={<Mail className="size-[18px]" />} label="Gönderilen" value={sent} sub="cevap bekleniyor" />
        <MiniKpi tone="amber" icon={<TrendingUp className="size-[18px]" />} label="Kazanma Oranı" value={`%${winRate}`} sub={`hedef %50`} progress={winRate} />
      </div>

      {divisionOptions.length > 0 && (
        <div className="crm-filter-surface flex flex-wrap items-center gap-2">
          <span className="crm-chip-label">İş alanı:</span>
          {[{ id: "all", name: "Tümü" }, ...divisionOptions].map((division) => (
            <button
              key={division.id}
              type="button"
              onClick={() => {
                setDivisionTab(division.id);
                setActiveDivision(division.id);
              }}
              className={`min-h-11 rounded-full border px-3 py-1 text-xs transition-colors sm:min-h-9 ${divisionTab === division.id ? "border-primary bg-primary text-primary-foreground shadow-xs" : "border-border bg-card text-foreground/70 hover:bg-muted"}`}
            >
              {division.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight">Teklif Trendi</CardTitle>
            <p className="text-xs text-muted-foreground">Gönderilen vs onaylanan · son 6 ay</p>
          </CardHeader>
          <CardContent className="h-44 pl-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={offerTrend} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="ay" stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--chart-axis-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--chart-tooltip-border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="gonderilen" name="Gönderilen" fill="var(--brand-blue)" barSize={18} isAnimationActive={false} />
                <Bar dataKey="onaylanan" name="Onaylanan" fill="var(--success)" barSize={18} isAnimationActive={false} />
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
            {rejectionReasons[0] && <div className="rounded-lg border border-destructive/15 bg-destructive-soft/50 p-3"><div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive"><XCircle className="size-3.5" /> En sık ret nedeni</div><div className="mt-1 text-sm font-semibold">{rejectionReasons[0][0]}</div><div className="mt-0.5 text-xs text-muted-foreground">{rejectionReasons[0][1]} satış kartı · takip planına dönüştürün</div></div>}
            {(["Draft", "Sent", "Approved", "Rejected"] as const).map((st) => {
              const items = divisionOffers.filter((o) => o.status === st);
              const pct = total > 0 ? (items.length / total) * 100 : 0;
              const color = st === "Approved" ? "var(--success)" : st === "Sent" ? "var(--info)" : st === "Rejected" ? "var(--destructive)" : "var(--chart-axis-muted)";
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
                <TabsTrigger value="follow-up" className="text-xs">Takip</TabsTrigger>
                <TabsTrigger value="Approved" className="text-xs">Onaylı</TabsTrigger>
                <TabsTrigger value="closed" className="text-xs">Red / İptal</TabsTrigger>
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
              <Input placeholder="Teklif no / kaynak / ürün..." className="h-9 bg-card pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ExportExcelButton path="/exports/quotes" filename="teklifler.xlsx" params={offerExportParams} className="h-9" />
            {hasPermission("files.create") && (
              <DocumentUploadDialog
                defaultType="ExternalQuote"
                trigger={<Button size="sm" variant="outline" className="h-9 gap-1"><Upload className="size-4" /> Dış Teklif Yükle</Button>}
              />
            )}
            <QuoteDialog
              trigger={<Button size="sm" className="h-9 gap-1"><Plus className="size-4" /> Yeni Teklif</Button>}
            />
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Teklif No</TableHead>
                <TableHead>Kaynak</TableHead>
                <TableHead>Ürün Adı</TableHead>
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
                        <OfferSheetPreview offer={o} compact />
                        <div className="text-sm leading-tight truncate">{o.quoteNo}</div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="whitespace-nowrap">{o.businessLine ?? o.divisionName ?? "—"}</Badge></TableCell>
                    <TableCell className="max-w-[260px] text-sm">
                      <div className="truncate">{o.productName || [sc?.requestedProduct, sc?.requestedModel].filter(Boolean).join(" · ") || "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm">{sc ? customerName(sc.customerId, sc.leadCompanyTitle) : customerName(o.companyId ?? "")}</TableCell>
                    <TableCell><span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-xs text-foreground/70">R{o.revision}</span></TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{o.date}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="text-sm">{o.amount.toLocaleString()}</span>{" "}
                      <span className="text-xs text-muted-foreground">{o.currency}</span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <StatusBadge status={o.status} />
                        {o.followUpAt && (
                          <div className="flex items-center gap-1 whitespace-nowrap text-xs text-amber-700">
                            <BellRing className="size-3" /> {formatDate(o.followUpAt)}
                          </div>
                        )}
                      </div>
                    </TableCell>
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
                            <Mail className="size-3.5" /> Gönderildi İşaretle
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
                        {o.status === "Pending Approval" && isSuperAdmin && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 text-xs border-emerald-200 text-emerald-700"
                              onClick={(event) => {
                                event.stopPropagation();
                                void runQuoteAction(o.id, "approve-price");
                              }}
                            >
                              <CheckCircle2 className="size-3.5" /> Fiyat Onay
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 text-xs border-red-200 text-red-600"
                              onClick={(event) => {
                                event.stopPropagation();
                                void runQuoteAction(o.id, "reject-price");
                              }}
                            >
                              <XCircle className="size-3.5" /> Red
                            </Button>
                          </>
                        )}
                        {!["Approved", "Rejected", "Cancelled"].includes(o.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="Durum ve hatırlatma"
                            aria-label="Durum ve hatırlatma"
                            onClick={(event) => {
                              event.stopPropagation();
                              setStatusOffer(o);
                            }}
                          >
                            <BellRing className="size-4 text-amber-600" />
                          </Button>
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
                          className="size-8 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          title="Teklif detayı"
                          aria-label="Teklif detayı"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedOfferId(o.id);
                          }}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          title="Teklifi sil"
                          aria-label="Teklifi sil"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDeleteOffer(o);
                          }}
                        >
                          <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-sm text-muted-foreground">Kayıt bulunamadı.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="tracking-tight">Dış Teklifler</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Firma veya satış kartı özelinde dışarıdan yüklenen teklif dosyaları</p>
          </div>
          <Badge variant="secondary" className="h-6">{externalQuotes.length} dosya</Badge>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Dosya</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead>Satış Kartı</TableHead>
                <TableHead>Bağlantı</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="w-16 text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {externalQuotes.map((documentItem) => {
                const salesCase = documentItem.salesCaseId
                  ? cases.find((item) => item.id === documentItem.salesCaseId)
                  : null;
                const company = customers.find((item) => item.id === (documentItem.companyId || salesCase?.customerId));
                return (
                  <TableRow key={documentItem.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="flex max-w-[320px] items-center gap-2.5 text-left hover:text-primary"
                        onClick={() => void downloadExternalQuote(documentItem.fileId, documentItem.fileName)}
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                          <FileText className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{documentItem.fileName}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{documentItem.size}</span>
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">{company?.name ?? documentItem.companyNameText ?? salesCase?.leadCompanyTitle ?? "Firma bağlantısı yok"}</TableCell>
                    <TableCell className="max-w-[260px] text-sm">
                      <div className="truncate">
                        {salesCase
                          ? [salesCase.requestedProduct, salesCase.requestedModel].filter(Boolean).join(" · ") || `#${salesCase.id.slice(0, 8).toUpperCase()}`
                          : "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{salesCase ? "Kart + firma" : "Firma"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{documentItem.uploadedAt || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="Dış teklifi indir"
                        aria-label={`${documentItem.fileName} dosyasını indir`}
                        onClick={() => void downloadExternalQuote(documentItem.fileId, documentItem.fileName)}
                      >
                        <Download className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {externalQuotes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {q ? "Aramayla eşleşen dış teklif yok." : "Henüz dış teklif yüklenmedi."}
                  </TableCell>
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
        onManageStatus={() => selectedOffer && setStatusOffer(selectedOffer)}
        canApprovePrice={isSuperAdmin}
        onDeleteOffer={async (offer) => setPendingDeleteOffer(offer)}
        onOrderCreated={refresh}
        onOpenOffer={(nextOffer) => setSelectedOfferId(nextOffer.id)}
        onOpenOpportunity={onOpenOpportunity}
        onOpenDocuments={onOpenDocuments}
      />

      <QuoteStatusDialog
        offer={statusOffer}
        onClose={() => setStatusOffer(null)}
        onSave={changeQuoteStatus}
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
                <TableHead>Ürün Adı</TableHead>
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
                        <div className="mt-0.5 text-xs text-muted-foreground">{order.quoteId ? "Teklif bağlantılı" : "Manuel"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{order.company?.shortName || order.company?.legalTitle || "—"}</TableCell>
                  <TableCell className="max-w-[280px] text-sm"><div className="truncate">{order.productName || "—"}</div></TableCell>
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
                  <TableCell colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                    Henüz satış siparişi yok.
                  </TableCell>
                </TableRow>
              )}
              {salesOrdersLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                    Satış siparişleri yükleniyor...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AlertDialog open={!!pendingDeleteOffer} onOpenChange={(open) => !open && setPendingDeleteOffer(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader><AlertDialogTitle>Teklif kaydı silinsin mi?</AlertDialogTitle><AlertDialogDescription><span className="block font-medium text-foreground">{pendingDeleteOffer?.quoteNo} · R{pendingDeleteOffer?.revision}</span>Teklif revizyonu silinir. Bağlı proforma, sözleşme, satış siparişi veya fatura varsa sistem işlemi güvenli biçimde engeller.</AlertDialogDescription></AlertDialogHeader>
          {pendingDeleteOffer && <div className="flex items-center gap-4 rounded-lg border border-destructive/15 bg-destructive-soft/40 p-3"><OfferSheetPreview offer={pendingDeleteOffer} compact /><div><div className="font-display text-lg font-semibold text-destructive">{pendingDeleteOffer.amount.toLocaleString("tr-TR")} {pendingDeleteOffer.currency}</div><div className="mt-1 text-xs text-muted-foreground">{formatDate(pendingDeleteOffer.date)} · {pendingDeleteOffer.status}</div></div></div>}
          <AlertDialogFooter><AlertDialogCancel>Vazgeç</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); if (pendingDeleteOffer) void deleteOffer(pendingDeleteOffer); }}>Teklifi Sil</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  onManageStatus,
  onDeleteOffer,
  onOrderCreated,
  onOpenOffer,
  onOpenOpportunity,
  onOpenDocuments,
  canApprovePrice = false,
}: {
  offer: Offer | null;
  salesCase: SalesCase | null;
  customer: Customer | null;
  assignee: User | null;
  revisions: Offer[];
  order?: any;
  onClose: () => void;
  onQuoteAction?: (offerId: string, action: "send" | "approve" | "reject" | "approve-price" | "reject-price") => Promise<void>;
  onManageStatus?: () => void;
  onDeleteOffer?: (offer: Offer) => Promise<void>;
  onOrderCreated?: () => void;
  onOpenOffer?: (offer: Offer) => void;
  onOpenOpportunity?: (salesCaseId: string) => void;
  onOpenDocuments?: (query?: string) => void;
  canApprovePrice?: boolean;
}) {
  const { products, users, contacts, documents } = useStore();
  const { user, tenant, activeDivision, activeDepartment } = useAuth();
  const queryClient = useQueryClient();
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mailRecipient, setMailRecipient] = useState<MailRecipient | null>(null);
  const [documentAction, setDocumentAction] = useState<"print" | "preview" | "download" | null>(null);
  const [headerLogoMode, setHeaderLogoMode] = useState<QuoteHeaderLogoMode>("haksan");
  const customerId = offer?.companyId || salesCase?.customerId || customer?.id || "";
  const customerQuery = useCompanyDetail(customerId, customer ?? undefined);
  const resolvedCustomer = customerQuery.data ?? customer;
  const contactScope = useMemo<ContactQueryScope>(() => ({
    tenantId: tenant?.id ?? user?.tenantId ?? "anonymous",
    userId: user?.id ?? "anonymous",
    activeDivision,
    activeDepartment,
  }), [activeDepartment, activeDivision, tenant?.id, user?.id, user?.tenantId]);
  useEffect(() => {
    setDocumentAction(null);
    setHeaderLogoMode("haksan");
  }, [offer?.id]);
  if (!offer) return null;

  const productText = offer.productName
    || (salesCase ? [salesCase.requestedProduct, salesCase.requestedModel].filter(Boolean).join(" · ") : "")
    || "Ürün bilgisi yok";
  const relatedDocuments = documents.filter((document) =>
    document.salesCaseId === salesCase?.id || document.quoteId === offer.id
  );
  const openDocumentCenter = (query?: string) => {
    onClose();
    onOpenDocuments?.(query);
  };

  // Teklif yazdırma: ürün kataloğundan model eşleşirse teknik bilgiler ve
  // donanım sayfaları da basılır; alt notlar seçilen teslim şekline göre gelir.
  const loadQuoteDocument = async () => {
    let printCustomer = resolvedCustomer;
    if (customerId && !customerQuery.data) {
      const freshCustomer = await customerQuery.refetch();
      if (freshCustomer.error) throw freshCustomer.error;
      printCustomer = freshCustomer.data ?? printCustomer;
    }
    const companyContacts = customerId
      ? await queryClient.fetchQuery({
          queryKey: contactQueryKeys.companyContacts(contactScope, customerId),
          queryFn: ({ signal }) => loadAllCompanyContacts(customerId, signal),
          staleTime: 60_000,
        })
      : null;
    const remoteContacts = companyContacts?.data ?? [];
    const remoteContactIds = new Set(remoteContacts.map((contact) => contact.id));
    const data = await loadQuotePrintData({
      offer,
      customer: printCustomer,
      salesCase,
      users,
      contacts: [...remoteContacts, ...contacts.filter((contact) => !remoteContactIds.has(contact.id))],
      products,
      headerLogoMode,
    });
    return { data, doc: quoteDoc(data, printAssetBase()) };
  };

  const runQuoteDocument = async (mode: "print" | "preview" | "download") => {
    setDocumentAction(null);
    const loading = toast.loading("Teklif hazırlanıyor…");
    try {
      const { data, doc } = await loadQuoteDocument();
      if (mode === "print") printOrWarn(doc);
      else if (mode === "preview") previewPrintOrWarn(doc);
      // Dosya adı: Teklif_<bölüm-belge no>_<firma>_<makine>
      else downloadPrintOrWarn(doc, quoteFilename(data, {
        division: offer.businessLine ?? offer.divisionCode ?? offer.divisionName,
        company: data.firma || resolvedCustomer?.name,
      }), "Teklif");
    } catch (error: unknown) {
      toast.error("Teklif dosyası hazırlanamadı", {
        description: error instanceof Error ? error.message : "Teklif ayrıntıları alınamadı.",
      });
    } finally {
      toast.dismiss(loading);
    }
  };

  const handlePrint = () => setDocumentAction("print");
  const handlePreview = () => setDocumentAction("preview");
  const handleDownload = () => setDocumentAction("download");
  const documentActionLabel = documentAction === "preview"
    ? "Önizlemeyi Aç"
    : documentAction === "download"
      ? "HTML İndir"
      : "Yazdır / PDF Kaydet";

  return (
    <>
    <Dialog open={!!offer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(900px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[88dvh] grid-rows-[auto_1fr_auto] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <div className="flex items-start gap-3">
            <OfferSheetPreview offer={offer} compact />
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

        <div className="min-h-0 overflow-y-auto">
        <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <OfferStat icon={<Wallet className="size-4" />} label="Tutar" value={formatCurrency(offer.amount, offer.currency)} accent="text-emerald-600" />
          <OfferStat icon={<Receipt className="size-4" />} label="Revizyon" value={`R${offer.revision}`} accent="text-primary" />
          <OfferStat icon={<Calendar className="size-4" />} label="Tarih" value={formatDate(offer.date)} accent="text-blue-600" />
          <OfferStat icon={<ClipboardCheck className="size-4" />} label="Sipariş" value={order?.orderNo ?? "Yok"} accent="text-amber-600" />
        </div>

        <div className="px-6 pb-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="crm-chip-label mb-3">Müşteri</div>
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-lg bg-muted text-primary grid place-items-center shrink-0">
                <Building2 className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{resolvedCustomer?.name ?? salesCase?.leadCompanyTitle ?? "Müşteri bulunamadı"}</div>
                <div className="text-xs text-muted-foreground mt-1">{resolvedCustomer?.city ?? "—"} {resolvedCustomer?.district ? `· ${resolvedCustomer.district}` : ""}</div>
                <div className="text-xs text-muted-foreground mt-1">{resolvedCustomer?.email ?? "E-posta yok"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="crm-chip-label">Satış kartı</div>
              {salesCase && onOpenOpportunity && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { onClose(); onOpenOpportunity(salesCase.id); }}>
                  Kartı aç
                </Button>
              )}
            </div>
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
          <CommercialDocumentRail
            offers={revisions}
            documents={relatedDocuments}
            onOpenOffer={onOpenOffer}
            onOpenDocument={(document) => openDocumentCenter(document.fileName)}
            actions={{
              proforma: (
                <CreateProformaDialog
                  defaultQuoteId={offer.id}
                  onCreated={() => onOrderCreated?.()}
                  trigger={<Button variant="outline" size="sm" className="h-8 px-2 text-xs"><Plus className="mr-1 size-3" /> Oluştur</Button>}
                />
              ),
              contract: (
                <CreateContractDialog
                  defaultQuoteId={offer.id}
                  onCreated={() => onOrderCreated?.()}
                  trigger={<Button variant="outline" size="sm" className="h-8 px-2 text-xs"><Plus className="mr-1 size-3" /> Oluştur</Button>}
                />
              ),
              invoice: salesCase && onOpenOpportunity ? (
                <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => { onClose(); onOpenOpportunity(salesCase.id); }}>
                  Kartta tamamla
                </Button>
              ) : undefined,
            }}
          />
        </div>

        <div className="px-6 pb-5">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
            <div className="crm-chip-label mb-2">Teklif notu</div>
            <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">{offer.note?.trim() || "Not girilmemiş."}</p>
          </div>
        </div>

        {(offer.followUpAt || offer.statusNote) && (
          <div className="px-6 pb-5">
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
                <BellRing className="size-3.5" /> Teklif takibi
              </div>
              {offer.followUpAt && <OfferInfo label="Hatırlatma" value={formatDate(offer.followUpAt)} />}
              {offer.statusNote && <div className="mt-2 whitespace-pre-wrap text-sm text-amber-950/80">{offer.statusNote}</div>}
            </div>
          </div>
        )}

        <div className="px-6 pb-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="crm-chip-label">Revizyon geçmişi</div>
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

        <DialogFooter className="px-6 py-3 border-t border-border/60 bg-muted/20 flex-row flex-wrap items-center justify-end gap-2">
          <QuoteDialog
            offerId={offer.id}
            open={editOpen}
            onOpenChange={(o) => {
              setEditOpen(o);
              if (!o) onOrderCreated?.();
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1">
                <ChevronDown className="size-4" /> Diğer İşlemler
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> Teklifi Düzenle
              </DropdownMenuItem>
              {onManageStatus && !["Approved", "Rejected", "Cancelled"].includes(offer.status) && (
                <DropdownMenuItem onClick={onManageStatus}>
                  <BellRing className="size-4" /> Durum ve Hatırlatma
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handlePrint}>
                <Printer className="size-4" /> Yazdır / PDF Kaydet
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePreview}>
                <Eye className="size-4" /> Önizle
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="size-4" /> HTML İndir
              </DropdownMenuItem>
              {onDeleteOffer && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void onDeleteOffer(offer)}><Trash2 className="size-4" /> Teklifi Sil</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1"
            disabled={!resolvedCustomer}
            title={resolvedCustomer?.email ? `${resolvedCustomer.email} adresine gönder` : "Alıcıyı firma kontaklarından seçebilirsiniz"}
            onClick={() => resolvedCustomer && setMailRecipient({
              email: resolvedCustomer.email ?? "",
              name: resolvedCustomer.contactPerson || resolvedCustomer.name,
              companyId: resolvedCustomer.id,
              subject: `${offer.quoteNo} Fiyat Teklifi`,
              body: `Merhaba ${resolvedCustomer.contactPerson || resolvedCustomer.name},\n\n${offer.quoteNo} numaralı ${productText} fiyat teklifimizi bilgilerinize sunarız.\n\nSaygılarımızla,`,
              quoteId: offer.id,
              attachmentLabel: offer.quoteNo,
            })}
          >
            <Mail className="size-4" /> Firmaya E-posta Gönder
          </Button>
          {offer.status === "Draft" && onQuoteAction && (
            <Button size="sm" className="h-9 gap-1" onClick={() => onQuoteAction(offer.id, "send")}>
              <Mail className="size-4" /> Gönderildi İşaretle
            </Button>
          )}
          {offer.status === "Pending Approval" && canApprovePrice && onQuoteAction && (
            <>
              <Button variant="default" size="sm" className="h-9 gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => onQuoteAction(offer.id, "approve-price")}>
                <CheckCircle2 className="size-4" /> Fiyatı Onayla
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-1 border-red-200 text-red-600" onClick={() => onQuoteAction(offer.id, "reject-price")}>
                <XCircle className="size-4" /> Fiyatı Reddet
              </Button>
            </>
          )}
          {offer.status === "Approved" && (
            <CreateAccountingInvoiceDialog
              prefill={invoicePrefillFromOffer(offer, resolvedCustomer, order)}
              onCreated={onOrderCreated}
              trigger={
                <Button variant="outline" size="sm" className="h-9 gap-1">
                  <Receipt className="size-4" /> Muhasebe Faturası
                </Button>
              }
            />
          )}
          {offer.status === "Approved" && !order && (
            <Button
              variant="default"
              size="sm"
              className="h-9 gap-1"
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
          {(offer.status === "Sent" || FOLLOW_UP_OFFER_STATUSES.includes(offer.status)) && onQuoteAction && (
            <>
              <Button variant="default" size="sm" className="h-9 gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => onQuoteAction(offer.id, "approve")}>
                <CheckCircle2 className="size-4" /> Onayla
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-1 border-red-200 text-red-600" onClick={() => onQuoteAction(offer.id, "reject")}>
                <XCircle className="size-4" /> Reddet
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" className="h-9 ml-auto sm:ml-2" onClick={onClose}>Kapat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={documentAction !== null} onOpenChange={(open) => !open && setDocumentAction(null)}>
      <DialogContent className="w-[min(680px,calc(100vw-2rem))] max-w-none overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border/60 [background:var(--gradient-brand)] px-6 py-5 text-white">
          <DialogTitle className="flex items-center gap-2 text-white">
            <ImageIcon className="size-5 text-sky-300" /> PDF logosunu seçin
          </DialogTitle>
          <DialogDescription className="text-slate-300">
            Seçtiğiniz logo teklifin her sayfasındaki üst alanda kullanılır.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <RadioGroup
            value={headerLogoMode}
            onValueChange={(value) => setHeaderLogoMode(value as QuoteHeaderLogoMode)}
            className="grid gap-3 md:grid-cols-3"
          >
            <Label
              htmlFor="quote-logo-haksan"
              className={`group flex min-h-36 cursor-pointer flex-col rounded-xl border p-3.5 transition-colors ${
                headerLogoMode === "haksan"
                  ? "border-primary bg-primary/5 ring-2 ring-primary/15"
                  : "border-border/70 bg-card hover:border-primary/35"
              }`}
            >
              <span className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">HAKSAN anteti</span>
                <RadioGroupItem id="quote-logo-haksan" value="haksan" />
              </span>
              <span className="flex min-h-16 flex-1 items-center rounded-lg border border-border/60 bg-card p-2">
                <img
                  src={`${printAssetBase()}/haksan-letterhead.jpg`}
                  alt="HAKSAN anteti"
                  className="h-auto w-full object-contain"
                />
              </span>
              <span className="mt-2 text-xs leading-4 text-muted-foreground">Standart kurumsal antet</span>
            </Label>

            <Label
              htmlFor="quote-logo-company"
              aria-disabled={!resolvedCustomer?.logoUrl}
              className={`group flex min-h-36 flex-col rounded-xl border p-3.5 transition-colors ${
                !resolvedCustomer?.logoUrl
                  ? "cursor-not-allowed border-border/50 bg-muted/30 opacity-60"
                  : headerLogoMode === "company"
                    ? "cursor-pointer border-primary bg-primary/5 ring-2 ring-primary/15"
                    : "cursor-pointer border-border/70 bg-card hover:border-primary/35"
              }`}
            >
              <span className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Firma logosu</span>
                <RadioGroupItem id="quote-logo-company" value="company" disabled={!resolvedCustomer?.logoUrl} />
              </span>
              <span className="flex min-h-16 flex-1 items-center justify-center rounded-lg border border-border/60 bg-card p-2">
                {resolvedCustomer?.logoUrl ? (
                  <img src={resolvedCustomer.logoUrl} alt={`${resolvedCustomer.name} logosu`} className="max-h-14 max-w-full object-contain" />
                ) : (
                  <ImageOff className="size-7 text-muted-foreground/55" />
                )}
              </span>
              <span className="mt-2 text-xs leading-4 text-muted-foreground">
                {resolvedCustomer?.logoUrl ? resolvedCustomer.name : "Firma kartına önce logo yükleyin"}
              </span>
            </Label>

            <Label
              htmlFor="quote-logo-none"
              className={`group flex min-h-36 cursor-pointer flex-col rounded-xl border p-3.5 transition-colors ${
                headerLogoMode === "none"
                  ? "border-primary bg-primary/5 ring-2 ring-primary/15"
                  : "border-border/70 bg-card hover:border-primary/35"
              }`}
            >
              <span className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Logosuz</span>
                <RadioGroupItem id="quote-logo-none" value="none" />
              </span>
              <span className="flex min-h-16 flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
                <ImageOff className="size-7 text-muted-foreground/55" />
              </span>
              <span className="mt-2 text-xs leading-4 text-muted-foreground">Sade üst boşluk</span>
            </Label>
          </RadioGroup>

          <p className="text-xs leading-5 text-muted-foreground">
            Ürün marka logosu, örneğin HAXAN, makinenin ürün sayfasında ayrıca görünmeye devam eder.
          </p>
        </div>

        <DialogFooter className="border-t border-border/60 bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => setDocumentAction(null)}>Vazgeç</Button>
          <Button className="gap-2" onClick={() => documentAction && void runQuoteDocument(documentAction)}>
            {documentAction === "preview"
              ? <Eye className="size-4" />
              : documentAction === "download"
                ? <Download className="size-4" />
                : <Printer className="size-4" />}
            {documentActionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ComposeMailDialog
      recipient={mailRecipient}
      onOpenChange={(open) => !open && setMailRecipient(null)}
      onSent={async () => {
        if (offer.status === "Draft" && onQuoteAction) await onQuoteAction(offer.id, "send");
      }}
    />
    </>
  );
}

function QuoteStatusDialog({
  offer,
  onClose,
  onSave,
}: {
  offer: Offer | null;
  onClose: () => void;
  onSave: (
    offer: Offer,
    body: { statusCode: QuoteWorkflowStatus; followUpAt?: Date | null; note?: string | null }
  ) => Promise<void>;
}) {
  const [statusCode, setStatusCode] = useState<QuoteWorkflowStatus>("budget_waiting");
  const [followUpAt, setFollowUpAt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!offer) return;
    const statusByLabel: Partial<Record<Offer["status"], QuoteWorkflowStatus>> = {
      Cancelled: "cancelled",
      "Price Waiting": "price_waiting",
      "Budget Waiting": "budget_waiting",
      "On Hold": "on_hold",
      Postponed: "postponed",
    };
    setStatusCode(statusByLabel[offer.status] ?? "budget_waiting");
    const next = offer.followUpAt ? new Date(offer.followUpAt) : new Date();
    if (!offer.followUpAt) {
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
    }
    const local = new Date(next.getTime() - next.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    setFollowUpAt(local);
    setNote(offer.statusNote ?? "");
  }, [offer]);

  const isCancelled = statusCode === "cancelled";

  const submit = async () => {
    if (!offer) return;
    if (!isCancelled && !followUpAt) {
      toast.error("Hatırlatma tarihi seçin");
      return;
    }
    setSaving(true);
    try {
      await onSave(offer, {
        statusCode,
        followUpAt: isCancelled ? null : new Date(followUpAt),
        note: note.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!offer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Durum ve Hatırlatma</DialogTitle>
          <DialogDescription>
            {offer?.quoteNo} için bekleme nedenini seçin. Takip tarihi satış aktivitelerine hatırlatma olarak eklenir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="quote-workflow-status">Teklif durumu</Label>
            <Select value={statusCode} onValueChange={(value) => setStatusCode(value as QuoteWorkflowStatus)}>
              <SelectTrigger id="quote-workflow-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(QUOTE_WORKFLOW_STATUS_LABELS) as Array<[QuoteWorkflowStatus, string]>).map(([code, label]) => (
                  <SelectItem key={code} value={code}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isCancelled && (
            <div className="space-y-1.5">
              <Label htmlFor="quote-follow-up">Hatırlatma tarihi</Label>
              <Input
                id="quote-follow-up"
                type="datetime-local"
                value={followUpAt}
                onChange={(event) => setFollowUpAt(event.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="quote-status-note">Not</Label>
            <Textarea
              id="quote-status-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder={isCancelled ? "İptal nedenini yazın…" : "Bir sonraki görüşmede hatırlanacak bilgiyi yazın…"}
            />
          </div>
          {isCancelled && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              İptal edilen teklif sonuçlanmış sayılır; tekrar onaylanamaz veya düzenlenemez.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Vazgeç</Button>
          <Button
            onClick={() => void submit()}
            disabled={saving}
            className={isCancelled ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {saving ? "Kaydediliyor…" : isCancelled ? "Teklifi İptal Et" : "Durumu Kaydet"}
          </Button>
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
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
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
