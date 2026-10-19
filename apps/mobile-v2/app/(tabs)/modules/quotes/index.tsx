import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useFileLinks } from '@/src/api/commercial-docs.hooks';
import { useQuoteList } from '@/src/api/crm.hooks';
import type { QuoteListItem, QuoteListQuery } from '@/src/api/endpoints';
import { exportService } from '@/src/api/exports';
import { useSalesOrders } from '@/src/api/inventory.hooks';
import { useGroupedQuoteList } from '@/src/api/quotes.hooks';
import type { SalesOrderListRow } from '@/src/api/sales-orders.api';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { formatAmount, formatDate } from '@/src/lib/format';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { downloadAndShareFile } from '@/src/native/files';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Card, Chip, EmptyState, ErrorState, Fab, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar, SectionHeader } from '@/src/ui';
import { Tabs } from '@/src/ui/data';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { toast } from '@/src/ui/toast';
import { filterLinksForFolder } from '@/src/ui/documents/document-logic';
import { ChoiceChips } from '@/src/ui/documents/pickers';
import { QuoteDistributionCard, QuoteKpis, QuoteTrendCard } from '@/src/ui/documents/QuoteOverview';
import { businessLineForDivision, exportQueryForTab, QUOTE_TABS, statusCodesForTab, type BusinessLine, type QuoteTabKey } from '@/src/ui/documents/quote-logic';
import { FileLinkCard, SalesOrderRow } from '@/src/ui/documents/rows';

/**
 * Durum kodu -> ton. Kodlar `quote_statuses` seed'iyle birebir (draft/sent/
 * approved/rejected/expired/pending_super_admin_approval/cancelled/
 * price_waiting/budget_waiting/on_hold/postponed); tanınmayan kod nötr
 * gösterilir (yeni durum eklenince ekran bozulmasın).
 */
const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  sent: 'info',
  approved: 'success',
  rejected: 'destructive',
  expired: 'destructive',
  cancelled: 'destructive',
  pending_super_admin_approval: 'warning',
  price_waiting: 'warning',
  budget_waiting: 'warning',
  on_hold: 'warning',
  postponed: 'warning',
};

const PREVIEW_ROWS = 3;

/** Teklif satırı: belge no + ürün/firma tek satır, sağda tutar + durum chip. */
function QuoteRow({ item, onPress }: { item: QuoteListItem; onPress: () => void }) {
  const { colors } = useTheme();
  const company = item.company?.shortName ?? item.company?.legalTitle ?? null;
  const tone = STATUS_TONE[item.status?.code ?? ''] ?? 'neutral';
  const subtitle = [item.productName, company, item.followUpAt ? `Takip ${formatDate(item.followUpAt)}` : formatDate(item.quoteDate)]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.documentNo}
      className="my-1 min-h-[52px] flex-row items-center gap-2.5 rounded-[14px] border border-border bg-card px-3 py-2.5 active:opacity-70"
      style={{ borderCurve: 'continuous' }}
    >
      <View className="h-9 w-9 items-center justify-center rounded-[10px] bg-muted" style={{ borderCurve: 'continuous' }}>
        <Ionicons name="document-text-outline" size={18} color={colors.mutedForeground} />
      </View>

      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-inter-semibold text-[14px] leading-[19px] text-foreground" numberOfLines={1}>
          {item.revisionNo > 1 ? `${item.documentNo} · R${item.revisionNo}` : item.documentNo}
        </Text>
        <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
          {subtitle}
        </Text>
        {item.status ? <Chip tone={tone} label={item.status.name} shrink /> : null}
      </View>

      <Text className="font-inter-bold text-[14px] text-foreground" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
        {formatAmount(item.grandTotal, item.currency?.code ?? 'TRY')}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

function ExternalQuotesSection({ search }: { search: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const canUpload = useCan('files.create');
  const links = useFileLinks();
  const term = search.trim().toLocaleLowerCase('tr-TR');
  const rows = filterLinksForFolder(links.data?.items ?? [], 'external_quote', new Set()).filter(
    (link) => !term || link.file.originalFilename.toLocaleLowerCase('tr-TR').includes(term)
  );
  return (
    <View className="gap-1">
      <SectionHeader
        title={`Dış Teklifler · ${rows.length} dosya`}
        action={{ label: 'Tümü', onPress: () => router.push('/(tabs)/modules/documents?folder=external_quote') }}
      />
      {links.isPending ? (
        <Loading />
      ) : links.error ? (
        <ErrorState message={links.error.message} onRetry={() => void links.refetch()} />
      ) : rows.length === 0 ? (
        <Text className="py-2 font-inter text-[13px] text-muted-foreground">
          {term ? 'Aramayla eşleşen dış teklif yok.' : 'Henüz dış teklif yüklenmedi.'}
        </Text>
      ) : (
        rows.slice(0, PREVIEW_ROWS).map((link) => (
          <FileLinkCard
            key={link.id}
            link={link}
            onOpen={() => void downloadAndShareFile(link.fileId).catch((error: Error) => toast.error(error.message))}
          />
        ))
      )}
      {canUpload ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dış Teklif Yükle"
          onPress={() => router.push('/modal/quote-document-upload?type=external_quote')}
          className="min-h-[44px] flex-row items-center justify-center gap-1.5 rounded-control border border-dashed border-border active:opacity-70"
        >
          <Ionicons name="cloud-upload-outline" size={17} color={colors.primary} />
          <Text className="font-inter-semibold text-[13px] text-primary">Dış Teklif Yükle</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SalesOrdersSection() {
  const router = useRouter();
  const canInvoice = useCan('accounting_invoices.create');
  const orders = useSalesOrders({});
  const rows = (orders.data?.items ?? []) as SalesOrderListRow[];
  return (
    <View className="gap-1">
      <SectionHeader
        title={`Satış Siparişleri · ${orders.data?.total ?? 0} kayıt`}
        action={{ label: 'Tümü', onPress: () => router.push('/(tabs)/modules/sales-orders') }}
      />
      {orders.isPending ? (
        <Loading />
      ) : orders.error ? (
        <ErrorState message={orders.error.message} onRetry={() => void orders.refetch()} />
      ) : rows.length === 0 ? (
        <Text className="py-2 font-inter text-[13px] text-muted-foreground">Henüz satış siparişi yok.</Text>
      ) : (
        rows.slice(0, PREVIEW_ROWS).map((order) => (
          <SalesOrderRow
            key={order.id}
            order={order}
            onPress={() => router.push(`/(tabs)/modules/sales-orders/${order.id}`)}
            onInvoice={canInvoice ? () => router.push(`/modal/sales-order-accounting-invoice?orderId=${order.id}`) : undefined}
          />
        ))
      )}
    </View>
  );
}

export default function QuotesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canCreate = useCan('quotes.create');
  const canReadFiles = useCan('files.read');
  const canReadOrders = useCan('sales_orders.read');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<QuoteTabKey>('all');
  const [businessLine, setBusinessLine] = useState<BusinessLine | null>(null);
  const [exporting, setExporting] = useState(false);
  const serverSearch = useDebouncedValue(search.trim());

  const divisionOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { value: string; label: string }[] = [];
    for (const division of user?.divisions ?? []) {
      const line = businessLineForDivision(division.code);
      if (line && !seen.has(line)) {
        seen.add(line);
        options.push({ value: line, label: division.name });
      }
    }
    return options;
  }, [user?.divisions]);

  const codes = statusCodesForTab(tab);
  const baseQuery = useMemo<QuoteListQuery>(
    () => ({ search: serverSearch || undefined, ...(businessLine ? { businessLine } : {}) }),
    [businessLine, serverSearch]
  );
  const singleQuery = useMemo<QuoteListQuery>(
    () => ({ ...baseQuery, ...(codes.length === 1 ? { statusCode: codes[0] } : {}) }),
    [baseQuery, codes]
  );
  const grouped = codes.length > 1;
  const single = useQuoteList(singleQuery, !grouped);
  const group = useGroupedQuoteList(baseQuery, codes, grouped);
  const list = grouped ? group : single;
  const items = list.data?.items ?? [];

  async function exportExcel() {
    setExporting(true);
    try {
      await exportService.quotes(exportQueryForTab(tab, search));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dışa aktarma başarısız.');
    } finally {
      setExporting(false);
    }
  }

  const filtered = Boolean(search) || tab !== 'all';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Teklifler"
        subtitle="Tüm tekliflerinizi görüntüleyin ve yönetin."
        actions={[
          {
            icon: exporting ? 'hourglass-outline' : 'download-outline',
            label: 'Excel olarak dışa aktar',
            onPress: () => {
              if (!exporting) void exportExcel();
            },
          },
        ]}
      />

      {/* Liste her zaman bağlı kalır: arama kutusu başlıkta, sorgu anahtarı değişince klavye kapanmasın. */}
      <FlashList
        maintainVisibleContentPosition={{ disabled: true }}
        style={{ flex: 1 }}
        data={list.error ? [] : items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 96 }}
        renderItem={({ item }) => <QuoteRow item={item} onPress={() => router.push(`/(tabs)/modules/quotes/${item.id}`)} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        refreshing={list.isRefetching}
        onRefresh={() => {
          void qc.invalidateQueries({ queryKey: ['quotes'] });
          void qc.invalidateQueries({ queryKey: ['files', 'links'] });
          void qc.invalidateQueries({ queryKey: ['sales-orders'] });
        }}
        ListHeaderComponent={
          <View className="gap-3 pb-3 pt-2">
            {divisionOptions.length > 1 ? (
              <ChoiceChips
                label="İş alanı:"
                options={[{ value: '', label: 'Tümü' }, ...divisionOptions]}
                value={businessLine ?? ''}
                onChange={(next) => setBusinessLine((next || null) as BusinessLine | null)}
              />
            ) : null}
            <QuoteKpis businessLine={businessLine ?? undefined} />
            <QuoteTrendCard businessLine={businessLine ?? undefined} />
            <QuoteDistributionCard businessLine={businessLine ?? undefined} />
            {canReadFiles ? (
              <Card className="gap-1">
                <ExternalQuotesSection search={search} />
              </Card>
            ) : null}
            {canReadOrders ? (
              <Card className="gap-1">
                <SalesOrdersSection />
              </Card>
            ) : null}
            <View className="gap-2 pt-1" style={{ marginHorizontal: -SCREEN_PAD }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Teklif no, firma veya ürün ara" />
              <Tabs tabs={QUOTE_TABS.map((entry) => ({ value: entry.value, label: entry.label }))} value={tab} onChange={setTab} />
            </View>
            {list.error ? <ErrorState message={list.error.message} onRetry={() => void list.refetch()} /> : null}
          </View>
        }
        ListEmptyComponent={
          list.error ? null : list.isPending ? (
            <View style={{ marginHorizontal: -SCREEN_PAD }}>
              <ListSkeleton />
            </View>
          ) : (
            <EmptyState
              title="Teklif bulunamadı"
              hint={filtered ? 'Arama veya sekme filtresi sonuç döndürmedi.' : 'Henüz teklif kaydı yok.'}
              icon="document-text-outline"
              actionLabel={filtered ? 'Filtreleri Temizle' : canCreate ? 'Yeni Teklif' : undefined}
              onAction={
                filtered
                  ? () => {
                      setSearch('');
                      setTab('all');
                    }
                  : canCreate
                    ? () => router.push('/modal/quote-form')
                    : undefined
              }
            />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
      />

      {canCreate ? <Fab label="Yeni Teklif" extended onPress={() => router.push('/modal/quote-form')} /> : null}
    </SafeAreaView>
  );
}
