import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts, layout, radius, typography } from '@/src/theme/tokens';
import { pressFade } from '@/src/theme/styles';

type Props = PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
};

export function Button({ title, variant = 'primary', loading, disabled, style, ...rest }: Props) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => {
        const base: StyleProp<ViewStyle> = [
          styles.base,
          isPrimary ? styles.primary : variant === 'secondary' ? styles.secondary : styles.ghost,
          (disabled || loading) && styles.disabled,
          pressFade(pressed),
          style as StyleProp<ViewStyle>,
        ];
        return base;
      }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#fff' : colors.primary} />
      ) : (
        <Text style={[styles.text, isPrimary ? styles.textPrimary : styles.textSecondary]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.touchMin,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primarySoft },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  text: { ...typography.body, fontFamily: fonts.semibold },
  textPrimary: { color: '#fff' },
  textSecondary: { color: colors.primary },
});
