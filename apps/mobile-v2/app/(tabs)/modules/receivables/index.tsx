import { useMemo } from 'react';
import { SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import {
  monthlyTotalsByCurrency,
  useCompletedPayments,
  useReceivables,
  useReceivableSummary,
} from '@/src/api/finance.hooks';
import type { Receivable2 } from '@/src/api/endpoints';
import { dueLabel, formatAmount, formatDate } from '@/src/lib/format';
import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { useCan } from '@/src/auth/AuthProvider';
import { ListSkeleton, Card, EmptyState, ErrorState, ListRow, Loading, ScreenHeader, StatStrip } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';

type Bucket = 'overdue' | 'upcoming' | 'settled';

const BUCKETS: { key: Bucket; title: string; tone: Tone }[] = [
  { key: 'overdue', title: 'Vadesi Geçen', tone: 'destructive' },
  { key: 'upcoming', title: 'Yaklaşan', tone: 'warning' },
  { key: 'settled', title: 'Tahsil Edilenler', tone: 'success' },
];

/** payment_statuses kodları tenant'a göre değişebildiği için ada da bakılıyor. */
function isSettled(row: Receivable2): boolean {
  const code = row.status?.code?.toLowerCase() ?? '';
  return code.includes('paid') || code.includes('collected') || code.includes('closed') || code.includes('cancelled');
}

function bucketOf(row: Receivable2): Bucket {
  if (isSettled(row)) return 'settled';
  return dueLabel(row.dueDate)?.overdue ? 'overdue' : 'upcoming';
}

/** "Aylık Tahsilat Özeti": son 6 ayın toplam tahsilatı + ay/ay trend oku + alan grafiği. */
function MonthlyCollectionSummary() {
  const { colors } = useTheme();
  const range = useMemo(() => {
    const now = new Date();
    return { from: new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString(), to: now.toISOString() };
  }, []);
  const { data } = useCompletedPayments(range);
  const groups = useMemo(
    () => monthlyTotalsByCurrency(data ?? [], 6, 'in').filter((group) => group.total > 0),
    [data],
  );

  if (groups.length === 0) return null; // sunucuda kayıt yoksa kartı hiç gösterme

  return (
    <View className="gap-3 px-4 pb-2">
      {groups.map(({ currencyCode, months, total }) => {
        const last = months[months.length - 1]!;
        const prev = months[months.length - 2]!;
        // Bir önceki ay sıfırsa yüzde artış anlamsız (sonsuz) olur; o zaman ok gösterme.
        const trendPct = prev.total > 0 ? ((last.total - prev.total) / prev.total) * 100 : null;
        const trendTone: Tone = (trendPct ?? 0) >= 0 ? 'success' : 'destructive';
        return (
          <Card key={currencyCode} className="gap-3">
            <View className="flex-row items-start justify-between">
              <View className="gap-0.5">
                <Text className="font-inter-semibold text-[13px] text-muted-foreground">
                  Aylık Tahsilat Özeti · {currencyCode}
                </Text>
                <Text className="font-inter-bold text-[22px] text-foreground">
                  {formatAmount(total, currencyCode)}
                </Text>
              </View>
              {trendPct !== null ? (
                <View className="flex-row items-center gap-1 pt-1">
                  <Ionicons name={trendPct >= 0 ? 'arrow-up' : 'arrow-down'} size={13} color={toneColor(colors, trendTone)} />
                  <Text className="font-inter-semibold text-[13px]" style={{ color: toneColor(colors, trendTone) }}>
                    %{Math.abs(Math.round(trendPct))}
                  </Text>
                </View>
              ) : null}
            </View>
            <LineChart
              data={months.map((m) => ({ value: m.total, label: m.label }))}
              areaChart
              curved
              color={colors.chart1}
              startFillColor={colors.chart1}
              endFillColor={colors.chart1}
              startOpacity={0.25}
              endOpacity={0.02}
              thickness={2}
              hideDataPoints
              noOfSections={3}
              height={110}
              spacing={40}
              initialSpacing={12}
              yAxisTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
              yAxisColor={colors.chartGrid}
              xAxisColor={colors.chartGrid}
              isAnimated
            />
          </Card>
        );
      })}
    </View>
  );
}

export default function ReceivablesScreen() {
  const router = useRouter();
  const canCreate = useCan('receivables.create');
  const list = useReceivables();
  const summary = useReceivableSummary();
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  const sections = useMemo(
    () =>
      BUCKETS.map(({ key, title, tone }) => ({
        title,
        tone,
        data: items.filter((row) => bucketOf(row) === key),
      })).filter((section) => section.data.length > 0),
    [items]
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Tahsilatlar"
        subtitle="Tahsilat süreçlerinizi takip edin ve yönetin."
        actions={
          canCreate
            ? [{ icon: 'add' as const, label: 'Yeni alacak', onPress: () => router.push('/modal/new-receivable' as Href) }]
            : []
        }
      />

      <MonthlyCollectionSummary />

      <StatStrip
        items={[
          { label: 'Kayıt', value: String(summary.data?.total ?? list.data?.total ?? 0) },
          { label: 'Açık', value: String(summary.data?.openCount ?? '—'), tone: 'warning' },
          { label: 'Vadesi geçen', value: String(summary.data?.overdueCount ?? '—'), tone: 'destructive' },
        ]}
      />
      {(summary.data?.byCurrency ?? []).map((row) => (
        <StatStrip
          key={row.currencyCode}
          items={[
            { label: `${row.currencyCode} açık`, value: formatAmount(row.openAmount, row.currencyCode), tone: 'warning' },
            {
              label: `${row.currencyCode} geciken`,
              value: formatAmount(row.overdueAmount, row.currencyCode),
              tone: 'destructive',
            },
          ]}
        />
      ))}

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text className="pb-1 pt-4 font-inter-semibold text-[13px] text-muted-foreground">
              {section.title}
            </Text>
          )}
          renderItem={({ item, section }) => {
            const due = dueLabel(item.dueDate);
            const tone = (section as { tone: Tone }).tone;
            return (
              <ListRow
                title={item.company.shortName ?? item.company.legalTitle}
                lines={[
                  item.invoiceNo ? `Fatura: ${item.invoiceNo}` : item.documentRef,
                  `Vade: ${formatDate(item.dueDate)}`,
                  item.paymentMethod,
                ]}
                icon="wallet-outline"
                iconTone={tone}
                chip={
                  due && tone !== 'success'
                    ? { label: due.text, tone }
                    : item.status
                      ? { label: item.status.name, tone }
                      : undefined
                }
                trailing={formatAmount(item.amount, item.currency?.code ?? 'TRY')}
                trailingTone={tone === 'destructive' ? 'destructive' : undefined}
                onPress={() => router.push(`/(tabs)/modules/receivables/${item.id}` as Href)}
              />
            );
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Tahsilat kaydı yok" />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </SafeAreaView>
  );
}
