import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { forgotPasswordSchema } from '@haksan/shared';
import { auth } from '@/src/api/endpoints';
import { ApiError, OfflineError } from '@/src/api/client';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Field, H1 } from '@/src/ui';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    const parsed = forgotPasswordSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setError(parsed.error.flatten().fieldErrors.email?.[0] ?? 'Geçerli bir e-posta girin.');
      return;
    }
    setBusy(true);
    try {
      await auth.forgotPassword({ email: parsed.data.email });
      // Sunucu kayıtlı olmayan e-posta için de ok döner; mesaj bu yüzden nötr.
      setSent(true);
    } catch (err) {
      setError(
        err instanceof OfflineError
          ? 'Sunucuya ulaşılamıyor. Bağlantınızı kontrol edin.'
          : err instanceof ApiError
            ? err.message
            : 'İşlem tamamlanamadı.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="flex-grow justify-center gap-6 px-6 py-10" keyboardShouldPersistTaps="handled">
          <View className="gap-1.5">
            <H1>Şifremi Unuttum</H1>
            <Text className="font-inter text-base text-muted-foreground">
              Şifre sıfırlama bağlantısını e-posta adresinize gönderelim.
            </Text>
          </View>

          {sent ? (
            <Card className="items-center gap-3 py-8">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-success-soft">
                <Ionicons name="mail-outline" size={26} color={colors.success} />
              </View>
              <Text className="text-center font-inter-semibold text-base text-foreground">
                Bağlantı gönderildi
              </Text>
              <Text className="text-center font-inter text-sm text-muted-foreground">
                {email.trim()} adresi kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.
              </Text>
            </Card>
          ) : (
            <View className="gap-4">
              <Field
                label="E-posta"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setError(null);
                }}
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                error={error ?? undefined}
                returnKeyType="send"
                onSubmitEditing={() => void submit()}
              />
              <Button label="Sıfırlama Bağlantısı Gönder" loading={busy} onPress={() => void submit()} />
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(auth)/login')}
            className="flex-row items-center justify-center gap-1.5 active:opacity-60"
          >
            <Ionicons name="arrow-back" size={15} color={colors.primary} />
            <Text className="font-inter-medium text-[15px] text-primary">Giriş ekranına dön</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
