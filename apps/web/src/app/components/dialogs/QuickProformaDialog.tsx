import { useEffect, useMemo, useState } from "react";
import { Printer, Save, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../ui/select";
import { DialogSplitLayout, DialogSidebarSection } from "../shared/DialogSplitLayout";
import { DocumentDiscountFields, ProformaTotalsPanel } from "../shared/ProformaItemsEditor";
import {
  emptyQuickFreeItem,
  emptyQuickParty,
  QuickFreeItemsEditor,
  QuickPartySection,
  QuickSummaryRow,
  QUICK_CURRENCIES,
  quickFreeItemsFromSnapshot,
  quickFreeItemsPayload,
  quickFreeItemsToRows,
  quickItemsValidationError,
  quickPartyFromSnapshot,
  quickPartyPayload,
  quickPartyValidationError,
  type QuickFreeItem,
  type QuickPartyState,
} from "../shared/QuickDocumentEditor";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { documentService } from "../../../lib/services";
import { DocumentTermsTemplateEditor, useTermsTemplates } from "./DocumentTermsTemplateEditor";
import {
  computeProformaTotals, EMPTY_DOCUMENT_DISCOUNT, hasDocumentDiscount, type DocumentDiscount,
} from "../../lib/proformaPricing";
import { loadProformaPrintData, printAssetBase, proformaDoc, PROFORMA_NOTE_OPTIONS } from "../../lib/print";
import { printOrWarn } from "../../lib/pageHelpers";
import type { DocumentItem } from "../../lib/mock";
import { useCompanyDetail } from "../../lib/companyServerData";

const PROFORMA_TERMS_TEMPLATE_SCOPE = "proforma_terms";
const AUTO_VARIANT_KEY = "auto";

const createdProformaToDocument = (created: any): DocumentItem => ({
  id: String(created?.id ?? ""),
  salesCaseId: "",
  source: "commercial_record",
  quoteId: created?.quoteId ?? undefined,
  companyId: created?.companyId ?? undefined,
  type: "Proforma",
  fileName: created?.documentNo ?? "Proforma",
  uploadedBy: created?.createdBy ?? "",
  uploadedAt: String(created?.issueDate ?? "").slice(0, 10),
  size: "Kayıt",
  documentSnapshot: created?.documentSnapshot ?? undefined,
});

/**
 * Teklif açmadan proforma keser. Kalemler bir teklif satırına değil doğrudan belgeye
 * aittir; firma kayıtlı değilse unvan/adres/vergi bilgileri elle girilir.
 */
export function QuickProformaDialog({
  trigger,
  document: editDocument,
  open: controlledOpen,
  onOpenChange,
  onCreated,
}: {
  trigger?: React.ReactNode;
  /** Verilirse mevcut hızlı proforma düzenlenir; boşsa yeni belge oluşturulur. */
  document?: DocumentItem;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const {
    customers, products, cases, offers, contacts, users,
    noteTemplates, addNoteTemplate, updateNoteTemplate, deleteNoteTemplate, refresh,
  } = useStore();
  const { user, activeDivision } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };

  const today = new Date().toISOString().slice(0, 10);
  const divisions = user?.divisions ?? [];
  const defaultDivisionId =
    (activeDivision !== "all" ? activeDivision : null)
    ?? divisions.find((d) => d.isPrimary)?.id
    ?? divisions[0]?.id
    ?? "";

  const [party, setParty] = useState<QuickPartyState>(emptyQuickParty);
  const [divisionId, setDivisionId] = useState(defaultDivisionId);
  const [documentNo, setDocumentNo] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [printVariantKey, setPrintVariantKey] = useState(AUTO_VARIANT_KEY);
  const [items, setItems] = useState<QuickFreeItem[]>([emptyQuickFreeItem()]);
  const [termsTemplateKey, setTermsTemplateKey] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const [saving, setSaving] = useState(false);

  // Şablon listesi yalnızca kayıt akışını beslediği için burada sadece hazır tutulur.
  useTermsTemplates(noteTemplates, PROFORMA_TERMS_TEMPLATE_SCOPE);

  useEffect(() => {
    if (!open) return;
    const snapshot = editDocument?.documentSnapshot;
    if (snapshot) {
      // Düzenleme: belge anlık görüntüsü tek gerçek kaynaktır.
      setParty(quickPartyFromSnapshot(snapshot));
      setDocumentNo(editDocument?.fileName ?? "");
      setIssueDate(editDocument?.uploadedAt || today);
      setCurrencyCode(snapshot.currency?.code ?? "USD");
      setItems(quickFreeItemsFromSnapshot(snapshot.items));
      setPaymentTerms(snapshot.terms?.paymentTermsText ?? "");
      setDeliveryTerms(snapshot.terms?.deliveryTermsText ?? "");
      setWarrantyTerms(snapshot.terms?.warrantyTermsText ?? "");
    } else {
      setParty(emptyQuickParty());
      setDocumentNo("");
      setIssueDate(today);
      setCurrencyCode("USD");
      setItems([emptyQuickFreeItem()]);
      setPaymentTerms("");
      setDeliveryTerms("");
      setWarrantyTerms("");
    }
    setDivisionId(defaultDivisionId);
    setPrintVariantKey(AUTO_VARIANT_KEY);
    setTermsTemplateKey("");
    // defaultDivisionId, today: açılış anında sabit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editDocument]);

  const selectedCompanyQuery = useCompanyDetail(party.manualCompany ? null : party.companyId);
  const selectedCompany = selectedCompanyQuery.data ?? null;
  const priceRows = useMemo(() => quickFreeItemsToRows(items), [items]);
  const [documentDiscount, setDocumentDiscount] = useState<DocumentDiscount>(EMPTY_DOCUMENT_DISCOUNT);
  const totals = useMemo(
    () => computeProformaTotals(priceRows, { documentDiscount }),
    [documentDiscount, priceRows],
  );

  const validationError = (): string | null => {
    const partyError = quickPartyValidationError(party);
    if (partyError) return partyError;
    if (divisions.length > 0 && !divisionId) return "İş alanı seçin";
    return quickItemsValidationError(priceRows);
  };

  const printCreated = async (created: any) => {
    try {
      const data = await loadProformaPrintData({
        doc: createdProformaToDocument(created),
        customers: selectedCompany
          ? [selectedCompany, ...customers.filter((company) => company.id !== selectedCompany.id)]
          : customers,
        cases,
        offers,
        products,
        contacts,
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
    const error = validationError();
    if (error) return toast.error(editDocument ? "Proforma güncellenemedi" : "Proforma oluşturulamadı", { description: error });
    setSaving(true);
    try {
      const payload = {
        ...quickPartyPayload(party),
        divisionId: divisionId || undefined,
        documentNo: documentNo.trim() || undefined,
        issueDate: new Date(issueDate),
        statusCode: "draft",
        currencyCode,
        items: quickFreeItemsPayload(items, { productDetails: true }),
        // Belge geneli iskonto; satır iskontolarından ayrı olarak net toplamdan düşülür.
        ...(hasDocumentDiscount(documentDiscount)
          ? {
              headerDiscountAmount: documentDiscount.amount,
              headerDiscountPercent: documentDiscount.percent,
            }
          : {}),
        paymentTerms: paymentTerms || undefined,
        deliveryTerms: deliveryTerms || undefined,
        warrantyTerms: warrantyTerms || undefined,
      };
      const saved = editDocument
        ? await documentService.updateStandaloneProforma(editDocument.id, payload)
        : await documentService.createStandaloneProforma(payload);
      toast.success(editDocument ? "Proforma güncellendi" : "Proforma oluşturuldu", { description: saved?.documentNo });
      if (thenPrint) await printCreated(saved);
      await refresh();
      onCreated?.(saved?.id ?? "");
      setOpen(false);
    } catch (err: any) {
      toast.error(editDocument ? "Proforma güncellenemedi" : "Proforma oluşturulamadı", {
        description: err?.message ?? "İstek başarısız oldu.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {/* Portallı içerik satıra kadar kabarabildiği için tıklamayı burada durdur;
          aksi halde tablo satırının onClick'i belge detayını da açıyor. */}
      <DialogContent
        className="w-[min(1120px,calc(100vw-2rem))] max-w-none sm:max-w-none"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-5 text-primary" />
            {editDocument ? "Hızlı Proformayı Düzenle" : "Hızlı Proforma"}
          </DialogTitle>
          <DialogDescription>
            {editDocument
              ? `${editDocument.fileName} belgesinin firma bilgisi, kalemleri ve şartlarını güncelleyin.`
              : "Teklif açmadan proforma kesin. Kalemleri doğrudan yazarsınız; bu belge hiçbir teklife bağlanmaz."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => { event.preventDefault(); void save(false); }}>
          <DialogSplitLayout
            aside={
              <>
                <DialogSidebarSection title="Belge">
                  <dl className="space-y-1.5">
                    <QuickSummaryRow label="Firma" value={party.manualCompany ? party.companyName || "—" : selectedCompany?.name ?? "—"} />
                    <QuickSummaryRow label="Kaynak" value={party.manualCompany ? "Elle girilen firma" : "Kayıtlı firma"} />
                    <QuickSummaryRow label="Kalem" value={`${priceRows.filter((r) => r.description.trim()).length} satır`} />
                  </dl>
                </DialogSidebarSection>

                <DocumentDiscountFields
                  value={documentDiscount}
                  onChange={setDocumentDiscount}
                  currency={currencyCode}
                  idPrefix="quick-proforma-discount"
                  disabled={saving}
                />

                <ProformaTotalsPanel totals={totals} currency={currencyCode} />

                <DialogFooter className="sm:flex-col-reverse">
                  <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
                  <Button type="button" variant="outline" className="w-full gap-1" onClick={() => void save(true)} disabled={saving}>
                    <Printer className="size-4" /> Kaydet ve Yazdır
                  </Button>
                  <Button type="submit" className="w-full gap-1" disabled={saving}>
                    <Save className="size-4" />
                    {saving
                      ? (editDocument ? "Güncelleniyor…" : "Oluşturuluyor…")
                      : (editDocument ? "Proformayı Güncelle" : "Proforma Oluştur")}
                  </Button>
                </DialogFooter>
              </>
            }
          >
            <div className="space-y-4">
              <QuickPartySection
                idPrefix="quick-proforma"
                value={party}
                onChange={setParty}
                manualNote="Elle girilen firma hiçbir cariye bağlanmaz; bu proforma raporlarda firmasız görünür."
              />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {divisions.length > 0 && (
                  <div>
                    <Label className="text-xs">İş Alanı *</Label>
                    <Select value={divisionId} onValueChange={setDivisionId}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Bölüm seçin" /></SelectTrigger>
                      <SelectContent>
                        {divisions.map((division) => (
                          <SelectItem key={division.id} value={division.id}>{division.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-[10px] text-muted-foreground">Belge numarası serisi bundan belirlenir.</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs" htmlFor="quick-proforma-no">Proforma No</Label>
                  <Input id="quick-proforma-no" className="mt-1.5 font-data" value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} placeholder="Otomatik" />
                </div>
                <div>
                  <Label className="text-xs" htmlFor="quick-proforma-date">Tarih</Label>
                  <Input id="quick-proforma-date" type="date" className="mt-1.5" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Para Birimi</Label>
                  <Select value={currencyCode} onValueChange={setCurrencyCode}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QUICK_CURRENCIES.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <QuickFreeItemsEditor items={items} onChange={setItems} currencyCode={currencyCode} />

              <div>
                <Label className="text-xs">Çıktı Şablonu</Label>
                <Select value={printVariantKey} onValueChange={setPrintVariantKey}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_VARIANT_KEY}>Otomatik (girilen şartlar)</SelectItem>
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

              <DocumentTermsTemplateEditor
                continuousNumbering
                title="Proforma Şartları"
                description="Şablon seçin veya metni yazın. Bu belge bir teklife bağlı olmadığı için şartlar yalnızca proformaya kaydedilir."
                templateScope={PROFORMA_TERMS_TEMPLATE_SCOPE}
                noteTemplates={noteTemplates}
                selectedTemplateKey={termsTemplateKey}
                onSelectedTemplateKeyChange={setTermsTemplateKey}
                value={{ paymentTerms, deliveryTerms, warrantyTerms }}
                onChange={(next) => {
                  setPaymentTerms(next.paymentTerms);
                  setDeliveryTerms(next.deliveryTerms);
                  setWarrantyTerms(next.warrantyTerms);
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
