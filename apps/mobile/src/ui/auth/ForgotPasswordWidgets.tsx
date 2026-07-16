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

/** Stitch Şifremi Unuttum — `20f7c7da845246c29ab5ff4fd47baa86` */
export function ForgotPasswordHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => [styles.backBtn, pressFade(pressed)]}
        accessibilityLabel="Geri"
      >
        <Ionicons name="arrow-back" size={24} color={colors.stitchPrimary} />
      </Pressable>
      <Text style={styles.headerTitle}>Şifre Sıfırlama</Text>
    </View>
  );
}

export function ForgotPasswordSuccessBanner({
  cooldown,
  onResend,
}: {
  cooldown: number;
  onResend?: () => void;
}) {
  const canResend = cooldown <= 0;

  return (
    <View style={styles.successBanner}>
      <Ionicons name="checkmark-circle" size={22} color="#168a35" />
      <View style={styles.successBody}>
        <Text style={styles.successText}>
          E-posta gönderildi! Gelen kutunuzu kontrol edin.
        </Text>
        <Pressable
          onPress={canResend ? onResend : undefined}
          disabled={!canResend}
          style={[styles.resendChip, !canResend && styles.resendChipDisabled]}
        >
          <Text style={styles.resendChipText}>
            {canResend ? 'Tekrar Gönder' : `Tekrar Gönder ${cooldown}s`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ForgotPasswordIntro() {
  return (
    <>
      <View style={styles.logoWrap}>
        <HaksanLogo height={48} style={styles.logo} />
      </View>
      <View style={styles.intro}>
        <Text style={styles.introTitle}>Şifrenizi mi Unuttunuz?</Text>
        <Text style={styles.introSubtitle}>
          Kayıtlı e-posta adresinizi girin, sıfırlama bağlantısı gönderelim.
        </Text>
      </View>
    </>
  );
}

export function ForgotPasswordFormCard({ children }: { children: React.ReactNode }) {
  return <View style={[styles.formCard, cardBase]}>{children}</View>;
}

export function ForgotPasswordField({
  label,
  ...inputProps
}: {
  label: string;
} & TextInputProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInputRow}>
        <Ionicons name="mail-outline" size={20} color={colors.outline} style={styles.fieldIcon} />
        <TextInput
          placeholderTextColor={colors.outlineVariant}
          style={styles.fieldInput}
          {...inputProps}
        />
      </View>
    </View>
  );
}

export function ForgotPasswordSubmitButton({
  loading,
  onPress,
}: {
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
        <Text style={styles.primaryBtnText}>Sıfırlama Bağlantısı Gönder</Text>
      )}
    </Pressable>
  );
}

export function ForgotPasswordBackToLoginButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryBtn, pressFade(pressed)]}
    >
      <Text style={styles.secondaryBtnText}>Girişe Dön</Text>
    </Pressable>
  );
}

export function ForgotPasswordInfoBox() {
  return (
    <View style={styles.infoBox}>
      <Ionicons name="information-circle-outline" size={20} color={colors.primary} style={styles.infoIcon} />
      <Text style={styles.infoText}>
        Sadece sistem yöneticisi tarafından davet edilmiş hesaplar için çalışır.
      </Text>
    </View>
  );
}

export function ForgotPasswordFooter() {
  return (
    <Text style={styles.footerText}>Yardım? destek@haksan.com.tr</Text>
  );
}

export function ForgotPasswordErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: layout.containerMargin,
    backgroundColor: colors.canvas,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    marginLeft: -spacing.sm,
  },
  headerTitle: {
    marginLeft: spacing.md,
    fontSize: 22,
    lineHeight: 28,
    fontFamily: fonts.semibold,
    color: colors.stitchPrimary,
    letterSpacing: -0.2,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: layout.containerMargin,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: '#eaffec',
    borderWidth: 1,
    borderColor: '#a3e5ae',
  },
  successBody: {
    flex: 1,
    gap: spacing.xs,
  },
  successText: {
    ...typography.bodySm,
    color: '#0d5921',
  },
  resendChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: '#c9eed1',
  },
  resendChipDisabled: {
    opacity: 0.6,
  },
  resendChipText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.semibold,
    color: '#0d5921',
  },
  logoWrap: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  logo: {
    maxWidth: 180,
  },
  intro: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  introTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  introSubtitle: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
  },
  formCard: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  fieldWrap: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.outline,
    marginLeft: 4,
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
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    paddingLeft: 42,
    paddingRight: spacing.lg,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  primaryBtn: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnDisabled: {
    opacity: 0.85,
  },
  primaryBtnText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: '#fff',
  },
  secondaryBtn: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.primary,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#dfe0ff',
    borderWidth: 1,
    borderColor: 'rgba(188, 194, 255, 0.3)',
  },
  infoIcon: {
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.medium,
    color: colors.primary,
  },
  footerText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.medium,
    color: colors.outline,
    textAlign: 'center',
    letterSpacing: 0.4,
    paddingVertical: spacing.lg,
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
