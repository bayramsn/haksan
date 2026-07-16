import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  countStockLevel,
  stockLevelLabel,
  STOCK_CATEGORY_FILTERS,
  type AggregatedStockSku,
  type StockCategoryFilter,
  type StockLevel,
} from '@/src/ui/stock/stockHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

const LEVEL_STYLES: Record<StockLevel, { bg: string; fg: string; bar: string; qty: string }> = {
  critical: { bg: '#ffdad6', fg: '#93000a', bar: colors.error, qty: colors.error },
  low: { bg: '#fef3c7', fg: '#92400e', bar: '#eab308', qty: '#ca8a04' },
  ok: { bg: '#dcfce7', fg: '#166534', bar: '#22c55e', qty: colors.textPrimary },
};

export function StockTopBar({
  onBack,
  onScan,
  onFilter,
}: {
  onBack: () => void;
  onScan?: () => void;
  onFilter?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topBar, { paddingTop: insets.top }, shadowCard]}>
      <View style={styles.topBarLeft}>
        <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={styles.topBarTitle}>Stok</Text>
      </View>
      <View style={styles.topBarRight}>
        {onScan ? (
          <Pressable onPress={onScan} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
            <Ionicons name="barcode-outline" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
        {onFilter ? (
          <Pressable onPress={onFilter} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
            <Ionicons name="options-outline" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function StockSummaryStrip({
  totalSku,
  critical,
  low,
}: {
  totalSku: number;
  critical: number;
  low: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.summaryScroll}
      contentContainerStyle={styles.summaryRow}
    >
      <View style={[styles.summaryChip, styles.summaryChipPrimary]}>
        <Text style={styles.summaryChipPrimaryLabel} numberOfLines={1}>
          Tüm SKU
        </Text>
        <View style={styles.summaryCountBadge}>
          <Text style={styles.summaryCountPrimary}>{totalSku.toLocaleString('tr-TR')}</Text>
        </View>
      </View>
      <View style={[styles.summaryChip, styles.summaryChipCritical]}>
        <Text style={styles.summaryChipCriticalLabel} numberOfLines={1}>
          Kritik
        </Text>
        <View style={styles.summaryCountBadgeDark}>
          <Text style={styles.summaryCountLight}>{critical}</Text>
        </View>
      </View>
      <View style={[styles.summaryChip, styles.summaryChipLow]}>
        <Text style={styles.summaryChipLowLabel} numberOfLines={1}>
          Azın
        </Text>
        <View style={styles.summaryCountBadgeDark}>
          <Text style={styles.summaryCountLight}>{low}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

export function StockSearchField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search" size={20} color={colors.outline} style={styles.searchIcon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="SKU, ad, parti no ara..."
        placeholderTextColor={colors.onSurfaceVariant}
        style={styles.searchInput}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

export function StockCategoryTabs({
  value,
  onChange,
}: {
  value: StockCategoryFilter;
  onChange: (v: StockCategoryFilter) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.categoryScroll}
      contentContainerStyle={styles.categoryRow}
    >
      {STOCK_CATEGORY_FILTERS.map((f) => {
        const active = f === value;
        return (
          <Pressable key={f} onPress={() => onChange(f)} style={styles.categoryBtn}>
            <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{f}</Text>
            {active ? <View style={styles.categoryUnderline} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function StockSkuCard({ row, onPress }: { row: AggregatedStockSku; onPress: () => void }) {
  const levelStyle = LEVEL_STYLES[row.level];
  const label = stockLevelLabel(row.level);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, shadowCard, pressFade(pressed)]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {row.title}
        </Text>
        <View style={[styles.levelBadge, { backgroundColor: levelStyle.bg }]}>
          <Text style={[styles.levelBadgeText, { color: levelStyle.fg }]}>{label}</Text>
        </View>
      </View>
      <View style={styles.locationRow}>
        <Ionicons name="location-outline" size={14} color={colors.secondary} />
        <Text style={styles.locationText} numberOfLines={1}>
          {row.location}
        </Text>
      </View>
      <View style={styles.qtyRow}>
        <Text style={styles.qtyLabel}>Stok / Min</Text>
        <Text style={styles.qtyValue}>
          <Text style={{ color: levelStyle.qty, fontFamily: fonts.semibold }}>{row.available}</Text>
          <Text style={styles.qtyMuted}> / {row.minQty}</Text>
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${row.progress}%`, backgroundColor: levelStyle.bar }]} />
      </View>
    </Pressable>
  );
}

export function StockFab({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, shadowCard, pressFade(pressed)]}>
      <Ionicons name="add" size={28} color="#fff" />
    </Pressable>
  );
}

export { countStockLevel };

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
    backgroundColor: colors.canvas,
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topBarTitle: { ...typography.headline, fontSize: 22, color: colors.primary, fontFamily: fonts.bold },
  topBarRight: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  summaryScroll: { flexGrow: 0, marginHorizontal: -layout.containerMargin },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: layout.containerMargin,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  summaryChipPrimary: { backgroundColor: colors.primary },
  summaryChipCritical: { backgroundColor: colors.error },
  summaryChipLow: { backgroundColor: '#ca8a04' },
  summaryChipPrimaryLabel: { ...typography.label, color: '#fff' },
  summaryChipCriticalLabel: { ...typography.label, color: '#fff' },
  summaryChipLowLabel: { ...typography.label, color: '#fff' },
  summaryCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  summaryCountBadgeDark: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  summaryCountPrimary: { ...typography.caption, color: '#fff' },
  summaryCountLight: { ...typography.caption, color: '#fff' },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: spacing.md, zIndex: 1 },
  searchInput: {
    height: 48,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingLeft: 40,
    paddingRight: spacing.md,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  categoryScroll: { flexGrow: 0, marginHorizontal: -layout.containerMargin },
  categoryRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingBottom: spacing.xs,
    paddingHorizontal: layout.containerMargin,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHigh,
  },
  categoryBtn: { paddingBottom: spacing.sm, flexShrink: 0 },
  categoryText: { ...typography.label, color: colors.secondary },
  categoryTextActive: { color: colors.primary, fontFamily: fonts.semibold },
  categoryUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.primary,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHighest,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { flex: 1, ...typography.headlineMd, color: colors.textPrimary },
  levelBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 4 },
  levelBadgeText: { ...typography.caption, fontSize: 10 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  locationText: { flex: 1, ...typography.label, color: colors.secondary },
  qtyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.sm },
  qtyLabel: { ...typography.caption, color: colors.outline },
  qtyValue: { ...typography.bodySm },
  qtyMuted: { color: colors.onSurfaceVariant },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  progressFill: { height: '100%', borderRadius: radius.pill },
  fab: {
    position: 'absolute',
    right: layout.containerMargin,
    bottom: spacing.xxl,
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
