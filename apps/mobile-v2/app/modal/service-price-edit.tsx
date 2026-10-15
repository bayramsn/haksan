import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useAllProducts } from '@/src/api/products.hooks';
import { usePriceListItems, usePriceLists } from '@/src/api/inventory.hooks';
import { useSavePriceListPrice } from '@/src/api/service.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, Card, DetailSkeleton, ErrorState, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { formatPrice } from '@/src/ui/products/sales-price';
import { effectivePrices, overridesFromItems, priceChanges, priceCurrency } from '@/src/ui/service/priceList';

const toInput = (value: number | null) => (value == null ? '' : String(value).replace('.', ','));

/** Web EditablePriceCell: seçili liste kalemini günceller, kalem yoksa yeni kalem açar. */
export default function ServicePriceEditScreen() {
  const router = useRouter();
  const canUpdate = useCan('price_lists.update');
  const canCreate = useCan('price_lists.create');
  const canEdit = canUpdate || canCreate;
  const { listId = '', productId = '', labor } = useLocalSearchParams<{ listId?: string; productId?: string; labor?: string }>();
  const isLabor = labor === '1';
  const products = useAllProducts();
  const lists = usePriceLists();
  const items = usePriceListItems(listId);
  const save = useSavePriceListPrice();

  const product = products.data?.find((row) => row.id === productId);
  const list = lists.data?.find((row) => row.id === listId);
  const override = useMemo(() => overridesFromItems(items.data ?? [])[productId], [items.data, productId]);
  const current = product ? effectivePrices(product, override) : { cash: null, list: null };
  const currency = product ? priceCurrency(product, list?.currency?.code) : '';

  if (!canEdit) return <Redirect href={'/(tabs)/modules/service-price-list' as Href} />;

  const loading = products.isPending || lists.isPending || items.isPending;
  const error = products.error ?? lists.error ?? items.error;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: isLabor ? 'Birim Ücret' : 'Fiyat Düzenle' }} />
      {loading ? (
        <DetailSkeleton />
      ) : error ? (
        <ErrorState
          message={error.message}
          onRetry={() => {
            void products.refetch();
            void lists.refetch();
            void items.refetch();
          }}
        />
      ) : !product || !list ? (
        <ErrorState message="Ürün veya fiyat listesi bulunamadı." />
      ) : (
        <PriceForm
          key={`${productId}:${override?.itemId ?? 'new'}`}
          title={product.fullName || product.modelName || product.modelCode}
          subtitle={[product.stockCode, product.brand?.name, list.name || list.code].filter(Boolean).join(' · ')}
          currency={currency}
          current={current}
          isLabor={isLabor}
          saving={save.isPending}
          onSave={(draft) => {
            const result = priceChanges(draft, current, isLabor);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            save.mutate(
              { listId, itemId: override?.itemId, productModelId: productId, prices: result.prices },
              {
                onSuccess: () => {
                  toast.success('Fiyat güncellendi');
                  router.back();
                },
                onError: (err) => toast.error(`Fiyat güncellenemedi: ${err.message}`),
              },
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function PriceForm({
  title,
  subtitle,
  currency,
  current,
  isLabor,
  saving,
  onSave,
}: {
  title: string;
  subtitle: string;
  currency: string;
  current: { cash: number | null; list: number | null };
  isLabor: boolean;
  saving: boolean;
  onSave: (draft: { cash: string; list: string }) => void;
}) {
  const [cash, setCash] = useState(toInput(current.cash));
  const [list, setList] = useState(toInput(current.list));
  const unit = currency === 'TRY' ? 'TL' : currency;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
        <Card className="gap-1">
          <Text className="font-display text-lg text-foreground">{title}</Text>
          {subtitle ? <Text className="font-inter text-xs text-muted-foreground">{subtitle}</Text> : null}
          <Text className="pt-1 font-inter text-xs text-muted-foreground">
            Mevcut: {isLabor ? formatPrice(current.list, currency) : `Peşin ${formatPrice(current.cash, currency)} · Liste ${formatPrice(current.list, currency)}`}
          </Text>
        </Card>
        {isLabor ? null : (
          <Field label={`Peşin (${unit})`} value={cash} onChangeText={setCash} keyboardType="decimal-pad" placeholder="0" />
        )}
        <Field
          label={`${isLabor ? 'Birim Ücret' : 'Liste Fiyatı'} (${unit})`}
          value={list}
          onChangeText={setList}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <View className="pt-2">
          <Button label="Kaydet" loading={saving} onPress={() => onSave({ cash, list })} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
