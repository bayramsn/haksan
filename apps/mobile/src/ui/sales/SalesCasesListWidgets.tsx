import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard, shadowElevated } from '@/src/theme/styles';

const cardBase: ViewStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  ...shadowCard,
};

export const SALES_FILTERS = ['Tümü', 'Teklif', 'Müzakere', 'Kazanıldı', 'Kaybedildi'] as const;
export type SalesFilter = (typeof SALES_FILTERS)[number];

export type SalesViewMode = 'list' | 'kanban';

/** Stitch `e0417d17` — menü + Satış Yöneticisi + arama */
export function SalesCasesTopBar({
  roleLabel = 'Satış Yöneticisi',
  onMenu,
  onSearch,
}: {
  roleLabel?: string;
  onMenu?: () => void;
  onSearch?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topBarWrap, { paddingTop: insets.top }, shadowCard]}>
      <View style={styles.topBarRow}>
        <View style={styles.topBarLeft}>
          <Pressable
            onPress={onMenu}
            hitSlop={8}
            style={({ pressed }) => [
              styles.topBarIcon,
              pressed && styles.topBarIconPressed,
              pressFade(pressed),
            ]}
            accessibilityLabel="Menü"
          >
            <Ionicons name="menu-outline" size={24} color={colors.onSurfaceVariant} />
          </Pressable>
          <Text style={styles.topBarRole} numberOfLines={1}>
            {roleLabel}
          </Text>
        </View>
        <Pressable
          onPress={onSearch}
          hitSlop={8}
          style={({ pressed }) => [
            styles.topBarIcon,
            pressed && styles.topBarIconPressed,
            pressFade(pressed),
          ]}
          accessibilityLabel="Ara"
        >
          <Ionicons name="search-outline" size={24} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>
    </View>
  );
}

export function SalesCasesPageHeader({
  onAdd,
}: {
  onAdd: () => void;
}) {
  return (
    <View style={styles.pageHeader}>
      <Text style={styles.pageTitle}>Satış Kartları</Text>
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [styles.addBtn, shadowElevated, pressFade(pressed)]}
        accessibilityLabel="Yeni satış kartı"
      >
        <Ionicons name="add" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

export function SalesViewToggle({
  value,
  onChange,
}: {
  value: SalesViewMode;
  onChange: (v: SalesViewMode) => void;
}) {
  return (
    <View style={styles.viewToggleWrap}>
      <Pressable
        onPress={() => onChange('list')}
        style={[styles.viewToggleBtn, value === 'list' && styles.viewToggleBtnActive]}
      >
        <Ionicons
          name="list-outline"
          size={16}
          color={value === 'list' ? colors.stitchPrimary : colors.onSurfaceVariant}
        />
        <Text style={[styles.viewToggleText, value === 'list' && styles.viewToggleTextActive]}>Liste</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('kanban')}
        style={[styles.viewToggleBtn, value === 'kanban' && styles.viewToggleBtnActive]}
      >
        <Ionicons
          name="grid-outline"
          size={16}
          color={value === 'kanban' ? colors.stitchPrimary : colors.onSurfaceVariant}
        />
        <Text style={[styles.viewToggleText, value === 'kanban' && styles.viewToggleTextActive]}>Kanban</Text>
      </Pressable>
    </View>
  );
}

export function SalesSummaryStrip({
  total,
  monthDelta,
  pendingApproval,
}: {
  total: number;
  monthDelta: number;
  pendingApproval: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.summaryRow}
    >
      <View style={styles.summaryChipNeutral}>
        <Ionicons name="analytics-outline" size={16} color={colors.secondary} />
        <Text style={styles.summaryChipNeutralText}>Toplam {total} kart</Text>
      </View>
      <View style={styles.summaryChipGreen}>
        <Ionicons name="trending-up-outline" size={16} color="#0d652d" />
        <Text style={styles.summaryChipGreenText}>
          Bu ay {monthDelta >= 0 ? `+${monthDelta}` : monthDelta}
        </Text>
      </View>
      <View style={styles.summaryChipOrange}>
        <Ionicons name="hourglass-outline" size={16} color="#e65100" />
        <Text style={styles.summaryChipOrangeText}>Bekleyen onay {pendingApproval}</Text>
      </View>
    </ScrollView>
  );
}

export function SalesFilterChips({
  value,
  onChange,
}: {
  value: SalesFilter;
  onChange: (v: SalesFilter) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      {SALES_FILTERS.map((f) => {
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

export type StageVisual = {
  label: string;
  accent: string;
  badgeBg: string;
  badgeText: string;
  progress: number;
  progressTextColor: string;
  opacity: number;
  companyStruck: boolean;
  amountMuted: boolean;
  showWonIcon: boolean;
  showLostIcon: boolean;
};

export function stageVisualFromRow(row: Record<string, unknown>): StageVisual {
  const stage = row.stage as Record<string, unknown> | undefined;
  const code = String(stage?.code ?? '').toLowerCase();
  const probability = Math.min(100, Math.max(0, Number(row.probability ?? 50)));

  if (code === 'cancelled') {
    return {
      label: 'Kaybedildi',
      accent: '#ea4335',
      badgeBg: '#fce8e6',
      badgeText: '#c5221f',
      progress: 0,
      progressTextColor: '#c5221f',
      opacity: 0.7,
      companyStruck: true,
      amountMuted: true,
      showWonIcon: false,
      showLostIcon: true,
    };
  }
  if (code === 'delivered') {
    return {
      label: 'Kazanıldı',
      accent: '#34a853',
      badgeBg: '#e6f4ea',
      badgeText: '#0d652d',
      progress: 100,
      progressTextColor: '#0d652d',
      opacity: 0.9,
      companyStruck: false,
      amountMuted: false,
      showWonIcon: true,
      showLostIcon: false,
    };
  }
  if (code === 'quote' || code === 'proforma') {
    return {
      label: 'Teklif',
      accent: '#4285f4',
      badgeBg: '#e8f0fe',
      badgeText: '#1967d2',
      progress: probability,
      progressTextColor: colors.stitchPrimary,
      opacity: 1,
      companyStruck: false,
      amountMuted: false,
      showWonIcon: false,
      showLostIcon: false,
    };
  }
  return {
    label: 'Müzakere',
    accent: '#fbbc04',
    badgeBg: '#fff8e1',
    badgeText: '#f57f17',
    progress: probability,
    progressTextColor: colors.stitchPrimary,
    opacity: 1,
    companyStruck: false,
    amountMuted: false,
    showWonIcon: false,
    showLostIcon: false,
  };
}

export function SalesCaseCard({
  cardNo,
  companyName,
  productLine,
  amount,
  visual,
  onPress,
}: {
  cardNo: string;
  companyName: string;
  productLine: string;
  amount: string;
  visual: StageVisual;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.salesCard,
        cardBase,
        { opacity: visual.opacity },
        pressFade(pressed),
      ]}
    >
      <View style={[styles.stageStripe, { backgroundColor: visual.accent }]} />
      <View style={styles.salesCardTop}>
        <View style={styles.salesCardLeft}>
          <Text style={styles.cardNo}>{cardNo}</Text>
          <Text
            style={[
              styles.companyName,
              visual.companyStruck && styles.companyNameStruck,
            ]}
            numberOfLines={1}
          >
            {companyName}
          </Text>
          <Text style={styles.productLine} numberOfLines={1}>
            {productLine}
          </Text>
        </View>
        <View style={styles.salesCardRight}>
          <Text style={[styles.amount, visual.amountMuted && styles.amountMuted]}>{amount}</Text>
          <View style={[styles.stageBadge, { backgroundColor: visual.badgeBg }]}>
            {visual.showWonIcon ? (
              <Ionicons name="checkmark-circle" size={12} color={visual.badgeText} />
            ) : null}
            {visual.showLostIcon ? (
              <Ionicons name="close-circle" size={12} color={visual.badgeText} />
            ) : null}
            <Text style={[styles.stageBadgeText, { color: visual.badgeText }]}>{visual.label}</Text>
          </View>
        </View>
      </View>
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>İlerleme</Text>
          <Text style={[styles.progressPct, { color: visual.progressTextColor }]}>
            {visual.progress}%
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${visual.progress}%`, backgroundColor: visual.accent },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

export function cardNumberFromRow(row: Record<string, unknown>): string {
  const created = row.createdAt ? new Date(String(row.createdAt)) : new Date();
  const year = created.getFullYear();
  const id = String(row.id ?? '').replace(/-/g, '');
  const seq = id.slice(0, 3).toUpperCase() || '000';
  return `SK-${year}-${seq}`;
}

export function companyNameFromRow(row: Record<string, unknown>): string {
  const company = row.company as Record<string, unknown> | undefined;
  return String(company?.legalTitle ?? company?.shortName ?? '—');
}

export function formatSalesAmount(row: Record<string, unknown>): string {
  const value = Number(row.estimatedValue);
  if (!Number.isFinite(value)) return '—';
  const currency = row.currency as Record<string, unknown> | undefined;
  const code = String(currency?.code ?? 'TRY');
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `₺${value.toLocaleString('tr-TR')}`;
  }
}

const NEGOTIATION_STAGES = new Set([
  'lead',
  'sales',
  'call',
  'visit',
  'contract',
  'payment_plan',
  'commercial_invoice',
  'customs_approved',
  'stock_picking',
  'shipping',
  'installation',
]);

export function matchesSalesFilter(row: Record<string, unknown>, filter: SalesFilter): boolean {
  if (filter === 'Tümü') return true;
  const stage = row.stage as Record<string, unknown> | undefined;
  const code = String(stage?.code ?? '').toLowerCase();
  if (filter === 'Teklif') return code === 'quote' || code === 'proforma';
  if (filter === 'Müzakere') return NEGOTIATION_STAGES.has(code);
  if (filter === 'Kazanıldı') return code === 'delivered';
  if (filter === 'Kaybedildi') return code === 'cancelled';
  return true;
}

export function countCreatedThisMonth(rows: Record<string, unknown>[]): number {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  return rows.filter((r) => {
    const d = new Date(String(r.createdAt ?? ''));
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;
}

export function countPendingApproval(rows: Record<string, unknown>[]): number {
  return rows.filter((r) => {
    const code = String((r.stage as Record<string, unknown> | undefined)?.code ?? '').toLowerCase();
    return code === 'quote' || code === 'proforma';
  }).length;
}

const styles = StyleSheet.create({
  topBarWrap: {
    backgroundColor: colors.canvas,
    zIndex: 50,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: layout.containerMargin,
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topBarRole: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: fonts.bold,
    color: colors.stitchPrimary,
    letterSpacing: -0.2,
  },
  topBarIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  topBarIconPressed: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: 30,
    lineHeight: 38,
    fontFamily: fonts.bold,
    color: colors.stitchPrimary,
    letterSpacing: -0.6,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleWrap: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceContainerLow,
    padding: spacing.xs,
    borderRadius: radius.sm,
  },
  viewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  viewToggleText: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  viewToggleTextActive: {
    color: colors.stitchPrimary,
  },
  summaryRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  summaryChipNeutral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  summaryChipNeutralText: {
    ...typography.label,
    color: colors.secondary,
  },
  summaryChipGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#e6f4ea',
    borderWidth: 1,
    borderColor: '#ceead6',
  },
  summaryChipGreenText: {
    ...typography.label,
    color: '#0d652d',
  },
  summaryChipOrange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#fff3e0',
    borderWidth: 1,
    borderColor: '#ffe0b2',
  },
  summaryChipOrangeText: {
    ...typography.label,
    color: '#e65100',
  },
  filterRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  filterChipActive: {
    backgroundColor: colors.stitchPrimary,
    borderColor: colors.stitchPrimary,
  },
  filterChipText: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  salesCard: {
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
    position: 'relative',
  },
  stageStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  salesCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  salesCardLeft: { flex: 1, gap: spacing.xs },
  cardNo: {
    ...typography.caption,
    color: colors.outline,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  companyName: {
    ...typography.headlineMd,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  companyNameStruck: {
    textDecorationLine: 'line-through',
    color: colors.onSurfaceVariant,
  },
  productLine: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
  },
  salesCardRight: { alignItems: 'flex-end', gap: spacing.xs },
  amount: {
    ...typography.headlineMd,
    fontFamily: fonts.bold,
    color: colors.stitchPrimary,
  },
  amountMuted: { color: colors.onSurfaceVariant },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: spacing.xs,
  },
  stageBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.semibold,
  },
  progressSection: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  progressLabel: {
    ...typography.caption,
    color: colors.outline,
  },
  progressPct: {
    ...typography.caption,
    fontFamily: fonts.medium,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#eeeeef',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
});
