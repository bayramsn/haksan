import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HaksanLogo } from '@/src/ui/HaksanLogo';
import { colors, fonts, layout, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

type Props = {
  title?: string;
  right?: React.ReactNode;
  style?: ViewStyle;
};

/** Stitch #02 — h-16 beyaz üst bar: logo | başlık | aksiyonlar */
export function AppTopBar({ title, right, style }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }, shadowCard, style]}>
      <View style={styles.bar}>
        <View style={styles.logoSlot}>
          <HaksanLogo height={layout.headerLogoHeight} />
        </View>
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <View style={styles.titleSpacer} />
        )}
        <View style={styles.actions}>{right}</View>
      </View>
    </View>
  );
}

type IconButtonProps = {
  onPress: () => void;
  children: React.ReactNode;
  accessibilityLabel: string;
};

export function TopBarIconButton({ onPress, children, accessibilityLabel }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, pressFade(pressed)]}
    >
      {children}
    </Pressable>
  );
}

export function TopBarAvatar({ label, onPress }: { label: string; onPress?: () => void }) {
  const initial = (label.trim()[0] ?? 'H').toUpperCase();
  const body = (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initial}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => pressFade(pressed)}>
      {body}
    </Pressable>
  );
}

const BAR_HEIGHT = 64;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.canvas,
    borderBottomWidth: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: BAR_HEIGHT,
    paddingHorizontal: layout.containerMargin,
    gap: spacing.sm,
  },
  logoSlot: {
    flexShrink: 0,
    justifyContent: 'center',
    minWidth: 96,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: fonts.bold,
    lineHeight: 24,
    color: colors.stitchPrimary,
    paddingHorizontal: spacing.xs,
  },
  titleSpacer: { flex: 1 },
  actions: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    minWidth: 96,
  },
  iconBtn: {
    width: layout.touchMin,
    height: layout.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.label, fontFamily: fonts.bold, color: colors.primary },
});
