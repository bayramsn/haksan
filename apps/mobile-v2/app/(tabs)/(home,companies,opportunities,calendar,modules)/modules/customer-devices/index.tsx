import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCustomerDevices } from '@/src/api/operations.hooks';
import { useCompanyNames, useDeviceWarrantyTotals } from '@/src/api/service.hooks';
import type { CustomerDevice } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { formatAmount, formatDate } from '@/src/lib/format';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { EmptyState, ErrorState, Fab, FilterChips, ListRow, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar, StatStrip } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { machineStatusLabel, WARRANTY_TONE, warrantyInfo, warrantyShortLabel, warrantyStats } from '@/src/ui/service/machines';

type Preset = 'warranty' | 'expired';
type DeviceRow = CustomerDevice & { initialCompanyId?: string | null };

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'warranty', label: 'Garantide' },
  { value: 'expired', label: 'Garanti Bitti' },
];

export default function CustomerDevicesScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const canCreate = useCan('customer_devices.update');
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<Preset | null>(null);
  const serverSearch = useDebouncedValue(search.trim());

  const list = useCustomerDevices({ search: serverSearch || undefined, preset: preset ?? undefined });
  const items = useMemo(() => (list.data?.items ?? []) as DeviceRow[], [list.data]);
  const totals = useDeviceWarrantyTotals(serverSearch || undefined);
  const [now] = useState(() => Date.now());
  const loadedStats = useMemo(() => warrantyStats(items, now), [items, now]);
  const fullyLoaded = !!list.data && !list.hasNextPage && !preset;
  const initialNames = useCompanyNames(items.filter((item) => item.initialCompanyId && item.initialCompanyId !== item.companyId).map((item) => item.initialCompanyId!));

  // Liste tamamen yüklüyse kesin sayım; değilse sunucu toplamları + yüklenen satırlardaki 60 gün içindekiler.
  const stats = fullyLoaded || !totals
    ? loadedStats
    : { active: Math.max(0, totals.warranty - loadedStats.expiring), expiring: loadedStats.expiring, expired: totals.expired, unknown: totals.unknown };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Makineler" subtitle="Kurulu makineler, garanti ve servis geçmişi." />

      <View className="gap-2 pb-2">
        {items.length || totals?.all ? (
          <StatStrip
            items={[
              { label: 'Garanti aktif', value: String(stats.active), tone: 'success' },
              { label: 'Yaklaşıyor', value: String(stats.expiring), tone: stats.expiring ? 'warning' : undefined },
              { label: 'Süresi doldu', value: String(stats.expired), tone: stats.expired ? 'destructive' : undefined },
              { label: 'Bilgi yok', value: String(stats.unknown) },
            ]}
          />
        ) : null}
        <SearchBar value={search} onChange={setSearch} placeholder="Model, seri no veya firma ara..." />
        <FilterChips options={PRESETS} value={preset} onChange={setPreset} />
        <Text className="px-4 font-inter text-xs text-muted-foreground">{items.length} makine yüklendi{list.data ? ` · ${list.data.total} kayıt` : ''}</Text>
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
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: GLASS_TAB_BAR_HEIGHT + 88 }}
          renderItem={({ item }) => {
            const info = warrantyInfo(item.warrantyEndDate, now);
            const tone = WARRANTY_TONE[info.state];
            const user = item.company?.shortName ?? item.company?.legalTitle ?? null;
            const initial = item.initialCompanyId && item.initialCompanyId !== item.companyId ? initialNames.get(item.initialCompanyId) ?? '…' : null;
            const price = item.cashPrice ? formatAmount(item.cashPrice, item.currencyCode ?? 'TRY') : null;
            return (
              <ListRow
                title={[item.brandName, item.productModelName ?? item.model].filter(Boolean).join(' ') || 'Makine'}
                lines={[
                  item.serialNumber ? `SN · ${item.serialNumber}` : null,
                  user ? `Kullanıcı firma: ${user}` : null,
                  initial ? `İlk müşteri: ${initial}` : null,
                  item.controlUnit ? `Kontrol paneli: ${item.controlUnit}` : null,
                  price ? `Peşin: ${price}` : null,
                  item.warrantyEndDate ? `Garanti sonu: ${formatDate(item.warrantyEndDate)}` : null,
                  item.installationDate ? `Kurulum · ${formatDate(item.installationDate)}` : null,
                ]}
                icon="hardware-chip-outline"
                iconTone={tone}
                chips={[
                  { label: warrantyShortLabel(info), tone },
                  { label: machineStatusLabel(item.warrantyEndDate, now), tone: info.state === 'expired' ? 'neutral' : 'success' },
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
