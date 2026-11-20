import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, Stack, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import { STOCK_CONDITION_CODES, STOCK_CONDITION_LABELS, inventoryItemCreateSchema, type StockConditionCode } from '@haksan/shared';
import type { ProductModel } from '@/src/api/endpoints';
import { useProductList, useWarehouses } from '@/src/api/inventory.hooks';
import { ops } from '@/src/api/ops.endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useTheme } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Eyebrow, Field, FilterChips, Loading, SearchBar } from '@/src/ui';

/** Seri numaralı stok kaydı (web'deki "Stok ekle"). Depo ve ana veri webde yönetilir. */
export default function InventoryItemFormScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const allowed = useCan('inventory.create');
  const warehouses = useWarehouses();
  const productSheet = useRef<BottomSheetModal>(null);
  const [search, setSearch] = useState('');
  const products = useProductList({ search: useDebouncedValue(search, 300).trim() || undefined });
  const [product, setProduct] = useState<ProductModel | null>(null);
  const [serialNumber, setSerialNumber] = useState('');
  const [condition, setCondition] = useState<StockConditionCode | null>('new');
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!allowed) return <Redirect href="/modules/inventory" />;

  function save() {
    setError('');
    const parsed = inventoryItemCreateSchema.safeParse({
      productModelId: product?.id ?? '',
      serialNumber: serialNumber.trim(),
      itemCondition: condition ?? 'new',
      warehouseId: warehouseId ?? undefined,
      notes: notes.trim() || undefined,
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      return setError(field === 'productModelId' ? 'Ürün seçin.' : field === 'serialNumber' ? 'Seri numarası girin.' : parsed.error.issues[0]?.message ?? 'Alanları kontrol edin.');
    }
    setSaving(true);
    ops.createInventoryItem(parsed.data)
      .then(async (created) => {
        await qc.invalidateQueries({ queryKey: ['inventory'] });
        router.replace(`/modules/inventory/${created.id}` as Href);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Stok kaydı oluşturulamadı.'))
      .finally(() => setSaving(false));
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni stok kaydı', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="gap-3">
            <Eyebrow>Ürün</Eyebrow>
            <Pressable accessibilityRole="button" accessibilityLabel="Ürün seç" onPress={() => productSheet.current?.present()} className="min-h-12 flex-row items-center gap-3 rounded-control border border-border bg-card px-3 py-2 active:opacity-70">
              <Ionicons name="cube-outline" size={19} color={colors.primary} />
              <View className="flex-1 gap-0.5"><Text className="font-inter-medium text-xs text-muted-foreground">Ürün modeli *</Text><Text className="font-inter text-base text-foreground" numberOfLines={2}>{product?.fullName ?? 'Ürün seçin'}</Text></View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </Pressable>
            <Field label="Seri numarası *" value={serialNumber} onChangeText={setSerialNumber} maxLength={128} autoCapitalize="characters" autoCorrect={false} />
            <View className="gap-1.5"><Text className="font-inter-medium text-[13px] text-muted-foreground">Durumu</Text><FilterChips options={STOCK_CONDITION_CODES.map((code) => ({ value: code, label: STOCK_CONDITION_LABELS[code] }))} value={condition} onChange={setCondition} allLabel="" /></View>
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Depo</Text>
              {warehouses.isPending ? <Loading /> : warehouses.error ? <ErrorState message={warehouses.error.message} onRetry={() => void warehouses.refetch()} /> : <FilterChips options={(warehouses.data ?? []).map((item) => ({ value: item.id, label: item.name }))} value={warehouseId} onChange={setWarehouseId} allLabel="" />}
            </View>
            <Field label="Notlar" value={notes} onChangeText={setNotes} multiline maxLength={4000} />
          </View>
          {error ? <Text accessibilityRole="alert" className="font-inter text-sm text-destructive">{error}</Text> : null}
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Stoka Ekle" loading={saving} disabled={saving} onPress={save} /></View>
        </View>
      </KeyboardAvoidingView>

      <BottomSheetModal ref={productSheet} snapPoints={['80%']} enableDynamicSizing={false} backgroundStyle={{ backgroundColor: colors.card }} handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }} backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}>
        <BottomSheetView className="gap-3 px-4 pb-2"><Text className="font-inter-semibold text-base text-foreground">Ürün seçin</Text><SearchBar value={search} onChange={setSearch} placeholder="Model veya stok kodu ara" /></BottomSheetView>
        <BottomSheetFlatList
          data={products.data?.items ?? []}
          keyExtractor={(item: ProductModel) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }: { item: ProductModel }) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: item.id === product?.id }} onPress={() => { setProduct(item); productSheet.current?.dismiss(); }} className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70">
              <Ionicons name="cube-outline" size={19} color={item.id === product?.id ? colors.primary : colors.mutedForeground} />
              <View className="flex-1"><Text className="font-inter-semibold text-sm text-foreground" numberOfLines={2}>{item.fullName}</Text>{item.stockCode ? <Text className="font-inter text-xs text-muted-foreground">{item.stockCode}</Text> : null}</View>
            </Pressable>
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (products.hasNextPage && !products.isFetchingNextPage) void products.fetchNextPage(); }}
          ListEmptyComponent={products.isPending ? <Loading /> : products.error ? <ErrorState message={products.error.message} onRetry={() => void products.refetch()} /> : <EmptyState title="Ürün bulunamadı" />}
          ListFooterComponent={products.isFetchingNextPage ? <Loading /> : null}
        />
      </BottomSheetModal>
    </SafeAreaView>
  );
}
