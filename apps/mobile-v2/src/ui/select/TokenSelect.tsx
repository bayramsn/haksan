import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/theme';
import { SearchSelect, type SelectItem } from './SearchSelect';
import { joinTokens, splitTokens } from './select-logic';

/**
 * Virgüllü metin olarak saklanan çoklu seçim (ör. "Bursa, İstanbul"): seçilenler
 * çip olarak görünür, yenisi listeden aranarak eklenir.
 */
export function TokenSelect({
  label,
  value,
  onChange,
  options,
  optionsLoading,
  allowCustom,
  icon = 'add-circle-outline',
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectItem[];
  optionsLoading?: boolean;
  allowCustom?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const tokens = splitTokens(value);
  const labelOf = (token: string) => options.find((o) => o.id === token)?.label ?? token;
  const remaining = options.filter((o) => !tokens.includes(o.id));

  return (
    <View className="gap-2">
      <SearchSelect
        label={label}
        placeholder={tokens.length ? `${label} ekle` : `${label} seçin`}
        icon={icon}
        value=""
        onSelect={(item) => {
          if (!item) return;
          onChange(joinTokens([...tokens, item.id || item.label]));
        }}
        options={remaining}
        optionsLoading={optionsLoading}
        allowCustom={allowCustom}
        disabled={disabled}
      />
      {tokens.length ? (
        <View className="flex-row flex-wrap gap-2">
          {tokens.map((token) => (
            <Pressable
              key={token}
              accessibilityRole="button"
              accessibilityLabel={`${labelOf(token)} kaldır`}
              disabled={disabled}
              onPress={() => onChange(joinTokens(tokens.filter((t) => t !== token)))}
              className="min-h-9 flex-row items-center gap-1.5 rounded-full border border-primary bg-secondary px-3 active:opacity-70"
            >
              <Text className="font-inter-medium text-[13px] text-primary">{labelOf(token)}</Text>
              {!disabled ? <Ionicons name="close" size={14} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
