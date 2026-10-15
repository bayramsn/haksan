import { useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { exportService } from '@/src/api/exports';
import { useShipments } from '@/src/api/operations.hooks';
import type { Shipment } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Chip, EmptyState, ErrorState, Fab, FilterChips, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, StatStrip } from '@/src/ui';
import { ProgressBar } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { JourneySteps } from '@/src/ui/service/JourneySteps';
import {
  carrierShare,
  etaState,
  filterShipments,
  ROUTE_STEPS,
  routeStep,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_ORDER,
  shipmentKpis,
  shipmentPartyName,
} from '@/src/ui/service/logistics';

/** Web tüm sevkiyatları tek seferde listeler; mobilde aynı kapsam sayfalı yüklenir. */
const LOAD_LIMIT = 200;

type Direction = 'incoming' | 'outgoing';
type StatusFilter = 'in_transit' | 'at_customs' | 'delivered';

const STATUS_TONE: Record<string, Tone> = {
  preparing: 'warning',
  in_transit: 'info',
  at_customs: 'stage',
  cleared: 'info',
  delivered: 'success',
};

function statusCodeOf(row: Shipment): string {
  return row.status?.code ?? (row.arrivedAt ? 'delivered' : row.shippedAt ? 'in_transit' : 'preparing');
}

function ShipmentRow({ item, now, onPress }: { item: Shipment; now: number; onPress: () => void }) {
  const code = statusCodeOf(item);
  const eta = etaState(item.eta, now);
  const party = shipmentPartyName(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sevkiyat ${item.trackingNo ?? item.shipmentNo ?? ''}`}
      onPress={onPress}
      className="my-1 gap-3 rounded-overlay border border-border bg-card px-3.5 py-3 active:opacity-70"
    >
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="font-inter-semibold text-[15px] text-foreground" numberOfLines={1}>
            {item.trackingNo ?? item.shipmentNo ?? 'Sevkiyat'}
          </Text>
          <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
            {item.carrierCompany?.legalTitle ?? item.carrier ?? 'Taşıyıcı yok'}
          </Text>
          {party ? <Text className="font-inter text-xs text-foreground" numberOfLines={1}>{party}</Text> : null}
          {item.origin || item.destination ? (
            <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
              {`${item.origin || '—'} → ${item.destination || '—'}`}
            </Text>
          ) : null}
        </View>
        <View className="items-end gap-1.5">
          <Chip tone={item.direction === 'incoming' ? 'info' : 'warning'} label={item.direction === 'incoming' ? '↓ Gelen' : '↑ Giden'} />
          <Chip tone={STATUS_TONE[code] ?? 'neutral'} label={item.status?.name ?? SHIPMENT_STATUS_LABELS[code] ?? code} />
        </View>
      </View>
      <JourneySteps steps={ROUTE_STEPS} current={routeStep(code)} compact />
      <View className="flex-row items-center justify-between gap-2">
        <Text className="font-inter text-xs text-muted-foreground">{item.eta ? `ETA ${formatDate(item.eta)}` : 'ETA —'}</Text>
        <Chip tone={eta.tone} label={eta.label} />
      </View>
    </Pressable>
  );
}

/** Web ShipmentsPage ("Sevkiyat Takibi"). */
export default function ShipmentsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('shipments.create');
  const [direction, setDirection] = useState<Direction | null>(null);
  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [exporting, setExporting] = useState(false);
  const [now] = useState(() => Date.now());
  const list = useShipments();
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  useEffect(() => {
    if (list.hasNextPage && !list.isFetchingNextPage && items.length < LOAD_LIMIT) void list.fetchNextPage();
  }, [items.length, list]);

  const kpis = shipmentKpis(items);
  const carriers = carrierShare(items);
  const visible = filterShipments(items, { status, direction });

  const sections = useMemo(
    () =>
      SHIPMENT_STATUS_ORDER.map((code) => ({
        title: SHIPMENT_STATUS_LABELS[code] ?? code,
        data: visible.filter((row) => statusCodeOf(row) === code),
      })).filter((section) => section.data.length > 0),
    [visible],
  );

  const runExport = async () => {
    setExporting(true);
    try {
      await exportService.shipments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Excel dosyası indirilemedi.');
    } finally {
      setExporting(false);
    }
  };

  const network = (
    <View className="mt-3 gap-2 rounded-overlay border border-border bg-card p-3.5">
      <Text accessibilityRole="header" className="font-display-semibold text-[16px] text-foreground">Lojistik Ağı</Text>
      <Text className="font-inter text-xs text-muted-foreground">Taşıyıcı ve aktif rota özeti</Text>
      {carriers.map((carrier) => (
        <View key={carrier.name || 'none'} className="gap-1.5 rounded-control bg-muted p-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 font-inter-medium text-[13px] text-foreground" numberOfLines={1}>{carrier.name || 'Taşıyıcı yok'}</Text>
            <Text className="font-inter-semibold text-[13px] text-foreground">{carrier.count}</Text>
          </View>
          <ProgressBar done={carrier.share} total={100} tone="info" />
        </View>
      ))}
      <View className="flex-row gap-2 pt-1">
        {([
          ['car-outline', kpis.inTransit, 'Yolda', 'info'],
          ['boat-outline', kpis.customs, 'Gümrük', 'warning'],
          ['checkmark-done-outline', kpis.delivered, 'Teslim', 'success'],
        ] as const).map(([icon, value, label, tone]) => (
          <View key={label} className="flex-1 items-center gap-1 rounded-control bg-muted py-2">
            <Ionicons name={icon} size={16} color={toneColor(colors, tone)} />
            <Text className="font-inter-semibold text-[13px] text-foreground">{value}</Text>
            <Text className="font-inter text-[10px] uppercase text-muted-foreground">{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Sevkiyat"
        subtitle={list.data ? `${list.data.total} sevkiyat` : 'Tüm sevkiyatlarınızı görüntüleyin ve takip edin.'}
        actions={[
          { icon: 'pricetag-outline', label: 'Etiket Yazdır', onPress: () => router.push('/modal/shipment-label' as Href) },
          { icon: exporting ? 'hourglass-outline' : 'download-outline', label: "Excel'e aktar", onPress: () => void (exporting ? null : runExport()) },
        ]}
      />
      <View className="gap-2 pb-2">
        <StatStrip
          items={[
            { label: 'Toplam Sevkiyat', value: String(list.data?.total ?? kpis.total) },
            { label: 'Yolda', value: String(kpis.inTransit), tone: 'info' },
            { label: 'Gümrükte', value: String(kpis.customs), tone: 'warning' },
            { label: 'Teslim Edilen', value: String(kpis.delivered), tone: 'success' },
          ]}
        />
        <FilterChips
          options={[
            { value: 'in_transit' as const, label: 'Yolda' },
            { value: 'at_customs' as const, label: 'Gümrükte' },
            { value: 'delivered' as const, label: 'Teslim Edildi' },
          ]}
          value={status}
          onChange={setStatus}
        />
        <FilterChips
          allLabel="Tüm Yönler"
          options={[
            { value: 'incoming' as const, label: 'Gelen Sevkiyat' },
            { value: 'outgoing' as const, label: 'Giden Sevkiyat' },
          ]}
          value={direction}
          onChange={setDirection}
        />
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 96 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text accessibilityRole="header" className="pb-1 pt-4 font-inter-semibold text-[13px] text-muted-foreground">
              {section.title} ({section.data.length})
            </Text>
          )}
          renderItem={({ item }) => (
            <ShipmentRow item={item} now={now} onPress={() => router.push(`/(tabs)/modules/shipments/${item.id}` as Href)} />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={
            <EmptyState
              title="Henüz sevkiyat kaydı yok"
              hint="Yeni sevkiyat ekleyerek lojistik takibine başlayın."
              icon="car-outline"
              actionLabel={canCreate ? 'Yeni Sevkiyat' : undefined}
              onAction={canCreate ? () => router.push('/modal/shipment-new' as Href) : undefined}
            />
          }
          ListFooterComponent={
            <>
              {list.isFetchingNextPage ? <Loading /> : null}
              {items.length ? network : null}
            </>
          }
        />
      )}
      {canCreate ? <Fab label="Yeni Sevkiyat" extended onPress={() => router.push('/modal/shipment-new' as Href)} /> : null}
    </SafeAreaView>
  );
}
