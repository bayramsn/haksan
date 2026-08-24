import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { loginSchema, resolveLoginIdentifier } from '@haksan/shared';
import { useAuth } from '@/src/auth/AuthProvider';
import { Button, Field, H1 } from '@/src/ui';
import { Enter } from '@/src/ui/motion';
import { ApiError, OfflineError } from '@/src/api/client';

export default function LoginScreen() {
  const router = useRouter();
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
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName="flex-grow justify-center gap-6 px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <Enter>
            <View className="gap-1.5">
              <H1 className="text-[34px]">Haksan Makina</H1>
              <Text className="font-inter-semibold text-[13px] text-primary">ERP</Text>
              <Text className="pt-1 font-inter text-base text-muted-foreground">
                Hesabınıza güvenle erişin.
              </Text>
            </View>
          </Enter>

          <Enter delay={90}>
            <View className="gap-4">
            <Field
              label="Kullanıcı adı veya e-posta"
              value={identifier}
              onChangeText={(v) => edit('identifier', v)}
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect={false}
              textContentType="username"
              error={errors.identifier}
              returnKeyType="next"
            />
            <Field
              label="Parola"
              value={password}
              onChangeText={(v) => edit('password', v)}
              secureTextEntry
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
              className="self-end active:opacity-60"
            >
              <Text className="font-inter-medium text-[13px] text-primary">Şifremi Unuttum</Text>
            </Pressable>
            {formError ? <Text className="font-inter text-sm text-destructive">{formError}</Text> : null}
            <Button label="Giriş Yap" loading={busy} onPress={() => void submit()} />
            </View>
          </Enter>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
