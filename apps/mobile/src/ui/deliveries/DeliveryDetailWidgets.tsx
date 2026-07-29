import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deliveryCompanyName,
  deliveryFormData,
  deliveryFormNo,
  deliveryMachineMeta,
  deliverySignedBy,
  deliveryStatusBadgeStyle,
  deliveryStatusLabel,
  formatDeliveryDate,
} from '@/src/ui/deliveries/deliveryHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export type DeliveryDetailTab = 'ozet' | 'tezgah' | 'pdf';

export const DELIVERY_DETAIL_TABS: { key: DeliveryDetailTab; label: string }[] = [
  { key: 'ozet', label: 'Özet' },
  { key: 'tezgah', label: 'Tezgah & CNC' },
  { key: 'pdf', label: 'Tutanak' },
];

export function DeliveryDetailHeader({
  onBack,
  onMore,
}: {
  onBack: () => void;
  onMore?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text style={styles.headerTitle}>Kurulum Tutanağı</Text>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.primary} />
        </Pressable>
      ) : (
        <View style={styles.headerBtn} />
      )}
    </View>
  );
}

export function DeliveryHeroCard({ data }: { data: Record<string, unknown> }) {
  const badge = deliveryStatusBadgeStyle(data);
  const fd = deliveryFormData(data);

  return (
    <View style={[styles.hero, shadowCard]}>
      <View style={styles.heroTop}>
        <View style={styles.formNoChip}>
          <Text style={styles.formNoText}>{deliveryFormNo(data)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: badge.accent }]} />
          <Text style={[styles.statusText, { color: badge.fg }]}>{deliveryStatusLabel(data)}</Text>
        </View>
      </View>
      <Text style={styles.companyName}>{deliveryCompanyName(data)}</Text>
      {deliveryMachineMeta(data) ? (
        <Text style={styles.machineMeta}>{deliveryMachineMeta(data)}</Text>
      ) : null}
      <View style={styles.heroStats}>
        <HeroStat label="Teslim Tarihi" value={formatDeliveryDate(data)} />
        <View style={styles.heroDivider} />
        <HeroStat label="Kurulum Tarihi" value={fd.kurulumTarihi ? formatDeliveryDate({ deliveryDate: fd.kurulumTarihi }) : '—'} />
        <View style={styles.heroDivider} />
        <HeroStat label="İmza" value={deliverySignedBy(data)} />
      </View>
    </View>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatLabel}>{label}</Text>
      <Text style={styles.heroStatValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function DeliveryDetailTabs({
  value,
  onChange,
}: {
  value: DeliveryDetailTab;
  onChange: (t: DeliveryDetailTab) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
      {DELIVERY_DETAIL_TABS.map((tab) => {
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

export function DeliveryInfoPanel({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.infoRow, shadowCard]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function DeliveryMachinePanel({ data }: { data: Record<string, unknown> }) {
  const fd = deliveryFormData(data);
  const tezgah = fd.tezgah ?? {};
  const cnc = fd.cnc ?? {};

  return (
    <View style={styles.panelGap}>
      <Text style={styles.panelTitle}>Tezgah Bilgileri</Text>
      <View style={[styles.panel, shadowCard]}>
        <FieldRow label="Marka" value={tezgah.marka} />
        <FieldRow label="Tip" value={tezgah.tip} />
        <FieldRow label="Model" value={tezgah.model} />
        <FieldRow label="Seri No" value={tezgah.seriNo} last />
      </View>
      <Text style={styles.panelTitle}>Kontrol Ünitesi (CNC)</Text>
      <View style={[styles.panel, shadowCard]}>
        <FieldRow label="Marka" value={cnc.marka} />
        <FieldRow label="Model" value={cnc.model} />
        <FieldRow label="Seri No" value={cnc.seriNo} />
        <FieldRow label="Main S/W" value={cnc.mainSw} last />
      </View>
      <Text style={styles.panelTitle}>Teknik Bilgiler</Text>
      <View style={[styles.panel, shadowCard]}>
        {fd.technicalSpecs?.length ? (
          fd.technicalSpecs.map((spec, index) => (
            <FieldRow
              key={`${spec.key}-${index}`}
              label={spec.key}
              value={spec.value}
              last={index === fd.technicalSpecs!.length - 1}
            />
          ))
        ) : (
          <FieldRow label="Teknik bilgi" value="—" last />
        )}
      </View>
    </View>
  );
}

function FieldRow({ label, value, last }: { label: string; value?: string; last?: boolean }) {
  return (
    <View style={[styles.fieldRow, !last && styles.fieldRowBorder]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value?.trim() || '—'}</Text>
    </View>
  );
}

export function DeliveryTutanakPreview({ data }: { data: Record<string, unknown> }) {
  const fd = deliveryFormData(data);
  const tezgah = fd.tezgah ?? {};
  const cnc = fd.cnc ?? {};

  return (
    <View style={[styles.tutanak, shadowCard]}>
      <Text style={styles.tutanakTitle}>DR.MAK Kurulum Tutanağı</Text>
      <Text style={styles.tutanakSub}>Form No: {deliveryFormNo(data)}</Text>
      <View style={styles.tutanakSection}>
        <Text style={styles.tutanakSectionTitle}>Müşteri</Text>
        <Text style={styles.tutanakLine}>{deliveryCompanyName(data)}</Text>
        <Text style={styles.tutanakLine}>İlgili: {fd.ilgili || '—'}</Text>
      </View>
      <View style={styles.tutanakSection}>
        <Text style={styles.tutanakSectionTitle}>Tezgah</Text>
        <Text style={styles.tutanakLine}>
          {[tezgah.marka, tezgah.tip, tezgah.model].filter(Boolean).join(' · ') || '—'}
        </Text>
        <Text style={styles.tutanakLine}>Seri: {tezgah.seriNo || '—'}</Text>
      </View>
      <View style={styles.tutanakSection}>
        <Text style={styles.tutanakSectionTitle}>CNC</Text>
        <Text style={styles.tutanakLine}>
          {[cnc.marka, cnc.model].filter(Boolean).join(' ') || '—'}
        </Text>
        <Text style={styles.tutanakLine}>Seri: {cnc.seriNo || '—'}</Text>
      </View>
      <View style={styles.tutanakFooter}>
        <Text style={styles.tutanakLine}>Teslim: {formatDeliveryDate(data)}</Text>
        <Text style={styles.tutanakLine}>Kurulum: {fd.kurulumTarihi ? formatDeliveryDate({ deliveryDate: fd.kurulumTarihi }) : '—'}</Text>
        <Text style={styles.tutanakLine}>Kurulumu yapan: {fd.kurulumuYapan || '—'}</Text>
        <Text style={styles.tutanakLine}>Teslim alan: {deliverySignedBy(data)}</Text>
      </View>
    </View>
  );
}

export function DeliveryDetailFooter({
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  loading,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  loading?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }, shadowCard]}>
      {secondaryLabel && onSecondary ? (
        <Pressable
          onPress={onSecondary}
          disabled={loading}
          style={({ pressed }) => [styles.footerSecondary, pressFade(pressed)]}
        >
          <Text style={styles.footerSecondaryText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onPrimary}
        disabled={loading}
        style={({ pressed }) => [styles.footerPrimary, pressFade(pressed), loading && styles.footerDisabled]}
      >
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
  formNoChip: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  formNoText: { ...typography.label, color: colors.onSurfaceVariant, fontFamily: fonts.medium },
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
  machineMeta: { ...typography.bodySm, color: colors.onSurfaceVariant },
  heroStats: { flexDirection: 'row', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatLabel: { ...typography.label, color: colors.onSurfaceVariant },
  heroStatValue: { ...typography.bodySm, fontFamily: fonts.semibold, color: colors.onSurface, marginTop: 2 },
  heroDivider: { width: 1, backgroundColor: colors.outlineVariant, marginVertical: 4 },
  tabsScroll: { marginTop: spacing.md },
  tabsRow: { paddingHorizontal: layout.containerMargin, gap: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  tab: { paddingBottom: spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...typography.label, color: colors.onSurfaceVariant, fontFamily: fonts.medium },
  tabTextActive: { color: colors.primary, fontFamily: fonts.semibold },
  infoRow: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
  },
  infoLabel: { ...typography.label, color: colors.onSurfaceVariant, marginBottom: 4 },
  infoValue: { ...typography.body, color: colors.onSurface },
  panelGap: { gap: spacing.sm },
  panelTitle: { ...typography.label, color: colors.onSurfaceVariant, fontFamily: fonts.semibold, marginLeft: 4 },
  panel: { borderRadius: radius.lg, backgroundColor: colors.card, overflow: 'hidden' },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md, gap: spacing.md },
  fieldRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  fieldLabel: { ...typography.bodySm, color: colors.onSurfaceVariant, flex: 1 },
  fieldValue: { ...typography.bodySm, color: colors.onSurface, fontFamily: fonts.medium, flex: 1, textAlign: 'right' },
  tutanak: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  tutanakTitle: { ...typography.headlineMd, textAlign: 'center', fontFamily: fonts.bold, color: colors.primary },
  tutanakSub: { ...typography.label, textAlign: 'center', color: colors.onSurfaceVariant, marginBottom: spacing.md },
  tutanakSection: { marginBottom: spacing.md },
  tutanakSectionTitle: { ...typography.label, fontFamily: fonts.bold, color: colors.onSurface, marginBottom: 4 },
  tutanakLine: { ...typography.bodySm, color: colors.onSurface },
  tutanakFooter: { borderTopWidth: 1, borderTopColor: colors.outlineVariant, paddingTop: spacing.md, gap: 4 },
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
  footerDisabled: { opacity: 0.6 },
});
