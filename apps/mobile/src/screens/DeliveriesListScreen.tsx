import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { companyService, serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { EmptyState } from '@/src/ui/EmptyState';
import { Screen } from '@/src/ui/Screen';
import {
  countDeliveriesByStatus,
  matchesDeliveryFilter,
  matchesDeliverySearch,
  type DeliveryStatusFilter,
} from '@/src/ui/deliveries/deliveryHelpers';
import {
  DeliveriesFab,
  DeliveriesKpiRow,
  DeliveriesSearchField,
  DeliveriesSectionHeader,
  DeliveriesStatusTabs,
  DeliveriesTopBar,
  DeliveryListCard,
} from '@/src/ui/deliveries/DeliveriesListWidgets';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

/** Stitch Teslimat v4 — `dbb9fd3a3dd644aa8259e1e6f09aa03c` */
export function DeliveriesListScreen() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DeliveryStatusFilter>('Tümü');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const [deliveriesRes, companiesRes] = await Promise.all([
        serviceService.deliveries({ pageSize: 200 }),
        companyService.list({ pageSize: 500 }),
      ]);
      const companies = normalizeList(companiesRes);
      const byId = new Map(companies.map((c) => [String(c.id), c]));
      const rows = normalizeList(deliveriesRes).map((row) => {
        const companyId = String(row.companyId ?? '');
        const company = byId.get(companyId);
        return company ? { ...row, company } : row;
      });
      setItems(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(
    () => items.filter((row) => matchesDeliveryFilter(row, filter) && matchesDeliverySearch(row, q)),
    [items, filter, q],
  );

  const pendingCount = useMemo(() => countDeliveriesByStatus(items, 'pending'), [items]);
  const completedCount = useMemo(() => countDeliveriesByStatus(items, 'completed'), [items]);

  const onExport = () => Alert.alert('Excel', 'Teslimat dışa aktarma yakında eklenecek.');

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <DeliveriesTopBar
        onBack={() => router.back()}
        onFilter={() => Alert.alert('Filtre', 'Gelişmiş filtre çekmecesi yakında eklenecek.')}
        onExport={onExport}
      />

      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(item, idx) => String(item.id ?? idx)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <View>
              <DeliveriesKpiRow total={items.length} completed={completedCount} pending={pendingCount} />
              <DeliveriesStatusTabs value={filter} onChange={setFilter} />
              <DeliveriesSearchField value={q} onChangeText={setQ} />
              <DeliveriesSectionHeader onExport={onExport} />
            </View>
          }
          ListEmptyComponent={
            <EmptyState title="Teslimat bulunamadı" subtitle="Filtre veya aramayı değiştirin" />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <DeliveryListCard
              row={item}
              onPress={() => {
                const id = item.id;
                if (id) router.push(`/modules/deliveries/${String(id)}`);
              }}
            />
          )}
        />
      )}

      <DeliveriesFab onPress={() => router.push('/forms/delivery')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxxl },
  error: { color: colors.error, padding: layout.containerMargin, ...typography.bodySm },
  list: { flex: 1, backgroundColor: colors.canvas },
  listContent: {
    paddingHorizontal: layout.containerMargin,
    paddingBottom: 160,
    paddingTop: spacing.xs,
  },
  separator: { height: spacing.sm },
});
