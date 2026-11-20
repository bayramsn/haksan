import { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useCompanyList, useUpdateCompanyStatus } from '@/src/api/companies.hooks';
import { mediaUrl } from '@/src/api/config';
import { companies, type CompanyListItem, type CompanyListQuery } from '@/src/api/endpoints';
import { useTheme } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import {
  ListSkeleton,
  Button,
  EmptyState,
  ErrorState,
  Fab,
  FilterChips,
  Loading,
  SCREEN_PAD,
  ScreenHeader,
  SearchBar,
} from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useCan } from '@/src/auth/AuthProvider';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

const STATUS_OPTIONS = [
  { code: 'potential', label: 'Potansiyel' },
  { code: 'active', label: 'Aktif' },
  { code: 'passive', label: 'Pasif' },
  { code: 'blacklist', label: 'Kara liste' },
] as const;

type StatusCode = (typeof STATUS_OPTIONS)[number]['code'];

const RELATION_OPTIONS = [
  { value: 'customer', label: 'Müşteri' },
  { value: 'supplier', label: 'Tedarikçi' },
  { value: 'supplier_customer', label: 'Tedarikçi+Müşteri' },
  { value: 'competitor', label: 'Rakip' },
] as const;

type RelationCode = (typeof RELATION_OPTIONS)[number]['value'];

/** Mockup'ta logo, beyaz zeminli kenarlıklı bir karenin içinde durur. */
function CompanyLogo({ uri }: { uri: string }) {
  const source = { uri: mediaUrl(uri) ?? uri };
  return (
    <View
      className="h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-[12px] border border-border bg-card"
      style={{ borderCurve: 'continuous' }}
    >
      <Image source={source} className="h-9 w-9" resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

/** Compact content row; quick status stays available through long press. */
function CompanyRow({ item, onOpen, onQuickStatus }: { item: CompanyListItem; onOpen: () => void; onQuickStatus?: () => void }) {
  const { colors } = useTheme();
  const city = item.primaryAddress?.province;
  return <Pressable onPress={onOpen} onLongPress={onQuickStatus} delayLongPress={350}
    accessibilityRole="button" accessibilityLabel={item.legalTitle}
    accessibilityHint={onQuickStatus ? 'Durumu değiştirmek için basılı tutun' : undefined}
    className="min-h-11 flex-row items-start gap-3 border-b border-border bg-card py-4 active:opacity-70">
    {item.logoUrl ? <CompanyLogo uri={item.logoUrl} /> : <Avatar name={item.legalTitle} size={46} square />}
    <View className="flex-1 gap-2">
      <Text className="font-inter-semibold text-base leading-6 text-foreground" numberOfLines={2}>{item.legalTitle}</Text>
      <View className="flex-row flex-wrap items-center gap-2">
        {city ? <Text className="font-inter text-sm text-muted-foreground">{city}</Text> : null}
        {item.relationType ? <Text className="font-inter text-sm text-muted-foreground">{item.relationType.name}</Text> : null}
      </View>
      <Text className="font-inter text-xs text-muted-foreground">Güncelleme: {new Date(item.updatedAt).toLocaleDateString('tr-TR')}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
  </Pressable>;
}

export default function CompaniesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('companies.create');
  const canUpdate = useCan('companies.update');
  const [search, setSearch] = useState('');
  const serverSearch = useDebouncedValue(search.trim());
  const { status } = useLocalSearchParams<{ status?: string }>();
  const [statusFilter, setStatusFilter] = useState<StatusCode | null>(() => STATUS_OPTIONS.find((option) => option.code === status)?.code ?? null);
  const [relationFilter, setRelationFilter] = useState<RelationCode | null>(null);
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  const statusSheetRef = useRef<BottomSheetModal>(null);
  const [sheetTarget, setSheetTarget] = useState<CompanyListItem | null>(null);
  const filterSheetRef = useRef<BottomSheetModal>(null);

  const summary = useQuery({ queryKey: ['companies', 'summary'], queryFn: companies.summary });

  const query = useMemo<CompanyListQuery>(
    () => ({
      search: serverSearch || undefined,
      customerStatusCode: statusFilter ?? undefined,
      relationTypeCode: relationFilter ?? undefined,
      city: cityFilter ?? undefined,
      sector: sectorFilter ?? undefined,
      sortBy: 'name',
      sortDir: 'asc',
    }),
    [serverSearch, statusFilter, relationFilter, cityFilter, sectorFilter]
  );

  const list = useCompanyList(query);
  const updateStatus = useUpdateCompanyStatus(query);

  const openStatusSheet = useCallback((item: CompanyListItem) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSheetTarget(item);
    statusSheetRef.current?.present();
  }, []);

  const applyStatus = useCallback(
    (code: StatusCode) => {
      if (!sheetTarget) return;
      statusSheetRef.current?.dismiss();
      updateStatus.mutate({ id: sheetTarget.id, customerStatusCode: code, operationId: Crypto.randomUUID() });
      setSheetTarget(null);
    },
    [sheetTarget, updateStatus]
  );

  const items = list.data?.items ?? [];
  const activeFilters = [
    relationFilter ? { key: 'relation', label: RELATION_OPTIONS.find(item => item.value === relationFilter)?.label ?? relationFilter, clear: () => setRelationFilter(null) } : null,
    statusFilter ? { key: 'status', label: STATUS_OPTIONS.find(item => item.code === statusFilter)?.label ?? statusFilter, clear: () => setStatusFilter(null) } : null,
    cityFilter ? { key: 'city', label: cityFilter, clear: () => setCityFilter(null) } : null,
    sectorFilter ? { key: 'sector', label: sectorFilter, clear: () => setSectorFilter(null) } : null,
  ].filter(item => item !== null);
  const clearFilters = () => { setRelationFilter(null); setStatusFilter(null); setCityFilter(null); setSectorFilter(null); };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Firmalar" count={list.data?.total} />

      <View className="gap-3 pb-3 pt-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Firma ara..."
          onFilterPress={() => filterSheetRef.current?.present()} filterActive={activeFilters.length > 0} />
        <FilterChips options={[...RELATION_OPTIONS]} value={relationFilter} onChange={setRelationFilter} />
        {activeFilters.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: 8 }}>
          {activeFilters.map(filter => <Pressable key={filter.key} accessibilityRole="button" accessibilityLabel={`${filter.label} filtresini kaldır`} onPress={filter.clear}
            className="min-h-11 flex-row items-center gap-2 rounded-control border border-border px-3 py-2">
            <Text className="font-inter text-sm text-foreground">{filter.label}</Text>
            <Ionicons name="close" size={16} color={colors.mutedForeground} />
          </Pressable>)}
          <Pressable accessibilityRole="button" onPress={clearFilters} className="min-h-11 justify-center px-3"><Text className="font-inter-medium text-sm text-primary">Tümünü temizle</Text></Pressable>
        </ScrollView> : null}
        <View className="flex-row flex-wrap justify-between gap-2 px-4">
          <Text accessibilityLiveRegion="polite" className="font-inter text-sm text-muted-foreground">{list.data ? `${list.data.total} sonuç` : 'Firmalar'}</Text>
          {summary.data ? <Text className="font-inter text-xs text-muted-foreground">Toplam {summary.data.total} firma</Text> : null}
        </View>
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList contentInsetAdjustmentBehavior="automatic"
          // v2'de bu özellik varsayılan AÇIK ve sayfalama/yeniden ölçüm sonrası
          // içeriği çapalayıp listenin başında boşluk bırakıyor. Bunlar sohbet
          // değil, tepeden akan listeler — kapalı olmalı.
          maintainVisibleContentPosition={{ disabled: true }}
          // FlashList v2 kendi başına esnemiyor; sınırlanmamış sütun içinde
          // içerik aşağı kayıyor ve filtrelerin altında boşluk kalıyor.
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 96 }}
          renderItem={({ item }) => (
            <CompanyRow
              item={item}
              onOpen={() => router.push(`/modules/companies/${item.id}`)}
              onQuickStatus={canUpdate ? () => openStatusSheet(item) : undefined}
            />
          )}
          // §4.2: kullanıcı dibe yaklaşınca sonraki 50 kayıt.
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={
            <EmptyState
              title="Firma bulunamadı"
              hint={search.trim() || activeFilters.length ? 'Arama veya filtreleri değiştirin.' : 'İlk firma kaydını ekleyerek başlayın.'}
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

      {canUpdate ? <BottomSheetModal
        ref={statusSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
        onDismiss={() => setSheetTarget(null)}
      >
        <BottomSheetView className="gap-2 px-5 pb-10 pt-2">
          <Text className="text-base font-inter-semibold text-foreground" numberOfLines={1}>
            {sheetTarget?.legalTitle}
          </Text>
          <Text className="font-inter mb-2 text-xs text-muted-foreground">Müşteri durumunu değiştir</Text>
          {STATUS_OPTIONS.map((opt) => (
            <Button
              key={opt.code}
              label={opt.label}
              variant={sheetTarget?.customerStatus?.code === opt.code ? 'primary' : 'ghost'}
              onPress={() => applyStatus(opt.code)}
            />
          ))}
        </BottomSheetView>
      </BottomSheetModal> : null}

      <BottomSheetModal
        ref={filterSheetRef}
        enableDynamicSizing
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-5 pb-10 pt-2">
          <Text className="font-inter-semibold text-base text-foreground">Durum</Text>
          <FilterChips
            options={STATUS_OPTIONS.map((option) => ({ value: option.code, label: option.label }))}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <Text className="font-inter-semibold text-base text-foreground">Şehir</Text>
          <FilterChips
            options={(summary.data?.cities ?? []).map((c) => ({ value: c, label: c }))}
            value={cityFilter}
            onChange={setCityFilter}
          />
          <Text className="pt-2 font-inter-semibold text-base text-foreground">Sektör</Text>
          <FilterChips
            options={(summary.data?.sectors ?? []).map((s) => ({ value: s, label: s }))}
            value={sectorFilter}
            onChange={setSectorFilter}
          />
        </BottomSheetView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
