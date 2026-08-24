import { useMemo } from 'react';
import { SectionList, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useShipments } from '@/src/api/operations.hooks';
import type { Shipment } from '@/src/api/endpoints';
import { formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { ListSkeleton, EmptyState, ErrorState, ListRow, Loading, ScreenHeader } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';

type Phase = 'preparing' | 'onroad' | 'delivered';

const PHASES: { key: Phase; title: string; tone: Tone }[] = [
  { key: 'preparing', title: 'Hazırlanıyor', tone: 'warning' },
  { key: 'onroad', title: 'Yolda', tone: 'info' },
  { key: 'delivered', title: 'Teslim Edildi', tone: 'success' },
];

/** Durum lookup'ı boş olabildiği için aşama zaman damgalarından türetilir. */
function phaseOf(shipment: Shipment): Phase {
  if (shipment.arrivedAt) return 'delivered';
  if (shipment.shippedAt) return 'onroad';
  return 'preparing';
}

export default function ShipmentsScreen() {
  const router = useRouter();
  const list = useShipments();
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  // Tasarımdaki üç bölümlü liste: Hazırlanıyor / Yolda / Teslim Edildi.
  const sections = useMemo(
    () =>
      PHASES.map(({ key, title }) => ({
        title,
        phase: key,
        data: items.filter((shipment) => phaseOf(shipment) === key),
      })).filter((section) => section.data.length > 0),
    [items]
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Sevkiyatlar" subtitle="Tüm sevkiyatlarınızı görüntüleyin ve takip edin." />

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text className="pb-1 pt-4 font-inter-semibold text-[13px] text-muted-foreground">
              {section.title} ({section.data.length})
            </Text>
          )}
          renderItem={({ item, section }) => {
            const tone = PHASES.find((p) => p.key === (section as { phase: Phase }).phase)!.tone;
            const route = [item.origin, item.destination].filter(Boolean).join(' → ') || null;
            return (
              <ListRow
                title={item.shipmentNo ?? 'Sevkiyat'}
                lines={[
                  item.company?.shortName ?? item.company?.legalTitle ?? null,
                  route,
                  item.carrierCompany?.legalTitle ?? item.carrier,
                ]}
                icon={item.arrivedAt ? 'checkmark-circle-outline' : 'car-outline'}
                iconTone={tone}
                chip={{ label: item.status?.name ?? section.title, tone }}
                trailing={
                  item.arrivedAt
                    ? formatDate(item.arrivedAt)
                    : item.eta
                      ? `Tahmini ${formatDate(item.eta)}`
                      : undefined
                }
                onPress={() => router.push(`/(tabs)/modules/shipments/${item.id}`)}
              />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Sevkiyat kaydı yok" />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
