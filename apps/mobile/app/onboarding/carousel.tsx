import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/ui/Button';
import { PageHeader } from '@/src/ui/PageHeader';
import { Screen } from '@/src/ui/Screen';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';
import { cardElevated } from '@/src/theme/styles';

const SLIDES = [
  { title: 'Saha & Ofis Tek Ekranda', body: 'Firmalar, teklifler ve servis talepleri tek mobil uygulamada.', icon: 'business-outline' as const },
  { title: 'Servis & Bakım Cebinizde', body: 'İmza, fotoğraf ve offline tamamlama ile saha servisi.', icon: 'construct-outline' as const },
];

/** Onboarding O3–O5 carousel */
export default function OnboardingCarousel() {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <PageHeader roundedBottom={false}>
        <Text style={styles.step}>Adım {index + 1} / {SLIDES.length}</Text>
      </PageHeader>
      <View style={styles.body}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name={slide.icon} size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.bodyText}>{slide.body}</Text>
        </View>
        <View style={styles.actions}>
          {index < SLIDES.length - 1 ? (
            <Button title="İleri" onPress={() => setIndex((i) => i + 1)} />
          ) : (
            <Button title="Devam" onPress={() => router.push('/onboarding/api-setup')} />
          )}
          <Button title="Atla" variant="ghost" onPress={() => router.replace('/login')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { ...typography.bodySm, color: 'rgba(255,255,255,0.85)' },
  body: { flex: 1, padding: layout.screenPadding, justifyContent: 'space-between', paddingBottom: spacing.xxxl },
  dots: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.primary, width: 20 },
  card: { ...cardElevated, padding: spacing.xxl, alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.headline, color: colors.textPrimary, textAlign: 'center' },
  bodyText: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 24 },
  actions: { gap: spacing.sm },
});
