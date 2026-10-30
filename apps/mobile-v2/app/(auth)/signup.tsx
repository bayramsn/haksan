import { useState } from 'react';
import {
  Alert,
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
import { emailSchema, phoneSchema } from '@haksan/shared';
import { authPaper, useTheme } from '@/src/theme/theme';
import { Button, HeroTitle, IconField } from '@/src/ui';
import { Logo } from '@/src/ui/Logo';
import { Enter } from '@/src/ui/motion';

const ART = require('../../assets/auth/signup.png');

type FieldErrors = Partial<
  Record<'fullName' | 'email' | 'phone' | 'password' | 'confirmation' | 'terms', string>
>;

export default function SignupScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  function edit(field: keyof FieldErrors, value: string) {
    if (field === 'fullName') setFullName(value);
    else if (field === 'email') setEmail(value);
    else if (field === 'phone') setPhone(value);
    else if (field === 'password') setPassword(value);
    else if (field === 'confirmation') setConfirmation(value);
    setErrors((previous) => (previous[field] ? { ...previous, [field]: undefined } : previous));
  }

  function submit() {
    const nextErrors: FieldErrors = {};
    if (fullName.trim().length < 2 || fullName.trim().length > 120) {
      nextErrors.fullName = 'Ad soyad 2-120 karakter olmalı.';
    }
    const parsedEmail = emailSchema.safeParse(email.trim());
    if (!parsedEmail.success) nextErrors.email = parsedEmail.error.issues[0]?.message;
    const parsedPhone = phoneSchema.safeParse(phone.trim());
    if (!parsedPhone.success) nextErrors.phone = parsedPhone.error.issues[0]?.message;
    if (password.length < 8 || password.length > 128) {
      nextErrors.password = 'Şifre 8-128 karakter olmalı.';
    }
    if (password !== confirmation) nextErrors.confirmation = 'Şifreler eşleşmiyor.';
    if (!termsAccepted) nextErrors.terms = 'Devam etmek için koşulları kabul edin.';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    // Public kayıt endpoint'i yok. Hassas alanları bellekten temizleyip kullanıcıyı
    // güvenli, mevcut ERP hesap açma sürecine yönlendiriyoruz.
    setPassword('');
    setConfirmation('');
    Alert.alert(
      'Hesap talebi',
      'Hesaplar ERP yöneticiniz tarafından oluşturulur. Güvenliğiniz için parola ve form bilgileriniz hiçbir yere gönderilmedi. Yöneticiniz hesabınızı açtıktan sonra giriş yapabilirsiniz.',
      [
        { text: 'Formda Kal', style: 'cancel' },
        { text: 'Girişe Dön', onPress: () => router.replace('/(auth)/login') },
      ]
    );
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
              <Logo width={156} />
              <View className="pt-5">
                <HeroTitle lead="Kayıt Ol" subtitle="ERP deneyimine hemen başlayın." />
              </View>
            </View>
          </Enter>

          <Image
            source={ART}
            style={{ width, height: width / (758 / 390), marginTop: 4 }}
            resizeMode="contain"
          />

          <Enter delay={90}>
            <View className="gap-3 px-6">
              <IconField
                icon="person-outline"
                label="Ad Soyad"
                placeholder="Ad Soyad"
                value={fullName}
                onChangeText={(value) => edit('fullName', value)}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                error={errors.fullName}
              />
              <IconField
                icon="mail-outline"
                label="E-posta"
                placeholder="E-posta"
                value={email}
                onChangeText={(value) => edit('email', value)}
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                error={errors.email}
              />
              <IconField
                icon="call-outline"
                label="Telefon"
                placeholder="Telefon"
                value={phone}
                onChangeText={(value) => edit('phone', value)}
                autoComplete="tel"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                error={errors.phone}
              />
              <IconField
                icon="lock-closed-outline"
                label="Şifre"
                placeholder="Şifre"
                secure
                value={password}
                onChangeText={(value) => edit('password', value)}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                error={errors.password}
              />
              <IconField
                icon="lock-closed-outline"
                label="Şifre Tekrar"
                placeholder="Şifre Tekrar"
                secure
                value={confirmation}
                onChangeText={(value) => edit('confirmation', value)}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                error={errors.confirmation}
                returnKeyType="done"
                onSubmitEditing={submit}
              />

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: termsAccepted }}
                onPress={() => {
                  setTermsAccepted((accepted) => !accepted);
                  setErrors((previous) => ({ ...previous, terms: undefined }));
                }}
                className="min-h-11 flex-row items-center gap-2 active:opacity-60"
              >
                <View
                  className={`h-6 w-6 items-center justify-center rounded-[6px] border ${
                    termsAccepted ? 'border-primary bg-primary' : 'border-line-strong bg-card'
                  }`}
                >
                  {termsAccepted ? (
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <Ionicons name="checkmark" size={17} color={colors.primaryForeground} />
                    </View>
                  ) : null}
                </View>
                <Text className="flex-1 font-inter text-[14px] text-foreground">
                  KVKK ve <Text className="text-primary">kullanım koşullarını</Text> kabul ediyorum.
                </Text>
              </Pressable>
              {errors.terms ? (
                <Text accessibilityLiveRegion="polite" className="font-inter text-xs text-destructive">
                  {errors.terms}
                </Text>
              ) : null}

              <Button
                label="Hesap Oluştur"
                trailingIcon="chevron-forward"
                height={52}
                onPress={submit}
              />

              <Pressable
                accessibilityRole="link"
                onPress={() => router.replace('/(auth)/login')}
                className="min-h-11 flex-row items-center justify-center gap-2 active:opacity-60"
              >
                <Text className="font-inter text-[15px] text-foreground">Zaten hesabınız var mı?</Text>
                <Text className="font-inter-semibold text-[15px]" style={{ color: colors.primary }}>
                  Giriş Yap
                </Text>
              </Pressable>
            </View>
          </Enter>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
