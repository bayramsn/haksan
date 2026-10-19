import { useMemo, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { resetPasswordSchema } from '@haksan/shared';
import { auth } from '@/src/api/endpoints';
import { ApiError, OfflineError } from '@/src/api/client';
import { authPaper, useTheme } from '@/src/theme/theme';
import { Button, Card, HeroTitle, IconField } from '@/src/ui';
import { Logo } from '@/src/ui/Logo';
import { Enter } from '@/src/ui/motion';

const ART = require('../../assets/auth/forgot.png');

type FieldErrors = { password?: string; confirmation?: string };

function firstQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
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
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: authPaper }}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName="flex-grow pb-6"
          keyboardShouldPersistTaps="handled"
        >
          <Enter>
            <View className="px-6 pt-2">
              <Logo width={156} />
              <View className="pt-5">
                <HeroTitle lead="Yeni" tail="Şifre" subtitle="Hesabınız için yeni parolanızı belirleyin." />
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
                <View className="gap-3">
                  <IconField
                    icon="lock-closed-outline"
                    label="Yeni Şifre"
                    placeholder="Yeni Şifre"
                    value={password}
                    onChangeText={(value) => edit('password', value)}
                    secure
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    error={errors.password}
                    returnKeyType="next"
                  />
                  <IconField
                    icon="lock-closed-outline"
                    label="Yeni Şifre Tekrar"
                    placeholder="Yeni Şifre Tekrar"
                    value={confirmation}
                    onChangeText={(value) => edit('confirmation', value)}
                    secure
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    error={errors.confirmation}
                    returnKeyType="go"
                    onSubmitEditing={() => void submit()}
                  />
                  {formError ? (
                    <Text
                      selectable
                      accessibilityLiveRegion="assertive"
                      className="font-inter text-sm text-destructive"
                    >
                      {formError}
                    </Text>
                  ) : null}
                  <Button
                    label="Şifreyi Yenile"
                    trailingIcon="chevron-forward"
                    height={52}
                    loading={busy}
                    onPress={() => void submit()}
                  />
                </View>
              )}

              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/(auth)/login')}
                className="min-h-11 flex-row items-center justify-center gap-1.5 active:opacity-60"
              >
                <Text className="font-inter-medium text-[15px] text-foreground">Giriş ekranına dön</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </Enter>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
