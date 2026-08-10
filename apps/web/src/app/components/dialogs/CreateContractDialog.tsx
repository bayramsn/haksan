import { useEffect, useMemo, useState } from "react";
import { FileSignature, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Combobox } from "../ui/combobox";
import { DialogSplitLayout, DialogSidebarSection } from "../shared/DialogSplitLayout";
import { ProformaItemsEditor, ProformaTotalsPanel } from "../shared/ProformaItemsEditor";
import { useStore } from "../../lib/store";
import { documentService, quoteService } from "../../../lib/services";
import {
  DocumentTermsTemplateEditor,
  matchSavedTermsTemplate,
  useTermsTemplates,
} from "./DocumentTermsTemplateEditor";
import {
  computeProformaTotals, proformaRowError, quoteToProformaPriceRows, type ProformaPriceRow,
} from "../../lib/proformaPricing";
import { useCompanyDetail } from "../../lib/companyServerData";

const CONTRACT_TERMS_TEMPLATE_SCOPE = "contract_terms";

type ContractTermsMetadata = {
  importCostsExcluded: boolean;
  deliveryLocation?: string;
  estimatedDeliveryDaysMin?: number;
  estimatedDeliveryDaysMax?: number;
};

/**
 * Yüklemesiz sözleşme kaydı oluşturur — teklife referans verir; çıktısı CRM
 * verisinden basılır.
 */
export function CreateContractDialog({
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
  const [contractNo, setContractNo] = useState("");
  const [signedDate, setSignedDate] = useState(today);
  const [paymentTermDays, setPaymentTermDays] = useState("");
  const [termsTemplateKey, setTermsTemplateKey] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const [termsMetadata, setTermsMetadata] = useState<ContractTermsMetadata>({ importCostsExcluded: true });
  const [termsDirty, setTermsDirty] = useState(false);
  // Sözleşme fiyatı bağlı teklifi değiştirmez: onaylı teklif kilitlidir, oysa
  // imza masasında fiyat hâlâ pazarlığa açık. Girilen değerler belgenin kendi
  // anlık görüntüsüne yazılır ve sözleşme çıktısı bunlarla basılır.
  const [priceRows, setPriceRows] = useState<ProformaPriceRow[]>([]);
  // Tekliften gelen ilk fiyatlar. Kullanıcı fiyata dokunmadıysa belge kendi
  // anlık görüntüsünü dondurmaz; sözleşme eskisi gibi teklifin güncel
  // fiyatlarıyla basılmaya devam eder.
  const [loadedPriceRows, setLoadedPriceRows] = useState<ProformaPriceRow[]>([]);
  // Toplamların basılan belgeyle örtüşmesi için teklifin iskonto/gümrük bağlamı.
  const [quoteTotals, setQuoteTotals] = useState({ discountTotal: 0, customsTotal: 0 });
  const [pricesLoading, setPricesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const savedTermsTemplates = useTermsTemplates(noteTemplates, CONTRACT_TERMS_TEMPLATE_SCOPE);

  useEffect(() => {
    if (!open) return;
    setQuoteId(defaultQuoteId ?? "");
    setContractNo("");
    setSignedDate(today);
    setPaymentTermDays("");
    setTermsTemplateKey("");
    setPaymentTerms("");
    setDeliveryTerms("");
    setWarrantyTerms("");
    setTermsMetadata({ importCostsExcluded: true });
    setTermsDirty(false);
    setPriceRows([]);
    setLoadedPriceRows([]);
    setQuoteTotals({ discountTotal: 0, customsTotal: 0 });
    setPricesLoading(false);
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
        setTermsMetadata({
          importCostsExcluded: data.terms?.importCostsExcluded ?? true,
          deliveryLocation: data.terms?.deliveryLocation ?? undefined,
          estimatedDeliveryDaysMin: data.terms?.estimatedDeliveryDaysMin ?? undefined,
          estimatedDeliveryDaysMax: data.terms?.estimatedDeliveryDaysMax ?? undefined,
        });
        setTermsTemplateKey(matchSavedTermsTemplate(loadedPayment, loadedDelivery, loadedWarranty, savedTermsTemplates));
        setTermsDirty(false);
        const loadedRows = quoteToProformaPriceRows(data);
        setPriceRows(loadedRows);
        setLoadedPriceRows(loadedRows);
        setQuoteTotals({
          discountTotal: Number(data.discountTotal ?? 0) || 0,
          customsTotal: Number(data.customsTotal ?? 0) || 0,
        });
      } catch {
        if (cancelled) return;
        setPaymentTerms("");
        setDeliveryTerms("");
        setWarrantyTerms("");
        setTermsMetadata({ importCostsExcluded: true });
        setTermsTemplateKey("");
        setTermsDirty(false);
        setPriceRows([]);
        setLoadedPriceRows([]);
        setQuoteTotals({ discountTotal: 0, customsTotal: 0 });
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
          const cust = (sc ? customerName(sc.customerId) : customerName(o.companyId ?? ""))
            || sc?.leadCompanyTitle;
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
  const selectedCustomerId = selectedOffer?.companyId || selectedCase?.customerId || "";
  const storedSelectedCustomer = selectedCustomerId
    ? customers.find((c) => c.id === selectedCustomerId)
    : null;
  const selectedCustomerQuery = useCompanyDetail(selectedCustomerId, storedSelectedCustomer ?? undefined);
  const selectedCustomer = selectedCustomerQuery.data ?? storedSelectedCustomer;
  const currency = selectedOffer?.currency ?? "USD";
  const totals = useMemo(
    () => computeProformaTotals(priceRows, {
      quoteDiscountTotal: quoteTotals.discountTotal,
      customsTotal: quoteTotals.customsTotal,
    }),
    [priceRows, quoteTotals],
  );
  const rowError = priceRows.map(proformaRowError).find(Boolean) ?? null;
  // Fiyata dokunulmadıysa kalem göndermeyiz; belge anlık görüntüsünü dondurmaz
  // ve teklif sonradan güncellenirse taslak sözleşme onu izlemeye devam eder.
  const pricesChanged = useMemo(
    () =>
      priceRows.length !== loadedPriceRows.length ||
      priceRows.some((row, index) => row.unitPrice !== loadedPriceRows[index]?.unitPrice),
    [priceRows, loadedPriceRows],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quoteId) return toast.error("Bağlı teklif seçiniz");
    if (rowError) return toast.error("Fiyat girişini düzeltin", { description: rowError });
    setSaving(true);
    try {
      const termDays = paymentTermDays.trim() === "" ? undefined : Number(paymentTermDays);
      const created = await documentService.createContract({
        quoteId,
        contractNo: contractNo.trim() || undefined,
        signedDate: new Date(signedDate),
        paymentTermDays: termDays !== undefined && Number.isFinite(termDays) ? termDays : undefined,
        statusCode: "draft",
        items: pricesChanged
          ? priceRows.map((row) => ({ quoteItemId: row.quoteItemId, unitPrice: row.unitPrice }))
          : undefined,
        // Şart düzenlemesi SÖZLEŞMEYE özeldir; bağlı teklifin şartlarına
        // yazılmaz, yoksa imza masasındaki bir değişiklik onaylı teklifin ve
        // aynı teklife bağlı proformanın çıktısını da geriye dönük değiştirirdi.
        // Dokunulmadıysa gönderilmez: belge teklifin şartlarıyla basılır.
        terms: termsDirty
          ? {
              paymentTermsText: paymentTerms,
              deliveryTermsText: deliveryTerms,
              warrantyTermsText: warrantyTerms,
              ...termsMetadata,
            }
          : undefined,
      });
      toast.success("Sözleşme oluşturuldu", { description: created?.contractNo ?? contractNo.trim() });
      await refresh();
      onCreated?.(created?.id ?? "");
      setOpen(false);
    } catch (err: any) {
      toast.error("Sözleşme oluşturulamadı", { description: err?.message ?? "İstek başarısız oldu." });
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
            <FileSignature className="size-5 text-primary" />
            Yeni Sözleşme
          </DialogTitle>
          <DialogDescription>Teklife bağlı sözleşme kaydı oluşturun. Dosya yüklemek gerekmez.</DialogDescription>
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
                {selectedOffer && (
                  <ProformaTotalsPanel
                    totals={totals}
                    currency={currency}
                    note={
                      totals.customs > 0
                        ? "Millileştirme tutarı bağlı teklifin güncel değeridir; kayıtta fiyatlara göre yeniden hesaplanır."
                        : undefined
                    }
                  />
                )}
                <DialogFooter className="sm:flex-col-reverse">
                  <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
                  <Button type="submit" disabled={saving} className="w-full gap-1">
                    <Save className="size-4" /> {saving ? "Oluşturuluyor…" : "Sözleşme Oluştur"}
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
              <Label className="text-xs" htmlFor="create-contract-number">Sözleşme No</Label>
              <Input id="create-contract-number" className="mt-1.5 font-data" value={contractNo} onChange={(e) => setContractNo(e.target.value)} placeholder={`Otomatik: ${selectedOffer?.businessLine ?? "CNC"}-SOZ-${new Date().getFullYear()}/...`} />
              <p className="mt-1 text-[10px] text-muted-foreground">Boş bırakılırsa teklifin iş alanına ait seri atanır.</p>
            </div>
            <div>
              <Label className="text-xs" htmlFor="create-contract-date">İmza Tarihi</Label>
              <Input id="create-contract-date" type="date" className="mt-1.5" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs" htmlFor="create-contract-payment-days">Ödeme Vadesi (Gün)</Label>
            <Input
              id="create-contract-payment-days"
              type="number"
              min={0}
              max={3650}
              className="mt-1.5"
              value={paymentTermDays}
              onChange={(e) => setPaymentTermDays(e.target.value)}
              placeholder="Örn. 60"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Bu firmaya satış faturası kesilirken vade otomatik bu değerden hesaplanır.
            </p>
          </div>

          <ProformaItemsEditor
            rows={priceRows}
            onRowsChange={setPriceRows}
            currency={currency}
            loading={pricesLoading}
            idPrefix="create-contract-price"
            title="Sözleşme Fiyatları"
            description="Sözleşmede geçerli birim fiyatları girin. Bağlı teklif değişmez; sözleşme çıktısı bu değerlerle basılır."
            emptyText={quoteId ? "Seçilen teklifte fiyatlandırılacak ürün kalemi bulunamadı." : "Önce bağlı teklifi seçin."}
          />

          <DocumentTermsTemplateEditor
            markerStyle="none"
            title="Sözleşme Şartları"
            description="Şablon seçin veya metni düzenleyin. Değişiklik yalnız bu sözleşmeye işlenir; bağlı teklifin şartları olduğu gibi kalır."
            templateScope={CONTRACT_TERMS_TEMPLATE_SCOPE}
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
