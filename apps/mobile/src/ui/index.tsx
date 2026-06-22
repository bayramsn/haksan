/** Yeniden kullanılabilir mobil bileşen kiti. Tüm modül ekranları bunları kullanır. */
import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { colors, font, radius, spacing } from './theme';

export { colors, font, radius, spacing } from './theme';

/** Kaydırılabilir, pull-to-refresh destekli sayfa gövdesi. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  contentStyle,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
}) {
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={[s.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={s.muted}>{children}</Text>;
}

/** Liste satırı — sol başlık/altyazı, sağ değer/işaret. Dokunulabilir. */
export function ListRow({
  title,
  subtitle,
  right,
  onPress,
}: {
  title: string;
  subtitle?: string | null;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={s.row} onPress={onPress} activeOpacity={0.7}>
      <View style={s.flex}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.rowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={s.rowRight}>{right}</View> : onPress ? <Text style={s.chevron}>›</Text> : null}
    </Wrapper>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, ...inputProps } = props;
  return (
    <View style={s.field}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput style={s.input} placeholderTextColor={colors.textSubtle} {...inputProps} />
    </View>
  );
}

export function SearchBar(props: TextInputProps) {
  return <TextInput style={[s.input, s.search]} placeholderTextColor={colors.textSubtle} autoCapitalize="none" {...props} />;
}

export function Button({
  label,
  onPress,
  loading,
  variant = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const isGhost = variant === 'ghost';
  return (
    <TouchableOpacity
      disabled={loading || disabled}
      onPress={onPress}
      activeOpacity={0.8}
      style={[s.button, isGhost && s.buttonGhost, variant === 'danger' && s.buttonDanger, (loading || disabled) && s.buttonDisabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={isGhost ? colors.text : colors.primaryText} />
      ) : (
        <Text style={[s.buttonText, isGhost && s.buttonGhostText]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' }) {
  const map: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: colors.chip, fg: colors.textMuted },
    ok: { bg: colors.okSoft, fg: colors.okText },
    warn: { bg: colors.warnSoft, fg: colors.warn },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    accent: { bg: colors.accentSoft, fg: colors.accent },
  };
  const t = map[tone];
  return (
    <View style={[s.badge, { backgroundColor: t.bg }]}>
      <Text style={[s.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** Enum/seçenek grubu — yatay chip'ler. Form alanlarında kullanılır. */
export function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={s.field}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.optionRow}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <TouchableOpacity key={opt.value} style={[s.option, active && s.optionActive]} onPress={() => onChange(opt.value)}>
              <Text style={[s.optionText, active && s.optionTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={s.loading}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: { color: colors.text, ...font.title },
  muted: { color: colors.textMuted, ...font.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  flex: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  rowSubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  chevron: { color: colors.textSubtle, fontSize: 22, fontWeight: '700' },
  field: { gap: spacing.xs },
  label: { color: '#334155', ...font.label },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 15,
  },
  search: { minHeight: 42 },
  button: {
    minHeight: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonGhost: { backgroundColor: colors.chip },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.primaryText, fontSize: 15, fontWeight: '800' },
  buttonGhostText: { color: colors.text },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '800' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { backgroundColor: colors.chip, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  optionActive: { backgroundColor: colors.primary },
  optionText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  optionTextActive: { color: colors.primaryText },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
