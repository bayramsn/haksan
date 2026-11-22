import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { exportService } from '@/src/api/exports';
import { useDeliveries } from '@/src/api/logistics.hooks';
import type { Delivery } from '@/src/api/logistics.api';
import { useCan } from '@/src/auth/AuthProvider';
import { firstParam, matchesOpportunityOrCompany } from '@/src/features/opportunities/case-scope';
import { formatDate } from '@/src/lib/format';
import { chipClass, toneColor, useTheme } from '@/src/theme/theme';
import { Chip, EmptyState, ErrorState, Fab, FilterChips, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar, StatStrip } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { SyncStatus } from '@/src/ui/SyncStatus';
import {
  DELIVERY_STATUS_LABELS,
  deliveryKpis,
  isDeliveryFormReady,
  isSigned,
  upcomingDeliveries,
} from '@/src/ui/service/logistics';

type StatusFilter = 'completed' | 'pending';

/** Web 200 kaydı tek seferde çeker; mobilde aynı kapsam sayfalı yüklenir. */
const LOAD_LIMIT = 200;

function machineLabel(row: Delivery): string {
  const tezgah = (row.formData?.tezgah ?? {}) as { marka?: string; model?: string };
  return [tezgah.marka, tezgah.model].filter(Boolean).join(' ');
}

function DeliveryRow({ item, onPress }: { item: Delivery; onPress: () => void }) {
  const formReady = isDeliveryFormReady(item);
  const signed = isSigned(item.signedBy);
  const tezgah = (item.formData?.tezgah ?? {}) as { seriNo?: string };
  const machine = machineLabel(item);
  const customer = item.company?.shortName ?? item.company?.legalTitle ?? '—';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${machine || 'Teslimat kaydı'}, ${customer}`}
      onPress={onPress}
      className="my-1 gap-3 rounded-overlay border border-border bg-card px-3.5 py-3 active:opacity-70"
    >
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>{machine || 'Teslimat kaydı'}</Text>
          <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
            {[customer, tezgah.seriNo, item.deliveryDate ? formatDate(item.deliveryDate) : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Chip tone={item.status === 'completed' ? 'success' : 'warning'} label={DELIVERY_STATUS_LABELS[item.status] ?? item.status} />
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Chip tone={formReady ? 'success' : 'warning'} label={formReady ? 'Form hazır' : 'Form bekliyor'} />
        <Chip tone={signed ? 'success' : 'neutral'} label={signed ? item.signedBy ?? '' : 'İmza bekliyor'} />
      </View>
    </Pressable>
  );
}

/** Web DeliveriesPage ("Teslimat Kayıtları"). */
export default function DeliveriesScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const params = useLocalSearchParams<{ opportunityId?: string; companyId?: string }>();
  const scopeOpportunityId = firstParam(params.opportunityId);
  const scopeCompanyId = firstParam(params.companyId);
  const { colors } = useTheme();
  const canRead = useCan('shipments.read');
  const canCreate = useCan('shipments.create');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter | null>(null);
  const [exporting, setExporting] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const list = useDeliveries(canRead);
  const rows = useMemo(
    () =>
      (list.data?.items ?? []).filter((row) =>
        matchesOpportunityOrCompany(row, { opportunityId: scopeOpportunityId || null, companyId: scopeCompanyId || null }),
      ),
    [list.data, scopeCompanyId, scopeOpportunityId],
  );

  const loadedCount = list.data?.items?.length ?? 0;
  useEffect(() => {
    if (list.hasNextPage && !list.isFetchingNextPage && loadedCount < LOAD_LIMIT) void list.fetchNextPage();
  }, [list, loadedCount]);

  if (!canRead) return <Redirect href={'/modules/installations' as Href} />;

  const kpis = deliveryKpis(rows);
  const visible = rows.filter((row) => {
    if (statusFilter && (statusFilter === 'completed' ? row.status !== 'completed' : row.status === 'completed')) return false;
    const term = search.trim().toLocaleLowerCase('tr-TR');
    const serial = (row.formData?.tezgah as { seriNo?: string } | undefined)?.seriNo;
    return !term || [machineLabel(row), row.company?.shortName, row.company?.legalTitle, serial, row.signedBy].some((value) => value?.toLocaleLowerCase('tr-TR').includes(term));
  });
  const hasFilters = Boolean(search.trim() || statusFilter);
  const upcoming = upcomingDeliveries(rows);

  const runExport = async () => {
    setExporting(true);
    try {
      await exportService.deliveries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Excel dosyası indirilemedi.');
    } finally {
      setExporting(false);
    }
  };

  const openDelivery = (id: string) => router.push(`/modules/deliveries/${id}` as Href);

  const upcomingRoute = upcoming.length ? (
    <View className="mb-2 gap-2 rounded-overlay border border-border bg-card p-3.5">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text accessibilityRole="header" className="font-inter-semibold text-[16px] text-foreground">Yaklaşan teslim rotası</Text>
          <Text className="font-inter text-xs text-muted-foreground">İmza ve form hazırlığı gereken sıradaki kayıtlar</Text>
        </View>
        <Chip tone="warning" label={`${kpis.pending} bekleyen`} />
      </View>
      {upcoming.map((row, index) => (
        <Pressable
          key={row.id}
          accessibilityRole="button"
          onPress={() => openDelivery(row.id)}
          className="min-h-[44px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
        >
          <View className={`h-8 w-8 items-center justify-center rounded-full border ${chipClass.info}`}>
            <Text className="font-inter-bold text-[11px]" style={{ color: toneColor(colors, 'info') }}>{index + 1}</Text>
          </View>
          <View className="flex-1">
            <Text className="font-inter-medium text-[13px] text-foreground" numberOfLines={2}>
              {machineLabel(row) || row.company?.shortName || row.company?.legalTitle || 'Teslimat'}
            </Text>
            <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={2}>
              {`${row.deliveryDate ? formatDate(row.deliveryDate) : '—'} · ${isSigned(row.signedBy) ? row.signedBy : 'İmza bekliyor'}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
      ))}
    </View>
  ) : null;

  const header = overviewOpen ? (
    <View className="gap-2">
      <StatStrip
        dense
        items={[
          { label: 'Toplam Teslimat', value: String(list.data?.total ?? kpis.total) },
          { label: 'Tamamlandı', value: String(kpis.completed), tone: 'success' },
          { label: 'Bekleyen', value: String(kpis.pending), tone: 'warning' },
        ]}
      />
      {upcomingRoute}
    </View>
  ) : null;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Teslimat Kayıtları"
        actions={[{ icon: exporting ? 'hourglass-outline' : 'download-outline', label: "Excel'e aktar", onPress: () => void (exporting ? null : runExport()) }]}
        compact/>
      <View className="gap-2 pb-2">
        {scopeOpportunityId || scopeCompanyId ? (
          <Text className="px-4 font-inter text-[12px] text-muted-foreground">
            {scopeOpportunityId ? 'Bu fırsata bağlı kayıtlar' : 'Bu firmaya bağlı kayıtlar'}
          </Text>
        ) : null}
        <SearchBar value={search} onChange={setSearch} placeholder="Makine, firma veya seri no ara" />
        <FilterChips
          options={[
            { value: 'completed' as const, label: 'Tamamlandı' },
            { value: 'pending' as const, label: 'Bekliyor' },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: overviewOpen }}
          onPress={() => setOverviewOpen((value) => !value)}
          className="mx-4 min-h-[44px] flex-row items-center justify-between rounded-control border border-border bg-card px-3 active:opacity-70"
        >
          <Text className="font-inter-semibold text-[14px] text-foreground">Özet</Text>
          <Text className="font-inter-medium text-[13px] text-primary">{overviewOpen ? 'Gizle' : 'Göster'}</Text>
        </Pressable>
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={visible}
          keyExtractor={(row) => row.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: GLASS_TAB_BAR_HEIGHT + 96 }}
          ListHeaderComponent={header}
          renderItem={({ item }) => <DeliveryRow item={item} onPress={() => openDelivery(item.id)} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={
            <EmptyState
              title={hasFilters ? "Eşleşen teslimat yok" : "Henüz teslimat kaydı yok"}
              hint={hasFilters ? "Aramayı veya durum filtresini değiştirin." : "Müşteri teslim formu oluşturarak imza sürecini başlatın."}
              icon="clipboard-outline"
              actionLabel={canCreate ? 'Yeni Teslimat' : undefined}
              onAction={canCreate ? () => router.push('/modal/delivery-form' as Href) : undefined}
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
      {canCreate ? <Fab label="Yeni Teslimat" extended onPress={() => router.push('/modal/delivery-form' as Href)} /> : null}
    </SafeAreaView>
  );
}
