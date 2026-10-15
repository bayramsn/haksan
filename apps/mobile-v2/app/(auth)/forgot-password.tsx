import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { forgotPasswordSchema } from '@haksan/shared';
import { auth } from '@/src/api/endpoints';
import { ApiError, OfflineError } from '@/src/api/client';
import { authPaper, useTheme } from '@/src/theme/theme';
import { Button, Card, HeroTitle, IconField } from '@/src/ui';
import { Logo } from '@/src/ui/Logo';
import { Enter } from '@/src/ui/motion';

const ART = require('../../assets/auth/forgot.png');

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
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
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: authPaper }}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="flex-grow pb-6" keyboardShouldPersistTaps="handled">
          <Enter>
            <View className="px-6 pt-2">
              <Logo width={205} />
              <View className="pt-5">
                <HeroTitle lead="Şifremi" tail="Unuttum" subtitle="Şifre sıfırlama bağlantısını alın." />
              </View>
            </View>
          </Enter>

          <Image
            source={ART}
            style={{ width, height: width / (758 / 527), marginTop: 4 }}
            resizeMode="contain"
          />

          <Enter delay={90}>
            <View className="gap-3 px-6">
              {sent ? (
                <Card className="items-center gap-3 py-8">
                  <View className="h-14 w-14 items-center justify-center rounded-full bg-success-soft">
                    <Ionicons name="mail-outline" size={26} color={colors.success} />
                  </View>
                  <Text className="text-center font-inter-semibold text-base text-foreground">Bağlantı gönderildi</Text>
                  <Text className="text-center font-inter text-sm text-muted-foreground">
                    {email.trim()} adresi kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.
                  </Text>
                </Card>
              ) : (
                <>
                  <IconField
                    icon="mail-outline"
                    label="E-posta"
                    placeholder="E-posta"
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
                  <Text className="font-inter text-[13px] leading-[1.4] text-muted-foreground">
                    Şifre sıfırlama bağlantısı e-posta adresinize gönderilecektir.
                  </Text>
                  <Button
                    label="Sıfırlama Linki Gönder"
                    trailingIcon="chevron-forward"
                    height={52}
                    loading={busy}
                    onPress={() => void submit()}
                  />
                </>
              )}

              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/(auth)/login')}
                className="flex-row items-center justify-center gap-1.5 pt-3 active:opacity-60"
              >
                <Text className="font-inter-medium text-[15px] text-foreground">Giriş ekranına dön</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.foreground} />
              </Pressable>
            </View>
          </Enter>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
