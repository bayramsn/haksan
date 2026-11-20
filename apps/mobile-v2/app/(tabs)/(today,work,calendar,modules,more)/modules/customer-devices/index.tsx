import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCustomerDevices } from '@/src/api/operations.hooks';
import type { CustomerDevice } from '@/src/api/endpoints';
import { dueLabel, formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { EmptyState, ErrorState, Fab, FilterChips, ListRow, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { useCan } from '@/src/auth/AuthProvider';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { SubPageLinks } from '@/src/modules/SubPageLinks';

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
  const canCreate = useCan('customer_devices.update');
  const [search, setSearch] = useState('');
  const params = useLocalSearchParams<{ preset?: string }>();
  const [preset, setPreset] = useState<Preset | null>(() => params.preset === 'warranty' || params.preset === 'expired' ? params.preset : null);
  const serverSearch = useDebouncedValue(search.trim());

  const list = useCustomerDevices({ search: serverSearch || undefined, preset: preset ?? undefined });
  const items = list.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <SyncStatus />
      <ScreenHeader count={list.data?.total} title="Makineler" />
      <SubPageLinks parent="customer-devices" />

      <View className="gap-2 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Seri no, model veya firma" />
        <FilterChips options={PRESETS} value={preset} onChange={setPreset} />
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
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 96 }}
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
                onPress={() => router.push(`/modules/customer-devices/${item.id}` as Href)}
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
      {canCreate ? <Fab label="Yeni makine" onPress={() => router.push('/modal/device')} /> : null}
    </SafeAreaView>
  );
}
