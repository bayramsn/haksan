import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { resetPasswordSchema } from '@haksan/shared';
import { auth } from '@/src/api/endpoints';
import { ApiError, OfflineError } from '@/src/api/client';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Field, H1 } from '@/src/ui';

type FieldErrors = { password?: string; confirmation?: string };

function firstQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = useMemo(() => firstQueryValue(params.token).trim(), [params.token]);
  const tokenIsValid = useMemo(
    () => resetPasswordSchema.shape.token.safeParse(token).success,
    [token]
  );
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  function edit(field: keyof FieldErrors, value: string) {
    if (field === 'password') setPassword(value);
    else setConfirmation(value);
    setErrors((previous) => (previous[field] ? { ...previous, [field]: undefined } : previous));
    setFormError(null);
  }

  async function submit() {
    setFormError(null);
    const parsed = resetPasswordSchema.safeParse({ token, newPassword: password });
    const nextErrors: FieldErrors = {};
    if (!parsed.success) {
      nextErrors.password = parsed.error.flatten().fieldErrors.newPassword?.[0];
    }
    if (password !== confirmation) nextErrors.confirmation = 'Parolalar eşleşmiyor.';
    if (Object.keys(nextErrors).length > 0 || !parsed.success) {
      setErrors(nextErrors);
      return;
    }

    setBusy(true);
    try {
      await auth.resetPassword(parsed.data);
      setPassword('');
      setConfirmation('');
      setComplete(true);
    } catch (error) {
      setFormError(
        error instanceof OfflineError
          ? 'Sunucuya ulaşılamıyor. Bağlantınızı kontrol edin.'
          : error instanceof ApiError
            ? error.message
            : 'Parola değiştirilemedi. Bağlantının süresi dolmuş olabilir.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName="flex-grow justify-center gap-6 px-6 py-10"
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-1.5">
            <H1>Yeni Parola</H1>
            <Text selectable className="font-inter text-base text-muted-foreground">
              Hesabınız için en az 8 karakterden oluşan yeni bir parola belirleyin.
            </Text>
          </View>

          {!tokenIsValid ? (
            <Card accessibilityLiveRegion="assertive" className="items-center gap-3 py-8">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-destructive-soft">
                <Ionicons name="link-outline" size={26} color={colors.destructive} />
              </View>
              <Text selectable className="text-center font-inter-semibold text-base text-foreground">
                Bağlantı geçersiz
              </Text>
              <Text selectable className="text-center font-inter text-sm text-muted-foreground">
                Sıfırlama bağlantısı eksik veya bozulmuş. Yeni bir bağlantı isteyin.
              </Text>
              <Button
                label="Yeni Bağlantı İste"
                variant="ghost"
                className="self-stretch"
                onPress={() => router.replace('/(auth)/forgot-password')}
              />
            </Card>
          ) : complete ? (
            <Card accessibilityLiveRegion="polite" className="items-center gap-3 py-8">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-success-soft">
                <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
              </View>
              <Text selectable className="text-center font-inter-semibold text-base text-foreground">
                Parolanız yenilendi
              </Text>
              <Text selectable className="text-center font-inter text-sm text-muted-foreground">
                Yeni parolanızla hesabınıza güvenle giriş yapabilirsiniz.
              </Text>
              <Button
                label="Giriş Yap"
                className="self-stretch"
                onPress={() => router.replace('/(auth)/login')}
              />
            </Card>
          ) : (
            <View className="gap-4">
              <Field
                label="Yeni parola"
                value={password}
                onChangeText={(value) => edit('password', value)}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                error={errors.password}
                returnKeyType="next"
              />
              <Field
                label="Yeni parola tekrar"
                value={confirmation}
                onChangeText={(value) => edit('confirmation', value)}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                error={errors.confirmation}
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
              />
              {formError ? (
                <Text selectable accessibilityLiveRegion="assertive" className="font-inter text-sm text-destructive">
                  {formError}
                </Text>
              ) : null}
              <Button label="Parolayı Yenile" loading={busy} onPress={() => void submit()} />
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(auth)/login')}
            className="min-h-11 flex-row items-center justify-center gap-1.5 active:opacity-60"
          >
            <Ionicons name="arrow-back" size={15} color={colors.primary} />
            <Text className="font-inter-medium text-[15px] text-primary">Giriş ekranına dön</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
