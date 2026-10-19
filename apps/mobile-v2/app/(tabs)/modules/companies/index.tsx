import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useDeleteCompany, useUpdateCompanyStatus } from '@/src/api/companies.hooks';
import { useCompanyListExt, useCompanySummaryExt } from '@/src/api/crm-general.hooks';
import type { CompanyListRow } from '@/src/api/crm-general.api';
import { mediaUrl } from '@/src/api/config';
import { exportService } from '@/src/api/exports';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import {
  ListSkeleton,
  Chip,
  EmptyState,
  ErrorState,
  Fab,
  FilterChips,
  Loading,
  SCREEN_PAD,
  ScreenHeader,
  SearchBar,
  StatStrip,
} from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { toast } from '@/src/ui/toast';
import { SheetMenu } from '@/src/ui/crm/SheetMenu';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { formatDate } from '@/src/lib/format';
import {
  COMPANY_SORT_OPTIONS,
  FIRM_TYPE_LABELS,
  buildCompanyQuery,
  companyVisibility,
  supplierCategoryLabel,
  type CompanySortMode,
  type FirmType,
  type SalesStatusTab,
} from '@/src/ui/crm/company-logic';
import { mailComposeHref } from '@/src/ui/crm/mail-logic';

const STATUS_OPTIONS = [
  { code: 'potential', label: 'Potansiyel' },
  { code: 'active', label: 'Aktif' },
  { code: 'passive', label: 'Pasif' },
  { code: 'blacklist', label: 'Kara liste' },
] as const;

type StatusCode = (typeof STATUS_OPTIONS)[number]['code'];

/** Web FIRM_TYPE_ACCENT ile aynı aile: müşteri mavi, ted.+müşteri marka mavisi, tedarikçi sarı, rakip kırmızı. */
const FIRM_TONE: Record<FirmType, Tone> = {
  customer: 'info',
  supplier_customer: 'stage',
  supplier: 'warning',
  competitor: 'destructive',
};

function firmTypeOf(row: CompanyListRow): FirmType {
  const code = row.relationType?.code;
  return code === 'supplier' || code === 'supplier_customer' || code === 'competitor' ? code : 'customer';
}

function CompanyLogo({ uri }: { uri: string }) {
  const source = { uri: mediaUrl(uri) ?? uri };
  return (
    <View
      className="h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-card"
      style={{ borderCurve: 'continuous' }}
    >
      <Image source={source} className="h-8 w-8" resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

function CompanyRow({
  item,
  onOpen,
  onCreateOpportunity,
  onMenu,
}: {
  item: CompanyListRow;
  onOpen: () => void;
  onCreateOpportunity?: () => void;
  onMenu: () => void;
}) {
  const { colors } = useTheme();
  const firmType = firmTypeOf(item);
  const location = [item.primaryAddress?.province, item.primaryAddress?.district].filter(Boolean).join(' / ') || 'Konum yok';
  const supplierLabel = supplierCategoryLabel(item.supplierCategoryCode);
  const isActiveCustomer = item.customerStatus?.code === 'active';
  const creator = item.createdByUser?.fullName || item.createdByUser?.email || '—';
  const meta = [
    item.companyType === 'individual' ? 'Bireysel' : 'Kurumsal',
    item.taxNumber || null,
    item.primaryPhone?.replace('+90 ', '') || null,
    `Oluşturan ${creator}`,
    formatDate(item.createdAt),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onMenu}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={item.legalTitle}
      accessibilityHint="İşlemler için basılı tutun"
      className="my-1 min-h-[52px] gap-1.5 rounded-[14px] border border-border bg-card px-3 py-2.5 active:opacity-70"
    >
      <View className="flex-row items-center gap-2.5">
        {item.logoUrl ? <CompanyLogo uri={item.logoUrl} /> : <Avatar name={item.legalTitle} size={40} square />}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-inter-semibold text-[15px] leading-[20px] text-foreground" numberOfLines={1}>
            {item.legalTitle}
          </Text>
          <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
            {location}
          </Text>
        </View>
        {onCreateOpportunity ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.legalTitle} için fırsat oluştur`}
            onPress={onCreateOpportunity}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-muted"
          >
            <Ionicons name="trending-up" size={19} color={colors.primary} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.legalTitle} işlem menüsü`}
          onPress={onMenu}
          className="-mr-1 h-11 w-11 items-center justify-center rounded-full active:bg-muted"
        >
          <Ionicons name="ellipsis-horizontal" size={19} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View className="flex-row flex-wrap items-center gap-1">
        <Chip tone={FIRM_TONE[firmType]} label={FIRM_TYPE_LABELS[firmType]} />
        {supplierLabel ? <Chip tone="info" label={supplierLabel} /> : null}
        <Chip tone={isActiveCustomer ? 'success' : 'neutral'} label={isActiveCustomer ? 'Cari Satış' : 'Potansiyel'} />
        {(item.divisions ?? []).slice(0, 2).map((division) => (
          <Chip key={division.id} tone="stage" label={division.name} />
        ))}
        {(item.divisions ?? []).length > 2 ? <Chip tone="neutral" label={`+${(item.divisions ?? []).length - 2}`} /> : null}
      </View>
      <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
        {meta}
      </Text>
    </Pressable>
  );
}

export default function CompaniesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, scope } = useAuth();
  const canCreate = useCan('companies.create');
  const canUpdate = useCan('companies.update');
  const canDelete = useCan('companies.delete');
  const canExport = useCan('reports.export');
  const canCreateOpportunity = useCan('opportunities.create');
  const isSuperAdmin = user?.roles.includes('super_admin') ?? false;
  const visibility = companyVisibility(user?.roles ?? []);

  const [search, setSearch] = useState('');
  const serverSearch = useDebouncedValue(search.trim(), 275);
  const [tab, setTab] = useState<'all' | FirmType>('all');
  const [salesTab, setSalesTab] = useState<SalesStatusTab>('all');
  const [divisionId, setDivisionId] = useState<string>(() => scope.divisionId ?? 'all');
  const [city, setCity] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [supplierCategory, setSupplierCategory] = useState<'all' | 'transportation' | 'logistics'>('all');
  const [sortMode, setSortMode] = useState<CompanySortMode>('default');
  const [exporting, setExporting] = useState(false);
  const [menuTarget, setMenuTarget] = useState<CompanyListRow | null>(null);

  const filterSheetRef = useRef<BottomSheetModal>(null);
  const sortSheetRef = useRef<BottomSheetModal>(null);
  const menuSheetRef = useRef<BottomSheetModal>(null);
  const statusSheetRef = useRef<BottomSheetModal>(null);

  const summary = useCompanySummaryExt(divisionId);
  const filters = useMemo(
    () => ({
      search: serverSearch,
      tab,
      salesTab,
      divisionId,
      city: city ?? undefined,
      sector: sector ?? undefined,
      supplierCategory,
      sortMode,
    }),
    [serverSearch, tab, salesTab, divisionId, city, sector, supplierCategory, sortMode],
  );
  const query = useMemo(() => buildCompanyQuery(filters), [filters]);
  const list = useCompanyListExt(query);
  const updateStatus = useUpdateCompanyStatus({});
  const deleteCompany = useDeleteCompany();

  const items = list.data?.items ?? [];
  const byRelation = summary.data?.byRelation ?? {};
  const countBy = (type: FirmType) => byRelation[type] ?? 0;
  const advancedFilterCount =
    (salesTab !== 'all' ? 1 : 0) + (city ? 1 : 0) + (sector ? 1 : 0) + (supplierCategory !== 'all' ? 1 : 0);

  const relationOptions = useMemo(
    () => [
      { value: 'customer' as const, label: 'Müşteri', count: countBy('customer') },
      { value: 'supplier_customer' as const, label: 'Tedarikçi + Müşteri', count: countBy('supplier_customer') },
      ...(visibility.canSeeSuppliers ? [{ value: 'supplier' as const, label: 'Tedarikçi', count: countBy('supplier') }] : []),
      ...(visibility.canSeeCompetitors ? [{ value: 'competitor' as const, label: 'Rakip', count: countBy('competitor') }] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byRelation, visibility.canSeeSuppliers, visibility.canSeeCompetitors],
  );

  const openMenu = useCallback((item: CompanyListRow) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenuTarget(item);
    menuSheetRef.current?.present();
  }, []);

  async function exportExcel() {
    if (exporting) return;
    setExporting(true);
    try {
      await exportService.companies(query);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Excel indirilemedi');
    } finally {
      setExporting(false);
    }
  }

  function confirmDelete(item: CompanyListRow) {
    Alert.alert(
      'Firmayı sil?',
      `${item.legalTitle}\n\nFirma kimliği silinir. Bağlı kişi, satış kartı, makine, servis veya finans kaydı varsa sistem işlemi güvenli biçimde reddeder.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Firmayı Sil',
          style: 'destructive',
          onPress: () =>
            deleteCompany.mutate(item.id, {
              onSuccess: () => toast.success('Firma silindi'),
              onError: (error) => toast.error(`Firma silinemedi · ${error.message || 'Bağlı kayıtlar olabilir.'}`),
            }),
        },
      ],
    );
  }

  function applyStatus(code: StatusCode) {
    if (!menuTarget) return;
    statusSheetRef.current?.dismiss();
    updateStatus.mutate({ id: menuTarget.id, customerStatusCode: code, operationId: Crypto.randomUUID() });
  }

  const salesOptions = [
    ...(visibility.canSeePotential ? [{ value: 'potential' as const, label: 'Potansiyel' }] : []),
    { value: 'active_customer' as const, label: 'Cari Satış Yapılan' },
  ];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Firmalar"
        subtitle="Tüm firma kayıtlarını görüntüleyin ve yönetin."
        actions={[
          { icon: 'swap-vertical-outline', label: 'Firmaları sırala', onPress: () => sortSheetRef.current?.present() },
          ...(canExport
            ? [{ icon: exporting ? ('hourglass-outline' as const) : ('download-outline' as const), label: 'Excel indir', onPress: () => void exportExcel() }]
            : []),
          ...(isSuperAdmin
            ? [{ icon: 'cloud-upload-outline' as const, label: 'Firma ve kontak içe aktar', onPress: () => router.push(`/modal/company-import?divisionId=${divisionId}` as Href) }]
            : []),
        ]}
      />

      {summary.data ? (
        <View className="pb-2">
          <StatStrip
            items={[
              { label: 'Toplam Firma', value: String(summary.data.total), icon: 'business-outline' },
              { label: 'Müşteri', value: String(countBy('customer')), icon: 'people-outline', tone: 'info' },
              ...(visibility.canSeeSuppliers
                ? [{ label: 'Tedarikçi', value: String(countBy('supplier')), icon: 'construct-outline' as const, tone: 'warning' as const }]
                : []),
              { label: 'Ted.+Müşteri', value: String(countBy('supplier_customer')), icon: 'git-merge-outline' },
            ]}
          />
        </View>
      ) : null}

      <View className="gap-2 pb-2">
        <FilterChips options={relationOptions} value={tab === 'all' ? null : tab} onChange={(next) => setTab(next ?? 'all')} allLabel="Tümü" />
        {(user?.divisions?.length ?? 0) > 0 ? (
          <FilterChips
            options={(user?.divisions ?? []).map((division) => ({ value: division.id, label: division.name }))}
            value={divisionId === 'all' ? null : divisionId}
            onChange={(next) => setDivisionId(next ?? 'all')}
            allLabel="Tüm bölümler"
          />
        ) : null}
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Firma, şehir, e-posta ara..."
          onFilterPress={() => filterSheetRef.current?.present()}
          filterActive={advancedFilterCount > 0}
        />
        {list.data ? (
          <Text style={{ paddingHorizontal: SCREEN_PAD }} className="font-inter text-xs text-muted-foreground">
            Toplam <Text className="font-inter-semibold text-foreground">{list.data.total}</Text> firma gösteriliyor
          </Text>
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
          renderItem={({ item }) => (
            <CompanyRow
              item={item}
              onOpen={() => router.push(`/(tabs)/modules/companies/${item.id}`)}
              onCreateOpportunity={
                canCreateOpportunity
                  ? () =>
                      router.push(
                        `/modal/new-opportunity?companyId=${item.id}&companyName=${encodeURIComponent(item.shortName ?? item.legalTitle)}` as Href,
                      )
                  : undefined
              }
              onMenu={() => openMenu(item)}
            />
          )}
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
              title="Bu filtreye uyan firma bulunamadı"
              hint="Arama terimini veya filtreleri değiştirerek tekrar deneyin."
              icon="business-outline"
              actionLabel={canCreate ? 'Yeni Firma' : undefined}
              onAction={canCreate ? () => router.push('/modal/new-company') : undefined}
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}

      {canCreate ? (
        <Fab
          label="Yeni Firma"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/modal/new-company');
          }}
        />
      ) : null}

      <SheetMenu
        ref={sortSheetRef}
        title="Sıralama"
        items={COMPANY_SORT_OPTIONS.map((option) => ({
          key: option.value,
          label: option.label,
          selected: option.value === sortMode,
          onPress: () => setSortMode(option.value),
        }))}
      />

      <SheetMenu
        ref={menuSheetRef}
        title={menuTarget?.legalTitle ?? 'Firma'}
        items={
          menuTarget
            ? [
                { key: 'view', label: 'Görüntüle', icon: 'eye-outline', onPress: () => router.push(`/(tabs)/modules/companies/${menuTarget.id}`) },
                ...(canUpdate
                  ? [
                      {
                        key: 'edit',
                        label: 'Düzenle',
                        icon: 'create-outline' as const,
                        onPress: () => router.push(`/modal/edit-company?id=${encodeURIComponent(menuTarget.id)}` as Href),
                      },
                      {
                        key: 'status',
                        label: 'Müşteri durumunu değiştir',
                        icon: 'swap-horizontal-outline' as const,
                        onPress: () => statusSheetRef.current?.present(),
                      },
                    ]
                  : []),
                {
                  key: 'mail',
                  label: 'E-posta gönder',
                  icon: 'mail-outline',
                  disabled: !menuTarget.primaryEmail,
                  onPress: () =>
                    menuTarget.primaryEmail &&
                    router.push(
                      mailComposeHref({ to: menuTarget.primaryEmail, name: menuTarget.shortName ?? menuTarget.legalTitle, companyId: menuTarget.id }) as Href,
                    ),
                },
                ...(canDelete
                  ? [{ key: 'delete', label: 'Sil', icon: 'trash-outline' as const, destructive: true, onPress: () => confirmDelete(menuTarget) }]
                  : []),
              ]
            : []
        }
      />

      <SheetMenu
        ref={statusSheetRef}
        title={menuTarget?.legalTitle ?? 'Firma'}
        subtitle="Müşteri durumunu değiştir"
        items={STATUS_OPTIONS.map((option) => ({
          key: option.code,
          label: option.label,
          selected: menuTarget?.customerStatus?.code === option.code,
          onPress: () => applyStatus(option.code),
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
          <Text style={{ paddingHorizontal: SCREEN_PAD }} className="font-inter-semibold text-base text-foreground">Müşteri Statüsü</Text>
          <FilterChips
            options={salesOptions}
            value={salesTab === 'all' ? null : salesTab}
            onChange={(next) => setSalesTab(next ?? 'all')}
            allLabel="Hepsi"
          />
          <Text style={{ paddingHorizontal: SCREEN_PAD }} className="font-inter-semibold text-base text-foreground">Şehir</Text>
          <FilterChips
            options={(summary.data?.cities ?? []).map((value) => ({ value, label: value }))}
            value={city}
            onChange={setCity}
            allLabel="Tümü"
          />
          <Text style={{ paddingHorizontal: SCREEN_PAD }} className="font-inter-semibold text-base text-foreground">Sektör</Text>
          <FilterChips
            options={(summary.data?.sectors ?? []).map((value) => ({ value, label: value }))}
            value={sector}
            onChange={setSector}
            allLabel="Tümü"
          />
          <Text style={{ paddingHorizontal: SCREEN_PAD }} className="font-inter-semibold text-base text-foreground">Tedarikçi Türü</Text>
          <FilterChips
            options={[
              { value: 'transportation' as const, label: 'Nakliye' },
              { value: 'logistics' as const, label: 'Lojistik' },
            ]}
            value={supplierCategory === 'all' ? null : supplierCategory}
            onChange={(next) => setSupplierCategory(next ?? 'all')}
            allLabel="Tümü"
          />
          {advancedFilterCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSalesTab('all');
                setCity(null);
                setSector(null);
                setSupplierCategory('all');
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
