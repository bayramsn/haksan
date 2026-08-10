import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RemoteCompanyCombobox } from "./RemoteCompanyCombobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { formatMoneyInput, parseMoneyInput, type ProformaPriceRow } from "../../lib/proformaPricing";

/**
 * "Hızlı" belgelerin (proforma / sözleşme / teklif) ortak düzenleyici parçaları.
 *
 * Üç belge de aynı işi yapar: bir üst kayıt (teklif ya da fırsat) açmadan, alıcıyı
 * ve serbest kalemleri doğrudan belgeye yazmak. Alan listesi ve doğrulama kuralları
 * API'deki `standalone*` şemalarıyla birebir aynı olmak zorunda olduğu için tek
 * yerde tutulur; üç dialogda üç kopya tutmak kuralların sessizce ayrışmasına yol açar.
 */

export const QUICK_UNIT_CODES = ["adet", "takım", "set", "metre", "kg", "saat"];
export const QUICK_CURRENCIES = ["USD", "EUR", "TRY"];

export type QuickFreeItem = {
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
export const emptyQuickFreeItem = (): QuickFreeItem => ({
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
export const parseQuickNumber = (raw: string) => {
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

/** Belge anlık görüntüsündeki kalemleri düzenleyici satırlarına geri yükler. */
export const quickFreeItemsFromSnapshot = (snapshotItems: unknown): QuickFreeItem[] =>
  (Array.isArray(snapshotItems) ? snapshotItems : []).map((item: any) => ({
    ...emptyQuickFreeItem(),
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
  }));

/** Düzenleyici satırlarını toplam hesabının beklediği sayısal biçime çevirir. */
export const quickFreeItemsToRows = (items: QuickFreeItem[]): ProformaPriceRow[] =>
  items.map((item) => ({
    quoteItemId: item.key,
    description: item.description,
    quantity: parseQuickNumber(item.quantity),
    unitCode: item.unitCode,
    unitPrice: parseMoneyInput(item.unitPrice),
    discountAmount: parseMoneyInput(item.discountAmount),
    vatRate: parseQuickNumber(item.vatRate),
  }));

/**
 * API'ye gidecek kalem gövdesi. Yalnızca açıklaması yazılmış satırlar gönderilir;
 * boş bırakılan "Satır Ekle" satırları sessizce elenir.
 */
export const quickFreeItemsPayload = (items: QuickFreeItem[], options: { productDetails: boolean }) =>
  quickFreeItemsToRows(items)
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
        ...(options.productDetails
          ? {
              brand: source?.brand.trim() || undefined,
              model: source?.model.trim() || undefined,
              originCountry: source?.originCountry.trim() || undefined,
              hsCode: source?.hsCode.trim() || undefined,
            }
          : {}),
      };
    });

/**
 * Kaydetmeden önceki kalem doğrulaması. Kurallar API'deki `proformaFreeItemSchema`
 * ile aynıdır; amaç hatayı sunucuya gitmeden göstermek.
 */
export const quickItemsValidationError = (rows: ProformaPriceRow[]): string | null => {
  const filled = rows.filter((row) => row.description.trim() || row.unitPrice > 0);
  if (!filled.length) return "En az bir kalem girin";
  if (filled.some((row) => !row.description.trim())) return "Her kalemin açıklaması olmalı";
  if (filled.some((row) => row.quantity <= 0)) return "Kalem adedi sıfırdan büyük olmalı";
  if (filled.some((row) => row.discountAmount > row.quantity * row.unitPrice + 0.0001)) {
    return "Satır iskontosu brüt tutarını aşamaz";
  }
  return null;
};

export type QuickPartyState = {
  /** Kayıtlı cari yerine elle girilen firma. */
  manualCompany: boolean;
  companyId: string;
  companyName: string;
  companyAddress: string;
  companyTaxOffice: string;
  companyTaxNumber: string;
  contactName: string;
  contactPhone: string;
};

export const emptyQuickParty = (): QuickPartyState => ({
  manualCompany: false,
  companyId: "",
  companyName: "",
  companyAddress: "",
  companyTaxOffice: "",
  companyTaxNumber: "",
  contactName: "",
  contactPhone: "",
});

/** Düzenleme modunda alıcı bloğunu belgenin anlık görüntüsünden geri yükler. */
export const quickPartyFromSnapshot = (snapshot: Record<string, any> | undefined): QuickPartyState => {
  if (!snapshot) return emptyQuickParty();
  const hasCompanyRecord = Boolean(snapshot.company?.id);
  return {
    manualCompany: !hasCompanyRecord,
    companyId: snapshot.company?.id ?? "",
    companyName: snapshot.company?.legalTitle ?? "",
    companyAddress: snapshot.companyAddresses?.[0]?.fullAddress ?? "",
    companyTaxOffice: snapshot.company?.taxOffice ?? "",
    companyTaxNumber: snapshot.company?.taxNumber ?? "",
    contactName: snapshot.contact?.fullName ?? "",
    contactPhone: snapshot.contact?.mobilePhone ?? "",
  };
};

/** Alıcı alanlarının API gövdesindeki karşılığı. */
export const quickPartyPayload = (party: QuickPartyState) => ({
  companyId: party.manualCompany ? undefined : party.companyId,
  companyName: party.manualCompany ? party.companyName.trim() : undefined,
  companyAddress: party.manualCompany ? party.companyAddress.trim() || undefined : undefined,
  companyTaxOffice: party.manualCompany ? party.companyTaxOffice.trim() || undefined : undefined,
  companyTaxNumber: party.manualCompany ? party.companyTaxNumber.trim() || undefined : undefined,
  contactName: party.contactName.trim() || undefined,
  contactPhone: party.contactPhone.trim() || undefined,
});

export const quickPartyValidationError = (party: QuickPartyState): string | null => {
  if (!party.manualCompany && !party.companyId) return "Firma seçin veya elle girişe geçin";
  if (party.manualCompany && !party.companyName.trim()) return "Firma unvanını yazın";
  return null;
};

/**
 * Alıcı bloğu. `allowManualCompany` kapalıyken yalnızca kayıtlı cari seçilebilir —
 * teklif; cari, alacak ve sipariş akışlarını beslediği için firmasız kesilemez.
 */
export function QuickPartySection({
  idPrefix,
  value,
  onChange,
  allowManualCompany = true,
  manualNote,
}: {
  idPrefix: string;
  value: QuickPartyState;
  onChange: (next: QuickPartyState) => void;
  allowManualCompany?: boolean;
  manualNote?: string;
}) {
  const patch = (next: Partial<QuickPartyState>) => onChange({ ...value, ...next });

  return (
    <section className="rounded-xl border border-border/70 bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold">Firma</p>
        {allowManualCompany && (
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Switch checked={value.manualCompany} onCheckedChange={(next) => patch({ manualCompany: next })} />
            Kayıtlı değil, elle gireceğim
          </label>
        )}
      </div>

      {allowManualCompany && value.manualCompany ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs" htmlFor={`${idPrefix}-company`}>Firma Unvanı *</Label>
            <Input
              id={`${idPrefix}-company`}
              className="mt-1.5"
              value={value.companyName}
              onChange={(e) => patch({ companyName: e.target.value })}
              placeholder="ÖRNEK MAKİNA SAN. TİC. LTD. ŞTİ."
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs" htmlFor={`${idPrefix}-address`}>Adres</Label>
            <Input
              id={`${idPrefix}-address`}
              className="mt-1.5"
              value={value.companyAddress}
              onChange={(e) => patch({ companyAddress: e.target.value })}
              placeholder="Organize Sanayi Bölgesi, Bursa"
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor={`${idPrefix}-tax-office`}>Vergi Dairesi</Label>
            <Input
              id={`${idPrefix}-tax-office`}
              className="mt-1.5"
              value={value.companyTaxOffice}
              onChange={(e) => patch({ companyTaxOffice: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor={`${idPrefix}-tax-number`}>Vergi No</Label>
            <Input
              id={`${idPrefix}-tax-number`}
              className="mt-1.5 font-data"
              value={value.companyTaxNumber}
              onChange={(e) => patch({ companyTaxNumber: e.target.value })}
            />
          </div>
          <p className="sm:col-span-2 text-[10px] leading-relaxed text-muted-foreground">
            {manualNote ?? "Elle girilen firma hiçbir cariye bağlanmaz; bu belge raporlarda firmasız görünür."}
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <RemoteCompanyCombobox
            value={value.companyId}
            onValueChange={(next) => patch({ companyId: next })}
            placeholder="Firma seçin…"
            searchPlaceholder="Firma adı ara..."
          />
          {value.companyId && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Adres, telefon ve vergi bilgileri firma kaydından belgeye yazılır.
            </p>
          )}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs" htmlFor={`${idPrefix}-contact`}>İlgili Kişi</Label>
          <Input
            id={`${idPrefix}-contact`}
            className="mt-1.5"
            value={value.contactName}
            onChange={(e) => patch({ contactName: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor={`${idPrefix}-phone`}>İlgili Telefon</Label>
          <Input
            id={`${idPrefix}-phone`}
            className="mt-1.5 font-data"
            value={value.contactPhone}
            onChange={(e) => patch({ contactPhone: e.target.value })}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Serbest kalem tablosu. Katalog bağı yoktur; açıklama, adet ve fiyat doğrudan yazılır.
 * `showProductDetails` yalnızca ihracat belgelerinde (proforma / sözleşme) açılır —
 * Marka / Model / Menşei / G.T.İ.P. satırları oradaki PDF'e basılır.
 */
export function QuickFreeItemsEditor({
  items,
  onChange,
  currencyCode,
  hint,
  showProductDetails = true,
}: {
  items: QuickFreeItem[];
  onChange: (next: QuickFreeItem[]) => void;
  currencyCode: string;
  hint?: string;
  showProductDetails?: boolean;
}) {
  const rows = quickFreeItemsToRows(items);
  const patchItem = (key: string, patch: Partial<QuickFreeItem>) =>
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2.5">
        <div>
          <p className="text-xs font-semibold">Kalemler</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {hint ?? "Açıklama, adet ve fiyatı doğrudan yazın. Katalog bağı yoktur."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          onClick={() => onChange([...items, emptyQuickFreeItem()])}
        >
          <Plus className="size-3.5" /> Satır Ekle
        </Button>
      </div>

      <div className="divide-y divide-border/60">
        {items.map((item, index) => {
          const row = rows[index];
          const lineTotal = Math.max(0, row.quantity * row.unitPrice - row.discountAmount);
          const overDiscount = row.discountAmount > row.quantity * row.unitPrice + 0.0001;
          return (
            <div key={item.key} className="px-3 py-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_72px_92px_128px_104px_58px_32px] sm:items-end">
                <div className="min-w-0">
                  <Label className="text-[10px] text-muted-foreground" htmlFor={`${item.key}-description`}>Açıklama *</Label>
                  <Input
                    id={`${item.key}-description`}
                    className="mt-1 h-9"
                    value={item.description}
                    onChange={(e) => patchItem(item.key, { description: e.target.value })}
                    placeholder={`Ürün / hizmet ${index + 1}`}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground" htmlFor={`${item.key}-quantity`}>Adet</Label>
                  <Input
                    id={`${item.key}-quantity`}
                    inputMode="decimal"
                    className="mt-1 h-9 text-right font-data"
                    value={item.quantity}
                    onChange={(e) => patchItem(item.key, { quantity: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Birim</Label>
                  <Select value={item.unitCode} onValueChange={(value) => patchItem(item.key, { unitCode: value })}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QUICK_UNIT_CODES.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground" htmlFor={`${item.key}-price`}>Birim Fiyat</Label>
                  <Input
                    id={`${item.key}-price`}
                    inputMode="decimal"
                    className="mt-1 h-9 text-right font-data"
                    value={item.unitPrice}
                    onChange={(e) => patchItem(item.key, { unitPrice: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground" htmlFor={`${item.key}-discount`}>İskonto</Label>
                  <Input
                    id={`${item.key}-discount`}
                    inputMode="decimal"
                    aria-invalid={overDiscount || undefined}
                    className="mt-1 h-9 text-right font-data"
                    value={item.discountAmount}
                    onChange={(e) => patchItem(item.key, { discountAmount: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground" htmlFor={`${item.key}-vat`}>KDV %</Label>
                  <Input
                    id={`${item.key}-vat`}
                    inputMode="decimal"
                    className="mt-1 h-9 text-right font-data"
                    value={item.vatRate}
                    onChange={(e) => patchItem(item.key, { vatRate: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mb-0.5 size-9 text-muted-foreground hover:text-destructive"
                  title="Satırı sil"
                  disabled={items.length === 1}
                  onClick={() => onChange(items.filter((entry) => entry.key !== item.key))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                {showProductDetails ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => patchItem(item.key, { detailOpen: !item.detailOpen })}
                  >
                    <ChevronDown className={`size-3 transition-transform ${item.detailOpen ? "rotate-180" : ""}`} />
                    Marka / Model / Menşei / G.T.İ.P.
                  </button>
                ) : (
                  <span />
                )}
                <span className="font-data text-xs tabular-nums">
                  {overDiscount ? (
                    <span className="text-warning">İskonto brüt tutarı aşıyor</span>
                  ) : (
                    <>Satır toplamı: <strong>{formatMoneyInput(lineTotal)} {currencyCode}</strong></>
                  )}
                </span>
              </div>

              {showProductDetails && item.detailOpen && (
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
  );
}

export function QuickSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-2 text-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground/90">{value}</dd>
    </div>
  );
}
