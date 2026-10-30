import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chipClass, chipTextClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Eyebrow } from '@/src/ui';
import { formatPeriodLabel, shiftPeriod } from './target-model';

/** Tek seçim: mobilde açılır liste yerine dokunmatik çip dizisi. */
export function ChipSelect<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label?: string;
  options: { value: T; label: string; tone?: Tone }[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <View className="gap-2">
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value;
          const tone: Tone = active ? option.tone ?? 'info' : 'neutral';
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              className={`min-h-11 justify-center rounded-full border px-3 ${chipClass[tone]} ${active ? '' : 'opacity-75'} ${disabled ? 'opacity-50' : ''} active:opacity-60`}
            >
              <Text className={`font-inter-medium text-[13px] ${chipTextClass[tone]}`}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Çoklu seçim çipleri; `badge` seçili öğede ek etiket (ör. "Birincil"). */
export function MultiChipSelect({
  label,
  hint,
  options,
  values,
  onToggle,
  badgeFor,
  disabled,
}: {
  label?: string;
  hint?: string;
  options: { value: string; label: string }[];
  values: string[];
  onToggle: (value: string, checked: boolean) => void;
  badgeFor?: (value: string) => string | null;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-2">
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      {hint ? <Text className="font-inter text-[12px] text-muted-foreground">{hint}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const active = values.includes(option.value);
          const tone: Tone = active ? 'info' : 'neutral';
          const badge = active ? badgeFor?.(option.value) : null;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="checkbox"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: active, disabled }}
              disabled={disabled}
              onPress={() => onToggle(option.value, !active)}
              className={`min-h-11 flex-row items-center gap-1.5 rounded-full border px-3 ${chipClass[tone]} ${disabled ? 'opacity-50' : ''} active:opacity-60`}
            >
              {active ? <Ionicons name="checkmark" size={14} color={toneColor(colors, 'info')} /> : null}
              <Text className={`font-inter-medium text-[13px] ${chipTextClass[tone]}`}>{option.label}</Text>
              {badge ? <Text className={`font-inter-semibold text-[11px] ${chipTextClass[tone]}`}>· {badge}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Onay kutulu satır (rol atama, kullanıcı seçimi). */
export function CheckRow({
  title,
  subtitle,
  checked,
  onToggle,
  badge,
  disabled,
}: {
  title: string;
  subtitle?: string | null;
  checked: boolean;
  onToggle: () => void;
  badge?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={title}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onToggle}
      className={`min-h-[52px] flex-row items-center gap-3 rounded-control border border-border bg-card px-3 py-2.5 ${disabled ? 'opacity-50' : ''} active:opacity-70`}
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.primary : colors.mutedForeground} />
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="font-inter-medium text-[15px] text-foreground" numberOfLines={1}>
            {title}
          </Text>
          {badge ? (
            <View className={`rounded-full border px-2 py-0.5 ${chipClass.neutral}`}>
              <Text className={`font-inter-medium text-[10px] ${chipTextClass.neutral}`}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className="min-h-[56px] flex-row items-center gap-3 rounded-control border border-border bg-card px-3.5 py-2.5">
      <View className="flex-1 gap-0.5">
        <Text className="font-inter-medium text-[15px] text-foreground">{title}</Text>
        {subtitle ? <Text className="font-inter text-[12px] text-muted-foreground">{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={title}
        trackColor={{ true: colors.primary, false: colors.lineStrong }}
      />
    </View>
  );
}

/** Uyarı / bilgi kutusu. */
export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: React.ReactNode }) {
  const { colors } = useTheme();
  const icon: keyof typeof Ionicons.glyphMap =
    tone === 'destructive' || tone === 'warning' ? 'alert-circle-outline' : tone === 'success' ? 'shield-checkmark-outline' : 'information-circle-outline';
  return (
    <View className={`flex-row gap-2.5 rounded-control border px-3 py-2.5 ${chipClass[tone]}`}>
      <Ionicons name={icon} size={18} color={toneColor(colors, tone)} />
      <View className="flex-1 gap-0.5">
        {title ? <Text className={`font-inter-semibold text-[13px] ${chipTextClass[tone]}`}>{title}</Text> : null}
        {typeof children === 'string' ? (
          <Text className="font-inter text-[12px] leading-[17px] text-foreground">{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/** Kart içi ikincil eylem düğmesi (Düzenle, Rol Ata, Sil ...). 44pt dokunma alanı. */
export function ActionPill({
  icon,
  label,
  onPress,
  tone = 'neutral',
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 flex-row items-center gap-1.5 rounded-control border px-3 ${chipClass[tone]} ${disabled ? 'opacity-40' : ''} active:opacity-60`}
    >
      <Ionicons name={icon} size={15} color={toneColor(colors, tone)} />
      <Text className={`font-inter-medium text-[13px] ${chipTextClass[tone]}`}>{label}</Text>
    </Pressable>
  );
}

/** Ay seçici: web'deki `<input type="month">` karşılığı. */
export function PeriodStepper({ period, onChange }: { period: string; onChange: (next: string) => void }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center justify-between rounded-control border border-border bg-card px-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Önceki ay"
        onPress={() => onChange(shiftPeriod(period, -1))}
        className="h-11 w-11 items-center justify-center active:opacity-60"
      >
        <Ionicons name="chevron-back" size={20} color={colors.foreground} />
      </Pressable>
      <Text accessibilityLiveRegion="polite" className="font-inter-semibold text-[15px] text-foreground">
        Hedef dönemi · {formatPeriodLabel(period)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sonraki ay"
        onPress={() => onChange(shiftPeriod(period, 1))}
        className="h-11 w-11 items-center justify-center active:opacity-60"
      >
        <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

/** Yıkıcı işlem onayı (web AlertDialog karşılığı). */
export function confirmDestructive(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: confirmLabel, onPress: onConfirm },
  ]);
}
