import { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Save } from "lucide-react";
import { toast } from "sonner";
import type { DocumentItem } from "../../lib/mock";
import {
  computeProformaTotals, EMPTY_DOCUMENT_DISCOUNT, proformaRowError, quoteToProformaPriceRows,
  snapshotToDocumentDiscount, snapshotToProformaPriceRows,
  type DocumentDiscount, type ProformaPriceRow,
} from "../../lib/proformaPricing";
import { useStore } from "../../lib/store";
import { documentService, quoteService } from "../../../lib/services";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Switch } from "../ui/switch";
import { DocumentDiscountFields, ProformaItemsEditor, ProformaTotalsPanel } from "../shared/ProformaItemsEditor";
import {
  DocumentTermsTemplateEditor, matchSavedTermsTemplate, useTermsTemplates,
} from "./DocumentTermsTemplateEditor";
import { CONTRACT_NOTE_VARIANTS, type QuoteNoteVariant } from "../../lib/print";

/**
 * Teklife bağlı proforma / sözleşmenin KENDİ fiyatını, iskontosunu ve şartlarını
 * düzenler.
 *
 * Onaylanan teklif kilitlidir (API: "Kesinleşmiş teklif değiştirilemez; yeni bir
 * revizyon oluşturun"), oysa imza masasında fiyat da şart da hâlâ pazarlığa
 * açıktır. Girilenler belgenin kendi anlık görüntüsüne yazılır; bağlı teklif ve
 * aynı teklife bağlı diğer belgeler değişmez.
 *
 * Proforma ve sözleşme düzenleyicileri satır satır aynıydı; ayrı dosyalarda
 * durdukları sürece biri diğerinden geride kalıyordu (iskonto proformaya,
 * şartlar hiçbirine gelmemişti). Fark artık tek bir tabloda.
 */
type DocumentKind = "proforma" | "contract";

const KIND_CONFIG = {
  proforma: {
    label: "Proforma",
    templateScope: "proforma_terms",
    idPrefix: "edit-proforma",
    // Proforma çıktısı üç şart bloğunu tek kesintisiz numaralı listede basar.
    termsProps: { continuousNumbering: true },
    // Proformanın hazır metinleri düz "NOTLAR" listesi olarak ayrı seçiliyor;
    // şart kutularına teklif ya da sözleşme şablonu düşürmek yanlış dil basardı.
    builtInVariants: [] as QuoteNoteVariant[],
    totalsNote: ({ customs }: TotalsNoteContext) => customs > 0
      ? "Millileştirme tutarı bağlı teklifin güncel değeridir; kayıtta fiyatlara göre yeniden hesaplanır."
      : undefined,
  },
  contract: {
    label: "Sözleşme",
    templateScope: "contract_terms",
    idPrefix: "edit-contract",
    // Sözleşme şartları madde madde numaralanmaz; çıktı kendi 2.x/3.x sırasını basar.
    termsProps: { markerStyle: "none" as const },
    builtInVariants: CONTRACT_NOTE_VARIANTS,
    totalsNote: ({ vatIncluded }: TotalsNoteContext) => vatIncluded
      ? "K.D.V. dahil seçili: sözleşme çıktısındaki tutar bu net bedelin K.D.V.'li karşılığıdır."
      : "Sözleşme çıktısındaki tutar K.D.V. hariç net bedeldir (ara toplam + millileştirme).",
  },
} satisfies Record<DocumentKind, unknown>;

type TotalsNoteContext = { vatIncluded: boolean; customs: number };

/** Metin kutularının dışında kalan, seçimle belirlenen şartlar. */
type TermsMetadata = {
  importCostsExcluded: boolean;
  /** Sözleşme 3.3 — fiyata K.D.V. dahil mi? */
  vatIncluded: boolean;
  /** Sözleşme 2.6 — nakliye ve sigorta satıcıya mı ait? */
  freightPaidBySeller: boolean;
  deliveryLocation?: string;
  estimatedDeliveryDaysMin?: number;
  estimatedDeliveryDaysMax?: number;
};

const EMPTY_TERMS_METADATA: TermsMetadata = {
  importCostsExcluded: true,
  vatIncluded: false,
  freightPaidBySeller: false,
};

export function EditDocumentDialog({
  document,
  trigger,
}: {
  document: DocumentItem;
  trigger: React.ReactNode;
}) {
  const kind: DocumentKind = document.type === "Contract" ? "contract" : "proforma";
  const config = KIND_CONFIG[kind];
  const { offers, noteTemplates, addNoteTemplate, updateNoteTemplate, deleteNoteTemplate, refresh } = useStore();
  const savedTermsTemplates = useTermsTemplates(noteTemplates, config.templateScope);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProformaPriceRow[]>([]);
  const [documentDiscount, setDocumentDiscount] = useState<DocumentDiscount>(EMPTY_DOCUMENT_DISCOUNT);
  // Toplamların yazdırılan belgeyle örtüşmesi için teklifin iskonto/gümrük bağlamı.
  const [quoteTotals, setQuoteTotals] = useState({ discountTotal: 0, headerDiscountAmount: 0, customsTotal: 0 });
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const [termsMetadata, setTermsMetadata] = useState<TermsMetadata>(EMPTY_TERMS_METADATA);
  const [termsTemplateKey, setTermsTemplateKey] = useState("");
  const [termsDirty, setTermsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const currency = String(
    document.documentSnapshot?.currency?.code
      ?? offers.find((offer) => offer.id === document.quoteId)?.currency
      ?? "USD",
  );
  const totals = useMemo(
    () => computeProformaTotals(rows, {
      quoteDiscountTotal: quoteTotals.discountTotal,
      headerDiscountAmount: quoteTotals.headerDiscountAmount,
      customsTotal: quoteTotals.customsTotal,
      documentDiscount,
    }),
    [documentDiscount, rows, quoteTotals],
  );
  const rowError = rows.map(proformaRowError).find(Boolean) ?? null;
  /**
   * Hazır şablondaki {{…}} yer tutucuları belgenin kendi verisinden dolar:
   * alıcı unvanı ve KDV oranı anlık görüntüden, kontrol ünitesi markası ürünün
   * teknik özelliklerinden (baskı tarafındaki `inferControlUnitBrand` ile aynı
   * kaynak). Elle yazılırsa belgeye yanlış marka/oran girme riski vardı.
   */
  const termsFillContext = useMemo(() => {
    const snapshot: any = document.documentSnapshot ?? {};
    const specs: { key: string; value: string }[] = Array.isArray(snapshot.items)
      ? snapshot.items.flatMap((item: any) => (Array.isArray(item?.specs) ? item.specs : []))
      : [];
    const controlSpec = specs.find((spec) => /(?:cnc|kontrol)\s*(?:ünite|unite)|kontrol sistemi/i.test(String(spec?.key ?? "")));
    return {
      alici: String(snapshot.company?.legalTitle ?? snapshot.company?.shortName ?? "").trim() || undefined,
      kdvOrani: rows[0]?.vatRate ?? 20,
      kontrolMarka: String(controlSpec?.value ?? "").match(/MITSUBISHI|FANUC|SIEMENS|HEIDENHAIN|SYNTEC/i)?.[0]?.toUpperCase(),
    };
  }, [document.documentSnapshot, rows]);

  useEffect(() => {
    if (!open || !document.quoteId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const quote: any = await quoteService.get(document.quoteId!);
        if (cancelled) return;
        // Daha önce belgeye yazılmış fiyat varsa onunla aç; kalem listesi
        // (adet, açıklama) her zaman canlı teklifden gelir.
        setDocumentDiscount(snapshotToDocumentDiscount(document.documentSnapshot));
        const storedRows = snapshotToProformaPriceRows(document.documentSnapshot);
        const quoteRows = quoteToProformaPriceRows(quote);
        const storedById = new Map(storedRows.map((row) => [row.quoteItemId, row]));
        setRows(quoteRows.map((row) => {
          const stored = storedById.get(row.quoteItemId);
          return stored ? { ...row, unitPrice: stored.unitPrice, discountAmount: stored.discountAmount } : row;
        }));
        setQuoteTotals({
          // İskonto tabanı canlı tekliftir: API teklif geneli iskontoyu her kayıtta
          // güncel teklifden yeniden türetir. Gümrük ise belgede saklanan değerdir —
          // yazdırılan çıktı da onu kullanır.
          discountTotal: Number(quote.discountTotal ?? 0) || 0,
          headerDiscountAmount: Number(quote.headerDiscountAmount ?? 0) || 0,
          customsTotal:
            Number(document.documentSnapshot?.quote?.customsTotal ?? quote.customsTotal ?? 0) || 0,
        });
        // Belgenin kendi şartı varsa onunla aç; yoksa teklif ön-dolgu kaynağıdır.
        const terms: any = document.documentSnapshot?.terms ?? quote.terms ?? {};
        const payment = String(terms.paymentTermsText ?? quote.paymentTerms ?? "");
        const delivery = String(terms.deliveryTermsText ?? quote.deliveryTerms ?? "");
        const warranty = String(terms.warrantyTermsText ?? quote.warrantyTerms ?? "");
        setPaymentTerms(payment);
        setDeliveryTerms(delivery);
        setWarrantyTerms(warranty);
        setTermsMetadata({
          importCostsExcluded: terms.importCostsExcluded ?? true,
          vatIncluded: terms.vatIncluded ?? false,
          freightPaidBySeller: terms.freightPaidBySeller ?? false,
          deliveryLocation: terms.deliveryLocation ?? undefined,
          estimatedDeliveryDaysMin: terms.estimatedDeliveryDaysMin ?? undefined,
          estimatedDeliveryDaysMax: terms.estimatedDeliveryDaysMax ?? undefined,
        });
        setTermsTemplateKey(matchSavedTermsTemplate(payment, delivery, warranty, savedTermsTemplates));
        setTermsDirty(false);
      } catch (error: unknown) {
        if (cancelled) return;
        toast.error(`${config.label} bilgileri alınamadı`, {
          description: error instanceof Error ? error.message : "Bağlı teklif okunamadı.",
        });
        setRows([]);
        setDocumentDiscount(EMPTY_DOCUMENT_DISCOUNT);
        setQuoteTotals({ discountTotal: 0, headerDiscountAmount: 0, customsTotal: 0 });
        setPaymentTerms("");
        setDeliveryTerms("");
        setWarrantyTerms("");
        setTermsMetadata(EMPTY_TERMS_METADATA);
        setTermsTemplateKey("");
        setTermsDirty(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // savedTermsTemplates bilerek dışarıda: yeni şablon kaydı store'u tazeler ve
    // düzenlenmekte olan şartların üzerine yazardı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, document.documentSnapshot, document.quoteId, config.label]);

  const save = async () => {
    if (!rows.length) return;
    if (rowError) return toast.error(`${config.label} güncellenemedi`, { description: rowError });
    setSaving(true);
    try {
      const payload = {
        items: rows.map((row) => ({
          quoteItemId: row.quoteItemId,
          unitPrice: row.unitPrice,
          discountAmount: row.discountAmount,
        })),
        headerDiscountAmount: documentDiscount.amount,
        headerDiscountPercent: documentDiscount.percent,
        // Şartlara dokunulmadıysa gönderilmez; belge mevcut şartlarıyla basılır.
        ...(termsDirty
          ? {
              terms: {
                paymentTermsText: paymentTerms,
                deliveryTermsText: deliveryTerms,
                warrantyTermsText: warrantyTerms,
                ...termsMetadata,
              },
            }
          : {}),
      };
      // İki uç ayrı gövde tipi bekliyor; dallanma tip denetimini koruyor.
      if (kind === "contract") await documentService.updateContract(document.id, payload);
      else await documentService.updateProforma(document.id, payload);
      await refresh();
      toast.success(`${config.label} güncellendi`, { description: document.fileName });
      setOpen(false);
    } catch (error: unknown) {
      toast.error(`${config.label} güncellenemedi`, {
        description: error instanceof Error ? error.message : "İstek başarısız oldu.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* Portallı içerik React ağacında satıra kadar kabarabildiği için tıklama/işaretçi
          olaylarını burada durdur; aksi halde satırın onClick'i belge detayını açıyor. */}
      <DialogContent
        className="w-[min(880px,calc(100vw-2rem))] max-w-none sm:max-w-none"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeDollarSign className="size-5 text-primary" />
            {config.label} Fiyat ve Şartlarını Düzenle
          </DialogTitle>
          <DialogDescription>
            {document.fileName} için anlaşılan brüt birim fiyatları, iskontoyu ve şartları girin.
            Bağlı teklif değişmez; belge bundan sonra burada kayıtlı değerlerle basılır.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <ProformaItemsEditor
            rows={rows}
            onRowsChange={setRows}
            currency={currency}
            loading={loading}
            idPrefix={`${config.idPrefix}-price`}
            description={`Brüt birim fiyat ve ürüne özel iskonto bu ${config.label.toLocaleLowerCase("tr-TR")}ya özel düzenlenir; bağlı teklif değişmez.`}
            emptyText="Fiyatlandırılacak ürün kalemi bulunamadı."
          />

          <DocumentDiscountFields
            value={documentDiscount}
            onChange={setDocumentDiscount}
            currency={currency}
            idPrefix={`${config.idPrefix}-discount`}
            disabled={saving || loading}
          />

          <ProformaTotalsPanel
            totals={totals}
            currency={currency}
            note={config.totalsNote({ vatIncluded: termsMetadata.vatIncluded, customs: totals.customs })}
          />

          <DocumentTermsTemplateEditor
            {...config.termsProps}
            builtInVariants={config.builtInVariants}
            fillContext={termsFillContext}
            title={`${config.label} Şartları`}
            description={`Şablon seçin veya metni düzenleyin. Değişiklik yalnız bu ${config.label.toLocaleLowerCase("tr-TR")}ya işlenir; bağlı teklifin şartları olduğu gibi kalır.`}
            templateScope={config.templateScope}
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

          {/* Sözleşme çıktısındaki 2.6 / 3.3 maddeleri metin değil seçimdir;
              proforma bu maddeleri basmaz, o yüzden yalnız sözleşmede görünür. */}
          {kind === "contract" && (
            <div className="grid gap-2 rounded-xl border border-border/70 bg-card p-3">
              <p className="text-xs font-semibold">Sözleşme Maddeleri</p>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Switch
                  checked={termsMetadata.vatIncluded}
                  disabled={saving || loading}
                  onCheckedChange={(next) => {
                    setTermsMetadata((current) => ({ ...current, vatIncluded: next }));
                    setTermsDirty(true);
                  }}
                />
                K.D.V. fiyata dahil (madde 3.3 — yazılan tutar brüt basılır)
              </label>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Switch
                  checked={termsMetadata.freightPaidBySeller}
                  disabled={saving || loading}
                  onCheckedChange={(next) => {
                    setTermsMetadata((current) => ({ ...current, freightPaidBySeller: next }));
                    setTermsDirty(true);
                  }}
                />
                Nakliye ve sigorta HAKSAN'a ait (madde 2.6)
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
          <Button type="button" className="gap-1.5" onClick={() => void save()} disabled={saving || loading || !rows.length}>
            <Save className="size-4" />
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
