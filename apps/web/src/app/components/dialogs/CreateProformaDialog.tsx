import { useEffect, useMemo, useState } from "react";
import { FileText, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Combobox } from "../ui/combobox";
import { DialogSplitLayout, DialogSidebarSection } from "../shared/DialogSplitLayout";
import { useStore } from "../../lib/store";
import { documentService, quoteService } from "../../../lib/services";
import {
  DocumentTermsTemplateEditor,
  matchSavedTermsTemplate,
  useTermsTemplates,
} from "./DocumentTermsTemplateEditor";
import { quoteToProformaPriceRows, type ProformaPriceRow } from "../../lib/proformaPricing";

const PROFORMA_TERMS_TEMPLATE_SCOPE = "proforma_terms";

/**
 * Yüklemesiz proforma kaydı oluşturur — sadece tekliften no/tarih bilgisi ile
 * referans satırı açar. Dosya yüklemek gerekmez; yazdırma "Girilen verilerle"
 * üretilir.
 */
export function CreateProformaDialog({
  trigger,
  defaultQuoteId,
  open: controlledOpen,
  onOpenChange,
  onCreated,
}: {
  trigger?: React.ReactNode;
  defaultQuoteId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const { offers, customers, cases, noteTemplates, addNoteTemplate, updateNoteTemplate, deleteNoteTemplate, refresh } = useStore();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };

  const today = new Date().toISOString().slice(0, 10);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "";

  const [quoteId, setQuoteId] = useState(defaultQuoteId ?? "");
  const [documentNo, setDocumentNo] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [termsTemplateKey, setTermsTemplateKey] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const [termsDirty, setTermsDirty] = useState(false);
  const [priceRows, setPriceRows] = useState<ProformaPriceRow[]>([]);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const savedTermsTemplates = useTermsTemplates(noteTemplates, PROFORMA_TERMS_TEMPLATE_SCOPE);

  useEffect(() => {
    if (!open) return;
    setQuoteId(defaultQuoteId ?? "");
    setDocumentNo("");
    setIssueDate(today);
    setTermsTemplateKey("");
    setPaymentTerms("");
    setDeliveryTerms("");
    setWarrantyTerms("");
    setTermsDirty(false);
    setPriceRows([]);
    setPricesLoading(false);
    // suggestNo, today: stable per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultQuoteId]);

  useEffect(() => {
    if (!open || !quoteId) return;
    let cancelled = false;
    setPricesLoading(true);
    void (async () => {
      try {
        const data: any = await quoteService.get(quoteId);
        if (cancelled) return;
        const loadedPayment = data.terms?.paymentTermsText ?? data.paymentTerms ?? "";
        const loadedDelivery = data.terms?.deliveryTermsText ?? data.deliveryTerms ?? "";
        const loadedWarranty = data.terms?.warrantyTermsText ?? data.warrantyTerms ?? "";
        setPaymentTerms(loadedPayment);
        setDeliveryTerms(loadedDelivery);
        setWarrantyTerms(loadedWarranty);
        setTermsTemplateKey(matchSavedTermsTemplate(loadedPayment, loadedDelivery, loadedWarranty, savedTermsTemplates));
        setTermsDirty(false);
        setPriceRows(quoteToProformaPriceRows(data));
      } catch {
        if (cancelled) return;
        setPaymentTerms("");
        setDeliveryTerms("");
        setWarrantyTerms("");
        setTermsTemplateKey("");
        setTermsDirty(false);
        setPriceRows([]);
      } finally {
        if (!cancelled) setPricesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // savedTermsTemplates intentionally excluded: saving a new template refreshes
    // the store and must not overwrite the in-progress edited terms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quoteId]);

  const quoteOptions = useMemo(
    () =>
      [...offers]
        .sort((a, b) => b.quoteNo.localeCompare(a.quoteNo, "tr", { numeric: true }))
        .map((o) => {
          const sc = cases.find((c) => c.id === o.salesCaseId);
          const cust = sc ? customerName(sc.customerId) : customerName(o.companyId ?? "");
          return {
            value: o.id,
            label: `${o.quoteNo} · ${cust || "—"}`,
            hint: o.amount ? `${o.amount.toLocaleString("tr-TR")} ${o.currency}` : undefined,
          };
        }),
    [offers, cases, customers]
  );

  const selectedOffer = offers.find((o) => o.id === quoteId) ?? null;
  const selectedCase = selectedOffer ? cases.find((c) => c.id === selectedOffer.salesCaseId) : null;
  const selectedCustomer = selectedOffer
    ? customers.find((c) => c.id === (selectedOffer.companyId || selectedCase?.customerId))
    : null;
  const proformaSubtotal = useMemo(
    () => priceRows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0),
    [priceRows],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quoteId) return toast.error("Bağlı teklif seçiniz");
    setSaving(true);
    try {
      if (termsDirty) {
        await quoteService.terms(quoteId, {
          paymentTermsText: paymentTerms,
          deliveryTermsText: deliveryTerms,
          warrantyTermsText: warrantyTerms,
          importCostsExcluded: true,
        });
      }
      const created = await documentService.createProforma({
        quoteId,
        documentNo: documentNo.trim() || undefined,
        issueDate: new Date(issueDate),
        statusCode: "draft",
        items: priceRows.map((row) => ({
          quoteItemId: row.quoteItemId,
          unitPrice: row.unitPrice,
        })),
      });
      toast.success("Proforma oluşturuldu", { description: created?.documentNo ?? documentNo.trim() });
      await refresh();
      onCreated?.(created?.id ?? "");
      setOpen(false);
    } catch (err: any) {
      toast.error("Proforma oluşturulamadı", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-[min(1000px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            Yeni Proforma
          </DialogTitle>
          <DialogDescription>Teklife bağlı proforma kaydı oluşturun. Dosya yüklemek gerekmez.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <DialogSplitLayout
            aside={
              <>
                <DialogSidebarSection title="Seçilen Teklif">
                  {selectedOffer ? (
                    <div className="space-y-2.5">
                      <dl className="space-y-1.5">
                        <SummaryRow label="Teklif No" value={`${selectedOffer.quoteNo}${selectedOffer.revision ? ` · R${selectedOffer.revision}` : ""}`} />
                        <SummaryRow label="İş Alanı" value={selectedOffer.businessLine ?? selectedOffer.divisionName ?? "—"} />
                        <SummaryRow label="Müşteri" value={selectedCustomer?.name ?? "—"} />
                        {(selectedCustomer?.district || selectedCustomer?.city) && (
                          <SummaryRow label="Konum" value={[selectedCustomer?.district, selectedCustomer?.city].filter(Boolean).join(" / ")} />
                        )}
                        {selectedCase?.requestedProduct && <SummaryRow label="Ürün" value={selectedCase.requestedProduct} />}
                        {selectedCase?.requestedModel && <SummaryRow label="Model" value={selectedCase.requestedModel} />}
                        {selectedCase?.quantity != null && <SummaryRow label="Adet" value={String(selectedCase.quantity)} />}
                        {selectedOffer.date && <SummaryRow label="Teklif Tarihi" value={selectedOffer.date} />}
                        <SummaryRow label="Tutar" value={`${selectedOffer.amount.toLocaleString("tr-TR")} ${selectedOffer.currency}`} highlight />
                      </dl>
                      {(paymentTerms || deliveryTerms || warrantyTerms) && (
                        <p className="text-[11px] text-muted-foreground">Şartlar bağlı tekliften otomatik dolduruldu.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Henüz teklif seçilmedi.</p>
                  )}
                </DialogSidebarSection>
                <DialogFooter className="sm:flex-col-reverse">
                  <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
                  <Button type="submit" disabled={saving} className="w-full gap-1">
                    <Save className="size-4" /> {saving ? "Oluşturuluyor…" : "Proforma Oluştur"}
                  </Button>
                </DialogFooter>
              </>
            }
          >
          <div className="space-y-4">
          <div>
            <Label className="text-xs">Bağlı Teklif *</Label>
            <div className="mt-1.5">
              <Combobox
                options={quoteOptions}
                value={quoteId}
                onChange={setQuoteId}
                placeholder="Teklif no ile arayın..."
                searchPlaceholder="Teklif no / müşteri ara..."
                emptyText="Eşleşen teklif yok."
                disabled={Boolean(defaultQuoteId)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs" htmlFor="create-proforma-number">Proforma No</Label>
              <Input id="create-proforma-number" className="mt-1.5 font-data" value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} placeholder={`Otomatik: ${selectedOffer?.businessLine ?? "CNC"}-PRF-${new Date().getFullYear()}/...`} />
              <p className="mt-1 text-[10px] text-muted-foreground">Boş bırakılırsa teklifin iş alanına ait seri atanır.</p>
            </div>
            <div>
              <Label className="text-xs" htmlFor="create-proforma-date">Tarih</Label>
              <Input id="create-proforma-date" type="date" className="mt-1.5" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold">Proforma Fiyatları</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Brüt birim fiyatları düzenleyebilirsiniz; iskonto proformada ayrıca gösterilir ve değişiklik bağlı teklifi etkilemez.</p>
              </div>
              <span className="shrink-0 font-data text-xs font-semibold text-emerald-600">
                {proformaSubtotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {selectedOffer?.currency ?? ""}
              </span>
            </div>
            {pricesLoading ? (
              <p className="px-3 py-5 text-center text-xs text-muted-foreground">Fiyatlar yükleniyor…</p>
            ) : priceRows.length > 0 ? (
              <div className="divide-y divide-border/60">
                {priceRows.map((row, index) => (
                  <div key={row.quoteItemId} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_70px_180px] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{row.description || `Ürün ${index + 1}`}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">KDV %{row.vatRate}</p>
                    </div>
                    <div className="text-xs text-muted-foreground sm:text-center">{row.quantity.toLocaleString("tr-TR")} adet</div>
                    <div>
                      <Label className="sr-only" htmlFor={`proforma-price-${row.quoteItemId}`}>Brüt birim fiyat</Label>
                      <div className="relative">
                        <Input
                          id={`proforma-price-${row.quoteItemId}`}
                          type="number"
                          min="0"
                          step="0.0001"
                          inputMode="decimal"
                          className="h-9 pr-12 text-right font-data"
                          value={row.unitPrice}
                          onChange={(event) => {
                            const unitPrice = Number(event.target.value);
                            setPriceRows((current) => current.map((item) =>
                              item.quoteItemId === row.quoteItemId
                                ? { ...item, unitPrice: Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0 }
                                : item
                            ));
                          }}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                          {selectedOffer?.currency ?? ""}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-5 text-center text-xs text-muted-foreground">
                Seçilen teklifte fiyatlandırılacak ürün kalemi bulunamadı.
              </p>
            )}
          </section>

          <DocumentTermsTemplateEditor
            title="Proforma Şartları"
            description="Şablon seçin veya metni düzenleyin. Kaydedilen değişiklik bağlı teklif şartlarına yazılır ve proforma çıktısında kullanılır."
            templateScope={PROFORMA_TERMS_TEMPLATE_SCOPE}
            noteTemplates={noteTemplates}
            selectedTemplateKey={termsTemplateKey}
            onSelectedTemplateKeyChange={(key) => {
              setTermsTemplateKey(key);
              setTermsDirty(true);
            }}
            value={{ paymentTerms, deliveryTerms, warrantyTerms }}
            onChange={(next) => {
              setPaymentTerms(next.paymentTerms);
              setDeliveryTerms(next.deliveryTerms);
              setWarrantyTerms(next.warrantyTerms);
              setTermsDirty(true);
            }}
            addNoteTemplate={addNoteTemplate}
            updateNoteTemplate={updateNoteTemplate}
            deleteNoteTemplate={deleteNoteTemplate}
          />
          </div>
          </DialogSplitLayout>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-2 text-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-words ${highlight ? "font-medium text-emerald-600 tabular-nums" : "text-foreground/90"}`}>{value}</dd>
    </div>
  );
}
