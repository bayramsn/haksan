import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCan } from '@/src/auth/AuthProvider';
import { useAllPurchaseOrders } from '@/src/api/purchase.hooks';
import { exportService } from '@/src/api/exports';
import { formatAmount, formatDate } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { EmptyState, ErrorState, Fab, FilterChips, ListRow, ListSkeleton, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { KpiGrid, KpiTile, Panel, runExport } from '@/src/ui/finance/kit';
import {
  PURCHASE_STATUS_TABS,
  PURCHASE_STEPS,
  etaState,
  filterPurchaseOrders,
  purchaseKpis,
  purchaseStep,
  purchaseTypeLabel,
  supplierInsights,
} from '@/src/ui/finance/purchase-logic';

const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  pending_manager_approval: 'warning',
  sent: 'info',
  approved: 'success',
  in_transit: 'info',
  received: 'success',
  cancelled: 'destructive',
};

const ETA_TONE = { neutral: 'neutral', danger: 'destructive', warning: 'warning', success: 'success' } as const;

export default function PurchaseOrdersScreen() {
  const router = useRouter();
  const canCreate = useCan('purchase_orders.create');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const list = useAllPurchaseOrders();
  const rows = list.data ?? [];

  const kpis = useMemo(() => purchaseKpis(rows), [rows]);
  const insights = useMemo(() => supplierInsights(rows).slice(0, 5), [rows]);
  const filtered = useMemo(() => filterPurchaseOrders(rows, tab, search), [rows, tab, search]);
  const tabCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.status?.code ?? '', (map.get(row.status?.code ?? '') ?? 0) + 1);
    return map;
  }, [rows]);

  async function exportExcel() {
    setExporting(true);
    await runExport(() => exportService.purchaseOrders(search.trim() ? { search: search.trim() } : undefined));
    setExporting(false);
  }

  const header = (
    <View className="gap-3 pb-2">
      <ScreenHeader
        title="Satın Alma"
        subtitle="Satın alma taleplerini ve siparişlerini yönetin."
        actions={[{ icon: exporting ? 'hourglass-outline' : 'download-outline', label: 'Excel', onPress: () => void exportExcel() }]}
      />
      <KpiGrid>
        {[
          <KpiTile
            key="total"
            icon="cart-outline"
            tone="stage"
            label="Toplam Sipariş"
            value={String(kpis.total)}
            sub={kpis.totals.map((item) => formatAmount(item.amount, item.currencyCode)).join(' · ') || '—'}
            selected={tab === null}
            onPress={() => setTab(null)}
          />,
          <KpiTile key="commercial" icon="cube-outline" tone="success" label="Ticari" value={String(kpis.commercial)} sub="mal/hizmet alımı" />,
          <KpiTile key="admin" icon="receipt-outline" tone="info" label="İdari" value={String(kpis.administrative)} sub="genel gider" />,
          <KpiTile
            key="pending"
            icon="time-outline"
            tone="warning"
            label="Bekleyen"
            value={String(kpis.pending)}
            sub="onay bekliyor"
            selected={tab === 'pending_manager_approval'}
            onPress={() => setTab('pending_manager_approval')}
          />,
        ]}
      </KpiGrid>
      {insights.length ? (
        <Panel title="Tedarikçi İçgörüsü" subtitle="Sipariş hacmi ve açık teslim yükü">
          {insights.map((item) => (
            <View key={item.name} className="flex-row items-center justify-between gap-3 border-b border-border py-2">
              <Text className="flex-1 font-inter-medium text-sm text-foreground" numberOfLines={1}>
                {item.name}
              </Text>
              <Text className="font-inter text-xs text-muted-foreground">
                {item.count} sipariş · {item.pending} açık
              </Text>
            </View>
          ))}
        </Panel>
      ) : null}
      <SearchBar value={search} onChange={setSearch} placeholder="Sipariş no, tedarikçi veya fatura" />
      <FilterChips
        options={PURCHASE_STATUS_TABS.map((item) => ({ value: item.value, label: item.label, count: tabCounts.get(item.value) ?? 0 }))}
        value={tab}
        onChange={setTab}
      />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      {list.isPending ? (
        <>
          <ScreenHeader title="Satın Alma" />
          <ListSkeleton />
        </>
      ) : list.error ? (
        <>
          <ScreenHeader title="Satın Alma" />
          <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
        </>
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: 96 }}
          renderItem={({ item }) => {
            const code = item.status?.code ?? '';
            const tone = STATUS_TONE[code] ?? 'neutral';
            const eta = etaState(item.expectedDate);
            const step = purchaseStep(code);
            return (
              <View style={{ paddingHorizontal: SCREEN_PAD }}>
                <ListRow
                  title={item.orderNo}
                  lines={[
                    item.supplier?.shortName ?? item.supplier?.legalTitle ?? 'Firma seçilmemiş',
                    `${purchaseTypeLabel(item.purchaseType)} · ${formatDate(item.orderDate)}`,
                    code === 'cancelled' ? null : `Adım ${step + 1}/5 · ${PURCHASE_STEPS[step]}`,
                  ]}
                  icon="cart-outline"
                  iconTone={tone}
                  chips={[
                    ...(item.status ? [{ label: item.status.name, tone }] : []),
                    ...(code === 'received' || code === 'cancelled' ? [] : [{ label: eta.label, tone: ETA_TONE[eta.tone] }]),
                  ]}
                  trailing={formatAmount(item.grandTotal, item.currency?.code ?? 'USD')}
                  trailingTone="neutral"
                  onPress={() => router.push(`/(tabs)/modules/purchase-orders/${item.id}` as Href)}
                />
              </View>
            );
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Satın alma siparişi bulunamadı" hint="Aramayı veya durumu değiştirin." />}
        />
      )}
      {canCreate ? <Fab label="Yeni Satın Alma" extended onPress={() => router.push('/modal/purchase-order' as Href)} /> : null}
    </SafeAreaView>
  );
}
