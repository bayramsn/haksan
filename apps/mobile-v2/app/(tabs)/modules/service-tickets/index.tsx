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
  ticketSla,
  useServiceTickets,
  useServiceTicketSummary,
  type TicketPhase,
} from '@/src/api/operations.hooks';
import type { ServiceTicket } from '@/src/api/endpoints';
import { formatDateTime } from '@/src/lib/format';
import { chipClass, chipTextClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import {
  EmptyState,
  ErrorState,
  FilterChips,
  ListRow,
  ListSkeleton,
  Loading,
  ScreenHeader,
  SearchBar,
  StatStrip,
} from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useCan } from '@/src/auth/AuthProvider';

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

  useEffect(() => {
    const timer = setTimeout(() => setServerSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const listQuery = useMemo(() => ({
    search: serverSearch || undefined,
    phase: mode === 'list' ? preset ?? undefined : undefined,
    sortDir: sort === 'newest' ? 'desc' : 'asc',
  } as const), [mode, preset, serverSearch, sort]);
  const list = useServiceTickets(listQuery);
  const summary = useServiceTicketSummary({ search: listQuery.search, phase: listQuery.phase });
  const all = useMemo(() => list.data?.items ?? [], [list.data]);

  const openCount = summary.data?.open ?? all.filter((t) => ticketPhase(t) !== 'done').length;
  const urgentCount = summary.data?.urgent ?? all.filter((t) => ['high', 'critical'].includes(t.severity)).length;

  const open = (id: string) => router.push(`/(tabs)/modules/service-tickets/${id}`);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Servis Talepleri"
        subtitle="Servis taleplerinizi görüntüleyin ve yönetin."
        actions={[
          {
            icon: mode === 'list' ? 'grid-outline' : 'list-outline',
            label: mode === 'list' ? 'Kanban görünümü' : 'Liste görünümü',
            onPress: () => setMode(mode === 'list' ? 'board' : 'list'),
          },
          ...(canCreate
            ? [{ icon: 'add' as const, label: 'Yeni servis talebi', onPress: () => router.push('/modal/new-ticket' as Href) }]
            : []),
        ]}
      />

      <View className="pb-2">
        <StatStrip
          items={[
            { label: 'Yüklenen', value: String(all.length) },
            { label: 'Açık', value: String(openCount), tone: 'warning' },
            { label: 'Acil', value: String(urgentCount), tone: 'destructive' },
            { label: 'Filtre Sonucu', value: String(summary.data?.total ?? list.data?.total ?? 0), tone: 'info' },
          ]}
        />
      </View>

      <View className="gap-1.5 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Talep no, konu veya firma" />
        {mode === 'list' ? (
          <>
            <FilterChips options={PRESETS} value={preset} onChange={setPreset} />
            {/* SLA verisi sunucuda yok (bkz. şartname raporu); ikinci satırda yalnız sıralama var. */}
            <View className="flex-row justify-end px-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sıralamayı değiştir"
                onPress={() => setSort(sort === 'newest' ? 'oldest' : 'newest')}
                className="flex-row items-center gap-1 py-1"
              >
                <Ionicons name={sort === 'newest' ? 'arrow-down' : 'arrow-up'} size={13} color={colors.mutedForeground} />
                <Text className="font-inter-medium text-[12px] text-muted-foreground">
                  {sort === 'newest' ? 'En Yeni' : 'En Eski'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
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
          data={all}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }) => {
            const severity = SEVERITY[item.severity] ?? { label: item.severity, tone: 'neutral' as Tone };
            const phase = ticketPhase(item);
            // Sunucuda SLA alanı yok; severity+reportedAt'ten istemcide hesaplanıyor
            // (bkz. operations.hooks.ts `ticketSla`, web'in SERVICE_SLA_DAYS'i). Kapanmış
            // biletlerde sağ alt boş kalır — severity zaten ikon rengiyle görünür.
            const sla = ticketSla(item);
            return (
              <ListRow
                title={item.ticketNo}
                lines={[
                  item.company?.shortName ?? item.company?.legalTitle ?? null,
                  item.subject,
                  formatDateTime(item.reportedAt),
                ]}
                icon="construct-outline"
                iconTone={phase === 'done' ? 'success' : severity.tone}
                chip={{ label: item.status?.name ?? TICKET_PHASE_META[phase].label, tone: TICKET_PHASE_META[phase].tone }}
                trailing={phase === 'done' ? undefined : (sla?.text ?? severity.label)}
                trailingTone={phase === 'done' ? undefined : sla?.overdue ? 'destructive' : severity.tone}
                onPress={() => open(item.id)}
              />
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
    </SafeAreaView>
  );
}
