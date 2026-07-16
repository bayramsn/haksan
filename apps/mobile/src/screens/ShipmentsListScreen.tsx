import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { EmptyState } from '@/src/ui/EmptyState';
import { Screen } from '@/src/ui/Screen';
import {
  countAtCustoms,
  countDelivered,
  countInTransit,
  countTotal,
  matchesShipmentFilter,
  matchesShipmentSearch,
  type ShipmentListFilter,
} from '@/src/ui/shipments/shipmentHelpers';
import {
  ShipmentCard,
  ShipmentKpiStrip,
  ShipmentListFab,
  ShipmentSearchField,
  ShipmentSegmentedFilter,
  ShipmentsTopBar,
} from '@/src/ui/shipments/ShipmentsListWidgets';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

/** Stitch Sevkiyat v2 — `c6314a6177fb4bf89f53bf83384513e9` */
export function ShipmentsListScreen() {
  const [allItems, setAllItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ShipmentListFilter>('Tümü');
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await serviceService.shipments({
        pageSize: 100,
        search: q.trim() || undefined,
      });
      setAllItems(normalizeList(res));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, searchOpen ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, searchOpen]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(
    () =>
      allItems.filter(
        (row) => matchesShipmentFilter(row, filter) && matchesShipmentSearch(row, q),
      ),
    [allItems, filter, q],
  );

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <ShipmentsTopBar
        onBack={() => router.back()}
        onFilter={() => Alert.alert('Filtre', 'Gelişmiş filtreler yakında eklenecek.')}
        onSearch={() => setSearchOpen((v) => !v)}
      />

      {loading && allItems.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(item, idx) => String(item.id ?? item.trackingNo ?? idx)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <ShipmentKpiStrip
                total={countTotal(allItems)}
                inTransit={countInTransit(allItems)}
                atCustoms={countAtCustoms(allItems)}
                delivered={countDelivered(allItems)}
              />
              <ShipmentSegmentedFilter value={filter} onChange={setFilter} />
              {searchOpen ? <ShipmentSearchField value={q} onChangeText={setQ} /> : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState title="Sevkiyat bulunamadı" subtitle="Filtre veya aramayı değiştirin" />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <ShipmentCard
              row={item}
              onPress={() => router.push(`/modules/shipments/${String(item.id)}`)}
            />
          )}
        />
      )}

      <ShipmentListFab
        onPress={() =>
          Alert.alert('Yeni Sevkiyat', 'Sevkiyat oluşturma formu bir sonraki adımda eklenecek.')
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxxl },
  error: { color: colors.error, padding: layout.containerMargin, ...typography.bodySm },
  list: { flex: 1, backgroundColor: colors.canvas },
  listContent: { paddingHorizontal: layout.containerMargin, paddingBottom: 100 },
  listHeader: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  separator: { height: spacing.sm },
});
