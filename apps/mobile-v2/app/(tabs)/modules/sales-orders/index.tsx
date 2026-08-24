import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useSalesOrders } from '@/src/api/inventory.hooks';
import { formatAmount, formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { ListSkeleton, EmptyState, ErrorState, FilterChips, ListRow, Loading, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

// Kodlar sales_order_statuses seed'iyle birebir (draft/pending_super_admin_approval/
// confirmed/reserved/fulfilled/cancelled) — eşleşmeyen kod nötr renge düşer.
const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  pending_super_admin_approval: 'warning',
  confirmed: 'success',
  reserved: 'info',
  fulfilled: 'success',
  cancelled: 'destructive',
};

export default function SalesOrdersScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const serverSearch = useDebouncedValue(search.trim());

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
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }) => {
            const tone = STATUS_TONE[item.status?.code ?? ''] ?? 'neutral';
            return (
              <ListRow
                title={item.orderNo}
                lines={[
                  item.company?.shortName ?? item.company?.legalTitle ?? null,
                  // İkinci bir rozet için ayrı bir slot yok (ListRow tek chip alıyor,
                  // src/ui'a dokunulamıyor) — stok durumu bu yüzden ikinci satırda.
                  item.reservedAt ? 'Rezervasyonlu' : 'Stoktan',
                  formatDate(item.orderDate),
                ]}
                icon="receipt-outline"
                iconTone={tone}
                chip={item.status ? { label: item.status.name, tone } : undefined}
                trailing={formatAmount(item.grandTotal, item.currency?.code ?? 'TRY')}
                onPress={() => router.push(`/(tabs)/modules/sales-orders/${item.id}` as Href)}
              />
            );
          }}
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
    </SafeAreaView>
  );
}
