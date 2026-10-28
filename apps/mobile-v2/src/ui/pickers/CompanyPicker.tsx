import { SelectionListFooter } from './SelectionListFooter';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useCompanyList } from '@/src/api/companies.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { companyVisibility, isCompanyVisible } from '@/src/ui/crm/company-logic';
import { useContactList } from '@/src/api/crm.hooks';
import type { CompanyListItem, CompanyListQuery, ContactListItem } from '@/src/api/endpoints';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { Button, EmptyState, ErrorState, Loading, SearchBar } from '@/src/ui';
import { HostedSheet } from './HostedSheet';
import { PickerField } from './PickerField';
import { SelectionRow } from './SelectionRow';
import { SelectionStatus } from './SelectionStatus';

export type PickedRecord = { id: string; name: string; phone?: string; email?: string };

type CompanyList = ReturnType<typeof useCompanyList>;

/**
 * İki ilişki türünün sayfalı listelerini tek liste gibi sunar. API tek
 * `relationTypeCode` alıyor; web RemoteCompanyCombobox da tür başına istek atıyor.
 * ponytail: sayfalar ad sırasıyla birleşmez; sonraki sayfa yüklenince ikinci türün satırları aşağı kayar.
 * Aramayla daraltılınca sorun olmuyor; rahatsız ederse API'ye çoklu `relationTypeCode` ekleyin.
 */
function mergeCompanyLists(a: CompanyList, b: CompanyList) {
  return {
    items: [...(a.data?.items ?? []), ...(b.data?.items ?? [])],
    isPending: a.isPending || b.isPending,
    isFetching: a.isFetching || b.isFetching,
    isFetchingNextPage: a.isFetchingNextPage || b.isFetchingNextPage,
    isFetchNextPageError: a.isFetchNextPageError || b.isFetchNextPageError,
    error: a.error ?? b.error,
    hasNextPage: a.hasNextPage || b.hasNextPage,
    fetchNextPage: () => Promise.all([a.hasNextPage ? a.fetchNextPage() : null, b.hasNextPage ? b.fetchNextPage() : null]),
    refetch: () => Promise.all([a.refetch(), b.refetch()]),
  };
}

/** Uzaktan aramalı firma seçici (web RemoteCompanyCombobox) — RN Modal. */
export function CompanyPicker({
  label = 'Firma',
  value,
  onChange,
  placeholder = 'Firma seçin…',
  error,
  disabled,
  clearable = true,
  relationTypeCodes,
}: {
  label?: string;
  value: PickedRecord | null;
  onChange: (value: PickedRecord | null) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  clearable?: boolean;
  /** En çok iki ilişki türü; verilmezse tüm firmalar. */
  relationTypeCodes?: readonly [NonNullable<CompanyListQuery['relationTypeCode']>, NonNullable<CompanyListQuery['relationTypeCode']>?];
}) {
  const [primaryType, secondaryType] = relationTypeCodes ?? [];
  const { user } = useAuth();
  const visibility = companyVisibility(user?.roles ?? []);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 275);
  const query = useMemo(
    () => ({ search: debounced.trim() || undefined, sortBy: 'name' as const, sortDir: 'asc' as const, relationTypeCode: primaryType }),
    [debounced, primaryType],
  );
  const primary = useCompanyList(query);
  const secondary = useCompanyList({ ...query, relationTypeCode: secondaryType }, Boolean(secondaryType));
  const list = secondaryType ? mergeCompanyLists(primary, secondary) : { ...primary, items: primary.data?.items ?? [] };
  const rows = list.items.filter((item) => isCompanyVisible(item, visibility));

  const choose = useCallback(
    (company: CompanyListItem) => {
      onChange({ id: company.id, name: company.shortName || company.legalTitle });
      setSearch('');
      setOpen(false);
    },
    [onChange],
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
        onPress={() => setOpen(true)}
        onClear={clearable ? () => onChange(null) : undefined}
      />
      <HostedSheet
        open={open}
        onClose={() => {
          setSearch('');
          setOpen(false);
        }}
        heightRatio={0.8}
      >
        <View className="min-h-0 flex-1">
          <View className="gap-3 border-b border-border px-4 pb-3">
            <Text accessibilityRole="header" className="font-display-semibold text-[22px] text-foreground">
              {label} seçin
            </Text>
            <SearchBar value={search} onChange={setSearch} placeholder="Firma ara" />
            <SelectionStatus loading={search.trim() !== debounced.trim() || (list.isFetching && !list.isFetchingNextPage)} error={list.error} onRetry={() => void list.refetch()} />
          </View>
          <FlatList
            className="flex-1"
            data={search.trim() !== debounced.trim() ? [] : rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item }) => {
              const selected = item.id === value?.id;
              return (
                <SelectionRow label={item.shortName || item.legalTitle} hint={[item.shortName ? item.legalTitle : null, item.primaryAddress?.province].filter(Boolean).join(' · ') || 'Firma'} selected={selected} onPress={() => choose(item)} />
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
            ListFooterComponent={<SelectionListFooter hasNextPage={list.hasNextPage} isFetchingNextPage={list.isFetchingNextPage} error={list.isFetchNextPageError ? list.error : null} fetchNextPage={() => list.fetchNextPage()} />}
          />
        </View>
      </HostedSheet>
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
  requireCompany = true,
}: {
  label?: string;
  companyId: string | null;
  value: PickedRecord | null;
  onChange: (value: PickedRecord | null) => void;
  placeholder?: string;
  error?: string;
  requireCompany?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 275);
  const query = useMemo(
    () => ({ companyId: companyId ?? undefined, search: debounced.trim() || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }),
    [companyId, debounced],
  );
  const list = useContactList(query, Boolean(companyId) || !requireCompany);
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
      setOpen(false);
    },
    [onChange],
  );

  return (
    <>
      <PickerField
        label={label}
        value={value?.name ?? ''}
        placeholder={placeholder ?? (companyId || !requireCompany ? 'Kontak seçin' : 'Önce firma seçin')}
        icon="person-outline"
        error={error}
        disabled={requireCompany && !companyId}
        onPress={() => setOpen(true)}
        onClear={() => onChange(null)}
      />
      <HostedSheet
        open={open}
        onClose={() => {
          setSearch('');
          setOpen(false);
        }}
        heightRatio={0.8}
      >
        <View className="min-h-0 flex-1">
          <View className="gap-3 border-b border-border px-4 pb-3">
            <Text accessibilityRole="header" className="font-display-semibold text-[22px] text-foreground">
              {label} seçin
            </Text>
            {value ? <Button label="Bağlantıyı Kaldır" variant="ghost" onPress={() => choose(null)} /> : null}
            <SearchBar value={search} onChange={setSearch} placeholder="Kontak ara" />
            <SelectionStatus loading={search.trim() !== debounced.trim() || (list.isFetching && !list.isFetchingNextPage)} error={list.error} onRetry={() => void list.refetch()} />
          </View>
          <FlatList
            className="flex-1"
            data={search.trim() !== debounced.trim() ? [] : rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item }) => {
              const selected = item.id === value?.id;
              return (
                <SelectionRow label={item.fullName} hint={[item.title, item.department, item.mobilePhone || item.workPhone, item.workEmail || item.personalEmail].filter(Boolean).join(' · ') || 'Kontak'} selected={selected} onPress={() => choose(item)} />
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
            ListFooterComponent={<SelectionListFooter hasNextPage={list.hasNextPage} isFetchingNextPage={list.isFetchingNextPage} error={list.isFetchNextPageError ? list.error : null} fetchNextPage={() => list.fetchNextPage()} />}
          />
        </View>
      </HostedSheet>
    </>
  );
}
