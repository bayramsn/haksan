import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  carrierFromRow,
  companyNameFromRow,
  formatShipmentEta,
  routeLabelFromRow,
  SHIPMENT_LIST_FILTERS,
  shipmentStatusVisual,
  trackingOrShipmentNoFromRow,
  type ShipmentListFilter,
} from '@/src/ui/shipments/shipmentHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

/** Stitch Sevkiyat v2 — `c6314a61` */
export function ShipmentsTopBar({
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
      <Text style={styles.topBarTitle}>Sevkiyat</Text>
      <View style={styles.topBarRight}>
        {onSearch ? (
          <Pressable onPress={onSearch} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
            <Ionicons name="search-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        {onFilter ? (
          <Pressable onPress={onFilter} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
            <Ionicons name="options-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function ShipmentKpiStrip({
  total,
  inTransit,
  atCustoms,
  delivered,
}: {
  total: number;
  inTransit: number;
  atCustoms: number;
  delivered: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.kpiScroll}
      contentContainerStyle={styles.kpiRow}
    >
      <View style={[styles.kpiChip, styles.kpiTotal]}>
        <Ionicons name="cube-outline" size={16} color="#fff" />
        <View>
          <Text style={styles.kpiTotalLabel}>Toplam</Text>
          <Text style={styles.kpiTotalValue}>{total}</Text>
        </View>
      </View>
      <View style={[styles.kpiChip, styles.kpiTransit]}>
        <Ionicons name="airplane-outline" size={16} color={colors.primary} />
        <View>
          <Text style={styles.kpiTransitLabel}>Yolda</Text>
          <Text style={styles.kpiTransitValue}>{inTransit}</Text>
        </View>
      </View>
      <View style={[styles.kpiChip, styles.kpiCustoms]}>
        <Ionicons name="shield-checkmark-outline" size={16} color="#b45309" />
        <View>
          <Text style={styles.kpiCustomsLabel}>Gümrükte</Text>
          <Text style={styles.kpiCustomsValue}>{atCustoms}</Text>
        </View>
      </View>
      <View style={[styles.kpiChip, styles.kpiDelivered]}>
        <Ionicons name="checkmark-circle-outline" size={16} color="#166534" />
        <View>
          <Text style={styles.kpiDeliveredLabel}>Teslim</Text>
          <Text style={styles.kpiDeliveredValue}>{delivered}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

export function ShipmentSegmentedFilter({
  value,
  onChange,
}: {
  value: ShipmentListFilter;
  onChange: (v: ShipmentListFilter) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentScroll}>
      {SHIPMENT_LIST_FILTERS.map((f) => {
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
    </ScrollView>
  );
}

export function ShipmentSearchField({
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
        placeholder="Takip no, müşteri, rota ara..."
        placeholderTextColor={colors.onSurfaceVariant}
        style={styles.searchInput}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

export function ShipmentCard({
  row,
  onPress,
}: {
  row: Record<string, unknown>;
  onPress: () => void;
}) {
  const status = shipmentStatusVisual(row);
  const tracking = trackingOrShipmentNoFromRow(row);
  const carrier = carrierFromRow(row);
  const company = companyNameFromRow(row);
  const route = routeLabelFromRow(row);
  const eta = formatShipmentEta(row);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, shadowCard, pressFade(pressed)]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTopLeft}>
          <View style={styles.truckIcon}>
            <Ionicons name="airplane" size={16} color={colors.primary} />
          </View>
          <View style={styles.cardIds}>
            <Text style={styles.trackingNo}>{tracking}</Text>
            <Text style={styles.carrierMeta}>{carrier}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusBadgeText, { color: status.fg }]}>{status.label}</Text>
        </View>
      </View>
      <Text style={styles.companyName} numberOfLines={2}>
        {company}
      </Text>
      <View style={styles.cardFooter}>
        <View style={styles.routeRow}>
          <Ionicons name="location-outline" size={14} color={colors.onSurfaceVariant} />
          <Text style={styles.routeText} numberOfLines={1}>
            {route}
          </Text>
        </View>
        <Text style={styles.eta}>ETA {eta}</Text>
      </View>
    </Pressable>
  );
}

export function ShipmentListFab({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, shadowCard, pressFade(pressed)]}>
      <Ionicons name="add" size={22} color="#fff" />
      <Text style={styles.fabText}>Yeni Sevkiyat</Text>
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
    gap: spacing.sm,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    minWidth: 100,
  },
  kpiTotal: { backgroundColor: colors.primary },
  kpiTransit: { backgroundColor: '#d0e1fb' },
  kpiCustoms: { backgroundColor: '#fef3c7' },
  kpiDelivered: { backgroundColor: '#dcfce7' },
  kpiTotalLabel: { ...typography.label, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' },
  kpiTotalValue: { ...typography.headlineMd, color: '#fff', fontFamily: fonts.bold },
  kpiTransitLabel: { ...typography.label, color: colors.primary, textTransform: 'uppercase' },
  kpiTransitValue: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  kpiCustomsLabel: { ...typography.label, color: '#b45309', textTransform: 'uppercase' },
  kpiCustomsValue: { ...typography.headlineMd, color: '#b45309', fontFamily: fonts.bold },
  kpiDeliveredLabel: { ...typography.label, color: '#166534', textTransform: 'uppercase' },
  kpiDeliveredValue: { ...typography.headlineMd, color: '#166534', fontFamily: fonts.bold },
  segmentScroll: { gap: 4, paddingVertical: 2 },
  segmentBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
  },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { ...typography.label, color: colors.onSurfaceVariant, fontSize: 11 },
  segmentTextActive: { color: '#fff', fontFamily: fonts.semibold },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  searchIcon: { marginRight: spacing.xs },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, paddingVertical: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  truckIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIds: { flex: 1 },
  trackingNo: { ...typography.body, fontFamily: fonts.semibold, color: colors.textPrimary },
  carrierMeta: { ...typography.label, color: colors.onSurfaceVariant, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  statusBadgeText: { ...typography.caption, fontFamily: fonts.semibold },
  companyName: { ...typography.body, color: colors.textPrimary, fontFamily: fonts.medium },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  routeText: { ...typography.bodySm, color: colors.onSurfaceVariant, flex: 1 },
  eta: { ...typography.label, color: colors.onSurfaceVariant },
  fab: {
    position: 'absolute',
    left: layout.containerMargin,
    right: layout.containerMargin,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    minHeight: 48,
    borderRadius: radius.md,
  },
  fabText: { ...typography.label, color: '#fff', fontFamily: fonts.semibold },
});
