import { useEffect, useMemo, useState } from "react";
import { FileText, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Combobox } from "../ui/combobox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../ui/select";
import { DialogSplitLayout, DialogSidebarSection } from "../shared/DialogSplitLayout";
import { DocumentDiscountFields, ProformaItemsEditor, ProformaTotalsPanel } from "../shared/ProformaItemsEditor";
import { useStore } from "../../lib/store";
import { documentService, quoteService } from "../../../lib/services";
import {
  DocumentTermsTemplateEditor,
  matchSavedTermsTemplate,
  useTermsTemplates,
} from "./DocumentTermsTemplateEditor";
import {
  computeProformaTotals, EMPTY_DOCUMENT_DISCOUNT, hasDocumentDiscount, proformaRowError,
  quoteToProformaPriceRows, type DocumentDiscount, type ProformaPriceRow,
} from "../../lib/proformaPricing";
import {
  loadProformaPrintData, printAssetBase, proformaDoc, PROFORMA_NOTE_OPTIONS,
} from "../../lib/print";
import { printOrWarn } from "../../lib/pageHelpers";
import type { DocumentItem } from "../../lib/mock";
import { useCompanyDetail } from "../../lib/companyServerData";
import { contactQueryKeys, loadAllCompanyContacts, type ContactQueryScope } from "../../lib/contactServerData";
import { useAuth } from "../../../lib/auth";
import { useQueryClient } from "@tanstack/react-query";

const PROFORMA_TERMS_TEMPLATE_SCOPE = "proforma_terms";
const AUTO_VARIANT_KEY = "auto";

/** Yeni oluşturulan proforma yanıtını, yazdırma katmanının beklediği belge kaydına çevirir. */
const createdProformaToDocument = (created: any): DocumentItem => ({
  id: String(created?.id ?? ""),
  salesCaseId: created?.quote?.opportunityId ?? "",
  source: "commercial_record",
  quoteId: created?.quoteId ?? created?.quote?.id ?? undefined,
  companyId: created?.quote?.companyId ?? created?.companyId ?? undefined,
  type: "Proforma",
  fileName: created?.documentNo ?? "Proforma",
  uploadedBy: created?.createdBy ?? "",
  uploadedAt: String(created?.issueDate ?? "").slice(0, 10),
  size: created?.fileId ? "Dosya bağlı" : "Kayıt",
  fileId: created?.fileId ?? undefined,
  documentSnapshot: created?.documentSnapshot ?? undefined,
});

/**
 * Yüklemesiz proforma kaydı oluşturur — teklif formuna benzer tek ekranda kalemler,
 * toplamlar ve şartlar düzenlenir. Dosya yüklemek gerekmez; yazdırma "Girilen
 * verilerle" üretilir.
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
  const {
    offers, customers, cases, products, contacts, users,
    noteTemplates, addNoteTemplate, updateNoteTemplate, deleteNoteTemplate, refresh,
  } = useStore();
  const { user, tenant, activeDivision, activeDepartment } = useAuth();
  const queryClient = useQueryClient();
  const contactScope = useMemo<ContactQueryScope>(() => ({
    tenantId: tenant?.id ?? user?.tenantId ?? "anonymous",
    userId: user?.id ?? "anonymous",
    activeDivision,
    activeDepartment,
  }), [activeDepartment, activeDivision, tenant?.id, user?.id, user?.tenantId]);
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
  // Toplamların yazdırılan belgeyle örtüşmesi için teklifin iskonto/gümrük bağlamı.
  const [quoteTotals, setQuoteTotals] = useState({ discountTotal: 0, headerDiscountAmount: 0, customsTotal: 0 });
  const [documentDiscount, setDocumentDiscount] = useState<DocumentDiscount>(EMPTY_DOCUMENT_DISCOUNT);
  const [printVariantKey, setPrintVariantKey] = useState(AUTO_VARIANT_KEY);
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
    setQuoteTotals({ discountTotal: 0, headerDiscountAmount: 0, customsTotal: 0 });
    setDocumentDiscount(EMPTY_DOCUMENT_DISCOUNT);
    setPrintVariantKey(AUTO_VARIANT_KEY);
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
        setQuoteTotals({
          discountTotal: Number(data.discountTotal ?? 0) || 0,
          headerDiscountAmount: Number(data.headerDiscountAmount ?? 0) || 0,
          customsTotal: Number(data.customsTotal ?? 0) || 0,
        });
      } catch {
        if (cancelled) return;
        setPaymentTerms("");
        setDeliveryTerms("");
        setWarrantyTerms("");
        setTermsTemplateKey("");
        setTermsDirty(false);
        setPriceRows([]);
        setQuoteTotals({ discountTotal: 0, headerDiscountAmount: 0, customsTotal: 0 });
    setDocumentDiscount(EMPTY_DOCUMENT_DISCOUNT);
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
      headerDiscountAmount: quoteTotals.headerDiscountAmount,
      customsTotal: quoteTotals.customsTotal,
      documentDiscount,
    }),
    [documentDiscount, priceRows, quoteTotals],
  );
  const rowError = priceRows.map(proformaRowError).find(Boolean) ?? null;

  const persist = async () =>
    documentService.createProforma({
      quoteId,
      documentNo: documentNo.trim() || undefined,
      issueDate: new Date(issueDate),
      statusCode: "draft",
      items: priceRows.map((row) => ({
        quoteItemId: row.quoteItemId,
        unitPrice: row.unitPrice,
        discountAmount: row.discountAmount,
      })),
      // Belge geneli iskonto girildiyse gönderilir; boşsa proforma teklifin
      // genel iskontosunu devralır.
      ...(hasDocumentDiscount(documentDiscount)
        ? {
            headerDiscountAmount: documentDiscount.amount,
            headerDiscountPercent: documentDiscount.percent,
          }
        : {}),
      // Şart düzenlemesi PROFORMAYA özeldir; bağlı teklifin şartlarını
      // yeniden yazmaz. Dokunulmadıysa belge teklifin şartlarıyla basılır.
      terms: termsDirty
        ? {
            paymentTermsText: paymentTerms,
            deliveryTermsText: deliveryTerms,
            warrantyTermsText: warrantyTerms,
            importCostsExcluded: true,
          }
        : undefined,
    });

  // Kaydedilen proformayı seçilen şablonla anında yazdırır; hata belgeyi geri almaz,
  // kayıt oluşmuş sayılır ve kullanıcı listeden yeniden yazdırabilir.
  const printCreated = async (created: any) => {
    try {
      const doc = createdProformaToDocument(created);
      let printCustomers = customers;
      let printContacts = contacts;

      // Yeni API kayıtları normalde immutable belge snapshot'ı döndürür. Eski
      // sunucu sürümü snapshot döndürmezse yalnız seçili firmayı ve kontaklarını
      // yükleyerek eksik adres/telefon/vergi alanlarını tamamlarız.
      if (!doc.documentSnapshot && selectedCustomerId) {
        const freshCustomer = (await selectedCustomerQuery.refetch()).data ?? selectedCustomer;
        if (freshCustomer) {
          printCustomers = [freshCustomer, ...customers.filter((customer) => customer.id !== freshCustomer.id)];
        }
        const companyContacts = await queryClient.fetchQuery({
          queryKey: contactQueryKeys.companyContacts(contactScope, selectedCustomerId),
          queryFn: ({ signal }) => loadAllCompanyContacts(selectedCustomerId, signal),
          staleTime: 60_000,
        });
        const remoteIds = new Set(companyContacts.data.map((contact) => contact.id));
        printContacts = [...companyContacts.data, ...contacts.filter((contact) => !remoteIds.has(contact.id))];
      }

      const data = await loadProformaPrintData({
        doc,
        customers: printCustomers,
        cases,
        offers,
        products,
        contacts: printContacts,
        users,
        variantKey: printVariantKey === AUTO_VARIANT_KEY ? "" : printVariantKey,
      });
      printOrWarn(proformaDoc(data, printAssetBase()));
    } catch (err: any) {
      toast.error("Proforma yazdırılamadı", {
        description: err?.message ?? "Kayıt oluşturuldu; listeden yeniden yazdırabilirsiniz.",
      });
    }
  };

  const save = async (thenPrint: boolean) => {
    if (!quoteId) return toast.error("Bağlı teklif seçiniz");
    if (rowError) return toast.error("Proforma kaydedilemedi", { description: rowError });
    setSaving(true);
    try {
      const created = await persist();
      toast.success("Proforma oluşturuldu", { description: created?.documentNo ?? documentNo.trim() });
      if (thenPrint) await printCreated(created);
      await refresh();
      onCreated?.(created?.id ?? "");
      setOpen(false);
    } catch (err: any) {
      toast.error("Proforma oluşturulamadı", { description: err?.message ?? "İstek başarısız oldu." });
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void save(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-[min(1080px,calc(100vw-2rem))] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            Yeni Proforma
          </DialogTitle>
          <DialogDescription>
            Teklife bağlı proformayı tek ekranda hazırlayın: kalemler, toplamlar ve şartlar. Dosya yüklemek gerekmez.
          </DialogDescription>
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
                        {selectedOffer.date && <SummaryRow label="Teklif Tarihi" value={selectedOffer.date} />}
                        <SummaryRow label="Teklif Tutarı" value={`${selectedOffer.amount.toLocaleString("tr-TR")} ${selectedOffer.currency}`} />
                      </dl>
                      {(paymentTerms || deliveryTerms || warrantyTerms) && (
                        <p className="text-[11px] text-muted-foreground">Şartlar bağlı tekliften otomatik dolduruldu.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Henüz teklif seçilmedi.</p>
                  )}
                </DialogSidebarSection>

                <DocumentDiscountFields
                  value={documentDiscount}
                  onChange={setDocumentDiscount}
                  currency={currency}
                  idPrefix="create-proforma-discount"
                  disabled={saving}
                />

                <ProformaTotalsPanel
                  totals={totals}
                  currency={currency}
                  note={
                    totals.customs > 0
                      ? "Millileştirme tutarı bağlı teklifin güncel değeridir; kayıtta fiyatlara göre yeniden hesaplanır."
                      : undefined
                  }
                />

                <DialogFooter className="sm:flex-col-reverse">
                  <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-1"
                    onClick={() => void save(true)}
                    disabled={saving || pricesLoading || !quoteId}
                  >
                    <Printer className="size-4" /> Kaydet ve Yazdır
                  </Button>
                  <Button type="submit" disabled={saving || pricesLoading} className="w-full gap-1">
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

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs" htmlFor="create-proforma-number">Proforma No</Label>
              <Input id="create-proforma-number" className="mt-1.5 font-data" value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} placeholder={`Otomatik: ${selectedOffer?.businessLine ?? "CNC"}-PRF-${new Date().getFullYear()}/...`} />
              <p className="mt-1 text-[10px] text-muted-foreground">Boş bırakılırsa teklifin iş alanına ait seri atanır.</p>
            </div>
            <div>
              <Label className="text-xs" htmlFor="create-proforma-date">Tarih</Label>
              <Input id="create-proforma-date" type="date" className="mt-1.5" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Çıktı Şablonu</Label>
              <Select value={printVariantKey} onValueChange={setPrintVariantKey}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_VARIANT_KEY}>Otomatik (teklife göre)</SelectItem>
                  <SelectGroup>
                    <SelectLabel>Proforma şablonu</SelectLabel>
                    {PROFORMA_NOTE_OPTIONS.filter((v) => v.group === "proforma").map((v) => (
                      <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Teklif teslim şekli</SelectLabel>
                    {PROFORMA_NOTE_OPTIONS.filter((v) => v.group === "teslim").map((v) => (
                      <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-muted-foreground">Yalnızca "Kaydet ve Yazdır" çıktısında kullanılır.</p>
            </div>
          </div>

          <ProformaItemsEditor
            rows={priceRows}
            onRowsChange={setPriceRows}
            currency={currency}
            loading={pricesLoading}
            idPrefix="create-proforma-price"
            emptyText={quoteId ? "Seçilen teklifte fiyatlandırılacak ürün kalemi bulunamadı." : "Önce bağlı teklifi seçin."}
          />

          <DocumentTermsTemplateEditor
            continuousNumbering
            title="Proforma Şartları"
            description="Şablon seçin veya metni düzenleyin. Değişiklik yalnız bu proformaye işlenir; bağlı teklifin şartları olduğu gibi kalır."
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
      <dd className={`min-w-0 break-words ${highlight ? "font-medium text-success tabular-nums" : "text-foreground/90"}`}>{value}</dd>
    </div>
  );
}
