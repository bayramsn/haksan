import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
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
import { ListSkeleton, Chip, EmptyState, ErrorState, FilterChips, Loading, ScreenHeader, SearchBar, StatStrip } from '@/src/ui';
import { ProgressBar } from '@/src/ui/data';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';

/** Derece -> renk. WIN yeşil, LOST kırmızı, ara dereceler soğuktan sıcağa. */
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
          {item.requestedMachine ?? item.title}
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
      className="mb-2 gap-1.5 rounded-overlay border border-border bg-card p-3 active:opacity-70"
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <Text className="text-[13px] font-inter-semibold text-foreground" numberOfLines={2}>
            {companyName(item)}
          </Text>
          {item.requestedMachine ? (
            <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={2}>
              {item.requestedMachine}
            </Text>
          ) : null}
        </View>
        {ownerName ? <Avatar name={ownerName} size={24} /> : null}
      </View>
      {amountOf(item) ? <Text className="font-inter-semibold text-[13px] text-foreground">{amountOf(item)}</Text> : null}
      {risk ? (
        <View className={`self-start rounded-full border px-1.5 py-0.5 ${chipClass[risk.tone]}`}>
          <Text className={`font-inter-medium text-[10px] ${chipTextClass[risk.tone]}`}>{risk.label}</Text>
        </View>
      ) : null}
      <View className="flex-row items-center gap-1.5 pt-0.5">
        <View className={`h-1.5 w-1.5 rounded-full ${chipClass[tone].split(' ')[0]}`} />
        <Text className={`font-inter text-[11px] ${chipTextClass[tone]}`}>%{item.probability}</Text>
      </View>
      {total > 0 ? <ProgressBar done={done} total={total} /> : null}
    </Pressable>
  );
}

function BoardView({ board, ownerName, onOpen }: { board: Board; ownerName: (id: string | null) => string | null; onOpen: (id: string) => void }) {
  const { colors } = useTheme();

  if (board.isPending) return <Loading />;
  if (board.error) return <ErrorState message={(board.error as Error).message} />;

  return (
    <>
      {/* Kolon başlıklarının üstünde yatay sayaç şeridi. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-4 pb-2">
        <Text className="font-inter text-[12px] text-muted-foreground">
          {board.columns.map((c) => `${qualificationStageLabels[c.stage]} ${c.total}`).join('  ·  ')}
        </Text>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4 pb-8">
        {board.columns.map((column) => {
          const tone = STAGE_TONE[column.stage];
          return (
            // Kolon genişliği sabit: telefonda bir kolon + sonrakinin kenarı görünsün.
            <View key={column.stage} className="w-[260px]">
              <View className="mb-2 flex-row items-center justify-between rounded-control border border-border bg-card px-3 py-2">
                <View className="flex-row items-center gap-2">
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: toneColor(colors, tone) }} />
                  <Text className="font-inter-semibold text-[13px] text-foreground">{qualificationStageLabels[column.stage]}</Text>
                </View>
                <Text className="font-inter-semibold text-[12px] text-muted-foreground">{column.total}</Text>
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
    </>
  );
}

/* ------------------------------------------------------------------ ekran ---- */

export default function OpportunitiesScreen() {
  const router = useRouter();
  const canCreate = useCan('opportunities.create');
  const { colors } = useTheme();
  const [mode, setMode] = useState<'list' | 'board'>('list');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<QualificationStage | null>(null);
  const serverSearch = useDebouncedValue(search.trim());

  const query = useMemo<OpportunityListQuery>(() => ({ search: serverSearch || undefined, view: 'active' }), [serverSearch]);
  const listQuery = useMemo<OpportunityListQuery>(() => ({ ...query, qualificationStage: stage ?? undefined }), [query, stage]);

  const list = useOpportunityList(listQuery);
  // StatStrip VE pano aynı 7 kolonu kullanıyor; tek çağrı, react-query anahtar
  // eşleşmesiyle iki görünüm arasında paylaşılıyor.
  const board = useOpportunityBoard(query, QUALIFICATION_STAGES);
  const assignees = useOpportunityAssignees();
  const items = list.data?.items ?? [];

  const ownerName = (id: string | null) => (id ? assignees.data?.find((a) => a.id === id)?.fullName ?? null : null);

  const open = (id: string) => router.push(`/(tabs)/modules/opportunities/${id}`);

  const boardTotal = board.columns.reduce((sum, c) => sum + c.total, 0);
  const byStage = (s: QualificationStage) => board.columns.find((c) => c.stage === s)?.total ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Fırsatlar"
        subtitle="Satış fırsatlarınızı görüntüleyin ve yönetin."
        actions={[
          {
            icon: mode === 'list' ? 'grid-outline' : 'list-outline',
            label: mode === 'list' ? 'Pano görünümü' : 'Liste görünümü',
            onPress: () => setMode(mode === 'list' ? 'board' : 'list'),
          },
          ...(canCreate
            ? [{ icon: 'add' as const, label: 'Yeni fırsat', onPress: () => router.push('/modal/new-opportunity' as Href) }]
            : []),
        ]}
      />

      {/*
       * Şartname metni "Toplam / Lead / Teklif / Görüşme / Kazanıldı / Kaybedildi"
       * diyor; sunucudaki gerçek kategorizasyon 7 satış derecesi (Lead/C/B/A/A+/
       * WIN/LOST) — bu ekranın filtre pilleri ve panosu zaten bunu kullanıyor.
       * "Teklif"/"Görüşme" bu 7 dereceden hangisine karşılık geldiği sunucuda
       * belirsiz (tahmin olurdu); bu yüzden gerçek 7 dereceyle gösteriliyor.
       */}
      {!board.isPending ? (
        <View className="pb-2">
          <StatStrip
            items={[
              { label: 'Toplam', value: String(boardTotal) },
              { label: 'Lead', value: String(byStage('lead')) },
              { label: 'C', value: String(byStage('c')), tone: 'info' },
              { label: 'B', value: String(byStage('b')), tone: 'stage' },
              { label: 'A/A+', value: String(byStage('a') + byStage('a_plus')), tone: 'warning' },
              { label: 'Kazanıldı', value: String(byStage('win')), tone: 'success' },
              { label: 'Kaybedildi', value: String(byStage('lost')), tone: 'destructive' },
            ]}
          />
        </View>
      ) : null}

      <View className="gap-2 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Fırsat ara..." />
        {mode === 'list' ? (
          <FilterChips
            options={QUALIFICATION_STAGES.map((value) => ({ value, label: qualificationStageLabels[value] }))}
            value={stage}
            onChange={setStage}
          />
        ) : null}
      </View>

      {mode === 'board' ? (
        <BoardView board={board} ownerName={ownerName} onOpen={open} />
      ) : list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
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

      {mode === 'board' ? (
        <View className="flex-row items-center justify-center gap-1.5 pb-2">
          <Ionicons name="swap-horizontal-outline" size={13} color={colors.mutedForeground} />
          <Text className="font-inter text-[11px] text-muted-foreground">Kolonlar arasında yatay kaydırın</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
