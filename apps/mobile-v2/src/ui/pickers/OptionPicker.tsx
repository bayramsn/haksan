import { filterOptions } from '@/src/ui/select/select-logic';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';
import { HostedSheet } from './HostedSheet';
import { PickerField } from './PickerField';
import { SelectionRow } from './SelectionRow';
import { SelectionStatus } from './SelectionStatus';

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
  loading,
  loadError,
  onRetry,
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
  loading?: boolean;
  loadError?: Error | null;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase('tr');
  const filtered = useMemo(
    () => filterOptions(options.map((option) => ({ ...option, id: option.value })), search),
    [options, search],
  );
  const selectedLabel = displayValue ?? options.find((option) => option.value === value)?.label ?? '';

  function choose(next: string | null) {
    onChange(next);
    setSearch('');
    setOpen(false);
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
        onPress={() => setOpen(true)}
        onClear={clearable ? () => onChange(null) : undefined}
      />
      <HostedSheet
        open={open}
        onClose={() => {
          setSearch('');
          setOpen(false);
        }}
        heightRatio={options.length > 8 || searchable ? 0.8 : 0.5}
      >
        <View className="min-h-0 flex-1">
          <View className="gap-3 border-b border-border px-4 pb-3">
            <Text accessibilityRole="header" className="font-display-semibold text-[22px] text-foreground">
              {label}
            </Text>
            {searchable || allowFreeText || options.length > 8 ? (
              <SearchBar value={search} onChange={setSearch} placeholder={allowFreeText ? 'Seçin veya yazın…' : 'Ara'} />
            ) : null}
            <SelectionStatus loading={loading} error={loadError} onRetry={onRetry} />
            {allowFreeText && !loading && !loadError && search.trim() && !options.some((option) => option.label.toLocaleLowerCase('tr') === term) ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onFreeText?.(search.trim());
                  setSearch('');
                  setOpen(false);
                }}
                className="min-h-12 flex-row items-center gap-3 rounded-control bg-primary-soft px-3 active:opacity-70"
              >
                <Ionicons name="create-outline" size={18} color={colors.primary} />
                <Text className="flex-1 font-inter-medium text-sm text-primary" numberOfLines={1}>
                  “{search.trim()}” kullan
                </Text>
              </Pressable>
            ) : null}
          </View>
          <FlatList
            className="flex-1"
            data={filtered}
            keyExtractor={(item) => item.value}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item }) => {
              const selected = item.value === value;
              return (
                <SelectionRow label={item.label} hint={item.hint} selected={selected} onPress={() => choose(item.value)} />
              );
            }}
            ListEmptyComponent={loading ? <Loading /> : loadError ? <ErrorState message={loadError.message} onRetry={onRetry} /> : <EmptyState title="Seçenek bulunamadı" />}
          />
        </View>
      </HostedSheet>
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
  loading,
  loadError,
  onRetry,
  onChange,
}: {
  label: string;
  values: string[];
  options: PickerOption[];
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  loading?: boolean;
  loadError?: Error | null;
  onRetry?: () => void;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = filterOptions(options.map((option) => ({ ...option, id: option.value })), search);
  const summary = options.filter((option) => values.includes(option.value)).map((option) => option.label).join(', ');

  return (
    <>
      <PickerField label={label} value={summary} placeholder={placeholder} icon={icon} error={error} onPress={() => { setSearch(''); setOpen(true); }} />
      <HostedSheet open={open} onClose={() => setOpen(false)} heightRatio={0.8}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" className="pb-2 font-inter-semibold text-base text-foreground">
            {label}
          </Text>
          <SearchBar value={search} onChange={setSearch} placeholder="Seçenek ara" />
          <SelectionStatus loading={loading} error={loadError} onRetry={onRetry} />
          {filtered.length === 0 && !loading && !loadError ? <EmptyState title="Seçenek bulunamadı" /> : null}
          {filtered.map((option) => {
            const selected = values.includes(option.value);
            return (
              <SelectionRow
                key={option.value}
                label={option.label}
                hint={option.hint}
                selected={selected}
                multiple
                onPress={() => onChange(selected ? values.filter((item) => item !== option.value) : [...values, option.value])}
              />
            );
          })}
        </ScrollView>
        <View className="px-4 pb-2 pt-2"><Button label={`Tamam (${values.length} seçili)`} onPress={() => setOpen(false)} /></View>
      </HostedSheet>
    </>
  );
}
