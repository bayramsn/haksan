import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DELIVERY_STATUS_FILTERS,
  deliveryCardMeta,
  deliveryCompanyName,
  deliverySignedBy,
  deliveryStatusBadgeStyle,
  deliveryStatusLabel,
  formatDeliveryDate,
  type DeliveryStatusFilter,
} from '@/src/ui/deliveries/deliveryHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

/** Stitch Teslimat v4 — `dbb9fd3a3dd644aa8259e1e6f09aa03c` */
export function DeliveriesTopBar({
  onBack,
  onFilter,
  onExport,
}: {
  onBack: () => void;
  onFilter?: () => void;
  onExport?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topBar, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.topBarTitle}>Teslimat</Text>
      <View style={styles.topBarRight}>
        {onFilter ? (
          <Pressable onPress={onFilter} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
            <Ionicons name="filter-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        {onExport ? (
          <Pressable onPress={onExport} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
            <Ionicons name="download-outline" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function DeliveriesKpiRow({
  total,
  completed,
  pending,
}: {
  total: number;
  completed: number;
  pending: number;
}) {
  return (
    <View style={styles.kpiRow}>
      <View style={[styles.kpiCard, shadowCard]}>
        <Ionicons name="clipboard-outline" size={18} color={colors.primary} />
        <Text style={styles.kpiLabel}>Toplam</Text>
        <View style={styles.kpiValueRow}>
          <Text style={styles.kpiValue}>{total}</Text>
          <Text style={styles.kpiSub}>kayıt</Text>
        </View>
      </View>
      <View style={[styles.kpiCard, shadowCard]}>
        <Ionicons name="checkmark-circle-outline" size={18} color="#166534" />
        <Text style={styles.kpiLabel}>Tamamlandı</Text>
        <View style={styles.kpiValueRow}>
          <Text style={styles.kpiValue}>{completed}</Text>
          <Text style={styles.kpiSub}>imzalı</Text>
        </View>
      </View>
      <View style={[styles.kpiCard, shadowCard]}>
        <Ionicons name="time-outline" size={18} color="#b45309" />
        <Text style={styles.kpiLabel}>Bekleyen</Text>
        <View style={styles.kpiValueRow}>
          <Text style={styles.kpiValue}>{pending}</Text>
          <Text style={styles.kpiSub}>imza bekliyor</Text>
        </View>
      </View>
    </View>
  );
}

export function DeliveriesStatusTabs({
  value,
  onChange,
}: {
  value: DeliveryStatusFilter;
  onChange: (v: DeliveryStatusFilter) => void;
}) {
  return (
    <View style={styles.segmented}>
      {DELIVERY_STATUS_FILTERS.map((tab) => {
        const active = tab === value;
        return (
          <Pressable
            key={tab}
            onPress={() => onChange(tab)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              active && tab === 'Tümü' && styles.segmentActiveNavy,
              pressFade(pressed),
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                active && styles.segmentTextActive,
                active && tab === 'Tümü' && styles.segmentTextOnNavy,
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DeliveriesSearchField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search-outline" size={18} color={colors.outline} style={styles.searchIcon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Müşteri veya form no ara..."
        placeholderTextColor={colors.outline}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}

export function DeliveriesSectionHeader({ onExport }: { onExport?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>Teslimat Kayıtları</Text>
      {onExport ? (
        <Pressable onPress={onExport} hitSlop={8} style={({ pressed }) => pressFade(pressed)}>
          <View style={styles.excelLink}>
            <Ionicons name="download-outline" size={14} color={colors.primary} />
            <Text style={styles.excelText}>Excel</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

export function DeliveryListCard({
  row,
  onPress,
}: {
  row: Record<string, unknown>;
  onPress: () => void;
}) {
  const badge = deliveryStatusBadgeStyle(row);
  const completed = deliveryStatusLabel(row) === 'Tamamlandı';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, shadowCard, pressFade(pressed)]}
    >
      <View style={[styles.accentBar, { backgroundColor: badge.accent }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={styles.cardLead}>
            <View style={styles.cardIcon}>
              <Ionicons name="business-outline" size={18} color={colors.onSurfaceVariant} />
            </View>
            <View style={styles.cardTitles}>
              <Text style={styles.cardCompany} numberOfLines={2}>
                {deliveryCompanyName(row)}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {deliveryCardMeta(row)}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            {completed ? (
              <Ionicons name="checkmark" size={12} color={badge.fg} style={styles.badgeIcon} />
            ) : null}
            <Text style={[styles.statusText, { color: badge.fg }]}>{deliveryStatusLabel(row)}</Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardBottom}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Teslim Tarihi</Text>
            <Text style={styles.metaValue}>{formatDeliveryDate(row)}</Text>
          </View>
          <View style={[styles.metaBlock, styles.metaBlockRight]}>
            <Text style={styles.metaLabel}>Teslim Alan</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {deliverySignedBy(row)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.outline} />
        </View>
      </View>
    </Pressable>
  );
}

export function DeliveriesFab({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, shadowCard, pressFade(pressed)]}>
      <Ionicons name="add" size={28} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  topBarTitle: {
    ...typography.headlineMd,
    fontFamily: fonts.semibold,
    color: colors.stitchPrimary,
    flex: 1,
    textAlign: 'center',
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: 4,
  },
  kpiLabel: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  kpiValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  kpiValue: {
    ...typography.headlineMd,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  kpiSub: { ...typography.caption, color: colors.outline },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: 4,
    marginTop: spacing.md,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.card,
    ...shadowCard,
  },
  segmentActiveNavy: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    ...typography.label,
    fontFamily: fonts.medium,
    color: colors.onSurfaceVariant,
  },
  segmentTextActive: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
  },
  segmentTextOnNavy: { color: '#fff' },
  searchWrap: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f3f5',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  searchIcon: { marginRight: spacing.xs },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.headlineMd,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  excelLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  excelText: { ...typography.label, color: colors.primary, fontFamily: fonts.medium },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  accentBar: { width: 3 },
  cardBody: { flex: 1, padding: spacing.md, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardLead: { flexDirection: 'row', gap: spacing.sm, flex: 1, minWidth: 0 },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitles: { flex: 1, minWidth: 0 },
  cardCompany: {
    ...typography.body,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  cardMeta: {
    ...typography.label,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  badgeIcon: { marginRight: 2 },
  statusText: { ...typography.caption, fontFamily: fonts.semibold },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e2e8f0',
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  metaBlock: { flex: 1 },
  metaBlockRight: { alignItems: 'flex-end', maxWidth: '42%' },
  metaLabel: { ...typography.caption, color: colors.outline, marginBottom: 2 },
  metaValue: { ...typography.bodySm, color: colors.textPrimary },
  fab: {
    position: 'absolute',
    right: layout.containerMargin,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
