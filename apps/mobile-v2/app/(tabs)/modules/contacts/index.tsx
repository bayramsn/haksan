import { useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useDeleteContact } from '@/src/api/crm.hooks';
import { useContactListExt, useContactSummaryExt } from '@/src/api/crm-general.hooks';
import type { ContactListRow } from '@/src/api/crm-general.api';
import { exportService } from '@/src/api/exports';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import {
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
import { formatDate } from '@/src/lib/format';
import { SheetMenu } from '@/src/ui/crm/SheetMenu';
import { mailComposeHref } from '@/src/ui/crm/mail-logic';
import { CompanyPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import {
  CONTACT_SORT_OPTIONS,
  activeContactFilterCount,
  buildContactExportParams,
  buildContactQuery,
  type ContactSortValue,
  type ContactTab,
} from '@/src/features/contacts/contact-list-logic';

function MetaBit({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors } = useTheme();
  return (
    <View className="max-w-full shrink flex-row items-center gap-1">
      <Ionicons name={icon} size={12} color={colors.mutedForeground} />
      <Text className="shrink font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function RowAction({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const disabled = !onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
      style={disabled ? { opacity: 0.35 } : undefined}
    >
      <Ionicons name={icon} size={18} color={destructive ? colors.destructive : colors.mutedForeground} />
    </Pressable>
  );
}

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
  const creator = item.createdByUser?.fullName || item.createdByUser?.email || null;

  return (
    <View className="my-[5px] rounded-[16px] border border-border bg-card" style={{ borderCurve: 'continuous' }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={item.fullName}
        className="flex-row gap-3 px-3 pb-2 pt-3.5 active:opacity-70"
      >
        <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-muted">
          <Text className="font-inter-semibold text-[14px] text-foreground">{initials(item.fullName)}</Text>
        </View>
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text className="shrink font-inter-semibold text-[16px] leading-[21px] text-foreground" numberOfLines={1}>
              {item.fullName}
            </Text>
            {item.isPrimary ? <Chip tone="warning" label="Birincil" shrink /> : null}
            {item.isBlacklisted ? <Chip tone="destructive" label="Kara liste" shrink /> : null}
          </View>
          {company ? (
            <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={1}>
              {company}
              {item.company?.city ? ` · ${item.company.city}` : ''}
            </Text>
          ) : null}
          {item.title || item.department || item.decisionRole ? (
            <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
              {[item.title, item.department, item.decisionRole?.name].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {phone || email ? (
            <View className="flex-row items-center gap-3">
              {phone ? <MetaBit icon="call-outline" text={phone} /> : null}
              {email ? <MetaBit icon="mail-outline" text={email} /> : null}
            </View>
          ) : null}
          {item.notes ? (
            <Text className="font-inter text-[12px] italic text-muted-foreground" numberOfLines={1}>
              {item.notes}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      </Pressable>
      <View className="flex-row items-center border-t border-border px-2">
        <Text className="flex-1 px-1 font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
          {formatDate(item.createdAt)}
          {creator ? ` · ${creator}` : ''}
        </Text>
        <RowAction icon="call-outline" label="Ara" onPress={onCall} />
        <RowAction icon="mail-outline" label="E-posta" onPress={onMail} />
        {onEdit ? <RowAction icon="create-outline" label="Düzenle" onPress={onEdit} /> : null}
        {onDelete ? <RowAction icon="trash-outline" label="Sil" destructive onPress={onDelete} /> : null}
      </View>
    </View>
  );
}

export default function ContactsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, scope } = useAuth();
  const canCreate = useCan('contacts.create');
  const canUpdate = useCan('contacts.update');
  const canDelete = useCan('contacts.delete');
  const canExport = useCan('reports.export');
  const deleteContact = useDeleteContact();

  const [search, setSearch] = useState('');
  const serverSearch = useDebouncedValue(search.trim(), 275);
  const [tab, setTab] = useState<ContactTab>('all');
  const [blacklistOnly, setBlacklistOnly] = useState(false);
  const [divisionId, setDivisionId] = useState<string>(() => scope.divisionId ?? 'all');
  const [department, setDepartment] = useState<string | null>(null);
  const [company, setCompany] = useState<PickedRecord | null>(null);
  const [sort, setSort] = useState<ContactSortValue>('all');
  const [exporting, setExporting] = useState(false);
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

  const blacklisted = summary.data?.blacklisted ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Kontaklar"
        subtitle="Tüm kişi kayıtlarını görüntüleyin ve yönetin."
        actions={[
          { icon: 'swap-vertical-outline', label: 'Kontakları sırala', onPress: () => sortSheetRef.current?.present() },
          ...(canExport
            ? [{ icon: exporting ? ('hourglass-outline' as const) : ('download-outline' as const), label: 'Excel indir', onPress: () => void exportExcel() }]
            : []),
        ]}
      />

      {summary.data ? (
        <View className="pb-2">
          <StatStrip
            items={[
              { label: 'Toplam Kontak', value: String(summary.data.total), icon: 'people-outline' },
              { label: 'Birincil', value: String(summary.data.primary), icon: 'star-outline', tone: 'warning' },
              { label: 'Firma Sayısı', value: String(summary.data.firmCount), icon: 'business-outline', tone: 'info' },
              { label: 'Kara Liste', value: String(blacklisted), icon: 'ban-outline', tone: blacklisted > 0 ? 'destructive' : 'success' },
            ]}
          />
        </View>
      ) : null}

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
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 96 }}
          renderItem={({ item }) => {
            const phone = (item.mobilePhone ?? item.workPhone ?? '').replace(/\s/g, '');
            const email = item.workEmail ?? item.personalEmail;
            return (
              <ContactRow
                item={item}
                onPress={() => router.push(`/(tabs)/modules/contacts/${item.id}`)}
                onCall={phone ? () => void Linking.openURL(`tel:${phone}`) : undefined}
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
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40, paddingTop: 4 }}>
          <Text style={{ paddingHorizontal: SCREEN_PAD }} className="font-inter-semibold text-base text-foreground">
            Departman
          </Text>
          <FilterChips
            options={(summary.data?.departments ?? []).map((value) => ({ value, label: value }))}
            value={department}
            onChange={setDepartment}
            allLabel="Tümü"
          />
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
        </BottomSheetScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
