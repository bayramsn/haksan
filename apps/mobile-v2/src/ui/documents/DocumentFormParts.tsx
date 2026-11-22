import { NumberedTermsPreview } from './NumberedTermsPreview';
import { Text, View } from 'react-native';
import { formatAmount } from '@/src/lib/format';
import { Eyebrow, Field, SubtleCard } from '@/src/ui';
import { TotalLine, ToggleRow } from './pickers';
import { priceRowError, type DocumentTotals, type PriceRow } from './document-logic';
import { parseDecimal } from './quote-logic';
import type { ContractClausesInput } from '@/src/api/commercial-docs.api';

/** Düzenlenen fiyat satırının metin hâli (girdi sırasında "12," gibi ara değerler korunur). */
export type PriceDraft = { unitPrice: string; discountAmount: string };

export function draftsFromRows(rows: PriceRow[]): Record<string, PriceDraft> {
  return Object.fromEntries(
    rows.map((row) => [row.quoteItemId, { unitPrice: String(row.unitPrice), discountAmount: row.discountAmount > 0 ? String(row.discountAmount) : '' }])
  );
}

/** Taslaklar satırlara uygulanır; geçersiz sayı NaN kalır ve `priceRowError` yakalar. */
export function applyDrafts(rows: PriceRow[], drafts: Record<string, PriceDraft>): PriceRow[] {
  return rows.map((row) => {
    const draft = drafts[row.quoteItemId];
    if (!draft) return row;
    const unitPrice = parseDecimal(draft.unitPrice);
    const discountAmount = draft.discountAmount.trim() ? parseDecimal(draft.discountAmount) : 0;
    return { ...row, unitPrice, discountAmount };
  });
}

export function firstPriceError(rows: PriceRow[]): string | null {
  for (const [index, row] of rows.entries()) {
    if (!Number.isFinite(row.unitPrice) || row.unitPrice < 0) return `${index + 1}. kalem: geçerli bir birim fiyat girin.`;
    if (!Number.isFinite(row.discountAmount) || row.discountAmount < 0) return `${index + 1}. kalem: geçerli bir iskonto girin.`;
    const error = priceRowError(row);
    if (error) return `${index + 1}. kalem: ${error}`;
  }
  return null;
}

/** Web `ProformaItemsEditor`: kalem listesi tekliften gelir, yalnız fiyat ve iskonto düzenlenir. */
export function PriceRowsEditor({
  title,
  hint,
  rows,
  drafts,
  onDraftChange,
  currencyCode,
}: {
  title: string;
  hint: string;
  rows: PriceRow[];
  drafts: Record<string, PriceDraft>;
  onDraftChange: (quoteItemId: string, next: PriceDraft) => void;
  currencyCode: string;
}) {
  return (
    <View className="gap-3">
      <Eyebrow>{title}</Eyebrow>
      <Text className="font-inter text-xs text-muted-foreground">{hint}</Text>
      {rows.length === 0 ? (
        <Text className="font-inter text-sm text-muted-foreground">Seçilen teklifte fiyatlandırılacak ürün kalemi bulunamadı.</Text>
      ) : null}
      {rows.map((row, index) => {
        const draft = drafts[row.quoteItemId] ?? { unitPrice: String(row.unitPrice), discountAmount: '' };
        return (
          <SubtleCard key={row.quoteItemId || String(index)} className="gap-2.5 p-3">
            <Text className="font-inter-medium text-[14px] text-foreground" numberOfLines={3}>
              {index + 1}. {row.description || 'Kalem'}
            </Text>
            <Text className="font-inter text-xs text-muted-foreground">
              {row.quantity} {row.unitCode} · KDV %{row.vatRate}
            </Text>
            <View className="flex-row gap-2">
              <View className="flex-[1.4]">
                <Field
                  label={`Birim fiyat (${currencyCode})`}
                  value={draft.unitPrice}
                  onChangeText={(value) => onDraftChange(row.quoteItemId, { ...draft, unitPrice: value })}
                  keyboardType="decimal-pad"
                />
              </View>
              <View className="flex-1">
                <Field
                  label="Satır iskontosu"
                  value={draft.discountAmount}
                  onChangeText={(value) => onDraftChange(row.quoteItemId, { ...draft, discountAmount: value })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
              </View>
            </View>
          </SubtleCard>
        );
      })}
    </View>
  );
}

/** Web `DocumentDiscountFields`: boş bırakılırsa belge teklifin genel iskontosunu devralır. */
export function DocumentDiscountFields({
  amount,
  percent,
  onAmount,
  onPercent,
  currencyCode,
}: {
  amount: string;
  percent: string;
  onAmount: (value: string) => void;
  onPercent: (value: string) => void;
  currencyCode: string;
}) {
  return (
    <View className="gap-2">
      <Eyebrow>Belge geneli iskonto</Eyebrow>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Field label={`Tutar (${currencyCode})`} value={amount} onChangeText={onAmount} keyboardType="decimal-pad" placeholder="0" />
        </View>
        <View className="flex-1">
          <Field label="Oran %" value={percent} onChangeText={onPercent} keyboardType="decimal-pad" placeholder="0" />
        </View>
      </View>
      <Text className="font-inter text-xs text-muted-foreground">Oran girilirse tutarın önüne geçer. Boşsa teklifin genel iskontosu uygulanır.</Text>
    </View>
  );
}

/** Web `ProformaTotalsPanel`. */
export function DocumentTotalsCard({ totals, currencyCode }: { totals: DocumentTotals; currencyCode: string }) {
  const money = (value: number) => formatAmount(value, currencyCode);
  return (
    <SubtleCard className="px-3 py-2">
      <TotalLine label="Brüt" value={money(totals.gross)} />
      {totals.lineDiscount > 0 ? <TotalLine label="Satır iskontosu" value={`− ${money(totals.lineDiscount)}`} /> : null}
      {totals.headerDiscount > 0 ? <TotalLine label="Genel iskonto" value={`− ${money(totals.headerDiscount)}`} /> : null}
      <TotalLine label="Ara toplam" value={money(totals.subtotal)} />
      <TotalLine label="KDV" value={money(totals.vat)} />
      {totals.customs > 0 ? <TotalLine label="Millileştirme" value={money(totals.customs)} /> : null}
      <View className="mt-1 border-t border-border pt-1">
        <TotalLine label="Genel toplam" value={money(totals.grand)} strong />
      </View>
    </SubtleCard>
  );
}

export type ContractTermsMeta = {
  importCostsExcluded: boolean;
  vatIncluded: boolean;
  freightPaidBySeller: boolean;
  deliveryLocation: string;
  estimatedDeliveryDaysMin: string;
  estimatedDeliveryDaysMax: string;
} & ContractClausesMeta;

/** Sözleşme çıktısındaki isteğe bağlı maddeler (stok, leasing, teşvik, kur farkı, takas). */
export type ContractClausesMeta = {
  inStock: boolean;
  leasingDelivery: boolean;
  investmentIncentive: boolean;
  exchangeRateDifference: boolean;
  tradeIn: boolean;
  tradeInDescription: string;
  tradeInAmount: string;
  tradeInPlusVat: boolean;
  tradeInPickup: string;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** Kayıtlı `terms.contractClauses` → form alanları. */
export function contractClausesToMeta(raw: unknown): ContractClausesMeta {
  const c = asRecord(raw);
  const t = c.tradeIn && typeof c.tradeIn === 'object' ? asRecord(c.tradeIn) : null;
  return {
    inStock: c.inStock === true,
    leasingDelivery: c.leasingDelivery === true,
    investmentIncentive: c.investmentIncentive === true,
    exchangeRateDifference: c.exchangeRateDifference === true,
    tradeIn: t !== null,
    tradeInDescription: typeof t?.description === 'string' ? t.description : '',
    tradeInAmount: typeof t?.amount === 'number' && t.amount > 0 ? String(t.amount) : '',
    tradeInPlusVat: t?.plusVat !== false,
    tradeInPickup: typeof t?.pickupLocation === 'string' ? t.pickupLocation : '',
  };
}

/** Form alanları → API gövdesi; açıklaması veya tutarı olmayan takas gönderilmez. */
export function contractClausesPayload(meta: ContractClausesMeta): ContractClausesInput {
  const amount = parseDecimal(meta.tradeInAmount);
  const description = meta.tradeInDescription.trim();
  return {
    inStock: meta.inStock,
    leasingDelivery: meta.leasingDelivery,
    investmentIncentive: meta.investmentIncentive,
    exchangeRateDifference: meta.exchangeRateDifference,
    tradeIn: meta.tradeIn && description && Number.isFinite(amount) && amount > 0
      ? { description, amount, plusVat: meta.tradeInPlusVat, pickupLocation: meta.tradeInPickup.trim() || undefined }
      : null,
  };
}

export const emptyContractTermsMeta = (): ContractTermsMeta => ({
  importCostsExcluded: true,
  vatIncluded: false,
  freightPaidBySeller: false,
  deliveryLocation: '',
  estimatedDeliveryDaysMin: '',
  estimatedDeliveryDaysMax: '',
  ...contractClausesToMeta(null),
});

/** Şart metinleri; sözleşmede teslimat bilgileri ve madde anahtarları da düzenlenir. */
export function DocumentTermsFields({
  title,
  hint,
  payment,
  delivery,
  warranty,
  onChange,
  meta,
  onMetaChange,
  numbered = false,
}: {
  title: string;
  hint: string;
  payment: string;
  delivery: string;
  warranty: string;
  onChange: (next: { payment?: string; delivery?: string; warranty?: string }) => void;
  meta?: ContractTermsMeta;
  onMetaChange?: (next: Partial<ContractTermsMeta>) => void;
  numbered?: boolean;
}) {
  return (
    <View className="gap-3">
      <Eyebrow>{title}</Eyebrow>
      <Text className="font-inter text-xs text-muted-foreground">{hint}</Text>
      <Field label="Ödeme şartları" value={payment} onChangeText={(value) => onChange({ payment: value })} multiline maxLength={4000} />
      <Field label="Teslim şartları" value={delivery} onChangeText={(value) => onChange({ delivery: value })} multiline maxLength={4000} />
      <Field label="Garanti şartları" value={warranty} onChangeText={(value) => onChange({ warranty: value })} multiline maxLength={4000} />
      {numbered ? <NumberedTermsPreview style="decimal" values={[{ label: 'Ödeme şartları', value: payment }, { label: 'Teslim şartları', value: delivery }, { label: 'Garanti şartları', value: warranty }]} /> : null}
      {meta && onMetaChange ? (
        <>
          <Eyebrow>Teslimat Bilgileri</Eyebrow>
          <Field
            label="Teslim Yeri"
            value={meta.deliveryLocation}
            onChangeText={(value) => onMetaChange({ deliveryLocation: value })}
            placeholder="Örn. NORM İNOX METAL/Başakşehir tesisleri"
            maxLength={500}
          />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Field
                label="En Erken (Gün)"
                value={meta.estimatedDeliveryDaysMin}
                onChangeText={(value) => onMetaChange({ estimatedDeliveryDaysMin: value })}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
            <View className="flex-1">
              <Field
                label="En Geç (Gün)"
                value={meta.estimatedDeliveryDaysMax}
                onChangeText={(value) => onMetaChange({ estimatedDeliveryDaysMax: value })}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
          </View>
          <Eyebrow>Sözleşme Maddeleri</Eyebrow>
          <ToggleRow
            label="İthalat masraf ve vergileri fiyata dahil (madde 3.2)"
            value={!meta.importCostsExcluded}
            onChange={(next) => onMetaChange({ importCostsExcluded: !next })}
          />
          <ToggleRow
            label="K.D.V. sözleşme fiyatına dahil (madde 3.3 — girilen nihai tutar değişmez)"
            value={meta.vatIncluded}
            onChange={(next) => onMetaChange({ vatIncluded: next })}
          />
          <ToggleRow
            label="Nakliye ve sigorta HAKSAN'a ait (madde 2.6)"
            value={meta.freightPaidBySeller}
            onChange={(next) => onMetaChange({ freightPaidBySeller: next })}
          />
          <ToggleRow label="Tezgah stoktan teslim (teslim süresi yerine stok maddesi)" value={meta.inStock} onChange={(next) => onMetaChange({ inStock: next })} />
          <ToggleRow label="Leasing firmasına teslim" value={meta.leasingDelivery} onChange={(next) => onMetaChange({ leasingDelivery: next })} />
          <ToggleRow label="Yatırım Teşvik Belgesi maddesi" value={meta.investmentIncentive} onChange={(next) => onMetaChange({ investmentIncentive: next })} />
          <ToggleRow label="Kur farkı maddesi" value={meta.exchangeRateDifference} onChange={(next) => onMetaChange({ exchangeRateDifference: next })} />
          <ToggleRow label="Takas tezgah var" value={meta.tradeIn} onChange={(next) => onMetaChange({ tradeIn: next })} />
          {meta.tradeIn ? (
            <>
              <Field label="Takas tezgah" value={meta.tradeInDescription} onChangeText={(value) => onMetaChange({ tradeInDescription: value })} placeholder="Örn. Kullanılmış VM-2 Cnc Dik İşleme Merkezi" maxLength={500} />
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Field label="Takas bedeli" value={meta.tradeInAmount} onChangeText={(value) => onMetaChange({ tradeInAmount: value })} keyboardType="decimal-pad" maxLength={20} />
                </View>
                <View className="flex-1">
                  <Field label="Teslim alınacak yer" value={meta.tradeInPickup} onChangeText={(value) => onMetaChange({ tradeInPickup: value })} placeholder="Örn. Zeytinburnu" maxLength={255} />
                </View>
              </View>
              <ToggleRow label="Takas bedeli + K.D.V." value={meta.tradeInPlusVat} onChange={(next) => onMetaChange({ tradeInPlusVat: next })} />
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** Teslim gün aralığı: boş = gönderilmez; 0–3650 tamsayı; en erken ≤ en geç. */
export function parseDeliveryDays(meta: ContractTermsMeta): { min?: number; max?: number; error: string | null } {
  const read = (raw: string) => {
    if (!raw.trim()) return undefined;
    const value = Number(raw.trim());
    return Number.isInteger(value) && value >= 0 && value <= 3650 ? value : Number.NaN;
  };
  const min = read(meta.estimatedDeliveryDaysMin);
  const max = read(meta.estimatedDeliveryDaysMax);
  if (Number.isNaN(min) || Number.isNaN(max)) return { error: 'Teslim günü 0–3650 arası tam sayı olmalı.' };
  if (min !== undefined && max !== undefined && min > max) {
    return { error: 'En erken teslim günü en geç teslim gününden büyük olamaz.' };
  }
  return { min, max, error: null };
}
