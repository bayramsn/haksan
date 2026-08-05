import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Printer, Save, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Combobox } from "../ui/combobox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { DialogSplitLayout, DialogSidebarSection } from "../shared/DialogSplitLayout";
import { ProformaTotalsPanel } from "../shared/ProformaItemsEditor";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { documentService } from "../../../lib/services";
import { DocumentTermsTemplateEditor, useTermsTemplates } from "./DocumentTermsTemplateEditor";
import { computeProformaTotals, formatMoneyInput, parseMoneyInput, type ProformaPriceRow } from "../../lib/proformaPricing";
import { loadProformaPrintData, printAssetBase, proformaDoc, PROFORMA_NOTE_OPTIONS } from "../../lib/print";
import { printOrWarn } from "../../lib/pageHelpers";
import type { DocumentItem } from "../../lib/mock";

const PROFORMA_TERMS_TEMPLATE_SCOPE = "proforma_terms";
const AUTO_VARIANT_KEY = "auto";
const CURRENCIES = ["USD", "EUR", "TRY"];
const UNIT_CODES = ["adet", "takım", "set", "metre", "kg", "saat"];

type QuickItem = {
  key: string;
  description: string;
  quantity: string;
  unitCode: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
  brand: string;
  model: string;
  originCountry: string;
  hsCode: string;
  detailOpen: boolean;
};

let itemCounter = 0;
const emptyItem = (): QuickItem => ({
  key: `quick-item-${++itemCounter}`,
  description: "",
  quantity: "1",
  unitCode: "adet",
  unitPrice: "",
  discountAmount: "",
  vatRate: "20",
  brand: "",
  model: "",
  originCountry: "",
  hsCode: "",
  detailOpen: false,
});

/** Serbest sayı girdisi (adet / KDV) — tr-TR virgülünü de kabul eder. */
const parseNumber = (raw: string) => {
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

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

  const [manualCompany, setManualCompany] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyTaxOffice, setCompanyTaxOffice] = useState("");
  const [companyTaxNumber, setCompanyTaxNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [divisionId, setDivisionId] = useState(defaultDivisionId);
  const [documentNo, setDocumentNo] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [printVariantKey, setPrintVariantKey] = useState(AUTO_VARIANT_KEY);
  const [items, setItems] = useState<QuickItem[]>([emptyItem()]);
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
      // Düzenleme: belge anlık görüntüsü tek gerçek kaynaktır — kayıtlı firma varsa
      // id'si taşınır, yoksa elle girilen alanlar geri yüklenir.
      const hasCompanyRecord = Boolean(snapshot.company?.id);
      setManualCompany(!hasCompanyRecord);
      setCompanyId(snapshot.company?.id ?? "");
      setCompanyName(snapshot.company?.legalTitle ?? "");
      setCompanyAddress(snapshot.companyAddresses?.[0]?.fullAddress ?? "");
      setCompanyTaxOffice(snapshot.company?.taxOffice ?? "");
      setCompanyTaxNumber(snapshot.company?.taxNumber ?? "");
      setContactName(snapshot.contact?.fullName ?? "");
      setContactPhone(snapshot.contact?.mobilePhone ?? "");
      setDocumentNo(editDocument?.fileName ?? "");
      setIssueDate(editDocument?.uploadedAt || today);
      setCurrencyCode(snapshot.currency?.code ?? "USD");
      setItems(
        (Array.isArray(snapshot.items) ? snapshot.items : []).map((item: any) => ({
          ...emptyItem(),
          description: String(item.description ?? ""),
          quantity: String(item.quantity ?? 1),
          unitCode: String(item.unitCode ?? "adet"),
          unitPrice: formatMoneyInput(Number(item.unitPrice ?? 0)),
          discountAmount: Number(item.discountAmount ?? 0) > 0 ? formatMoneyInput(Number(item.discountAmount)) : "",
          vatRate: String(item.vatRate ?? 20),
          brand: String(item.product?.brandName ?? ""),
          model: String(item.product?.modelName ?? ""),
          originCountry: String(item.product?.originCountry ?? ""),
          hsCode: String(item.product?.hsCode ?? ""),
        })),
      );
      setPaymentTerms(snapshot.terms?.paymentTermsText ?? "");
      setDeliveryTerms(snapshot.terms?.deliveryTermsText ?? "");
      setWarrantyTerms(snapshot.terms?.warrantyTermsText ?? "");
    } else {
      setManualCompany(false);
      setCompanyId("");
      setCompanyName("");
      setCompanyAddress("");
      setCompanyTaxOffice("");
      setCompanyTaxNumber("");
      setContactName("");
      setContactPhone("");
      setDocumentNo("");
      setIssueDate(today);
      setCurrencyCode("USD");
      setItems([emptyItem()]);
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

  const companyOptions = useMemo(
    () =>
      [...customers]
        .sort((a, b) => a.name.localeCompare(b.name, "tr"))
        .map((c) => ({
          value: c.id,
          label: c.name,
          hint: [c.district, c.city].filter(Boolean).join(" / ") || undefined,
        })),
    [customers]
  );

  const selectedCompany = customers.find((c) => c.id === companyId) ?? null;

  const patchItem = (key: string, patch: Partial<QuickItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const priceRows: ProformaPriceRow[] = useMemo(
    () =>
      items.map((item) => ({
        quoteItemId: item.key,
        description: item.description,
        quantity: parseNumber(item.quantity),
        unitCode: item.unitCode,
        unitPrice: parseMoneyInput(item.unitPrice),
        discountAmount: parseMoneyInput(item.discountAmount),
        vatRate: parseNumber(item.vatRate),
      })),
    [items]
  );
  const totals = useMemo(() => computeProformaTotals(priceRows), [priceRows]);

  const validationError = (): string | null => {
    if (!manualCompany && !companyId) return "Firma seçin veya elle girişe geçin";
    if (manualCompany && !companyName.trim()) return "Firma unvanını yazın";
    if (divisions.length > 0 && !divisionId) return "İş alanı seçin";
    const filled = priceRows.filter((row) => row.description.trim() || row.unitPrice > 0);
    if (!filled.length) return "En az bir kalem girin";
    const missingDescription = filled.find((row) => !row.description.trim());
    if (missingDescription) return "Her kalemin açıklaması olmalı";
    const zeroQuantity = filled.find((row) => row.quantity <= 0);
    if (zeroQuantity) return "Kalem adedi sıfırdan büyük olmalı";
    const overDiscount = filled.find((row) => row.discountAmount > row.quantity * row.unitPrice + 0.0001);
    if (overDiscount) return "Satır iskontosu brüt tutarını aşamaz";
    return null;
  };

  const printCreated = async (created: any) => {
    try {
      const data = await loadProformaPrintData({
        doc: createdProformaToDocument(created),
        customers,
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
        companyId: manualCompany ? undefined : companyId,
        companyName: manualCompany ? companyName.trim() : undefined,
        companyAddress: manualCompany ? companyAddress.trim() || undefined : undefined,
        companyTaxOffice: manualCompany ? companyTaxOffice.trim() || undefined : undefined,
        companyTaxNumber: manualCompany ? companyTaxNumber.trim() || undefined : undefined,
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        divisionId: divisionId || undefined,
        documentNo: documentNo.trim() || undefined,
        issueDate: new Date(issueDate),
        statusCode: "draft",
        currencyCode,
        items: priceRows
          .filter((row) => row.description.trim())
          .map((row) => {
            const source = items.find((item) => item.key === row.quoteItemId);
            return {
              description: row.description.trim(),
              quantity: row.quantity,
              unitCode: row.unitCode,
              unitPrice: row.unitPrice,
              discountAmount: row.discountAmount,
              vatRate: row.vatRate,
              brand: source?.brand.trim() || undefined,
              model: source?.model.trim() || undefined,
              originCountry: source?.originCountry.trim() || undefined,
              hsCode: source?.hsCode.trim() || undefined,
            };
          }),
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
                    <SummaryRow label="Firma" value={manualCompany ? companyName || "—" : selectedCompany?.name ?? "—"} />
                    <SummaryRow label="Kaynak" value={manualCompany ? "Elle girilen firma" : "Kayıtlı firma"} />
                    <SummaryRow label="Kalem" value={`${priceRows.filter((r) => r.description.trim()).length} satır`} />
                  </dl>
                </DialogSidebarSection>

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
              <section className="rounded-xl border border-border/70 bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold">Firma</p>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Switch checked={manualCompany} onCheckedChange={(next) => setManualCompany(next)} />
                    Kayıtlı değil, elle gireceğim
                  </label>
                </div>

                {manualCompany ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label className="text-xs" htmlFor="quick-proforma-company">Firma Unvanı *</Label>
                      <Input id="quick-proforma-company" className="mt-1.5" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="ÖRNEK MAKİNA SAN. TİC. LTD. ŞTİ." />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs" htmlFor="quick-proforma-address">Adres</Label>
                      <Input id="quick-proforma-address" className="mt-1.5" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} placeholder="Organize Sanayi Bölgesi, Bursa" />
                    </div>
                    <div>
                      <Label className="text-xs" htmlFor="quick-proforma-tax-office">Vergi Dairesi</Label>
                      <Input id="quick-proforma-tax-office" className="mt-1.5" value={companyTaxOffice} onChange={(e) => setCompanyTaxOffice(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs" htmlFor="quick-proforma-tax-number">Vergi No</Label>
                      <Input id="quick-proforma-tax-number" className="mt-1.5 font-data" value={companyTaxNumber} onChange={(e) => setCompanyTaxNumber(e.target.value)} />
                    </div>
                    <p className="sm:col-span-2 text-[10px] leading-relaxed text-muted-foreground">
                      Elle girilen firma hiçbir cariye bağlanmaz; bu proforma raporlarda firmasız görünür.
                    </p>
                  </div>
                ) : (
                  <div className="mt-3">
                    <Combobox
                      options={companyOptions}
                      value={companyId}
                      onChange={setCompanyId}
                      placeholder="Firma arayın..."
                      searchPlaceholder="Firma adı ara..."
                      emptyText="Eşleşen firma yok."
                    />
                    {selectedCompany && (
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        Adres, telefon ve vergi bilgileri firma kaydından belgeye yazılır.
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs" htmlFor="quick-proforma-contact">İlgili Kişi</Label>
                    <Input id="quick-proforma-contact" className="mt-1.5" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor="quick-proforma-phone">İlgili Telefon</Label>
                    <Input id="quick-proforma-phone" className="mt-1.5 font-data" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                  </div>
                </div>
              </section>

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
                      {CURRENCIES.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-semibold">Kalemler</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Açıklama, adet ve fiyatı doğrudan yazın. Katalog bağı yoktur.</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={() => setItems((current) => [...current, emptyItem()])}>
                    <Plus className="size-3.5" /> Satır Ekle
                  </Button>
                </div>

                <div className="divide-y divide-border/60">
                  {items.map((item, index) => {
                    const row = priceRows[index];
                    const lineTotal = Math.max(0, row.quantity * row.unitPrice - row.discountAmount);
                    const overDiscount = row.discountAmount > row.quantity * row.unitPrice + 0.0001;
                    return (
                      <div key={item.key} className="px-3 py-3">
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_72px_92px_128px_104px_58px_32px] sm:items-end">
                          <div className="min-w-0">
                            <Label className="text-[10px] text-muted-foreground" htmlFor={`${item.key}-description`}>Açıklama *</Label>
                            <Input id={`${item.key}-description`} className="mt-1 h-9" value={item.description} onChange={(e) => patchItem(item.key, { description: e.target.value })} placeholder={`Ürün / hizmet ${index + 1}`} />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground" htmlFor={`${item.key}-quantity`}>Adet</Label>
                            <Input id={`${item.key}-quantity`} inputMode="decimal" className="mt-1 h-9 text-right font-data" value={item.quantity} onChange={(e) => patchItem(item.key, { quantity: e.target.value })} />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Birim</Label>
                            <Select value={item.unitCode} onValueChange={(value) => patchItem(item.key, { unitCode: value })}>
                              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {UNIT_CODES.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground" htmlFor={`${item.key}-price`}>Birim Fiyat</Label>
                            <Input id={`${item.key}-price`} inputMode="decimal" className="mt-1 h-9 text-right font-data" value={item.unitPrice} onChange={(e) => patchItem(item.key, { unitPrice: e.target.value })} placeholder="0,00" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground" htmlFor={`${item.key}-discount`}>İskonto</Label>
                            <Input id={`${item.key}-discount`} inputMode="decimal" aria-invalid={overDiscount || undefined} className="mt-1 h-9 text-right font-data" value={item.discountAmount} onChange={(e) => patchItem(item.key, { discountAmount: e.target.value })} placeholder="0,00" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground" htmlFor={`${item.key}-vat`}>KDV %</Label>
                            <Input id={`${item.key}-vat`} inputMode="decimal" className="mt-1 h-9 text-right font-data" value={item.vatRate} onChange={(e) => patchItem(item.key, { vatRate: e.target.value })} />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="mb-0.5 size-9 text-muted-foreground hover:text-destructive"
                            title="Satırı sil"
                            disabled={items.length === 1}
                            onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={() => patchItem(item.key, { detailOpen: !item.detailOpen })}
                          >
                            <ChevronDown className={`size-3 transition-transform ${item.detailOpen ? "rotate-180" : ""}`} />
                            Marka / Model / Menşei / G.T.İ.P.
                          </button>
                          <span className="font-data text-xs tabular-nums">
                            {overDiscount ? (
                              <span className="text-warning">İskonto brüt tutarı aşıyor</span>
                            ) : (
                              <>Satır toplamı: <strong>{formatMoneyInput(lineTotal)} {currencyCode}</strong></>
                            )}
                          </span>
                        </div>

                        {item.detailOpen && (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <Input className="h-8 text-xs" value={item.brand} onChange={(e) => patchItem(item.key, { brand: e.target.value })} placeholder="Markası" aria-label="Markası" />
                            <Input className="h-8 text-xs" value={item.model} onChange={(e) => patchItem(item.key, { model: e.target.value })} placeholder="Modeli" aria-label="Modeli" />
                            <Input className="h-8 text-xs" value={item.originCountry} onChange={(e) => patchItem(item.key, { originCountry: e.target.value })} placeholder="Menşei" aria-label="Menşei" />
                            <Input className="h-8 text-xs font-data" value={item.hsCode} onChange={(e) => patchItem(item.key, { hsCode: e.target.value })} placeholder="G.T.İ.P." aria-label="G.T.İ.P." />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-2 text-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground/90">{value}</dd>
    </div>
  );
}
