import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useLookup } from '@/src/api/crm.hooks';
import { useProductList } from '@/src/api/inventory.hooks';
import { formatAmount } from '@/src/lib/format';
import { ListSkeleton, EmptyState, ErrorState, FilterChips, ListRow, Loading, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

export default function ProductsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [categoryCode, setCategoryCode] = useState<string | null>(null);
  const serverSearch = useDebouncedValue(search.trim());

  const categories = useLookup('product-categories');
  const query = useMemo(
    () => ({ search: serverSearch || undefined, categoryCode: categoryCode ?? undefined }),
    [serverSearch, categoryCode]
  );

  const list = useProductList(query);
  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Ürünler" subtitle="Ürün modellerini ve fiyatlarını görüntüleyin." />

      <View className="gap-2 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Ürün, model kodu veya marka" />
        <FilterChips
          options={(categories.data ?? []).map((category) => ({ value: category.code, label: category.name }))}
          value={categoryCode}
          onChange={setCategoryCode}
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
          renderItem={({ item }) => (
            <ListRow
              title={item.fullName}
              lines={[
                item.modelCode,
                [item.brand?.name, item.category?.name].filter(Boolean).join(' · ') || null,
                item.stockCode ? `Stok kodu: ${item.stockCode}` : null,
              ]}
              icon="pricetag-outline"
              iconTone="info"
              trailing={
                item.listPrice ? formatAmount(item.listPrice, item.currency?.code ?? 'TRY') : undefined
              }
              onPress={() => router.push(`/(tabs)/modules/products/${item.id}`)}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Ürün bulunamadı" hint="Aramayı veya kategoriyi değiştirin." />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
