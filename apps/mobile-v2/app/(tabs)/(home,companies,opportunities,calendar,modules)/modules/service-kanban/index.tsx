import { Tabs } from '@/src/ui/data';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { ServiceTicket } from '@/src/api/endpoints';
import { useServiceTickets } from '@/src/api/operations.hooks';
import { useSetTicketStage } from '@/src/api/service.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useTheme } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Fab, FilterChips, ListSkeleton, ScreenHeader, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { AttachmentsPanel } from '@/src/ui/service/AttachmentsPanel';
import { TicketCard, useTicketLookups } from '@/src/ui/service/TicketCard';
import {
  KANBAN_COLUMNS,
  SOURCE_LABELS,
  STAGE_LABELS,
  TICKET_TYPE_LABELS,
  WARRANTY_STATUS_LABELS,
  columnOf,
  columnStats,
  filterTickets,
  moveTarget,
  serviceStageOf,
  type KanbanColumnKey,
} from '@/src/ui/service/serviceStage';

const toOptions = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const COLUMN_WIDTH = 288;

export default function ServiceKanbanScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 768;
  const boardRef = useRef<ScrollView>(null);
  const [activeColumn, setActiveColumn] = useState<KanbanColumnKey>(KANBAN_COLUMNS[0]!.key);
  const sheetRef = useRef<BottomSheetModal>(null);
  const canCreate = useCan('service_tickets.create');
  const canUpdate = useCan('service_tickets.update');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 350);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ticketType, setTicketType] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [warranty, setWarranty] = useState<string | null>(null);
  const [selected, setSelected] = useState<ServiceTicket | null>(null);
  const lookups = useTicketLookups();
  const setStage = useSetTicketStage();

  const list = useServiceTickets({ search: debounced || undefined, sortDir: 'desc' });
  const tickets = useMemo(
    () => filterTickets(list.data?.items ?? [], { ticketType, source, warranty }),
    [list.data, ticketType, source, warranty],
  );
  const columns = useMemo(() => {
    const now = Date.now();
    return KANBAN_COLUMNS.map((column) => {
      const items = tickets.filter((ticket) => columnOf(serviceStageOf(ticket)) === column.key);
      return { ...column, items, stats: columnStats(items, now) };
    });
  }, [tickets]);
  const filterCount = [ticketType, source, warranty].filter(Boolean).length;

  useEffect(() => {
    if (isCompact) boardRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeColumn, isCompact, debounced, ticketType, source, warranty]);

  const clearFilters = () => { setSearch(''); setTicketType(null); setSource(null); setWarranty(null); };

  const openSheet = (ticket: ServiceTicket) => {
    setSelected(ticket);
    sheetRef.current?.present();
  };

  const move = (columnKey: KanbanColumnKey) => {
    if (!selected || setStage.isPending) return;
    const target = moveTarget(columnKey, serviceStageOf(selected));
    sheetRef.current?.dismiss();
    if (!target) return;
    setStage.mutate(
      { id: selected.id, ...target },
      {
        onSuccess: () => toast.success(`${selected.ticketNo} → ${STAGE_LABELS[target.serviceStage]}`),
        onError: (error) => toast.error(`Aşama güncellenemedi: ${error.message}`),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Servis Kanbanı"
        subtitle="Aşamayı seçin; kartın işlemlerinden süreci ilerletin."
        actions={[{ icon: 'list-outline', label: 'Liste görünümü', onPress: () => router.push('/modules/service-tickets' as Href) }]}
      />
      <View className="gap-1.5 pb-2">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Servis talebi ara..."
          onFilterPress={() => setFiltersOpen((current) => !current)}
          filterActive={filterCount > 0}
        />
        {filtersOpen ? (
          <>
            <FilterChips options={toOptions(TICKET_TYPE_LABELS)} value={ticketType} onChange={setTicketType} allLabel="Tüm kayıt tipleri" />
            <FilterChips options={toOptions(SOURCE_LABELS)} value={source} onChange={setSource} allLabel="Tüm kaynaklar" />
            <FilterChips options={toOptions(WARRANTY_STATUS_LABELS)} value={warranty} onChange={setWarranty} allLabel="Tüm garanti durumları" />
            <View className="flex-row gap-2 px-4">
              <Button className="flex-1" label="Temizle" variant="ghost" onPress={clearFilters} />
              <Button className="flex-1" label="Sonuçları göster" onPress={() => setFiltersOpen(false)} />
            </View>
          </>
        ) : null}
      </View>

      {isCompact ? (
        <View className="pb-2">
          <Tabs
            tabs={columns.map((column) => ({ value: column.key, label: `${column.key} (${column.items.length})` }))}
            value={activeColumn}
            onChange={setActiveColumn}
          />
        </View>
      ) : null}
      <Text className="px-4 pb-2 font-inter text-xs text-muted-foreground">
        {tickets.length} kart yüklendi{list.data ? ` · ${list.data.total} kayıt` : ''}
        {filterCount ? ` · ${filterCount} filtre` : ''}
      </Text>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <ScrollView
          ref={boardRef}
          horizontal={!isCompact}
          showsHorizontalScrollIndicator={false}
          snapToInterval={isCompact ? undefined : COLUMN_WIDTH + 12}
          decelerationRate="fast"
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: isCompact ? GLASS_TAB_BAR_HEIGHT + 88 : 0 }}
          refreshControl={isCompact ? <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.primary} /> : undefined}
        >
          {columns.filter((column) => !isCompact || column.key === activeColumn).map((column) => (
            <View key={column.key} style={isCompact ? undefined : { width: COLUMN_WIDTH }} className={isCompact ? undefined : 'flex-1'}>
              <View className="mb-3 gap-1 rounded-control border border-border bg-card p-3">
                <View className="flex-row items-start justify-between gap-3">
                  <Text accessibilityRole="header" className="flex-1 font-display-semibold text-[16px] text-foreground">
                    {column.key}
                  </Text>
                  <Text className="font-inter-semibold text-[15px] text-foreground">{column.items.length}</Text>
                </View>
                <Text className="font-inter text-xs text-muted-foreground">
                  Ortalama {column.stats.avgAgeDays} gün · SLA aşımı {column.stats.slaOverdue}
                </Text>
              </View>
              <ScrollView
                scrollEnabled={!isCompact}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: isCompact ? 0 : GLASS_TAB_BAR_HEIGHT + 88 }}
                refreshControl={!isCompact ? <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.primary} /> : undefined}
              >
                {column.items.length === 0 ? (
                  <EmptyState title="Bu aşamada kart yok" hint={search || filterCount ? 'Arama veya filtreleri değiştirin ya da başka bir aşama seçin.' : 'Diğer aşamalardaki servis taleplerini görüntüleyebilirsiniz.'} />
                ) : (
                  column.items.map((item) => (
                    <View key={item.id} className="gap-1">
                      <TicketCard
                        compact={!isCompact}
                        item={item}
                        location={lookups.location(item.companyId)}
                        assignee={lookups.person(item.assignedToUserId)}
                        onPress={() => router.push(`/modules/service-tickets/${item.id}`)}
                        onLongPress={() => openSheet(item)}
                      />
                      <Button label={canUpdate ? 'Aşama ve ekler' : 'Ekleri görüntüle'} variant="ghost" trailingIcon="ellipsis-horizontal" onPress={() => openSheet(item)} />
                    </View>
                  ))
                )}
                {list.hasNextPage ? (
                  <Button label="Daha fazla kart yükle" variant="ghost" loading={list.isFetchingNextPage} disabled={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} />
                ) : null}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}

      {canCreate ? <Fab label="Yeni Talep" extended onPress={() => router.push('/modal/new-ticket' as Href)} /> : null}

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={['70%']}
        onDismiss={() => setSelected(null)}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetScrollView contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 }}>
          {selected ? (
            <>
              <Text className="font-display-semibold text-base text-foreground">{selected.ticketNo}</Text>
              <Text className="font-inter text-sm text-muted-foreground">{STAGE_LABELS[serviceStageOf(selected)]}</Text>
              {canUpdate ? (
                <>
                  <Text className="mt-2 font-display-semibold text-[15px] text-foreground">Aşamaya taşı</Text>
                  {KANBAN_COLUMNS.map((column) => {
                    const current = columnOf(serviceStageOf(selected)) === column.key;
                    return (
                      <Button
                        key={column.key}
                        label={current ? `• ${column.key}` : column.key}
                        variant={current ? 'primary' : 'ghost'}
                        disabled={setStage.isPending || !moveTarget(column.key, serviceStageOf(selected))}
                        onPress={() => move(column.key)}
                      />
                    );
                  })}
                </>
              ) : null}
              <Text className="mt-3 font-display-semibold text-[15px] text-foreground">Kart ekleri</Text>
              <AttachmentsPanel entityType="service_ticket" entityId={selected.id} canUpload={canUpdate} />
              <Button
                label="Detayı aç"
                variant="ghost"
                trailingIcon="arrow-forward"
                onPress={() => {
                  sheetRef.current?.dismiss();
                  router.push(`/modules/service-tickets/${selected.id}`);
                }}
              />
            </>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  );
}
