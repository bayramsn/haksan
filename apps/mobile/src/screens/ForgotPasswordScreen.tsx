import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { emailSchema } from '@haksan/shared';
import { authService } from '@/src/api/services';
import {
  ForgotPasswordBackToLoginButton,
  ForgotPasswordErrorBanner,
  ForgotPasswordField,
  ForgotPasswordFooter,
  ForgotPasswordFormCard,
  ForgotPasswordHeader,
  ForgotPasswordInfoBox,
  ForgotPasswordIntro,
  ForgotPasswordSubmitButton,
  ForgotPasswordSuccessBanner,
} from '@/src/ui/auth/ForgotPasswordWidgets';
import { colors, layout, spacing } from '@/src/theme/tokens';

const RESEND_COOLDOWN_SEC = 60;

/** Stitch Şifremi Unuttum — `20f7c7da845246c29ab5ff4fd47baa86` */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = useCallback(async () => {
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError('Geçerli bir e-posta adresi girin');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authService.forgotPassword(parsed.data);
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İstek başarısız');
    } finally {
      setBusy(false);
    }
  }, [email]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <ForgotPasswordHeader onBack={() => router.back()} />

      {sent ? (
        <ForgotPasswordSuccessBanner
          cooldown={cooldown}
          onResend={() => void submit()}
        />
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.body}>
            <ForgotPasswordIntro />

            <ForgotPasswordFormCard>
              <ForgotPasswordField
                label="E-posta"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                placeholder="kullanici@haksan.com.tr"
                returnKeyType="send"
                onSubmitEditing={() => void submit()}
              />

              {error ? <ForgotPasswordErrorBanner message={error} /> : null}

              <ForgotPasswordSubmitButton loading={busy} onPress={() => void submit()} />
              <ForgotPasswordBackToLoginButton onPress={() => router.replace('/login')} />
            </ForgotPasswordFormCard>

            <ForgotPasswordInfoBox />
          </View>

          <ForgotPasswordFooter />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: layout.containerMargin,
  },
  body: {
    flexGrow: 1,
  },
});
