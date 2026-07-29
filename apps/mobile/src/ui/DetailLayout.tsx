import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { cardElevated, pressFade } from '@/src/theme/styles';
import { TabStrip } from '@/src/ui/TabStrip';

export function DetailHero({
  title,
  subtitle,
  badge,
  showBack = true,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  showBack?: boolean;
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.hero}>
      <View style={styles.accent} />
      <View style={[styles.heroInner, { paddingTop: insets.top + layout.accentBarHeight + spacing.sm }]}>
        {showBack ? (
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressFade(pressed)]} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
        ) : null}
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
        {children}
      </View>
    </View>
  );
}

export function DetailTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
}) {
  return <TabStrip tabs={tabs} value={value} onChange={onChange} variant="underline" />;
}

export function InfoCard({ label, value, style }: { label: string; value: string; style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardValue}>{value || '—'}</Text>
    </View>
  );
}

export function ActionRow({ actions }: { actions: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' }[] }) {
  return (
    <View style={styles.actions}>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={a.onPress}
          style={({ pressed }) => [
            styles.actionBtn,
            a.variant === 'primary' ? styles.actionPrimary : styles.actionSecondary,
            pressFade(pressed),
          ]}
        >
          <Text style={[styles.actionText, a.variant === 'primary' && styles.actionTextPrimary]}>{a.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function LoadingCenter() {
  return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: layout.accentBarHeight,
    backgroundColor: colors.accentRed,
  },
  heroInner: {
    paddingBottom: spacing.lg,
    paddingHorizontal: layout.screenPadding,
    gap: 6,
  },
  back: { marginBottom: spacing.xs, alignSelf: 'flex-start' },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentRed,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { ...typography.caption, color: '#fff' },
  title: { ...typography.headline, color: '#fff' },
  sub: { ...typography.bodySm, color: 'rgba(255,255,255,0.88)' },
  card: {
    ...cardElevated,
    padding: 14,
    marginBottom: spacing.sm,
  },
  cardLabel: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase' },
  cardValue: { ...typography.body, color: colors.textPrimary, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.md },
  actionBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.sm,
    justifyContent: 'center',
  },
  actionPrimary: { backgroundColor: colors.primary },
  actionSecondary: { backgroundColor: colors.primarySoft },
  actionText: { ...typography.bodySm, fontFamily: fonts.semibold, color: colors.primary },
  actionTextPrimary: { color: '#fff' },
});
