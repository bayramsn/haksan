import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, layout, radius, spacing, themePalette, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

const cardBase: ViewStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  ...shadowCard,
};

function palette(isDark?: boolean) {
  return themePalette(Boolean(isDark));
}

/** Stitch greeting card — `91f83c94` */
export function GreetingCard({
  name,
  lead,
  children,
  isDark,
}: {
  name: string;
  lead: string;
  children?: React.ReactNode;
  isDark?: boolean;
}) {
  const p = palette(isDark);
  return (
    <View style={[styles.greeting, isDark && { backgroundColor: p.card, borderWidth: 1, borderColor: p.outlineVariant }]}>
      <Text style={[styles.greetingTitle, isDark && { color: p.stitchPrimary }]}>Hoş geldiniz, {name}</Text>
      <Text style={[styles.greetingLead, isDark && { color: p.secondary }]}>{lead}</Text>
      {children}
    </View>
  );
}

type ChipTone = 'secondary' | 'tertiary' | 'neutral';

const CHIP_TONES: Record<ChipTone, { bg: string; fg: string }> = {
  secondary: { bg: colors.secondaryContainer, fg: colors.onSecondaryContainer },
  tertiary: { bg: colors.tertiaryFixed, fg: colors.onTertiaryFixed },
  neutral: { bg: colors.surfaceVariant, fg: colors.onSurfaceVariant },
};

export function ActionChip({
  label,
  icon,
  tone = 'secondary',
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: ChipTone;
  onPress?: () => void;
}) {
  const palette = CHIP_TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: palette.bg }, pressFade(pressed)]}
    >
      <Ionicons name={icon} size={16} color={palette.fg} />
      <Text style={[styles.chipText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

type KpiTone = 'primary' | 'tertiary' | 'tint' | 'error';

const KPI_ICON_COLORS: Record<KpiTone, string> = {
  primary: colors.primary,
  tertiary: colors.tertiary,
  tint: colors.surfaceTint,
  error: colors.error,
};

export function DashboardKpiCard({
  label,
  value,
  icon,
  tone = 'primary',
  isDark,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: KpiTone;
  isDark?: boolean;
}) {
  const p = palette(isDark);
  const iconColor = isDark && tone === 'primary' ? p.primary : KPI_ICON_COLORS[tone];
  return (
    <View style={[styles.kpiCard, isDark && { backgroundColor: p.card, borderColor: p.outlineVariant }]}>
      <Ionicons name={icon} size={22} color={iconColor} />
      <Text style={[styles.kpiValue, isDark && { color: p.textPrimary }]}>{value}</Text>
      <Text style={[styles.kpiLabel, isDark && { color: p.secondary }]}>{label}</Text>
    </View>
  );
}

export function DashboardKpiGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.kpiGrid}>{children}</View>;
}

/** Stitch `2c0a327c` — Bugünkü Takvim timeline card */
export function CalendarSection({
  title,
  dateLabel,
  children,
  onViewAll,
  onAddEvent,
  isDark,
}: {
  title: string;
  dateLabel: string;
  children: React.ReactNode;
  onViewAll?: () => void;
  onAddEvent?: () => void;
  isDark?: boolean;
}) {
  const p = palette(isDark);
  return (
    <View style={[styles.calendarCard, isDark && { backgroundColor: p.card, borderColor: p.outlineVariant }]}>
      <View
        style={[
          styles.calendarHeader,
          isDark && { backgroundColor: p.card, borderBottomColor: p.surfaceContainerHighest },
        ]}
      >
        <Text style={[styles.calendarTitle, isDark && { color: p.textPrimary }]}>{title}</Text>
        <View style={styles.calendarHeaderActions}>
          <View style={[styles.dateBadge, isDark && { backgroundColor: p.surfaceContainerLow }]}>
            <Ionicons name="calendar-outline" size={14} color={p.onSurfaceVariant} />
            <Text style={[styles.dateBadgeText, isDark && { color: p.onSurfaceVariant }]}>{dateLabel}</Text>
          </View>
          {onViewAll ? (
            <Pressable onPress={onViewAll} hitSlop={8}>
              <Text style={[styles.viewAllLink, isDark && { color: p.primary }]}>Tümünü Gör</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {children}
      {onAddEvent ? (
        <View style={[styles.calendarFooter, isDark && { borderTopColor: p.surfaceContainerHighest }]}>
          <Pressable
            onPress={onAddEvent}
            style={({ pressed }) => [
              styles.addEventBtn,
              isDark && { backgroundColor: p.primarySoft },
              pressFade(pressed),
            ]}
          >
            <Ionicons name="calendar-outline" size={18} color={p.primary} />
            <Text style={[styles.addEventBtnText, isDark && { color: p.primary }]}>+ Yeni Etkinlik</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

type EventBadgeTone = 'visit' | 'meeting' | 'service' | 'default';

const EVENT_BADGE_TONES: Record<EventBadgeTone, { bg: string; fg: string }> = {
  visit: { bg: colors.secondaryContainer, fg: colors.onSecondaryContainer },
  meeting: { bg: colors.primary, fg: '#ffffff' },
  service: { bg: colors.surfaceVariant, fg: colors.onSurfaceVariant },
  default: { bg: colors.surfaceContainerHigh, fg: colors.onSurfaceVariant },
};

export function CalendarTimeline({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.timelineWrap}>
      <View style={styles.timelineRail} pointerEvents="none" />
      <View style={styles.timelineList}>{children}</View>
    </View>
  );
}

export function CalendarEventRow({
  time,
  title,
  subtitle,
  tag,
  tagTone = 'default',
  highlight,
  activeDot,
  onPress,
  isDark,
}: {
  time: string;
  title: string;
  subtitle?: string;
  tag?: string;
  tagTone?: EventBadgeTone;
  highlight?: boolean;
  activeDot?: boolean;
  onPress?: () => void;
  isDark?: boolean;
}) {
  const p = palette(isDark);
  const badge = EVENT_BADGE_TONES[tagTone];
  const highlightBg = isDark ? 'rgba(61, 69, 120, 0.45)' : 'rgba(0, 12, 105, 0.05)';
  const content = (
  <>
      <View style={styles.eventTimeCol}>
        <Text style={[styles.eventTime, highlight && { color: p.primary }]}>{time}</Text>
        <View
          style={[
            styles.eventDot,
            activeDot
              ? { backgroundColor: p.primary }
              : { backgroundColor: p.card, borderWidth: 2, borderColor: p.outlineVariant },
          ]}
        />
      </View>
      <View style={styles.eventBody}>
        <Text style={[styles.eventTitle, isDark && { color: p.textPrimary }]}>{title}</Text>
        {subtitle ? <Text style={[styles.eventSub, isDark && { color: p.secondary }]}>{subtitle}</Text> : null}
        {tag ? (
          <View style={[styles.eventTag, { backgroundColor: badge.bg }]}>
            <Text style={[styles.eventTagText, { color: badge.fg }]}>{tag}</Text>
          </View>
        ) : null}
      </View>
  </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.eventRow,
          highlight && { backgroundColor: highlightBg },
          pressFade(pressed),
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.eventRow, highlight && { backgroundColor: highlightBg }]}>{content}</View>;
}

/** Stitch — zengin boş durum */
export function CalendarEmptyState({
  title = 'Bugün etkinlik yok',
  subtitle = 'Yeni bir ziyaret veya toplantı ekleyerek gününüzü planlayın.',
  onAddEvent,
  isDark,
}: {
  title?: string;
  subtitle?: string;
  onAddEvent?: () => void;
  isDark?: boolean;
}) {
  const p = palette(isDark);
  return (
    <View style={[styles.calendarEmpty, isDark && { borderColor: p.outlineVariant }]}>
      <View style={[styles.calendarEmptyIcon, isDark && { backgroundColor: p.surfaceContainerLow }]}>
        <Ionicons name="calendar-clear-outline" size={28} color={p.primary} />
      </View>
      <Text style={[styles.calendarEmptyTitle, isDark && { color: p.textPrimary }]}>{title}</Text>
      <Text style={[styles.calendarEmptySubtitle, isDark && { color: p.secondary }]}>{subtitle}</Text>
      {onAddEvent ? (
        <Pressable
          onPress={onAddEvent}
          style={({ pressed }) => [
            styles.calendarEmptyBtn,
            isDark && { backgroundColor: p.primarySoft },
            pressFade(pressed),
          ]}
        >
          <Ionicons name="add" size={18} color={p.primary} />
          <Text style={[styles.calendarEmptyBtnText, isDark && { color: p.primary }]}>Etkinlik Ekle</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function StitchSectionCard({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.sectionCard, style]}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: {
    ...cardBase,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  greetingTitle: {
    ...typography.headlineMd,
    color: colors.stitchPrimary,
  },
  greetingLead: {
    ...typography.bodySm,
    color: colors.secondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  chipText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  kpiCard: {
    width: '47%',
    flexGrow: 1,
    ...cardBase,
    borderWidth: 1,
    borderColor: 'rgba(198, 197, 211, 0.3)',
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.sm,
    minHeight: 108,
    justifyContent: 'space-between',
  },
  kpiValue: {
    fontSize: 30,
    lineHeight: 38,
    fontFamily: fonts.bold,
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  kpiLabel: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.secondary,
  },
  calendarCard: {
    ...cardBase,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(198, 197, 211, 0.3)',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHighest,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  calendarTitle: {
    ...typography.headlineMd,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  calendarHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerLow,
  },
  dateBadgeText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.onSurfaceVariant,
  },
  viewAllLink: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  timelineWrap: {
    position: 'relative',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  timelineRail: {
    position: 'absolute',
    left: spacing.lg + 22,
    top: spacing.lg + 28,
    bottom: spacing.lg + 12,
    width: 2,
    backgroundColor: 'rgba(0, 12, 105, 0.1)',
    borderRadius: 1,
  },
  timelineList: {
    gap: spacing.lg,
  },
  calendarFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHighest,
  },
  addEventBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    minHeight: layout.touchMin,
  },
  addEventBtnText: {
    ...typography.bodySm,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  calendarEmpty: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  calendarEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  calendarEmptyTitle: {
    ...typography.body,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  calendarEmptySubtitle: {
    ...typography.bodySm,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  calendarEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    minHeight: 40,
  },
  calendarEmptyBtnText: {
    ...typography.bodySm,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  eventRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingRight: spacing.xs,
  },
  eventRowHighlight: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0, 12, 105, 0.05)',
  },
  eventTimeCol: {
    width: 48,
    alignItems: 'center',
  },
  eventTime: {
    ...typography.bodySm,
    fontFamily: fonts.bold,
    fontVariant: ['tabular-nums'],
    color: colors.textPrimary,
  },
  eventTimeActive: {
    color: colors.primary,
  },
  eventDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: spacing.xs,
    zIndex: 1,
  },
  eventDotActive: {
    backgroundColor: colors.primary,
  },
  eventDotIdle: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
  },
  eventBody: {
    flex: 1,
    gap: 4,
    paddingBottom: spacing.xs,
  },
  eventTitle: {
    ...typography.body,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
  },
  eventSub: {
    ...typography.bodySm,
    color: colors.secondary,
  },
  eventTag: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  eventTagText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
  },
  sectionCard: {
    ...cardBase,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.headlineMd,
    color: colors.stitchPrimary,
  },
});

/** Chip row helper */
export function ActionChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}
