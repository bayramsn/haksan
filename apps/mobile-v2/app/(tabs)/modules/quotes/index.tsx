import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { useLookup, useQuoteList, useQuoteSummary } from '@/src/api/crm.hooks';
import type { QuoteListItem, QuoteListQuery } from '@/src/api/endpoints';
import { formatAmount, formatDate } from '@/src/lib/format';
import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import {
  ListSkeleton,
  Card,
  EmptyState,
  Eyebrow,
  ErrorState,
  FilterChips,
  ListRow,
  Loading,
  ScreenHeader,
  SearchBar,
} from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';

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

export default function QuotesScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const serverSearch = useDebouncedValue(search.trim());

  const statuses = useLookup('quote-statuses');

  const query = useMemo<QuoteListQuery>(
    () => ({ search: serverSearch || undefined, statusCode: statusCode ?? undefined }),
    [serverSearch, statusCode]
  );

  const list = useQuoteList(query);
  const items = list.data?.items ?? [];
  const { colors } = useTheme();

  const summaryRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth() - 5, 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const summaryQuery = useMemo<QuoteListQuery>(
    () => ({ ...query, ...summaryRange }),
    [query, summaryRange],
  );
  const summary = useQuoteSummary(summaryQuery);

  function toneFor(item: QuoteListItem): Tone {
    return STATUS_TONE[item.status?.code ?? ''] ?? 'neutral';
  }

  // Sunucu özeti tüm filtrelenmiş veri kümesini para birimi bazında toplar;
  // burada yalnız grafikte boş ayların 0 kovaları tamamlanır.
  const monthlySummaries = useMemo(() => {
    const now = new Date();
    const monthKeys = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    });
    return (summary.data?.byCurrency ?? []).map((group) => {
      const totals = new Map(group.months.map((month) => [month.month, Number(month.total || 0)]));
      const chart = monthKeys.map((key) => ({ value: totals.get(key) ?? 0 }));
      const total = chart[chart.length - 1]?.value ?? 0;
      const previous = chart[chart.length - 2]?.value ?? 0;
      return {
        currencyCode: group.currencyCode,
        total,
        trendPct: previous > 0 ? ((total - previous) / previous) * 100 : null,
        chart,
      };
    });
  }, [summary.data]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Teklifler" subtitle="Tüm tekliflerinizi görüntüleyin ve yönetin." />

      <View className="gap-2 pb-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Teklif no veya firma ara" />
        <FilterChips
          options={(statuses.data ?? []).map((status) => ({ value: status.code, label: status.name }))}
          value={statusCode}
          onChange={setStatusCode}
        />
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <ListRow
              title={item.revisionNo > 1 ? `${item.documentNo} · R${item.revisionNo}` : item.documentNo}
              lines={[
                item.company?.shortName ?? item.company?.legalTitle ?? null,
                item.productName,
                formatDate(item.quoteDate),
              ]}
              icon="document-text-outline"
              iconTone={toneFor(item)}
              chip={item.status ? { label: item.status.name, tone: toneFor(item) } : undefined}
              trailing={formatAmount(item.grandTotal, item.currency?.code ?? 'TRY')}
              onPress={() => router.push(`/(tabs)/modules/quotes/${item.id}`)}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListHeaderComponent={
            monthlySummaries.length > 0 ? (
              <View className="gap-3 pb-3">
                {monthlySummaries.map((monthlySummary) => (
                  <Card key={monthlySummary.currencyCode} className="gap-3">
                    <View className="flex-row items-end justify-between gap-3">
                      <View className="gap-1">
                        <Eyebrow>Bu Ay · Toplam Teklif Tutarı · {monthlySummary.currencyCode}</Eyebrow>
                        <Text className="text-[21px] font-inter-bold text-foreground" numberOfLines={1} adjustsFontSizeToFit>
                          {formatAmount(monthlySummary.total, monthlySummary.currencyCode)}
                        </Text>
                      </View>
                      {monthlySummary.trendPct !== null ? (
                        <View className="flex-row items-center gap-1 pb-1">
                          <Ionicons
                            name={monthlySummary.trendPct >= 0 ? 'arrow-up' : 'arrow-down'}
                            size={13}
                            color={toneColor(colors, monthlySummary.trendPct >= 0 ? 'success' : 'destructive')}
                          />
                          <Text
                            className="font-inter-semibold text-[13px]"
                            style={{ color: toneColor(colors, monthlySummary.trendPct >= 0 ? 'success' : 'destructive') }}
                          >
                            %{Math.abs(monthlySummary.trendPct).toFixed(1)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <LineChart
                      data={monthlySummary.chart}
                      areaChart
                      curved
                      height={56}
                      hideDataPoints
                      hideRules
                      hideYAxisText
                      xAxisThickness={0}
                      yAxisThickness={0}
                      color={colors.chart1}
                      startFillColor={colors.chart1}
                      endFillColor={colors.chart1}
                      startOpacity={0.25}
                      endOpacity={0.02}
                      thickness={2}
                      spacing={38}
                      initialSpacing={6}
                      endSpacing={0}
                    />
                  </Card>
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title="Teklif bulunamadı"
              hint={search || statusCode ? 'Arama veya durum filtresi sonuç döndürmedi.' : 'Henüz teklif kaydı yok.'}
              icon="document-text-outline"
              actionLabel={search || statusCode ? 'Filtreleri Temizle' : undefined}
              onAction={
                search || statusCode
                  ? () => {
                      setSearch('');
                      setStatusCode(null);
                    }
                  : undefined
              }
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
