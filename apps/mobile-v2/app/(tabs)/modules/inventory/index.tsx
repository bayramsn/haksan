import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useStockSummary } from '@/src/api/calendar.hooks';
import { useLookup } from '@/src/api/crm.hooks';
import { useInventoryList } from '@/src/api/inventory.hooks';
import type { InventoryItem } from '@/src/api/endpoints';
import { formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import {
  ListSkeleton,
  EmptyState,
  Button,
  ErrorState,
  FilterChips,
  ListRow,
  Loading,
  ScreenHeader,
  SearchBar,
  StatStrip,
} from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

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

/** Web'deki "Yeni / Kullanılmış" kolonu (`inventory_items.item_condition`). */
const CONDITION_LABEL: Record<string, string> = { new: 'Sıfır', used: 'Kullanılmış' };

/**
 * Web stok tablosundaki satır bilgisini mobile taşır (StockPage.tsx kolonları:
 * Ürün Adı · Marka · Seri No · Kontrol Ünitesi · Yeni/Kullanılmış · Yüklendiği
 * Tarih · Geldiği Tarih · Ürünün Bulunduğu Yer · Rezerve Edildiği Firma).
 */
function rowLines(item: InventoryItem): (string | null)[] {
  const condition = CONDITION_LABEL[item.itemCondition] ?? item.itemCondition;
  const control = item.controlUnit
    ? `${item.controlUnit}${item.controlUnitSerialNumber ? ` (${item.controlUnitSerialNumber})` : ''}`
    : null;
  // Yükleme ve varış tarihi web'de ayrı kolonlar; mobilde tek satırda birleşiyor.
  const dates = [
    item.loadingDate ? `Yükleme: ${formatDate(item.loadingDate)}` : null,
    item.arrivalDate ? `Varış: ${formatDate(item.arrivalDate)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return [
    `SN: ${item.serialNumber}`,
    [item.brand?.name, condition].filter(Boolean).join(' · ') || null,
    control ? `Kontrol ünitesi: ${control}` : null,
    [item.warehouse?.name, item.locationStatus?.name].filter(Boolean).join(' · ') || null,
    item.reservedCompany
      ? `Rezerve: ${item.reservedCompany.shortName ?? item.reservedCompany.legalTitle}`
      : dates || null,
  ];
}

export default function InventoryScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const serverSearch = useDebouncedValue(search.trim());

  const statuses = useLookup('inventory-statuses');
  // Şerit sayıları sunucudan (tüm tablo), yüklenmiş sayfadan değil — web'deki
  // "Tüm Stok / Hazır / Rezerve / Satılan / Yolda" kutularının karşılığı.
  const summary = useStockSummary();

  const query = useMemo(
    () => ({ search: serverSearch || undefined, statusCode: statusCode ?? undefined }),
    [serverSearch, statusCode]
  );

  const list = useInventoryList(query);
  const items = list.data?.items ?? [];

  const countOf = (code: string) => summary.data?.find((row) => row.status === code)?.count ?? 0;
  const totalCount = (summary.data ?? []).reduce((sum, row) => sum + row.count, 0);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Stoklar" subtitle="Seri numarası bazında stok kayıtları." />

      {summary.data?.length ? (
        <View className="pb-2">
          <StatStrip
            items={[
              { label: 'Tüm Stok', value: String(totalCount) },
              { label: 'Hazır', value: String(countOf('available')), tone: 'success' },
              { label: 'Rezerve', value: String(countOf('reserved')), tone: 'warning' },
              { label: 'Yolda', value: String(countOf('in_transit')), tone: 'info' },
              { label: 'Satılan', value: String(countOf('sold')), tone: 'neutral' },
            ]}
          />
        </View>
      ) : null}

      <View className="gap-2 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Seri no, model veya marka" />
        <View className="px-4">
          <Button
            label="QR / Barkod Tara"
            variant="ghost"
            onPress={() => router.push('/(tabs)/modules/inventory/scan')}
          />
        </View>
        <FilterChips
          options={(statuses.data ?? []).map((status) => ({ value: status.code, label: status.name }))}
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
          renderItem={({ item }) => (
            <ListRow
              title={item.product?.fullName ?? item.product?.modelCode ?? 'Ürün'}
              lines={rowLines(item)}
              icon="cube-outline"
              iconTone={STATUS_TONE[item.status?.code ?? ''] ?? 'neutral'}
              chip={
                item.status
                  ? { label: item.status.name, tone: STATUS_TONE[item.status.code] ?? 'neutral' }
                  : undefined
              }
              onPress={() => router.push(`/(tabs)/modules/inventory/${item.id}`)}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListHeaderComponent={
            list.data?.total ? (
              <Text className="pb-1 pt-1 font-inter text-[12px] text-muted-foreground">
                {list.data.total} kalem listeleniyor
              </Text>
            ) : null
          }
          ListEmptyComponent={<EmptyState title="Stok kaydı bulunamadı" hint="Aramayı veya durumu değiştirin." />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
