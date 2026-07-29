import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  companyNameFromRow,
  documentNoFromRow,
  formatQuoteMoney,
  grandTotalFromRow,
  isQuoteExpired,
  offerStatusVisual,
  quoteSubtitleFromRow,
  relativeQuoteDate,
  revisionFromRow,
  statusFromRow,
  validityLabelFromRow,
} from '@/src/ui/offer/offerHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export const OFFER_FILTERS = ['Tümü', 'Taslak', 'Gönderildi', 'Kabul', 'Red', 'Süresi Doldu'] as const;
export type OfferFilter = (typeof OFFER_FILTERS)[number];

const FILTER_TO_API: Record<OfferFilter, string | undefined> = {
  Tümü: undefined,
  Taslak: 'draft',
  Gönderildi: 'sent',
  Kabul: 'approved',
  Red: 'rejected',
  'Süresi Doldu': 'expired',
};

export { FILTER_TO_API };

/** Stitch #17 — geri | Teklifler | arama + Yeni */
export function OffersTopBar({
  onBack,
  onSearch,
  onAdd,
}: {
  onBack?: () => void;
  onSearch?: () => void;
  onAdd?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topBarWrap, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.topBarIcon, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.onSurfaceVariant} />
      </Pressable>
      <Text style={styles.topBarTitle}>Teklifler</Text>
      <View style={styles.topBarRight}>
        <Pressable onPress={onSearch} hitSlop={8} style={({ pressed }) => [styles.topBarIcon, pressFade(pressed)]}>
          <Ionicons name="search-outline" size={22} color={colors.stitchPrimary} />
        </Pressable>
        <Pressable onPress={onAdd} style={({ pressed }) => [styles.addBtn, pressFade(pressed)]}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Yeni</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function OffersSearchField({
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
        placeholder="Teklif no veya firma ara…"
        placeholderTextColor={colors.onSurfaceVariant}
        style={styles.searchInput}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

/** Stitch KPI şeridi — Açık, Onay bekleyen, Kabul, Red, Toplam */
export function OffersKpiStrip({
  openCount,
  pendingCount,
  approvedCount,
  rejectedCount,
  totalValue,
  currencyCode,
}: {
  openCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalValue: number;
  currencyCode: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.kpiScroll}
      contentContainerStyle={styles.kpiRow}
    >
      <View style={styles.kpiCard}>
        <Text style={styles.kpiLabel}>Açık</Text>
        <Text style={styles.kpiValue}>{openCount}</Text>
      </View>
      <View style={styles.kpiCard}>
        <Text style={styles.kpiLabel}>Onay bekleyen</Text>
        <Text style={[styles.kpiValue, styles.kpiValueMuted]}>{pendingCount}</Text>
      </View>
      <View style={styles.kpiCard}>
        <Text style={styles.kpiLabel}>Kabul</Text>
        <Text style={[styles.kpiValue, styles.kpiValueGreen]}>{approvedCount}</Text>
      </View>
      <View style={styles.kpiCard}>
        <Text style={styles.kpiLabel}>Red</Text>
        <Text style={[styles.kpiValue, styles.kpiValueRed]}>{rejectedCount}</Text>
      </View>
      <View style={[styles.kpiCard, styles.kpiCardPrimary]}>
        <Text style={styles.kpiLabelPrimary}>Toplam</Text>
        <Text style={styles.kpiValuePrimary} numberOfLines={1}>
          {formatQuoteMoney({ currencyCode, grandTotal: totalValue } as Record<string, unknown>, totalValue)}
        </Text>
      </View>
    </ScrollView>
  );
}

export function OfferFilterChips({
  value,
  onChange,
}: {
  value: OfferFilter;
  onChange: (v: OfferFilter) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterRow}
    >
      {OFFER_FILTERS.map((f) => {
        const active = f === value;
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            style={[styles.filterChip, active && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function OfferListCard({
  row,
  onPress,
}: {
  row: Record<string, unknown>;
  onPress: () => void;
}) {
  const status = offerStatusVisual(row);
  const rev = revisionFromRow(row);
  const isDraft = statusFromRow(row).code === 'draft';
  const expired = isQuoteExpired(row);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, (isDraft || expired) && styles.cardMuted, pressFade(pressed)]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardMeta}>
          <Text style={styles.docNo}>{documentNoFromRow(row)}</Text>
          <Text style={styles.companyName} numberOfLines={1}>
            {companyNameFromRow(row)}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {quoteSubtitleFromRow(row)}
          </Text>
        </View>
        <Ionicons name="ellipsis-vertical" size={18} color={colors.onSurfaceVariant} />
      </View>
      <View style={styles.cardFooter}>
        <View style={styles.cardFooterLeft}>
          <Text style={styles.amount}>{formatQuoteMoney(row)}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <Text style={[styles.statusBadgeText, { color: status.fg }]}>{status.label.toUpperCase()}</Text>
            </View>
            {rev > 1 ? (
              <View style={styles.revBadge}>
                <Text style={styles.revBadgeText}>v{rev}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.cardFooterRight}>
          {!isDraft ? <Ionicons name="document-outline" size={18} color={colors.outline} /> : null}
          <Text style={styles.validityText}>
            {isDraft ? 'Düzenleniyor' : validityLabelFromRow(row)}
          </Text>
          {!isDraft && !expired ? (
            <Text style={styles.dateText}>{relativeQuoteDate(row)}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function countByStatus(items: Record<string, unknown>[], code: string): number {
  return items.filter((row) => {
    if (code === 'expired') return isQuoteExpired(row);
    return statusFromRow(row).code === code;
  }).length;
}

export function sumGrandTotal(items: Record<string, unknown>[]): number {
  return items.reduce((sum, row) => sum + grandTotalFromRow(row), 0);
}

export function matchesOfferFilter(row: Record<string, unknown>, filter: OfferFilter): boolean {
  if (filter === 'Tümü') return true;
  if (filter === 'Süresi Doldu') return isQuoteExpired(row) || statusFromRow(row).code === 'expired';
  const apiCode = FILTER_TO_API[filter];
  return apiCode ? statusFromRow(row).code === apiCode && !isQuoteExpired(row) : true;
}

const styles = StyleSheet.create({
  topBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
    backgroundColor: colors.card,
    zIndex: 10,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.headline,
    color: colors.stitchPrimary,
    fontFamily: fonts.bold,
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  topBarIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    minHeight: 32,
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  addBtnText: { ...typography.caption, color: '#fff', fontFamily: fonts.semibold },
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
  kpiScroll: { flexGrow: 0, marginHorizontal: -layout.containerMargin },
  kpiRow: { gap: spacing.sm, paddingHorizontal: layout.containerMargin, paddingBottom: spacing.xs },
  kpiCard: {
    flexShrink: 0,
    minWidth: 100,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm,
    ...shadowCard,
  },
  kpiCardPrimary: {
    minWidth: 120,
    backgroundColor: colors.primary,
  },
  kpiLabel: { ...typography.label, color: colors.onSurfaceVariant },
  kpiLabelPrimary: { ...typography.label, color: '#bcc2ff' },
  kpiValue: { ...typography.headline, color: colors.stitchPrimary, fontFamily: fonts.bold, marginTop: 4 },
  kpiValueMuted: { color: '#b7c8e1' },
  kpiValueGreen: { color: '#2e7d32' },
  kpiValueRed: { color: colors.error },
  kpiValuePrimary: {
    ...typography.headline,
    color: '#fff',
    fontFamily: fonts.bold,
    marginTop: 4,
  },
  filterScroll: { flexGrow: 0, marginHorizontal: -layout.containerMargin },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.xs,
  },
  filterChip: {
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: { ...typography.caption, color: colors.onSurfaceVariant, fontFamily: fonts.semibold },
  filterChipTextActive: { color: '#fff' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadowCard,
  },
  cardMuted: { opacity: 0.85 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardMeta: { flex: 1, gap: 2, paddingRight: spacing.sm },
  docNo: { ...typography.caption, color: colors.outline },
  companyName: {
    ...typography.body,
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    marginTop: 2,
  },
  subtitle: { ...typography.bodySm, color: colors.onSurfaceVariant },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  cardFooterLeft: { gap: spacing.xs },
  cardFooterRight: { alignItems: 'flex-end', gap: 4 },
  amount: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  statusBadgeText: { fontSize: 10, lineHeight: 12, fontFamily: fonts.bold, letterSpacing: 0.8 },
  revBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surfaceContainerHigh,
  },
  revBadgeText: { fontSize: 10, fontFamily: fonts.bold, color: colors.onSurfaceVariant },
  validityText: { ...typography.caption, color: colors.outline },
  dateText: { ...typography.caption, color: colors.outline },
});
