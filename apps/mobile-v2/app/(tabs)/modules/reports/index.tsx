import { useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { useRouter } from 'expo-router';
import { useStockSummary } from '@/src/api/calendar.hooks';
import { monthlyTotalsByCurrency, useCompletedPayments, useCustomerBalances } from '@/src/api/finance.hooks';
import { reports } from '@/src/api/endpoints';
import { formatAmount } from '@/src/lib/format';
import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Card, ErrorState, Eyebrow, ListRow, ListSkeleton, ScreenHeader } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';

function Metric({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  const { colors } = useTheme();
  return (
    <Card className="flex-1 gap-1">
      <Text
        className="font-inter-bold text-[19px]"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: tone ? toneColor(colors, tone) : colors.foreground }}
      >
        {value}
      </Text>
      <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

export default function ReportsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const chartColors = [colors.chart1, colors.chart2, colors.chart3, colors.chart4, colors.chart5];

  const pipeline = useQuery({ queryKey: ['reports', 'pipeline'], queryFn: () => reports.pipelineSummary() });
  const serviceSummary = useQuery({ queryKey: ['reports', 'service'], queryFn: () => reports.serviceSummary() });
  const stock = useStockSummary();
  const balances = useCustomerBalances();

  const collectionRange = useMemo(() => {
    const now = new Date();
    return { from: new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString(), to: now.toISOString() };
  }, []);
  const collections = useCompletedPayments(collectionRange);

  const pipelineCount = useMemo(
    () => (pipeline.data ?? []).reduce((sum, stage) => sum + stage.count, 0),
    [pipeline.data],
  );

  const balanceTotals = useMemo(() => {
    const totals = new Map<string, { debt: number; credit: number }>();
    for (const row of balances.data ?? []) {
      for (const currency of row.currencies) {
        const total = totals.get(currency.currencyCode) ?? { debt: 0, credit: 0 };
        if (currency.totalBalance > 0) total.debt += currency.totalBalance;
        if (currency.totalBalance < 0) total.credit += Math.abs(currency.totalBalance);
        totals.set(currency.currencyCode, total);
      }
    }
    return [...totals.entries()].sort(([a], [b]) => (a === 'TRY' ? -1 : b === 'TRY' ? 1 : a.localeCompare(b)));
  }, [balances.data]);

  const collectionGroups = useMemo(
    () => monthlyTotalsByCurrency(collections.data ?? [], 6, 'in').filter((group) => group.total > 0),
    [collections.data],
  );

  const stockTotal = (stock.data ?? []).reduce((sum, row) => sum + row.count, 0);
  const busy =
    pipeline.isPending || serviceSummary.isPending || stock.isPending || balances.isPending || collections.isPending;
  const refetchAll = () => {
    void pipeline.refetch();
    void serviceSummary.refetch();
    void stock.refetch();
    void balances.refetch();
    void collections.refetch();
  };

  if (busy) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Raporlar" />
        <ListSkeleton />
      </SafeAreaView>
    );
  }

  // Uçlardan biri hata verse bile diğerleri gösterilir; hepsi düşerse tek hata ekranı.
  const allFailed = pipeline.error && serviceSummary.error && stock.error && balances.error;
  if (allFailed) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Raporlar" />
        <ErrorState message="Raporlar yüklenemedi." onRetry={refetchAll} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Raporlar" subtitle="İş süreçlerinize dair özet göstergeler." />

      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-10 pt-1"
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={refetchAll} tintColor={colors.mutedForeground} />
        }
      >
        <View className="flex-row gap-3">
          <Metric label="Açık fırsat" value={String(pipelineCount)} tone="info" />
          <Metric label="Stok kalemi" value={String(stockTotal)} tone="neutral" />
        </View>
        {balanceTotals.map(([currencyCode, total]) => (
          <View key={currencyCode} className="flex-row gap-3">
            <Metric
              label={`${currencyCode} toplam alacak`}
              value={formatAmount(total.debt, currencyCode)}
              tone="success"
            />
            <Metric
              label={`${currencyCode} toplam borç`}
              value={formatAmount(total.credit, currencyCode)}
              tone="destructive"
            />
          </View>
        ))}

        {(pipeline.data ?? []).length > 0 ? (
          <Card className="gap-3">
            <Text className="font-inter-semibold text-base text-foreground">Satış hunisi</Text>
            <BarChart
              data={(pipeline.data ?? [])
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((stage) => ({
                  value: stage.count,
                  label: stage.stageName.slice(0, 6),
                  frontColor: colors.chart1,
                }))}
              barWidth={24}
              spacing={16}
              noOfSections={4}
              yAxisTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 9 }}
              yAxisColor={colors.chartGrid}
              xAxisColor={colors.chartGrid}
              isAnimated
            />
          </Card>
        ) : null}

        {collectionGroups.map(({ currencyCode, months }) => (
          <Card key={currencyCode} className="gap-3">
            <Text className="font-inter-semibold text-base text-foreground">
              Tahsilat trendi · {currencyCode}
            </Text>
            <BarChart
              data={months.map((m) => ({ value: m.total, label: m.label, frontColor: colors.chart2 }))}
              barWidth={24}
              spacing={16}
              noOfSections={4}
              yAxisTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 9 }}
              yAxisColor={colors.chartGrid}
              xAxisColor={colors.chartGrid}
              isAnimated
            />
          </Card>
        ))}

        {serviceSummary.data ? (
          <View className="gap-1.5">
            <View className="px-1">
              <Eyebrow>Servis özeti</Eyebrow>
            </View>
            <Card className="gap-3">
              {(() => {
                const d = serviceSummary.data!;
                const donutTotal = d.new + d.reviewing + d.converted + d.rejected;
                if (donutTotal <= 0) return null;
                const slices = (
                  [
                    ['Yeni', d.new, chartColors[0]],
                    ['İncelemede', d.reviewing, chartColors[1]],
                    ['Talebe dönüşen', d.converted, chartColors[2]],
                    ['Reddedilen', d.rejected, chartColors[3]],
                  ] as [string, number, string][]
                )
                  .filter(([, value]) => value > 0)
                  .map(([text, value, color]) => ({ text, value, color }));
                return (
                  <View className="items-center py-1">
                    <PieChart
                      donut
                      radius={62}
                      innerRadius={42}
                      data={slices}
                      centerLabelComponent={() => (
                        <View className="items-center">
                          <Text className="font-inter-bold text-lg text-foreground">{donutTotal}</Text>
                          <Text className="font-inter text-[10px] text-muted-foreground">talep</Text>
                        </View>
                      )}
                    />
                  </View>
                );
              })()}
              <View>
                {(
                  [
                    ['Toplam', serviceSummary.data.total, 'neutral'],
                    ['Yeni', serviceSummary.data.new, 'destructive'],
                    ['İncelemede', serviceSummary.data.reviewing, 'warning'],
                    ['Talebe dönüşen', serviceSummary.data.converted, 'success'],
                    ['Garanti talebi', serviceSummary.data.warrantyClaim, 'stage'],
                  ] as [string, number, Tone][]
                ).map(([label, value, tone], index) => (
                  <View
                    key={label}
                    className={`flex-row justify-between py-2 ${index > 0 ? 'border-t border-border' : ''}`}
                  >
                    <Text className="font-inter text-sm text-muted-foreground">{label}</Text>
                    <Text
                      className="font-inter-semibold text-sm"
                      style={{ color: toneColor(colors, tone) }}
                    >
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : null}

        {(stock.data ?? []).length > 0 ? (
          <View className="gap-1.5">
            <View className="px-1">
              <Eyebrow>Stok durumu</Eyebrow>
            </View>
            <Card className="gap-3">
              <View className="items-center py-1">
                <PieChart
                  radius={62}
                  data={(stock.data ?? []).map((row, index) => ({
                    value: row.count,
                    color: chartColors[index % chartColors.length],
                    text: row.statusName ?? undefined,
                  }))}
                />
              </View>
              <View>
                {(stock.data ?? []).map((row, index) => (
                  <View
                    key={row.status ?? `row-${index}`}
                    className={`flex-row items-center justify-between py-2 ${index > 0 ? 'border-t border-border' : ''}`}
                  >
                    <View className="flex-row items-center gap-2">
                      <View
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: chartColors[index % chartColors.length] }}
                      />
                      <Text className="font-inter text-sm text-muted-foreground">{row.statusName ?? 'Tanımsız'}</Text>
                    </View>
                    <Text className="font-inter-semibold text-sm text-foreground">{row.count}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : null}

        <View className="gap-1.5">
          <View className="px-1">
            <Eyebrow>Detaylı raporlar</Eyebrow>
          </View>
          <ListRow
            title="Cari Rapor"
            lines={[
              `${(balances.data ?? []).length} cari`,
              ...balanceTotals.map(([currencyCode, total]) =>
                `${currencyCode} net ${formatAmount(total.debt - total.credit, currencyCode)}`,
              ),
            ]}
            icon="scale-outline"
            iconTone="stage"
            onPress={() => router.push('/(tabs)/modules/balances')}
          />
          <ListRow
            title="Vade Takvimi"
            lines={['Yaklaşan ve geciken vadeler']}
            icon="calendar-outline"
            iconTone="destructive"
            onPress={() => router.push('/(tabs)/modules/due-dates')}
          />
          <ListRow
            title="Fırsatlar"
            lines={['Satış hunisi ve pano görünümü']}
            icon="briefcase-outline"
            iconTone="info"
            onPress={() => router.push('/(tabs)/modules/opportunities')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
