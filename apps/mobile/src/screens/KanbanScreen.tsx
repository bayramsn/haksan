import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { getCreateRoute } from '@/src/navigation/createRoutes';
import { getModule } from '@/src/navigation/modules';
import { getModuleConfig, normalizeList } from '@/src/modules/registry';
import { fieldText } from '@/src/modules/registry';
import { Fab } from '@/src/ui/Fab';
import { PageHeader } from '@/src/ui/PageHeader';
import { Screen } from '@/src/ui/Screen';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { cardElevated, pressFade } from '@/src/theme/styles';

type Props = { navKey: string; groupField?: string; embedded?: boolean };

function groupKey(item: Record<string, unknown>, groupField: string): string {
  if (groupField === 'stageCode') {
    const stage = item.stage as Record<string, unknown> | undefined;
    return String(stage?.name ?? stage?.code ?? 'Diğer');
  }
  return fieldText(item, groupField) || 'Diğer';
}

const { width } = Dimensions.get('window');
// Use 85% of screen width for column, but max 320 for tablets
const COL_WIDTH = Math.min(width * 0.85, 320);
const COL_GAP = spacing.md;
const SNAP_INTERVAL = COL_WIDTH + COL_GAP;

export function KanbanScreen({ navKey, groupField = 'stageCode', embedded = false }: Props) {
  const mod = getModule(navKey);
  const config = getModuleConfig(navKey);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!config) return;
    const res = await config.fetchList({ pageSize: 100 });
    setItems(normalizeList(res));
  }, [config]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const columns = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const item of items) {
      const key = groupKey(item, groupField);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [items, groupField]);

  const createRoute = getCreateRoute(navKey);

  if (loading) {
    return embedded ? (
      <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
    ) : (
      <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
    );
  }

  const board = (
    <ScrollView
      horizontal
      style={styles.boardScroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
      contentContainerStyle={[styles.board, !embedded && createRoute && { paddingBottom: 88 }]}
      showsHorizontalScrollIndicator={false}
      snapToInterval={SNAP_INTERVAL}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum={true}
    >
      {columns.map(([stage, cards]) => (
        <View key={stage} style={styles.col}>
          <Text style={styles.colTitle}>{stage}</Text>
          <Text style={styles.colCount}>{cards.length}</Text>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {cards.map((card) => (
              <Pressable
                key={String(card.id)}
                style={({ pressed }) => [styles.card, pressFade(pressed)]}
                onPress={() => card.id && router.push(`/modules/${navKey}/${String(card.id)}`)}
              >
                <Text style={styles.cardTitle}>{fieldText(card, config?.titleField ?? 'title')}</Text>
                <Text style={styles.cardSub}>{groupKey(card, groupField)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );

  if (embedded) {
    return (
      <View style={styles.embedded}>
        {board}
      </View>
    );
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <PageHeader roundedBottom={false}>
        <Text style={styles.headerTitle}>{mod?.label ?? 'Kanban'}</Text>
      </PageHeader>
      {board}
      {createRoute ? <Fab onPress={() => router.push(createRoute as never)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  embedded: { flex: 1 },
  headerTitle: { ...typography.headline, color: '#fff' },
  boardScroll: { flex: 1 },
  board: { padding: layout.screenPadding, gap: COL_GAP, alignItems: 'flex-start' },
  col: {
    width: COL_WIDTH,
    maxHeight: '100%',
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  colTitle: { ...typography.label, fontFamily: fonts.bold, color: colors.primary },
  colCount: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  card: {
    ...cardElevated,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitle: { ...typography.body, fontFamily: fonts.semibold, color: colors.textPrimary },
  cardSub: { ...typography.label, color: colors.textMuted, marginTop: 4 },
});
