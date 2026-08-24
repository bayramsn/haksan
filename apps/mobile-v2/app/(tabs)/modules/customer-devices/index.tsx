import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCustomerDevices } from '@/src/api/operations.hooks';
import type { CustomerDevice } from '@/src/api/endpoints';
import { dueLabel, formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { ListSkeleton, EmptyState, ErrorState, FilterChips, ListRow, Loading, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

type Preset = 'warranty' | 'expired';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'warranty', label: 'Garantide' },
  { value: 'expired', label: 'Garanti Bitti' },
];

/** Garanti bitiş tarihine göre; tarih yoksa durum bilinmiyor sayılır. */
function warrantyOf(device: CustomerDevice): { label: string; tone: Tone; active: boolean | null } {
  if (!device.warrantyEndDate) return { label: 'Garanti yok', tone: 'neutral', active: null };
  const due = dueLabel(device.warrantyEndDate);
  if (due?.overdue) return { label: 'Garanti bitti', tone: 'neutral', active: false };
  return { label: 'Garantide', tone: 'success', active: true };
}

export default function CustomerDevicesScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<Preset | null>(null);
  const serverSearch = useDebouncedValue(search.trim());

  const list = useCustomerDevices({ search: serverSearch || undefined, preset: preset ?? undefined });
  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Makine Parkı" subtitle="Sahadaki makine ve seri no kayıtlarını izleyin." />

      <View className="gap-2 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Seri no, model veya firma" />
        <FilterChips options={PRESETS} value={preset} onChange={setPreset} />
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
            const warranty = warrantyOf(item);
            // Tasarım üç tarihi yan yana istiyor (Kurulum/Garanti/Sonraki Bakım); "Sonraki
            // Bakım" bu uçta yok — maintenance-plans ayrı tablo, burada join edilmiyor.
            const dates = [
              item.installationDate ? `Kurulum: ${formatDate(item.installationDate)}` : null,
              item.warrantyEndDate ? `Garanti: ${formatDate(item.warrantyEndDate)}` : null,
            ]
              .filter(Boolean)
              .join('   ·   ') || null;
            return (
              <ListRow
                title={item.productModelName ?? item.model ?? 'Makine'}
                lines={[
                  item.serialNumber ? `SN: ${item.serialNumber}` : null,
                  item.company?.shortName ?? item.company?.legalTitle ?? null,
                  [item.brandName, item.productTypeName].filter(Boolean).join(' · ') || null,
                  dates,
                ]}
                icon="hardware-chip-outline"
                iconTone={warranty.tone}
                chip={{ label: warranty.label, tone: warranty.tone }}
                onPress={() => router.push(`/(tabs)/modules/customer-devices/${item.id}` as Href)}
              />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Makine kaydı yok" />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
