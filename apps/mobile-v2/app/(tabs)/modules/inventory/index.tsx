import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLookup } from '@/src/api/crm.hooks';
import { useInventoryList } from '@/src/api/inventory.hooks';
import type { InventoryItem } from '@/src/api/endpoints';
import { chipClass, chipTextClass, useTheme, type Tone } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, FilterChips, ListSkeleton, Loading, SCREEN_PAD, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { Logo } from '@/src/ui/Logo';

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

function InventoryHeader({
  searchActive,
  filterActive,
  onSearch,
  onFilter,
  onNotifications,
}: {
  searchActive: boolean;
  filterActive: boolean;
  onSearch: () => void;
  onFilter: () => void;
  onNotifications: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="px-4 pb-3 pt-1">
      <View className="h-12 flex-row items-center justify-between">
        <Logo width={148} />
        <Pressable accessibilityRole="button" accessibilityLabel="Bildirimler" onPress={onNotifications} className="h-11 w-11 items-center justify-center active:opacity-60">
          <Ionicons name="notifications-outline" size={26} color={colors.mutedForeground} />
          <View className="absolute right-2.5 top-2 h-2.5 w-2.5 rounded-full border-2 border-canvas bg-primary" />
        </Pressable>
      </View>
      <View className="mt-3 flex-row items-end justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text accessibilityRole="header" className="font-inter-bold text-[30px] leading-[36px] text-primary" style={{ letterSpacing: 0 }}>
            Stoklar
          </Text>
          <Text className="font-inter text-[14px] leading-5 text-muted-foreground">Tüm stoklarınızı görüntüleyin ve yönetin.</Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stok aramasını göster"
            accessibilityState={{ selected: searchActive }}
            onPress={onSearch}
            className="h-12 w-12 items-center justify-center rounded-[8px] border border-border bg-card active:opacity-70"
          >
            <Ionicons name="search-outline" size={25} color={colors.foreground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stokları filtrele"
            accessibilityState={{ selected: filterActive }}
            onPress={onFilter}
            className="h-12 w-12 items-center justify-center rounded-[8px] border border-border bg-card active:opacity-70"
          >
            <Ionicons name="options-outline" size={23} color={colors.foreground} />
            {filterActive ? <View className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" /> : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

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
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(true);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const serverSearch = useDebouncedValue(search.trim());

  const statuses = useLookup('inventory-statuses');
  const query = useMemo(
    () => ({ search: serverSearch || undefined, statusCode: statusCode ?? undefined }),
    [serverSearch, statusCode]
  );

  const list = useInventoryList(query);
  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <InventoryHeader
        searchActive={searchVisible}
        filterActive={filtersVisible || statusCode !== null}
        onSearch={() => setSearchVisible((current) => !current)}
        onFilter={() => setFiltersVisible((current) => !current)}
        onNotifications={() => router.push('/(tabs)/notifications')}
      />

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
              <Button label="QR / Barkod Tara" variant="ghost" onPress={() => router.push('/(tabs)/modules/inventory/scan')} />
            </View>
          </View>
        ) : null}
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
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <InventoryCard item={item} onPress={() => router.push(`/(tabs)/modules/inventory/${item.id}`)} />
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="QR veya barkod tara"
        onPress={() => router.push('/(tabs)/modules/inventory/scan')}
        className="absolute bottom-5 right-5 h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
        style={{ boxShadow: '0 7px 18px rgba(214, 24, 31, 0.28)' }}
      >
        <Ionicons name="add" size={34} color={colors.primaryForeground} />
      </Pressable>
    </SafeAreaView>
  );
}
