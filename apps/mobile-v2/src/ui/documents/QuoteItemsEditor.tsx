import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { isMachiningCenterTypeCode } from '@haksan/shared';
import type { ProductModel } from '@/src/api/endpoints';
import { productsApi } from '@/src/api/endpoints';
import { formatAmount } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Eyebrow, Field, SubtleCard } from '@/src/ui';
import { ChoiceChips, ProductPickerSheet } from './pickers';
import { QuoteLineConfig } from './QuoteLineConfig';
import {
  emptyCompatibilityFilters,
  newLineGroupKey,
  parseDecimal,
  type EditableQuoteItem,
  type QuoteDiscountType,
} from './quote-logic';

type ProductWithLaser = ProductModel & {
  brandId?: string | null;
  technicalConfiguration?: unknown | null;
};

let rowCounter = 0;
export function newQuoteItemKey(): string {
  rowCounter += 1;
  return `quote-item-${Date.now()}-${rowCounter}`;
}

export function emptyQuoteItem(): EditableQuoteItem {
  return {
    key: newQuoteItemKey(),
    description: '',
    quantity: '1',
    unitPrice: '',
    discount: '',
    discountType: 'amount',
    vatRate: '20',
    nationalized: false,
    lineGroupKey: newLineGroupKey(),
    selectedProductOptions: [],
    technicalSpecs: [],
    technicalConfiguration: null,
    compatibilityFilters: emptyCompatibilityFilters(),
    optionChildren: [],
    configurationChanged: false,
  };
}

/** Teklif kalemi düzenleyicisi — web QuoteDialog satır alanları (iskonto, millileştirme, opsiyon). */
export function QuoteItemsEditor({
  items,
  onChange,
  currencyCode,
  productCurrencies,
  onProductCurrency,
  divisionId,
}: {
  items: EditableQuoteItem[];
  onChange: (next: EditableQuoteItem[]) => void;
  currencyCode: string;
  /** Kalem anahtarı → seçilen ürünün liste fiyatı para birimi (uyarı için). */
  productCurrencies: Record<string, string>;
  onProductCurrency: (key: string, code: string | null) => void;
  /** Lazer profil çözümü için teklif bölümü. */
  divisionId?: string | null;
}) {
  const { colors } = useTheme();
  const productSheet = useRef<BottomSheetModal>(null);

  const patch = (key: string, next: Partial<EditableQuoteItem>) =>
    onChange(items.map((item) => (item.key === key ? { ...item, ...next } : item)));

  async function addProduct(product: ProductModel) {
    const key = newQuoteItemKey();
    const typeCode = product.productType?.code ?? undefined;
    let detail: ProductWithLaser = product;
    try {
      detail = (await productsApi.get(product.id)) as ProductWithLaser;
    } catch {
      /* liste satırı yeterli; lazer snapshot sonra yüklenemez */
    }
    const tech = detail.technicalConfiguration ?? null;
    onChange([
      ...items.filter((item) => item.description.trim() || item.unitPrice.trim()),
      {
        key,
        productModelId: detail.id,
        stockCode: detail.stockCode ?? undefined,
        description: detail.fullName,
        quantity: '1',
        unitPrice: detail.listPrice ? String(Number(detail.listPrice)) : '',
        discount: '',
        discountType: 'amount' as QuoteDiscountType,
        vatRate: detail.vatRate ? String(Number(detail.vatRate)) : '20',
        productTypeCode: detail.productType?.code ?? typeCode,
        categoryCode: detail.category?.code ?? product.category?.code ?? undefined,
        nationalized: false,
        lineGroupKey: newLineGroupKey(),
        selectedProductOptions: [],
        technicalSpecs: (detail.specs ?? product.specs ?? []).map((spec) => ({
          key: spec.key,
          value: spec.value,
          unit: spec.unit ?? undefined,
        })),
        technicalConfiguration: tech,
        compatibilityFilters: emptyCompatibilityFilters(),
        optionChildren: [],
        configurationChanged: true,
        brandId: detail.brand?.id ?? detail.brandId ?? undefined,
      },
    ]);
    onProductCurrency(key, detail.currency?.code ?? product.currency?.code ?? null);
  }

  return (
    <View className="gap-3">
      <Eyebrow>Kalemler ({items.length})</Eyebrow>
      {items.map((item, index) => {
        const quantity = parseDecimal(item.quantity);
        const unitPrice = parseDecimal(item.unitPrice);
        const discountRaw = item.discount.trim() ? parseDecimal(item.discount) : 0;
        const gross = quantity > 0 && unitPrice >= 0 ? quantity * unitPrice : null;
        const discountAmount =
          gross != null && discountRaw >= 0
            ? item.discountType === 'percent'
              ? (gross * discountRaw) / 100
              : discountRaw
            : 0;
        const lineTotal = gross != null ? gross - discountAmount : null;
        const productCurrency = productCurrencies[item.key];
        const showNationalized = isMachiningCenterTypeCode(item.productTypeCode);
        return (
          <SubtleCard key={item.key} className="gap-2.5 p-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-inter-semibold text-[13px] text-muted-foreground">
                {index + 1}. kalem{item.productModelId ? ' · Katalog ürünü' : ''}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${index + 1}. kalemi kaldır`}
                onPress={() => {
                  onChange(items.filter((row) => row.key !== item.key));
                  onProductCurrency(item.key, null);
                }}
                hitSlop={8}
                className="h-11 w-11 items-center justify-center"
              >
                <Ionicons name="trash-outline" size={19} color={colors.destructive} />
              </Pressable>
            </View>
            <Field
              label="Açıklama *"
              value={item.description}
              onChangeText={(value) => patch(item.key, { description: value })}
              maxLength={2000}
              multiline
            />
            <Field
              label="Stok kodu"
              value={item.stockCode ?? ''}
              onChangeText={(value) => patch(item.key, { stockCode: value })}
              maxLength={64}
              placeholder="Opsiyonel"
            />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Field
                  label="Adet"
                  value={item.quantity}
                  onChangeText={(value) => patch(item.key, { quantity: value })}
                  keyboardType="decimal-pad"
                />
              </View>
              <View className="flex-[1.6]">
                <Field
                  label={`Birim fiyat (${currencyCode})`}
                  value={item.unitPrice}
                  onChangeText={(value) => patch(item.key, { unitPrice: value })}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <ChoiceChips
              label="Satır iskontosu tipi"
              options={[
                { value: 'amount', label: 'Tutar' },
                { value: 'percent', label: 'Oran %' },
              ]}
              value={item.discountType}
              onChange={(discountType) => patch(item.key, { discountType: discountType as QuoteDiscountType })}
            />
            <View className="flex-row gap-2">
              <View className="flex-[1.6]">
                <Field
                  label={item.discountType === 'percent' ? 'İskonto %' : `İskonto (${currencyCode})`}
                  value={item.discount}
                  onChangeText={(value) => patch(item.key, { discount: value })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
              </View>
              <View className="flex-1">
                <Field
                  label="KDV %"
                  value={item.vatRate}
                  onChangeText={(value) => patch(item.key, { vatRate: value })}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            {showNationalized ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.nationalized }}
                accessibilityLabel="Millileştirilmiş ithal işleme merkezi"
                onPress={() => patch(item.key, { nationalized: !item.nationalized })}
                className={`min-h-11 flex-row items-center gap-2 rounded-control border px-3 ${
                  item.nationalized ? 'border-primary bg-secondary' : 'border-border bg-card'
                }`}
              >
                <Ionicons
                  name={item.nationalized ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={item.nationalized ? colors.primary : colors.mutedForeground}
                />
                <Text className={`font-inter-medium text-sm ${item.nationalized ? 'text-primary' : 'text-foreground'}`}>
                  Millileştirilmiş (gümrük/vergi)
                </Text>
              </Pressable>
            ) : null}
            <QuoteLineConfig
              item={item}
              currencyCode={currencyCode}
              brandId={item.brandId}
              divisionId={divisionId}
              onChange={(next) => patch(item.key, next)}
            />
            {item.optionChildren.length ? (
              <View className="gap-1.5">
                <Text className="font-inter-medium text-xs text-muted-foreground">Opsiyon satırları</Text>
                {item.optionChildren.map((child) => (
                  <View key={child.key} className="flex-row items-center justify-between rounded-control border border-border bg-card px-3 py-2">
                    <Text className="flex-1 font-inter text-xs text-foreground" numberOfLines={2}>
                      {child.description}
                    </Text>
                    <Text className="font-inter-semibold text-xs text-foreground">
                      +{formatAmount(Number(child.unitPrice) || 0, currencyCode)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {productCurrency && productCurrency !== currencyCode ? (
              <Text className="font-inter text-xs text-warning">
                Liste fiyatı {productCurrency} cinsinden; teklif para birimi {currencyCode}. Fiyatı kontrol edin.
              </Text>
            ) : null}
            {lineTotal !== null && Number.isFinite(lineTotal) ? (
              <Text className="text-right font-inter-semibold text-[13px] text-foreground">
                Satır net: {formatAmount(lineTotal, currencyCode)}
              </Text>
            ) : null}
          </SubtleCard>
        );
      })}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Katalogdan Ürün" variant="ghost" trailingIcon="cube-outline" onPress={() => productSheet.current?.present()} />
        </View>
        <View className="flex-1">
          <Button label="Serbest Kalem" variant="ghost" trailingIcon="add" onPress={() => onChange([...items, emptyQuoteItem()])} />
        </View>
      </View>
      <ProductPickerSheet sheetRef={productSheet} onSelect={addProduct} />
    </View>
  );
}
