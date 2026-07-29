import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatExpectedDate,
  formatPurchaseMoney,
  itemCountFromRow,
  orderNoFromRow,
  PURCHASE_LIST_FILTERS,
  purchaseStatusVisual,
  supplierIconName,
  supplierNameFromRow,
  type PurchaseListFilter,
} from '@/src/ui/purchase/purchaseOrderHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export function PurchaseOrdersTopBar({
  onBack,
  onFilter,
  onSearch,
}: {
  onBack: () => void;
  onFilter?: () => void;
  onSearch?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topBar, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.topBarTitle}>Satın Alma</Text>
      <View style={styles.topBarRight}>
        {onFilter ? (
          <Pressable onPress={onFilter} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
            <Ionicons name="filter-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        {onSearch ? (
          <Pressable onPress={onSearch} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
            <Ionicons name="search-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function PurchaseKpiStrip({
  openCount,
  pendingCount,
  closedCount,
}: {
  openCount: number;
  pendingCount: number;
  closedCount: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.kpiScroll}
      contentContainerStyle={styles.kpiRow}
    >
      <View style={[styles.kpiChip, styles.kpiPrimary]}>
        <Text style={styles.kpiPrimaryLabel}>Açık</Text>
        <Text style={styles.kpiPrimaryValue}>{openCount}</Text>
      </View>
      <View style={[styles.kpiChip, styles.kpiPending]}>
        <Text style={styles.kpiPendingLabel}>Bekleyen Onay</Text>
        <Text style={styles.kpiPendingValue}>{pendingCount}</Text>
      </View>
      <View style={[styles.kpiChip, styles.kpiClosed]}>
        <Text style={styles.kpiClosedLabel}>Kapanan</Text>
        <Text style={styles.kpiClosedValue}>{closedCount}</Text>
      </View>
    </ScrollView>
  );
}

export function PurchaseSegmentedFilter({
  value,
  onChange,
}: {
  value: PurchaseListFilter;
  onChange: (v: PurchaseListFilter) => void;
}) {
  return (
    <View style={styles.segmentWrap}>
      {PURCHASE_LIST_FILTERS.map((f) => {
        const active = f === value;
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            style={[styles.segmentBtn, active && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {f}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PurchaseSearchField({
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
        placeholder="PO no, tedarikçi ara..."
        placeholderTextColor={colors.onSurfaceVariant}
        style={styles.searchInput}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

export function PurchaseOrderCard({
  row,
  onPress,
}: {
  row: Record<string, unknown>;
  onPress: () => void;
}) {
  const status = purchaseStatusVisual(row);
  const supplier = supplierNameFromRow(row);
  const icon = supplierIconName(supplier);
  const items = itemCountFromRow(row);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, shadowCard, pressFade(pressed)]}>
      <View style={styles.cardTop}>
        <Text style={styles.orderNo}>{orderNoFromRow(row)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusBadgeText, { color: status.fg }]}>{status.label}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.supplierIcon}>
          <Ionicons name={icon} size={20} color={colors.secondary} />
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.supplierName} numberOfLines={2}>
            {supplier}
          </Text>
          <Text style={styles.itemCount}>{items > 0 ? `${items} kalem` : 'Kalem yok'}</Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.amount}>{formatPurchaseMoney(row)}</Text>
          <Text style={styles.due}>Termin: {formatExpectedDate(row)}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.outlineVariant} style={styles.chevron} />
        </View>
      </View>
    </Pressable>
  );
}

export function PurchaseListFab({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, shadowCard, pressFade(pressed)]}>
      <Ionicons name="add" size={22} color="#fff" />
      <Text style={styles.fabText}>Yeni Satın Alma</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
    backgroundColor: colors.canvas,
  },
  topBarTitle: { ...typography.headlineMd, color: colors.textPrimary, fontFamily: fonts.bold },
  topBarRight: { flexDirection: 'row' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  kpiScroll: { flexGrow: 0, marginHorizontal: -layout.containerMargin },
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.xs,
  },
  kpiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  kpiPrimary: { backgroundColor: colors.primary },
  kpiPending: { backgroundColor: colors.surfaceContainerHighest },
  kpiClosed: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  kpiPrimaryLabel: { ...typography.label, color: '#fff', textTransform: 'uppercase' },
  kpiPrimaryValue: { ...typography.headlineMd, color: '#fff', fontFamily: fonts.bold },
  kpiPendingLabel: { ...typography.label, color: colors.textPrimary, textTransform: 'uppercase' },
  kpiPendingValue: { ...typography.headlineMd, color: colors.textPrimary, fontFamily: fonts.bold },
  kpiClosedLabel: { ...typography.label, color: colors.onSurfaceVariant, textTransform: 'uppercase' },
  kpiClosedValue: { ...typography.headlineMd, color: colors.onSurfaceVariant, fontFamily: fonts.bold },
  segmentWrap: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.card,
    ...shadowCard,
  },
  segmentText: { ...typography.label, color: colors.onSurfaceVariant, fontSize: 11 },
  segmentTextActive: { color: colors.textPrimary, fontFamily: fonts.semibold },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: spacing.md, zIndex: 1 },
  searchInput: {
    height: 44,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingLeft: 40,
    paddingRight: spacing.md,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNo: { ...typography.label, color: colors.outline },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusBadgeText: { ...typography.caption, fontSize: 10, fontFamily: fonts.bold, textTransform: 'uppercase' },
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  supplierIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: { flex: 1, gap: 2 },
  supplierName: { ...typography.headlineMd, color: colors.textPrimary },
  itemCount: { ...typography.bodySm, color: colors.onSurfaceVariant },
  cardRight: { alignItems: 'flex-end', maxWidth: 120 },
  amount: { ...typography.headlineMd, color: colors.onPrimaryContainer, fontFamily: fonts.bold },
  due: { ...typography.caption, color: colors.outline, marginTop: 2 },
  chevron: { marginTop: 4 },
  fab: {
    position: 'absolute',
    right: layout.containerMargin,
    bottom: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  fabText: { ...typography.label, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
});
