import { useEffect, useMemo, useState } from "react";
import { Plus, Printer, Save, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
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
  computeProformaTotals, EMPTY_DOCUMENT_DISCOUNT, formatMoneyInput, hasDocumentDiscount, parseMoneyInput,
  type DocumentDiscount,
} from "../../lib/proformaPricing";
import { contractDoc, loadContractPrintData, printAssetBase } from "../../lib/print";
import { printOrWarn } from "../../lib/pageHelpers";
import type { DocumentItem } from "../../lib/mock";
import { useCompanyDetail } from "../../lib/companyServerData";

const CONTRACT_TERMS_TEMPLATE_SCOPE = "contract_terms";

type Installment = { key: string; label: string; amount: string; dueDate: string; promissoryNote: boolean };

let installmentCounter = 0;
const emptyInstallment = (): Installment => ({
  key: `quick-installment-${++installmentCounter}`,
  label: "",
  amount: "",
  dueDate: "",
  promissoryNote: false,
});

const createdContractToDocument = (created: any): DocumentItem => ({
  id: String(created?.id ?? ""),
  salesCaseId: "",
  source: "commercial_record",
  quoteId: created?.quoteId ?? undefined,
  companyId: created?.companyId ?? undefined,
  type: "Contract",
  fileName: created?.contractNo ?? "Sözleşme",
  uploadedBy: created?.createdBy ?? "",
  uploadedAt: String(created?.signedDate ?? "").slice(0, 10),
  size: "Kayıt",
  documentSnapshot: created?.documentSnapshot ?? undefined,
});

/**
 * Teklif açmadan sözleşme keser. Kalemler, şartlar ve ödeme planı bir teklife değil
 * doğrudan belgeye aittir; firma kayıtlı değilse unvan/adres/vergi bilgileri elle girilir.
 *
 * Sözleşme çıktısındaki "AKSESUARLAR" bloğu, açıklaması `↳ Opsiyon:` ile başlayan
 * satırlardan doldurulur — bu, teklife bağlı sözleşmedeki opsiyon satırlarıyla aynı kuraldır.
 */
export function QuickContractDialog({
  trigger,
  document: editDocument,
  open: controlledOpen,
  onOpenChange,
  onCreated,
}: {
  trigger?: React.ReactNode;
  /** Verilirse mevcut hızlı sözleşme düzenlenir; boşsa yeni belge oluşturulur. */
  document?: DocumentItem;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const {
    products, payments, users,
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
  const [contractNo, setContractNo] = useState("");
  const [signedDate, setSignedDate] = useState(today);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [paymentTermDays, setPaymentTermDays] = useState("");
  const [items, setItems] = useState<QuickFreeItem[]>([emptyQuickFreeItem()]);
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [deliveryDaysMin, setDeliveryDaysMin] = useState("");
  const [deliveryDaysMax, setDeliveryDaysMax] = useState("");
  const [importCostsExcluded, setImportCostsExcluded] = useState(true);
  // Sözleşme 3.3 ve 2.6 maddelerinin yönü; varsayılanlar bugünkü çıktıyı korur.
  const [vatIncluded, setVatIncluded] = useState(false);
  const [freightPaidBySeller, setFreightPaidBySeller] = useState(false);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [termsTemplateKey, setTermsTemplateKey] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const [saving, setSaving] = useState(false);

  // Şablon listesi yalnızca kayıt akışını beslediği için burada sadece hazır tutulur.
  useTermsTemplates(noteTemplates, CONTRACT_TERMS_TEMPLATE_SCOPE);

  useEffect(() => {
    if (!open) return;
    const snapshot = editDocument?.documentSnapshot;
    if (snapshot) {
      // Düzenleme: belge anlık görüntüsü tek gerçek kaynaktır.
      setParty(quickPartyFromSnapshot(snapshot));
      setContractNo(editDocument?.fileName ?? "");
      setSignedDate(editDocument?.uploadedAt || today);
      setCurrencyCode(snapshot.currency?.code ?? "USD");
      setItems(quickFreeItemsFromSnapshot(snapshot.items));
      setPaymentTerms(snapshot.terms?.paymentTermsText ?? "");
      setDeliveryTerms(snapshot.terms?.deliveryTermsText ?? "");
      setWarrantyTerms(snapshot.terms?.warrantyTermsText ?? "");
      setDeliveryLocation(snapshot.terms?.deliveryLocation ?? "");
      setDeliveryDaysMin(snapshot.terms?.estimatedDeliveryDaysMin?.toString() ?? "");
      setDeliveryDaysMax(snapshot.terms?.estimatedDeliveryDaysMax?.toString() ?? "");
      setImportCostsExcluded(snapshot.terms?.importCostsExcluded ?? true);
      setVatIncluded(snapshot.terms?.vatIncluded ?? false);
      setFreightPaidBySeller(snapshot.terms?.freightPaidBySeller ?? false);
      setInstallments(
        (Array.isArray(snapshot.receivables) ? snapshot.receivables : []).map((receivable: any) => ({
          ...emptyInstallment(),
          label: String(receivable.notes ?? ""),
          amount: formatMoneyInput(Number(receivable.amount ?? 0)),
          dueDate: String(receivable.dueDate ?? "").slice(0, 10),
          promissoryNote: /senet/i.test(String(receivable.notes ?? "")),
        })),
      );
    } else {
      setParty(emptyQuickParty());
      setContractNo("");
      setSignedDate(today);
      setCurrencyCode("USD");
      setItems([emptyQuickFreeItem()]);
      setPaymentTerms("");
      setDeliveryTerms("");
      setWarrantyTerms("");
      setDeliveryLocation("");
      setDeliveryDaysMin("");
      setDeliveryDaysMax("");
      setImportCostsExcluded(true);
      setInstallments([]);
    }
    setPaymentTermDays(editDocument ? "" : "");
    setDivisionId(defaultDivisionId);
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
  const installmentTotal = installments.reduce((sum, row) => sum + parseMoneyInput(row.amount), 0);

  const patchInstallment = (key: string, patch: Partial<Installment>) =>
    setInstallments((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const validationError = (): string | null => {
    const partyError = quickPartyValidationError(party);
    if (partyError) return partyError;
    if (divisions.length > 0 && !divisionId) return "İş alanı seçin";
    const itemsError = quickItemsValidationError(priceRows);
    if (itemsError) return itemsError;
    const min = deliveryDaysMin.trim() === "" ? undefined : Number(deliveryDaysMin);
    const max = deliveryDaysMax.trim() === "" ? undefined : Number(deliveryDaysMax);
    if (min !== undefined && max !== undefined && min > max) return "En erken teslim günü en geçten büyük olamaz";
    if (installments.some((row) => parseMoneyInput(row.amount) <= 0)) return "Ödeme planı satırında tutar sıfırdan büyük olmalı";
    return null;
  };

  const printCreated = async (created: any) => {
    try {
      const data = await loadContractPrintData({
        customer: selectedCompany,
        // Teklifsiz sözleşmede satış kartı yoktur; çıktı yalnızca anlık görüntüden üretilir.
        salesCase: null,
        offer: null,
        products,
        payments,
        contractDate: String(created?.signedDate ?? signedDate).slice(0, 10),
        contractNo: created?.contractNo ?? contractNo,
        documentSnapshot: created?.documentSnapshot,
        users,
      });
      printOrWarn(contractDoc(data, printAssetBase()));
    } catch (err: any) {
      toast.error("Sözleşme yazdırılamadı", {
        description: err?.message ?? "Kayıt oluşturuldu; listeden yeniden yazdırabilirsiniz.",
      });
    }
  };

  const save = async (thenPrint: boolean) => {
    const error = validationError();
    if (error) return toast.error(editDocument ? "Sözleşme güncellenemedi" : "Sözleşme oluşturulamadı", { description: error });
    setSaving(true);
    try {
      const termDays = paymentTermDays.trim() === "" ? undefined : Number(paymentTermDays);
      const payload = {
        ...quickPartyPayload(party),
        divisionId: divisionId || undefined,
        contractNo: contractNo.trim() || undefined,
        signedDate: new Date(signedDate),
        paymentTermDays: termDays !== undefined && Number.isFinite(termDays) ? termDays : undefined,
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
        deliveryLocation: deliveryLocation.trim() || undefined,
        estimatedDeliveryDaysMin: deliveryDaysMin.trim() === "" ? undefined : Number(deliveryDaysMin),
        estimatedDeliveryDaysMax: deliveryDaysMax.trim() === "" ? undefined : Number(deliveryDaysMax),
        importCostsExcluded,
        vatIncluded,
        freightPaidBySeller,
        installments: installments.length
          ? installments.map((row) => ({
              label: row.label.trim() || (row.promissoryNote ? "Senet" : undefined),
              amount: parseMoneyInput(row.amount),
              dueDate: row.dueDate ? new Date(row.dueDate) : undefined,
              promissoryNote: row.promissoryNote,
            }))
          : undefined,
      };
      const saved = editDocument
        ? await documentService.updateStandaloneContract(editDocument.id, payload)
        : await documentService.createStandaloneContract(payload);
      toast.success(editDocument ? "Sözleşme güncellendi" : "Sözleşme oluşturuldu", { description: saved?.contractNo });
      if (thenPrint) await printCreated(saved ?? createdContractToDocument(saved));
      await refresh();
      onCreated?.(saved?.id ?? "");
      setOpen(false);
    } catch (err: any) {
      toast.error(editDocument ? "Sözleşme güncellenemedi" : "Sözleşme oluşturulamadı", {
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
            {editDocument ? "Hızlı Sözleşmeyi Düzenle" : "Hızlı Sözleşme"}
          </DialogTitle>
          <DialogDescription>
            {editDocument
              ? `${editDocument.fileName} belgesinin firma bilgisi, kalemleri ve şartlarını güncelleyin.`
              : "Teklif açmadan sözleşme kesin. Kalemleri doğrudan yazarsınız; bu belge hiçbir teklife bağlanmaz."}
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
                    {installments.length > 0 && (
                      <QuickSummaryRow
                        label="Ödeme planı"
                        value={`${installments.length} vade · ${formatMoneyInput(installmentTotal)} ${currencyCode}`}
                      />
                    )}
                  </dl>
                </DialogSidebarSection>

                <DocumentDiscountFields
                  value={documentDiscount}
                  onChange={setDocumentDiscount}
                  currency={currencyCode}
                  idPrefix="quick-contract-discount"
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
                      : (editDocument ? "Sözleşmeyi Güncelle" : "Sözleşme Oluştur")}
                  </Button>
                </DialogFooter>
              </>
            }
          >
            <div className="space-y-4">
              <QuickPartySection
                idPrefix="quick-contract"
                value={party}
                onChange={setParty}
                manualNote="Elle girilen firma hiçbir cariye bağlanmaz; bu sözleşme raporlarda firmasız görünür."
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
                  <Label className="text-xs" htmlFor="quick-contract-no">Sözleşme No</Label>
                  <Input id="quick-contract-no" className="mt-1.5 font-data" value={contractNo} onChange={(e) => setContractNo(e.target.value)} placeholder="Otomatik" />
                </div>
                <div>
                  <Label className="text-xs" htmlFor="quick-contract-date">İmza Tarihi</Label>
                  <Input id="quick-contract-date" type="date" className="mt-1.5" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} />
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

              <QuickFreeItemsEditor
                items={items}
                onChange={setItems}
                currencyCode={currencyCode}
                hint="Açıklama, adet ve fiyatı doğrudan yazın. Aksesuar satırı için açıklamayı “↳ Opsiyon: …” ile başlatın."
              />

              <section className="rounded-xl border border-border/70 bg-card p-3">
                <p className="text-xs font-semibold">Teslim ve Vade</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label className="text-xs" htmlFor="quick-contract-delivery-location">Teslim Yeri</Label>
                    <Input id="quick-contract-delivery-location" className="mt-1.5" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} placeholder="Örn. Bursa" />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="quick-contract-days-min">Teslim (en erken gün)</Label>
                    <Input id="quick-contract-days-min" type="number" min={0} max={3650} className="mt-1.5" value={deliveryDaysMin} onChange={(e) => setDeliveryDaysMin(e.target.value)} placeholder="Örn. 60" />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="quick-contract-days-max">Teslim (en geç gün)</Label>
                    <Input id="quick-contract-days-max" type="number" min={0} max={3650} className="mt-1.5" value={deliveryDaysMax} onChange={(e) => setDeliveryDaysMax(e.target.value)} placeholder="Örn. 90" />
                    <p className="mt-1 text-[10px] text-muted-foreground">Sözleşmedeki teslim ayı bu günden hesaplanır.</p>
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="quick-contract-payment-days">Ödeme Vadesi (Gün)</Label>
                    <Input id="quick-contract-payment-days" type="number" min={0} max={3650} className="mt-1.5" value={paymentTermDays} onChange={(e) => setPaymentTermDays(e.target.value)} placeholder="Örn. 60" />
                    <p className="mt-1 text-[10px] text-muted-foreground">Bu firmaya fatura kesilirken vade önerisi olur.</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Switch checked={!importCostsExcluded} onCheckedChange={(next) => setImportCostsExcluded(!next)} />
                    İthalat masrafları fiyata dahil
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Switch checked={vatIncluded} onCheckedChange={setVatIncluded} />
                    K.D.V. fiyata dahil (sözleşme 3.3 — yazılan tutar brüt basılır)
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Switch checked={freightPaidBySeller} onCheckedChange={setFreightPaidBySeller} />
                    Nakliye ve sigorta HAKSAN'a ait (sözleşme 2.6)
                  </label>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-semibold">Ödeme Planı</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Boş bırakılırsa sözleşme çıktısında ödeme planı tablosu basılmaz.
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => setInstallments((current) => [...current, emptyInstallment()])}>
                    <Plus className="size-3.5" /> Vade Ekle
                  </Button>
                </div>
                {installments.length === 0 ? (
                  <p className="px-3 py-3 text-[11px] text-muted-foreground">Henüz vade eklenmedi.</p>
                ) : (
                  <div className="divide-y divide-border/60">
                    {installments.map((row) => (
                      <div key={row.key} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_132px_150px_92px_32px] sm:items-end">
                        <div className="min-w-0">
                          <Label className="text-[10px] text-muted-foreground" htmlFor={`${row.key}-label`}>Açıklama</Label>
                          <Input id={`${row.key}-label`} className="mt-1 h-9" value={row.label} onChange={(e) => patchInstallment(row.key, { label: e.target.value })} placeholder="Peşinat / 1. taksit" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground" htmlFor={`${row.key}-amount`}>Tutar</Label>
                          <Input id={`${row.key}-amount`} inputMode="decimal" className="mt-1 h-9 text-right font-data" value={row.amount} onChange={(e) => patchInstallment(row.key, { amount: e.target.value })} placeholder="0,00" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground" htmlFor={`${row.key}-due`}>Vade Tarihi</Label>
                          <Input id={`${row.key}-due`} type="date" className="mt-1 h-9" value={row.dueDate} onChange={(e) => patchInstallment(row.key, { dueDate: e.target.value })} />
                        </div>
                        <label className="flex h-9 items-center gap-2 text-[11px] text-muted-foreground">
                          <Switch checked={row.promissoryNote} onCheckedChange={(next) => patchInstallment(row.key, { promissoryNote: next })} />
                          Senet
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="mb-0.5 size-9 text-muted-foreground hover:text-destructive"
                          title="Vadeyi sil"
                          onClick={() => setInstallments((current) => current.filter((entry) => entry.key !== row.key))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <DocumentTermsTemplateEditor
                markerStyle="none"
                title="Sözleşme Şartları"
                description="Şablon seçin veya metni yazın. Bu belge bir teklife bağlı olmadığı için şartlar yalnızca sözleşmeye kaydedilir."
                templateScope={CONTRACT_TERMS_TEMPLATE_SCOPE}
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
