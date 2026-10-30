import { useNavigationContext } from '@/src/modules/useNavigationContext';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useServiceTickets, useServiceTicketSummary } from '@/src/api/operations.hooks';
import { exportService } from '@/src/api/exports';
import { useCan } from '@/src/auth/AuthProvider';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import {
  Button,
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
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
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
  const [navigationFocus, setNavigationFocus] = useState<string | undefined>();
  useNavigationContext('service-requests', ({ query, focus }) => { setSearch(query ?? ''); setView('list'); setPreset(focus === 'scheduled' ? null : focus ? 'open' : null); setSeverity(null); setTicketType(null); setSource(null); setWarranty(null); setNavigationFocus(focus); });
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
    const filtered = filterTickets(loaded, { ticketType, source, warranty }).filter((ticket) => {
      if (navigationFocus === 'late' || navigationFocus === 'sla') return !ticket.resolvedAt && Date.now() - new Date(ticket.reportedAt).getTime() > 7 * 86_400_000;
      if (navigationFocus === 'scheduled') return ticket.status?.code === 'scheduled';
      return true;
    });
    return isHistory ? filtered.filter((ticket) => historyMatches(ticket, debounced)) : filtered;
  }, [debounced, isHistory, loaded, source, ticketType, warranty, navigationFocus]);
  const kpis = useMemo(() => ticketKpis(loaded, Date.now()), [loaded]);
  const filterCount = [severity, ticketType, source, warranty].filter(Boolean).length;

  const open = (id: string) => router.push(`/modules/service-tickets/${id}`);
  const clearFilters = () => { setSearch(''); setPreset(null); setSeverity(null); setTicketType(null); setSource(null); setWarranty(null); setNavigationFocus(undefined); };

  const runExport = async () => {
    if (exporting) return;
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
          { icon: 'grid-outline', label: 'Servis Kanban', onPress: () => router.push('/modules/service-kanban' as Href) },
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
          onChange={(next) => (next === 'complaints' ? router.push('/modules/service-complaints' as Href) : setView(next))}
        />
        <StatStrip
          items={[
            { label: 'Açık', value: String(summary.data?.open ?? kpis.open) },
            { label: 'Kritik/Yüksek', value: String(summary.data?.urgent ?? kpis.urgent), tone: 'destructive' },
            { label: 'SLA Aşımı', value: String(kpis.slaOverdue), tone: kpis.slaOverdue ? 'warning' : undefined },
            { label: 'Atanmış', value: String(kpis.assigned) },
          ]}
        />
        {navigationFocus && <Text accessibilityRole="button" onPress={() => { setNavigationFocus(undefined); setPreset(null); }} className="py-2 text-sm text-primary">{navigationFocus === 'late' || navigationFocus === 'sla' ? 'Geciken servisler' : navigationFocus === 'scheduled' ? 'Planlanan servisler' : 'Açık servisler'} · Odağı temizle</Text>}
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder={isHistory ? 'Firma, makine, form no veya not ara' : 'Servis talebi ara...'}
          onFilterPress={() => setFiltersOpen((current) => !current)}
          filterActive={filterCount > 0}
        />
        {isHistory ? null : <FilterChips options={PRESETS} value={preset} onChange={setPreset} />}
        {filtersOpen ? (
          <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: 12, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
              <OptionPicker label="Öncelik" value={severity} options={SEVERITY_OPTIONS} placeholder="Tüm öncelikler" clearable onChange={(next) => setSeverity(next as Severity | null)} />
              <OptionPicker label="Kayıt tipi" value={ticketType} options={TYPE_OPTIONS} placeholder="Tüm kayıt tipleri" clearable onChange={(next) => setTicketType(next)} />
              <OptionPicker label="Kaynak" value={source} options={SOURCE_OPTIONS} placeholder="Tüm kaynaklar" clearable onChange={(next) => setSource(next)} />
              <OptionPicker label="Garanti durumu" value={warranty} options={WARRANTY_OPTIONS} placeholder="Tüm garanti durumları" clearable onChange={(next) => setWarranty(next)} />
            <View className="flex-row gap-2">
              <Button className="flex-1" label="Temizle" variant="ghost" onPress={clearFilters} />
              <Button className="flex-1" label="Sonuçları göster" onPress={() => setFiltersOpen(false)} />
            </View>
          </ScrollView>
        ) : null}
        <View className="flex-row items-center justify-between gap-2 px-4">
          <Text className="flex-1 font-inter text-xs text-muted-foreground">{rows.length} kayıt yüklendi{filterCount ? ` · ${filterCount} filtre` : ''}</Text>
          {search || preset || filterCount ? <Button label="Temizle" variant="ghost" onPress={clearFilters} /> : null}
        </View>
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
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: GLASS_TAB_BAR_HEIGHT + 88 }}
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
              hint={search.trim() || preset || filterCount ? 'Arama veya filtre ölçütlerini değiştirin.' : 'Servis talepleri ve durumları burada listelenir.'}
              actionLabel={search.trim() || preset || filterCount ? 'Filtreleri temizle' : canCreate && !isHistory ? 'Yeni servis talebi' : undefined}
              onAction={search.trim() || preset || filterCount ? clearFilters : canCreate && !isHistory ? () => router.push('/modal/new-ticket' as Href) : undefined}
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
