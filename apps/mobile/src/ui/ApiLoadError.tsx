import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getApiBaseUrl } from '@/src/api/config';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

type Props = {
  message: string;
  onRetry: () => void;
};

/** Ağ / sunucu hatası — yeniden dene + API adresi */
export function ApiLoadError({ message, onRetry }: Props) {
  const apiUrl = getApiBaseUrl();

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.accentRed} />
        </View>
        <Text style={styles.title}>{message}</Text>
        <Text style={styles.hint}>
          API adresi: <Text style={styles.mono}>{apiUrl}</Text>
        </Text>
        <Text style={styles.sub}>
          Simülatörde API’nin çalıştığından emin olun:{' '}
          <Text style={styles.mono}>npm run dev:api</Text>
        </Text>
        <Pressable onPress={onRetry} style={({ pressed }) => [styles.primaryBtn, pressFade(pressed)]}>
          <Text style={styles.primaryBtnText}>Tekrar Dene</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/onboarding/api-setup')}
          style={({ pressed }) => [styles.secondaryBtn, pressFade(pressed)]}
        >
          <Text style={styles.secondaryBtnText}>API Ayarları</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.xl,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadowCard,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentRedSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.body,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  hint: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  sub: {
    ...typography.caption,
    color: colors.outline,
    textAlign: 'center',
    lineHeight: 18,
  },
  mono: { fontFamily: fonts.medium, color: colors.secondary },
  primaryBtn: {
    marginTop: spacing.md,
    width: '100%',
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { ...typography.bodySm, color: '#fff', fontFamily: fonts.semibold },
  secondaryBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { ...typography.bodySm, color: colors.primary, fontFamily: fonts.semibold },
});
