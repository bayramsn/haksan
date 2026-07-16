import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { companyService, serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { EmptyState } from '@/src/ui/EmptyState';
import { Screen } from '@/src/ui/Screen';
import {
  countInstallationsByFilter,
  matchesInstallationFilter,
  type InstallationStatusFilter,
} from '@/src/ui/installations/installationHelpers';
import {
  InstallationListCard,
  InstallationsFab,
  InstallationsKpiStrip,
  InstallationsStatusTabs,
  InstallationsTopBar,
} from '@/src/ui/installations/InstallationsListWidgets';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

/** Stitch Kurulum listesi — `be97fe6edd78452caef41f9d8191139f` */
export function InstallationsListScreen() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InstallationStatusFilter>('Aktif');

  const load = useCallback(async () => {
    try {
      const [installationsRes, companiesRes] = await Promise.all([
        serviceService.installations({ pageSize: 200 }),
        companyService.list({ pageSize: 500 }),
      ]);
      const companies = normalizeList(companiesRes);
      const byId = new Map(companies.map((c) => [String(c.id), c]));
      const rows = normalizeList(installationsRes).map((row) => {
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
    () => items.filter((row) => matchesInstallationFilter(row, filter)),
    [items, filter],
  );

  const activeCount = useMemo(() => countInstallationsByFilter(items, 'active'), [items]);
  const plannedCount = useMemo(() => countInstallationsByFilter(items, 'planned'), [items]);
  const completedCount = useMemo(() => countInstallationsByFilter(items, 'completed'), [items]);

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <InstallationsTopBar
        onBack={() => router.back()}
        onScan={() => Alert.alert('QR Tara', 'Kurulum QR tarama yakında eklenecek.')}
        onFilter={() => Alert.alert('Filtreler', 'Gelişmiş filtre çekmecesi yakında eklenecek.')}
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
              <InstallationsKpiStrip
                active={activeCount}
                planned={plannedCount}
                completed={completedCount}
              />
              <InstallationsStatusTabs value={filter} onChange={setFilter} />
            </View>
          }
          ListEmptyComponent={
            <EmptyState title="Kurulum bulunamadı" subtitle="Filtreyi değiştirmeyi deneyin" />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <InstallationListCard
              row={item}
              onPress={() => {
                const id = item.id;
                if (id) router.push(`/modules/installations/${String(id)}`);
              }}
            />
          )}
        />
      )}

      <InstallationsFab onPress={() => router.push('/forms/installation')} />
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
