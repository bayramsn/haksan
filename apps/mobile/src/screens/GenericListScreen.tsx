import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getCreateRoute } from '@/src/navigation/createRoutes';
import { getModule } from '@/src/navigation/modules';
import { fieldText, getModuleConfig, normalizeList } from '@/src/modules/registry';
import { EmptyState } from '@/src/ui/EmptyState';
import { Fab } from '@/src/ui/Fab';
import { ListPageLayout } from '@/src/ui/ListPageLayout';
import { ListRow } from '@/src/ui/ListRow';
import { SearchBar } from '@/src/ui/SearchBar';
import { FAB_LIST_PADDING } from '@/src/ui/Screen';
import { getStatusMeta } from '@/src/ui/statusTone';
import { colors, fonts, layout, radius, spacing } from '@/src/theme/tokens';

type Props = { navKey: string };

const ALL = '__all__';

/** Stitch liste ekranları — Firmalar #03, Teklifler #17 vb. */
export function GenericListScreen({ navKey }: Props) {
  const mod = getModule(navKey);
  const config = getModuleConfig(navKey);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  const load = useCallback(async () => {
    if (!config) return;
    try {
      const params: Record<string, string | number | undefined> = {};
      if (config.searchParam && q.trim()) params[config.searchParam] = q.trim();
      const res = await config.fetchList(params);
      setItems(normalizeList(res));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    }
  }, [config, q]);

  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, config?.searchParam ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, config?.searchParam]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const statusField = config?.statusField;

  /** Yüklü kayıtlardan statü sözlüğü + sayıları — filtre çipleri için. */
  const statusGroups = useMemo(() => {
    if (!statusField) return [];
    const map = new Map<string, number>();
    for (const it of items) {
      const label = getStatusMeta(it, statusField)?.label ?? '—';
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return [...map.entries()].map(([label, count]) => ({ label, count }));
  }, [items, statusField]);

  const data = useMemo(() => {
    if (statusFilter === ALL || !statusField) return items;
    return items.filter((it) => (getStatusMeta(it, statusField)?.label ?? '—') === statusFilter);
  }, [items, statusFilter, statusField]);

  const createRoute = getCreateRoute(navKey);
  const showChips = statusGroups.length > 1;

  const toolbar =
    config?.searchParam || showChips ? (
      <View style={styles.toolbarStack}>
        {config?.searchParam ? (
          <SearchBar value={q} onChangeText={setQ} placeholder={`${mod?.label ?? 'Kayıt'} ara…`} />
        ) : null}
        {showChips ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <FilterChip label="Tümü" count={items.length} active={statusFilter === ALL} onPress={() => setStatusFilter(ALL)} />
            {statusGroups.map((g) => (
              <FilterChip
                key={g.label}
                label={g.label}
                count={g.count}
                active={statusFilter === g.label}
                onPress={() => setStatusFilter(g.label)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
    ) : undefined;

  if (!config) {
    return (
      <ListPageLayout title="Modül">
        <EmptyState title="Modül bulunamadı" subtitle={navKey} />
      </ListPageLayout>
    );
  }

  return (
    <ListPageLayout
      title={mod?.label ?? 'Liste'}
      subtitle={loading ? undefined : `${items.length} kayıt`}
      toolbar={toolbar}
      fabPadding={!!createRoute}
    >
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          style={styles.list}
          data={data}
          keyExtractor={(item, idx) => String(item.id ?? idx)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={[styles.listContent, createRoute && { paddingBottom: FAB_LIST_PADDING }]}
          ListEmptyComponent={<EmptyState title="Kayıt yok" subtitle="Filtreleri değiştirmeyi deneyin" />}
          renderItem={({ item }) => {
            const status = statusField ? getStatusMeta(item, statusField) : undefined;
            const date = config.dateField ? formatListDate(fieldText(item, config.dateField)) : undefined;
            const value = config.amountField
              ? formatMoney(fieldText(item, config.amountField), config.currencyField ? fieldText(item, config.currencyField) : '')
              : undefined;
            return (
              <ListRow
                title={fieldText(item, config.titleField) || '—'}
                subtitle={fieldText(item, config.subtitleField)}
                badge={fieldText(item, config.badgeField)}
                icon={config.icon as React.ComponentProps<typeof ListRow>['icon']}
                statusLabel={status?.label}
                statusTone={status?.tone}
                meta={date}
                value={value}
                onPress={() => {
                  const id = item.id;
                  if (id) router.push(`/modules/${navKey}/${String(id)}`);
                }}
              />
            );
          }}
        />
      )}
      {createRoute ? <Fab onPress={() => router.push(createRoute as never)} /> : null}
    </ListPageLayout>
  );
}

function FilterChip({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.chipCount, active && styles.chipCountActive]}>{count}</Text>
    </Pressable>
  );
}

/** ISO tarih → "5 Haz 2026" (tr-TR). Geçersizse undefined. */
function formatListDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function currencySymbol(code: string): string {
  if (code === 'TRY' || code === 'TL') return '₺';
  if (code === 'USD') return '$';
  if (code === 'EUR') return '€';
  return code ? `${code} ` : '';
}

/** Tutar + para birimi → "€12.500". Sıfır/boş ise undefined (rozet kalabalığı olmasın). */
function formatMoney(raw?: string, code?: string): string | undefined {
  const n = Number(raw);
  if (!raw || Number.isNaN(n) || n === 0) return undefined;
  return `${currencySymbol((code ?? '').toUpperCase())}${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxl },
  error: { color: colors.accentRed, padding: layout.screenPadding },
  list: { flex: 1 },
  listContent: { padding: layout.screenPadding, paddingTop: spacing.sm },
  toolbarStack: { gap: spacing.sm },
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerHighest,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: fonts.medium, letterSpacing: 0.24, color: colors.onSurfaceVariant },
  chipTextActive: { color: '#fff' },
  chipCount: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    minWidth: 18,
    textAlign: 'center',
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  chipCountActive: { color: colors.primary, backgroundColor: 'rgba(255,255,255,0.92)' },
});
