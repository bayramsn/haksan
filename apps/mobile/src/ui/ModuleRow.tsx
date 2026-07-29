import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { cardElevated, pressFade } from '@/src/theme/styles';
import type { MobileModule } from '@/src/navigation/modules';

export function ModuleRow({ mod }: { mod: MobileModule }) {
  return (
    <Pressable
      onPress={() => router.push(`/modules/${mod.key}`)}
      style={({ pressed }) => [styles.row, pressFade(pressed)]}
    >
      <View style={styles.icon}>
        <Ionicons name={mod.icon} size={22} color={colors.primary} />
      </View>
      <Text style={styles.label}>{mod.label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.touchMin + 8,
    ...cardElevated,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, ...typography.body, fontFamily: fonts.medium, color: colors.textPrimary },
});
