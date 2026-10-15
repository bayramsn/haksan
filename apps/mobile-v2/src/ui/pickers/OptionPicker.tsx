import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, SearchBar } from '@/src/ui';
import { PickerField, useSheetProps } from './PickerField';

export type PickerOption = { value: string; label: string; hint?: string | null };

/**
 * Tek seçimli liste seçici. `allowFreeText` web FreeTextCombobox karşılığı:
 * listede olmayan değeri arama kutusundan "… kullan" ile seçtirir.
 */
export function OptionPicker({
  label,
  value,
  options,
  placeholder = 'Seçin',
  icon = 'list-outline',
  error,
  disabled,
  searchable,
  allowFreeText,
  clearable,
  onChange,
  onFreeText,
  displayValue,
}: {
  label: string;
  value: string | null;
  options: PickerOption[];
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  disabled?: boolean;
  searchable?: boolean;
  allowFreeText?: boolean;
  clearable?: boolean;
  onChange: (value: string | null) => void;
  onFreeText?: (text: string) => void;
  displayValue?: string;
}) {
  const { colors } = useTheme();
  const sheet = useRef<BottomSheetModal>(null);
  const sheetProps = useSheetProps(options.length > 8 || searchable ? '80%' : '50%');
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase('tr');
  const filtered = useMemo(
    () => (term ? options.filter((option) => option.label.toLocaleLowerCase('tr').includes(term)) : options),
    [options, term],
  );
  const selectedLabel = displayValue ?? options.find((option) => option.value === value)?.label ?? '';

  function choose(next: string | null) {
    onChange(next);
    setSearch('');
    sheet.current?.dismiss();
  }

  return (
    <>
      <PickerField
        label={label}
        value={selectedLabel}
        placeholder={placeholder}
        icon={icon}
        error={error}
        disabled={disabled}
        onPress={() => sheet.current?.present()}
        onClear={clearable ? () => onChange(null) : undefined}
      />
      <BottomSheetModal ref={sheet} {...sheetProps}>
        <BottomSheetView className="gap-3 px-4 pb-2">
          <Text accessibilityRole="header" className="font-inter-semibold text-base text-foreground">{label}</Text>
          {searchable || allowFreeText ? (
            <SearchBar value={search} onChange={setSearch} placeholder={allowFreeText ? 'Seçin veya yazın…' : 'Ara'} />
          ) : null}
          {allowFreeText && search.trim() && !options.some((option) => option.label.toLocaleLowerCase('tr') === term) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onFreeText?.(search.trim());
                setSearch('');
                sheet.current?.dismiss();
              }}
              className="min-h-12 flex-row items-center gap-3 rounded-control bg-primary-soft px-3 active:opacity-70"
            >
              <Ionicons name="create-outline" size={18} color={colors.primary} />
              <Text className="flex-1 font-inter-medium text-sm text-primary" numberOfLines={1}>“{search.trim()}” kullan</Text>
            </Pressable>
          ) : null}
        </BottomSheetView>
        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(item: PickerOption) => item.value}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }: { item: PickerOption }) => {
            const selected = item.value === value;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => choose(item.value)}
                className="min-h-[52px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
              >
                <View className="flex-1">
                  <Text className={`font-inter text-[15px] ${selected ? 'font-inter-semibold text-primary' : 'text-foreground'}`}>{item.label}</Text>
                  {item.hint ? <Text className="font-inter text-xs text-muted-foreground">{item.hint}</Text> : null}
                </View>
                {selected ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<EmptyState title="Seçenek bulunamadı" />}
        />
      </BottomSheetModal>
    </>
  );
}

/** Çoklu seçim (ör. Bağlı Bulunduğu Birim). */
export function MultiOptionPicker({
  label,
  values,
  options,
  placeholder = 'Seçin',
  icon = 'layers-outline',
  error,
  onChange,
}: {
  label: string;
  values: string[];
  options: PickerOption[];
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  onChange: (values: string[]) => void;
}) {
  const { colors } = useTheme();
  const sheet = useRef<BottomSheetModal>(null);
  const sheetProps = useSheetProps('60%');
  const summary = options.filter((option) => values.includes(option.value)).map((option) => option.label).join(', ');

  return (
    <>
      <PickerField label={label} value={summary} placeholder={placeholder} icon={icon} error={error} onPress={() => sheet.current?.present()} />
      <BottomSheetModal ref={sheet} {...sheetProps}>
        <BottomSheetView className="gap-1 px-4 pb-10">
          <Text accessibilityRole="header" className="pb-2 font-inter-semibold text-base text-foreground">{label}</Text>
          {options.length === 0 ? <EmptyState title="Seçenek bulunamadı" /> : null}
          {options.map((option) => {
            const selected = values.includes(option.value);
            return (
              <Pressable
                key={option.value}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => onChange(selected ? values.filter((item) => item !== option.value) : [...values, option.value])}
                className="min-h-[52px] flex-row items-center gap-3 border-b border-border active:opacity-70"
              >
                <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={21} color={selected ? colors.primary : colors.mutedForeground} />
                <Text className="flex-1 font-inter text-[15px] text-foreground">{option.label}</Text>
              </Pressable>
            );
          })}
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}
