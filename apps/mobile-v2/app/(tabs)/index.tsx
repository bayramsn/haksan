import { useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { LineChart } from 'react-native-gifted-charts';
import * as Haptics from 'expo-haptics';
import { useDashboard } from '@/src/api/dashboard';
import { useCalendarEvents } from '@/src/api/calendar.hooks';
import { useCompletedPayments, monthlyTotalsByCurrency } from '@/src/api/finance.hooks';
import { useQuoteList } from '@/src/api/crm.hooks';
import { useShipments } from '@/src/api/operations.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { useTheme, chipTextClass, toneColor, type Tone } from '@/src/theme/theme';
import { formatAmount, formatCompact, formatTime, greeting } from '@/src/lib/format';
import { Card, Chip, EmptyState, ErrorState, Eyebrow, H1, ListRow } from '@/src/ui';
import { Enter, Skeleton, Stagger } from '@/src/ui/motion';
import { StatCard, StatGrid } from '@/src/ui/data';
import { SyncStatus } from '@/src/ui/SyncStatus';

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { data, isPending, isRefetching, error, refetch } = useDashboard();

  // Son 6 ay (bu ay dahil) — Satış Trendi grafiği ve "Tahsilat" KPI'sı aynı veriden türer.
  const salesTrendRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth() - 5, 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const thisMonthRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth(), 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const todayRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);
  const upcomingRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const completedPayments = useCompletedPayments(salesTrendRange);
  const quoteList = useQuoteList(thisMonthRange);
  const shipmentList = useShipments('active');
  const todayEvents = useCalendarEvents(todayRange);
  const upcomingEvents = useCalendarEvents(upcomingRange);

  const salesTrendGroups = useMemo(
    () => monthlyTotalsByCurrency(completedPayments.data ?? [], 6, 'in').filter((group) => group.total > 0),
    [completedPayments.data],
  );
  const collectionsThisMonth = completedPayments.data
    ? salesTrendGroups
        .map((group) => `${formatCompact(group.months[group.months.length - 1]?.total ?? 0)} ${group.currencyCode}`)
        .join(' · ') || '0'
    : null;

  // Her iki KPI da sunucuda tüm filtrelenmiş veri kümesinin `meta.total` değeridir;
  // ilk 50 satırın istemcide sayılmasıyla eksik sonuç üretmez.
  const quotesThisMonth = quoteList.data ? quoteList.data.total : null;
  const activeShipments = shipmentList.data ? shipmentList.data.total : null;

  // Çark yerine içerik şekli: açılışta panelin iskeleti görünür.
  if (isPending) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <SyncStatus />
        <ScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-2">
          <View className="gap-2">
            <Skeleton width={120} height={14} />
            <Skeleton width="58%" height={28} rounded={10} />
          </View>
          <Skeleton height={72} rounded={12} />
          <View className="flex-row flex-wrap gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <View key={i} className="min-h-[96px] flex-1 basis-[45%] rounded-surface border border-border bg-card p-4">
                <Skeleton width={40} height={40} rounded={12} />
                <View className="mt-3 gap-2">
                  <Skeleton width="70%" height={11} />
                  <Skeleton width="44%" height={20} />
                </View>
              </View>
            ))}
          </View>
          <Skeleton height={180} rounded={12} />
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
        <ErrorState message={error?.message ?? 'Panel yüklenemedi.'} onRetry={() => void refetch()} />
      </SafeAreaView>
    );
  }

  // Uç nokta hata verdiyse değer null gelir; sayı yerine "—" gösterilir.
  const num = (v: number | null) => (v === null ? '—' : String(v));
  const overdue = data.overdueReceivables;

  const go = (href: Href) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(href);
  };

  const briefing: { tone: Tone; text: string }[] = [];
  if (overdue && overdue.count > 0) {
    briefing.push({
      tone: 'destructive',
      text: `${overdue.count} geciken tahsilat — ${
        overdue.byCurrency.length > 0
          ? overdue.byCurrency.map((row) => formatAmount(row.amount, row.currencyCode)).join(' · ')
          : 'tutar bilgisi yok'
      }`,
    });
  }
  if (data.openServices !== null && data.openServices > 0) {
    briefing.push({ tone: 'warning', text: `${data.openServices} servis talebi bekliyor` });
  }
  if (briefing.length === 0) {
    briefing.push({ tone: 'success', text: 'Bekleyen kritik iş yok. Gün temiz.' });
  }

  // Fırsat Aşama Özeti: huni tepe (Lead) = %100 genişlik referansı; dönüşüm
  // oranı en üst ile en olgun açık aşama arasındaki oran (win/lost bu uçta hiç
  // dönmüyor — kapanan fırsatlar panodan düşüyor, bkz. reports.service.ts).
  const topStage = data.stages[0];
  const bottomStage = data.stages[data.stages.length - 1];
  const conversionRate =
    topStage && bottomStage && topStage.value > 0 ? Math.round((bottomStage.value / topStage.value) * 100) : null;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching || completedPayments.isRefetching || quoteList.isRefetching || shipmentList.isRefetching}
            onRefresh={() => {
              void refetch();
              void completedPayments.refetch();
              void quoteList.refetch();
              void shipmentList.refetch();
              void todayEvents.refetch();
              void upcomingEvents.refetch();
            }}
            tintColor={colors.mutedForeground}
          />
        }
      >
        <View className="gap-0.5">
          <Text className="font-inter text-sm text-muted-foreground">{greeting()}</Text>
          <H1>{user?.fullName ?? 'Haksan'}</H1>
        </View>

        {/* §6.3: bağlamsal özet, KPI'lardan önce. Kademeli giriş: kartlar
            sırayla belirir; reduced-motion'da anında tam görünür. */}
        <Enter>
          <Card className="gap-2">
            <Eyebrow>Bugün</Eyebrow>
            {briefing.map((item) => (
              <View key={item.text} className="flex-row items-start gap-2">
                <View className="mt-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: toneColor(colors, item.tone) }} />
                <Text className={`flex-1 font-inter text-sm ${chipTextClass[item.tone]}`}>{item.text}</Text>
              </View>
            ))}
          </Card>
        </Enter>

        {/* 4'lü KPI ızgarası — trend sunucuda ayrı bir "önceki dönem" ucu olmadığı
            için verilmiyor (uydurma olurdu). */}
        <Enter delay={70}>
          <StatGrid columns={2}>
            <StatCard
              key="opportunities"
              icon="briefcase-outline"
              tone="stage"
              label="Açık Fırsatlar"
              value={num(data.openOpportunities)}
              onPress={() => go('/(tabs)/modules/opportunities')}
            />
            <StatCard
              key="quotes"
              icon="document-text-outline"
              tone="warning"
              label="Bu Ay Teklifler"
              value={num(quotesThisMonth)}
              onPress={() => go('/(tabs)/modules/quotes')}
            />
            <StatCard
              key="collections"
              icon="wallet-outline"
              tone="success"
              label="Tahsilat"
              value={collectionsThisMonth ?? '—'}
              onPress={() => go('/(tabs)/modules/payments')}
            />
            <StatCard
              key="shipments"
              icon="car-outline"
              tone="info"
              label="Sevkiyat"
              value={num(activeShipments)}
              onPress={() => go('/(tabs)/modules/shipments')}
            />
          </StatGrid>
        </Enter>

        {salesTrendGroups.map(({ currencyCode, months }) => (
          <Stagger index={3} key={currencyCode}>
          <Card className="gap-3">
            <Text className="font-inter-semibold text-base text-foreground">
              Satış Trendi · {currencyCode}
            </Text>
            <LineChart
              data={months.map((b) => ({ value: b.total, label: b.label }))}
              areaChart
              curved
              color={colors.chart1}
              startFillColor={colors.chart1}
              endFillColor={colors.chart1}
              startOpacity={0.25}
              endOpacity={0.02}
              thickness={2}
              dataPointsColor={colors.chart1}
              noOfSections={4}
              yAxisTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 10 }}
              yAxisColor={colors.chartGrid}
              xAxisColor={colors.chartGrid}
              isAnimated
            />
          </Card>
          </Stagger>
        ))}

        {data.stages.length > 0 ? (
          <Enter delay={140}>
          <Card className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-inter-semibold text-base text-foreground">Fırsat Aşama Özeti</Text>
              {conversionRate !== null ? <Chip tone="success" label={`Dönüşüm Oranı %${conversionRate}`} /> : null}
            </View>
            <View className="gap-2.5">
              {data.stages.map((stage) => {
                const pct =
                  topStage && topStage.value > 0
                    ? Math.max((stage.value / topStage.value) * 100, stage.value > 0 ? 6 : 0)
                    : 0;
                return (
                  <View key={stage.label} className="gap-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="font-inter-medium text-xs text-muted-foreground">{stage.label}</Text>
                      <Text className="font-inter-semibold text-xs text-foreground">{stage.value}</Text>
                    </View>
                    <View className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.muted }}>
                      <View className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: colors.chart1 }} />
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
          </Enter>
        ) : null}

        {/* Üretim & Stok Durumu kartı eklenmedi: "Üretimdeki Sipariş" ve "Kritik
            Stok Uyarısı" için sunucuda karşılık gelen bir durum/eşik alanı yok
            (SALES_ORDER_STATUSES ve INVENTORY_STATUSES'ta "production"/"critical"
            değeri yok), "Stok Değeri" için de kalem başına fiyat dönmüyor. Üçü de
            [VERİ YOK] — bkz. rapor. */}

        <Enter delay={200}>
        <Card className="gap-3">
          <Eyebrow>Bugünkü Görevler</Eyebrow>
          {todayEvents.isPending ? null : (todayEvents.data ?? []).length === 0 ? (
            <Text className="font-inter text-sm text-muted-foreground">Bugün için planlanmış etkinlik yok.</Text>
          ) : (
            <View className="gap-2.5">
              {(todayEvents.data ?? []).map((event) => (
                <View key={event.id} className="flex-row items-center gap-3">
                  <Text className="w-12 font-inter-semibold text-xs text-primary">{formatTime(event.startsAt)}</Text>
                  <View className="flex-1">
                    <Text className="font-inter-medium text-sm text-foreground" numberOfLines={1}>
                      {event.title}
                    </Text>
                    {event.company?.legalTitle ? (
                      <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>
                        {event.company.legalTitle}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
        </Enter>

        <Enter delay={240}>
        <ListRow
          title="Yaklaşan Etkinlikler"
          trailing={upcomingEvents.data ? `${upcomingEvents.data.length}` : undefined}
          onPress={() => go('/(tabs)/modules/calendar')}
        />
        </Enter>
      </ScrollView>
    </SafeAreaView>
  );
}
