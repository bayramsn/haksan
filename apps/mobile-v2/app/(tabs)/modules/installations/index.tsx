import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInstallations } from '@/src/api/operations.hooks';
import { useDeliveries } from '@/src/api/logistics.hooks';
import type { Delivery } from '@/src/api/logistics.api';
import type { Installation } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import { chipClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Chip, EmptyState, ErrorState, Fab, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar, StatStrip } from '@/src/ui';
import { Tabs } from '@/src/ui/data';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { JourneySteps } from '@/src/ui/service/JourneySteps';
import {
  INSTALLATION_JOURNEY,
  installationKpis,
  installationStep,
  installationsForTab,
  LOCATION_TYPE_LABELS,
  upcomingInstallations,
  type InstallationTab,
} from '@/src/ui/service/logistics';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

/** Web 200 kaydı tek seferde çeker; mobilde aynı kapsam sayfalı yüklenir. */
const LOAD_LIMIT = 200;

const STATUS_TONE: Record<string, Tone> = { scheduled: 'info', in_progress: 'warning', completed: 'success', cancelled: 'destructive' };

const EMPTY_TEXT: Record<InstallationTab, string> = {
  open: 'Açık kurulum kaydı yok.',
  delivered: 'Teslim edilmiş kurulum kaydı yok.',
  forms: 'Kurulum tutanağı henüz oluşturulmadı.',
};

type Row = { kind: 'installation'; item: Installation } | { kind: 'delivery'; item: Delivery } | { kind: 'header'; title: string; hint: string };

function durationLabel(minutes: number | null): string | null {
  if (minutes == null) return null;
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}

function InstallationRow({ item, onPress }: { item: Installation; onPress: () => void }) {
  const { colors } = useTheme();
  const code = item.status?.code ?? '';
  const tone = STATUS_TONE[code] ?? 'neutral';
  const machine = [item.customerDevice?.brandName, item.customerDevice?.productModelName ?? item.customerDevice?.model].filter(Boolean).join(' ');
  const customer = item.company?.shortName ?? item.company?.legalTitle ?? '—';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${machine || 'Kurulum kaydı'}, ${customer}`}
      onPress={onPress}
      className="my-1 gap-3 rounded-overlay border border-border bg-card px-3.5 py-3 active:opacity-70"
    >
      <View className="flex-row items-center gap-3">
        <View className={`h-10 w-10 items-center justify-center rounded-control border ${chipClass[tone]}`}>
          <Ionicons name="hardware-chip-outline" size={19} color={toneColor(colors, tone)} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>{machine || 'Kurulum kaydı'}</Text>
          <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
            {[customer, item.customerDevice?.serialNumber].filter(Boolean).join(' · ')}
          </Text>
          <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
            {[item.assignedTo?.fullName ?? '—', item.scheduledDate ? formatDate(item.scheduledDate) : '—'].join(' · ')}
          </Text>
          {item.locationType ? (
            <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
              {[LOCATION_TYPE_LABELS[item.locationType] ?? item.locationType, durationLabel(item.durationMinutes)].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
        <Chip tone={tone} label={item.status?.name ?? 'Planlandı'} />
      </View>
      <JourneySteps steps={INSTALLATION_JOURNEY} current={installationStep(item)} compact />
    </Pressable>
  );
}

function LegacyDeliveryRow({ item, onPress }: { item: Delivery; onPress: () => void }) {
  const tezgah = (item.formData?.tezgah ?? {}) as { model?: string; seriNo?: string };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Kurulum tutanağı, ${item.company?.legalTitle ?? 'Firma'}`}
      onPress={onPress}
      className="my-1 flex-row items-center gap-3 rounded-overlay border border-border bg-card px-3.5 py-3 active:opacity-70"
    >
      <View className="flex-1 gap-0.5">
        <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>
          {item.company?.shortName ?? item.company?.legalTitle ?? 'Firma'}
        </Text>
        <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
          {tezgah.model ? `${tezgah.model} · ${tezgah.seriNo || 'Seri no yok'}` : 'Makine bilgisi yok'}
        </Text>
        <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
          {[item.deliveryDate ? formatDate(item.deliveryDate) : '—', item.signedBy || '—'].join(' · ')}
        </Text>
      </View>
      <Chip tone={item.status === 'completed' ? 'success' : 'warning'} label={item.status === 'completed' ? 'Kurulum Tutanağı' : 'Tutanak Bekliyor'} />
    </Pressable>
  );
}

export default function InstallationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('installations.create');
  const canReadDeliveries = useCan('shipments.read');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<InstallationTab>('open');
  const serverSearch = useDebouncedValue(search.trim());

  const list = useInstallations({ search: serverSearch || undefined });
  const deliveries = useDeliveries(canReadDeliveries);
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const deliveryRows = useMemo(() => (canReadDeliveries ? deliveries.data?.items ?? [] : []), [canReadDeliveries, deliveries.data]);
  const deliveryCount = canReadDeliveries ? deliveries.data?.total ?? deliveryRows.length : 0;

  useEffect(() => {
    if (list.hasNextPage && !list.isFetchingNextPage && items.length < LOAD_LIMIT) void list.fetchNextPage();
  }, [items.length, list]);

  const kpis = installationKpis(items, deliveryCount);
  const counts = {
    open: installationsForTab(items, 'open').length,
    delivered: installationsForTab(items, 'delivered').length,
    forms: installationsForTab(items, 'forms').length + deliveryCount,
  };
  const upcoming = upcomingInstallations(items).slice(0, 5);

  const rows = useMemo<Row[]>(() => {
    const base: Row[] = installationsForTab(items, tab).map((item) => ({ kind: 'installation', item }));
    if (tab !== 'forms' || !deliveryRows.length) return base;
    return [
      ...base,
      {
        kind: 'header',
        title: 'Aktarılan Kurulum Tutanakları',
        hint: 'Eski Teslimat bölümündeki kayıtlar kurulum akışının son adımı olarak burada korunur.',
      },
      ...deliveryRows.map((item): Row => ({ kind: 'delivery', item })),
    ];
  }, [deliveryRows, items, tab]);

  const header = (
    <View className="gap-3 pb-2">
      <View className="gap-2 rounded-overlay border border-border bg-card p-3.5">
        <Text accessibilityRole="header" className="font-display-semibold text-[16px] text-foreground">Yaklaşan Ziyaretler</Text>
        <Text className="font-inter text-xs text-muted-foreground">Sıradaki saha çıkışları</Text>
        {upcoming.length === 0 ? (
          <Text className="py-3 text-center font-inter text-xs text-muted-foreground">Planlı ziyaret yok</Text>
        ) : (
          upcoming.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => router.push(`/(tabs)/modules/installations/${item.id}` as Href)}
              className="min-h-[44px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
            >
              <View className={`h-9 w-9 items-center justify-center rounded-control border ${chipClass.warning}`}>
                <Ionicons name="calendar-outline" size={16} color={toneColor(colors, 'warning')} />
              </View>
              <View className="flex-1">
                <Text className="font-inter-medium text-[13px] text-foreground" numberOfLines={1}>
                  {item.company?.shortName ?? item.company?.legalTitle ?? '—'}
                </Text>
                <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>{item.assignedTo?.fullName ?? '—'}</Text>
              </View>
              <Text className="font-inter text-[11px] text-muted-foreground">{item.scheduledDate ? formatDate(item.scheduledDate) : '—'}</Text>
            </Pressable>
          ))
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Kurulumlar"
        subtitle="Makine kurulum süreçlerini ve randevularını takip edin."
        actions={canReadDeliveries ? [{ icon: 'clipboard-outline', label: 'Teslimat Kayıtları', onPress: () => router.push('/(tabs)/modules/deliveries' as Href) }] : []}
      />

      <View className="gap-2 pb-2">
        <StatStrip
          items={[
            { label: 'Toplam Kurulum', value: String(list.data?.total ?? kpis.total) },
            { label: 'Planlı', value: String(kpis.planned), tone: 'warning' },
            { label: 'Tamamlandı', value: String(kpis.completed), tone: 'success' },
            { label: 'Kurulum Tutanağı', value: String(kpis.forms), tone: 'info' },
          ]}
        />
        <SearchBar value={search} onChange={setSearch} placeholder="Firma, makine veya konum" />
        <Tabs
          tabs={[
            { value: 'open', label: `Açık (${counts.open})` },
            { value: 'delivered', label: `Teslim Edildi (${counts.delivered})` },
            { value: 'forms', label: `Kurulum Tutanakları (${counts.forms})` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(row) => (row.kind === 'header' ? 'header' : `${row.kind}-${row.item.id}`)}
          getItemType={(row) => row.kind}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 96 }}
          ListHeaderComponent={tab === 'open' ? header : null}
          renderItem={({ item: row }) =>
            row.kind === 'header' ? (
              <View className="gap-0.5 pb-1 pt-4">
                <Text accessibilityRole="header" className="font-display-semibold text-[16px] text-foreground">{row.title}</Text>
                <Text className="font-inter text-xs text-muted-foreground">{row.hint}</Text>
              </View>
            ) : row.kind === 'delivery' ? (
              <LegacyDeliveryRow item={row.item} onPress={() => router.push(`/(tabs)/modules/deliveries/${row.item.id}` as Href)} />
            ) : (
              <InstallationRow item={row.item} onPress={() => router.push(`/(tabs)/modules/installations/${row.item.id}` as Href)} />
            )
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => {
            void list.refetch();
            if (canReadDeliveries) void deliveries.refetch();
          }}
          ListEmptyComponent={
            <EmptyState
              title={EMPTY_TEXT[tab]}
              icon="hammer-outline"
              actionLabel={canCreate && tab === 'open' ? 'Yeni Kurulum' : undefined}
              onAction={canCreate && tab === 'open' ? () => router.push('/modal/installation-form' as Href) : undefined}
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
      {canCreate ? <Fab label="Yeni Kurulum" extended onPress={() => router.push('/modal/installation-form' as Href)} /> : null}
    </SafeAreaView>
  );
}
