import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HaksanLogo } from '@/src/ui/HaksanLogo';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

const cardBase: ViewStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  padding: spacing.lg,
  ...shadowCard,
};

/** Stitch Giriş Yap — `4e878ae66e9d4ed2942b498d335a345a` */
export function LoginBrandHeader() {
  return (
    <View style={styles.brandHeader}>
      <HaksanLogo height={56} style={styles.brandLogo} />
      <Text style={styles.brandTagline}>Sahayı yanınızda taşıyın</Text>
    </View>
  );
}

export function LoginFormCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={[styles.formCard, cardBase]}>
      <Text style={styles.formTitle}>Hesabınıza Giriş Yapın</Text>
      <Text style={styles.formSubtitle}>Haksan CRM kullanıcı hesabınızla devam edin</Text>
      {children}
    </View>
  );
}

export function LoginField({
  label,
  icon,
  right,
  ...inputProps
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  right?: React.ReactNode;
} & TextInputProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInputRow}>
        <Ionicons name={icon} size={20} color={colors.outlineVariant} style={styles.fieldIcon} />
        <TextInput
          placeholderTextColor={colors.outlineVariant}
          style={[styles.fieldInput, right ? styles.fieldInputWithRight : null]}
          {...inputProps}
        />
        {right}
      </View>
    </View>
  );
}

export function LoginPasswordToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      style={({ pressed }) => [styles.passwordToggle, pressFade(pressed)]}
      accessibilityLabel={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}
    >
      <Ionicons
        name={visible ? 'eye-off-outline' : 'eye-outline'}
        size={20}
        color={colors.outlineVariant}
      />
    </Pressable>
  );
}

export function LoginRememberRow({
  remember,
  onRememberChange,
  onForgot,
}: {
  remember: boolean;
  onRememberChange: () => void;
  onForgot: () => void;
}) {
  return (
    <View style={styles.rememberRow}>
      <Pressable
        onPress={onRememberChange}
        style={({ pressed }) => [styles.rememberControl, pressFade(pressed)]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: remember }}
      >
        <View style={[styles.checkbox, remember && styles.checkboxChecked]}>
          {remember ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
        </View>
        <Text style={styles.rememberText}>Beni hatırla</Text>
      </Pressable>
      <Pressable onPress={onForgot} hitSlop={8} style={({ pressed }) => pressFade(pressed)}>
        <Text style={styles.forgotText}>Şifremi Unuttum?</Text>
      </Pressable>
    </View>
  );
}

export function LoginPrimaryButton({
  title,
  loading,
  onPress,
}: {
  title: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.primaryBtn,
        pressFade(pressed),
        loading && styles.primaryBtnDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.primaryBtnText}>{title}</Text>
      )}
    </Pressable>
  );
}

export function LoginSupportText() {
  return (
    <Text style={styles.supportText}>
      Hesabınız yok mu?{' '}
      <Text style={styles.supportLink}>Yöneticinize başvurun</Text>
    </Text>
  );
}

export function LoginLegalFooter({ version = 'v0.1.0' }: { version?: string }) {
  return (
    <View style={styles.legalFooter}>
      <Text style={styles.legalVersion}>{version}</Text>
      <View style={styles.legalLinks}>
        <Pressable hitSlop={8}>
          <Text style={styles.legalLink}>KVKK</Text>
        </Pressable>
        <Text style={styles.legalDot}>·</Text>
        <Pressable hitSlop={8}>
          <Text style={styles.legalLink}>Gizlilik</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function LoginErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brandHeader: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: layout.containerMargin,
  },
  brandLogo: {
    maxWidth: 200,
  },
  brandTagline: {
    marginTop: spacing.xs,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.medium,
    color: colors.primary,
  },
  formCard: {
    gap: spacing.md,
  },
  formTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  formSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  fieldWrap: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.primary,
    fontFamily: fonts.medium,
  },
  fieldInputRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  fieldIcon: {
    position: 'absolute',
    left: spacing.sm,
    zIndex: 1,
  },
  fieldInput: {
    height: 48,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingLeft: 40,
    paddingRight: spacing.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  fieldInputWithRight: {
    paddingRight: 40,
  },
  passwordToggle: {
    position: 'absolute',
    right: spacing.sm,
    height: 48,
    justifyContent: 'center',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  rememberControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rememberText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.onSurfaceVariant,
  },
  forgotText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.medium,
    color: colors.primary,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryBtnDisabled: {
    opacity: 0.85,
  },
  primaryBtnText: {
    ...typography.label,
    fontFamily: fonts.semibold,
    color: '#fff',
  },
  supportText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: layout.containerMargin,
  },
  supportLink: {
    color: colors.primary,
    fontFamily: fonts.medium,
    textDecorationLine: 'underline',
  },
  legalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  legalVersion: {
    fontSize: 12,
    color: 'rgba(69, 70, 81, 0.7)',
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legalLink: {
    fontSize: 12,
    color: colors.primary,
  },
  legalDot: {
    fontSize: 12,
    color: 'rgba(69, 70, 81, 0.7)',
  },
  errorBanner: {
    backgroundColor: colors.accentRedSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    ...typography.bodySm,
    color: colors.accentRed,
  },
});
