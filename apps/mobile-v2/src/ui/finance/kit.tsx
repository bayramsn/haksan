import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { chipClass, SCREEN_PAD, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Button } from '@/src/ui';
import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { toast } from '@/src/ui/toast';

/** Modal form iskeleti: başlık, klavye kaçışı, altta Vazgeç + birincil eylem. */
export function FormScreen({
  title,
  children,
  submitLabel = 'Kaydet',
  onSubmit,
  submitting,
  submitDisabled,
  footer,
}: {
  title: string;
  children: ReactNode;
  submitLabel?: string;
  onSubmit?: () => void;
  submitting?: boolean;
  submitDisabled?: boolean;
  footer?: ReactNode;
}) {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title, headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ??
          (onSubmit ? (
            <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
              <View className="flex-1">
                <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} />
              </View>
              <View className="flex-[2]">
                <Button
                  label={submitLabel}
                  loading={submitting}
                  disabled={submitting || submitDisabled}
                  onPress={onSubmit}
                />
              </View>
            </View>
          ) : null)}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Etiketli anahtar satırı (44pt). */
export function SwitchRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className="min-h-[48px] flex-row items-center gap-3 rounded-control border border-border bg-card px-3.5 py-2">
      <View className="flex-1">
        <Text className="font-inter-medium text-sm text-foreground">{label}</Text>
        {hint ? <Text className="font-inter text-xs text-muted-foreground">{hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.muted }}
      />
    </View>
  );
}

/** Küçük seçenek düğmeleri (para birimi, KDV, tür). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View className="gap-1.5">
      {label ? <Text className="font-inter-medium text-[13px] text-muted-foreground">{label}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={label ? `${label}: ${option.label}` : option.label}
              onPress={() => onChange(option.value)}
              className={`min-h-[44px] items-center justify-center rounded-control border px-3.5 ${selected ? 'border-primary bg-primary' : 'border-border bg-card'}`}
            >
              <Text className={`font-inter-semibold text-[13px] ${selected ? 'text-primary-foreground' : 'text-foreground'}`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Web `MiniKpi`: ikon, etiket, büyük değer ve gri alt satır. */
export function KpiTile({
  icon,
  label,
  value,
  sub,
  tone = 'neutral',
  onPress,
  selected,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  onPress?: () => void;
  selected?: boolean;
}) {
  const { colors } = useTheme();
  const body = (
    <View
      className={`flex-1 gap-1.5 rounded-surface border bg-card p-3 ${selected ? 'border-primary' : 'border-border'}`}
      style={{ borderCurve: 'continuous' }}
    >
      <View className="flex-row items-center gap-2">
        <View className={`h-8 w-8 items-center justify-center rounded-full border ${chipClass[tone]}`}>
          <Ionicons name={icon} size={15} color={toneColor(colors, tone)} />
        </View>
        <Text className="flex-1 font-inter text-[12px] text-muted-foreground" numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text
        className="font-inter-bold text-[20px] text-foreground"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
      {sub ? (
        <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      className="flex-1 active:opacity-70"
    >
      {body}
    </Pressable>
  );
}

/** İkili satırlar halinde KPI ızgarası. */
export function KpiGrid({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean);
  const rows: ReactNode[][] = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));
  return (
    <View style={{ paddingHorizontal: SCREEN_PAD }} className="gap-2.5">
      {rows.map((row, index) => (
        <View key={index} className="flex-row gap-2.5">
          {row}
          {row.length < 2 ? <View className="flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}

/** Başlıklı kart bölümü. */
export function Panel({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View
      style={{ marginHorizontal: SCREEN_PAD, borderCurve: 'continuous' }}
      className="gap-3 rounded-surface border border-border bg-card p-4"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text accessibilityRole="header" className="font-display-semibold text-[17px] text-foreground">
            {title}
          </Text>
          {subtitle ? <Text className="font-inter text-xs text-muted-foreground">{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Küçük metin buton (çerçeveli), 44pt dokunma alanı. */
export function SmallButton({
  label,
  icon,
  onPress,
  tone = 'neutral',
  disabled,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const color = tone === 'neutral' ? colors.foreground : toneColor(colors, tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[44px] flex-row items-center gap-1.5 rounded-control border border-border bg-card px-3 active:opacity-70 ${disabled ? 'opacity-50' : ''}`}
    >
      {icon ? <Ionicons name={icon} size={16} color={color} /> : null}
      <Text className="font-inter-medium text-[13px]" style={{ color }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Yatay oransal çubuk (dağılım/yaşlandırma). */
export function ShareBar({ ratio, tone = 'info' }: { ratio: number; tone?: Tone }) {
  const { colors } = useTheme();
  const width = `${Math.max(0, Math.min(1, ratio)) * 100}%` as const;
  return (
    <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.muted }}>
      <View className="h-full rounded-full" style={{ width, backgroundColor: toneColor(colors, tone) }} />
    </View>
  );
}

const pad = (value: number) => String(value).padStart(2, '0');

export const toDateInput = (date: Date | null) =>
  date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '';

export function fromDateInput(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** `YYYY-AA-GG` metniyle çalışan tarih alanı. */
export function DateInputField({
  label,
  value,
  onChange,
  error,
  clearable = true,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  clearable?: boolean;
  disabled?: boolean;
}) {
  return (
    <DateTimeField
      label={label}
      mode="date"
      value={fromDateInput(value)}
      onChange={(next) => onChange(toDateInput(next))}
      error={error}
      clearable={clearable}
      disabled={disabled}
    />
  );
}

/** Excel/PDF indirme: hata kullanıcıya toast ile gösterilir. */
export async function runExport(task: () => Promise<void>, label = 'Dışa aktarılamadı') {
  try {
    await task();
  } catch (error) {
    toast.error(error instanceof Error && error.message ? error.message : label);
  }
}

/** Tek satır anahtar/değer (sağda tutar). */
export function AmountLine({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center justify-between gap-3 py-1.5">
      <Text className="flex-1 font-inter text-[13px] text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className="font-inter-semibold text-[13px]"
        style={{ color: tone ? toneColor(colors, tone) : colors.foreground, fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}
