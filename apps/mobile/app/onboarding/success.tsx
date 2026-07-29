import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HaksanLogo } from '@/src/ui/HaksanLogo';
import { Button } from '@/src/ui/Button';
import { PageHeader } from '@/src/ui/PageHeader';
import { Screen } from '@/src/ui/Screen';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

/** Onboarding O9 — kurulum tamamlandı */
export default function OnboardingSuccess() {
  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <PageHeader>
        <HaksanLogo height={layout.headerLogoHeight} />
      </PageHeader>
      <View style={styles.body}>
        <Ionicons name="checkmark-circle" size={80} color={colors.success} />
        <Text style={styles.title}>Hazırsınız!</Text>
        <Text style={styles.sub}>
          Haksan CRM mobil uygulaması kullanıma hazır. Giriş yaparak saha ve ofis işlemlerinize devam edin.
        </Text>
        <Button title="Giriş Yap" onPress={() => router.replace('/login')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    padding: layout.screenPadding,
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  title: { ...typography.headline, color: colors.textPrimary, textAlign: 'center' },
  sub: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 24, marginBottom: spacing.lg },
});
