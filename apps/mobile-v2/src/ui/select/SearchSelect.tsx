import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';
import { PickerField, useSheetProps } from '@/src/ui/pickers/PickerField';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { filterOptions, hasExactOption } from './select-logic';

export type SelectItem<T = unknown> = { id: string; label: string; hint?: string | null; data?: T };

/** Sunucuda arama yapan kaynak; sayfalı listeler için sonsuz kaydırma alanları opsiyonel. */
export type RemoteOptions<T> = {
  items: SelectItem<T>[];
  isPending: boolean;
  error: Error | null;
  refetch: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
};

type Props<T> = {
  label: string;
  placeholder: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Alanda görünen seçili metin (kayıtlı seçim ya da elle yazılan değer). */
  value: string;
  selectedId?: string | null;
  onSelect: (item: SelectItem<T> | null) => void;
  /** Sabit liste: arama istemcide yapılır. */
  options?: SelectItem<T>[];
  optionsLoading?: boolean;
  /** Veritabanı araması: sheet açıkken çağrılır, arama terimi gecikmeli gelir. */
  useRemote?: (search: string) => RemoteOptions<T>;
  /** Listede yoksa aranan metni değer olarak kullanma satırı (id boş döner). */
  allowCustom?: boolean;
  searchPlaceholder?: string;
  emptyTitle?: string;
  error?: string;
  disabled?: boolean;
  clearable?: boolean;
};

export function SearchSelect<T>(props: Props<T>) {
  const sheet = useRef<BottomSheetModal>(null);
  const sheetProps = useSheetProps('70%');
  const [open, setOpen] = useState(false);
  return (
    <>
      <PickerField
        label={props.label}
        value={props.value}
        placeholder={props.placeholder}
        icon={props.icon}
        error={props.error}
        disabled={props.disabled}
        onPress={() => sheet.current?.present()}
        onClear={props.clearable ? () => props.onSelect(null) : undefined}
      />
      <BottomSheetModal
        ref={sheet}
        {...sheetProps}
        enablePanDownToClose
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        onChange={(index) => setOpen(index >= 0)}
      >
        {open ? (
          <SheetBody
            {...props}
            onPick={(item) => {
              props.onSelect(item);
              sheet.current?.dismiss();
            }}
          />
        ) : (
          <BottomSheetView className="h-16">
            <View />
          </BottomSheetView>
        )}
      </BottomSheetModal>
    </>
  );
}

const NO_REMOTE = () => null;

/** Sheet içeriği yalnız açıkken bağlanır; uzak sorgu da ancak o zaman çalışır. */
function SheetBody<T>({
  label,
  options,
  optionsLoading,
  useRemote,
  allowCustom,
  searchPlaceholder,
  emptyTitle,
  selectedId,
  onPick,
}: Props<T> & { onPick: (item: SelectItem<T>) => void }) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), 300);
  const remote = (useRemote ?? NO_REMOTE)(term);
  const items = useMemo(
    () => (remote ? remote.items : filterOptions(options ?? [], search)),
    [remote, options, search]
  );
  const custom = search.trim();
  const showCustom = Boolean(allowCustom && custom && !hasExactOption(items, custom));
  const loading = remote ? remote.isPending : Boolean(optionsLoading);

  return (
    <>
      <BottomSheetView className="gap-2.5 px-4 pb-2">
        <Text className="font-display-semibold text-[17px] text-foreground">{label}</Text>
        <SearchBar value={search} onChange={setSearch} placeholder={searchPlaceholder ?? 'Ara...'} />
        {showCustom ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onPick({ id: '', label: custom })}
            className="min-h-11 flex-row items-center gap-2.5 rounded-control border border-dashed border-primary px-3 active:opacity-70"
          >
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text className="flex-1 font-inter-medium text-[13px] text-primary" numberOfLines={1}>
              “{custom}” olarak kullan
            </Text>
          </Pressable>
        ) : null}
      </BottomSheetView>
      <BottomSheetFlatList
        data={items}
        keyExtractor={(item: SelectItem<T>) => item.id || item.label}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}
        renderItem={({ item }: { item: SelectItem<T> }) => {
          const selected = Boolean(selectedId) && item.id === selectedId;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onPick(item)}
              className="min-h-[48px] flex-row items-center gap-2.5 border-b border-border py-2 active:opacity-70"
            >
              <View className="flex-1">
                <Text className="font-inter-semibold text-[14px] text-foreground" numberOfLines={1}>
                  {item.label}
                </Text>
                {item.hint ? (
                  <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
                    {item.hint}
                  </Text>
                ) : null}
              </View>
              {selected ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
            </Pressable>
          );
        }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (remote?.hasNextPage && !remote.isFetchingNextPage) remote.fetchNextPage?.();
        }}
        ListEmptyComponent={
          loading ? (
            <Loading />
          ) : remote?.error ? (
            <ErrorState message={remote.error.message} onRetry={remote.refetch} />
          ) : (
            <EmptyState
              title={emptyTitle ?? 'Kayıt bulunamadı'}
              hint={allowCustom ? 'Listede yoksa aradığınız metni değer olarak kullanabilirsiniz.' : 'Aramayı değiştirin.'}
            />
          )
        }
        ListFooterComponent={remote?.isFetchingNextPage ? <Loading /> : null}
      />
    </>
  );
}
