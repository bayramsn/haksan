import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useServiceComplaints } from '@/src/api/operations.hooks';
import { exportService } from '@/src/api/exports';
import { useCan } from '@/src/auth/AuthProvider';
import { relativeTime } from '@/src/lib/format';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import type { Tone } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Fab, FilterChips, ListRow, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { toast } from '@/src/ui/toast';
import { COMPLAINT_SOURCE_LABELS, COMPLAINT_STATUS_LABELS, SEVERITY_LABELS } from '@/src/ui/service/serviceStage';

type Status = 'new' | 'reviewing' | 'converted' | 'rejected';

const STATUS_TONE: Record<string, Tone> = { new: 'destructive', reviewing: 'warning', converted: 'success', rejected: 'neutral' };
const toOptions = <T extends string>(keys: T[], labels: Record<string, string>) => keys.map((value) => ({ value, label: labels[value] ?? value }));
const STATUS_OPTIONS = toOptions<Status>(['new', 'reviewing', 'converted', 'rejected'], COMPLAINT_STATUS_LABELS);
const SOURCE_OPTIONS = toOptions(['qr', 'web', 'phone', 'whatsapp', 'email', 'manual'], COMPLAINT_SOURCE_LABELS);
const SEVERITY_OPTIONS = toOptions(['critical', 'high', 'normal', 'low'], SEVERITY_LABELS);

/** Web Şikayet Kutusu → "Gelen Şikayetler". */
export default function ServiceComplaintsScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const canCreate = useCan('service_tickets.create');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const serverSearch = useDebouncedValue(search.trim());

  const list = useServiceComplaints({ search: serverSearch || undefined, status: status ?? undefined, source: source ?? undefined });
  // API öncelik filtresi sunmadığı için yüklenen sayfalar üzerinde süzülür.
  const items = useMemo(
    () => (list.data?.items ?? []).filter((item) => !severity || item.severity === severity),
    [list.data, severity],
  );
  const filterCount = [source, severity].filter(Boolean).length;

  const clearFilters = () => { setSearch(''); setStatus(null); setSource(null); setSeverity(null); };

  const runExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportService.serviceComplaints();
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
        title="Şikayet Kutusu"
        subtitle={list.data ? `${list.data.total} şikayet` : 'Müşteriden gelen kayıtları inceleyip talebe dönüştürün.'}
        actions={[
          { icon: 'link-outline', label: 'Public Linkler', onPress: () => router.push('/modules/service-complaints/links' as Href) },
          { icon: exporting ? 'hourglass-outline' : 'download-outline', label: "Excel'e aktar", onPress: () => void (exporting ? null : runExport()) },
        ]}
      />

      <View className="gap-2 pb-2">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Şikayet no, konu veya firma"
          onFilterPress={() => setFiltersOpen((current) => !current)}
          filterActive={filterCount > 0}
        />
        <FilterChips options={STATUS_OPTIONS} value={status} onChange={setStatus} allLabel="Tüm durumlar" />
        {filtersOpen ? (
          <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, gap: 12, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
              <OptionPicker label="Kaynak" value={source} options={SOURCE_OPTIONS} placeholder="Tüm kaynaklar" clearable onChange={(next) => setSource(next)} />
              <OptionPicker label="Öncelik" value={severity} options={SEVERITY_OPTIONS} placeholder="Tüm öncelikler" clearable onChange={(next) => setSeverity(next)} />
            <View className="flex-row gap-2">
              <Button className="flex-1" label="Temizle" variant="ghost" onPress={clearFilters} />
              <Button className="flex-1" label="Sonuçları göster" onPress={() => setFiltersOpen(false)} />
            </View>
          </ScrollView>
        ) : null}
        <View className="flex-row items-center justify-between gap-2 px-4">
          <Text className="flex-1 font-inter text-xs text-muted-foreground">{items.length} kayıt yüklendi{filterCount ? ` · ${filterCount} filtre` : ''}</Text>
          {search || status || filterCount ? <Button label="Temizle" variant="ghost" onPress={clearFilters} /> : null}
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
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: GLASS_TAB_BAR_HEIGHT + 88 }}
          renderItem={({ item }) => {
            const tone = STATUS_TONE[item.status] ?? 'neutral';
            const machine = [item.machine?.brand, item.machine?.model, item.machine?.serialNumber].filter(Boolean).join(' · ') || 'Eşleşmemiş';
            const contact = [item.contactName, item.contactPhone].filter(Boolean).join(' · ');
            return (
              <ListRow
                title={item.complaintNo}
                lines={[
                  item.company?.shortName ?? item.company?.legalTitle ?? 'Firma eşleşmemiş',
                  `Makine: ${machine}`,
                  item.subject,
                  [
                    COMPLAINT_SOURCE_LABELS[item.source] ?? item.source,
                    SEVERITY_LABELS[item.severity] ?? item.severity,
                    relativeTime(item.createdAt),
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  contact || null,
                ]}
                icon="chatbox-ellipses-outline"
                iconTone={tone}
                chip={{ label: COMPLAINT_STATUS_LABELS[item.status] ?? item.status, tone }}
                trailing={item.serviceTicket?.ticketNo ?? undefined}
                onPress={() => router.push(`/modules/service-complaints/${item.id}` as Href)}
              />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={
            <EmptyState
              title={search || status || filterCount ? "Eşleşen şikayet bulunamadı" : "Henüz şikayet yok"}
              actionLabel={search || status || filterCount ? "Filtreleri temizle" : undefined}
              onAction={clearFilters}
              hint={search || status || filterCount ? 'Arama veya filtre ölçütlerini değiştirin.' : 'Yeni kayıtlar burada listelenir.'}
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}

      {canCreate ? <Fab label="Yeni İç Kayıt" extended onPress={() => router.push('/modal/complaint-new' as Href)} /> : null}
    </SafeAreaView>
  );
}
