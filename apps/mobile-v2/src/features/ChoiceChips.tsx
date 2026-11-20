import { Pressable, Text, View } from 'react-native';

/** Form içi tek seçim (radyo) çipleri; FilterChips'in aksine "Tümü" ve ekran kenar boşluğu yok. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (next: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            className={`min-h-10 justify-center rounded-full border px-3.5 ${active ? 'border-primary bg-primary' : 'border-border bg-card'}`}
          >
            <Text className={`font-inter-medium text-[13px] ${active ? 'text-primary-foreground' : 'text-foreground'}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
