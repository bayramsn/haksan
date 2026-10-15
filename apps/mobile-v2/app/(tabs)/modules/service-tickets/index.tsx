import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useServiceTickets, useServiceTicketSummary } from '@/src/api/operations.hooks';
import { exportService } from '@/src/api/exports';
import { useCan } from '@/src/auth/AuthProvider';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import {
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
import { Tabs } from '@/src/ui/data';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { toast } from '@/src/ui/toast';
import { TicketCard, useTicketLookups } from '@/src/ui/service/TicketCard';
import {
  SEVERITY_LABELS,
  SOURCE_LABELS,
  TICKET_TYPE_LABELS,
  WARRANTY_STATUS_LABELS,
  filterTickets,
  historyMatches,
  ticketKpis,
} from '@/src/ui/service/serviceStage';

type View_ = 'list' | 'complaints' | 'history';
type Preset = 'open' | 'ongoing' | 'done';
type Severity = 'low' | 'normal' | 'high' | 'critical';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'open', label: 'Açık' },
  { value: 'ongoing', label: 'Devam Eden' },
  { value: 'done', label: 'Tamamlanan' },
];
const toOptions = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const SEVERITY_OPTIONS = (['critical', 'high', 'normal', 'low'] as Severity[]).map((value) => ({ value, label: SEVERITY_LABELS[value]! }));
const TYPE_OPTIONS = toOptions(TICKET_TYPE_LABELS);
const SOURCE_OPTIONS = toOptions(SOURCE_LABELS);
const WARRANTY_OPTIONS = toOptions(WARRANTY_STATUS_LABELS);

export default function ServiceTicketsScreen() {
  const router = useRouter();
  const canCreate = useCan('service_tickets.create');
  const [view, setView] = useState<View_>('list');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 350);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [ticketType, setTicketType] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [warranty, setWarranty] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const lookups = useTicketLookups();

  const isHistory = view === 'history';
  // Geçmiş araması form no/makine/not da kapsadığı için istemcide yapılır.
  const query = useMemo(
    () =>
      ({
        search: isHistory ? undefined : debounced || undefined,
        phase: isHistory ? 'done' : preset ?? undefined,
        severity: severity ?? undefined,
        sortDir: 'desc',
      }) as const,
    [debounced, isHistory, preset, severity],
  );
  const list = useServiceTickets(query);
  const summary = useServiceTicketSummary({ search: query.search, phase: query.phase });

  const loaded = useMemo(() => list.data?.items ?? [], [list.data]);
  const rows = useMemo(() => {
    const filtered = filterTickets(loaded, { ticketType, source, warranty });
    return isHistory ? filtered.filter((ticket) => historyMatches(ticket, debounced)) : filtered;
  }, [debounced, isHistory, loaded, source, ticketType, warranty]);
  const kpis = useMemo(() => ticketKpis(loaded, Date.now()), [loaded]);
  const filterCount = [severity, ticketType, source, warranty].filter(Boolean).length;

  const open = (id: string) => router.push(`/(tabs)/modules/service-tickets/${id}`);
  const runExport = async () => {
    setExporting(true);
    try {
      await exportService.serviceTickets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Excel dosyası indirilemedi.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Servis Talepleri"
        subtitle="Servis taleplerinizi görüntüleyin ve yönetin."
        actions={[
          { icon: 'grid-outline', label: 'Servis Kanban', onPress: () => router.push('/(tabs)/modules/service-kanban' as Href) },
          { icon: exporting ? 'hourglass-outline' : 'download-outline', label: "Excel'e aktar", onPress: () => void (exporting ? null : runExport()) },
        ]}
      />

      <View className="gap-2 pb-2">
        <Tabs<View_>
          tabs={[
            { value: 'list', label: 'Liste', icon: 'list-outline' },
            { value: 'complaints', label: 'Şikayet Kutusu', icon: 'mail-unread-outline' },
            { value: 'history', label: 'Servis Geçmişi', icon: 'time-outline' },
          ]}
          value={view}
          onChange={(next) => (next === 'complaints' ? router.push('/(tabs)/modules/service-complaints' as Href) : setView(next))}
        />
        <StatStrip
          items={[
            { label: 'Açık', value: String(summary.data?.open ?? kpis.open) },
            { label: 'Kritik/Yüksek', value: String(summary.data?.urgent ?? kpis.urgent), tone: 'destructive' },
            { label: 'SLA Aşımı', value: String(kpis.slaOverdue), tone: kpis.slaOverdue ? 'warning' : undefined },
            { label: 'Atanmış', value: String(kpis.assigned) },
          ]}
        />
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder={isHistory ? 'Firma, makine, form no veya not ara' : 'Servis talebi ara...'}
          onFilterPress={() => setFiltersOpen((current) => !current)}
          filterActive={filterCount > 0}
        />
        {isHistory ? null : <FilterChips options={PRESETS} value={preset} onChange={setPreset} />}
        {filtersOpen ? (
          <View className="gap-1.5">
            <FilterChips options={SEVERITY_OPTIONS} value={severity} onChange={setSeverity} allLabel="Tüm öncelikler" />
            <FilterChips options={TYPE_OPTIONS} value={ticketType} onChange={setTicketType} allLabel="Tüm kayıt tipleri" />
            <FilterChips options={SOURCE_OPTIONS} value={source} onChange={setSource} allLabel="Tüm kaynaklar" />
            <FilterChips options={WARRANTY_OPTIONS} value={warranty} onChange={setWarranty} allLabel="Tüm garanti durumları" />
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
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 96 }}
          renderItem={({ item }) => (
            <TicketCard
              item={item}
              location={lookups.location(item.companyId)}
              assignee={lookups.person(item.assignedToUserId)}
              onPress={() => open(item.id)}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void Promise.all([list.refetch(), summary.refetch()])}
          ListEmptyComponent={
            <EmptyState
              title={isHistory ? 'Servis geçmişi bulunamadı' : 'Servis talebi bulunamadı'}
              hint={search.trim() || preset || filterCount ? 'Arama veya filtre ölçütlerini değiştirin.' : undefined}
              icon={isHistory ? 'time-outline' : 'construct-outline'}
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}

      {canCreate ? <Fab label="Yeni Talep" extended onPress={() => router.push('/modal/new-ticket' as Href)} /> : null}
    </SafeAreaView>
  );
}
