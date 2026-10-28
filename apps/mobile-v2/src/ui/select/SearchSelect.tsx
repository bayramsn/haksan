import { SelectionListFooter } from '@/src/ui/pickers/SelectionListFooter';
import { createContext, useContext, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';
import { HostedSheet } from '@/src/ui/pickers/HostedSheet';
import { PickerField } from '@/src/ui/pickers/PickerField';
import { SelectionRow } from '@/src/ui/pickers/SelectionRow';
import { SelectionStatus } from '@/src/ui/pickers/SelectionStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { filterOptions, hasExactOption } from './select-logic';

export type SelectItem<T = unknown> = { id: string; label: string; hint?: string | null; data?: T };

/** Sunucuda arama yapan kaynak; sayfalı listeler için sonsuz kaydırma alanları opsiyonel. */
export type RemoteOptions<T> = {
  items: SelectItem<T>[];
  isPending: boolean;
  isFetching?: boolean;
  error: Error | null;
  refetch: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
};

/**
 * Sheet RN Modal içinde; firma/kategori gibi bağımlılıklar dış ağaç
 * context’iyle gelmez. `remoteBag` bu context ile sheet’e taşınır.
 */
export const SearchRemoteBagCtx = createContext<unknown>(null);
export function useSearchRemoteBag<T = unknown>(): T {
  return useContext(SearchRemoteBagCtx) as T;
}

type Props<T> = {
  label: string;
  placeholder: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  selectedId?: string | null;
  onSelect: (item: SelectItem<T> | null) => void;
  options?: SelectItem<T>[];
  optionsLoading?: boolean;
  optionsError?: Error | null;
  onOptionsRetry?: () => void;
  useRemote?: (search: string) => RemoteOptions<T>;
  remoteBag?: unknown;
  allowCustom?: boolean;
  /** Web Combobox `createLabel` — örn. `"X" firmasını fırsata yaz`. */
  createLabel?: (query: string) => string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  error?: string;
  disabled?: boolean;
  clearable?: boolean;
};

export function SearchSelect<T>(props: Props<T>) {
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
        onPress={() => setOpen(true)}
        onClear={props.clearable ? () => props.onSelect(null) : undefined}
      />
      <HostedSheet open={open} onClose={() => setOpen(false)} heightRatio={0.72}>
        <SearchRemoteBagCtx.Provider value={props.remoteBag ?? null}>
          <SheetBody
            {...props}
            onPick={(item) => {
              props.onSelect(item);
              setOpen(false);
            }}
          />
        </SearchRemoteBagCtx.Provider>
      </HostedSheet>
    </>
  );
}

const NO_REMOTE = () => null;

function SheetBody<T>({
  label,
  options,
  optionsLoading,
  optionsError,
  onOptionsRetry,
  useRemote,
  allowCustom,
  createLabel,
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
  const loading = remote ? remote.isPending || remote.isFetching || search.trim() !== term : Boolean(optionsLoading);
  const loadError = remote?.error ?? optionsError;
  const showCustom = Boolean(allowCustom && custom && !loading && !loadError && !hasExactOption(items, custom));
  const customRowLabel = createLabel?.(custom) ?? `“${custom}” olarak kullan`;

  return (
    <View className="min-h-0 flex-1">
      <View className="gap-2.5 border-b border-border px-4 pb-3">
        <Text accessibilityRole="header" className="font-display-semibold text-[22px] text-foreground">{label}</Text>
        <SearchBar value={search} onChange={setSearch} placeholder={searchPlaceholder ?? 'Ara...'} />
        <SelectionStatus loading={loading} error={loadError} onRetry={remote?.refetch ?? onOptionsRetry} />
        {showCustom ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onPick({ id: '', label: custom })}
            className="min-h-11 flex-row items-center gap-2.5 rounded-control border border-dashed border-primary px-3 active:opacity-70"
          >
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text className="flex-1 font-inter-medium text-[13px] text-primary" numberOfLines={2}>
              {customRowLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        className="flex-1"
        data={remote && loading ? [] : items}
        keyExtractor={(item) => item.id || item.label}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36, flexGrow: 1 }}
        renderItem={({ item }) => {
          const selected = Boolean(selectedId) && item.id === selectedId;
          return (
            <SelectionRow label={item.label} hint={item.hint} selected={selected} onPress={() => onPick(item)} />
          );
        }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (remote?.hasNextPage && !remote.isFetchingNextPage) remote.fetchNextPage?.();
        }}
        ListEmptyComponent={
          loading ? (
            <Loading />
          ) : remote?.error || optionsError ? (
            <ErrorState message={(remote?.error ?? optionsError)!.message} onRetry={remote?.refetch ?? onOptionsRetry} />
          ) : (
            <EmptyState
              title={emptyTitle ?? 'Kayıt bulunamadı'}
              hint={allowCustom ? 'Listede yoksa aradığınız metni değer olarak kullanabilirsiniz.' : 'Aramayı değiştirin.'}
            />
          )
        }
        ListFooterComponent={remote ? <SelectionListFooter hasNextPage={remote.hasNextPage} isFetchingNextPage={remote.isFetchingNextPage}
          error={items.length > 0 || remote.hasNextPage ? remote.error : null} fetchNextPage={remote.fetchNextPage} /> : null}
      />
    </View>
  );
}
