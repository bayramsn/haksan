import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCan } from '@/src/auth/AuthProvider';
import { activeScope } from '@/src/auth/scope';
import { useCompany } from '@/src/api/companies.hooks';
import { useLookup } from '@/src/api/crm.hooks';
import { usePurchaseOrder } from '@/src/api/inventory.hooks';
import { useAllProducts } from '@/src/api/products.hooks';
import { useCreatePurchaseOrder, useUpdatePurchaseOrder, useAddPurchaseOrderItem } from '@/src/api/purchase.hooks';
import { formatAmount } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { IncotermSelect } from '@/src/ui/select/fields';
import { toast } from '@/src/ui/toast';
import { CompanyPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { AmountLine, DateInputField, FormScreen, Segmented } from '@/src/ui/finance/kit';
import {
  blankPurchaseLine,
  buildPurchaseHeader,
  buildPurchaseItems,
  defaultPurchaseForm,
  purchaseFormFromDetail,
  purchaseLineTotals,
  purchaseTotals,
  validatePurchase,
  type PurchaseForm,
  type PurchaseLineForm,
  type PurchaseType,
} from '@/src/ui/finance/purchase-logic';

const TYPE_OPTIONS = [
  { value: 'commercial', label: 'Ticari' },
  { value: 'administrative', label: 'İdari' },
] as const;
const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Peşin' },
  { value: 'leasing', label: 'Leasing' },
  { value: 'term', label: 'Vadeli' },
] as const;
const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'TRY', label: 'TL' },
] as const;
const VAT_OPTIONS = ['0', '1', '10', '20'].map((rate) => ({ value: rate, label: `%${rate}` }));

const inputValue = (value: string | null | undefined) => (value == null || value === '' ? '' : String(Number(value)));

/** Web "Satın Alma Siparişi Oluştur"; `id` ile taslak başlığı düzenlenir ve yeni kalem eklenir. */
export default function PurchaseOrderFormScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);
  const canCreate = useCan('purchase_orders.create');
  const canUpdate = useCan('purchase_orders.update');
  const detail = usePurchaseOrder(id);
  const currencies = useLookup('currencies');
  const products = useAllProducts();
  const supplier = useCompany(detail.data?.supplierCompanyId ?? '');
  const create = useCreatePurchaseOrder();
  const update = useUpdatePurchaseOrder(id);
  const addItem = useAddPurchaseOrderItem(id);

  const [form, setForm] = useState<PurchaseForm>(() => defaultPurchaseForm());
  const [company, setCompany] = useState<PickedRecord | null>(null);
  const [lines, setLines] = useState<PurchaseLineForm[]>(() => (editing ? [] : [blankPurchaseLine('commercial')]));
  const [hydrated, setHydrated] = useState(!editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hydrated || !detail.data || currencies.isPending) return;
    const code = currencies.data?.find((item) => item.id === detail.data.currencyId)?.code ?? 'USD';
    setForm(purchaseFormFromDetail({ ...detail.data, currencyCode: code }));
    setHydrated(true);
  }, [currencies.data, currencies.isPending, detail.data, hydrated]);

  useEffect(() => {
    if (!company && supplier.data) setCompany({ id: supplier.data.id, name: supplier.data.shortName || supplier.data.legalTitle });
  }, [company, supplier.data]);

  const productOptions = useMemo(
    () =>
      (products.data ?? []).map((product) => ({
        value: product.id,
        label: product.fullName || product.modelCode,
        hint: [product.brand?.name, product.modelCode].filter(Boolean).join(' · '),
      })),
    [products.data],
  );
  const totals = purchaseTotals(lines);

  if (editing ? !canUpdate : !canCreate) return <Redirect href={'/(tabs)/modules/purchase-orders' as Href} />;

  const set = <K extends keyof PurchaseForm>(key: K, value: PurchaseForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateLine = (key: string, patch: Partial<PurchaseLineForm>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  function setPurchaseType(type: PurchaseType) {
    setForm((current) => ({ ...current, purchaseType: type }));
    setLines((current) =>
      current.map((line) => ({
        ...blankPurchaseLine(type),
        key: line.key,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        vatRate: line.vatRate,
      })),
    );
  }

  function pickProduct(line: PurchaseLineForm, productId: string | null) {
    const product = products.data?.find((row) => row.id === productId);
    updateLine(line.key, {
      productModelId: productId ?? '',
      description: product ? product.fullName || line.description : line.description,
      listPrice: inputValue(product?.listPrice) || line.listPrice,
      unitPrice: inputValue(product?.cashPrice ?? product?.listPrice) || line.unitPrice,
      vatRate: inputValue(product?.vatRate) || line.vatRate,
    });
  }

  async function submit() {
    const result = validatePurchase(form, lines, !editing || lines.length > 0);
    if (!result.ok) {
      toast.error(result.description ? `${result.title}: ${result.description}` : result.title);
      return;
    }
    const header = { ...buildPurchaseHeader(form), divisionId: activeScope().divisionId ?? undefined };
    const items = buildPurchaseItems(form, lines);
    setSaving(true);
    try {
      if (editing) {
        const { divisionId: _division, ...patch } = header;
        await update.mutateAsync(patch);
        for (const item of items) await addItem.mutateAsync(item);
        toast.success('Satın alma siparişi güncellendi');
        router.back();
      } else {
        const created = await create.mutateAsync({ header, items });
        toast.success(`Satın alma siparişi oluşturuldu · ${created.orderNo}`);
        router.replace(`/(tabs)/modules/purchase-orders/${created.id}` as Href);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(
        editing
          ? `Satın alma siparişi güncellenemedi${message ? `: ${message}` : ''}`
          : `Satın alma siparişi oluşturulamadı${message ? `: ${message}` : ''}`,
      );
    } finally {
      setSaving(false);
    }
  }

  if (editing && (detail.isPending || !hydrated)) {
    return (
      <FormScreen title="Satın Alma Taslağı">
        {detail.error ? <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} /> : <Loading />}
      </FormScreen>
    );
  }

  const administrative = form.purchaseType === 'administrative';

  return (
    <FormScreen
      title={editing ? 'Satın Alma Taslağı' : 'Satın Alma Siparişi Oluştur'}
      submitLabel={editing ? 'Kaydet' : 'Sipariş Oluştur'}
      onSubmit={() => void submit()}
      submitting={saving}
    >
      {!editing ? (
        <Text className="font-inter text-sm text-muted-foreground">
          Ticari veya idari satın alma için firma, fatura ve kalem bilgilerini girin.
        </Text>
      ) : null}
      <Segmented label="Satın Alma Tipi" value={form.purchaseType} options={TYPE_OPTIONS} onChange={setPurchaseType} />
      <CompanyPicker
        label={administrative ? 'Firma / Müşteri (opsiyonel)' : 'Firma / Müşteri Listesi'}
        placeholder={administrative ? 'Firma seçin (opsiyonel)…' : 'Firma seçin…'}
        value={company}
        onChange={(next) => {
          setCompany(next);
          set('supplierCompanyId', next?.id ?? '');
        }}
      />
      <Segmented label="Ödeme Tipi" value={form.paymentType} options={PAYMENT_OPTIONS} onChange={(value) => set('paymentType', value)} />
      <Field label="Fatura Numarası" value={form.invoiceNo} onChangeText={(value) => set('invoiceNo', value)} placeholder="FTR-..." />
      <Field label="Sipariş No" value={form.orderNo} onChangeText={(value) => set('orderNo', value)} placeholder="Boşsa otomatik" />
      <Segmented label="Para Birimi" value={form.currencyCode} options={CURRENCY_OPTIONS} onChange={(value) => set('currencyCode', value)} />
      <DateInputField label="Sipariş Tarihi" value={form.orderDate} clearable={false} onChange={(value) => set('orderDate', value)} />
      <DateInputField label="Beklenen Tarih" value={form.expectedDate} onChange={(value) => set('expectedDate', value)} />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field label="Yeni Vade (Gün)" keyboardType="number-pad" value={form.paymentTermDays} onChangeText={(value) => set('paymentTermDays', value)} placeholder="0" />
        </View>
        <View className="flex-1">
          <Field
            label="Önceki Vade (Gün)"
            keyboardType="number-pad"
            value={form.previousPaymentTermDays}
            onChangeText={(value) => set('previousPaymentTermDays', value)}
            placeholder="Opsiyonel"
          />
        </View>
      </View>
      {administrative ? (
        <Field label="İdari Kategori" value={form.incoterm} onChangeText={(value) => set('incoterm', value)} placeholder="Ofis / bakım / hizmet" />
      ) : (
        <IncotermSelect value={form.incoterm} onChange={(value) => set('incoterm', value)} />
      )}
      <Field label="Referans" value={form.shipmentReference} onChangeText={(value) => set('shipmentReference', value)} placeholder="İrsaliye / talep no" />
      <Field label="Vade Notu" value={form.termChangeReason} onChangeText={(value) => set('termChangeReason', value)} placeholder="Opsiyonel" />

      {editing && detail.data?.items.length ? (
        <Card className="gap-1">
          <Eyebrow>Mevcut kalemler ({detail.data.items.length})</Eyebrow>
          {detail.data.items.map((item) => (
            <AmountLine
              key={item.id}
              label={`${item.description} × ${Number(item.quantity).toLocaleString('tr-TR')}`}
              value={formatAmount(item.lineTotal, form.currencyCode)}
            />
          ))}
        </Card>
      ) : null}

      <Eyebrow>{editing ? 'Yeni kalemler' : 'Kalemler'}</Eyebrow>
      {lines.map((line, index) => {
        const lineTotal = purchaseLineTotals(line).total;
        return (
          <Card key={line.key} className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-inter-semibold text-sm text-foreground">Kalem {index + 1}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Kalem ${index + 1} satırını sil`}
                onPress={() =>
                  setLines((current) => {
                    const next = current.filter((item) => item.key !== line.key);
                    return next.length || editing ? next : [blankPurchaseLine(form.purchaseType)];
                  })
                }
                className="h-11 w-11 items-center justify-center active:opacity-60"
              >
                <Ionicons name="trash-outline" size={19} color={colors.destructive} />
              </Pressable>
            </View>
            {administrative ? (
              <Field
                label="Gider Türü"
                value={line.productModelId}
                onChangeText={(value) => updateLine(line.key, { productModelId: value })}
                placeholder="Ofis, bakım..."
              />
            ) : (
              <OptionPicker
                label="Ürün"
                value={line.productModelId || null}
                options={productOptions}
                placeholder="Ürün seçmeden"
                searchable
                clearable
                onChange={(value) => pickProduct(line, value)}
              />
            )}
            <Field
              label="Açıklama"
              value={line.description}
              onChangeText={(value) => updateLine(line.key, { description: value })}
              placeholder="Kalem açıklaması"
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Adet" keyboardType="decimal-pad" value={line.quantity} onChangeText={(value) => updateLine(line.key, { quantity: value })} />
              </View>
              <View className="flex-1">
                <Field label="İndirim" keyboardType="decimal-pad" value={line.discountAmount} onChangeText={(value) => updateLine(line.key, { discountAmount: value })} />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Liste Fiyatı" keyboardType="decimal-pad" value={line.listPrice} onChangeText={(value) => updateLine(line.key, { listPrice: value })} placeholder="0" />
              </View>
              <View className="flex-1">
                <Field label="Olur Fiyatı" keyboardType="decimal-pad" value={line.unitPrice} onChangeText={(value) => updateLine(line.key, { unitPrice: value })} placeholder="0" />
              </View>
            </View>
            <Segmented label="KDV" value={line.vatRate} options={VAT_OPTIONS} onChange={(value) => updateLine(line.key, { vatRate: value })} />
            <DateInputField label="ETA" value={line.expectedDate} onChange={(value) => updateLine(line.key, { expectedDate: value })} />
            <AmountLine label="Son Tutar" value={formatAmount(lineTotal, form.currencyCode)} />
          </Card>
        );
      })}
      <Button label="Kalem Ekle" variant="ghost" onPress={() => setLines((current) => [...current, blankPurchaseLine(form.purchaseType)])} />

      {lines.length ? (
        <Card className="gap-0">
          <AmountLine label="Ara Toplam" value={formatAmount(totals.subtotal, form.currencyCode)} />
          <AmountLine label="İndirim" value={formatAmount(totals.discount, form.currencyCode)} />
          <AmountLine label="KDV" value={formatAmount(totals.vat, form.currencyCode)} />
          <AmountLine label="Son Tutar" value={formatAmount(totals.total, form.currencyCode)} tone="info" />
        </Card>
      ) : null}

      <Field
        label="Notlar"
        value={form.notes}
        onChangeText={(value) => set('notes', value)}
        multiline
        numberOfLines={3}
        style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }}
      />
    </FormScreen>
  );
}
