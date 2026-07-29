import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';
import { canSeeModule, getModule, type NavKey } from '@/src/navigation/modules';

type IonIcon = ComponentProps<typeof Ionicons>['name'];

export type MoreMenuItem = {
  key: NavKey;
  label: string;
  icon: IonIcon;
  adminBadge?: boolean;
};

export type MoreMenuSection = {
  title: string;
  items: MoreMenuItem[];
};

/** Stitch `8f6629c4` — menü grupları */
export const MORE_MENU_SECTIONS: MoreMenuSection[] = [
  {
    title: 'Satış',
    items: [
      { key: 'customers', label: 'Firmalar', icon: 'business-outline' },
      { key: 'contacts', label: 'Kontaklar', icon: 'people-outline' },
      { key: 'sales-cases', label: 'Satış Kartları', icon: 'pricetag-outline' },
      { key: 'offers', label: 'Teklifler', icon: 'document-text-outline' },
      { key: 'documents', label: 'Dokümanlar', icon: 'document-outline' },
    ],
  },
  {
    title: 'Operasyon',
    items: [
      { key: 'stock', label: 'Stok', icon: 'layers-outline' },
      { key: 'payments', label: 'Ödemeler', icon: 'card-outline' },
      { key: 'due-dates', label: 'Vade Takibi', icon: 'time-outline' },
      { key: 'products', label: 'Ürünler', icon: 'cube-outline' },
      { key: 'purchase-orders', label: 'Satın Alma', icon: 'cart-outline' },
      { key: 'shipments', label: 'Sevkiyat', icon: 'airplane-outline' },
    ],
  },
  {
    title: 'Servis',
    items: [
      { key: 'service-requests', label: 'Servis Talepleri', icon: 'medkit-outline' },
      { key: 'machines', label: 'Makineler', icon: 'hardware-chip-outline' },
      { key: 'service-kanban', label: 'Servis Kanban', icon: 'albums-outline' },
    ],
  },
  {
    title: 'Genel',
    items: [
      { key: 'calendar', label: 'Takvim', icon: 'calendar-outline' },
      { key: 'chat', label: 'Sohbet', icon: 'chatbubbles-outline' },
      { key: 'notifications', label: 'Bildirimler', icon: 'notifications-outline' },
      { key: 'users', label: 'Kullanıcılar', icon: 'people-outline', adminBadge: true },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Sistem Yöneticisi',
  admin: 'Yönetici',
  sales: 'Satış Müdürü',
  service: 'Servis Müdürü',
  finance: 'Finans Müdürü',
  stock: 'Stok Sorumlusu',
};

export function roleSubtitle(roles: string[] | undefined): string {
  if (!roles?.length) return 'Kullanıcı';
  for (const code of ['super_admin', 'admin', 'sales', 'service', 'finance', 'stock']) {
    if (roles.includes(code)) return ROLE_LABELS[code] ?? code;
  }
  return 'Kullanıcı';
}

export function filterMoreSections(
  sections: MoreMenuSection[],
  hasRole: (code: string) => boolean
): MoreMenuSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const mod = getModule(item.key);
        return mod ? canSeeModule(mod, hasRole) : true;
      }),
    }))
    .filter((section) => section.items.length > 0);
}

/** Stitch — HAKSAN CRM üst bar */
export function MoreTabHeader({
  onMenu,
  onNotifications,
}: {
  onMenu?: () => void;
  onNotifications?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top }, shadowCard]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={onMenu}
          hitSlop={8}
          style={({ pressed }) => [styles.headerIconBtn, pressFade(pressed)]}
          accessibilityLabel="Menü"
        >
          <Ionicons name="menu-outline" size={24} color={colors.stitchPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          HAKSAN CRM
        </Text>
        <Pressable
          onPress={onNotifications}
          hitSlop={8}
          style={({ pressed }) => [styles.headerIconBtn, pressFade(pressed)]}
          accessibilityLabel="Bildirimler"
        >
          <Ionicons name="notifications-outline" size={24} color={colors.stitchPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

export function MoreProfileCard({
  fullName,
  subtitle,
  onPress,
}: {
  fullName: string;
  subtitle: string;
  onPress?: () => void;
}) {
  const initial = (fullName.trim()[0] ?? 'H').toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.profileCard, shadowCard, pressFade(pressed)]}
      accessibilityRole="button"
    >
      <View style={styles.avatarRing}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
      </View>
      <View style={styles.profileBody}>
        <Text style={styles.profileName}>{fullName}</Text>
        <Text style={styles.profileRole}>{subtitle}</Text>
      </View>
      <View style={styles.profileChevron}>
        <Ionicons name="chevron-forward" size={20} color={colors.secondary} />
      </View>
    </Pressable>
  );
}

export function MoreMenuSectionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={[styles.sectionCard, shadowCard]}>{children}</View>
    </View>
  );
}

export function MoreMenuRow({
  icon,
  label,
  adminBadge,
  isLast,
  onPress,
}: {
  icon: IonIcon;
  label: string;
  adminBadge?: boolean;
  isLast?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        !isLast && styles.menuRowBorder,
        pressed && styles.menuRowPressed,
      ]}
    >
      <Ionicons name={icon} size={22} color={colors.secondary} style={styles.menuIcon} />
      <View style={styles.menuLabelWrap}>
        <Text style={styles.menuLabel}>{label}</Text>
        {adminBadge ? (
          <View style={styles.adminBadge}>
            <Text style={styles.adminBadgeText}>Admin</Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.outlineVariant} />
    </Pressable>
  );
}

export function MoreLogoutFooter({
  version,
  onLogout,
}: {
  version: string;
  onLogout: () => void;
}) {
  return (
    <View style={styles.footer}>
      <Pressable
        onPress={onLogout}
        style={({ pressed }) => [styles.logoutBtn, pressFade(pressed)]}
        accessibilityRole="button"
        accessibilityLabel="Çıkış Yap"
      >
        <Ionicons name="log-out-outline" size={18} color={colors.error} />
        <Text style={styles.logoutText}>Çıkış Yap</Text>
      </Pressable>
      <Text style={styles.versionText}>v{version}</Text>
    </View>
  );
}

const primaryFixed = '#dfe0ff';
const onPrimaryFixed = '#000b63';

const styles = StyleSheet.create({
  headerWrap: {
    backgroundColor: colors.canvas,
    zIndex: 50,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: layout.containerMargin,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 30,
    lineHeight: 38,
    fontFamily: fonts.bold,
    letterSpacing: -0.6,
    color: colors.stitchPrimary,
    paddingHorizontal: spacing.sm,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  avatarRing: {
    padding: 2,
    borderRadius: 999,
    backgroundColor: primaryFixed,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  avatarText: {
    ...typography.headlineMd,
    color: colors.primary,
  },
  profileBody: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
  },
  profileName: {
    ...typography.headlineMd,
    color: colors.textPrimary,
  },
  profileRole: {
    ...typography.bodySm,
    color: colors.secondary,
  },
  profileChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.outline,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    paddingHorizontal: spacing.sm,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
    minHeight: layout.touchMin + 8,
  },
  menuRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceVariant,
  },
  menuRowPressed: {
    backgroundColor: colors.surfaceContainerLow,
  },
  menuIcon: {
    width: 24,
  },
  menuLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  menuLabel: {
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  adminBadge: {
    backgroundColor: primaryFixed,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  adminBadgeText: {
    ...typography.caption,
    color: onPrimaryFixed,
    lineHeight: 14,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
  },
  logoutText: {
    ...typography.label,
    color: colors.error,
  },
  versionText: {
    ...typography.caption,
    color: colors.outline,
  },
});
