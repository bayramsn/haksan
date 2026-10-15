import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { Card, Chip, EmptyState, ErrorState, FilterChips, ListSkeleton, Loading, SCREEN_PAD, ScreenHeader, SearchBar } from '@/src/ui';
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

/**
 * Mockup s19'un teklif satırı: solda gri belge karesi, ortada belge no + firma,
 * sağda tutar / durum çipi / takvim ikonlu tarih.
 */
function QuoteRow({ item, tone, onPress }: { item: QuoteListItem; tone: Tone; onPress: () => void }) {
  const { colors } = useTheme();
  const company = item.company?.shortName ?? item.company?.legalTitle ?? null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.documentNo}
      className="my-[5px] flex-row items-center gap-3 rounded-[16px] border border-border bg-card px-3 py-3.5 active:opacity-70"
      style={{ borderCurve: 'continuous' }}
    >
      <View
        className="h-[42px] w-[42px] items-center justify-center rounded-[12px]"
        style={{ backgroundColor: colors.muted, borderCurve: 'continuous' }}
      >
        <Ionicons name="document-text-outline" size={20} color={colors.mutedForeground} />
      </View>

      <View className="flex-1 gap-1">
        <Text className="font-inter-semibold text-[15px] leading-[20px] text-foreground" numberOfLines={1}>
          {item.revisionNo > 1 ? `${item.documentNo} · R${item.revisionNo}` : item.documentNo}
        </Text>
        {company ? (
          <Text className="font-inter text-[13px] text-muted-foreground" numberOfLines={1}>
            {company}
          </Text>
        ) : null}
      </View>

      {/* Sabit genişlik: "Süper Admin Onayı Bekliyor" gibi uzun durum adları
          sınırlanmazsa belge no ve firma sütununu tamamen yutuyor. */}
      <View className="w-[132px] items-end gap-1">
        <Text
          className="font-inter-bold text-[15px] text-foreground"
          numberOfLines={1}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatAmount(item.grandTotal, item.currency?.code ?? 'TRY')}
        </Text>
        {item.status ? (
          <View className="max-w-full flex-row justify-end">
            <Chip tone={tone} label={item.status.name} shrink />
          </View>
        ) : null}
        <View className="flex-row items-center gap-1">
          <Ionicons name="calendar-outline" size={12} color={colors.mutedForeground} />
          <Text className="font-inter text-[12px] text-muted-foreground">{formatDate(item.quoteDate)}</Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

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
          // v2'de bu özellik varsayılan AÇIK ve sayfalama/yeniden ölçüm sonrası
          // içeriği çapalayıp listenin başında boşluk bırakıyor. Bunlar sohbet
          // değil, tepeden akan listeler — kapalı olmalı.
          maintainVisibleContentPosition={{ disabled: true }}
          // FlashList v2 kendi başına esnemiyor; sınırlanmamış sütun içinde
          // içerik aşağı kayıyor ve filtrelerin altında boşluk kalıyor.
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: 32 }}
          renderItem={({ item }) => (
            <QuoteRow item={item} tone={toneFor(item)} onPress={() => router.push(`/(tabs)/modules/quotes/${item.id}`)} />
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
                    <View className="flex-row items-center justify-between pb-3">
                      <View className="flex-row items-center gap-1 rounded-full px-1 py-1">
                        <Text className="font-inter-medium text-[13px] text-foreground">Bu Ay (Mayıs)</Text>
                        <Ionicons name="chevron-down" size={14} color={colors.foreground} />
                      </View>
                      <View className="flex-row items-center gap-1 rounded-[8px] border border-border bg-card px-2 py-1.5">
                        <Text className="font-inter-medium text-[12px] text-foreground">30 Gün</Text>
                        <Ionicons name="chevron-down" size={14} color={colors.foreground} />
                      </View>
                    </View>
                    <View className="flex-row items-end justify-between gap-3">
                      <View className="gap-1">
                        <Text className="font-inter text-[13px] text-muted-foreground">
                          Toplam Teklif Tutarı · {monthlySummary.currencyCode}
                        </Text>
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
                          <Text className="font-inter text-[12px] text-muted-foreground">geçen aya göre</Text>
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
                      maxValue={Math.max(...monthlySummary.chart.map((d) => d.value)) * 1.2 || 1}
                    />
                    <View className="flex-row justify-between px-2 pt-1">
                      <Text className="font-inter text-[10px] text-muted-foreground">1 May</Text>
                      <Text className="font-inter text-[10px] text-muted-foreground">15 May</Text>
                      <Text className="font-inter text-[10px] text-muted-foreground">31 May</Text>
                    </View>
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

      {/* Mockup s19'da sağ altta "＋ Yeni Teklif" butonu var */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Yeni Teklif"
        onPress={() => {}}
        className="absolute bottom-5 right-5 h-12 flex-row items-center justify-center gap-2 rounded-full bg-primary px-4 active:opacity-80"
        style={{ boxShadow: '0 7px 18px rgba(214, 24, 31, 0.28)' }}
      >
        <View className="h-6 w-6 items-center justify-center rounded-full bg-canvas">
          <Ionicons name="add" size={18} color={colors.primary} />
        </View>
        <Text className="font-inter-semibold text-[14px] text-primary-foreground">Yeni Teklif</Text>
      </Pressable>
    </SafeAreaView>
  );
}
