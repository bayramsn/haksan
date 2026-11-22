import { useNavigationContext } from '@/src/modules/useNavigationContext';
import { startCrmCall } from '@/src/call-assistant/call';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { SheetBackdrop } from '@/src/ui/SheetBackdrop';
import { useDeleteContact } from '@/src/api/crm.hooks';
import { useContactListExt, useContactSummaryExt } from '@/src/api/crm-general.hooks';
import type { ContactListRow } from '@/src/api/crm-general.api';
import { exportService } from '@/src/api/exports';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Fab,
  FilterChips,
  ListSkeleton,
  Loading,
  SCREEN_PAD,
  ScreenHeader,
  SearchBar,
  StatStrip,
} from '@/src/ui';
import { initials } from '@/src/ui/Avatar';
import { useTheme } from '@/src/theme/theme';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { toast } from '@/src/ui/toast';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { SheetMenu } from '@/src/ui/crm/SheetMenu';
import { mailComposeHref } from '@/src/ui/crm/mail-logic';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { CompanyPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import {
  CONTACT_SORT_OPTIONS,
  activeContactFilterCount,
  buildContactExportParams,
  buildContactQuery,
  type ContactSortValue,
  type ContactTab,
} from '@/src/features/contacts/contact-list-logic';

function ContactRow({
  item,
  onPress,
  onCall,
  onMail,
  onEdit,
  onDelete,
}: {
  item: ContactListRow;
  onPress: () => void;
  onCall?: () => void;
  onMail?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { colors } = useTheme();
  const company = item.company?.shortName ?? item.company?.legalTitle ?? null;
  const phone = item.mobilePhone ?? item.workPhone;
  const email = item.workEmail ?? item.personalEmail;
  const meta = [
    company ? `${company}${item.company?.city ? ` · ${item.company.city}` : ''}` : null,
    [item.title, item.department].filter(Boolean).join(' · ') || null,
    phone || email || null,
  ].filter(Boolean).join(' · ');

  return (
    <View className="my-1 overflow-hidden rounded-surface border border-border bg-card">
      <View className="flex-row items-stretch">
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={item.fullName}
          className="min-w-0 flex-1 flex-row gap-3 p-3.5 active:opacity-70"
        >
          <View className="h-9 w-9 items-center justify-center rounded-control bg-secondary">
            <Text className="font-inter-semibold text-[13px] text-foreground">{initials(item.fullName)}</Text>
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <View className="flex-row flex-wrap items-center gap-1">
              <Text className="shrink font-inter-semibold text-[15px] leading-[20px] text-foreground" numberOfLines={1}>
                {item.fullName}
              </Text>
              {item.isPrimary ? <Chip tone="warning" label="Birincil" shrink /> : null}
              {item.isBlacklisted ? <Chip tone="destructive" label="Kara liste" shrink /> : null}
            </View>
            {meta ? (
              <Text className="font-inter text-[12px] leading-[17px] text-muted-foreground" numberOfLines={2}>
                {meta}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </View>
      {(onCall || onMail || onEdit || onDelete) ? (
        <View className="flex-row border-t border-border">
          {onCall ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Ara" onPress={onCall}
              className="min-h-11 flex-1 items-center justify-center active:opacity-70">
              <Ionicons name="call-outline" size={18} color={colors.primary} />
            </Pressable>
          ) : null}
          {onMail ? (
            <Pressable accessibilityRole="button" accessibilityLabel="E-posta" onPress={onMail}
              className="min-h-11 flex-1 items-center justify-center border-l border-border active:opacity-70">
              <Ionicons name="mail-outline" size={18} color={colors.primary} />
            </Pressable>
          ) : null}
          {onEdit ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Düzenle" onPress={onEdit}
              className="min-h-11 flex-1 items-center justify-center border-l border-border active:opacity-70">
              <Ionicons name="create-outline" size={18} color={colors.primary} />
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Sil" onPress={onDelete}
              className="min-h-11 flex-1 items-center justify-center border-l border-border active:opacity-70">
              <Ionicons name="trash-outline" size={18} color={colors.destructive} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function ContactsScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string }>();
  const { colors } = useTheme();
  const { user, scope } = useAuth();
  const canCreate = useCan('contacts.create');
  const canUpdate = useCan('contacts.update');
  const canDelete = useCan('contacts.delete');
  const canExport = useCan('reports.export');
  const deleteContact = useDeleteContact();

  const [search, setSearch] = useState('');
  useNavigationContext('contacts', ({ query }) => setSearch(query ?? ''));
  const serverSearch = useDebouncedValue(search.trim(), 275);
  const [tab, setTab] = useState<ContactTab>('all');
  const [blacklistOnly, setBlacklistOnly] = useState(false);
  const [divisionId, setDivisionId] = useState<string>(() => scope.divisionId ?? 'all');
  const [department, setDepartment] = useState<string | null>(null);
  const [company, setCompany] = useState<PickedRecord | null>(() => typeof params.companyId === 'string' && params.companyId ? { id: params.companyId, name: typeof params.companyName === 'string' ? params.companyName : 'Seçili firma' } : null);
  useEffect(() => {
    if (typeof params.companyId === 'string' && params.companyId) setCompany({ id: params.companyId, name: typeof params.companyName === 'string' ? params.companyName : 'Seçili firma' });
  }, [params.companyId, params.companyName]);
  const [sort, setSort] = useState<ContactSortValue>('all');
  const [exporting, setExporting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const filterSheetRef = useRef<BottomSheetModal>(null);
  const sortSheetRef = useRef<BottomSheetModal>(null);

  const filters = useMemo(
    () => ({ search: serverSearch, tab, blacklistOnly, divisionId, department, companyId: company?.id ?? null, sort }),
    [serverSearch, tab, blacklistOnly, divisionId, department, company, sort],
  );
  const query = useMemo(() => buildContactQuery(filters), [filters]);
  const list = useContactListExt(query);
  const summary = useContactSummaryExt(divisionId);
  const items = list.data?.items ?? [];
  const filterCount = activeContactFilterCount(filters);

  async function exportExcel() {
    if (exporting) return;
    setExporting(true);
    try {
      await exportService.contacts(buildContactExportParams(filters));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Excel indirilemedi');
    } finally {
      setExporting(false);
    }
  }

  function confirmDelete(item: ContactListRow) {
    const firm = item.company?.shortName ?? item.company?.legalTitle ?? 'Firma bağlantısı yok';
    Alert.alert(
      'Kontağı sil?',
      `${item.fullName}\n\n${firm} kişisi kalıcı olarak silinir. Aktivite, teklif veya servis ilişkisi varsa sistem işlemi güvenli biçimde engelleyebilir.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () =>
            deleteContact.mutate(item.id, {
              onSuccess: () => toast.success('Kontak silindi'),
              onError: (error) => toast.error(`Kontak silinemedi · ${error.message || 'API isteği başarısız oldu.'}`),
            }),
        },
      ],
    );
  }


  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Kontaklar"
        actions={[
          { icon: 'swap-vertical-outline', label: 'Kontakları sırala', onPress: () => sortSheetRef.current?.present() },
          ...(canExport
            ? [{ icon: exporting ? ('hourglass-outline' as const) : ('download-outline' as const), label: 'Excel indir', onPress: () => void exportExcel() }]
            : []),
        ]}
        compact/>


      <View className="gap-2 pb-2">
        {(user?.divisions?.length ?? 0) > 0 ? (
          <FilterChips
            options={(user?.divisions ?? []).map((division) => ({ value: division.id, label: division.name }))}
            value={divisionId === 'all' ? null : divisionId}
            onChange={(next) => setDivisionId(next ?? 'all')}
            allLabel="Tümü"
          />
        ) : null}
        <FilterChips
          options={[{ value: 'primary' as const, label: 'Birincil', count: summary.data?.primary }]}
          value={tab === 'primary' ? 'primary' : null}
          onChange={(next) => setTab(next ?? 'all')}
          allLabel="Tümü"
        />
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Kişi, firma, e-posta ara..."
          onFilterPress={() => filterSheetRef.current?.present()}
          filterActive={filterCount > 0}
        />
        <View style={{ paddingHorizontal: SCREEN_PAD }}>
          <Button
            variant="ghost"
            label={showSummary ? 'Özeti gizle' : 'Özet'}
            trailingIcon={showSummary ? 'chevron-up' : 'analytics-outline'}
            onPress={() => setShowSummary((value) => !value)}
          />
        </View>
        {showSummary ? (
          <StatStrip
            dense
            items={[
              { label: 'Toplam', value: String(summary.data?.total ?? list.data?.total ?? 0) },
              { label: 'Firma sayısı', value: String(summary.data?.firmCount ?? '—'), tone: 'info' },
            ]}
          />
        ) : null}
        {company ? (
          <View style={{ paddingHorizontal: SCREEN_PAD }} className="flex-row items-center gap-2">
            <Chip tone="info" label={`Firma: ${company.name}`} shrink />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Firma filtresini temizle"
              onPress={() => setCompany(null)}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
            >
              <Ionicons name="close" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ) : null}
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: GLASS_TAB_BAR_HEIGHT + 88 }}
          renderItem={({ item }) => {
            const phone = (item.mobilePhone ?? item.workPhone ?? '').replace(/\s/g, '');
            const email = item.workEmail ?? item.personalEmail;
            return (
              <ContactRow
                item={item}
                onPress={() => router.push(`/modules/contacts/${item.id}`)}
                onCall={phone ? () => void startCrmCall(phone, { companyId: item.companyId ?? undefined, contactId: item.id }) : undefined}
                onMail={
                  email
                    ? () =>
                        router.push(
                          mailComposeHref({
                            to: email,
                            name: item.fullName,
                            companyId: item.companyId ?? undefined,
                            contactId: item.id,
                          }) as Href,
                        )
                    : undefined
                }
                onEdit={canUpdate ? () => router.push(`/modal/contact?id=${encodeURIComponent(item.id)}` as Href) : undefined}
                onDelete={canDelete ? () => confirmDelete(item) : undefined}
              />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => {
            void list.refetch();
            void summary.refetch();
          }}
          ListEmptyComponent={
            <EmptyState
              title="Bu filtreye uyan kontak bulunamadı"
              hint="Arama terimini veya filtreleri değiştirerek tekrar deneyin."
              actionLabel="Filtreleri temizle"
              onAction={() => { setSearch(''); setTab('all'); setBlacklistOnly(false); setDivisionId('all'); setDepartment(null); setCompany(null); }}
              icon="people-outline"
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}

      {canCreate ? <Fab label="Yeni Kontak" onPress={() => router.push('/modal/contact')} /> : null}

      <SheetMenu
        ref={sortSheetRef}
        title="Sıralama"
        items={CONTACT_SORT_OPTIONS.map((option) => ({
          key: option.value,
          label: option.label,
          selected: option.value === sort,
          onPress: () => setSort(option.value),
        }))}
      />

      <BottomSheetModal
        ref={filterSheetRef}
        snapPoints={['70%']}
        enableDynamicSizing={false}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={SheetBackdrop}
      >
        <BottomSheetScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40, paddingTop: 4 }}>
          <View style={{ paddingHorizontal: SCREEN_PAD }}>
            <OptionPicker label="Departman" value={department} clearable searchable placeholder="Tüm departmanlar"
              options={(summary.data?.departments ?? []).map((value) => ({ value, label: value }))} onChange={setDepartment} />
          </View>
          <View style={{ paddingHorizontal: SCREEN_PAD }}>
            <CompanyPicker label="Firma" value={company} onChange={setCompany} placeholder="Firma" />
          </View>
          <Text style={{ paddingHorizontal: SCREEN_PAD }} className="font-inter-semibold text-base text-foreground">
            Durum
          </Text>
          <FilterChips
            options={[{ value: 'blacklist' as const, label: 'Kara liste', count: summary.data?.blacklisted }]}
            value={blacklistOnly ? 'blacklist' : null}
            onChange={(next) => setBlacklistOnly(next === 'blacklist')}
            allLabel="Tümü"
          />
          {filterCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDepartment(null);
                setCompany(null);
                setSort('all');
                setBlacklistOnly(false);
              }}
              style={{ marginHorizontal: SCREEN_PAD }}
              className="min-h-11 items-center justify-center rounded-control border border-border active:bg-muted"
            >
              <Text className="font-inter-medium text-sm text-foreground">Filtreleri temizle</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => filterSheetRef.current?.dismiss()} style={{ marginHorizontal: SCREEN_PAD }} className="min-h-[48px] items-center justify-center rounded-control bg-primary">
            <Text className="font-inter-semibold text-[14px] text-primary-foreground">Sonuçları göster</Text>
          </Pressable>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
