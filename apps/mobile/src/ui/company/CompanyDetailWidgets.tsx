import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HaksanLogo } from '@/src/ui/HaksanLogo';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

const cardBase: ViewStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  ...shadowCard,
};

/** Stitch `ef134630` — geri | logo + kısa başlık | menü */
export function CompanyDetailHeaderBar({
  title,
  onMore,
}: {
  title: string;
  onMore?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top }, shadowCard]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.headerIcon, pressFade(pressed)]}
          accessibilityLabel="Geri"
        >
          <Ionicons name="arrow-back" size={20} color={colors.stitchPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <HaksanLogo height={24} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Pressable
          onPress={onMore}
          hitSlop={8}
          style={({ pressed }) => [styles.headerIcon, pressFade(pressed)]}
          accessibilityLabel="Menü"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.outline} />
        </Pressable>
      </View>
    </View>
  );
}

/** Hero — düz bölüm: başlık + AKTİF rozeti + meta satırı */
export function CompanyHeroSection({
  legalTitle,
  statusLabel,
  location,
  taxNumber,
  sector,
}: {
  legalTitle: string;
  statusLabel: string;
  location?: string;
  taxNumber?: string;
  sector?: string;
}) {
  return (
    <View style={styles.heroSection}>
      <View style={styles.heroTitleRow}>
        <Text style={styles.heroTitle}>{legalTitle}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{statusLabel.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        {location ? (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={16} color={colors.secondary} />
            <Text style={styles.metaText}>{location}</Text>
          </View>
        ) : null}
        {taxNumber ? (
          <View style={styles.metaItem}>
            <Ionicons name="receipt-outline" size={16} color={colors.secondary} />
            <Text style={styles.metaText}>Vergi No: {taxNumber}</Text>
          </View>
        ) : null}
        {sector ? (
          <View style={styles.metaItem}>
            <Ionicons name="construct-outline" size={16} color={colors.secondary} />
            <Text style={styles.metaText}>Sektör: {sector}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function CompanyQuickActionFlat({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickFlat, pressFade(pressed)]}>
      <Ionicons name={icon} size={22} color={colors.stitchPrimary} />
      <Text style={styles.quickFlatLabel}>{label}</Text>
    </Pressable>
  );
}

export function CompanyQuickActionFlatRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.quickFlatRow}>{children}</View>;
}

type ContactRow = { icon: keyof typeof Ionicons.glyphMap; label: string; value: string };

export function ContactInfoCard({ rows }: { rows: ContactRow[] }) {
  if (!rows.length) return null;
  return (
    <View style={styles.contactCard}>
      <Text style={styles.sectionTitle}>İletişim Bilgileri</Text>
      {rows.map((row, i) => (
        <View key={row.label}>
          {i > 0 ? <View style={styles.divider} /> : null}
          <View style={styles.contactRow}>
            <Ionicons name={row.icon} size={20} color={colors.outline} style={styles.contactIcon} />
            <View style={styles.contactBody}>
              <Text style={styles.contactLabel}>{row.label}</Text>
              <Text style={styles.contactValue}>{row.value}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export function RecentActivitiesCard({
  items,
  onViewAll,
}: {
  items: { title: string; dateLabel: string; description?: string; active?: boolean }[];
  onViewAll?: () => void;
}) {
  return (
    <View style={styles.contactCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Son Aktiviteler</Text>
        {onViewAll ? (
          <Pressable onPress={onViewAll} hitSlop={8}>
            <Text style={styles.linkText}>Tümü</Text>
          </Pressable>
        ) : null}
      </View>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>Henüz aktivite yok</Text>
      ) : (
        <View style={styles.timeline}>
          {items.map((item, i) => (
            <View key={`${item.title}-${i}`} style={styles.timelineItem}>
              <View style={[styles.timelineDot, item.active && styles.timelineDotActive]} />
              <View style={styles.timelineContent}>
                <View style={styles.timelineHeader}>
                  <Text style={styles.timelineTitle}>{item.title}</Text>
                  <Text style={styles.timelineDate}>{item.dateLabel}</Text>
                </View>
                {item.description ? <Text style={styles.timelineDesc}>{item.description}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function RepresentativeCard({
  name,
  onChat,
}: {
  name: string;
  onChat?: () => void;
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View style={[styles.contactCard, styles.repCard]}>
      <View style={styles.repLeft}>
        <View style={styles.repAvatar}>
          <Text style={styles.repAvatarText}>{initial}</Text>
        </View>
        <View>
          <Text style={styles.repLabel}>Müşteri Temsilcisi</Text>
          <Text style={styles.repName}>{name}</Text>
        </View>
      </View>
      {onChat ? (
        <Pressable onPress={onChat} style={({ pressed }) => [styles.repChatBtn, pressFade(pressed)]}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.stitchPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function NotesCard({ notes }: { notes: string }) {
  if (!notes.trim()) {
    return (
      <View style={styles.contactCard}>
        <Text style={styles.sectionTitle}>Notlar</Text>
        <Text style={styles.emptyText}>Not eklenmemiş</Text>
      </View>
    );
  }
  return (
    <View style={styles.contactCard}>
      <Text style={styles.sectionTitle}>Notlar</Text>
      <Text style={styles.notesBody}>{notes}</Text>
    </View>
  );
}

export function statusLabelFromCompany(data: Record<string, unknown>): string {
  const status = data.customerStatus as Record<string, unknown> | undefined;
  if (status?.name) return String(status.name);
  const code = String(status?.code ?? '').toLowerCase();
  if (code === 'active') return 'Aktif';
  if (code === 'passive') return 'Pasif';
  if (code === 'potential') return 'Potansiyel';
  if (code === 'blacklist') return 'Kara Liste';
  return 'Aktif';
}

export function locationFromCompany(data: Record<string, unknown>): string | undefined {
  const addr = data.primaryAddress as Record<string, unknown> | undefined;
  if (addr?.province) return String(addr.province);
  const addresses = data.addresses as Record<string, unknown>[] | undefined;
  const first = addresses?.find((a) => a.isDefault) ?? addresses?.[0];
  if (first?.province) return String(first.province);
  return undefined;
}

export function addressFromCompany(data: Record<string, unknown>): string | undefined {
  const addr = data.primaryAddress as Record<string, unknown> | undefined;
  if (addr?.fullAddress) return String(addr.fullAddress);
  const addresses = data.addresses as Record<string, unknown>[] | undefined;
  const first = addresses?.find((a) => a.isDefault) ?? addresses?.[0];
  if (first?.fullAddress) return String(first.fullAddress);
  const parts = [first?.street, first?.district, first?.province].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return undefined;
}

const styles = StyleSheet.create({
  headerWrap: { backgroundColor: colors.card },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
  },
  headerIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  headerTitle: {
    ...typography.headlineMd,
    fontFamily: fonts.bold,
    color: colors.stitchPrimary,
    maxWidth: 160,
  },
  heroSection: { gap: spacing.md },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroTitle: {
    ...typography.headline,
    color: colors.stitchPrimary,
    flex: 1,
  },
  statusPill: {
    backgroundColor: colors.statusActiveBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    marginTop: spacing.xs,
  },
  statusPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.semibold,
    color: colors.statusActiveText,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.bodySm, color: colors.secondary },
  quickFlatRow: { flexDirection: 'row', gap: spacing.sm },
  quickFlat: {
    flex: 1,
    ...cardBase,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  quickFlatLabel: {
    ...typography.label,
    color: colors.stitchPrimary,
  },
  contactCard: {
    ...cardBase,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typography.headlineMd,
    color: colors.stitchPrimary,
  },
  linkText: {
    ...typography.label,
    color: colors.stitchPrimary,
  },
  contactRow: { flexDirection: 'row', gap: spacing.md },
  contactIcon: { marginTop: 2 },
  contactBody: { flex: 1, gap: spacing.xs },
  contactLabel: { ...typography.label, color: colors.secondary },
  contactValue: { ...typography.bodySm, color: colors.textPrimary },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceContainerHighest,
    marginVertical: spacing.sm,
  },
  timeline: {
    marginLeft: spacing.sm,
    paddingLeft: spacing.lg,
    borderLeftWidth: 2,
    borderLeftColor: colors.surfaceContainerHigh,
    gap: spacing.lg,
  },
  timelineItem: { position: 'relative' },
  timelineDot: {
    position: 'absolute',
    left: -25,
    top: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 4,
    borderColor: colors.card,
  },
  timelineDotActive: { backgroundColor: colors.primary },
  timelineContent: { gap: spacing.xs },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  timelineTitle: {
    ...typography.bodySm,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    flex: 1,
  },
  timelineDate: { ...typography.label, color: colors.secondary },
  timelineDesc: { ...typography.bodySm, color: colors.secondary },
  emptyText: { ...typography.bodySm, color: colors.secondary },
  repCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  repLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  repAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repAvatarText: {
    ...typography.headlineMd,
    color: colors.onPrimaryContainer,
  },
  repLabel: { ...typography.label, color: colors.secondary, marginBottom: 4 },
  repName: { ...typography.body, fontFamily: fonts.medium, color: colors.textPrimary },
  repChatBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesBody: { ...typography.bodySm, color: colors.textPrimary, lineHeight: 22 },
});
