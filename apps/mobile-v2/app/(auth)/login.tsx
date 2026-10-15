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
import { useRouter, type Href } from 'expo-router';
import { loginSchema, resolveLoginIdentifier } from '@haksan/shared';
import { useAuth } from '@/src/auth/AuthProvider';
import { authPaper } from '@/src/theme/theme';
import { Button, HeroTitle, IconField } from '@/src/ui';
import { Logo } from '@/src/ui/Logo';
import { Enter } from '@/src/ui/motion';
import { ApiError, OfflineError } from '@/src/api/client';

const ART = require('../../assets/auth/login.png');

export default function LoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});

  /** Kullanıcı yazmaya başlayınca o alanın hatası kalkar; yoksa düzeltilmiş
   *  alan hâlâ kırmızı görünür ve "8 karakter" uyarısı 10 karakterle sürer. */
  const edit = (field: 'identifier' | 'password', value: string) => {
    if (field === 'identifier') setIdentifier(value);
    else setPassword(value);
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setFormError(null);
  };
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setFormError(null);
    // §2.3: doğrulama sunucudakiyle aynı Zod şeması üzerinden.
    const parsed = loginSchema.safeParse({ identifier: identifier.trim(), password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({ identifier: flat.identifier?.[0], password: flat.password?.[0] });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await signIn(resolveLoginIdentifier(parsed.data), parsed.data.password);
    } catch (err) {
      setFormError(
        err instanceof OfflineError
          ? 'Sunucuya ulaşılamıyor. Bağlantınızı kontrol edin.'
          : err instanceof ApiError
            ? err.message
            : 'Giriş yapılamadı.'
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
                <HeroTitle lead="Giriş Yap" subtitle="Hesabınıza güvenle erişin." />
              </View>
            </View>
          </Enter>

          <Image
            source={ART}
            style={{ width, height: width / (758 / 657), marginTop: 4 }}
            resizeMode="contain"
          />

          <Enter delay={90}>
            <View className="gap-3 px-6">
              <IconField
                icon="mail-outline"
                label="E-posta"
                placeholder="E-posta"
                value={identifier}
                onChangeText={(v) => edit('identifier', v)}
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect={false}
                textContentType="username"
                keyboardType="email-address"
                error={errors.identifier}
                returnKeyType="next"
              />
              <IconField
                icon="lock-closed-outline"
                label="Şifre"
                placeholder="Şifre"
                secure
                value={password}
                onChangeText={(v) => edit('password', v)}
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                error={errors.password}
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
              />

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(auth)/forgot-password')}
                className="self-end pb-1 active:opacity-60"
              >
                <Text className="font-inter-medium text-[15px] text-foreground">Şifremi Unuttum</Text>
              </Pressable>

              {formError ? (
                <Text accessibilityLiveRegion="polite" className="font-inter text-sm text-destructive">
                  {formError}
                </Text>
              ) : null}

              <Button
                label="Giriş Yap"
                trailingIcon="chevron-forward"
                height={52}
                loading={busy}
                onPress={() => void submit()}
              />

              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/(auth)/signup' as Href)}
                className="min-h-11 flex-row items-center justify-center gap-2 active:opacity-60"
              >
                <Text className="font-inter text-[15px] text-muted-foreground">Hesabınız yok mu?</Text>
                <Text className="font-inter-semibold text-[15px] text-primary">Kayıt Ol</Text>
              </Pressable>
            </View>
          </Enter>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
