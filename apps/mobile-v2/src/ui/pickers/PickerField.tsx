import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useTheme } from '@/src/theme/theme';

/** Açılır seçici alanı: formlarda elle metin girişi yerine dokunulur. */
export function PickerField({
  label,
  value,
  placeholder,
  icon,
  error,
  disabled,
  onPress,
  onClear,
}: {
  label: string;
  value: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string;
  disabled?: boolean;
  onPress: () => void;
  onClear?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-1.5">
      <Text className="font-inter-medium text-[13px] text-muted-foreground">{label}</Text>
      <View
        className={`min-h-14 flex-row items-center rounded-control border bg-input-background ${error ? 'border-destructive' : 'border-border'} ${disabled ? 'opacity-50' : ''}`}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value || placeholder}`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          className="min-h-14 flex-1 flex-row items-center gap-3 px-3 active:opacity-70"
        >
          <View className="h-8 w-8 items-center justify-center rounded-lg bg-primary-soft">
            <Ionicons name={icon} size={18} color={colors.primary} />
          </View>
          <Text
            className={`flex-1 font-inter text-base ${value ? 'text-foreground' : 'text-muted-foreground'}`}
            numberOfLines={1}
          >
            {value || placeholder}
          </Text>
          {!onClear || !value ? <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} /> : null}
        </Pressable>
        {onClear && value && !disabled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label} seçimini temizle`}
            onPress={onClear}
            className="h-12 w-11 items-center justify-center active:opacity-60"
          >
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text selectable accessibilityLiveRegion="polite" className="font-inter text-xs text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Seçici sayfalarının ortak bottom sheet ayarları. */
export function useSheetProps(snap: string = '80%') {
  const { colors } = useTheme();
  return {
    snapPoints: [snap],
    enableDynamicSizing: false,
    enablePanDownToClose: true,
    keyboardBehavior: 'extend' as const,
    keyboardBlurBehavior: 'restore' as const,
    backgroundStyle: { backgroundColor: colors.card },
    handleIndicatorStyle: { backgroundColor: colors.mutedForeground },
    backdropComponent: (props: Parameters<typeof BottomSheetBackdrop>[0]) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
    ),
  };
}
