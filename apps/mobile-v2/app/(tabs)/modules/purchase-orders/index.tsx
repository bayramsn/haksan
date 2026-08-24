import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { usePurchaseOrders } from '@/src/api/inventory.hooks';
import { formatAmount, formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { ListSkeleton, EmptyState, ErrorState, FilterChips, ListRow, Loading, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

// Kodlar purchase_order_statuses seed'iyle birebir (draft/pending_manager_approval/
// sent/approved/in_transit/received/cancelled) — "Onay Bekliyor" vurgusu bu tondan gelir.
const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  pending_manager_approval: 'warning',
  sent: 'info',
  approved: 'success',
  in_transit: 'info',
  received: 'success',
  cancelled: 'destructive',
};

export default function PurchaseOrdersScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const serverSearch = useDebouncedValue(search.trim());

  const query = useMemo(
    () => ({ search: serverSearch || undefined, statusCode: statusCode ?? undefined }),
    [serverSearch, statusCode]
  );

  const list = usePurchaseOrders(query);
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
      <ScreenHeader title="Satın Alma" subtitle="Satın alma taleplerini ve siparişlerini yönetin." />

      <View className="gap-2 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Sipariş no, tedarikçi veya ürün" />
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
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }) => {
            const tone = STATUS_TONE[item.status?.code ?? ''] ?? 'neutral';
            const supplier = item.supplier;
            return (
              <ListRow
                title={item.orderNo}
                lines={[
                  supplier?.shortName ?? supplier?.legalTitle ?? null,
                  formatDate(item.orderDate),
                  item.expectedDate ? `Beklenen: ${formatDate(item.expectedDate)}` : item.invoiceNo,
                ]}
                icon="cart-outline"
                iconTone={tone}
                chip={item.status ? { label: item.status.name, tone } : undefined}
                trailing={formatAmount(item.grandTotal, item.currency?.code ?? 'TRY')}
                onPress={() => router.push(`/(tabs)/modules/purchase-orders/${item.id}` as Href)}
              />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Satın alma kaydı yok" hint="Aramayı veya durumu değiştirin." />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
