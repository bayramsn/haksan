import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { tradeFairService, type TradeFairContactDTO, type TradeFairSummary } from '@/src/api/services';
import { useAuth } from '@/src/auth/AuthProvider';
import { ApiLoadError } from '@/src/ui/ApiLoadError';
import { EmptyState } from '@/src/ui/EmptyState';
import { Fab } from '@/src/ui/Fab';
import { ListPageLayout } from '@/src/ui/ListPageLayout';
import { ListRow } from '@/src/ui/ListRow';
import { OptionPicker } from '@/src/ui/OptionPicker';
import { SearchBar } from '@/src/ui/SearchBar';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';

const PAGE_SIZE = 30;

/**
 * Listede görünen kayıtlar; form bunu id ile okur. Kaydı rota parametresine JSON
 * olarak koymak expo-router'ın çift URL çözmesiyle nottaki "%15" gibi metni
 * bozuyordu. Ayrı bir GET /trade-fairs/:id ucu yok, liste zaten kaydı taşıyor.
 */
export const tradeFairCache = new Map<string, TradeFairContactDTO>();
/** Yeni kayıt formunun ön seçili fuarı (aynı gerekçeyle parametre yerine). */
export const tradeFairDraft = { fairName: '' };

/** Fuar görüşmeleri — web "Fuar" sayfasının mobil karşılığı. Bütün roller görür. */
export function TradeFairsScreen() {
  const { user, hasRole } = useAuth();
  const canCreate =
    hasRole('admin') || hasRole('super_admin') || (user?.permissions ?? []).includes('trade_fairs.create');

  const [fair, setFair] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<TradeFairContactDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<TradeFairSummary>({ fairs: [], byUser: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (nextPage: number) => {
      // Geç dönen eski arama yanıtı yenisinin üstüne yazmasın.
      const mine = ++seq.current;
      try {
        const [list, sum] = await Promise.all([
          tradeFairService.list({ fairName: fair ?? undefined, q: q.trim() || undefined, page: nextPage, pageSize: PAGE_SIZE }),
          nextPage === 1 ? tradeFairService.summary(fair ?? undefined) : Promise.resolve(null),
        ]);
        if (mine !== seq.current) return;
        for (const row of list.data) tradeFairCache.set(row.id, row);
        setRows((current) => (nextPage === 1 ? list.data : [...current, ...list.data]));
        setTotal(list.meta.total);
        setPage(nextPage);
        if (sum) setSummary(sum);
        setError(null);
      } catch (e) {
        if (mine !== seq.current) return;
        setError(e instanceof Error ? e.message : 'Fuar kayıtları yüklenemedi');
        // Başarısız yeni aramada eski sonuçlar yeni aramanınmış gibi kalmasın.
        if (nextPage === 1) setRows([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [fair, q],
  );

  // Formdan dönünce liste tazelensin; arama yazılırken kısa gecikmeyle.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => void load(1), 250);
      return () => clearTimeout(t);
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load(1);
    setRefreshing(false);
  };

  const people = summary.byUser.reduce((sum, u) => sum + u.people, 0);
  const meetings = summary.byUser.reduce((sum, u) => sum + u.meetings, 0);

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.kpis}>
        <Kpi label="Fuar" value={summary.fairs.length} />
        <Kpi label="Görüşme" value={meetings} />
        <Kpi label="Kişi" value={people} />
      </View>
      {summary.byUser.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kim kaç kişiyle görüştü</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {summary.byUser.map((u) => (
              <View key={u.userId ?? 'none'} style={styles.chip}>
                <Text style={styles.chipName} numberOfLines={1}>{u.fullName ?? 'Belirtilmemiş'}</Text>
                <Text style={styles.chipMeta}>{u.meetings} firma · {u.people} kişi</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  return (
    <ListPageLayout
      title="Fuar"
      subtitle="Fuarda görüşülen firmalar"
      toolbar={
        <View style={styles.toolbar}>
          <OptionPicker
            label="Fuar"
            display={fair ?? 'Tüm fuarlar'}
            options={summary.fairs.map((f) => ({ value: f.name, label: f.name, hint: `${f.total} görüşme` }))}
            clearLabel="Tüm fuarlar"
            onSelect={(option) => {
              const next = option?.value ?? null;
              if (next === fair) return;
              setLoading(true);
              setFair(next);
            }}
          />
          <SearchBar
            value={q}
            onChangeText={(text) => {
              // Yeni arama yüklenene kadar sonsuz kaydırma eski sonuca sayfa eklemesin.
              setLoading(true);
              setQ(text);
            }}
            placeholder="Firma, yetkili, telefon, ürün ara…"
          />
        </View>
      }
    >
      {error && rows.length === 0 ? (
        <ApiLoadError message={error} onRetry={() => void load(1)} />
      ) : loading && rows.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!loading && rows.length < total) {
              setLoading(true);
              void load(page + 1);
            }
          }}
          renderItem={({ item }) => (
            <ListRow
              title={item.companyName}
              subtitle={[item.contactName, item.products[0]?.name || item.productCategory, item.companyId ? 'Firmalar\'da' : null].filter(Boolean).join(' · ')}
              icon="storefront-outline"
              badge={fair ? undefined : item.fairName}
              meta={[item.metByName, item.divisionName, `${item.visitorCount} kişi`, [item.district, item.province].filter(Boolean).join(' / ')]
                .filter(Boolean)
                .join(' · ')}
              metaIcon="people-outline"
              onPress={() => router.push({ pathname: '/forms/trade-fair', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="storefront-outline"
              title={q || fair ? 'Eşleşen görüşme yok' : 'Henüz fuar görüşmesi yok'}
              subtitle={canCreate ? 'Standa gelen firmayı + ile kaydedin.' : undefined}
            />
          }
          ListFooterComponent={
            rows.length > 0 ? (
              <Text style={styles.footer}>
                {rows.length} / {total} kayıt
              </Text>
            ) : null
          }
        />
      )}
      {canCreate ? (
        <Fab
          label="Yeni görüşme"
          onPress={() => {
            tradeFairDraft.fairName = fair ?? '';
            router.push('/forms/trade-fair');
          }}
        />
      ) : null}
    </ListPageLayout>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { gap: spacing.sm },
  loader: { marginTop: spacing.xxl },
  listContent: { padding: layout.screenPadding, gap: spacing.sm, paddingBottom: 120 },
  headerBlock: { gap: spacing.md, marginBottom: spacing.sm },
  kpis: { flexDirection: 'row', gap: spacing.sm },
  kpi: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  kpiValue: { ...typography.titleLg, color: colors.primary },
  kpiLabel: { ...typography.label, color: colors.textMuted },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { ...typography.caption, color: colors.accentBlue, textTransform: 'uppercase' },
  chips: { gap: spacing.sm },
  chip: { backgroundColor: colors.inputBg, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxWidth: 200 },
  chipName: { ...typography.bodySm, fontFamily: fonts.semibold, color: colors.textPrimary },
  chipMeta: { ...typography.label, color: colors.textMuted },
  footer: { ...typography.label, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
});
