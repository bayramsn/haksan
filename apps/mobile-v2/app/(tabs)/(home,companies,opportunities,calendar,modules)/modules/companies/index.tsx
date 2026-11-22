import { useCallback, useMemo, useRef, useState } from 'react';
import { DISTRICTS_BY_PROVINCE } from '@haksan/shared';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { SheetBackdrop } from '@/src/ui/SheetBackdrop';
import { useDeleteCompany, useUpdateCompanyStatus } from '@/src/api/companies.hooks';
import { useCompanyListExt, useCompanySummaryExt } from '@/src/api/crm-general.hooks';
import type { CompanyListRow } from '@/src/api/crm-general.api';
import { mediaUrl } from '@/src/api/config';
import { exportService } from '@/src/api/exports';
import { useTheme } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import {
  ListSkeleton,
  Chip,
  EmptyState,
  ErrorState,
  Fab,
  FilterChips,
  Loading,
  Button,
  SCREEN_PAD,
  ScreenHeader,
  SearchBar,
  GroupedDivider,
  groupedRowClass,
} from '@/src/ui';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useCanAccessModule } from '@/src/modules/useModuleAccess';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { toast } from '@/src/ui/toast';
import { SheetMenu } from '@/src/ui/crm/SheetMenu';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
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
  onMenu,
  first,
  last,
}: {
  item: CompanyListRow;
  onOpen: () => void;
  onMenu: () => void;
  first: boolean;
  last: boolean;
}) {
  const firmType = firmTypeOf(item);
  const location = [item.primaryAddress?.province, item.primaryAddress?.district].filter(Boolean).join(' / ');
  const supplierLabel = supplierCategoryLabel(item.supplierCategoryCode);
  const isActiveCustomer = item.customerStatus?.code === 'active';
  // Varsayılanlar (Müşteri, Potansiyel) her satırda tekrar edip gürültü yapıyordu; yalnızca ayırt eden bilgi kalır.
  const meta = [location || null, firmType === 'customer' ? null : FIRM_TYPE_LABELS[firmType], supplierLabel].filter(Boolean).join(' · ');
  const a11y = [item.legalTitle, location || 'Konum yok', FIRM_TYPE_LABELS[firmType], isActiveCustomer ? 'Cari' : 'Potansiyel', supplierLabel].filter(Boolean).join(', ');

  return (
    // Gri zemin üstünde beyaz gruplu yüzey (iOS inset grouped); işlemler uzun basışta.
    <Pressable onPress={onOpen} onLongPress={onMenu} delayLongPress={350}
      accessibilityRole="button" accessibilityLabel={`${a11y}. Firma detayını aç`}
      accessibilityHint="Uzun basınca firma işlemleri açılır"
      accessibilityActions={[{ name: 'longpress', label: 'Firma işlemleri' }]}
      onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onMenu(); }}
      className={`min-h-[64px] flex-row items-center gap-3 py-3 active:bg-secondary ${groupedRowClass(first, last)}`}
      style={{ borderCurve: 'continuous' }}>
      {item.logoUrl ? <CompanyLogo uri={item.logoUrl} /> : <Avatar name={item.legalTitle} size={40} square muted />}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-inter-medium text-[15px] leading-[20px] text-foreground" numberOfLines={2}>{item.legalTitle}</Text>
        {meta ? <Text className="font-inter text-[13px] leading-[18px] text-muted-foreground" numberOfLines={1}>{meta}</Text> : null}
      </View>
      {isActiveCustomer ? (
        <View className="flex-row items-center gap-1.5">
          <View className="h-1.5 w-1.5 rounded-full bg-success" />
          <Text className="font-inter-medium text-[12px] text-success">Cari</Text>
        </View>
      ) : null}
      {last ? null : <GroupedDivider inset={68} />}
    </Pressable>
  );
}

export default function CompaniesScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const { colors } = useTheme();
  const { user, scope } = useAuth();
  const canCreate = useCan('companies.create');
  const canUpdate = useCan('companies.update');
  const canDelete = useCan('companies.delete');
  const canReadCompanies = useCan('companies.read');
  const canExport = useCan('reports.export') && canReadCompanies;
  const canCreateOpportunity = useCan('opportunities.create');
  const showOpportunities = useCanAccessModule('opportunities');
  const isSuperAdmin = user?.roles.includes('super_admin') ?? false;
  const visibility = companyVisibility(user?.roles ?? []);

  const [search, setSearch] = useState('');
  const serverSearch = useDebouncedValue(search.trim(), 275);
  const [tab, setTab] = useState<'all' | FirmType>('all');
  const [salesTab, setSalesTab] = useState<SalesStatusTab>('all');
  const [divisionId, setDivisionId] = useState<string>(() => scope.divisionId ?? 'all');
  const [city, setCity] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [supplierCategory, setSupplierCategory] = useState<'all' | 'transportation' | 'logistics'>('all');
  const [sortMode, setSortMode] = useState<CompanySortMode>('default');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const exportInFlight = useRef(false);
  const searchPending = search.trim() !== serverSearch;
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
      district: district ?? undefined,
      sector: sector ?? undefined,
      supplierCategory,
      sortMode,
    }),
    [serverSearch, tab, salesTab, divisionId, city, district, sector, supplierCategory, sortMode],
  );
  const query = useMemo(() => buildCompanyQuery(filters), [filters]);
  const list = useCompanyListExt(query);
  const updateStatus = useUpdateCompanyStatus({});
  const deleteCompany = useDeleteCompany();

  const items = list.data?.items ?? [];
  const byRelation = summary.data?.byRelation ?? {};
  const countBy = (type: FirmType) => byRelation[type] ?? 0;
  const advancedFilterCount =
    (salesTab !== 'all' ? 1 : 0) + (city ? 1 : 0) + (district ? 1 : 0) + (sector ? 1 : 0) + (supplierCategory !== 'all' ? 1 : 0) + (divisionId !== 'all' ? 1 : 0);
  const hasFilters = search.trim().length > 0 || tab !== 'all' || advancedFilterCount > 0;
  function clearFilters() {
    setSearch(''); setTab('all'); setSalesTab('all'); setCity(null); setDistrict(null); setSector(null); setSupplierCategory('all'); setDivisionId('all');
  }

  const relationOptions = useMemo(
    () => [
      { value: 'customer' as const, label: 'Müşteri', count: summary.data ? countBy('customer') : undefined },
      { value: 'supplier_customer' as const, label: 'Tedarikçi + Müşteri', count: summary.data ? countBy('supplier_customer') : undefined },
      ...(visibility.canSeeSuppliers ? [{ value: 'supplier' as const, label: 'Tedarikçi', count: summary.data ? countBy('supplier') : undefined }] : []),
      ...(visibility.canSeeCompetitors ? [{ value: 'competitor' as const, label: 'Rakip', count: summary.data ? countBy('competitor') : undefined }] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byRelation, visibility.canSeeSuppliers, visibility.canSeeCompetitors],
  );

  const openMenu = useCallback((item: CompanyListRow) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenuTarget(item);
    menuSheetRef.current?.present();
  }, []);

  async function exportCompanies(format: 'xlsx' | 'pdf') {
    if (!canExport || exportInFlight.current || searchPending) return;
    exportInFlight.current = true;
    setExporting(format);
    try {
      await (format === 'pdf' ? exportService.companiesPdf(query) : exportService.companies(query));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dosya indirilemedi');
    } finally {
      exportInFlight.current = false;
      setExporting(null);
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
    if (!menuTarget || updateStatus.isPending) return;
    statusSheetRef.current?.dismiss();
    updateStatus.mutate({ id: menuTarget.id, customerStatusCode: code, operationId: Crypto.randomUUID() });
  }

  const salesOptions = [
    ...(visibility.canSeePotential ? [{ value: 'potential' as const, label: 'Potansiyel' }] : []),
    { value: 'active_customer' as const, label: 'Cari Satış Yapılan' },
  ];

  type ChromeRow = { kind: 'intro' } | { kind: 'search' } | { kind: 'empty' } | { kind: 'company'; item: CompanyListRow };
  const rows = useMemo<ChromeRow[]>(() => {
    const head: ChromeRow[] = [{ kind: 'intro' }, { kind: 'search' }];
    if (items.length === 0) return [...head, { kind: 'empty' }];
    return [...head, ...items.map((item) => ({ kind: 'company' as const, item }))];
  }, [items]);

  const intro = (
    <View className="gap-3 pb-2">
      <ScreenHeader title="Firmalar" compact
        actions={[
          { icon: 'swap-vertical-outline', label: 'Firmaları sırala', onPress: () => sortSheetRef.current?.present() },
          ...(canExport ? [
            { icon: 'download-outline' as const, label: exporting === 'xlsx' ? 'Excel hazırlanıyor…' : 'Excel indir', disabled: Boolean(exporting) || searchPending, onPress: () => void exportCompanies('xlsx') },
            { icon: 'document-text-outline' as const, label: exporting === 'pdf' ? 'PDF hazırlanıyor…' : 'PDF indir', disabled: Boolean(exporting) || searchPending, onPress: () => void exportCompanies('pdf') },
          ] : []),
          ...(isSuperAdmin ? [{ icon: 'cloud-upload-outline' as const, label: 'Firma ve kontak içe aktar', onPress: () => router.push(`/modal/company-import?divisionId=${divisionId}` as Href) }] : []),
        ]} />
      <FilterChips options={relationOptions} value={tab === 'all' ? null : tab} onChange={(next) => setTab(next ?? 'all')} allLabel="Tümü" />
    </View>
  );

  const searchBar = (
    <View className="gap-2 bg-canvas pb-3 pt-2">
      <SearchBar value={search} onChange={setSearch} placeholder="Firma, şehir veya e-posta ara…"
        onFilterPress={() => filterSheetRef.current?.present()} filterActive={advancedFilterCount > 0} />
      <View className="min-h-11 flex-row items-center justify-between gap-3" style={{ paddingHorizontal: SCREEN_PAD }}>
        <Text accessibilityLiveRegion="polite" className="min-w-0 flex-1 font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
          {[list.data ? `${list.data.total} firma` : null, COMPANY_SORT_OPTIONS.find((option) => option.value === sortMode)?.label, advancedFilterCount ? `${advancedFilterCount} filtre` : null].filter(Boolean).join(' · ')}
        </Text>
        {hasFilters ? <Pressable accessibilityRole="button" accessibilityLabel="Firma aramasını ve filtreleri temizle" onPress={clearFilters}
          className="min-h-11 justify-center px-2 active:opacity-70"><Text className="font-inter-medium text-[13px] text-primary">Temizle</Text></Pressable> : null}
      </View>
      {city || district || sector || salesTab !== 'all' || supplierCategory !== 'all' ? <View className="flex-row flex-wrap gap-2 px-4">
        {[city, district, sector, salesTab !== 'all' ? salesOptions.find((option) => option.value === salesTab)?.label : null, supplierCategory !== 'all' ? supplierCategoryLabel(supplierCategory) : null]
          .filter((label): label is string => Boolean(label)).map((label, index) => <Chip key={`${label}-${index}`} tone="neutral" label={label} />)}
      </View> : null}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />

      {list.isPending ? (
        <>
          {intro}
          {searchBar}
          <ListSkeleton />
        </>
      ) : list.error ? (
        <>
          {intro}
          {searchBar}
          <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
        </>
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(row) => (row.kind === 'company' ? row.item.id : row.kind)}
          getItemType={(row) => row.kind}
          stickyHeaderIndices={[1]}
          contentContainerStyle={{ paddingBottom: GLASS_TAB_BAR_HEIGHT + 88 }}
          renderItem={({ item: row, index }) => {
            if (row.kind === 'intro') return intro;
            if (row.kind === 'search') return searchBar;
            if (row.kind === 'empty') {
              return (
                <EmptyState
                  title="Bu filtreye uyan firma bulunamadı"
                  hint="Arama terimini veya filtreleri değiştirerek tekrar deneyin."
                  icon="business-outline"
                  actionLabel={hasFilters ? 'Arama ve filtreleri temizle' : canCreate ? 'Yeni firma oluştur' : undefined}
                  onAction={hasFilters ? clearFilters : canCreate ? () => router.push('/modal/new-company') : undefined}
                />
              );
            }
            return (
              <View style={{ paddingHorizontal: SCREEN_PAD }}>
                <CompanyRow
                  first={index === 2}
                  last={index === rows.length - 1}
                  item={row.item}
                  onOpen={() => router.push(`/modules/companies/${row.item.id}`)}
                  onMenu={() => openMenu(row.item)}
                />
              </View>
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
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}

      {canCreate ? (
        <View pointerEvents="box-none" className="absolute right-0 h-[68px] w-[190px]" style={{ bottom: GLASS_TAB_BAR_HEIGHT }}>
        <Fab bottomOffset={20} extended
          label="Yeni firma"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/modal/new-company');
          }}
        />
        </View>
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
                { key: 'view', label: 'Görüntüle', icon: 'eye-outline', onPress: () => router.push(`/modules/companies/${menuTarget.id}`) },
                ...(canCreateOpportunity && showOpportunities
                  ? [{ key: 'opportunity', label: 'Fırsat oluştur', icon: 'trending-up-outline' as const,
                      onPress: () => router.push(`/modal/new-opportunity?companyId=${menuTarget.id}&companyName=${encodeURIComponent(menuTarget.shortName ?? menuTarget.legalTitle)}` as Href) }]
                  : []),
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
        backdropComponent={SheetBackdrop}
      >
        <BottomSheetScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40, paddingTop: 4 }}>
          <Text style={{ paddingHorizontal: SCREEN_PAD }} className="font-inter-semibold text-base text-foreground">Müşteri Statüsü</Text>
          <FilterChips
            options={salesOptions}
            value={salesTab === 'all' ? null : salesTab}
            onChange={(next) => setSalesTab(next ?? 'all')}
            allLabel="Hepsi"
          />
          <View className="gap-4 px-4">
            {(user?.divisions?.length ?? 0) > 0 ? <OptionPicker label="Bölüm" icon="git-branch-outline" value={divisionId}
              options={[{ value: 'all', label: 'Tüm bölümler' }, ...(user?.divisions ?? []).map((division) => ({ value: division.id, label: division.name }))]}
              onChange={(value) => setDivisionId(value ?? 'all')} searchable /> : null}
            <OptionPicker label="Şehir" icon="location-outline" value={city}
              options={(summary.data?.cities ?? []).map((value) => ({ value, label: value }))}
              onChange={(value) => { setCity(value); setDistrict(null); }} placeholder="Tüm şehirler" searchable clearable />
            <OptionPicker label="İlçe" icon="location-outline" value={district}
              options={(city ? DISTRICTS_BY_PROVINCE[city] ?? [] : []).map((value) => ({ value, label: value }))}
              onChange={setDistrict} placeholder={city ? 'Tüm ilçeler' : 'Önce şehir seçin'} disabled={!city} searchable clearable />
            <OptionPicker label="Sektör" icon="business-outline" value={sector}
              options={(summary.data?.sectors ?? []).map((value) => ({ value, label: value }))}
              onChange={setSector} placeholder="Tüm sektörler" searchable clearable />
          </View>
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
          <View className="gap-2 px-4 pt-2">
            <Button label="Sonuçları göster" onPress={() => filterSheetRef.current?.dismiss()} />
            {advancedFilterCount > 0 ? <Button label="Filtreleri temizle" variant="ghost" onPress={() => {
              setSalesTab('all'); setCity(null); setDistrict(null); setSector(null); setSupplierCategory('all'); setDivisionId('all');
            }} /> : null}
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
