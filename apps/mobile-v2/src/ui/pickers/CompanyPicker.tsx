import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCompanyList } from '@/src/api/companies.hooks';
import { useContactList } from '@/src/api/crm.hooks';
import type { CompanyListItem, ContactListItem } from '@/src/api/endpoints';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useTheme } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';
import { PickerField, useSheetProps } from './PickerField';

export type PickedRecord = { id: string; name: string; phone?: string; email?: string };

/**
 * Uzaktan aramalı firma seçici (web RemoteCompanyCombobox).
 * Başlık + arama ListHeaderComponent'te — FlatList kardeş View üzerine binmesin.
 */
export function CompanyPicker({
  label = 'Firma',
  value,
  onChange,
  placeholder = 'Firma seçin…',
  error,
  disabled,
  clearable = true,
}: {
  label?: string;
  value: PickedRecord | null;
  onChange: (value: PickedRecord | null) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  clearable?: boolean;
}) {
  const { colors } = useTheme();
  const sheet = useRef<BottomSheetModal>(null);
  const sheetProps = useSheetProps();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 275);
  const query = useMemo(
    () => ({ search: debounced.trim() || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }),
    [debounced],
  );
  const list = useCompanyList(query);
  const rows = list.data?.items ?? [];

  const choose = useCallback(
    (company: CompanyListItem) => {
      onChange({ id: company.id, name: company.shortName || company.legalTitle });
      setSearch('');
      sheet.current?.dismiss();
    },
    [onChange],
  );

  const header = (
    <View className="gap-3 bg-card pb-2">
      <Text accessibilityRole="header" className="font-inter-semibold text-base text-foreground">
        {label} seçin
      </Text>
      <SearchBar value={search} onChange={setSearch} placeholder="Firma ara" />
    </View>
  );

  return (
    <>
      <PickerField
        label={label}
        value={value?.name ?? ''}
        placeholder={placeholder}
        icon="business-outline"
        error={error}
        disabled={disabled}
        onPress={() => sheet.current?.present()}
        onClear={clearable ? () => onChange(null) : undefined}
      />
      <BottomSheetModal ref={sheet} {...sheetProps} onDismiss={() => setSearch('')}>
        <BottomSheetFlatList
          data={rows}
          keyExtractor={(item: CompanyListItem) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }: { item: CompanyListItem }) => {
            const selected = item.id === value?.id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => choose(item)}
                className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
              >
                <Ionicons name="business-outline" size={19} color={selected ? colors.primary : colors.mutedForeground} />
                <View className="flex-1">
                  <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>
                    {item.shortName ?? item.legalTitle}
                  </Text>
                  <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                    {[item.shortName ? item.legalTitle : null, item.primaryAddress?.province].filter(Boolean).join(' · ') || 'Firma'}
                  </Text>
                </View>
                {selected ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
              </Pressable>
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          ListEmptyComponent={
            list.isPending ? (
              <Loading />
            ) : list.error ? (
              <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
            ) : (
              <EmptyState title="Firma bulunamadı" />
            )
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      </BottomSheetModal>
    </>
  );
}

/** Firmaya bağlı kontak seçici; firma yoksa devre dışı. */
export function ContactPicker({
  label = 'Kontak',
  companyId,
  value,
  onChange,
  placeholder,
  error,
}: {
  label?: string;
  companyId: string | null;
  value: PickedRecord | null;
  onChange: (value: PickedRecord | null) => void;
  placeholder?: string;
  error?: string;
}) {
  const { colors } = useTheme();
  const sheet = useRef<BottomSheetModal>(null);
  const sheetProps = useSheetProps();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 275);
  const query = useMemo(
    () => ({ companyId: companyId ?? undefined, search: debounced.trim() || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }),
    [companyId, debounced],
  );
  const list = useContactList(query, Boolean(companyId));
  const rows = list.data?.items ?? [];

  const choose = useCallback(
    (contact: ContactListItem | null) => {
      onChange(
        contact
          ? {
              id: contact.id,
              name: contact.fullName,
              phone: contact.mobilePhone || contact.workPhone || undefined,
              email: contact.workEmail || contact.personalEmail || undefined,
            }
          : null,
      );
      setSearch('');
      sheet.current?.dismiss();
    },
    [onChange],
  );

  const header = (
    <View className="gap-3 bg-card pb-2">
      <Text accessibilityRole="header" className="font-inter-semibold text-base text-foreground">
        {label} seçin
      </Text>
      {value ? <Button label="Bağlantıyı Kaldır" variant="ghost" onPress={() => choose(null)} /> : null}
      <SearchBar value={search} onChange={setSearch} placeholder="Kontak ara" />
    </View>
  );

  return (
    <>
      <PickerField
        label={label}
        value={value?.name ?? ''}
        placeholder={placeholder ?? (companyId ? 'İsteğe bağlı' : 'Önce firma seçin')}
        icon="person-outline"
        error={error}
        disabled={!companyId}
        onPress={() => sheet.current?.present()}
        onClear={() => onChange(null)}
      />
      <BottomSheetModal ref={sheet} {...sheetProps} onDismiss={() => setSearch('')}>
        <BottomSheetFlatList
          data={rows}
          keyExtractor={(item: ContactListItem) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }: { item: ContactListItem }) => {
            const selected = item.id === value?.id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => choose(item)}
                className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
              >
                <Ionicons name="person-outline" size={19} color={selected ? colors.primary : colors.mutedForeground} />
                <View className="flex-1">
                  <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>
                    {item.fullName}
                  </Text>
                  <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                    {[item.title, item.department].filter(Boolean).join(' · ') || 'Kontak'}
                  </Text>
                </View>
                {selected ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
              </Pressable>
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          ListEmptyComponent={
            list.isPending ? (
              <Loading />
            ) : list.error ? (
              <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
            ) : (
              <EmptyState title="Kontak bulunamadı" />
            )
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      </BottomSheetModal>
    </>
  );
}
