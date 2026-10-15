import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import * as Haptics from 'expo-haptics';
import { useDashboard } from '@/src/api/dashboard';
import { useCalendarEvents } from '@/src/api/calendar.hooks';
import { useCompletedPayments, monthlyTotalsByCurrency } from '@/src/api/finance.hooks';
import { useQuoteList } from '@/src/api/crm.hooks';
import { useShipments } from '@/src/api/operations.hooks';
import { useStockSummary } from '@/src/api/inventory.hooks';
import { useUnreadCount } from '@/src/api/notifications.hooks';
import { useTheme } from '@/src/theme/theme';
import { formatCompact, formatTime } from '@/src/lib/format';
import { ErrorState, SCREEN_PAD } from '@/src/ui';
import { Funnel, KpiCard, PanelCard, PanelRow } from '@/src/ui/dashboard';
import { Logo } from '@/src/ui/Logo';
import { Enter, Skeleton } from '@/src/ui/motion';
import { SyncStatus } from '@/src/ui/SyncStatus';

const GAP = 10;

export default function DashboardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data, isPending, isRefetching, error, refetch } = useDashboard();
  const unreadNotifications = useUnreadCount();

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
  const stockSummary = useStockSummary();
  const todayEvents = useCalendarEvents(todayRange);
  const upcomingEvents = useCalendarEvents(upcomingRange);

  const salesTrendGroups = useMemo(
    () => monthlyTotalsByCurrency(completedPayments.data ?? [], 6, 'in').filter((group) => group.total > 0),
    [completedPayments.data]
  );
  const trend = salesTrendGroups[0];
  const trendMonths = trend?.months ?? [];

  // Mockup KPI'larında "(Geçen aya göre)" değişimi var. Sunucuda önceki dönem
  // ucu yok; yalnız tahsilatta 6 aylık seri elimizde olduğu için bu KPI'nın
  // değişimi GERÇEKTEN hesaplanabiliyor. Diğer üçünde satır hiç çizilmiyor —
  // uydurulmuş bir yüzde göstermektense eksik göstermek doğru.
  const collectionsDelta = useMemo(() => {
    if (trendMonths.length < 2) return undefined;
    const current = trendMonths[trendMonths.length - 1]?.total ?? 0;
    const previous = trendMonths[trendMonths.length - 2]?.total ?? 0;
    if (previous <= 0) return undefined;
    return { percent: Math.round(((current - previous) / previous) * 100) };
  }, [trendMonths]);

  const collectionsThisMonth = completedPayments.data
    ? salesTrendGroups
        .map((group) => `${formatCompact(group.months[group.months.length - 1]?.total ?? 0)} ${group.currencyCode}`)
        .join(' · ') || '0'
    : null;

  // Her iki KPI da sunucuda tüm filtrelenmiş veri kümesinin `meta.total` değeridir;
  // ilk 50 satırın istemcide sayılmasıyla eksik sonuç üretmez.
  const quotesThisMonth = quoteList.data ? quoteList.data.total : null;
  const activeShipments = shipmentList.data ? shipmentList.data.total : null;

  const stockCount = (code: string) =>
    stockSummary.data ? String(stockSummary.data.find((row) => row.status === code)?.count ?? 0) : '—';

  const go = (href: Href) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(href);
  };

  // Çark yerine içerik şekli: açılışta panelin iskeleti görünür.
  if (isPending) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <SyncStatus />
        <ScrollView contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingTop: 8, paddingBottom: 32, gap: 14 }}>
          <Skeleton width={148} height={34} rounded={8} />
          <Skeleton width="55%" height={26} rounded={8} />
          <View className="flex-row" style={{ gap: GAP }}>
            {Array.from({ length: 4 }, (_, i) => (
              <View key={i} className="flex-1">
                <Skeleton height={120} rounded={14} />
              </View>
            ))}
          </View>
          <View className="flex-row" style={{ gap: GAP }}>
            <View className="flex-1">
              <Skeleton height={230} rounded={16} />
            </View>
            <View className="flex-1">
              <Skeleton height={230} rounded={16} />
            </View>
          </View>
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

  // Fırsat Aşama Özeti: huni tepe = %100 referans; dönüşüm oranı en üst ile en
  // olgun açık aşama arasındaki oran (win/lost bu uçta hiç dönmüyor — kapanan
  // fırsatlar panodan düşüyor, bkz. reports.service.ts).
  const topStage = data.stages[0];
  const bottomStage = data.stages[data.stages.length - 1];
  const conversionRate =
    topStage && bottomStage && topStage.value > 0 ? Math.round((bottomStage.value / topStage.value) * 100) : null;

  // Mockup hunisi 5 kademe; gerçek pipeline'da 15 aşama var ve hepsi çizilince
  // kart ekranı boydan boya kaplıyor. İlk 5 aşama ayrı ayrı, kalanlar tek
  // "Diğer" satırında toplanıyor — hiçbir fırsat sayımı düşmüyor.
  const FUNNEL_ROWS = 5;
  const restTotal = data.stages.slice(FUNNEL_ROWS).reduce((sum, s) => sum + s.value, 0);
  const funnelStages =
    data.stages.length > FUNNEL_ROWS
      ? [...data.stages.slice(0, FUNNEL_ROWS), { label: 'Diğer', value: restTotal }]
      : data.stages;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingTop: 4, paddingBottom: 32, gap: 14 }}
        refreshControl={
          <RefreshControl
            refreshing={
              isRefetching || completedPayments.isRefetching || quoteList.isRefetching || shipmentList.isRefetching
            }
            onRefresh={() => {
              void refetch();
              void completedPayments.refetch();
              void quoteList.refetch();
              void shipmentList.refetch();
              void stockSummary.refetch();
              void todayEvents.refetch();
              void upcomingEvents.refetch();
            }}
            tintColor={colors.mutedForeground}
          />
        }
      >
        {/* Mockup başlığı: solda marka, sağda bildirim zili, altında koyu başlık. */}
        <View className="h-11 flex-row items-center justify-between">
          <Logo width={168} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bildirimler"
            hitSlop={8}
            onPress={() => go('/(tabs)/notifications')}
            className="h-11 w-11 items-center justify-center active:opacity-60"
          >
            <Ionicons name="notifications-outline" size={23} color={colors.foreground} />
            {unreadNotifications > 0 ? (
              <View className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
            ) : null}
          </Pressable>
        </View>

        <Text
          accessibilityRole="header"
          className="font-inter-bold text-[22px] leading-[27px] text-foreground"
          style={{ letterSpacing: 0, marginTop: -6 }}
        >
          Gösterge Paneli
        </Text>

        <Enter>
          <View className="flex-row" style={{ gap: GAP }}>
            <KpiCard
              icon="disc-outline"
              label="Açık Fırsatlar"
              value={num(data.openOpportunities)}
              onPress={() => go('/(tabs)/modules/opportunities')}
            />
            <KpiCard
              icon="document-text-outline"
              label="Bu Ay Teklifler"
              value={num(quotesThisMonth)}
              onPress={() => go('/(tabs)/modules/quotes')}
            />
            <KpiCard
              icon="wallet-outline"
              label="Tahsilat"
              value={collectionsThisMonth ?? '—'}
              delta={collectionsDelta}
              deltaNote={collectionsDelta ? '(Geçen aya göre)' : undefined}
              onPress={() => go('/(tabs)/modules/payments')}
            />
            <KpiCard
              icon="car-outline"
              label="Sevkiyat"
              value={num(activeShipments)}
              onPress={() => go('/(tabs)/modules/shipments')}
            />
          </View>
        </Enter>

        <Enter delay={70}>
          <View className="flex-row items-stretch" style={{ gap: GAP }}>
            <PanelCard
              title="Satış Trendi"
              hint={trend ? `(Son 6 Ay)` : undefined}
              onMore={() => go('/(tabs)/modules/reports')}
            >
              {trend ? (
                <View className="gap-1.5">
                  <View className="flex-row items-center gap-1.5">
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.primary }} />
                    <Text className="font-inter text-[11px] text-muted-foreground">Gelir ({trend.currencyCode})</Text>
                  </View>
                  <LineChart
                    data={trendMonths.map((b) => ({ value: b.total, label: b.label }))}
                    areaChart
                    curved
                    width={112}
                    height={110}
                    initialSpacing={8}
                    spacing={20}
                    color={colors.chart1}
                    startFillColor={colors.chart1}
                    endFillColor={colors.chart1}
                    startOpacity={0.25}
                    endOpacity={0.02}
                    thickness={2}
                    dataPointsRadius={3}
                    dataPointsColor={colors.chart1}
                    noOfSections={4}
                    yAxisTextStyle={{ color: colors.chartAxis, fontSize: 8 }}
                    xAxisLabelTextStyle={{ color: colors.chartAxis, fontSize: 8 }}
                    yAxisLabelWidth={30}
                    yAxisColor={colors.chartGrid}
                    xAxisColor={colors.chartGrid}
                    isAnimated
                  />
                </View>
              ) : (
                <Text className="py-6 text-center font-inter text-[12px] text-muted-foreground">
                  Son 6 ayda tahsilat kaydı yok.
                </Text>
              )}
            </PanelCard>

            <PanelCard title="Fırsat Aşama Özeti" onMore={() => go('/(tabs)/modules/opportunities')}>
              {data.stages.length > 0 ? (
                <View className="gap-2.5">
                  <View className="flex-row items-center gap-2.5">
                    <Funnel steps={funnelStages.map((s) => s.value)} width={46} height={22 * funnelStages.length} />
                    <View className="flex-1 gap-0">
                      {funnelStages.map((stage) => (
                        <View key={stage.label} className="h-[22px] flex-row items-center justify-between gap-1">
                          <Text className="flex-1 font-inter text-[12px] text-foreground" numberOfLines={1}>
                            {stage.label}
                          </Text>
                          <Text
                            className="font-inter-semibold text-[13px] text-foreground"
                            style={{ fontVariant: ['tabular-nums'] }}
                          >
                            {stage.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  {conversionRate !== null ? (
                    <View className="border-t border-border pt-2">
                      <Text className="font-inter text-[12px] text-foreground">Dönüşüm Oranı</Text>
                      <Text className="font-inter-bold text-[20px]" style={{ color: colors.primary }}>
                        %{conversionRate}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <Text className="py-6 text-center font-inter text-[12px] text-muted-foreground">
                  Açık fırsat yok.
                </Text>
              )}
            </PanelCard>
          </View>
        </Enter>

        <Enter delay={110}>
          <View className="flex-row items-stretch" style={{ gap: GAP }}>
            {/* Mockup'ta bu kartın satırları "Üretimdeki Sipariş / Kritik Stok
                Uyarısı / Stok Değeri". Sunucuda üçünün de karşılığı yok:
                /reports/stock-summary yalnız duruma göre ADET dönüyor, minimum
                stok eşiği ve kalem fiyatı hiç dönmüyor. Uydurulmuş sayı yerine
                aynı uçtan gelen gerçek sayımlar gösteriliyor. */}
            <PanelCard title="Üretim & Stok Durumu" onMore={() => go('/(tabs)/modules/inventory')}>
              <PanelRow
                icon="cube-outline"
                label="Stokta"
                value={stockCount('available')}
                onPress={() => go('/(tabs)/modules/inventory')}
              />
              <PanelRow
                icon="lock-closed-outline"
                label="Rezerve"
                value={stockCount('reserved')}
                valueTone="primary"
                onPress={() => go('/(tabs)/modules/inventory')}
              />
              <PanelRow
                icon="car-outline"
                label="Sevkiyatta"
                value={stockCount('in_transit')}
                onPress={() => go('/(tabs)/modules/inventory')}
              />
            </PanelCard>

            <PanelCard title="Bugünkü Görevler" onMore={() => go('/(tabs)/modules/calendar')}>
              {todayEvents.isPending ? null : (todayEvents.data ?? []).length === 0 ? (
                <Text className="py-6 text-center font-inter text-[12px] text-muted-foreground">
                  Bugün için planlanmış etkinlik yok.
                </Text>
              ) : (
                (todayEvents.data ?? []).slice(0, 4).map((event, index) => (
                  <View key={event.id} className="flex-row items-center gap-2 py-2">
                    <Ionicons
                      name="calendar-outline"
                      size={15}
                      color={index === 0 ? colors.primary : colors.mutedForeground}
                    />
                    <Text className="flex-1 font-inter text-[12px] text-foreground" numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text
                      className="font-inter-semibold text-[12px]"
                      style={{ color: index === 0 ? colors.primary : colors.mutedForeground }}
                    >
                      {formatTime(event.startsAt)}
                    </Text>
                  </View>
                ))
              )}
            </PanelCard>
          </View>
        </Enter>

        <Enter delay={150}>
          <PanelCard title="Yaklaşan Etkinlikler" onMore={() => go('/(tabs)/modules/calendar')}>
            {(upcomingEvents.data ?? []).length === 0 ? (
              <Text className="font-inter text-[12px] text-muted-foreground">Önümüzdeki 14 günde etkinlik yok.</Text>
            ) : (
              (upcomingEvents.data ?? []).slice(0, 3).map((event) => (
                <Pressable
                  key={event.id}
                  accessibilityRole="button"
                  accessibilityLabel={event.title}
                  onPress={() => go('/(tabs)/modules/calendar')}
                  className="flex-row items-center gap-2.5 py-2 active:opacity-70"
                >
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.primary }} />
                  <Text className="font-inter-medium text-[13px]" style={{ color: colors.primary }} numberOfLines={1}>
                    {new Date(event.startsAt).toLocaleDateString('tr-TR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      weekday: 'long',
                    })}
                  </Text>
                  <Text className="flex-1 font-inter text-[13px] text-foreground" numberOfLines={1}>
                    {event.title}
                  </Text>
                  <Text className="font-inter text-[13px] text-muted-foreground">{formatTime(event.startsAt)}</Text>
                </Pressable>
              ))
            )}
          </PanelCard>
        </Enter>
      </ScrollView>
    </SafeAreaView>
  );
}
