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
import { useCompanyList, useUpdateCompanyStatus } from '@/src/api/companies.hooks';
import { mediaUrl } from '@/src/api/config';
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
  SCREEN_PAD,
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
      <Pressable
        onPress={onOpen}
        // Durum değiştirme eskiden sola kaydırmaydı; ReanimatedSwipeable
        // FlashList v2 içinde satırı ~36pt fazla ölçtürüp listede boşluk
        // bırakıyordu. Aynı eylem artık basılı tutmada — sarmalayıcı yok.
        onLongPress={onQuickStatus}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={item.legalTitle}
        accessibilityHint={onQuickStatus ? 'Durumu değiştirmek için basılı tutun' : undefined}
        className="my-[5px] flex-row items-center gap-3 rounded-[16px] border border-border bg-card px-3 py-3 active:opacity-70"
      >
        {item.logoUrl ? <CompanyLogo uri={item.logoUrl} /> : <Avatar name={item.legalTitle} size={46} square />}
        <View className="flex-1 gap-1">
          <Text className="text-[16px] font-inter-semibold leading-[21px] text-foreground" numberOfLines={1}>
            {item.legalTitle}
          </Text>
          {city ? (
            <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={1}>
              {city}
            </Text>
          ) : null}
          <View className="flex-row items-center gap-1.5 pt-0.5">
            {item.relationType ? <Chip tone={RELATION_TONE[item.relationType.code] ?? 'neutral'} label={item.relationType.name} /> : null}
            {item.sector ? <Chip tone="neutral" label={item.sector} shrink /> : null}
          </View>
        </View>

        {/* Mockup'ta sağda etiketli bir metrik var ("Açık Fırsat 5", "Cari
            Bakiye ₺125.430", "Son Aktivite 22.05.2024"). Firma listesi ucu bu
            üçünü de döndürmüyor (CompanyListItem'da fırsat sayısı, bakiye veya
            aktivite tarihi alanı yok); elimizdeki tek gerçek tarih kaydın son
            güncellemesi, o yüzden etiket de ona göre yazıldı. */}
        <View className="flex-row items-center gap-2">
          <View className="h-8 w-px" style={{ backgroundColor: colors.border }} />
          <View className="w-[84px] items-start gap-0.5">
            <View className="flex-row items-center gap-1">
              <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
              <Text className="font-inter text-[12px] text-muted-foreground">Güncelleme</Text>
            </View>
            <Text
              numberOfLines={1}
              className="font-inter-semibold text-[13px]"
              style={{ color: colors.primary, fontVariant: ['tabular-nums'] }}
            >
              {new Date(item.updatedAt).toLocaleDateString('tr-TR')}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
      </Pressable>
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
              { label: 'Toplam', value: String(summary.data!.total), icon: 'business-outline' },
              { label: 'Müşteri', value: String(byRelation.customer ?? 0), icon: 'person-outline' },
              { label: 'Tedarikçi', value: String(byRelation.supplier ?? 0), icon: 'car-outline' },
              { label: 'Tedarikçi+\nMüşteri', value: String(byRelation.supplier_customer ?? 0), icon: 'people-outline' },
              { label: 'Rakip', value: String(byRelation.competitor ?? 0), icon: 'flag-outline' },
            ]}
          />
        </View>
      ) : null}

      <View className="gap-2 pb-2">
        <FilterChips options={[...RELATION_OPTIONS]} value={relationFilter} onChange={setRelationFilter} />
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Firma ara..."
          onFilterPress={() => filterSheetRef.current?.present()}
          filterActive={Boolean(statusFilter || cityFilter || sectorFilter)}
        />
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
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
