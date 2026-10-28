import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useSalesOrders } from '@/src/api/inventory.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { EmptyState, ErrorState, Fab, FilterChips, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { SalesOrderRow } from '@/src/ui/documents/rows';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

export default function SalesOrdersScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const serverSearch = useDebouncedValue(search.trim());
  const canCreate = useCan('sales_orders.create');
  const canInvoice = useCan('accounting_invoices.create');

  const query = useMemo(
    () => ({ search: serverSearch || undefined, statusCode: statusCode ?? undefined }),
    [serverSearch, statusCode]
  );

  const list = useSalesOrders(query);
  const items = list.data?.items ?? [];

  // Durum lookup'ı sunucuda dışa açılmadığı için seçenekler yüklenen
  // kayıtlardaki farklı durumlardan türetiliyor.
  const statusOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) if (item.status) seen.set(item.status.code, item.status.name);
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [items]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Satış Siparişleri" subtitle="Tüm satış siparişlerinizi görüntüleyin ve yönetin." />

      <View className="gap-2 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Sipariş no veya firma" />
        <FilterChips
          options={statusOptions}
          value={statusCode}
          onChange={setStatusCode}
        />
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          // v2'de bu özellik varsayılan AÇIK ve sayfalama/yeniden ölçüm sonrası
          // içeriği çapalayıp listenin başında boşluk bırakıyor. Bunlar sohbet
          // değil, tepeden akan listeler — kapalı olmalı.
          maintainVisibleContentPosition={{ disabled: true }}
          // FlashList v2 kendi başına esnemiyor; sınırlanmamış sütun içinde
          // içerik aşağı kayıyor ve filtrelerin altında boşluk kalıyor.
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: GLASS_TAB_BAR_HEIGHT + 96 }}
          renderItem={({ item }) => (
            <SalesOrderRow
              order={item}
              onPress={() => router.push(`/modules/sales-orders/${item.id}`)}
              onInvoice={canInvoice ? () => router.push(`/modal/sales-order-accounting-invoice?orderId=${item.id}`) : undefined}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Sipariş bulunamadı" hint="Aramayı veya durumu değiştirin." />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
      {canCreate ? <Fab icon="add" label="Yeni satış siparişi" onPress={() => router.push('/modal/sales-order-form')} /> : null}
    </SafeAreaView>
  );
}
