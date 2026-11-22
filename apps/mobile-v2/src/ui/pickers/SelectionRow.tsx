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
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={`my-0.5 min-h-12 flex-row items-center gap-2.5 rounded-surface border px-3.5 py-2 active:opacity-70 ${selected ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className={`font-inter-medium text-[14px] leading-5 ${selected ? 'text-primary' : 'text-foreground'}`}>{label}</Text>
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
