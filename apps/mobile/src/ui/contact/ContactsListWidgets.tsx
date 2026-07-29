import { Pressable, StyleSheet, Text, TextInput, View, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export function ContactsTopBar({
  onBack,
  onSearch,
  onAdd,
}: {
  onBack?: () => void;
  onSearch?: () => void;
  onAdd?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topBarWrap, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.topBarIcon, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.onSurfaceVariant} />
      </Pressable>
      <Text style={styles.topBarTitle}>Kontaklar</Text>
      <View style={styles.topBarRight}>
        <Pressable onPress={onSearch} hitSlop={8} style={({ pressed }) => [styles.topBarIcon, pressFade(pressed)]}>
          <Ionicons name="search-outline" size={22} color={colors.stitchPrimary} />
        </Pressable>
        <Pressable onPress={onAdd} style={({ pressed }) => [styles.addBtn, pressFade(pressed)]}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Yeni</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ContactsSearchField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search" size={20} color={colors.outline} style={styles.searchIcon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="İsim, e-posta veya telefon ara…"
        placeholderTextColor={colors.onSurfaceVariant}
        style={styles.searchInput}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

export function ContactListCard({
  row,
  onPress,
}: {
  row: Record<string, unknown>;
  onPress: () => void;
}) {
  const fullName = String(row.fullName ?? 'İsimsiz Kontak');
  const title = row.title ? String(row.title) : '';
  const email = row.email ? String(row.email) : '';
  const phone = row.phone ? String(row.phone) : '';
  
  // Extract company name if nested
  let companyName = '';
  if (row.company && typeof row.company === 'object') {
    const comp = row.company as Record<string, unknown>;
    companyName = String(comp.legalTitle ?? comp.name ?? '');
  } else if (row.companyName) {
    companyName = String(row.companyName);
  }

  const handleCall = () => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleEmail = () => {
    if (email) {
      Linking.openURL(`mailto:${email}`);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressFade(pressed)]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{fullName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardHeaderContent}>
          <Text style={styles.fullName} numberOfLines={1}>
            {fullName}
          </Text>
          {title ? (
            <Text style={styles.titleText} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.outlineVariant} />
      </View>
      
      {(companyName || phone || email) ? (
        <View style={styles.cardBody}>
          {companyName ? (
            <View style={styles.infoRow}>
              <Ionicons name="business-outline" size={16} color={colors.outline} />
              <Text style={styles.infoText} numberOfLines={1}>{companyName}</Text>
            </View>
          ) : null}
          {phone ? (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={16} color={colors.outline} />
              <Text style={styles.infoText} numberOfLines={1}>{phone}</Text>
            </View>
          ) : null}
          {email ? (
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={16} color={colors.outline} />
              <Text style={styles.infoText} numberOfLines={1}>{email}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      
      <View style={styles.cardActions}>
        <Pressable 
          onPress={handleCall} 
          style={[styles.actionBtn, !phone && styles.actionBtnDisabled]}
          disabled={!phone}
        >
          <Ionicons name="call" size={18} color={phone ? colors.primary : colors.outlineVariant} />
          <Text style={[styles.actionBtnText, !phone && styles.actionBtnTextDisabled]}>Ara</Text>
        </Pressable>
        <Pressable 
          onPress={handleEmail} 
          style={[styles.actionBtn, !email && styles.actionBtnDisabled]}
          disabled={!email}
        >
          <Ionicons name="mail" size={18} color={email ? colors.primary : colors.outlineVariant} />
          <Text style={[styles.actionBtnText, !email && styles.actionBtnTextDisabled]}>E-posta</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
    backgroundColor: colors.card,
    zIndex: 10,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.headline,
    color: colors.stitchPrimary,
    fontFamily: fonts.bold,
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  topBarIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    minHeight: 32,
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  addBtnText: { ...typography.caption, color: '#fff', fontFamily: fonts.semibold },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: spacing.md, zIndex: 1 },
  searchInput: {
    height: 48,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingLeft: 40,
    paddingRight: spacing.md,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadowCard,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  cardHeaderContent: {
    flex: 1,
  },
  fullName: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  titleText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.outline,
    marginTop: 2,
  },
  cardBody: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
    gap: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  infoText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.onSurfaceVariant,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerLow,
  },
  actionBtnDisabled: {
    backgroundColor: colors.surfaceContainerHighest,
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.primary,
  },
  actionBtnTextDisabled: {
    color: colors.outlineVariant,
  },
});
