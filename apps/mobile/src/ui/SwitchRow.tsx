import { StyleSheet, Switch, Text, View } from 'react-native';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';

type Props = {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Açıklayıcı alt metin (opsiyonel) */
  hint?: string;
};

/** Etiket + sağda RN Switch — form satırı. */
export function SwitchRow({ label, value, onValueChange, hint }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.textWrap}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.outlineVariant, true: colors.primary }}
        thumbColor={colors.card}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: layout.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
  },
  textWrap: { flex: 1, gap: 2 },
  label: { ...typography.bodySm, fontFamily: fonts.medium, color: colors.textPrimary },
  hint: { ...typography.label, color: colors.textMuted },
});
