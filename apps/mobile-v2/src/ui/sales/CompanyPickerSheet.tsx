import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useCompanyList } from '@/src/api/companies.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { companyVisibility, isCompanyVisible } from '@/src/ui/crm/company-logic';
import type { CompanyListItem } from '@/src/api/endpoints';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';
import { HostedSheet } from '@/src/ui/pickers/HostedSheet';
import { SelectionRow } from '@/src/ui/pickers/SelectionRow';
import { SelectionStatus } from '@/src/ui/pickers/SelectionStatus';
import { SelectionListFooter } from '@/src/ui/pickers/SelectionListFooter';

export type CompanyPickerSheetHandle = { present: () => void; dismiss: () => void };

/** Firma seçici — RN Modal (Expo Router form üstünde güvenli). */
export const CompanyPickerSheet = forwardRef<
  CompanyPickerSheetHandle,
  { selectedId?: string | null; onSelect: (company: CompanyListItem) => void; title?: string }
>(function CompanyPickerSheet({ selectedId, onSelect, title = 'Firma seçin' }, ref) {
  const { user } = useAuth();
  const visibility = companyVisibility(user?.roles ?? []);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const companyList = useCompanyList(
    useMemo(() => ({ search: debounced || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }), [debounced])
  );

  useImperativeHandle(ref, () => ({
    present: () => { setSearch(''); setOpen(true); },
    dismiss: () => { setSearch(''); setOpen(false); },
  }));

  const rows = (companyList.data?.items ?? []).filter((item) => isCompanyVisible(item, visibility));
  // Yetkiye göre elenen ilk sayfa, sonraki görünür firmalara ulaşmayı engellemesin.
  useEffect(() => {
    if (open && rows.length === 0 && companyList.hasNextPage && !companyList.isFetching && !companyList.error) void companyList.fetchNextPage();
  }, [open, rows.length, companyList.hasNextPage, companyList.isFetching, companyList.error, companyList.fetchNextPage]);

  return (
    <HostedSheet
      open={open}
      onClose={() => {
        setSearch('');
        setOpen(false);
      }}
      heightRatio={0.85}
    >
      <View className="min-h-0 flex-1">
        <View className="gap-3 border-b border-border px-4 pb-3">
          <Text accessibilityRole="header" className="font-display-semibold text-[22px] text-foreground">{title}</Text>
          <SearchBar value={search} onChange={setSearch} placeholder="Firma ara" />
          <SelectionStatus loading={search.trim() !== debounced || (companyList.isFetching && !companyList.isFetchingNextPage)} error={companyList.error} onRetry={() => void companyList.refetch()} />
        </View>
        <FlatList
          className="flex-1"
          data={search.trim() !== debounced ? [] : rows}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
          renderItem={({ item }) => {
            const selected = item.id === selectedId;
            return (
              <SelectionRow label={item.shortName || item.legalTitle} hint={item.shortName ? item.legalTitle : item.primaryAddress?.province} selected={selected}
                onPress={() => { onSelect(item); setSearch(''); setOpen(false); }} />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (companyList.hasNextPage && !companyList.isFetchingNextPage) void companyList.fetchNextPage();
          }}
          ListEmptyComponent={
            companyList.isPending || (rows.length === 0 && companyList.isFetching) ? (
              <Loading />
            ) : companyList.error ? (
              <ErrorState message={companyList.error.message} onRetry={() => void companyList.refetch()} />
            ) : (
              <EmptyState title="Firma bulunamadı" />
            )
          }
          ListFooterComponent={<SelectionListFooter hasNextPage={companyList.hasNextPage} isFetchingNextPage={companyList.isFetchingNextPage} error={companyList.isFetchNextPageError ? companyList.error : null} fetchNextPage={() => void companyList.fetchNextPage()} />}
        />
      </View>
    </HostedSheet>
  );
});
