import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  TICKET_PHASES,
  TICKET_PHASE_META,
  ticketPhase,
  useServiceTickets,
  useServiceTicketSummary,
  type TicketPhase,
} from '@/src/api/operations.hooks';
import type { ServiceTicket } from '@/src/api/endpoints';
import { chipClass, chipTextClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { EmptyState, ErrorState, FilterChips, ListSkeleton, Loading, SCREEN_PAD, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useCan } from '@/src/auth/AuthProvider';
import { Logo } from '@/src/ui/Logo';

const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  critical: { label: 'Kritik', tone: 'destructive' },
  high: { label: 'Acil', tone: 'destructive' },
  normal: { label: 'Orta', tone: 'warning' },
  low: { label: 'Düşük', tone: 'info' },
};

/** Filtre pilleri "Devam Eden" tek pilde toplar; Kanban aynı verinin 4 gerçek aşamasını ayrı gösterir. */
type Preset = 'open' | 'ongoing' | 'done';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'open', label: 'Açık' },
  { value: 'ongoing', label: 'Devam Eden' },
  { value: 'done', label: 'Tamamlanan' },
];

type SeverityFilter = 'low' | 'normal' | 'high' | 'critical';

const SEVERITY_FILTERS: { value: SeverityFilter; label: string }[] = [
  { value: 'critical', label: 'Kritik' },
  { value: 'high', label: 'Acil' },
  { value: 'normal', label: 'Orta' },
  { value: 'low', label: 'Düşük' },
];

function ServiceHeader({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  const { colors } = useTheme();
  return (
    <View className="px-4 pb-3 pt-1">
      <View className="h-12 flex-row items-center justify-between">
        <Logo width={148} />
        <View className="flex-row items-center gap-1">
          <Ionicons name="search-outline" size={27} color={colors.foreground} />
          {canCreate ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Yeni servis talebi"
              onPress={onCreate}
              className="ml-2 h-11 w-11 items-center justify-center rounded-full bg-primary active:opacity-80"
              style={{ boxShadow: '0 5px 12px rgba(214, 24, 31, 0.24)' }}
            >
              <Ionicons name="add" size={27} color={colors.primaryForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text accessibilityRole="header" className="mt-3 font-inter-bold text-[30px] leading-[36px] text-foreground" style={{ letterSpacing: 0 }}>
        Servis Talepleri
      </Text>
      <Text className="mt-1 font-inter text-[15px] leading-5 text-muted-foreground">
        Servis taleplerinizi görüntüleyin ve yönetin.
      </Text>
    </View>
  );
}

function TicketRow({ item, onPress }: { item: ServiceTicket; onPress: () => void }) {
  const { colors } = useTheme();
  const severity = SEVERITY[item.severity] ?? { label: item.severity, tone: 'neutral' as Tone };
  const phase = ticketPhase(item);
  const phaseMeta = TICKET_PHASE_META[phase];
  const date = new Date(item.reportedAt);
  const dateLabel = Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeLabel = Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const phaseLabel = phase === 'in_progress' ? 'Devam Ediyor' : phase === 'waiting_customer' ? 'Bekliyor' : phaseMeta.label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.ticketNo}, ${item.company?.shortName ?? item.company?.legalTitle ?? 'Firma bağlanmadı'}`}
      onPress={onPress}
      className="my-1.5 flex-row gap-3.5 rounded-[16px] border border-border bg-card p-4 active:opacity-70"
      style={{ boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)', borderCurve: 'continuous' }}
    >
      <View className={`h-14 w-14 items-center justify-center rounded-[12px] ${chipClass[severity.tone].split(' ')[0]}`}>
        <Ionicons name="construct-outline" size={26} color={toneColor(colors, severity.tone)} />
      </View>
      
      <View className="min-w-0 flex-1">
        {/* Top Row: Title, SLA, Status */}
        <View className="flex-row items-center justify-between mb-1">
          <Text className="font-inter-bold text-[16px] text-foreground shrink mr-2" numberOfLines={1}>{item.ticketNo}</Text>
          <View className="flex-row items-center gap-4 shrink-0">
             <View className={`rounded-[6px] px-2 py-1 flex-row items-center gap-1.5 ${chipClass[severity.tone].split(' ')[0]}`}>
               <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: toneColor(colors, severity.tone) }} />
               <Text className={`font-inter-medium text-[11px] ${chipTextClass[severity.tone]}`}>{severity.label}</Text>
            </View>
            <Text className={`font-inter-medium text-[12px] ${chipTextClass[phaseMeta.tone]}`}>{phaseLabel}</Text>
          </View>
        </View>

        {/* Company Name */}
        <Text className="font-inter-medium text-[14px] text-foreground mb-2" numberOfLines={1}>
          {item.company?.shortName ?? item.company?.legalTitle ?? 'Firma bağlanmadı'}
        </Text>

        {/* Bottom Row: Icons and Meta */}
        <View className="flex-row items-end justify-between">
          <View className="flex-1 gap-1">
            <View className="flex-row items-center gap-2">
              <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
              <Text className="flex-1 font-inter text-[12px] text-muted-foreground" numberOfLines={1}>İstanbul, Türkiye</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Ionicons name="briefcase-outline" size={14} color={colors.mutedForeground} />
              <Text className="flex-1 font-inter text-[12px] text-muted-foreground" numberOfLines={1}>{item.subject}</Text>
            </View>
          </View>
          <View className="items-end gap-1 shrink-0 ml-3">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="calendar-outline" size={13} color={colors.mutedForeground} />
              <Text className="font-inter text-[11px] text-muted-foreground">{dateLabel}</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
              <Text className="font-inter text-[11px] text-muted-foreground">{timeLabel}</Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ kanban ---- */

function TicketBoardCard({ item, onPress }: { item: ServiceTicket; onPress: () => void }) {
  const severity = SEVERITY[item.severity] ?? { label: item.severity, tone: 'neutral' as Tone };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.ticketNo}
      onPress={onPress}
      className="mb-2 gap-1.5 rounded-overlay border border-border bg-card p-3 active:opacity-70"
    >
      <Text className="text-[13px] font-inter-semibold text-foreground" numberOfLines={1}>
        {item.ticketNo}
      </Text>
      <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
        {item.company?.shortName ?? item.company?.legalTitle ?? 'Firma bağlanmadı'}
      </Text>
      <Text className="font-inter text-[12px] text-foreground" numberOfLines={2}>
        {item.subject}
      </Text>
      <View className="flex-row items-center gap-1.5 pt-0.5">
        <View className={`h-1.5 w-1.5 rounded-full ${chipClass[severity.tone].split(' ')[0]}`} />
        <Text className={`font-inter text-[11px] ${chipTextClass[severity.tone]}`}>{severity.label}</Text>
      </View>
    </Pressable>
  );
}

function TicketBoard({
  tickets,
  counts,
  onOpen,
}: {
  tickets: ServiceTicket[];
  counts?: Partial<Record<TicketPhase, number>>;
  onOpen: (id: string) => void;
}) {
  const { colors } = useTheme();
  const columns = useMemo(
    () => TICKET_PHASES.map((phase) => ({ phase, items: tickets.filter((t) => ticketPhase(t) === phase) })),
    [tickets]
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4 pb-8">
      {columns.map((column) => {
        const meta = TICKET_PHASE_META[column.phase];
        return (
          <View key={column.phase} className="w-[260px]">
            <View className="mb-2 flex-row items-center justify-between rounded-control border border-border bg-card px-3 py-2">
              <View className="flex-row items-center gap-2">
                <View className="h-2 w-2 rounded-full" style={{ backgroundColor: toneColor(colors, meta.tone) }} />
                <Text className="font-inter-semibold text-[13px] text-foreground">{meta.label}</Text>
              </View>
              <Text className="font-inter-semibold text-[12px] text-muted-foreground">
                {counts?.[column.phase] ?? column.items.length}
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {column.items.length === 0 ? (
                <Text className="px-2 py-4 text-center font-inter text-[12px] text-muted-foreground">Kart yok</Text>
              ) : (
                column.items.map((item) => (
                  <TicketBoardCard key={item.id} item={item} onPress={() => onOpen(item.id)} />
                ))
              )}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ ekran ---- */

export default function ServiceTicketsScreen() {
  const router = useRouter();
  const canCreate = useCan('service_tickets.create');
  const { colors } = useTheme();
  const [mode, setMode] = useState<'list' | 'board'>('list');
  const [search, setSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [preset, setPreset] = useState<Preset | null>(null);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [severity, setSeverity] = useState<SeverityFilter | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setServerSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const listQuery = useMemo(() => ({
    search: serverSearch || undefined,
    phase: mode === 'list' ? preset ?? undefined : undefined,
    severity: severity ?? undefined,
    sortDir: sort === 'newest' ? 'desc' : 'asc',
  } as const), [mode, preset, serverSearch, severity, sort]);
  const list = useServiceTickets(listQuery);
  const summary = useServiceTicketSummary({ search: listQuery.search, phase: listQuery.phase });
  const all = useMemo(() => list.data?.items ?? [], [list.data]);

  const open = (id: string) => router.push(`/(tabs)/modules/service-tickets/${id}`);
  const create = () => router.push('/modal/new-ticket' as Href);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ServiceHeader canCreate={canCreate} onCreate={create} />

      <View className="gap-1.5 pb-2">
        <FilterChips options={PRESETS} value={preset} onChange={setPreset} />
        {mode === 'list' ? (
          <>
            <View className="flex-row items-center justify-between px-4 py-1">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: filtersVisible }}
                onPress={() => setFiltersVisible((current) => !current)}
                className="min-h-[42px] flex-row items-center gap-2 rounded-[8px] border border-border bg-card px-3 active:opacity-70"
              >
                <Ionicons name="funnel-outline" size={15} color={colors.mutedForeground} />
                <Text className="font-inter-medium text-[12px] text-foreground">SLA: {severity ? SEVERITY[severity]?.label : 'Tümü'}</Text>
                <Ionicons name="chevron-down" size={13} color={colors.mutedForeground} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sıralamayı değiştir"
                onPress={() => setSort(sort === 'newest' ? 'oldest' : 'newest')}
                className="min-h-[42px] flex-row items-center gap-2 rounded-[8px] border border-border bg-card px-3 active:opacity-70"
              >
                <Ionicons name="swap-vertical" size={15} color={colors.mutedForeground} />
                <Text className="font-inter-medium text-[12px] text-foreground">
                  {sort === 'newest' ? 'Oluşturulma (Yeni)' : 'Oluşturulma (Eski)'}
                </Text>
                <Ionicons name="chevron-down" size={13} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Servis talebi ara..."
              onFilterPress={() => setFiltersVisible((current) => !current)}
              filterActive={severity !== null}
            />
            {filtersVisible ? (
              <View className="gap-2">
                <FilterChips options={SEVERITY_FILTERS} value={severity} onChange={setSeverity} />
                <View className="flex-row px-4">
                  {(['list', 'board'] as const).map((item) => (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      accessibilityState={{ selected: mode === item }}
                      onPress={() => setMode(item)}
                      className={`min-h-[40px] flex-1 items-center justify-center border ${item === 'list' ? 'rounded-l-[8px]' : 'rounded-r-[8px]'} ${
                        mode === item ? 'border-primary bg-primary' : 'border-border bg-card'
                      }`}
                    >
                      <Text className={`font-inter-medium text-[13px] ${mode === item ? 'text-primary-foreground' : 'text-foreground'}`}>
                        {item === 'list' ? 'Liste' : 'Kanban'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <SearchBar value={search} onChange={setSearch} placeholder="Servis talebi ara..." />
        )}
      </View>

      {mode === 'board' ? (
        <TicketBoard
          tickets={all}
          counts={summary.data ? {
            open: summary.data.openPhase,
            in_progress: summary.data.inProgressPhase,
            waiting_customer: summary.data.waitingCustomerPhase,
            done: summary.data.donePhase,
          } : undefined}
          onOpen={open}
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
          // FlashList v2 kendi başına esnemiyor; sınırlanmamış sütun içinde
          // içerik aşağı kayıyor ve filtrelerin altında boşluk kalıyor.
          style={{ flex: 1 }}
          data={all}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 32 }}
          renderItem={({ item }) => {
            return (
              <TicketRow item={item} onPress={() => open(item.id)} />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void Promise.all([list.refetch(), summary.refetch()])}
          ListEmptyComponent={
            <EmptyState
              title="Servis talebi bulunamadı"
              hint={search.trim() || preset ? 'Arama veya filtre ölçütlerini değiştirin.' : undefined}
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}

      {mode === 'board' ? (
        <View className="items-center gap-2 pb-3">
          {list.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: list.isFetchingNextPage }}
              disabled={list.isFetchingNextPage}
              onPress={() => void list.fetchNextPage()}
              className="min-h-11 justify-center rounded-control border border-border bg-card px-4 active:opacity-70"
            >
              <Text className="font-inter-semibold text-sm text-primary">
                {list.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla kart yükle'}
              </Text>
            </Pressable>
          ) : null}
          <View className="flex-row items-center justify-center gap-1.5">
            <Ionicons name="swap-horizontal-outline" size={13} color={colors.mutedForeground} />
            <Text className="font-inter text-[11px] text-muted-foreground">Kolonlar arasında yatay kaydırın</Text>
          </View>
        </View>
      ) : null}
      {canCreate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Yeni servis talebi"
          onPress={create}
          className="absolute bottom-5 right-5 h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
          style={{ boxShadow: '0 7px 18px rgba(214, 24, 31, 0.28)' }}
        >
          <Ionicons name="add" size={34} color={colors.primaryForeground} />
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}
