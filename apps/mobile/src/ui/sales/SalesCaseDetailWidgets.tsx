import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatSalesAmount,
  probabilityFromRow,
  SALES_PIPELINE_STEPS,
  stageNameFromRow,
  stageVisualFromRow,
  type SalesCaseDetailTab,
} from '@/src/ui/sales/salesCaseDetailHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export const SALES_DETAIL_TABS: { key: SalesCaseDetailTab; label: string }[] = [
  { key: 'ozet', label: 'Özet' },
  { key: 'aktivite', label: 'Aktivite' },
  { key: 'dokumanlar', label: 'Dokümanlar' },
  { key: 'urunler', label: 'Ürünler' },
  { key: 'notlar', label: 'Notlar' },
];

export function SalesCaseDetailHeader({
  title,
  onBack,
  onShare,
  onMore,
}: {
  title: string;
  onBack: () => void;
  onShare?: () => void;
  onMore?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerActions}>
        {onShare ? (
          <Pressable onPress={onShare} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
            <Ionicons name="share-outline" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
        {onMore ? (
          <Pressable onPress={onMore} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
            <Ionicons name="ellipsis-vertical" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function SalesCaseHeroCard({
  data,
  productLine,
  onCompanyPress,
}: {
  data: Record<string, unknown>;
  productLine: string;
  onCompanyPress?: () => void;
}) {
  const visual = stageVisualFromRow(data);
  const probability = probabilityFromRow(data);
  const stageLabel = stageNameFromRow(data);

  return (
    <View style={[styles.heroCard, shadowCard]}>
      <Pressable onPress={onCompanyPress} style={styles.companyRow} disabled={!onCompanyPress}>
        <Text style={styles.companyName} numberOfLines={2}>
          {String((data.company as Record<string, unknown> | undefined)?.legalTitle ?? (data.company as Record<string, unknown> | undefined)?.shortName ?? '—')}
        </Text>
        {onCompanyPress ? <Ionicons name="chevron-forward" size={18} color={colors.outline} /> : null}
      </Pressable>
      <Text style={styles.productLine} numberOfLines={2}>
        {productLine}
      </Text>
      <View style={styles.amountRow}>
        <Text style={styles.amount}>{formatSalesAmount(data)}</Text>
        <View style={[styles.stagePill, { backgroundColor: visual.badgeBg }]}>
          <Text style={[styles.stagePillText, { color: visual.badgeText }]}>{stageLabel}</Text>
        </View>
      </View>
      <View style={styles.probabilityWrap}>
        <View style={styles.probabilityLabels}>
          <Text style={styles.probabilityLabel}>Kazanma Olasılığı</Text>
          <Text style={styles.probabilityValue}>%{probability}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${probability}%` }]} />
        </View>
      </View>
    </View>
  );
}

type ActionItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  filled?: boolean;
  muted?: boolean;
  onPress: () => void;
};

export function SalesCaseActionRibbon({ actions }: { actions: ActionItem[] }) {
  return (
    <View style={[styles.actionRibbon, shadowCard]}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={action.onPress}
          style={({ pressed }) => [styles.actionItem, pressFade(pressed)]}
        >
          <View
            style={[
              styles.actionIconWrap,
              action.muted ? styles.actionIconMuted : styles.actionIconPrimary,
            ]}
          >
            <Ionicons
              name={action.icon}
              size={22}
              color={action.muted ? colors.secondary : colors.onPrimaryContainer}
            />
          </View>
          <Text style={styles.actionLabel}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SalesCasePipelineStepper({
  activeIndex,
  cancelled,
}: {
  activeIndex: number;
  cancelled?: boolean;
}) {
  if (cancelled) {
    return (
      <View style={[styles.pipelineCard, shadowCard]}>
        <View style={styles.lostBadge}>
          <Ionicons name="close-circle" size={16} color={colors.error} />
          <Text style={styles.lostBadgeText}>Kaybedildi</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pipelineRow}
      style={[styles.pipelineCard, shadowCard]}
    >
      {SALES_PIPELINE_STEPS.map((step, idx) => {
        const done = idx < activeIndex;
        const active = idx === activeIndex;
        return (
          <View key={step.key} style={styles.pipelineSegment}>
            <View
              style={[
                styles.pipelineChip,
                done && styles.pipelineChipDone,
                active && styles.pipelineChipActive,
              ]}
            >
              {done ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : active ? (
                <View style={styles.pipelineDot} />
              ) : null}
              <Text
                style={[
                  styles.pipelineChipText,
                  (done || active) && styles.pipelineChipTextActive,
                ]}
              >
                {step.label}
              </Text>
            </View>
            {idx < SALES_PIPELINE_STEPS.length - 1 ? (
              <View style={[styles.pipelineLine, done && styles.pipelineLineDone]} />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

export function SalesCaseDetailTabs({
  value,
  onChange,
}: {
  value: SalesCaseDetailTab;
  onChange: (tab: SalesCaseDetailTab) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
      {SALES_DETAIL_TABS.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={styles.tabBtn}>
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            {active ? <View style={styles.tabUnderline} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SalesCaseRepCard({
  name,
  initials,
  onChange,
}: {
  name: string;
  initials: string;
  onChange?: () => void;
}) {
  return (
    <View style={[styles.repCard, shadowCard]}>
      <View style={styles.repLeft}>
        <View style={styles.repAvatar}>
          <Text style={styles.repAvatarText}>{initials}</Text>
        </View>
        <View>
          <Text style={styles.repLabel}>Satış Temsilcisi</Text>
          <Text style={styles.repName}>{name}</Text>
        </View>
      </View>
      {onChange ? (
        <Pressable onPress={onChange} hitSlop={8}>
          <Text style={styles.repChange}>Değiştir</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SalesCaseInfoTile({
  icon,
  label,
  value,
  hint,
  hintDanger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  hint?: string;
  hintDanger?: boolean;
}) {
  return (
    <View style={[styles.infoTile, shadowCard]}>
      <View style={styles.infoTileLabelRow}>
        <Ionicons name={icon} size={14} color={colors.onSurfaceVariant} />
        <Text style={styles.infoTileLabel}>{label}</Text>
      </View>
      <Text style={styles.infoTileValue}>{value}</Text>
      {hint ? (
        <Text style={[styles.infoTileHint, hintDanger && styles.infoTileHintDanger]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function SalesCaseMetaCard({
  priorityLabel,
  tags,
}: {
  priorityLabel?: string;
  tags?: string[];
}) {
  return (
    <View style={[styles.metaCard, shadowCard]}>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Öncelik</Text>
        <View style={styles.priorityRow}>
          <View style={styles.priorityDot} />
          <Text style={styles.priorityValue}>{priorityLabel ?? 'Normal'}</Text>
        </View>
      </View>
      {tags?.length ? (
        <View style={styles.tagsSection}>
          <Text style={styles.metaLabel}>Etiketler</Text>
          <View style={styles.tagsRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function SalesCaseActivityTimeline({
  items,
  onShowAll,
}: {
  items: Record<string, unknown>[];
  onShowAll?: () => void;
}) {
  return (
    <View style={[styles.activityCard, shadowCard]}>
      <Text style={styles.sectionTitle}>Son Aktiviteler</Text>
      <View style={styles.timelineWrap}>
        <View style={styles.timelineLine} />
        {items.map((item, idx) => {
          const icon = String(item.activityTypeCode ?? 'note');
          const isFirst = idx === 0;
          return (
            <View key={String(item.id ?? idx)} style={styles.timelineItem}>
              <View style={[styles.timelineIcon, isFirst && styles.timelineIconActive]}>
                <Ionicons
                  name={
                    icon.includes('visit')
                      ? 'checkmark'
                      : icon.includes('call')
                        ? 'call'
                        : icon.includes('quote')
                          ? 'send'
                          : 'document-text-outline'
                  }
                  size={14}
                  color={isFirst ? colors.onPrimaryContainer : colors.secondary}
                />
              </View>
              <View style={[styles.timelineBody, idx < items.length - 1 && styles.timelineBodyBorder]}>
                <Text style={styles.timelineSubject}>{String(item.subject ?? 'Aktivite')}</Text>
                <View style={styles.timelineMeta}>
                  <Text style={styles.timelineMetaText}>{String(item.ownerName ?? '—')}</Text>
                  <Text style={styles.timelineMetaText}>
                    {formatActivityDateShort(item.activityDate ?? item.createdAt)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
      {onShowAll ? (
        <Pressable onPress={onShowAll} style={({ pressed }) => [styles.showAllBtn, pressFade(pressed)]}>
          <Text style={styles.showAllText}>Tümünü Gör</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function formatActivityDateShort(raw: unknown): string {
  if (!raw) return '—';
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export function SalesCaseDocumentRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.docRow, shadowCard, pressFade(pressed)]}
    >
      <Ionicons name="document-text-outline" size={22} color={colors.onPrimaryContainer} />
      <View style={styles.docBody}>
        <Text style={styles.docTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.docSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.outlineVariant} />
    </Pressable>
  );
}

export function SalesCaseProductCard({
  title,
  description,
  amount,
}: {
  title: string;
  description?: string;
  amount?: string;
}) {
  return (
    <View style={[styles.productCard, shadowCard]}>
      <Text style={styles.productTitle}>{title}</Text>
      {description ? <Text style={styles.productDesc}>{description}</Text> : null}
      {amount ? <Text style={styles.productAmount}>{amount}</Text> : null}
    </View>
  );
}

export function SalesCaseNotesCard({ notes }: { notes: string }) {
  return (
    <View style={[styles.notesCard, shadowCard]}>
      <Text style={styles.notesText}>{notes}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas,
    paddingHorizontal: layout.containerMargin,
    minHeight: 56,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.headlineMd,
    color: colors.primary,
    fontFamily: fonts.bold,
    marginHorizontal: spacing.sm,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  companyName: { flex: 1, ...typography.headlineMd, color: colors.textPrimary },
  productLine: { ...typography.bodySm, color: colors.onSurfaceVariant },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.xs },
  amount: { ...typography.display, fontSize: 26, lineHeight: 32, color: colors.primary, fontFamily: fonts.bold },
  stagePill: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  stagePillText: { ...typography.label, fontFamily: fonts.semibold },
  probabilityWrap: { marginTop: spacing.sm, gap: 6 },
  probabilityLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  probabilityLabel: { ...typography.label, color: colors.onSurfaceVariant },
  probabilityValue: { ...typography.label, color: colors.onPrimaryContainer, fontFamily: fonts.semibold },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerHighest,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill },
  actionRibbon: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  actionItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconPrimary: { backgroundColor: colors.secondaryContainer },
  actionIconMuted: { backgroundColor: colors.surfaceContainerHigh },
  actionLabel: { ...typography.label, color: colors.secondary, textAlign: 'center' },
  pipelineCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  pipelineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pipelineSegment: { flexDirection: 'row', alignItems: 'center' },
  pipelineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.surfaceVariant,
    backgroundColor: colors.card,
  },
  pipelineChipDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  pipelineChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.card,
    ...shadowCard,
  },
  pipelineChipText: { ...typography.caption, color: colors.onSurfaceVariant },
  pipelineChipTextActive: { color: colors.primary, fontFamily: fonts.bold },
  pipelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  pipelineLine: { width: 16, height: 1, backgroundColor: colors.surfaceVariant, marginHorizontal: 2 },
  pipelineLineDone: { backgroundColor: colors.primary },
  lostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: '#ffebee',
  },
  lostBadgeText: { ...typography.label, color: colors.error, fontFamily: fonts.semibold },
  tabRow: { gap: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.surfaceVariant, paddingBottom: spacing.xs },
  tabBtn: { paddingBottom: spacing.sm },
  tabText: { ...typography.label, color: colors.outline },
  tabTextActive: { color: colors.onPrimaryContainer, fontFamily: fonts.semibold },
  tabUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  repCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  repLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  repAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repAvatarText: { ...typography.headlineMd, color: colors.onPrimaryContainer, fontSize: 16 },
  repLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  repName: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.medium },
  repChange: { ...typography.caption, color: colors.onPrimaryContainer, textDecorationLine: 'underline' },
  infoTile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
    minWidth: '46%',
  },
  infoTileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoTileLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  infoTileValue: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.medium },
  infoTileHint: { ...typography.caption, color: colors.onSurfaceVariant },
  infoTileHintDanger: { color: colors.error },
  metaCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceVariant,
  },
  metaLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  priorityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priorityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error },
  priorityValue: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.medium },
  tagsSection: { gap: spacing.sm },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tagChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: colors.surfaceContainerLow,
  },
  tagText: { ...typography.label, color: colors.onSurfaceVariant },
  activityCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: { ...typography.headlineMd, color: colors.textPrimary, marginBottom: spacing.xs },
  timelineWrap: { position: 'relative', gap: 0 },
  timelineLine: {
    position: 'absolute',
    left: 15,
    top: 12,
    bottom: 12,
    width: 2,
    backgroundColor: colors.surfaceVariant,
  },
  timelineItem: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.surfaceVariant,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineIconActive: { borderColor: colors.primary },
  timelineBody: { flex: 1, gap: 4 },
  timelineBodyBorder: { borderBottomWidth: 1, borderBottomColor: colors.surfaceVariant, paddingBottom: spacing.sm },
  timelineSubject: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.medium },
  timelineMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  timelineMetaText: { ...typography.caption, color: colors.onSurfaceVariant },
  showAllBtn: { paddingVertical: spacing.sm, alignItems: 'center' },
  showAllText: { ...typography.label, color: colors.onPrimaryContainer },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  docBody: { flex: 1, gap: 2 },
  docTitle: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  docSubtitle: { ...typography.caption, color: colors.outline },
  productCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  productTitle: { ...typography.body, color: colors.textPrimary, fontFamily: fonts.semibold },
  productDesc: { ...typography.bodySm, color: colors.onSurfaceVariant },
  productAmount: { ...typography.headlineMd, color: colors.primary, marginTop: spacing.xs },
  notesCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  notesText: { ...typography.bodySm, color: colors.textPrimary, lineHeight: 22 },
});
