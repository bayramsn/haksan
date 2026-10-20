import { forwardRef, type ReactNode } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { sheetContainerComponent } from '@/src/ui/pickers/sheetContainer';

/** Satış ekranlarının ortak alt sayfası: içerik kadar uzar, ekranın %88'ini aşınca kayar. */
export const SalesSheet = forwardRef<
  BottomSheetModal,
  { title: string; subtitle?: string; children: ReactNode; onDismiss?: () => void }
>(function SalesSheet({ title, subtitle, children, onDismiss }, ref) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      maxDynamicContentSize={Math.round(height * 0.88)}
      onDismiss={onDismiss}
      containerComponent={sheetContainerComponent}
      backgroundStyle={{ backgroundColor: colors.card }}
      handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
      backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
    >
      <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 }}>
        <View className="gap-0.5">
          <Text accessibilityRole="header" className="font-display-semibold text-[18px] text-foreground" numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text className="font-inter text-[13px] text-muted-foreground">{subtitle}</Text> : null}
        </View>
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

/** Alt sayfa içindeki tek dokunuşluk işlem satırı (≥44pt). */
export function SheetOption({
  label,
  hint,
  icon,
  tone = 'neutral',
  selected,
  disabled,
  onPress,
}: {
  label: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const color = tone === 'neutral' ? colors.foreground : toneColor(colors, tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[50px] flex-row items-center gap-3 rounded-[12px] border px-3.5 py-2.5 active:opacity-70 ${
        selected ? 'border-primary bg-secondary' : 'border-border bg-card'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {icon ? <Ionicons name={icon} size={20} color={selected ? colors.primary : color} /> : null}
      <View className="min-w-0 flex-1">
        <Text className="font-inter-medium text-[15px]" style={{ color: selected ? colors.primary : color }} numberOfLines={2}>
          {label}
        </Text>
        {hint ? <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={3}>{hint}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

/** Sarmalanan seçim pilleri (filtre/para birimi/kanal). `null` = seçim yok. */
export function PillGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  allowClear = true,
  tone = 'primary',
}: {
  label?: string;
  options: { value: T; label: string; count?: number }[];
  value: T | null;
  onChange: (next: T | null) => void;
  allowClear?: boolean;
  tone?: 'primary' | 'destructive';
}) {
  const activeClass = tone === 'destructive' ? 'border-destructive bg-destructive-soft' : 'border-primary bg-primary';
  const activeText = tone === 'destructive' ? 'text-destructive' : 'text-primary-foreground';
  return (
    <View className="gap-1.5">
      {label ? <Text className="font-inter-medium text-[13px] text-muted-foreground">{label}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.count !== undefined ? `${option.label}, ${option.count}` : option.label}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(active && allowClear ? null : option.value)}
              className={`min-h-[44px] flex-row items-center gap-1.5 rounded-full border px-3.5 ${active ? activeClass : 'border-border bg-card'}`}
            >
              <Text className={`font-inter-medium text-[13px] ${active ? activeText : 'text-foreground'}`}>{option.label}</Text>
              {option.count !== undefined ? (
                <Text className={`font-inter text-[11px] ${active ? activeText : 'text-muted-foreground'}`}>{option.count}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
