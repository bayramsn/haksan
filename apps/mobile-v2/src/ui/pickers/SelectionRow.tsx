import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/theme';

/** Seçici panellerinde tek/çoklu seçim için ortak, geniş dokunma alanı. */
export function SelectionRow({ label, hint, selected, multiple, onPress }: {
  label: string;
  hint?: string | null;
  selected: boolean;
  multiple?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={`my-1 min-h-14 flex-row items-center gap-3 rounded-surface border px-4 py-3 active:opacity-70 ${selected ? 'border-primary bg-primary-soft' : 'border-border bg-card'}`}
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text className={`font-inter-medium text-[15px] leading-5 ${selected ? 'text-primary' : 'text-foreground'}`}>{label}</Text>
        {hint ? <Text className="font-inter text-xs leading-4 text-muted-foreground">{hint}</Text> : null}
      </View>
      <Ionicons
        name={multiple ? (selected ? 'checkbox' : 'square-outline') : (selected ? 'checkmark-circle' : 'ellipse-outline')}
        size={22}
        color={selected ? colors.primary : colors.mutedForeground}
      />
    </Pressable>
  );
}
