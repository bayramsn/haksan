import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { inventoryService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { aggregateStockRows } from '@/src/ui/stock/stockHelpers';
import {
  buildWarehouseBreakdown,
  StockDetailFooter,
  StockDetailTopBar,
  StockKpiStrip,
  StockLevelProgress,
  StockMovementSection,
  StockProductHeader,
  StockSupplyInfo,
  StockWarehouseList,
  type StockMovementFilter,
} from '@/src/ui/stock/StockDetailWidgets';
import { Screen } from '@/src/ui/Screen';
import { colors, layout, spacing } from '@/src/theme/tokens';

type Props = { id: string };

/** Stitch Stok Detay — `18537761` */
export function StockDetailScreen({ id }: Props) {
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [siblings, setSiblings] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movementFilter, setMovementFilter] = useState<StockMovementFilter>('Tümü');

  const load = useCallback(async () => {
    try {
      const [one, listRes] = await Promise.all([
        inventoryService.get(id),
        inventoryService.list({ pageSize: 200 }),
      ]);
      const all = normalizeList(listRes);
      const productModelId = String(
        (one as Record<string, unknown>).productModelId ??
          ((one as Record<string, unknown>).product as Record<string, unknown> | undefined)?.id ??
          '',
      );
      const related = productModelId
        ? all.filter((row) => String(row.productModelId ?? '') === productModelId)
        : [one as Record<string, unknown>];
      setItem(one as Record<string, unknown>);
      setSiblings(related);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detay yüklenemedi');
    }
  }, [id]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const summary = useMemo(() => {
    const rows = aggregateStockRows(siblings);
    return rows[0];
  }, [siblings]);

  const product = item?.product as Record<string, unknown> | undefined;
  const category = item?.category as Record<string, unknown> | undefined;
  const brand = item?.brand as Record<string, unknown> | undefined;

  const title = String(product?.fullName ?? product?.modelCode ?? summary?.title ?? 'Stok Kalemi');
  const sku = String(product?.modelCode ?? summary?.sku ?? '—');
  const categoryLabel = String(category?.name ?? summary?.categoryName ?? '—');
  const warehouses = buildWarehouseBreakdown(siblings);

  if (loading) {
    return (
      <Screen padded={false}>
        <StockDetailTopBar onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !summary) {
    return (
      <Screen padded={false}>
        <StockDetailTopBar onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={{ color: colors.error }}>{error ?? 'Kayıt bulunamadı'}</Text>
        </View>
      </Screen>
    );
  }

  const net = Math.max(0, summary.available - summary.reserved);

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <StockDetailTopBar
        onBack={() => router.back()}
        onMore={() => Alert.alert('Menü', 'Ek işlemler yakında eklenecek.')}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <StockProductHeader
          title={title}
          sku={sku}
          categoryLabel={categoryLabel}
          unitLabel="Adet"
          level={summary.level}
        />
        <StockKpiStrip available={summary.available} reserved={summary.reserved} net={net} />
        <StockLevelProgress minQty={summary.minQty} progress={summary.progress} />
        <StockWarehouseList rows={warehouses} />
        <StockMovementSection
          filter={movementFilter}
          onFilterChange={setMovementFilter}
          empty
        />
        <StockSupplyInfo supplier={brand?.name ? String(brand.name) : undefined} />
      </ScrollView>

      <StockDetailFooter
        onCount={() => Alert.alert('Sayım', 'Sayım başlatma yakında eklenecek.')}
        onMovement={() => Alert.alert('Hareket', 'Stok hareketi yakında eklenecek.')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
    paddingBottom: 120,
    gap: spacing.lg,
    backgroundColor: colors.canvas,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
