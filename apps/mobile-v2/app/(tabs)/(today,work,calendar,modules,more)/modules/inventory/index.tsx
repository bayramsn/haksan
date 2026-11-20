import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLookup } from '@/src/api/crm.hooks';
import { useInventoryList } from '@/src/api/inventory.hooks';
import type { InventoryItem } from '@/src/api/endpoints';
import { chipClass, chipTextClass, useTheme, type Tone } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Fab, FilterChips, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { SubPageLinks } from '@/src/modules/SubPageLinks';
import { useCan } from '@/src/auth/AuthProvider';

/**
 * `inventory_statuses` seed'indeki GERÇEK kodlar (db/seed/_data.ts).
 * Tahminle yazılan kodlar hiç eşleşmediği için rozetler gri kalıyordu.
 * Tanınmayan kod yine nötre düşer — yeni durum eklenince ekran bozulmasın.
 */
const STATUS_TONE: Record<string, Tone> = {
  available: 'success',
  reserved: 'warning',
  sold: 'neutral',
  in_transit: 'info',
  damaged: 'destructive',
  returned: 'destructive',
};

function InventoryCard({ item, onPress }: { item: InventoryItem; onPress: () => void }) {
  const { colors } = useTheme();
  const tone = STATUS_TONE[item.status?.code ?? ''] ?? 'neutral';
  const available = item.status?.code === 'available';
  const location = [item.warehouse?.name, item.locationStatus?.name].filter(Boolean).join(' / ');
  const stockLabel = item.status?.code === 'sold' ? 'Stok: 0 Adet' : 'Stok: 1 Adet';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.product?.fullName ?? 'Stok kalemi'}, ${item.serialNumber}`}
      onPress={onPress}
      className="my-1 flex-row items-center gap-3 rounded-[8px] border border-border bg-card p-3 active:opacity-70"
      style={{ boxShadow: '0 2px 7px rgba(15, 23, 42, 0.06)' }}
    >
      <View className="h-[72px] w-[82px] items-center justify-center rounded-[8px] bg-card-subtle">
        <Ionicons name="cube-outline" size={40} color={colors.lineStrong} />
      </View>
      <View className="min-w-0 flex-1 gap-1.5">
        <Text className="font-inter-bold text-[15px] text-foreground" numberOfLines={2}>
          {item.product?.fullName ?? item.product?.modelCode ?? 'Stok kalemi'}
        </Text>
        <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
          {item.product?.stockCode ?? item.product?.modelCode ?? item.serialNumber}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
          <Text className="flex-1 font-inter text-[11px] text-muted-foreground" numberOfLines={1}>{location || 'Konum belirtilmedi'}</Text>
        </View>
      </View>
      <View className="w-[92px] items-start gap-1.5">
        <Text className={`font-inter-semibold text-[13px] ${chipTextClass[tone]}`} numberOfLines={1} adjustsFontSizeToFit>{stockLabel}</Text>
        <Text className="font-inter text-[10px] text-muted-foreground" numberOfLines={1}>SN: {item.serialNumber}</Text>
        <View className="flex-row items-center gap-1.5">
          <View className={`h-1.5 w-1.5 rounded-full ${chipClass[tone].split(' ')[0]}`} />
          <Text className={`font-inter text-[10px] ${chipTextClass[tone]}`} numberOfLines={1}>
            {available ? 'Yeterli' : (item.status?.name ?? 'Durum yok')}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function InventoryScreen() {
  const router = useRouter();
  const canCreate = useCan('inventory.create');
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(true);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const serverSearch = useDebouncedValue(search.trim());

  const statuses = useLookup('inventory-statuses');
  // Fırsat detayındaki "Stok" kutusundan gelindiyse yalnız o fırsata ayrılanlar.
  const { opportunityId } = useLocalSearchParams<{ opportunityId?: string }>();
  const query = useMemo(
    () => ({ search: serverSearch || undefined, statusCode: statusCode ?? undefined, opportunityId }),
    [serverSearch, statusCode, opportunityId]
  );

  const list = useInventoryList(query);
  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <SyncStatus />
      <ScreenHeader count={list.data?.total}
        title="Stok"
        subtitle={opportunityId ? 'Bu fırsat için ayrılan stoklar.' : undefined}
        actions={[
          { icon: 'search-outline', label: 'Stok aramasını göster', onPress: () => setSearchVisible((current) => !current) },
          { icon: 'funnel-outline', label: 'Stokları filtrele', dot: filtersVisible || statusCode !== null, onPress: () => setFiltersVisible((current) => !current) },
          ...(canCreate ? [{ icon: 'add' as const, label: 'Yeni stok kaydı', onPress: () => router.push('/modal/inventory-item' as never) }] : []),
        ]}
      />
      <SubPageLinks parent="inventory" />

      <View className="gap-2 pb-2">
        {searchVisible ? (
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Stok ara..."
            onFilterPress={() => setFiltersVisible((current) => !current)}
            filterActive={statusCode !== null}
          />
        ) : null}
        {filtersVisible ? (
          <View className="gap-2">
            <FilterChips
              options={(statuses.data ?? []).map((status) => ({ value: status.code, label: status.name }))}
              value={statusCode}
              onChange={setStatusCode}
            />
            <View className="px-4">
              <Button label="QR / Barkod Tara" variant="ghost" onPress={() => router.push('/modules/inventory/scan')} />
            </View>
          </View>
        ) : null}
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList contentInsetAdjustmentBehavior="automatic"
          // v2'de bu özellik varsayılan AÇIK ve sayfalama/yeniden ölçüm sonrası
          // içeriği çapalayıp listenin başında boşluk bırakıyor. Bunlar sohbet
          // değil, tepeden akan listeler — kapalı olmalı.
          maintainVisibleContentPosition={{ disabled: true }}
          // FlashList v2 kendi başına esnemiyor; sınırlanmamış sütun içinde
          // içerik aşağı kayıyor ve filtrelerin altında boşluk kalıyor.
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <InventoryCard item={item} onPress={() => router.push(`/modules/inventory/${item.id}`)} />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Stok kaydı bulunamadı" hint="Aramayı veya durumu değiştirin." />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
      <Fab icon="qr-code-outline" label="QR veya barkod tara" onPress={() => router.push('/modules/inventory/scan')} />
    </SafeAreaView>
  );
}
