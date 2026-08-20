import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useSegments } from 'expo-router';
import { serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { EmptyState } from '@/src/ui/EmptyState';
import { Screen } from '@/src/ui/Screen';
import {
  assigneeFromRow,
  companyNameFromRow,
  countAssignedTickets,
  countCompletedTickets,
  countOpenTickets,
  countSlaBreaches,
  matchesServiceFilter,
  relativeTimeFromRow,
  ServiceFilterChips,
  ServiceStatsRow,
  ServiceTicketCard,
  ServiceTicketsTopBar,
  statusVisualFromRow,
  ticketNoFromRow,
  type ServiceFilter,
} from '@/src/ui/service/ServiceTicketsListWidgets';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

type Props = {
  isTabRoot?: boolean;
};

/** Stitch Servis Talepleri — `8d84b0d695cc4130acafcd7ab6bd5362` */
export function ServiceTicketsListScreen({ isTabRoot }: Props = {}) {
  const segments: readonly string[] = useSegments();
  const tabRoot = isTabRoot ?? (segments[0] === '(tabs)' && segments[1] === 'service');

  const [allItems, setAllItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ServiceFilter>('Tümü');
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    try {
      const res = await serviceService.tickets({ pageSize: 100, search: q.trim() || undefined });
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

  const items = allItems.filter((row) => matchesServiceFilter(row, filter));

  const onMenu = () => {
    if (tabRoot) router.push('/quick-create');
    else router.back();
  };

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <ServiceTicketsTopBar
        onMenu={onMenu}
        onSearch={() => {
          setSearchOpen((v) => !v);
          if (!searchOpen) setTimeout(() => searchRef.current?.focus(), 100);
        }}
        onAdd={() => router.push('/forms/service-ticket')}
      />

      {loading && allItems.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={(item, idx) => String(item.id ?? item.ticketNo ?? idx)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <ServiceStatsRow
                openCount={countOpenTickets(allItems)}
                assignedCount={countAssignedTickets(allItems)}
                completedCount={countCompletedTickets(allItems)}
                slaBreachCount={countSlaBreaches(allItems)}
              />
              {searchOpen ? (
                <View style={styles.searchWrap}>
                  <TextInput
                    ref={searchRef}
                    value={q}
                    onChangeText={setQ}
                    placeholder="Servis talebi ara..."
                    placeholderTextColor={colors.outlineVariant}
                    style={styles.searchInput}
                    autoCapitalize="none"
                    clearButtonMode="while-editing"
                    returnKeyType="search"
                  />
                </View>
              ) : null}
              <ServiceFilterChips value={filter} onChange={setFilter} />
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              title="Servis talebi bulunamadı"
              subtitle="Filtreyi değiştirmeyi veya yeni talep eklemeyi deneyin"
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const visual = statusVisualFromRow(item);
            const completed = visual.label === 'Tamamlandı';
            return (
              <ServiceTicketCard
                ticketNo={ticketNoFromRow(item)}
                companyName={companyNameFromRow(item)}
                subject={String(item.subject ?? '—')}
                assigneeLabel={completed ? 'Atanmış' : assigneeFromRow(item)}
                timeLabel={relativeTimeFromRow(item)}
                visual={visual}
                onPress={() => item.id && router.push(`/modules/service-requests/${String(item.id)}`)}
              />
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxxl },
  error: { color: colors.accentRed, padding: spacing.lg },
  list: { flex: 1, backgroundColor: '#f7f7f8' },
  listContent: {
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.xxxl,
  },
  listHeader: { gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  searchWrap: { marginTop: -spacing.sm },
  searchInput: {
    height: 44,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  separator: { height: spacing.sm },
});
