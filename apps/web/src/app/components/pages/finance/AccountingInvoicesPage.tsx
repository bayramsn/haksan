import { useEffect, useState, type MouseEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "../../ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import { financeService } from "../../../../lib/services";
import { CreateAccountingInvoiceDialog } from "./CreateAccountingInvoiceDialog";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Building2, CalendarClock, Clock3, Layers, Pencil, Plus, Receipt, Search, Trash2 } from "lucide-react";
import { MiniKpi } from "../../shared/MiniKpi";
import { EmptyState } from "../../shared/EmptyState";

type InvoiceCategory = "commercial" | "administrative";

type InvoiceRow = {
  id: string;
  type: "sales" | "purchase";
  invoiceCategory?: InvoiceCategory;
  invoiceNo: string;
  invoiceDate: string;
  grandTotal: string;
  installmentCount: number;
  firstDueDate: string | null;
  lastDueDate: string | null;
  company?: { id: string; legalTitle?: string; shortName?: string | null };
  currency?: { code?: string };
};

type InvoiceDetail = InvoiceRow & {
  amount?: string;
  vatAmount?: string;
  notes?: string | null;
  paymentType?: "cash" | "leasing" | "term" | null;
  paymentTermDays?: number | null;
  previousPaymentTermDays?: number | null;
  termChangeReason?: string | null;
  incoterm?: string | null;
  shipmentReference?: string | null;
  orderNo?: string | null;
  expectedDate?: string | null;
  company?: InvoiceRow["company"] & {
    taxOffice?: string | null;
    taxNumber?: string | null;
  };
  installments?: Array<{
    id: string;
    installmentNo: number;
    dueDate: string;
    amount: string;
  }>;
  lineItems?: Array<{
    id: string;
    productModelId?: string | null;
    inventoryItemId?: string | null;
    categoryCode?: string | null;
    description?: string | null;
    quantity?: string | number;
    listPrice?: string | number | null;
    unitPrice?: string | number | null;
    discountAmount?: string | number | null;
    vatRate?: string | number | null;
    lineTotal?: string | number | null;
    expectedDate?: string | null;
  }>;
};

function companyName(company?: InvoiceDetail["company"]): string {
  return company?.shortName || company?.legalTitle || "Firma bilgisi yok";
}

const invoiceCategoryLabel = (category?: string) => (category === "administrative" ? "İdari" : "Ticari");
const paymentTypeLabel = (value?: string | null) => {
  if (value === "leasing") return "Leasing";
  if (value === "term") return "Vadeli";
  return "Peşin";
};

function dueState(invoice: Pick<InvoiceRow, "firstDueDate" | "installmentCount">) {
  if (!invoice.firstDueDate) return { label: "Vade yok", tone: "neutral" as const, detail: "Peşin / tanımsız" };
  const due = new Date(invoice.firstDueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)} gün gecikmiş`, tone: "danger" as const, detail: "Takip gerekli" };
  if (days === 0) return { label: "Bugün vadeli", tone: "warning" as const, detail: "Gün içi aksiyon" };
  if (days <= 7) return { label: `${days} gün kaldı`, tone: "warning" as const, detail: "Yaklaşan vade" };
  return { label: `${days} gün kaldı`, tone: "success" as const, detail: invoice.installmentCount > 1 ? "Taksit planı" : "Planlı" };
}

function InvoiceSheet({ invoice, compact = false }: { invoice: InvoiceRow; compact?: boolean }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-md border border-primary/10 bg-white shadow-xs ${compact ? "h-12 w-9" : "h-40 w-28"}`} aria-hidden="true">
      <div className="h-1.5 bg-primary" />
      <div className={compact ? "space-y-1 p-1" : "space-y-2 p-3"}>
        <div className="flex items-center justify-between gap-1">
          <span className={`${compact ? "text-[5px]" : "text-[8px]"} font-bold uppercase tracking-wider text-primary`}>Fatura</span>
          {!compact && <span className="font-data text-[7px] text-muted-foreground">{invoice.invoiceNo}</span>}
        </div>
        <div className="h-px bg-border" />
        {[78, 58, 88, 66].map((width) => <div key={width} className="h-0.5 rounded-full bg-slate-200" style={{ width: `${width}%` }} />)}
        {!compact && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-1">
              <span className="h-5 rounded-sm bg-brand-blue-soft" />
              <span className="h-5 rounded-sm bg-muted" />
              <span className="h-5 rounded-sm bg-muted" />
            </div>
            <div className="absolute inset-x-3 bottom-3 border-t border-border pt-2 text-right font-data text-[9px] font-bold text-primary">
              {Number(invoice.grandTotal).toLocaleString("tr-TR")} {invoice.currency?.code ?? ""}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function invoicePrefill(invoice: InvoiceDetail) {
  const amount = Number(invoice.amount ?? invoice.grandTotal ?? 0);
  const vatAmount = Number(invoice.vatAmount ?? 0);
  return {
    companyId: invoice.company?.id ?? "",
    type: invoice.type,
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    amount,
    vatAmount,
    grandTotal: Number(invoice.grandTotal ?? 0),
    vatRate: amount > 0 ? Math.round((vatAmount / amount) * 10000) / 100 : 0,
    currencyCode: invoice.currency?.code ?? "USD",
    invoiceCategory: invoice.invoiceCategory ?? "commercial",
    paymentType: invoice.paymentType ?? undefined,
    paymentTermDays: invoice.paymentTermDays,
    previousPaymentTermDays: invoice.previousPaymentTermDays,
    termChangeReason: invoice.termChangeReason,
    incoterm: invoice.incoterm,
    shipmentReference: invoice.shipmentReference,
    orderNo: invoice.orderNo,
    expectedDate: invoice.expectedDate,
    firstDueDate: invoice.firstDueDate ?? invoice.invoiceDate,
    lastDueDate: invoice.lastDueDate,
    installmentCount: invoice.installmentCount,
    installments: invoice.installments?.map((i) => ({
      installmentNo: i.installmentNo,
      dueDate: i.dueDate?.slice(0, 10),
      amount: String(i.amount),
    })),
    notes: invoice.notes ?? "",
  };
}

export function AccountingInvoicesPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<InvoiceCategory>("commercial");
  const [typeFilter, setTypeFilter] = useState<"all" | "sales" | "purchase">("sales");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InvoiceRow | null>(null);

  const load = () => {
    setLoading(true);
    financeService
      .accountingInvoices({
        page: 1,
        pageSize: 200,
        invoiceCategory: categoryFilter,
        ...(typeFilter !== "all" ? { type: typeFilter } : {}),
      })
      .then((res) => setRows(res?.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [categoryFilter, typeFilter]);

  const filtered = rows.filter((r) => {
    const name = r.company?.shortName || r.company?.legalTitle || "";
    return (
      r.invoiceNo.toLowerCase().includes(q.toLowerCase()) ||
      name.toLowerCase().includes(q.toLowerCase())
    );
  });

  // Para birimine göre toplam tutarlar (farklı dövizler ayrı satır olarak gösterilir).
  const totalsByCurrency = filtered.reduce<Record<string, number>>((acc, r) => {
    const code = r.currency?.code ?? "—";
    acc[code] = (acc[code] ?? 0) + Number(r.grandTotal || 0);
    return acc;
  }, {});
  const totalsSummary = Object.entries(totalsByCurrency)
    .map(([code, amount]) => `${amount.toLocaleString("tr-TR")} ${code}`)
    .join(" · ");

  const openDetail = async (row: InvoiceRow) => {
    setDetail(row);
    try {
      const data = await financeService.accountingInvoice(row.id);
      setDetail({ ...row, ...data, company: data.company ?? row.company, currency: data.currency ?? row.currency });
    } catch {
      setDetail(row);
    }
  };

  const requestDeleteInvoice = (row: InvoiceRow, event?: MouseEvent) => {
    event?.stopPropagation();
    setPendingDelete(row);
  };

  const deleteInvoice = async (row: InvoiceRow) => {
    setDeletingId(row.id);
    try {
      await financeService.deleteAccountingInvoice(row.id);
      toast.success("Fatura silindi");
      if (detail?.id === row.id) setDetail(null);
      setPendingDelete(null);
      load();
    } catch (err: any) {
      toast.error("Fatura silinemedi", { description: err?.message ?? "Aktif ödeme veya yetki kontrolü nedeniyle işlem tamamlanamadı." });
    } finally {
      setDeletingId(null);
    }
  };

  const installmentedCount = filtered.filter((r) => r.installmentCount > 1).length;
  const companyCount = new Set(filtered.map((r) => r.company?.id).filter(Boolean)).size;
  const [primaryTotal, ...otherTotals] = Object.entries(totalsByCurrency)
    .sort(([, a], [, b]) => b - a)
    .map(([code, amount]) => `${amount.toLocaleString("tr-TR")} ${code}`);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKpi tone="violet" icon={<Receipt className="size-[18px]" />} label="Fatura" value={filtered.length} sub={invoiceCategoryLabel(categoryFilter).toLocaleLowerCase("tr-TR")} />
        <MiniKpi tone="emerald" icon={<ArrowUpRight className="size-[18px]" />} label="Toplam Tutar" value={primaryTotal ?? "—"} sub={otherTotals.join(" · ") || undefined} />
        <MiniKpi tone="amber" icon={<Layers className="size-[18px]" />} label="Taksitli" value={installmentedCount} sub="vade planlı" />
        <MiniKpi tone="blue" icon={<Building2 className="size-[18px]" />} label="Firma" value={companyCount} sub="farklı cari" />
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="tracking-tight flex items-center gap-2">
              <Receipt className="size-5" /> Muhasebe Faturaları
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Satış ve alış faturaları · vade planı ve cari hareketler</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Fatura no veya firma..." className="pl-9 h-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <CreateAccountingInvoiceDialog
              onCreated={load}
              trigger={
                <Button size="sm" className="h-9 gap-1">
                  <Plus className="size-4" /> Yeni Fatura
                </Button>
              }
            />
            <Button size="sm" variant="outline" className="h-9" onClick={load}>Yenile</Button>
          </div>
        </CardHeader>
        <div className="flex flex-col gap-2 px-6 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as InvoiceCategory)}>
              <TabsList className="h-9 bg-muted/60">
                <TabsTrigger value="commercial" className="gap-1.5">
                  <Receipt className="size-4" /> Ticari
                </TabsTrigger>
                <TabsTrigger value="administrative" className="gap-1.5">
                  <Building2 className="size-4" /> İdari
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <TabsList className="h-9 bg-muted/60">
                <TabsTrigger value="sales" className="gap-1.5">
                  <ArrowUpRight className="size-4" /> Satış
                </TabsTrigger>
                <TabsTrigger value="purchase" className="gap-1.5">
                  <ArrowDownLeft className="size-4" /> Alış
                </TabsTrigger>
                <TabsTrigger value="all" className="gap-1.5">
                  <Layers className="size-4" /> Tümü
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {!loading && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{filtered.length}</span> fatura
              {totalsSummary && (
                <>
                  {" · "}
                  <span className="font-medium text-foreground tabular-nums">{totalsSummary}</span>
                </>
              )}
            </div>
          )}
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground">
                  <TableHead>Belge / Fatura No</TableHead>
                {typeFilter === "all" && <TableHead>Tür</TableHead>}
                <TableHead>Sınıf</TableHead>
                <TableHead>{typeFilter === "purchase" ? "Tedarikçi" : typeFilter === "sales" ? "Müşteri" : "Firma"}</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead>Taksit</TableHead>
                  <TableHead>Vade / Aging</TableHead>
                <TableHead className="w-12 text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={typeFilter === "all" ? 9 : 8} className="text-center py-10 text-muted-foreground">Yükleniyor…</TableCell></TableRow>
              )}
              {!loading && filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-primary/[0.025]" onClick={() => openDetail(r)}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <InvoiceSheet invoice={r} compact />
                      <div className="min-w-0">
                        <div className="font-medium tabular-nums">{r.invoiceNo}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">{r.type === "sales" ? "Satış belgesi" : "Alış belgesi"}</div>
                      </div>
                    </div>
                  </TableCell>
                  {typeFilter === "all" && (
                    <TableCell>
                      <Badge variant="outline" className={r.type === "sales" ? "text-success border-success/20 bg-success-soft" : "text-info border-info/20 bg-info-soft"}>
                        {r.type === "sales" ? "Satış" : "Alış"}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant="secondary" className="h-6 text-[11px]">
                      {invoiceCategoryLabel(r.invoiceCategory)}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.company?.shortName || r.company?.legalTitle || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(r.invoiceDate).toLocaleDateString("tr-TR")}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {Number(r.grandTotal).toLocaleString("tr-TR")} {r.currency?.code ?? ""}
                  </TableCell>
                  <TableCell className="text-sm">{r.installmentCount}</TableCell>
                  <TableCell className="text-xs">
                    {(() => {
                      const state = dueState(r);
                      const tone = state.tone === "danger" ? "border-destructive/20 bg-destructive-soft text-destructive" : state.tone === "warning" ? "border-warning/20 bg-warning-soft text-warning" : state.tone === "success" ? "border-success/20 bg-success-soft text-success" : "border-border bg-muted text-muted-foreground";
                      return (
                        <div>
                          <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${tone}`}>{state.label}</Badge>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {r.firstDueDate ? new Date(r.firstDueDate).toLocaleDateString("tr-TR") : "Vade tanımlı değil"}
                            {r.lastDueDate && r.installmentCount > 1 ? ` – ${new Date(r.lastDueDate).toLocaleDateString("tr-TR")}` : ""}
                          </div>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      title="Faturayı sil"
                      disabled={deletingId === r.id}
                      onClick={(event) => requestDeleteInvoice(r, event)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={typeFilter === "all" ? 9 : 8} className="py-4">
                    <EmptyState
                      scene="documents"
                      title="Fatura bulunamadı"
                      description="Arama terimini veya tür/sınıf sekmelerini değiştirerek tekrar deneyin."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fatura {detail?.invoiceNo}</DialogTitle>
            <DialogDescription className="sr-only">
              Fatura özeti, firma bilgisi ve taksit planı
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-4 rounded-xl border border-primary/10 bg-gradient-to-br from-brand-blue-soft/70 via-white to-white p-4 sm:grid-cols-[auto_1fr]">
                <InvoiceSheet invoice={detail} />
                <div className="min-w-0 space-y-3">
              <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Building2 className="size-3.5" />
                  {detail.type === "sales" ? "Müşteri / Firma" : "Tedarikçi / Firma"}
                </div>
                <div className="text-base font-semibold leading-snug">{companyName(detail.company)}</div>
                {detail.company?.legalTitle && detail.company.shortName && detail.company.legalTitle !== detail.company.shortName && (
                  <div className="mt-0.5 text-xs text-muted-foreground">{detail.company.legalTitle}</div>
                )}
                {(detail.company?.taxOffice || detail.company?.taxNumber) && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {detail.company.taxOffice ? `${detail.company.taxOffice} ` : ""}
                    {detail.company.taxNumber ? `Vergi No: ${detail.company.taxNumber}` : ""}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-white/80 p-3">
                <div><span className="text-muted-foreground">Tür:</span> {detail.type === "sales" ? "Satış" : "Alış"}</div>
                <div><span className="text-muted-foreground">Sınıf:</span> {invoiceCategoryLabel(detail.invoiceCategory)}</div>
                <div><span className="text-muted-foreground">Tarih:</span> {new Date(detail.invoiceDate).toLocaleDateString("tr-TR")}</div>
                <div><span className="text-muted-foreground">Matrah:</span> {Number(detail.amount ?? 0).toLocaleString("tr-TR")} {detail.currency?.code ?? ""}</div>
                <div><span className="text-muted-foreground">KDV:</span> {Number(detail.vatAmount ?? 0).toLocaleString("tr-TR")} {detail.currency?.code ?? ""}</div>
                <div><span className="text-muted-foreground">Toplam:</span> {Number(detail.grandTotal).toLocaleString("tr-TR")} {detail.currency?.code ?? ""}</div>
                <div><span className="text-muted-foreground">Taksit:</span> {detail.installmentCount}</div>
                <div><span className="text-muted-foreground">Ödeme Tipi:</span> {paymentTypeLabel(detail.paymentType)}</div>
                {detail.paymentTermDays != null && detail.paymentTermDays > 0 && (
                  <div><span className="text-muted-foreground">Vade:</span> {detail.paymentTermDays} gün</div>
                )}
                {detail.orderNo && <div><span className="text-muted-foreground">Sipariş No:</span> {detail.orderNo}</div>}
                {detail.incoterm && <div><span className="text-muted-foreground">Incoterm:</span> {detail.incoterm}</div>}
                {detail.shipmentReference && <div><span className="text-muted-foreground">Referans:</span> {detail.shipmentReference}</div>}
                {detail.expectedDate && (
                  <div><span className="text-muted-foreground">Beklenen:</span> {new Date(detail.expectedDate).toLocaleDateString("tr-TR")}</div>
                )}
                {detail.termChangeReason && (
                  <div className="col-span-2"><span className="text-muted-foreground">Vade Notu:</span> {detail.termChangeReason}</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><CalendarClock className="size-3.5" /> Vade durumu</div>
                  <div className="mt-1 font-semibold">{dueState(detail).label}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{dueState(detail).detail}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><Clock3 className="size-3.5" /> Vade planı</div>
                  <div className="mt-1 font-semibold">{detail.installmentCount} ödeme adımı</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{detail.firstDueDate ? new Date(detail.firstDueDate).toLocaleDateString("tr-TR") : "Tarih tanımlı değil"}</div>
                </div>
              </div>
                </div>
              </div>
              {(detail.installments?.length ?? 0) > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Vade</TableHead>
                      <TableHead className="text-right">Tutar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.installments?.map((i: any) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.installmentNo}</TableCell>
                        <TableCell>{new Date(i.dueDate).toLocaleDateString("tr-TR")}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(i.amount).toLocaleString("tr-TR")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {(detail.lineItems?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <div className="bg-muted/30 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Fatura Kalemleri</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kalem</TableHead>
                        <TableHead className="text-right">Adet</TableHead>
                        <TableHead className="text-right">Birim</TableHead>
                        <TableHead className="text-right">Toplam</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.lineItems?.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>
                            <div className="text-sm">{line.description || line.categoryCode || "Kalem"}</div>
                            {line.expectedDate && <div className="text-[11px] text-muted-foreground">ETA {new Date(line.expectedDate).toLocaleDateString("tr-TR")}</div>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{Number(line.quantity ?? 1).toLocaleString("tr-TR")}</TableCell>
                          <TableCell className="text-right tabular-nums">{line.unitPrice ? Number(line.unitPrice).toLocaleString("tr-TR") : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{line.lineTotal ? Number(line.lineTotal).toLocaleString("tr-TR") : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="sticky bottom-0 -mx-1 flex flex-col gap-3 rounded-xl border border-primary/10 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Belge toplamı</div>
                  <div className="font-display text-xl font-semibold tabular-nums text-primary">{Number(detail.grandTotal).toLocaleString("tr-TR")} {detail.currency?.code ?? ""}</div>
                </div>
                <div className="flex justify-end gap-2">
                <CreateAccountingInvoiceDialog
                  invoiceId={detail.id}
                  prefill={invoicePrefill(detail)}
                  onSaved={() => {
                    load();
                    setDetail(null);
                  }}
                  trigger={
                    <Button variant="outline" className="gap-1">
                      <Pencil className="size-4" /> Düzenle
                    </Button>
                  }
                />
                <Button
                  variant="outline"
                  className="gap-1 text-destructive hover:bg-brand-red-soft hover:text-destructive"
                  disabled={deletingId === detail.id}
                  onClick={() => requestDeleteInvoice(detail)}
                >
                  <Trash2 className="size-4" /> Sil
                </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && !deletingId && setPendingDelete(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Fatura arşivlensin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block font-medium text-foreground">{pendingDelete?.invoiceNo} · {pendingDelete ? companyName(pendingDelete.company) : ""}</span>
              Bu belge listeden kaldırılır. Aktif ödeme veya cari hareket bağlantısı varsa sistem işlemi güvenli biçimde engeller.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDelete && (
            <div className="rounded-lg border border-destructive/15 bg-destructive-soft/60 p-3 text-sm">
              <div className="font-medium text-destructive">{Number(pendingDelete.grandTotal).toLocaleString("tr-TR")} {pendingDelete.currency?.code ?? ""}</div>
              <div className="mt-1 text-xs text-muted-foreground">{new Date(pendingDelete.invoiceDate).toLocaleDateString("tr-TR")} tarihli {pendingDelete.type === "sales" ? "satış" : "alış"} faturası</div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={!!deletingId} onClick={(event) => { event.preventDefault(); if (pendingDelete) void deleteInvoice(pendingDelete); }}>
              {deletingId ? "Arşivleniyor…" : "Faturayı Arşivle"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
