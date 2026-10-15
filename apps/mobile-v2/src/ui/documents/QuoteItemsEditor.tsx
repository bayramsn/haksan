import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import type { ProductModel } from '@/src/api/endpoints';
import { formatAmount } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Eyebrow, Field, SubtleCard } from '@/src/ui';
import { ProductPickerSheet } from './pickers';
import { parseDecimal, type EditableQuoteItem } from './quote-logic';

let rowCounter = 0;
export function newQuoteItemKey(): string {
  rowCounter += 1;
  return `quote-item-${Date.now()}-${rowCounter}`;
}

export function emptyQuoteItem(): EditableQuoteItem {
  return { key: newQuoteItemKey(), description: '', quantity: '1', unitPrice: '', discountAmount: '', vatRate: '20' };
}

/** Teklif kalemi düzenleyicisi: katalogdan ürün (productsApi) veya serbest kalem. */
export function QuoteItemsEditor({
  items,
  onChange,
  currencyCode,
  productCurrencies,
  onProductCurrency,
}: {
  items: EditableQuoteItem[];
  onChange: (next: EditableQuoteItem[]) => void;
  currencyCode: string;
  /** Kalem anahtarı → seçilen ürünün liste fiyatı para birimi (uyarı için). */
  productCurrencies: Record<string, string>;
  onProductCurrency: (key: string, code: string | null) => void;
}) {
  const { colors } = useTheme();
  const productSheet = useRef<BottomSheetModal>(null);

  const patch = (key: string, next: Partial<EditableQuoteItem>) =>
    onChange(items.map((item) => (item.key === key ? { ...item, ...next } : item)));

  function addProduct(product: ProductModel) {
    const key = newQuoteItemKey();
    onChange([
      ...items.filter((item) => item.description.trim() || item.unitPrice.trim()),
      {
        key,
        productModelId: product.id,
        stockCode: product.stockCode ?? undefined,
        description: product.fullName,
        quantity: '1',
        unitPrice: product.listPrice ? String(Number(product.listPrice)) : '',
        discountAmount: '',
        vatRate: product.vatRate ? String(Number(product.vatRate)) : '20',
      },
    ]);
    onProductCurrency(key, product.currency?.code ?? null);
  }

  return (
    <View className="gap-3">
      <Eyebrow>Kalemler ({items.length})</Eyebrow>
      {items.map((item, index) => {
        const quantity = parseDecimal(item.quantity);
        const unitPrice = parseDecimal(item.unitPrice);
        const discount = item.discountAmount.trim() ? parseDecimal(item.discountAmount) : 0;
        const lineTotal = quantity > 0 && unitPrice >= 0 ? quantity * unitPrice - (discount > 0 ? discount : 0) : null;
        const productCurrency = productCurrencies[item.key];
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
            <View className="flex-row gap-2">
              <View className="flex-[1.6]">
                <Field
                  label="Satır iskontosu"
                  value={item.discountAmount}
                  onChangeText={(value) => patch(item.key, { discountAmount: value })}
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
