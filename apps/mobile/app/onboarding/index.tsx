import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { HaksanLogo } from '@/src/ui/HaksanLogo';
import { Button } from '@/src/ui/Button';
import { PageHeader } from '@/src/ui/PageHeader';
import { Screen } from '@/src/ui/Screen';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';
import { cardElevated } from '@/src/theme/styles';

/** Onboarding O2 — Hoş Geldin */
export default function OnboardingWelcome() {
  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <PageHeader roundedBottom>
        <HaksanLogo height={40} />
        <Text style={styles.tag}>Makina Marketiniz</Text>
      </PageHeader>
      <View style={styles.body}>
        <Text style={styles.title}>Hoş Geldiniz</Text>
        <Text style={styles.sub}>Saha ve ofis tek ekranda. CRM, servis ve operasyon modüllerine mobil erişim.</Text>
        <View style={styles.actions}>
          <Button title="Devam Et" onPress={() => router.push('/onboarding/carousel')} />
          <Button title="Atla" variant="ghost" onPress={() => router.replace('/login')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tag: { ...typography.bodySm, color: 'rgba(255,255,255,0.85)' },
  body: { flex: 1, padding: layout.screenPadding, justifyContent: 'space-between', paddingBottom: spacing.xxxl },
  title: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.sm },
  sub: { ...typography.body, color: colors.textMuted },
  actions: { gap: spacing.sm, marginTop: spacing.xxl },
});
