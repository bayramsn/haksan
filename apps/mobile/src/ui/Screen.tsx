import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { colors, layout, spacing } from '@/src/theme/tokens';

/** FAB altında liste içeriğinin kesilmemesi için */
export const FAB_LIST_PADDING = 88;

type Props = ViewProps & {
  scroll?: boolean;
  padded?: boolean;
  keyboard?: boolean;
  /** @deprecated PageHeader kendi safe-area inset'ini kullanır */
  safeTop?: boolean;
  /** SafeAreaView kenarları — tab ekranlarında ['left','right'] */
  edges?: Edge[];
  /** Scroll içeriği kısa olsa bile ekranı doldur (varsayılan: false, boşluk bırakmaz) */
  fill?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  scroll,
  padded = true,
  keyboard,
  safeTop = false,
  edges,
  fill = false,
  style,
  contentContainerStyle,
  ...rest
}: Props) {
  const insets = useSafeAreaInsets();
  const padStyle: ViewStyle = padded
    ? {
        paddingHorizontal: layout.screenPadding,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
      }
    : {};

  const topPad: ViewStyle =
    safeTop && !padded ? { paddingTop: insets.top } : safeTop && padded ? { paddingTop: insets.top + spacing.md } : {};

  const safeEdges: Edge[] = edges ?? (safeTop ? ['left', 'right', 'bottom'] : undefined) ?? ['left', 'right', 'bottom'];

  let body: React.ReactNode;

  if (scroll) {
    body = (
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          padStyle,
          topPad,
          fill && styles.scrollGrow,
          contentContainerStyle,
          style,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces
        {...rest}
      >
        {children}
      </ScrollView>
    );
  } else {
    body = (
      <View style={[styles.fill, padStyle, topPad, style]} {...rest}>
        {children}
      </View>
    );
  }

  if (keyboard) {
    body = (
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
      >
        {body}
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={safeEdges}>
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  fill: { flex: 1 },
  scrollGrow: { flexGrow: 1 },
});
