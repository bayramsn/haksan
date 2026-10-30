import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOpportunity } from '@/src/api/crm.hooks';
import { useInventoryList } from '@/src/api/inventory.hooks';
import { inventoryApi } from '@/src/api/endpoints';
import { reserveProcessStock } from '@/src/features/opportunities/reserve-stock';
import { useChangeOpportunityStage } from '@/src/api/sales.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { useCanAccessModule } from '@/src/modules/useModuleAccess';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useTheme } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';

/** Web OpportunityStockPickerDialog: select serials, then atomically reserve and advance stock_picking. */
export default function OpportunityStockScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const canUpdateStock = useCan('inventory.update');
  const canUpdateOpportunity = useCan('opportunities.update');
  const canReadOpportunity = useCan('opportunities.read');
  const stockModule = useCanAccessModule('inventory');
  const opportunityModule = useCanAccessModule('opportunities');
  const allowed = canUpdateOpportunity && canUpdateStock && canReadOpportunity && stockModule && opportunityModule;
  const detail = useOpportunity(allowed ? id : '');
  const companyId = detail.data?.company?.id ?? '';
  const companyName = detail.data?.company?.shortName ?? detail.data?.company?.legalTitle ?? 'Bağlı firma';
  const [search, setSearch] = useState('');
  const serverSearch = useDebouncedValue(search.trim());
  const [selected, setSelected] = useState<Record<string, { serial: string; label: string }>>({});
  // No status parameter: web includes available AND this company's reserved stock.
  const query = useMemo(() => ({ search: serverSearch || undefined }), [serverSearch]);
  const inventory = useInventoryList(query, allowed && Boolean(companyId));
  const changeStage = useChangeOpportunityStage();
  const action = useMutation({
    mutationFn: (inventoryItemIds: string[]) => reserveProcessStock(
      detail.data?.stage?.code,
      inventoryItemIds,
      () => changeStage.mutateAsync({ id, body: { toStage: 'stock_picking', inventoryItemIds } }),
      (itemId) => inventoryApi.reserve(itemId, { companyId, opportunityId: id }),
    ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
  const candidates = (inventory.data?.items ?? []).filter((item) =>
    item.status?.code === 'available' || (item.status?.code === 'reserved' && item.reservedCompany?.id === companyId));
  const ids = Object.keys(selected);

  function save() {
    if (!allowed || !companyId || !ids.length || action.isPending) return;
    action.mutate(ids, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['inventory'] });
        toast.success('Seri numaraları rezerve edildi');
        router.back();
      },
      onError: (error) => {
        setSelected({});
        toast.error(`Stok seçimi tamamlanamadı: ${error.message}. Liste güncelleniyor; işlenen rezervasyonları kontrol edip kalanları seçin.`);
      },
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Stok ve seri numarası seçimi', headerShown: true }} />
      {!allowed ? <EmptyState title="Bu işlem için yetkiniz yok" hint="Stok düzenleme ve ilgili modüllere erişim gerekir." icon="lock-closed-outline" /> :
        detail.isPending ? <Loading /> : detail.error ? <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} /> :
        !companyId ? <EmptyState title="Fırsata firma bağlanmalı" hint="Stok rezervasyonu için önce fırsatın firma bilgisini tamamlayın." /> : <>
          <View className="gap-2 p-4">
            <Text className="font-inter-semibold text-base text-foreground">{companyName}</Text>
            <Text className="font-inter text-sm text-muted-foreground">Müsait veya bu firmaya rezerve edilmiş seri numaralarını seçin.</Text>
          </View>
          <SearchBar value={search} onChange={setSearch} placeholder="Seri no, ürün veya marka ara" />
          <FlatList
            data={candidates}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            extraData={selected}
            onEndReachedThreshold={0.4}
            onEndReached={() => { if (inventory.hasNextPage && !inventory.isFetchingNextPage) void inventory.fetchNextPage(); }}
            refreshing={inventory.isRefetching}
            onRefresh={() => void inventory.refetch()}
            renderItem={({ item }) => {
              const checked = Boolean(selected[item.id]);
              const label = [item.brand?.name, item.product?.fullName, item.warehouse?.name].filter(Boolean).join(' · ');
              return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} disabled={action.isPending}
                onPress={() => setSelected((current) => { const next = { ...current }; if (next[item.id]) delete next[item.id]; else next[item.id] = { serial: item.serialNumber || item.product?.stockCode || item.id.slice(0, 8), label }; return next; })}
                className={`mb-2 min-h-[72px] flex-row items-center gap-3 rounded-surface border p-4 ${checked ? 'border-primary bg-secondary' : 'border-border bg-card'}`}>
                <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? colors.primary : colors.mutedForeground} />
                <View className="flex-1 gap-1">
                  <Text className="font-inter-semibold text-sm text-foreground">{item.serialNumber || item.product?.stockCode || item.id.slice(0, 8)}</Text>
                  <Text className="font-inter text-xs text-muted-foreground">{label || 'Stok kalemi'}</Text>
                  <Text className="font-inter text-xs text-muted-foreground">{item.status?.code === 'reserved' ? 'Bu firmaya rezerve' : 'Müsait'}</Text>
                </View>
              </Pressable>;
            }}
            ListEmptyComponent={inventory.isPending ? <Loading /> : inventory.error ? <ErrorState message={inventory.error.message} onRetry={() => void inventory.refetch()} /> : <EmptyState title="Uygun stok bulunamadı" hint={inventory.hasNextPage ? 'Sonraki kayıtları yükleyerek devam edin veya aramayı daraltın.' : 'Aramayı değiştirin. Yalnız müsait veya bu firmaya rezerve stoklar seçilebilir.'} />}
            ListFooterComponent={<View className="gap-2 py-3">
              {inventory.data ? <Text className="text-center font-inter text-xs text-muted-foreground">{inventory.data.items.length} / {inventory.data.total} stok kaydı tarandı</Text> : null}
              {inventory.isFetchNextPageError ? <ErrorState message="Sonraki stoklar yüklenemedi." onRetry={() => void inventory.fetchNextPage()} /> : null}
              {inventory.hasNextPage ? <Button label="Sonraki stokları yükle" variant="ghost" loading={inventory.isFetchingNextPage} onPress={() => void inventory.fetchNextPage()} /> : null}
            </View>}
          />
          <View className="gap-3 border-t border-border bg-card p-4">
            {ids.length ? <Text className="font-inter text-sm text-foreground">{ids.length} seri no seçildi: {ids.map((key) => selected[key]?.serial).join(', ')}</Text> : null}
            <Button label={action.isPending ? 'Rezerve ediliyor…' : `${ids.length} seri noyu rezerve et`} disabled={!ids.length || action.isPending} loading={action.isPending} onPress={save} />
          </View>
        </>}
    </SafeAreaView>
  );
}
