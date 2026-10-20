import { useMemo, useState, type RefObject } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, SearchBar } from '@/src/ui';
import { sheetProps } from '@/src/ui/documents/pickers';

export type SheetOption = { value: string; label: string; subtitle?: string | null };

const norm = (value: string) => value.toLocaleLowerCase('tr-TR').trim();

/**
 * Aranabilir tekli seçim alt sayfası. `createLabel` verilirse listede olmayan
 * yazılmış değer de seçilebilir (web Combobox `onCreate` karşılığı).
 */
export function OptionSheet({
  sheetRef,
  title,
  options,
  selected,
  onSelect,
  searchPlaceholder = 'Ara',
  emptyText = 'Sonuç bulunamadı',
  createLabel,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  title: string;
  options: SheetOption[];
  selected?: string | null;
  onSelect: (value: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  createLabel?: (typed: string) => string;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const typed = search.trim();
  const filtered = useMemo(() => {
    const q = norm(search);
    return q ? options.filter((o) => norm(o.label).includes(q) || norm(o.subtitle ?? '').includes(q)) : options;
  }, [options, search]);
  const canCreate = Boolean(createLabel && typed && !options.some((o) => norm(o.value) === norm(typed)));

  const choose = (value: string) => {
    onSelect(value);
    setSearch('');
    sheetRef.current?.dismiss();
  };

  const header = (
    <View className="gap-3 bg-card pb-2">
      <Text className="font-display text-base text-foreground">{title}</Text>
      {options.length > 6 || createLabel ? <SearchBar value={search} onChange={setSearch} placeholder={searchPlaceholder} /> : null}
      {canCreate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={createLabel!(typed)}
          onPress={() => choose(typed)}
          className="min-h-[48px] flex-row items-center gap-3 rounded-control border border-dashed border-primary px-3 active:opacity-70"
        >
          <Ionicons name="add-circle-outline" size={19} color={colors.primary} />
          <Text className="flex-1 font-inter-semibold text-sm text-primary" numberOfLines={2}>
            {createLabel!(typed)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <BottomSheetModal ref={sheetRef} {...sheetProps(colors)} onDismiss={() => setSearch('')}>
      <BottomSheetFlatList
        data={filtered}
        keyExtractor={(item: SheetOption) => item.value}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        renderItem={({ item }: { item: SheetOption }) => {
          const isSelected = item.value === selected;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={item.label}
              onPress={() => choose(item.value)}
              className="min-h-[52px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
            >
              <View className="flex-1">
                <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={2}>
                  {item.label}
                </Text>
                {item.subtitle ? (
                  <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
              {isSelected ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={canCreate ? null : <EmptyState title={emptyText} />}
      />
    </BottomSheetModal>
  );
}
