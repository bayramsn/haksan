import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, layout, spacing, typography } from '@/src/theme/tokens';

type Props = {
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
};

/** Picker / sheet modalları — navy header + safe-area */
export function SheetHeader({ title, onClose, children }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.wrap}>
      <View style={[styles.accent, { top: insets.top }]} />
      <View style={[styles.inner, { paddingTop: insets.top + layout.accentBarHeight + spacing.sm }]}>
        <View style={styles.row}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.close}>Kapat</Text>
          </Pressable>
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.primary, position: 'relative' },
  accent: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: layout.accentBarHeight,
    backgroundColor: colors.accentRed,
    zIndex: 1,
  },
  inner: {
    paddingBottom: spacing.md,
    paddingHorizontal: layout.screenPadding,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { ...typography.title, color: '#fff' },
  close: { ...typography.bodySm, fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.9)' },
});
