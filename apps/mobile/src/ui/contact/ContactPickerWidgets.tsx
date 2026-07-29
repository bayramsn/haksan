import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchBar } from '@/src/ui/SearchBar';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export type ContactRow = {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  workPhone?: string;
  mobilePhone?: string;
  workEmail?: string;
  personalEmail?: string;
};

export function contactDisplayName(c: ContactRow): string {
  return c.fullName ?? ([c.firstName, c.lastName].filter(Boolean).join(' ') || 'Kontak');
}

export function contactInitials(c: ContactRow): string {
  const name = contactDisplayName(c);
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  return (name[0] ?? 'K').toUpperCase();
}

export function contactPhone(c: ContactRow): string | undefined {
  return c.mobilePhone ?? c.workPhone ?? undefined;
}

export function contactEmail(c: ContactRow): string | undefined {
  return c.workEmail ?? c.personalEmail ?? undefined;
}

/** Stitch `a505fa251b334b55af483eb03c989090` — geri | başlık | kapat */
export function ContactPickerHeader({
  title = 'Kontak Seç',
  onBack,
  onClose,
}: {
  title?: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <View style={styles.handleWrap}>
        <View style={styles.handle} />
      </View>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
          <Ionicons name="close" size={24} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

export function ContactPickerSearch({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View style={styles.searchWrap}>
      <SearchBar value={value} onChangeText={onChangeText} placeholder="Kontak ara…" />
    </View>
  );
}

/** Firma bağlam çipi */
export function ContactCompanyChip({ companyName }: { companyName: string }) {
  return (
    <View style={styles.companyChip}>
      <Ionicons name="business-outline" size={14} color={colors.primary} />
      <Text style={styles.companyChipText} numberOfLines={1}>
        {companyName}
      </Text>
    </View>
  );
}

/** İlk satır — belirtilmedi */
export function ContactNoneCard({
  selected,
  onPress,
}: {
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.noneCard,
        selected && styles.cardSelected,
        pressFade(pressed),
      ]}
    >
      <View style={styles.noneAvatar}>
        <Ionicons name="person-outline" size={20} color={colors.outline} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.noneTitle}>Belirtilmedi</Text>
        <Text style={styles.noneSubtitle}>Kontak seçilmedi</Text>
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
    </Pressable>
  );
}

export function ContactPickerCard({
  contact,
  selected,
  onPress,
}: {
  contact: ContactRow;
  selected?: boolean;
  onPress: () => void;
}) {
  const name = contactDisplayName(contact);
  const role = contact.title?.trim();
  const phone = contactPhone(contact);
  const email = contactEmail(contact);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.contactCard,
        selected && styles.cardSelected,
        pressFade(pressed),
      ]}
    >
      <View style={styles.avatarRing}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{contactInitials(contact)}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.contactName} numberOfLines={1}>
          {name}
        </Text>
        {role ? <Text style={styles.contactRole}>{role}</Text> : null}
        {phone ? (
          <View style={styles.metaRow}>
            <Ionicons name="call-outline" size={13} color={colors.outline} />
            <Text style={styles.metaText}>{phone}</Text>
          </View>
        ) : null}
        {email ? (
          <View style={styles.metaRow}>
            <Ionicons name="mail-outline" size={13} color={colors.outline} />
            <Text style={styles.metaText} numberOfLines={1}>
              {email}
            </Text>
          </View>
        ) : null}
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
    </Pressable>
  );
}

export function ContactPickerFooter({
  onAddContact,
}: {
  onAddContact: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <Pressable
        onPress={onAddContact}
        style={({ pressed }) => [styles.addBtn, pressFade(pressed)]}
      >
        <Ionicons name="add" size={20} color={colors.primary} />
        <Text style={styles.addBtnText}>Yeni Kontak Ekle</Text>
      </Pressable>
    </View>
  );
}

const primaryFixed = '#dfe0ff';

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.canvas,
    paddingBottom: spacing.sm,
  },
  handleWrap: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.outlineVariant,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.containerMargin,
    minHeight: 48,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.headlineMd,
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  searchWrap: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  companyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginHorizontal: layout.containerMargin,
    marginBottom: spacing.md,
    backgroundColor: primaryFixed,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: '92%',
  },
  companyChipText: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: fonts.semibold,
    flexShrink: 1,
  },
  noneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    padding: spacing.md,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
  },
  cardSelected: {
    borderColor: colors.primary,
    borderLeftWidth: 3,
    backgroundColor: '#f8f9ff',
  },
  noneAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    padding: 2,
    borderRadius: 999,
    backgroundColor: primaryFixed,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.label,
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  cardBody: { flex: 1, gap: 2 },
  noneTitle: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  noneSubtitle: { ...typography.caption, color: colors.outline },
  contactName: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  contactRole: { ...typography.caption, color: colors.outline, marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { ...typography.caption, color: colors.onSurfaceVariant, flex: 1 },
  footer: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.sm,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  addBtnText: { ...typography.label, color: colors.primary, fontFamily: fonts.semibold },
});
