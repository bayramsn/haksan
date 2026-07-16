import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatInstallationSchedule,
  INSTALLATION_STATUS_FILTERS,
  installationCode,
  installationCompany,
  installationProgress,
  installationStatusLabel,
  installationSubtitle,
  installationTechnician,
  statusBadgeStyle,
  type InstallationStatusFilter,
} from '@/src/ui/installations/installationHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export function InstallationsTopBar({
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
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.onSurfaceVariant} />
      </Pressable>
      <Text style={styles.topBarTitle}>Kurulum</Text>
      <View style={styles.topBarRight}>
        {onScan ? (
          <Pressable onPress={onScan} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
            <Ionicons name="qr-code-outline" size={22} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
        {onFilter ? (
          <Pressable onPress={onFilter} hitSlop={8} style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}>
            <Ionicons name="options-outline" size={22} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function InstallationsKpiStrip({
  active,
  planned,
  completed,
}: {
  active: number;
  planned: number;
  completed: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.kpiScroll}
      contentContainerStyle={styles.kpiRow}
    >
      <View style={[styles.kpiChip, styles.kpiChipActive]}>
        <View style={[styles.kpiDot, { backgroundColor: colors.primary }]} />
        <Text style={styles.kpiChipActiveText}>Aktif {active}</Text>
      </View>
      <View style={[styles.kpiChip, styles.kpiChipNeutral]}>
        <View style={[styles.kpiDot, { backgroundColor: colors.onSurfaceVariant }]} />
        <Text style={styles.kpiChipNeutralText}>Plan {planned}</Text>
      </View>
      <View style={[styles.kpiChip, styles.kpiChipDone]}>
        <View style={[styles.kpiDot, { backgroundColor: '#137333' }]} />
        <Text style={styles.kpiChipDoneText}>Tamamlanan {completed}</Text>
      </View>
    </ScrollView>
  );
}

export function InstallationsStatusTabs({
  value,
  onChange,
}: {
  value: InstallationStatusFilter;
  onChange: (v: InstallationStatusFilter) => void;
}) {
  return (
    <View style={styles.segmented}>
      {INSTALLATION_STATUS_FILTERS.map((tab) => {
        const active = tab === value;
        return (
          <Pressable
            key={tab}
            onPress={() => onChange(tab)}
            style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressFade(pressed)]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{tab}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TechnicianAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  const unassigned = name === 'Atanmadı';

  if (unassigned) {
    return (
      <View style={styles.avatarPlaceholder}>
        <Ionicons name="person-add-outline" size={18} color={colors.outline} />
      </View>
    );
  }

  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials || '?'}</Text>
    </View>
  );
}

export function InstallationListCard({
  row,
  onPress,
}: {
  row: Record<string, unknown>;
  onPress: () => void;
}) {
  const badge = statusBadgeStyle(row);
  const progress = installationProgress(row);
  const schedule = formatInstallationSchedule(row);
  const technician = installationTechnician(row);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, shadowCard, pressFade(pressed)]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLead}>
          <View style={styles.cardIcon}>
            <Ionicons name="construct-outline" size={20} color={colors.onSurfaceVariant} />
          </View>
          <View style={styles.cardTitles}>
            <Text style={styles.cardCode}>{installationCode(row)}</Text>
            <Text style={styles.cardCompany} numberOfLines={1}>
              {installationCompany(row)}
            </Text>
            <Text
              style={[styles.cardSub, !row.customerDeviceId && styles.cardSubMuted]}
              numberOfLines={1}
            >
              {installationSubtitle(row)}
            </Text>
          </View>
        </View>
        <TechnicianAvatar name={technician} />
      </View>

      <View style={styles.cardFooter}>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: badge.dot }]} />
          <Text style={[styles.statusText, { color: badge.fg }]}>{installationStatusLabel(row)}</Text>
        </View>
        {schedule ? (
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.onSurfaceVariant} />
            <Text style={styles.metaText}>{schedule}</Text>
          </View>
        ) : technician !== 'Atanmadı' ? (
          <Text style={styles.metaText} numberOfLines={1}>
            {technician}
          </Text>
        ) : null}
      </View>

      {progress != null && progress > 0 ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function InstallationsFab({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, shadowCard, pressFade(pressed)]}>
      <Ionicons name="add" size={22} color="#fff" />
      <Text style={styles.fabText}>Yeni Kurulum Planı</Text>
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
  kpiScroll: { marginTop: spacing.md },
  kpiRow: { gap: spacing.xs, paddingRight: spacing.md },
  kpiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  kpiChipActive: { backgroundColor: '#dfe0ff', borderColor: '#bcc2ff' },
  kpiChipNeutral: { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
  kpiChipDone: { backgroundColor: '#e6f4ea', borderColor: '#cce8d6' },
  kpiDot: { width: 8, height: 8, borderRadius: 4 },
  kpiChipActiveText: { ...typography.label, fontFamily: fonts.medium, color: '#000b63' },
  kpiChipNeutralText: { ...typography.label, fontFamily: fonts.medium, color: colors.onSurfaceVariant },
  kpiChipDoneText: { ...typography.label, fontFamily: fonts.medium, color: '#137333' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: 4,
    marginTop: spacing.lg,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.card,
    ...shadowCard,
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
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLead: { flexDirection: 'row', gap: spacing.sm, flex: 1, minWidth: 0 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitles: { flex: 1, minWidth: 0 },
  cardCode: { ...typography.caption, color: colors.outline },
  cardCompany: { ...typography.headlineMd, fontFamily: fonts.semibold, color: colors.textPrimary },
  cardSub: { ...typography.bodySm, color: colors.onSurfaceVariant, marginTop: 2 },
  cardSubMuted: { fontStyle: 'italic', color: colors.outline },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  avatarText: { ...typography.caption, color: colors.primary, fontFamily: fonts.semibold },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { ...typography.caption },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  metaText: { ...typography.label, color: colors.onSurfaceVariant, flexShrink: 1 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceContainerHigh,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  fab: {
    position: 'absolute',
    right: layout.containerMargin,
    bottom: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  fabText: { ...typography.caption, color: '#fff', fontFamily: fonts.semibold },
});
