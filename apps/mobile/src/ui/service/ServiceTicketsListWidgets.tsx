import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';
import { DivisionChip } from '@/src/ui/DivisionChip';

const cardBase: ViewStyle = {
  backgroundColor: colors.card,
  borderRadius: 16,
  ...shadowCard,
};

export const SERVICE_FILTERS = ['Tümü', 'Acil', 'Beklemede', 'Devam Ediyor', 'Tamamlandı'] as const;
export type ServiceFilter = (typeof SERVICE_FILTERS)[number];

export type ServiceStatusVisual = {
  label: string;
  badgeBg: string;
  badgeText: string;
  opacity: number;
  subjectStruck: boolean;
  assigneeMuted: boolean;
  showCompletedIcon: boolean;
  showUnassignedIcon: boolean;
};

/** Stitch Servis Talepleri — `8d84b0d695cc4130acafcd7ab6bd5362` */
export function ServiceTicketsTopBar({
  onMenu,
  onSearch,
  onAdd,
}: {
  onMenu?: () => void;
  onSearch?: () => void;
  onAdd?: () => void;
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
          <Text style={styles.topBarTitle} numberOfLines={1}>
            Servis Talepleri
          </Text>
        </View>
        <View style={styles.topBarRight}>
          <DivisionChip />
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
            <Ionicons name="search-outline" size={24} color={colors.stitchPrimary} />
          </Pressable>
          <Pressable
            onPress={onAdd}
            style={({ pressed }) => [styles.addTextBtn, pressed && styles.topBarIconPressed, pressFade(pressed)]}
            accessibilityLabel="Yeni servis talebi"
          >
            <Text style={styles.addTextBtnLabel}>Ekle</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function ServiceStatsRow({
  openCount,
  assignedCount,
  completedCount,
  slaBreachCount,
}: {
  openCount: number;
  assignedCount: number;
  completedCount: number;
  slaBreachCount: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.statsRow}
    >
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>AÇIK</Text>
        <Text style={styles.statValue}>{openCount}</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>ATANDI</Text>
        <Text style={styles.statValue}>{assignedCount}</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>TAMAMLANDI</Text>
        <Text style={styles.statValue}>{completedCount}</Text>
      </View>
      <View style={[styles.statCard, styles.statCardDanger]}>
        <Text style={[styles.statLabel, styles.statLabelDanger]}>SLA İHLALİ</Text>
        <Text style={[styles.statValue, styles.statValueDanger]}>{slaBreachCount}</Text>
      </View>
    </ScrollView>
  );
}

export function ServiceFilterChips({
  value,
  onChange,
}: {
  value: ServiceFilter;
  onChange: (v: ServiceFilter) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      {SERVICE_FILTERS.map((f) => {
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

export function ServiceTicketCard({
  ticketNo,
  companyName,
  subject,
  assigneeLabel,
  timeLabel,
  visual,
  onPress,
}: {
  ticketNo: string;
  companyName: string;
  subject: string;
  assigneeLabel: string;
  timeLabel?: string;
  visual: ServiceStatusVisual;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.ticketCard,
        cardBase,
        { opacity: visual.opacity },
        pressFade(pressed),
      ]}
    >
      <View style={styles.ticketCardTop}>
        <Text style={styles.ticketNo}>{ticketNo}</Text>
        <View style={[styles.statusBadge, { backgroundColor: visual.badgeBg }]}>
          <Text style={[styles.statusBadgeText, { color: visual.badgeText }]}>{visual.label}</Text>
        </View>
      </View>
      <Text style={styles.companyName} numberOfLines={1}>
        {companyName}
      </Text>
      <Text
        style={[styles.subject, visual.subjectStruck && styles.subjectStruck]}
        numberOfLines={2}
      >
        {subject}
      </Text>
      <View style={styles.ticketFooter}>
        <View style={styles.assigneeRow}>
          {visual.showCompletedIcon ? (
            <Ionicons name="checkmark-circle" size={16} color={colors.onSurfaceVariant} />
          ) : visual.showUnassignedIcon ? (
            <Ionicons name="person-remove-outline" size={16} color={colors.outline} />
          ) : (
            <Ionicons name="person" size={16} color={colors.onSurfaceVariant} />
          )}
          <Text
            style={[
              styles.assigneeText,
              visual.assigneeMuted && styles.assigneeMuted,
              visual.showUnassignedIcon && styles.assigneeItalic,
            ]}
          >
            {assigneeLabel}
          </Text>
        </View>
        {timeLabel ? <Text style={styles.timeLabel}>{timeLabel}</Text> : null}
      </View>
    </Pressable>
  );
}

export function statusVisualFromRow(row: Record<string, unknown>): ServiceStatusVisual {
  const status = row.status as Record<string, unknown> | undefined;
  const code = String(status?.code ?? row.statusCode ?? '').toLowerCase();
  const severity = String(row.severity ?? 'normal').toLowerCase();
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const stage = String(meta.serviceStage ?? '').toLowerCase();
  const assigned = Boolean(row.assignedToUserId ?? row.assignedToUser);

  if (code === 'closed' || code === 'resolved' || stage.includes('closed') || stage.includes('completed')) {
    return {
      label: 'Tamamlandı',
      badgeBg: '#e8f5e9',
      badgeText: '#2e7d32',
      opacity: 0.75,
      subjectStruck: true,
      assigneeMuted: false,
      showCompletedIcon: true,
      showUnassignedIcon: false,
    };
  }

  if (severity === 'critical' || severity === 'high') {
    return {
      label: 'Acil',
      badgeBg: colors.errorContainer ?? '#ffdad6',
      badgeText: colors.onErrorContainer ?? '#93000a',
      opacity: 1,
      subjectStruck: false,
      assigneeMuted: false,
      showCompletedIcon: false,
      showUnassignedIcon: false,
    };
  }

  if (
    code === 'in_progress' ||
    stage.includes('progress') ||
    stage.includes('diagnosis') ||
    stage.includes('scheduled')
  ) {
    return {
      label: 'Devam Ediyor',
      badgeBg: colors.secondaryContainer,
      badgeText: colors.onSecondaryContainer,
      opacity: 1,
      subjectStruck: false,
      assigneeMuted: false,
      showCompletedIcon: false,
      showUnassignedIcon: false,
    };
  }

  if (!assigned || code === 'open' || code === 'pending') {
    return {
      label: 'Beklemede',
      badgeBg: '#fff3e0',
      badgeText: '#e65100',
      opacity: 1,
      subjectStruck: false,
      assigneeMuted: true,
      showCompletedIcon: false,
      showUnassignedIcon: true,
    };
  }

  return {
    label: 'Devam Ediyor',
    badgeBg: colors.secondaryContainer,
    badgeText: colors.onSecondaryContainer,
    opacity: 1,
    subjectStruck: false,
    assigneeMuted: false,
    showCompletedIcon: false,
    showUnassignedIcon: false,
  };
}

export function matchesServiceFilter(row: Record<string, unknown>, filter: ServiceFilter): boolean {
  if (filter === 'Tümü') return true;
  const visual = statusVisualFromRow(row);
  if (filter === 'Acil') return visual.label === 'Acil';
  if (filter === 'Beklemede') return visual.label === 'Beklemede';
  if (filter === 'Devam Ediyor') return visual.label === 'Devam Ediyor';
  if (filter === 'Tamamlandı') return visual.label === 'Tamamlandı';
  return true;
}

export function ticketNoFromRow(row: Record<string, unknown>): string {
  if (row.ticketNo) return String(row.ticketNo);
  const created = row.reportedAt ?? row.createdAt;
  const year = created ? new Date(String(created)).getFullYear() : new Date().getFullYear();
  const id = String(row.id ?? '').replace(/-/g, '');
  const seq = id.slice(0, 3).toUpperCase() || '000';
  return `ST-${year}-${seq}`;
}

export function companyNameFromRow(row: Record<string, unknown>): string {
  const company = row.company as Record<string, unknown> | undefined;
  return String(company?.legalTitle ?? company?.shortName ?? '—');
}

export function assigneeFromRow(row: Record<string, unknown>): string {
  const user = row.assignedToUser as Record<string, unknown> | undefined;
  if (user?.fullName) return String(user.fullName);
  if (user?.firstName || user?.lastName) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ');
  }
  if (row.assignedToUserId) return 'Atanmış';
  return 'Atanmadı';
}

export function relativeTimeFromRow(row: Record<string, unknown>): string | undefined {
  const raw = row.reportedAt ?? row.updatedAt ?? row.createdAt;
  if (!raw) return undefined;
  const then = new Date(String(raw)).getTime();
  if (Number.isNaN(then)) return undefined;
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

export function countOpenTickets(rows: Record<string, unknown>[]): number {
  return rows.filter((r) => {
    const code = String((r.status as Record<string, unknown> | undefined)?.code ?? r.statusCode ?? '').toLowerCase();
    return code !== 'closed' && code !== 'resolved';
  }).length;
}

export function countAssignedTickets(rows: Record<string, unknown>[]): number {
  return rows.filter((r) => {
    const code = String((r.status as Record<string, unknown> | undefined)?.code ?? r.statusCode ?? '').toLowerCase();
    return Boolean(r.assignedToUserId ?? r.assignedToUser) && code !== 'closed' && code !== 'resolved';
  }).length;
}

export function countCompletedTickets(rows: Record<string, unknown>[]): number {
  return rows.filter((r) => statusVisualFromRow(r).label === 'Tamamlandı').length;
}

export function countSlaBreaches(rows: Record<string, unknown>[]): number {
  return rows.filter((r) => {
    const severity = String(r.severity ?? '').toLowerCase();
    if (severity === 'critical') return true;
    const code = String((r.status as Record<string, unknown> | undefined)?.code ?? r.statusCode ?? '').toLowerCase();
    if (code === 'closed' || code === 'resolved') return false;
    const reported = r.reportedAt ?? r.createdAt;
    if (!reported) return false;
    const ageHours = (Date.now() - new Date(String(reported)).getTime()) / 3600000;
    return ageHours > 48 && String(r.severity ?? '').toLowerCase() === 'high';
  }).length;
}

const styles = StyleSheet.create({
  topBarWrap: {
    backgroundColor: colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    zIndex: 50,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: layout.containerMargin,
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  topBarTitle: {
    fontSize: 22,
    lineHeight: 28,
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
    backgroundColor: colors.surfaceContainerLow,
  },
  addTextBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  addTextBtnLabel: {
    ...typography.label,
    color: colors.stitchPrimary,
    fontFamily: fonts.medium,
  },
  statsRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  statCard: {
    minWidth: 120,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'transparent',
    ...shadowCard,
  },
  statCardDanger: {
    backgroundColor: '#ffdad6',
    borderColor: 'rgba(186, 26, 26, 0.2)',
  },
  statLabel: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statLabelDanger: {
    color: '#93000a',
  },
  statValue: {
    marginTop: spacing.xs,
    fontSize: 30,
    lineHeight: 38,
    fontFamily: fonts.bold,
    color: colors.onSurface,
    letterSpacing: -0.6,
  },
  statValueDanger: {
    color: '#93000a',
  },
  filterRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
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
  ticketCard: {
    padding: spacing.lg,
  },
  ticketCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  ticketNo: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.semibold,
  },
  companyName: {
    ...typography.headlineMd,
    color: colors.stitchPrimary,
    marginBottom: spacing.xs,
  },
  subject: {
    ...typography.bodySm,
    color: colors.onSurface,
    marginBottom: spacing.md,
  },
  subjectStruck: {
    textDecorationLine: 'line-through',
    color: colors.onSurfaceVariant,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  assigneeText: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  assigneeMuted: {
    color: colors.onSurfaceVariant,
  },
  assigneeItalic: {
    fontStyle: 'italic',
    color: colors.outline,
  },
  timeLabel: {
    ...typography.caption,
    color: colors.outline,
  },
});
