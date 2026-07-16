import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, spacing } from '@/src/theme/tokens';

type Props = {
  children?: React.ReactNode;
  right?: React.ReactNode;
  roundedBottom?: boolean;
  style?: ViewStyle;
};

/** Stitch üst bar — safe-area + 3px kırmızı şerit + navy header */
export function PageHeader({ children, right, roundedBottom = true, style }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, roundedBottom && styles.rounded, style]}>
      <View style={styles.accent} />
      <View style={[styles.inner, { paddingTop: insets.top + layout.accentBarHeight + spacing.sm }]}>
        <View style={styles.row}>
          <View style={styles.main}>{children}</View>
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.primary,
    position: 'relative',
  },
  rounded: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: layout.accentBarHeight,
    backgroundColor: colors.accentRed,
    zIndex: 1,
  },
  inner: {
    paddingBottom: spacing.lg,
    paddingHorizontal: layout.screenPadding,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  main: { flex: 1, gap: spacing.xs },
  right: { paddingTop: 2 },
});
