import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatInstallationDate,
  installationCode,
  installationCompany,
  installationDurationDisplay,
  installationLocationLabel,
  installationMachineLine,
  installationProgress,
  installationStatusLabel,
  installationTechnician,
  statusBadgeStyle,
} from '@/src/ui/installations/installationHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export type InstallationDetailTab = 'genel' | 'checklist' | 'belgeler' | 'notlar';

export const INSTALLATION_DETAIL_TABS: { key: InstallationDetailTab; label: string }[] = [
  { key: 'genel', label: 'Genel' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'belgeler', label: 'Belgeler' },
  { key: 'notlar', label: 'Notlar' },
];

export function InstallationDetailHeader({
  onBack,
  onShare,
}: {
  onBack: () => void;
  onShare?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.onSurfaceVariant} />
      </Pressable>
      <Text style={styles.headerTitle}>Kurulum Detayı</Text>
      {onShare ? (
        <Pressable onPress={onShare} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
          <Ionicons name="share-outline" size={22} color={colors.onSurfaceVariant} />
        </Pressable>
      ) : (
        <View style={styles.headerBtn} />
      )}
    </View>
  );
}

export function InstallationHeroCard({ data }: { data: Record<string, unknown> }) {
  const badge = statusBadgeStyle(data);
  const progress = installationProgress(data);

  return (
    <View style={[styles.hero, shadowCard]}>
      <View style={styles.heroTop}>
        <View style={styles.codeChip}>
          <Text style={styles.codeText}>{installationCode(data)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: badge.dot }]} />
          <Text style={[styles.statusText, { color: badge.fg }]}>{installationStatusLabel(data)}</Text>
        </View>
      </View>
      <Text style={styles.companyName}>{installationCompany(data)}</Text>
      <Text style={styles.machineLine}>{installationMachineLine(data)}</Text>
      {progress != null ? (
        <View style={styles.progressWrap}>
          <View style={styles.progressLabels}>
            <Text style={styles.progressLabel}>İlerleme</Text>
            <Text style={styles.progressPct}>{progress}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>
      ) : null}
      <View style={styles.techRow}>
        <View style={styles.techAvatar}>
          <Text style={styles.techInitials}>
            {installationTechnician(data)
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? '')
              .join('') || '?'}
          </Text>
        </View>
        <View style={styles.techMeta}>
          <Text style={styles.techLabel}>Teknisyen</Text>
          <Text style={styles.techName}>{installationTechnician(data)}</Text>
        </View>
      </View>
    </View>
  );
}

export function InstallationDetailTabs({
  value,
  onChange,
}: {
  value: InstallationDetailTab;
  onChange: (t: InstallationDetailTab) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
      {INSTALLATION_DETAIL_TABS.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [styles.tab, active && styles.tabActive, pressFade(pressed)]}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function InstallationGeneralTab({ data }: { data: Record<string, unknown> }) {
  const loc = installationLocationLabel(data);
  const duration = installationDurationDisplay(data);

  return (
    <View style={styles.panelGap}>
      <View style={[styles.timeline, shadowCard]}>
        <Text style={styles.panelTitle}>Zaman Çizelgesi</Text>
        <TimelineItem label="Planlandı" date={formatInstallationDate(data.scheduledDate)} done />
        <TimelineItem label="Kurulum" date={formatInstallationDate(data.startedAt ?? data.scheduledDate)} current={!data.completedAt} />
        <TimelineItem label="Tamamlandı" date={formatInstallationDate(data.completedAt)} done={Boolean(data.completedAt)} last />
      </View>
      <View style={[styles.statsCard, shadowCard]}>
        <StatCell label="Planlanan" value={formatInstallationDate(data.scheduledDate)} />
        <StatCell label="Süre" value={duration ?? '—'} />
        <StatCell label="Konum" value={loc ?? '—'} />
      </View>
    </View>
  );
}

function TimelineItem({
  label,
  date,
  done,
  current,
  last,
}: {
  label: string;
  date: string;
  done?: boolean;
  current?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.timelineItem, !last && styles.timelineItemBorder]}>
      <View style={[styles.timelineDot, done && styles.timelineDotDone, current && styles.timelineDotCurrent]} />
      <View>
        <Text style={[styles.timelineLabel, current && styles.timelineLabelCurrent]}>{label}</Text>
        <Text style={styles.timelineDate}>{date}</Text>
      </View>
    </View>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
    </View>
  );
}

export function InstallationNotesTab({ data }: { data: Record<string, unknown> }) {
  const notes = String(data.notes ?? '').trim();
  return (
    <View style={[styles.notesCard, shadowCard]}>
      <Text style={styles.notesText}>{notes || 'Not eklenmemiş.'}</Text>
    </View>
  );
}

export function InstallationDetailFooter({
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }, shadowCard]}>
      {secondaryLabel && onSecondary ? (
        <Pressable onPress={onSecondary} style={({ pressed }) => [styles.footerSecondary, pressFade(pressed)]}>
          <Text style={styles.footerSecondaryText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onPrimary} style={({ pressed }) => [styles.footerPrimary, pressFade(pressed)]}>
        <Text style={styles.footerPrimaryText}>{primaryLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.sm,
    backgroundColor: colors.card,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.semibold },
  hero: {
    marginHorizontal: layout.containerMargin,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codeChip: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  codeText: { ...typography.label, color: colors.onSurfaceVariant, fontFamily: fonts.medium },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { ...typography.label, fontFamily: fonts.semibold },
  companyName: { ...typography.headline, color: colors.onSurface, fontFamily: fonts.semibold },
  machineLine: { ...typography.bodySm, color: colors.onSurfaceVariant },
  progressWrap: { marginTop: spacing.xs },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressLabel: { ...typography.label, color: colors.onSurfaceVariant },
  progressPct: { ...typography.label, fontFamily: fonts.semibold, color: colors.primary },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceContainerHigh, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  techAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  techInitials: { ...typography.label, fontFamily: fonts.bold, color: colors.primary },
  techMeta: { flex: 1 },
  techLabel: { ...typography.label, color: colors.onSurfaceVariant, textTransform: 'uppercase' },
  techName: { ...typography.body, fontFamily: fonts.semibold, color: colors.onSurface },
  tabsScroll: { marginTop: spacing.md },
  tabsRow: { paddingHorizontal: layout.containerMargin, gap: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  tab: { paddingBottom: spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.label, color: colors.onSurfaceVariant, fontFamily: fonts.medium },
  tabTextActive: { color: colors.primary, fontFamily: fonts.semibold },
  panelGap: { gap: spacing.md },
  panelTitle: { ...typography.headlineMd, color: colors.onSurface, fontFamily: fonts.semibold, marginBottom: spacing.sm },
  timeline: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  timelineItemBorder: { borderBottomWidth: 0 },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    marginTop: 4,
  },
  timelineDotDone: { backgroundColor: '#137333', borderColor: '#137333' },
  timelineDotCurrent: { borderColor: '#f59e0b', backgroundColor: '#f59e0b' },
  timelineLabel: { ...typography.body, color: colors.onSurface },
  timelineLabelCurrent: { color: colors.primary, fontFamily: fonts.semibold },
  timelineDate: { ...typography.label, color: colors.onSurfaceVariant },
  statsCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    gap: spacing.md,
  },
  statCell: { width: '47%' },
  statLabel: { ...typography.label, color: colors.onSurfaceVariant },
  statValue: { ...typography.body, fontFamily: fonts.semibold, color: colors.onSurface, marginTop: 2 },
  statValueAccent: { color: '#137333' },
  notesCard: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card },
  notesText: { ...typography.body, color: colors.onSurface },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  footerPrimary: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerPrimaryText: { ...typography.label, color: '#fff', fontFamily: fonts.semibold },
  footerSecondary: {
    flex: 1,
    borderRadius: radius.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  footerSecondaryText: { ...typography.label, color: colors.primary, fontFamily: fonts.semibold },
});
