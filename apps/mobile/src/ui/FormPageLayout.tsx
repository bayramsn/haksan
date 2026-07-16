import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '@/src/ui/PageHeader';
import { Screen } from '@/src/ui/Screen';
import { colors, fonts, layout, spacing, typography } from '@/src/theme/tokens';
import { pressFade } from '@/src/theme/styles';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  showBack?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Stitch form / sheet ekranları — navy header + scroll form gövdesi */
export function FormPageLayout({ title, subtitle, children, showBack = true, contentStyle }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <PageHeader roundedBottom={false}>
        {showBack ? (
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressFade(pressed)]} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </PageHeader>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.body, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { marginBottom: spacing.xs, alignSelf: 'flex-start' },
  title: { ...typography.headline, color: '#fff' },
  subtitle: { ...typography.bodySm, color: 'rgba(255,255,255,0.85)' },
  body: {
    padding: layout.screenPadding,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
});
