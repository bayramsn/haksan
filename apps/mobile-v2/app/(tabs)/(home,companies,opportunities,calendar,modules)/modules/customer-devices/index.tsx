import { useOperationsLayout } from '@/src/ui/finance/useOperationsLayout';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCustomerDevices } from '@/src/api/operations.hooks';
import { useDeviceWarrantyTotals } from '@/src/api/service.hooks';
import type { CustomerDevice } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { EmptyState, ErrorState, Fab, FilterChips, ListRow, ListSkeleton, Loading, ScreenHeader, SearchBar, StatStrip } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { machineStatusLabel, machineStatusTone, WARRANTY_TONE, warrantyInfo, warrantyShortLabel, warrantyStats } from '@/src/ui/service/machines';

type Preset = 'warranty' | 'expired';
type DeviceRow = CustomerDevice & { initialCompanyId?: string | null };

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'warranty', label: 'Garantide' },
  { value: 'expired', label: 'Garanti Bitti' },
];

export default function CustomerDevicesScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const { listPad } = useOperationsLayout();
  const router = useRouter();
  const canCreate = useCan('customer_devices.update');
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<Preset | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const serverSearch = useDebouncedValue(search.trim());

  const list = useCustomerDevices({ search: serverSearch || undefined, preset: preset ?? undefined });
  const items = useMemo(() => (list.data?.items ?? []) as DeviceRow[], [list.data]);
  const totals = useDeviceWarrantyTotals(serverSearch || undefined);
  const [now] = useState(() => Date.now());
  const loadedStats = useMemo(() => warrantyStats(items, now), [items, now]);
  const fullyLoaded = !!list.data && !list.hasNextPage && !preset;

  // Liste tamamen yüklüyse kesin sayım; değilse sunucu toplamları + yüklenen satırlardaki 60 gün içindekiler.
  const stats = fullyLoaded || !totals
    ? loadedStats
    : { active: Math.max(0, totals.warranty - loadedStats.expiring), expiring: loadedStats.expiring, expired: totals.expired, unknown: totals.unknown };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Makineler" compact />

      <View className="gap-2 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Model, seri no veya firma ara..." />
        <FilterChips options={PRESETS} value={preset} onChange={setPreset} />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: overviewOpen }}
          onPress={() => setOverviewOpen((value) => !value)}
          className="min-h-[44px] flex-row items-center justify-between rounded-control border border-border bg-card px-3 active:opacity-70"
        >
          <Text className="font-inter-semibold text-[14px] text-foreground">Özet</Text>
          <Text className="font-inter-medium text-[13px] text-primary">{overviewOpen ? 'Gizle' : 'Göster'}</Text>
        </Pressable>
        {overviewOpen && (items.length || totals?.all) ? (
          <StatStrip
            dense
            items={[
              { label: 'Garanti aktif', value: String(stats.active), tone: 'success' },
              { label: 'Yaklaşıyor', value: String(stats.expiring), tone: stats.expiring ? 'warning' : undefined },
              { label: 'Süresi doldu', value: String(stats.expired), tone: stats.expired ? 'destructive' : undefined },
              { label: 'Bilgi yok', value: String(stats.unknown) },
            ]}
          />
        ) : null}
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: listPad, paddingBottom: GLASS_TAB_BAR_HEIGHT + 88 }}
          renderItem={({ item }) => {
            const info = warrantyInfo(item.warrantyEndDate, now);
            const statusTone = machineStatusTone(item.warrantyEndDate, now, item.status);
            const user = item.company?.shortName ?? item.company?.legalTitle ?? null;
            return (
              <ListRow
                title={[item.brandName, item.productModelName ?? item.model].filter(Boolean).join(' ') || 'Makine'}
                lines={[
                  item.serialNumber ? `SN · ${item.serialNumber}` : null,
                  user ? `Kullanıcı firma: ${user}` : null,
                ]}
                icon="hardware-chip-outline"
                iconTone={statusTone}
                chips={[
                  { label: machineStatusLabel(item.warrantyEndDate, now, item.status), tone: statusTone },
                  { label: warrantyShortLabel(info), tone: WARRANTY_TONE[info.state] },
                ]}
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
          ListEmptyComponent={
            search.trim() || preset ? (
              <EmptyState title="Eşleşen makine bulunamadı" hint="Model, seri numarası veya firma bilgisini değiştirerek tekrar deneyin." icon="search-outline" actionLabel="Aramayı ve filtreleri temizle" onAction={() => { setSearch(''); setPreset(null); }} />
            ) : (
              <EmptyState
                title="Kayıtlı makine yok"
                hint="Yeni bir makine/varlık ekleyerek garanti ve servis süreçlerini tek kayıttan izleyin."
                icon="hardware-chip-outline"
                actionLabel={canCreate ? 'Yeni Makine' : undefined}
                onAction={canCreate ? () => router.push('/modal/device-new' as Href) : undefined}
              />
            )
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}

      {canCreate ? <Fab label="Yeni Makine" extended onPress={() => router.push('/modal/device-new' as Href)} /> : null}
    </SafeAreaView>
  );
}
