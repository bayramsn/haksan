import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOpportunityAssignees, useOpportunityBoard, useOpportunityList } from '@/src/api/crm.hooks';
import {
  QUALIFICATION_STAGES,
  qualificationStageLabels,
  type OpportunityListItem,
  type OpportunityListQuery,
  type QualificationStage,
} from '@/src/api/endpoints';
import { formatAmount, formatDate } from '@/src/lib/format';
import { chipClass, chipTextClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Avatar } from '@/src/ui/Avatar';
import { useCan } from '@/src/auth/AuthProvider';
import { ListSkeleton, Chip, EmptyState, ErrorState, FilterChips, Loading, SCREEN_PAD, SearchBar } from '@/src/ui';
import { ProgressBar } from '@/src/ui/data';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { Logo } from '@/src/ui/Logo';

/** Derece -> renk. WIN yeşil, LOST kırmızı, ara dereceler soğuktan sıcağa. */
/**
 * Kartta gösterilecek makine. WIN'de `requestedMachine` (istenen) yanıltır —
 * satılan makine sunucuda WIN anında `wonProductName`'e donduruluyor.
 */
const machineOf = (item: OpportunityListItem) =>
  (item.qualificationStage === 'win' ? item.wonProductName : null) ?? item.requestedMachine;

const STAGE_TONE: Record<QualificationStage, Tone> = {
  lead: 'neutral',
  c: 'info',
  b: 'stage',
  a: 'warning',
  a_plus: 'warning',
  win: 'success',
  lost: 'destructive',
};

function stageOf(item: OpportunityListItem): QualificationStage {
  const code = item.qualificationStage;
  return QUALIFICATION_STAGES.includes(code as QualificationStage) ? (code as QualificationStage) : 'lead';
}

function companyName(item: OpportunityListItem): string {
  return item.company?.shortName ?? item.company?.legalTitle ?? item.leadCompanyTitle ?? 'Firma bağlanmadı';
}

function amountOf(item: OpportunityListItem): string | undefined {
  if (!item.estimatedValue) return undefined;
  return formatAmount(item.estimatedValue, item.currency?.code ?? 'TRY');
}

/**
 * Risk rozeti: sunucunun `qualificationReadiness.health` alanından — uydurma bir
 * skor değil, aşamada süresi geçmiş / lead SLA'sı aşılmış / aksiyonu gecikmiş
 * kartlar için gerçek sunucu bayrağı (opportunities.service.ts `processHealth`).
 */
function riskOf(item: OpportunityListItem): { label: string; tone: Tone } | null {
  const health = item.qualificationReadiness?.health;
  if (!health) return null;
  if (health.rotting || health.leadSlaBreached || health.actionOverdue) return { label: 'Gecikiyor', tone: 'destructive' };
  if (health.actionMissing) return { label: 'Aksiyon Yok', tone: 'warning' };
  return null;
}

function checklistOf(item: OpportunityListItem): { done: number; total: number } {
  const checks = item.qualificationReadiness?.checks ?? [];
  return { done: checks.filter((c) => c.complete).length, total: checks.length };
}

function OpportunitiesHeader({
  searchActive,
  filterActive,
  onSearch,
  onFilter,
}: {
  searchActive: boolean;
  filterActive: boolean;
  onSearch: () => void;
  onFilter: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="px-4 pb-2 pt-1">
      <View className="h-12 flex-row items-center justify-between">
        <Logo width={148} />
        <View className="flex-row items-center gap-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fırsat ara"
            accessibilityState={{ selected: searchActive }}
            onPress={onSearch}
            className="h-11 w-11 items-center justify-center active:opacity-60"
          >
            <Ionicons name="search-outline" size={27} color={colors.foreground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fırsatları filtrele"
            accessibilityState={{ selected: filterActive }}
            onPress={onFilter}
            className="h-11 w-11 items-center justify-center active:opacity-60"
          >
            <Ionicons name="funnel-outline" size={25} color={colors.foreground} />
            {filterActive ? <View className="absolute right-2.5 top-2 h-2.5 w-2.5 rounded-full border-2 border-canvas bg-primary" /> : null}
          </Pressable>
        </View>
      </View>
      <Text accessibilityRole="header" className="mt-3 font-inter-bold text-[30px] leading-[36px]" style={{ letterSpacing: 0 }}>
        <Text className="text-primary">Fırsatlar</Text>
        <Text className="text-foreground"> Kanban</Text>
      </Text>
    </View>
  );
}

function StageSelector({
  activeStage,
  totals,
  onSelect,
}: {
  activeStage: QualificationStage;
  totals: (stage: QualificationStage) => number;
  onSelect: (stage: QualificationStage) => void;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-1.5 px-4 pb-3"
    >
      {QUALIFICATION_STAGES.map((item) => {
        const active = item === activeStage;
        const win = item === 'win';
        const lost = item === 'lost';
        return (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={`${qualificationStageLabels[item]} aşaması, ${totals(item)} fırsat`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item)}
            className={`h-[62px] w-[50px] items-center justify-center gap-1 rounded-[8px] border px-1 active:opacity-70 ${
              active ? 'border-primary bg-primary' : 'border-border bg-card'
            }`}
            style={{ boxShadow: '0 2px 7px rgba(15, 23, 42, 0.07)' }}
          >
            <Text
              className={`font-inter-medium text-[11px] ${active ? 'text-primary-foreground' : ''}`}
              style={!active ? { color: win ? colors.success : lost ? colors.destructive : colors.foreground } : undefined}
            >
              {qualificationStageLabels[item]}
            </Text>
            <Text className={`font-inter-semibold text-[18px] ${active ? 'text-primary-foreground' : 'text-foreground'}`}>
              {totals(item)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type Board = ReturnType<typeof useOpportunityBoard>;

/**
 * Tasarım: kod + firma + ürün + sağda tutar + iki rozet (risk/öncelik ve aşama)
 * + altta "Sorumlu · Beklenen Kapanış". `ListRow` tek rozet destekliyor; iki
 * rozet gerektiği için burada yerel bir satır kullanılıyor (companies/index.tsx
 * ile aynı desen). Fırsatın okunur bir "kodu" sunucuda yok — bkz. rapor.
 */
function OpportunityRow({ item, ownerName, onPress }: { item: OpportunityListItem; ownerName: string | null; onPress: () => void }) {
  const { colors } = useTheme();
  const stage = stageOf(item);
  const risk = riskOf(item);
  const meta = [ownerName ? `Sorumlu: ${ownerName}` : null, item.expectedCloseDate ? `Beklenen kapanış: ${formatDate(item.expectedCloseDate)}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      className="my-1 flex-row items-center gap-3 rounded-overlay border border-border bg-card px-3.5 py-3 active:opacity-70"
    >
      <View className="flex-1 gap-1">
        <Text className="text-[15px] font-inter-semibold text-foreground" numberOfLines={1}>
          {companyName(item)}
        </Text>
        <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
          {machineOf(item) ?? item.title}
        </Text>
        {meta ? (
          <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-1">
        <View className="flex-row flex-wrap justify-end gap-1">
          {risk ? <Chip tone={risk.tone} label={risk.label} /> : null}
          <Chip tone={STAGE_TONE[stage]} label={qualificationStageLabels[stage]} />
        </View>
        {amountOf(item) ? <Text className="font-inter-semibold text-[13px] text-foreground">{amountOf(item)}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ pano ---- */

function BoardCard({
  item,
  ownerName,
  onPress,
}: {
  item: OpportunityListItem;
  ownerName: string | null;
  onPress: () => void;
}) {
  const tone = STAGE_TONE[stageOf(item)];
  const risk = riskOf(item);
  const { done, total } = checklistOf(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      className="mb-2 gap-1.5 rounded-[8px] border border-border bg-card p-2 active:opacity-70"
      style={{ boxShadow: '0 1px 5px rgba(15, 23, 42, 0.06)' }}
    >
      <Text className="font-inter-semibold text-[12px] leading-[15px] text-foreground" numberOfLines={3}>
        {companyName(item)}
      </Text>
      {machineOf(item) ? (
        <View className="gap-0.5">
          <Text className="font-inter text-[9px] text-muted-foreground">
            {item.qualificationStage === 'win' && item.wonProductName ? 'Satılan' : 'Ürün'}
          </Text>
          <View className="flex-row items-start gap-1">
            <View className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
            <Text className="flex-1 font-inter text-[10px] leading-[13px] text-foreground" numberOfLines={2}>
              {machineOf(item)}
            </Text>
          </View>
        </View>
      ) : null}
      {amountOf(item) ? (
        <View className="gap-0.5">
          <Text className="font-inter text-[9px] text-muted-foreground">Tutar</Text>
          <Text className="font-inter-semibold text-[11px] text-foreground" numberOfLines={1} adjustsFontSizeToFit>
            {amountOf(item)}
          </Text>
        </View>
      ) : null}
      <View className="gap-0.5">
        <Text className="font-inter text-[9px] text-muted-foreground">Risk</Text>
        <View className="flex-row items-center gap-1">
          <View className={`h-1.5 w-1.5 rounded-full ${chipClass[risk?.tone ?? tone].split(' ')[0]}`} />
          <Text className={`font-inter text-[10px] ${chipTextClass[risk?.tone ?? tone]}`} numberOfLines={1}>
            {risk?.label ?? `%${item.probability}`}
          </Text>
        </View>
      </View>
      {ownerName ? (
        <View className="mt-0.5 gap-1 border-t border-dashed border-border pt-1.5">
          <Text className="font-inter text-[9px] text-muted-foreground">Atanan Kişi</Text>
          <View className="flex-row items-center gap-1.5">
            <Avatar name={ownerName} size={20} />
            <Text className="flex-1 font-inter-medium text-[10px] text-foreground" numberOfLines={1}>
              {ownerName}
            </Text>
          </View>
        </View>
      ) : null}
      {total > 0 ? <ProgressBar done={done} total={total} /> : null}
    </Pressable>
  );
}

function BoardView({
  board,
  ownerName,
  onOpen,
  activeStage,
  columnWidth,
}: {
  board: Board;
  ownerName: (id: string | null) => string | null;
  onOpen: (id: string) => void;
  activeStage: QualificationStage;
  columnWidth: number;
}) {
  const { colors } = useTheme();

  if (board.isPending) return <Loading />;
  if (board.error) return <ErrorState message={(board.error as Error).message} />;

  const activeIndex = Math.max(0, board.columns.findIndex((column) => column.stage === activeStage));
  const visibleFirst = activeIndex > 0 ? activeIndex - 1 : 0;
  const columns = [...board.columns.slice(visibleFirst), ...board.columns.slice(0, visibleFirst)];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 pb-8">
        {columns.map((column) => {
          const tone = STAGE_TONE[column.stage];
          const selected = column.stage === activeStage;
          return (
            <View
              key={column.stage}
              className={`rounded-[8px] border bg-canvas p-1 ${selected ? 'border-primary' : 'border-border'}`}
              style={{ width: columnWidth }}
            >
              <View className="mb-1 flex-row items-center justify-between px-1 py-1.5">
                <Text
                  className={`font-inter-semibold text-[14px] ${selected ? 'text-primary' : 'text-foreground'}`}
                  numberOfLines={1}
                >
                  {qualificationStageLabels[column.stage]}
                </Text>
                <View className={`min-w-[24px] rounded-[6px] px-1.5 py-0.5 ${selected ? 'bg-primary' : 'bg-muted'}`}>
                  <Text className={`text-center font-inter-semibold text-[10px] ${selected ? 'text-primary-foreground' : 'text-foreground'}`}>
                    {column.total}
                  </Text>
                </View>
                <Ionicons name="ellipsis-vertical" size={14} color={selected ? colors.primary : colors.mutedForeground} />
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {column.items.length === 0 ? (
                  <Text className="px-2 py-4 text-center font-inter text-[12px] text-muted-foreground">Kart yok</Text>
                ) : (
                  column.items.map((item) => (
                    <BoardCard key={item.id} item={item} ownerName={ownerName(item.ownerUserId)} onPress={() => onOpen(item.id)} />
                  ))
                )}
                {column.total > column.items.length ? (
                  <Text className="px-2 pb-4 text-center font-inter text-[11px] text-muted-foreground">
                    +{column.total - column.items.length} daha
                  </Text>
                ) : null}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>
  );
}

/* ------------------------------------------------------------------ ekran ---- */

export default function OpportunitiesScreen() {
  const router = useRouter();
  const canCreate = useCan('opportunities.create');
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<'list' | 'board'>('board');
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [stage, setStage] = useState<QualificationStage | null>(null);
  const [activeStage, setActiveStage] = useState<QualificationStage>('a');
  const serverSearch = useDebouncedValue(search.trim());

  const query = useMemo<OpportunityListQuery>(() => ({ search: serverSearch || undefined, view: 'active' }), [serverSearch]);
  const listQuery = useMemo<OpportunityListQuery>(() => ({ ...query, qualificationStage: stage ?? undefined }), [query, stage]);

  const list = useOpportunityList(listQuery);
  // StatStrip VE pano aynı 7 kolonu kullanıyor; tek çağrı, react-query anahtar
  // eşleşmesiyle iki görünüm arasında paylaşılıyor.
  const board = useOpportunityBoard(query, QUALIFICATION_STAGES);
  const assignees = useOpportunityAssignees();
  const items = list.data?.items ?? [];

  const ownerName = (id: string | null) => (id ? assignees.data?.find((a) => a.id === id)?.name ?? null : null);

  const open = (id: string) => router.push(`/(tabs)/modules/opportunities/${id}`);

  const byStage = (s: QualificationStage) => board.columns.find((c) => c.stage === s)?.total ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <OpportunitiesHeader
        searchActive={searchVisible}
        filterActive={filtersVisible || stage !== null}
        onSearch={() => setSearchVisible((current) => !current)}
        onFilter={() => setFiltersVisible((current) => !current)}
      />

      {/*
       * Şartname metni "Toplam / Lead / Teklif / Görüşme / Kazanıldı / Kaybedildi"
       * diyor; sunucudaki gerçek kategorizasyon 7 satış derecesi (Lead/C/B/A/A+/
       * WIN/LOST) — bu ekranın filtre pilleri ve panosu zaten bunu kullanıyor.
       * "Teklif"/"Görüşme" bu 7 dereceden hangisine karşılık geldiği sunucuda
       * belirsiz (tahmin olurdu); bu yüzden gerçek 7 dereceyle gösteriliyor.
       */}
      <StageSelector activeStage={activeStage} totals={byStage} onSelect={setActiveStage} />

      {searchVisible || filtersVisible ? (
        <View className="gap-2 pb-2">
          {searchVisible ? <SearchBar value={search} onChange={setSearch} placeholder="Fırsat ara..." /> : null}
          {filtersVisible ? (
            <View className="gap-2">
              <View className="flex-row px-4">
                {(['board', 'list'] as const).map((item) => (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mode === item }}
                    onPress={() => setMode(item)}
                    className={`min-h-[40px] flex-1 items-center justify-center border ${
                      item === 'board' ? 'rounded-l-[8px]' : 'rounded-r-[8px]'
                    } ${mode === item ? 'border-primary bg-primary' : 'border-border bg-card'}`}
                  >
                    <Text className={`font-inter-medium text-[13px] ${mode === item ? 'text-primary-foreground' : 'text-foreground'}`}>
                      {item === 'board' ? 'Kanban' : 'Liste'}
                    </Text>
                  </Pressable>
                ))}
              </View>
          <FilterChips
            options={QUALIFICATION_STAGES.map((value) => ({ value, label: qualificationStageLabels[value] }))}
            value={stage}
            onChange={setStage}
          />
            </View>
          ) : null}
        </View>
      ) : null}

      {mode === 'board' ? (
        <BoardView
          board={board}
          ownerName={ownerName}
          onOpen={open}
          activeStage={activeStage}
          columnWidth={Math.max(112, (width - 48) / 3)}
        />
      ) : list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          // v2'de bu özellik varsayılan AÇIK ve sayfalama/yeniden ölçüm sonrası
          // içeriği çapalayıp listenin başında boşluk bırakıyor. Bunlar sohbet
          // değil, tepeden akan listeler — kapalı olmalı.
          maintainVisibleContentPosition={{ disabled: true }}
          data={items}
          keyExtractor={(item) => item.id}
          // FlashList v2 kendi başına esnemiyor; sınırlanmamış sütun içinde
          // içerik aşağı kayıyor ve pillerin altında boşluk kalıyordu.
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <OpportunityRow item={item} ownerName={ownerName(item.ownerUserId)} onPress={() => open(item.id)} />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Fırsat bulunamadı" hint="Aramayı veya filtreyi değiştirin." />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}

      {canCreate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Yeni fırsat"
          onPress={() => router.push('/modal/new-opportunity' as Href)}
          className="absolute bottom-5 right-5 h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
          style={{ boxShadow: '0 7px 18px rgba(214, 24, 31, 0.28)' }}
        >
          <Ionicons name="add" size={34} color={colors.primaryForeground} />
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}
