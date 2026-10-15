import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useLookup } from '@/src/api/crm.hooks';
import type { ProductModel } from '@/src/api/endpoints';
import { useSalesOrder } from '@/src/api/inventory.hooks';
import { useAddSalesOrderItem } from '@/src/api/sales-orders.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatAmount } from '@/src/lib/format';
import { Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { ModalForm, PickerField, ProductPickerSheet } from '@/src/ui/documents/pickers';
import { parseDecimal } from '@/src/ui/documents/quote-logic';
import { LookupSelect } from '@/src/ui/select/fields';

/** Satış siparişine kalem ekleme (salesOrderItemCreateSchema): katalogdan ürün veya serbest satır. */
export default function SalesOrderItemScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof id === 'string' ? id : '';
  const canUpdate = useCan('sales_orders.update');
  const order = useSalesOrder(orderId);
  const currencies = useLookup('currencies');
  const add = useAddSalesOrderItem();
  const [product, setProduct] = useState<ProductModel | null>(null);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCode, setUnitCode] = useState('adet');
  const [unitPrice, setUnitPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [vatRate, setVatRate] = useState('20');
  const sheet = useRef<BottomSheetModal>(null);

  if (!canUpdate || !orderId) return <Redirect href="/(tabs)/modules/sales-orders" />;

  const currencyCode = currencies.data?.find((c) => c.id === order.data?.currencyId)?.code ?? 'USD';
  const qty = parseDecimal(quantity);
  const price = parseDecimal(unitPrice);
  const lineDiscount = discount.trim() ? parseDecimal(discount) : 0;
  const vat = parseDecimal(vatRate);
  const net = qty * price - lineDiscount;

  function chooseProduct(next: ProductModel) {
    setProduct(next);
    setDescription(next.fullName);
    if (next.listPrice) setUnitPrice(String(Number(next.listPrice)));
    if (next.vatRate) setVatRate(String(Number(next.vatRate)));
  }

  function submit() {
    if (!description.trim()) return toast.error('Kalem açıklaması zorunlu');
    if (!(qty > 0)) return toast.error('Adet sıfırdan büyük olmalı');
    if (!(price >= 0)) return toast.error('Birim fiyatı sayı olarak girin');
    if (!(lineDiscount >= 0) || lineDiscount > qty * price + 0.0001) return toast.error('Satır iskontosu brüt tutarını aşamaz');
    if (!(vat >= 0 && vat <= 100)) return toast.error('KDV oranı 0–100 arası olmalı');
    add.mutate(
      {
        id: orderId,
        body: {
          productModelId: product?.id,
          description: description.trim(),
          quantity: Math.round(qty * 1000) / 1000,
          unitCode: unitCode.trim() || 'adet',
          unitPrice: price,
          discountAmount: lineDiscount,
          vatRate: vat,
          sortOrder: order.data?.items.length ?? 0,
        },
      },
      {
        onSuccess: () => {
          toast.success('Kalem eklendi');
          router.back();
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  return (
    <>
      <ModalForm title="Kalem Ekle" submitLabel="Kalemi Ekle" onSubmit={submit} loading={add.isPending}>
        <PickerField
          label="Katalog ürünü (isteğe bağlı)"
          value={product?.fullName ?? null}
          placeholder="Ürün seçin veya serbest satır yazın"
          icon="cube-outline"
          onPress={() => sheet.current?.present()}
          onClear={() => setProduct(null)}
        />
        <Field label="Açıklama *" value={description} onChangeText={setDescription} maxLength={2000} multiline />
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Field label="Adet" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
          </View>
          <View className="flex-1">
            <LookupSelect name="units" label="Birim" placeholder="Birim" icon="scale-outline" value={unitCode} onChange={setUnitCode} clearable={false} />
          </View>
        </View>
        <View className="flex-row gap-2">
          <View className="flex-[1.6]">
            <Field label={`Birim fiyat (${currencyCode})`} value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" />
          </View>
          <View className="flex-1">
            <Field label="KDV %" value={vatRate} onChangeText={setVatRate} keyboardType="decimal-pad" />
          </View>
        </View>
        <Field label="Satır iskontosu" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" placeholder="0" />
        {product?.currency?.code && product.currency.code !== currencyCode ? (
          <Text className="font-inter text-xs text-warning">
            Liste fiyatı {product.currency.code} cinsinden; sipariş para birimi {currencyCode}. Fiyatı kontrol edin.
          </Text>
        ) : null}
        {Number.isFinite(net) && net >= 0 ? (
          <Text className="text-right font-inter-semibold text-sm text-foreground">Satır net: {formatAmount(net, currencyCode)}</Text>
        ) : null}
      </ModalForm>
      <ProductPickerSheet sheetRef={sheet} onSelect={chooseProduct} />
    </>
  );
}
