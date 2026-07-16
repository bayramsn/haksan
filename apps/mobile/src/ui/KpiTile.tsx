import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { cardElevated, pressFade } from '@/src/theme/styles';

type Props = {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: 'default' | 'warning' | 'success';
};

export function KpiTile({ label, value, icon, tone = 'default' }: Props) {
  const toneColor = tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : colors.primary;
  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: `${toneColor}14` }]}>
        <Ionicons name={icon} size={20} color={toneColor} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

type QuickProps = { title: string; icon: keyof typeof Ionicons.glyphMap; onPress?: () => void };

export function QuickAction({ title, icon, onPress }: QuickProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, pressFade(pressed)]}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={styles.quickText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '46%',
    ...cardElevated,
    padding: 14,
    gap: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { ...typography.kpi, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  label: { ...typography.bodySm, color: colors.textMuted },
  quick: {
    flex: 1,
    minHeight: 88,
    ...cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  quickIcon: {
    width: layout.touchMin,
    height: layout.touchMin,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: { ...typography.label, fontFamily: fonts.semibold, color: colors.textPrimary, textAlign: 'center' },
});
