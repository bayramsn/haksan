import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ArrowLeft, Plus, Upload, X, XCircle, Eye, FileText, CreditCard, CheckCircle2 } from "lucide-react";
import { SalesCase, SALES_STAGES, salesStageLabel, type Offer } from "../../lib/mock";
import { StatusBadge } from "../Layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useStore } from "../../lib/store";
import { AddActivityDialog } from "../dialogs/CreateDialogs";
import { QuoteDialog } from "../dialogs/QuoteDialog";
import { LostCaseDialog } from "../dialogs/LostCaseDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { DocumentUploadDialog } from "../dialogs/DocumentUploadDialog";
import { OfferDetailDialog } from "./offers/OffersPage";
import { fileService, quoteService, salesOrderService, financeService } from "../../../lib/services";
import { toast } from "sonner";

export function SalesCaseDetailDialog({
  sc,
  onClose,
}: {
  sc: SalesCase | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!sc} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(1120px,calc(100vw-2rem))] max-w-none sm:max-w-none max-h-[90dvh] overflow-hidden p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{sc?.requestedProduct ?? "Satış kartı detayı"}</DialogTitle>
          <DialogDescription>Satış kartı, teklifler ve aktiviteler</DialogDescription>
        </DialogHeader>
        {sc && <SalesCaseDetailPage sc={sc} onBack={onClose} mode="dialog" />}
      </DialogContent>
    </Dialog>
  );
}

export function SalesCaseDetailPage({
  sc,
  onBack,
  mode = "page",
}: {
  sc: SalesCase;
  onBack: () => void;
  mode?: "page" | "dialog";
}) {
  const { offers, activities, customers, users, documents, payments, refresh } = useStore();
  const [lostOpen, setLostOpen] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const canMarkLost = !sc.isLost && sc.stage !== "cancelled" && sc.stage !== "delivered";
  const c = customers.find((x) => x.id === sc.customerId);
  const u = users.find((x) => x.id === sc.assignedUserId);
  const acts = activities.filter((a) => a.salesCaseId === sc.id);
  const offs = offers.filter((o) => o.salesCaseId === sc.id);
  const docs = documents.filter((d) => d.salesCaseId === sc.id);
  const pays = payments.filter((p) => p.salesCaseId === sc.id);
  // Kart "Sözleşme" aşamasına ulaştıysa ticari fatura yükleme alanını aç.
  const reachedContract = SALES_STAGES.indexOf(sc.stage) >= SALES_STAGES.indexOf("contract");
  const reachedPaymentPlan = SALES_STAGES.indexOf(sc.stage) >= SALES_STAGES.indexOf("payment_plan");
  const commercialInvoiceDoc = docs.find((d) => d.type === "CommercialInvoice");
  const selectedOffer = selectedOfferId ? offers.find((o) => o.id === selectedOfferId) ?? null : null;
  const selectedRevisions = selectedOffer
    ? offs.filter((o) => o.salesCaseId === sc.id).sort((a, b) => b.revision - a.revision)
    : [];
  const selectedOrder = selectedOffer
    ? salesOrders.find((order) => order.quoteId === selectedOffer.id || order.quote?.id === selectedOffer.id)
    : null;

  useEffect(() => {
    if (!selectedOfferId) return;
    let cancelled = false;
    salesOrderService
      .list({ pageSize: 50 })
      .then((res) => {
        if (!cancelled) setSalesOrders(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setSalesOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOfferId]);

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

  const downloadDocument = async (fileId: string | undefined, fileName: string) => {
    if (!fileId) {
      toast.message("Dosya bağlantısı yok", { description: "Bu kayıt yalnızca meta veri içeriyor." });
      return;
    }
    try {
      const signed = await fileService.signedDownload(fileId);
      const a = document.createElement("a");
      a.href = signed.downloadUrl;
      a.download = signed.filename || fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      toast.error("Doküman indirilemedi", { description: err?.message ?? "İstek başarısız oldu." });
    }
  };
  const rootClass = mode === "dialog" ? "flex max-h-[90dvh] min-h-0 flex-col overflow-hidden" : "space-y-4";
  const toolbarClass =
    mode === "dialog"
      ? "flex items-center justify-between gap-2 border-b border-border/60 px-5 py-4 pr-12"
      : "flex items-center justify-between gap-2";
  const bodyClass = mode === "dialog" ? "min-h-0 overflow-y-auto px-5 py-4 space-y-4" : "space-y-4";

  return (
    <div className={rootClass}>
      <div className={toolbarClass}>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          {mode === "dialog" ? <X className="size-4" /> : <ArrowLeft className="size-4" />}
          {mode === "dialog" ? "Kapat" : "Listeye dön"}
        </Button>
        {canMarkLost && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLostOpen(true)}
            className="gap-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            <XCircle className="size-4" /> Kaybedildi olarak işaretle
          </Button>
        )}
      </div>

      <LostCaseDialog open={lostOpen} onOpenChange={setLostOpen} caseId={sc.id} caseName={c?.name} />

      <div className={bodyClass}>
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">SATIŞ KARTI · #{sc.id.toUpperCase()}</div>
              <div className="text-xl mt-1 break-words">{c?.name ?? "Firma bulunamadı"}</div>
              <div className="text-sm text-muted-foreground mt-0.5 break-words">{sc.requestedProduct} · {sc.requestedModel} · {sc.quantity} adet</div>
            </div>
            <div className="shrink-0 text-left lg:text-right">
              <div className="text-2xl tabular-nums">{sc.estimatedAmount.toLocaleString()} {sc.currency}</div>
              <div className="mt-2"><StatusBadge status={sc.stage} /></div>
              <div className="text-xs text-muted-foreground mt-1">Atanan: {u?.name ?? "Atanmadı"}</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-1">
            {SALES_STAGES.filter((s) => s !== "cancelled").map((s, i) => {
              const idx = SALES_STAGES.indexOf(sc.stage);
              const reached = i <= idx;
              return (
                <div
                  key={s}
                  className={`px-2 py-1 text-xs rounded ${reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {salesStageLabel(s)}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {sc.stage === "payment_plan" && pays.length === 0 && (
        <Card className="border-emerald-300/70 bg-emerald-50/50">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div className="size-10 rounded-lg bg-emerald-100 text-emerald-700 grid place-items-center shrink-0">
                  <CreditCard className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">Ödeme Planı Gerekli</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Kart şu anda Ödeme Planı aşamasında. İlerlemek için lütfen ödeme planını oluşturun.
                  </div>
                </div>
              </div>
              <div>
                <CreatePaymentPlanDialog
                  sc={sc}
                  offs={offs}
                  c={c ?? null}
                  onCreated={refresh}
                  trigger={
                    <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Plus className="size-4" /> Ödeme Planı Oluştur
                    </Button>
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {reachedContract && (
        <Card className="border-amber-300/70 bg-amber-50/50">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div className="size-10 rounded-lg bg-amber-100 text-amber-700 grid place-items-center shrink-0">
                  <FileText className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">Ticari Fatura</div>
                  {commercialInvoiceDoc ? (
                    <div className="text-xs text-muted-foreground mt-0.5 break-words">
                      Yüklendi: <span className="text-foreground">{commercialInvoiceDoc.fileName}</span>
                      {commercialInvoiceDoc.size ? ` · ${commercialInvoiceDoc.size}` : ""}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Sözleşme aşamasına gelindi. Ticari fatura belgesini yükleyin.
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {commercialInvoiceDoc?.fileId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => downloadDocument(commercialInvoiceDoc.fileId, commercialInvoiceDoc.fileName)}
                  >
                    <Eye className="size-4" /> Görüntüle
                  </Button>
                )}
                <DocumentUploadDialog
                  defaultSalesCaseId={sc.id}
                  defaultCompanyId={sc.customerId}
                  defaultType="CommercialInvoice"
                  trigger={
                    <Button size="sm" className="gap-1">
                      <Upload className="size-4" />
                      {commercialInvoiceDoc ? "Yeniden yükle" : "Ticari fatura yükle"}
                    </Button>
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="timeline">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="timeline">Zaman Çizelgesi</TabsTrigger>
          <TabsTrigger value="offers">Teklifler ({offs.length})</TabsTrigger>
          <TabsTrigger value="documents">Dokümanlar ({docs.length})</TabsTrigger>
          <TabsTrigger value="payments">Ödemeler ({pays.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Aktiviteler</CardTitle>
              <AddActivityDialog
                salesCaseId={sc.id}
                customerId={sc.customerId}
                trigger={<Button size="sm" className="gap-1"><Plus className="size-4" /> Aktivite Ekle</Button>}
              />
            </CardHeader>
            <CardContent>
              <ol className="relative border-l border-border ml-3 space-y-5">
                {acts.map((a) => (
                  <li key={a.id} className="ml-4">
                    <span className="absolute -left-1.5 size-3 rounded-full bg-primary" />
                    <div className="text-xs text-muted-foreground">{a.date}</div>
                    <div className="text-sm">{a.title}</div>
                    <div className="text-sm text-muted-foreground">{a.note}</div>
                  </li>
                ))}
                {acts.length === 0 && <div className="text-sm text-muted-foreground">Aktivite yok.</div>}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offers" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Teklifler</CardTitle>
              <QuoteDialog
                defaultCaseId={sc.id}
                defaultCustomerId={sc.customerId}
                trigger={<Button size="sm" className="gap-1"><Plus className="size-4" /> Yeni Teklif</Button>}
              />
            </CardHeader>
            <div className="overflow-x-auto">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Teklif No</TableHead>
                    <TableHead>Revizyon</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Tutar</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offs.map((o) => (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer hover:bg-muted/40"
                      tabIndex={0}
                      onClick={() => setSelectedOfferId(o.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedOfferId(o.id);
                        }
                      }}
                    >
                      <TableCell>{o.quoteNo}</TableCell>
                      <TableCell>R{o.revision}</TableCell>
                      <TableCell className="text-muted-foreground">{o.date}</TableCell>
                      <TableCell className="tabular-nums">{o.amount.toLocaleString()} {o.currency}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={o.status} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Teklif detayı"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOfferId(o.id);
                            }}
                          >
                            <Eye className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Dokümanlar</CardTitle>
              <DocumentUploadDialog
                defaultSalesCaseId={sc.id}
                defaultCompanyId={sc.customerId}
                trigger={<Button size="sm" className="gap-1"><Upload className="size-4" /> Yükle</Button>}
              />
            </CardHeader>
            <div className="overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tip</TableHead>
                    <TableHead>Dosya</TableHead>
                    <TableHead>Boyut</TableHead>
                    <TableHead>Tarih</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((d) => (
                    <TableRow
                      key={d.id}
                      className={d.fileId ? "cursor-pointer hover:bg-muted/40" : undefined}
                      tabIndex={d.fileId ? 0 : undefined}
                      onClick={() => d.fileId && downloadDocument(d.fileId, d.fileName)}
                      onKeyDown={(e) => {
                        if (!d.fileId) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          downloadDocument(d.fileId, d.fileName);
                        }
                      }}
                    >
                      <TableCell><StatusBadge status={d.type} /></TableCell>
                      <TableCell className="max-w-[320px] truncate">{d.fileName}</TableCell>
                      <TableCell className="text-muted-foreground">{d.size}</TableCell>
                      <TableCell className="text-muted-foreground">{d.uploadedAt}</TableCell>
                    </TableRow>
                  ))}
                  {docs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">Doküman yok.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Ödemeler & Tahsilatlar</CardTitle>
              {reachedPaymentPlan && (
                <CreatePaymentPlanDialog
                  sc={sc}
                  offs={offs}
                  c={c ?? null}
                  onCreated={refresh}
                  trigger={
                    <Button size="sm" className="gap-1">
                      <Plus className="size-4" /> Ödeme Planı Oluştur
                    </Button>
                  }
                />
              )}
            </CardHeader>
            <div className="overflow-x-auto">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tip</TableHead>
                    <TableHead>Tutar</TableHead>
                    <TableHead>Vade</TableHead>
                    <TableHead>Ödeme Tarihi</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pays.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.paymentType === "received" ? "Tahsilat" : "Beklenen"}</TableCell>
                      <TableCell className="tabular-nums">{p.amount.toLocaleString()} {p.currency}</TableCell>
                      <TableCell className="text-muted-foreground">{p.dueDate}</TableCell>
                      <TableCell className="text-muted-foreground">{p.paidDate ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      </div>

      <OfferDetailDialog
        offer={selectedOffer}
        salesCase={sc}
        customer={c ?? null}
        assignee={u ?? null}
        revisions={selectedRevisions}
        order={selectedOrder}
        onClose={() => setSelectedOfferId(null)}
        onQuoteAction={runQuoteAction}
        onOrderCreated={refresh}
      />
    </div>
  );
}

export function CreatePaymentPlanDialog({
  sc,
  offs,
  c,
  onCreated,
  trigger,
}: {
  sc: SalesCase;
  offs: Offer[];
  c: any;
  onCreated?: () => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<string>("USD");
  const [installmentCount, setInstallmentCount] = useState<number>(3);
  const [installments, setInstallments] = useState<Array<{ amount: number; dueDate: string }>>([]);
  const [saving, setSaving] = useState(false);

  // Initialize values based on approved quote or latest quote
  useEffect(() => {
    if (!open) return;
    const approvedQuote = offs.find((o) => o.status === "Approved");
    const latestQuote = offs.slice().sort((a, b) => b.revision - a.revision)[0];
    const initialQuote = approvedQuote || latestQuote;

    if (initialQuote) {
      setSelectedQuoteId(initialQuote.id);
      setAmount(initialQuote.amount);
      setCurrency(initialQuote.currency);
    } else {
      setSelectedQuoteId("");
      setAmount(sc.estimatedAmount || 0);
      setCurrency(sc.currency || "USD");
    }
  }, [open, offs, sc]);

  // Recalculate installments when amount, count, or quote changes
  useEffect(() => {
    if (amount <= 0 || installmentCount <= 0) {
      setInstallments([]);
      return;
    }
    const val = Number((amount / installmentCount).toFixed(2));
    const list = [];
    const today = new Date();
    for (let i = 0; i < installmentCount; i++) {
      const date = new Date();
      date.setDate(today.getDate() + 30 * (i + 1));
      const dateStr = date.toISOString().slice(0, 10);
      list.push({
        amount: i === 0 ? Number((amount - val * (installmentCount - 1)).toFixed(2)) : val,
        dueDate: dateStr,
      });
    }
    setInstallments(list);
  }, [amount, installmentCount]);

  const handleEqualize = () => {
    if (amount <= 0 || installmentCount <= 0) return;
    const val = Number((amount / installmentCount).toFixed(2));
    setInstallments(
      installments.map((inst, i) => ({
        ...inst,
        amount: i === 0 ? Number((amount - val * (installmentCount - 1)).toFixed(2)) : val,
      }))
    );
  };

  const handleInstallmentChange = (index: number, field: "amount" | "dueDate", value: any) => {
    setInstallments(
      installments.map((inst, i) => {
        if (i !== index) return inst;
        return {
          ...inst,
          [field]: field === "amount" ? Number(value) : value,
        };
      })
    );
  };

  const sum = installments.reduce((acc, inst) => acc + Number(inst.amount || 0), 0);
  const diff = Number((amount - sum).toFixed(2));
  const isMatch = Math.abs(diff) < 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatch) return toast.error("Taksitlerin toplamı, plan toplam tutarı ile eşleşmelidir");
    if (amount <= 0 || installments.length === 0) return toast.error("Plan tutarı ve en az bir taksit girin.");
    setSaving(true);
    try {
      for (let i = 0; i < installments.length; i++) {
        const inst = installments[i];
        await financeService.createReceivable({
          companyId: sc.customerId,
          ...(selectedQuoteId ? { quoteId: selectedQuoteId } : {}),
          amount: inst.amount,
          currencyCode: currency,
          dueDate: new Date(inst.dueDate),
          movementType: "manual",
          notes: `Taksit ${i + 1}/${installments.length} - ${sc.requestedProduct}`,
        });
      }
      toast.success("Ödeme planı başarıyla oluşturuldu.");
      setOpen(false);
      onCreated?.();
    } catch (err: any) {
      toast.error("Ödeme planı oluşturulamadı", { description: err?.message ?? "API isteği başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ödeme Planı Oluştur</DialogTitle>
          <DialogDescription>
            {c?.name} firmasına ait bu satış kartı için vadeli alacak ödeme planı oluşturun.
          </DialogDescription>
        </DialogHeader>

        {offs.length === 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 mt-4">
            Bu satış kartı altında bir teklif yok. Ödeme planını yine de oluşturabilirsiniz; sonradan teklif eklenirse manuel olarak bağlanabilir.
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="quote-select">İlişkili Teklif {offs.length === 0 ? "(yok)" : "(opsiyonel)"}</Label>
                <Select value={selectedQuoteId || "__none__"} onValueChange={(v) => setSelectedQuoteId(v === "__none__" ? "" : v)} disabled={offs.length === 0}>
                  <SelectTrigger id="quote-select" className="w-full">
                    <SelectValue placeholder={offs.length === 0 ? "Teklif bulunamadı" : "Teklif seçin"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Teklif bağlama</SelectItem>
                    {offs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.quoteNo} (Rev. {o.revision}) · {o.amount.toLocaleString()} {o.currency} {o.status === "Approved" ? "· Onaylı" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inst-count">Taksit Sayısı</Label>
                <Select value={String(installmentCount)} onValueChange={(v) => setInstallmentCount(Number(v))}>
                  <SelectTrigger id="inst-count" className="w-full">
                    <SelectValue placeholder="Taksit sayısı seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((num) => (
                      <SelectItem key={num} value={String(num)}>
                        {num} Taksit
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="total-amount">Toplam Plan Tutarı</Label>
                <Input
                  id="total-amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="Toplam Tutar"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="currency-select">Para Birimi</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency-select" className="w-full">
                    <SelectValue placeholder="Seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="TRY">TRY (₺)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">Taksit Detayları</h4>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleEqualize} className="text-xs">
                    Dengele
                  </Button>
                  <span
                    className={`text-xs px-2 py-1 rounded font-medium border ${
                      isMatch
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}
                  >
                    {isMatch ? "Tutar Uyumlu" : `Fark: ${diff.toLocaleString()} ${currency}`}
                  </span>
                </div>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {installments.map((inst, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-muted/30 rounded border border-border/40">
                    <span className="text-xs font-semibold text-muted-foreground w-12 text-center">
                      Taksit {i + 1}
                    </span>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          value={inst.amount}
                          onChange={(e) => handleInstallmentChange(i, "amount", e.target.value)}
                          className="pr-12 text-sm h-9"
                          required
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                          {currency}
                        </span>
                      </div>
                      <Input
                        type="date"
                        value={inst.dueDate}
                        onChange={(e) => handleInstallmentChange(i, "dueDate", e.target.value)}
                        className="text-sm h-9"
                        required
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={saving || !isMatch || amount <= 0 || installments.length === 0}>
                {saving ? "Kaydediliyor..." : "Planı Onayla ve Kaydet"}
              </Button>
            </div>
          </form>
      </DialogContent>
    </Dialog>
  );
}
