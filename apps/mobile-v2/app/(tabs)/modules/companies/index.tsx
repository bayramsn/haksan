import { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useCompanyList, useUpdateCompanyStatus } from '@/src/api/companies.hooks';
import { apiBaseUrl } from '@/src/api/config';
import { companies, type CompanyListItem, type CompanyListQuery } from '@/src/api/endpoints';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import {
  ListSkeleton,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Fab,
  FilterChips,
  Loading,
  ScreenHeader,
  SearchBar,
  StatStrip,
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

/** İlişki tipi kodu -> ton. company-relation-types lookup'undaki code ile aynı. */
const RELATION_TONE: Record<string, Tone> = {
  customer: 'success',
  supplier: 'info',
  supplier_customer: 'stage',
  competitor: 'destructive',
};

function CompanyLogo({ uri }: { uri: string }) {
  const source = { uri: uri.startsWith('http') ? uri : `${apiBaseUrl()}${uri}` };
  return <Image source={source} className="h-10 w-10 rounded-full bg-muted" resizeMode="cover" accessibilityIgnoresInvertColors />;
}

/**
 * Tasarımdaki satır: logo/baş harf + ünvan + şehir + iki rozet + sağda değer.
 * `ListRow` tek rozet destekliyor; burada iki rozet (ilişki tipi + sektör)
 * gerektiği için yerel bir satır kullanılıyor. Sağdaki "Açık Fırsat / Cari
 * Bakiye / Son Aktivite" değeri [VERİ YOK] — bkz. rapor.
 */
function CompanyRow({ item, onOpen, onQuickStatus }: { item: CompanyListItem; onOpen: () => void; onQuickStatus?: () => void }) {
  const { colors } = useTheme();
  const city = item.primaryAddress?.province ?? null;

  return (
    <ReanimatedSwipeable
      enabled={Boolean(onQuickStatus)}
      friction={2}
      rightThreshold={40}
      // §6.1: sola kaydır -> durum değiştir. Tek elle, başparmakla ulaşılır.
      renderRightActions={onQuickStatus ? () => (
        <Pressable
          onPress={onQuickStatus}
          accessibilityRole="button"
          accessibilityLabel={`${item.legalTitle} durumunu değiştir`}
          className="my-1 w-24 items-center justify-center rounded-overlay bg-primary"
        >
          <Ionicons name="swap-horizontal-outline" size={20} color={colors.primaryForeground} />
          <Text className="mt-1 text-xs font-inter-semibold text-white">Durum</Text>
        </Pressable>
      ) : undefined}
    >
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={item.legalTitle}
        className="my-1 flex-row items-center gap-3 rounded-overlay border border-border bg-card px-3.5 py-3 active:opacity-70"
      >
        {item.logoUrl ? <CompanyLogo uri={item.logoUrl} /> : <Avatar name={item.legalTitle} size={40} />}
        <View className="flex-1 gap-1">
          <Text className="text-[15px] font-inter-semibold text-foreground" numberOfLines={1}>
            {item.legalTitle}
          </Text>
          {city ? (
            <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
              {city}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-1.5 pt-0.5">
            {item.relationType ? <Chip tone={RELATION_TONE[item.relationType.code] ?? 'neutral'} label={item.relationType.name} /> : null}
            {item.sector ? <Chip tone="neutral" label={item.sector} /> : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export default function CompaniesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('companies.create');
  const canUpdate = useCan('companies.update');
  const [search, setSearch] = useState('');
  const serverSearch = useDebouncedValue(search.trim());
  const [statusFilter, setStatusFilter] = useState<StatusCode | null>(null);
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
  const byRelation = summary.data?.byRelation;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Firmalar" subtitle="Tüm firma kayıtlarını görüntüleyin ve yönetin." />

      {byRelation ? (
        <View className="pb-2">
          <StatStrip
            items={[
              { label: 'Toplam', value: String(summary.data!.total) },
              { label: 'Müşteri', value: String(byRelation.customer ?? 0), tone: 'success' },
              { label: 'Tedarikçi', value: String(byRelation.supplier ?? 0), tone: 'info' },
              { label: 'Ted.+Müş.', value: String(byRelation.supplier_customer ?? 0), tone: 'stage' },
              { label: 'Rakip', value: String(byRelation.competitor ?? 0), tone: 'destructive' },
            ]}
          />
        </View>
      ) : null}

      <View className="gap-2 pb-2">
        {/* Tasarım: ilişki tipi üstte, durum ikinci satırda. */}
        <FilterChips options={[...RELATION_OPTIONS]} value={relationFilter} onChange={setRelationFilter} />
        <FilterChips options={STATUS_OPTIONS.map((o) => ({ value: o.code, label: o.label }))} value={statusFilter} onChange={setStatusFilter} />
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Ünvan, sektör veya şehir"
          onFilterPress={() => filterSheetRef.current?.present()}
          filterActive={Boolean(cityFilter || sectorFilter)}
        />
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96 }}
          renderItem={({ item }) => (
            <CompanyRow
              item={item}
              onOpen={() => router.push(`/(tabs)/modules/companies/${item.id}`)}
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
              hint={items.length === 0 ? 'İlk firma kaydını ekleyerek başlayın.' : 'Arama veya filtreleri değiştirin.'}
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
