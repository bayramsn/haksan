import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

type EventTone = 'visit' | 'meeting' | 'service' | 'call' | 'default';

const EVENT_TONES: Record<EventTone, { bg: string; fg: string; label: string }> = {
  visit: { bg: colors.secondaryContainer, fg: colors.onSecondaryContainer, label: 'Ziyaret' },
  meeting: { bg: colors.primary, fg: '#fff', label: 'Toplantı' },
  service: { bg: colors.surfaceVariant, fg: colors.onSurfaceVariant, label: 'Servis' },
  call: { bg: colors.surfaceContainerHigh, fg: colors.onSurfaceVariant, label: 'Arama' },
  default: { bg: colors.surfaceContainerHigh, fg: colors.onSurfaceVariant, label: 'Etkinlik' },
};

export function eventToneFromType(type?: string | null): EventTone {
  const t = String(type ?? '').toLowerCase();
  if (t.includes('visit') || t.includes('ziyaret') || t === 'customer_visit') return 'visit';
  if (t.includes('meeting') || t.includes('toplant')) return 'meeting';
  if (t.includes('service') || t.includes('servis')) return 'service';
  if (t.includes('call') || t.includes('arama')) return 'call';
  return 'default';
}

export function CalendarEventDetailHeader({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.backBtn, pressFade(pressed)]}>
        <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle}>Etkinlik Detayı</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

export function CalendarEventHeroCard({
  timeRange,
  title,
  companyName,
  location,
  eventType,
}: {
  timeRange: string;
  title: string;
  companyName?: string;
  location?: string;
  eventType?: string | null;
}) {
  const tone = eventToneFromType(eventType);
  const badge = EVENT_TONES[tone];
  const typeLabel = tone === 'default' && eventType ? String(eventType) : badge.label;

  return (
    <View style={[styles.heroCard, shadowCard]}>
      <Text style={styles.heroTime}>{timeRange}</Text>
      <Text style={styles.heroTitle}>{title}</Text>
      {companyName ? (
        <View style={styles.heroMetaRow}>
          <Ionicons name="business-outline" size={16} color={colors.secondary} />
          <Text style={styles.heroMetaText}>{companyName}</Text>
        </View>
      ) : null}
      {location ? (
        <View style={styles.heroMetaRow}>
          <Ionicons name="location-outline" size={16} color={colors.secondary} />
          <Text style={styles.heroMetaText}>{location}</Text>
        </View>
      ) : null}
      <View style={[styles.typePill, { backgroundColor: badge.bg }]}>
        <Text style={[styles.typePillText, { color: badge.fg }]}>{typeLabel}</Text>
      </View>
    </View>
  );
}

export function CalendarEventQuickActions({
  phone,
  location,
  companyId,
  onCompanyPress,
}: {
  phone?: string;
  location?: string;
  companyId?: string | null;
  onCompanyPress?: () => void;
}) {
  const call = () => {
    if (!phone) return;
    void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  };
  const directions = () => {
    if (!location) return;
    void Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(location)}`);
  };

  return (
    <View style={styles.quickRow}>
      <QuickActionBtn icon="call-outline" label="Ara" disabled={!phone} onPress={call} />
      <QuickActionBtn icon="navigate-outline" label="Yol Tarifi" disabled={!location} onPress={directions} />
      <QuickActionBtn icon="business-outline" label="Firma" disabled={!companyId} onPress={onCompanyPress} />
    </View>
  );
}

function QuickActionBtn({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.quickBtn, disabled && styles.quickBtnDisabled, pressFade(pressed)]}
    >
      <Ionicons name={icon} size={20} color={disabled ? colors.outline : colors.primary} />
      <Text style={[styles.quickBtnText, disabled && styles.quickBtnTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function CalendarEventDetailsCard({
  ownerName,
  contactName,
  notes,
}: {
  ownerName?: string;
  contactName?: string;
  notes?: string;
}) {
  return (
    <View style={[styles.detailsCard, shadowCard]}>
      <Text style={styles.detailsTitle}>Detaylar</Text>
      {ownerName ? <DetailRow icon="person-outline" label="Temsilci" value={ownerName} /> : null}
      {contactName ? <DetailRow icon="people-outline" label="Kontak" value={contactName} /> : null}
      {notes ? (
        <View style={styles.notesBlock}>
          <Text style={styles.notesLabel}>Notlar</Text>
          <Text style={styles.notesText}>{notes}</Text>
        </View>
      ) : null}
      {!ownerName && !contactName && !notes ? (
        <Text style={styles.emptyDetails}>Ek detay bulunmuyor</Text>
      ) : null}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={colors.secondary} />
      <View style={styles.detailRowText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

export function CalendarEventDetailFooter({
  onEdit,
  onOpenCalendar,
}: {
  onEdit: () => void;
  onOpenCalendar: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
      <Pressable onPress={onEdit} style={({ pressed }) => [styles.footerBtnSecondary, pressFade(pressed)]}>
        <Text style={styles.footerBtnSecondaryText}>Düzenle</Text>
      </Pressable>
      <Pressable onPress={onOpenCalendar} style={({ pressed }) => [styles.footerBtnPrimary, pressFade(pressed)]}>
        <Ionicons name="calendar-outline" size={18} color="#fff" />
        <Text style={styles.footerBtnPrimaryText}>Takvimde Aç</Text>
      </Pressable>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceVariant,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.headlineMd, fontFamily: fonts.bold, color: colors.stitchPrimary, flex: 1, textAlign: 'center' },
  headerSpacer: { width: 40 },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(198, 197, 211, 0.3)',
  },
  heroTime: {
    ...typography.caption,
    fontFamily: fonts.bold,
    color: colors.primary,
    letterSpacing: 0.4,
  },
  heroTitle: { ...typography.headline, color: colors.textPrimary },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroMetaText: { ...typography.bodySm, color: colors.secondary, flex: 1 },
  typePill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  typePillText: { ...typography.caption, fontFamily: fonts.semibold },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(198, 197, 211, 0.3)',
    minHeight: layout.touchMin,
    justifyContent: 'center',
  },
  quickBtnDisabled: { opacity: 0.45 },
  quickBtnText: { ...typography.caption, fontFamily: fonts.semibold, color: colors.primary },
  quickBtnTextDisabled: { color: colors.outline },
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(198, 197, 211, 0.3)',
  },
  detailsTitle: { ...typography.headlineMd, color: colors.textPrimary },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  detailRowText: { flex: 1, gap: 2 },
  detailLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  detailValue: { ...typography.body, color: colors.textPrimary },
  notesBlock: { gap: spacing.xs, marginTop: spacing.xs },
  notesLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  notesText: { ...typography.bodySm, color: colors.secondary, lineHeight: 22 },
  emptyDetails: { ...typography.bodySm, color: colors.secondary },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
    backgroundColor: colors.canvas,
  },
  footerBtnSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.touchMin,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.card,
  },
  footerBtnSecondaryText: { ...typography.bodySm, fontFamily: fonts.semibold, color: colors.textPrimary },
  footerBtnPrimary: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: layout.touchMin,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  footerBtnPrimaryText: { ...typography.bodySm, fontFamily: fonts.bold, color: '#fff' },
});
