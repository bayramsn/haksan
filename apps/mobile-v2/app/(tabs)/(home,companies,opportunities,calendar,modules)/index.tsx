import { ProfileButton } from '@/src/ui/ProfileButton';
import { HomeChatBubble } from '@/src/ui/HomeChatBubble';
import { Children, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LayoutAnimation, Platform, Pressable, RefreshControl, ScrollView, Text, UIManager, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboard } from '@/src/api/dashboard';
import { useCalendarEvents } from '@/src/api/calendar.hooks';
import { useCompletedPayments, monthlyTotalsByCurrency } from '@/src/api/finance.hooks';
import { useQuoteList, useQuoteSummary } from '@/src/api/crm.hooks';
import { useServiceTickets, useShipments } from '@/src/api/operations.hooks';
import { useStockSummary } from '@/src/api/inventory.hooks';
import { useUnreadCount } from '@/src/api/notifications.hooks';
import { useLeadSummary, useSalesAnalytics } from '@/src/api/sales.hooks';
import { useTaskCounts } from '@/src/api/tasks.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { useCanAccessModule, useCanOpenHref } from '@/src/modules/useModuleAccess';
import { useTheme } from '@/src/theme/theme';
import { formatAmount, formatCompact, formatDate, formatTime } from '@/src/lib/format';
import { Card, Chip, ErrorState, SCREEN_PAD } from '@/src/ui';
import { Tabs } from '@/src/ui/data';
import { Funnel, KpiCard, PanelCard, PanelRow } from '@/src/ui/dashboard';
import { GlassNavigationControl } from '@/src/ui/NavigationGlass';
import { Logo } from '@/src/ui/Logo';
import { Enter, Skeleton } from '@/src/ui/motion';
import { SyncStatus } from '@/src/ui/SyncStatus';
import {
  BarList,
  DashboardBriefing,
  DashboardTasksPanel,
  MonthlySalesChart,
  MyTargetsPanel,
  opportunitiesHref,
  QualificationPanel,
  RevenueChart,
  SalesPerformancePanel,
  SignalList,
  StageDistribution,
  TeamActivityPanel,
  WonLostChart,
} from '@/src/ui/sales/DashboardPanels';
import { briefingCounts, buildWorkSignals } from '@/src/ui/sales/dashboard-logic';
import { setOpportunityOrder } from '@/src/ui/sales/opportunity-order';
import {
  asQualification,
  departmentScores,
  dominantQuoteCurrency,
  monthlySales,
  outcomeOf,
  partyName,
  QUALIFICATION_LABELS,
  salesPerformance,
  totalsByCurrency,
} from '@/src/ui/sales/sales-logic';
import { STAGE_TONE } from '@/src/ui/sales/QualificationBoard';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';

const GAP = 12;
/** Rota birleşimi doğrudan `as Href` için fazla büyük (TS2590). */
const toHref = (path: string) => path as unknown as Href;
const DASHBOARD_HREF = toHref('/(tabs)/(home)');
type Section = 'bugun' | 'rapor';
type ReportPane = 'ozet' | 'grafikler' | 'hedefler';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** KPI ızgarası: dar telefonda 2 sütun, tablette 3 — özellik silinmez, sarılır. */
function KpiGrid({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const cols = width >= 720 ? 3 : 2;
  const cellWidth = Math.max(140, Math.floor((width - SCREEN_PAD * 2 - GAP * (cols - 1)) / cols));
  return (
    <View className="flex-row flex-wrap" style={{ gap: GAP }}>
      {Children.toArray(children).map((child, index) => (
        <View key={index} style={{ width: width < 360 ? '100%' : cellWidth, flexGrow: 1, maxWidth: width < 360 ? '100%' : undefined }}>
          {child}
        </View>
      ))}
    </View>
  );
}

function ReportSection({
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View className="overflow-hidden rounded-surface border border-border bg-card">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onToggle();
        }}
        className="min-h-[52px] flex-row items-center gap-2 px-3.5 py-3 active:opacity-80"
      >
        <View className="min-w-0 flex-1">
          <Text className="font-display-semibold text-[16px] text-foreground">{title}</Text>
          <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
            {hint}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </Pressable>
      {open ? <View className="gap-3 border-t border-border px-3 pb-3.5 pt-3">{children}</View> : null}
    </View>
  );
}

export default function DashboardScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const { user } = useAuth();
  const canOpen = useCanOpenHref();
  const canReadOpps = useCanAccessModule('opportunities');
  const canReadTasks = useCanAccessModule('tasks');
  const canReadService = useCanAccessModule('service-tickets');
  const [section, setSection] = useState<Section>('bugun');
  const [reportPane, setReportPane] = useState<ReportPane>('ozet');
  // Hedef uyarısı bildirimi `?section=rapor&pane=hedefler` ile gelir.
  const focusParams = useLocalSearchParams<{ section?: string; pane?: string }>();
  useEffect(() => {
    if (focusParams.section === 'rapor') setSection('rapor');
    if (focusParams.pane === 'ozet' || focusParams.pane === 'grafikler' || focusParams.pane === 'hedefler') setReportPane(focusParams.pane);
  }, [focusParams.section, focusParams.pane]);
  const [openReport, setOpenReport] = useState({ ozet: true, grafikler: true, hedefler: true });
  const { data, isPending, isRefetching, error, refetch } = useDashboard();
  const unreadNotifications = useUnreadCount();
  const homeHeader = <View style={{ paddingHorizontal: SCREEN_PAD, paddingTop: 4, paddingBottom: 8 }} className="flex-row items-center justify-between">
    <Logo width={120} />
    <View className="flex-row items-center gap-2">
      <GlassNavigationControl>
        <Pressable accessibilityRole="button" accessibilityLabel="Bildirimler" onPress={() => router.push('/notifications')}
          className="h-11 w-11 items-center justify-center active:opacity-60">
          <Ionicons name="notifications-outline" size={23} color={colors.foreground} />
          {unreadNotifications > 0 ? <View className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" /> : null}
        </Pressable>
      </GlassNavigationControl>
      <ProfileButton />
    </View>
  </View>;

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
  const yearFrom = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();
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
  const quoteList = useQuoteList(thisMonthRange, section === 'rapor');
  const shipmentList = useShipments('active');
  const stockSummary = useStockSummary();
  const todayEvents = useCalendarEvents(todayRange);
  const upcomingEvents = useCalendarEvents(upcomingRange);
  const analytics = useSalesAnalytics(canReadOpps);
  const leadSummary = useLeadSummary(canReadOpps);
  const taskCounts = useTaskCounts();
  const quotesAll = useQuoteSummary({ from: yearFrom });
  const quotesApproved = useQuoteSummary({ from: yearFrom, statusCode: 'approved' });
  const openTickets = useServiceTickets({ phase: 'open' }, canReadService && section === 'bugun');

  const rows = useMemo(() => analytics.data?.rows ?? [], [analytics.data]);
  const performance = useMemo(() => salesPerformance(rows), [rows]);
  const revenueCurrency = dominantQuoteCurrency(quotesApproved.data);
  const monthly = useMemo(
    () => monthlySales({ all: quotesAll.data, approved: quotesApproved.data, rows, months: 12, revenueCurrency }),
    [quotesAll.data, quotesApproved.data, rows, revenueCurrency]
  );
  const openRows = useMemo(() => rows.filter((row) => outcomeOf(row) === 'open'), [rows]);
  const wonTotal = useMemo(() => totalsByCurrency(rows.filter((row) => outcomeOf(row) === 'won'))[0] ?? null, [rows]);
  const openTotal = useMemo(() => totalsByCurrency(openRows)[0] ?? null, [openRows]);
  const openSalesCards = useMemo(
    () =>
      [...openRows]
        .sort((a, b) => (Date.parse(a.nextActionAt ?? '') || Infinity) - (Date.parse(b.nextActionAt ?? '') || Infinity))
        .slice(0, 6),
    [openRows]
  );

  const signals = useMemo(
    () =>
      buildWorkSignals({
        overdueTasks: canReadTasks ? taskCounts.data?.overdue ?? null : null,
        todayTasks: canReadTasks ? taskCounts.data?.today ?? null : null,
        lead: leadSummary.data ?? null,
        overdueReceivables: data?.overdueReceivables?.count ?? null,
        openServices: data?.openServices ?? null,
        delayedCards: analytics.data
          ? openRows.filter((row) => row.qualificationReadiness?.health?.rotting || row.qualificationReadiness?.health?.actionOverdue).length
          : null,
      }),
    [canReadTasks, taskCounts.data, leadSummary.data, data, analytics.data, openRows]
  );
  const counts = briefingCounts(signals);

  const salesTrendGroups = useMemo(
    () => monthlyTotalsByCurrency(completedPayments.data ?? [], 6, 'in').filter((group) => group.total > 0),
    [completedPayments.data]
  );
  const trend = salesTrendGroups[0];
  const trendMonths = trend?.months ?? [];
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

  const quotesThisMonth = quoteList.data ? quoteList.data.total : null;
  const activeShipments = shipmentList.data ? shipmentList.data.total : null;
  const stockCount = (code: string) => stockSummary.data?.find((row) => row.status === code)?.count ?? 0;
  const stockTotal = (stockSummary.data ?? []).reduce((sum, row) => sum + row.count, 0);
  const stockRisk = stockSummary.data ? stockCount('reserved') + stockCount('inactive') : null;
  const quoteConversion =
    quotesAll.data && quotesApproved.data && quotesAll.data.totalCount > 0
      ? Math.round((quotesApproved.data.totalCount / quotesAll.data.totalCount) * 100)
      : null;

  const go = (href: Href) => {
    if (!canOpen(href)) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(href);
  };
  const press = (href: Href) => (canOpen(href) ? () => go(href) : undefined);

  const refreshAll = () => {
    void refetch();
    void qc.invalidateQueries({ queryKey: ['opportunities'] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['reports'] });
    void qc.invalidateQueries({ queryKey: ['targets'] });
    void qc.invalidateQueries({ queryKey: ['quotes'] });
    void completedPayments.refetch();
    void shipmentList.refetch();
    void stockSummary.refetch();
    void todayEvents.refetch();
    void upcomingEvents.refetch();
  };

  if (isPending) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <SyncStatus />
        {homeHeader}
        <ScrollView contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingTop: 8, paddingBottom: 96 + GLASS_TAB_BAR_HEIGHT, gap: 14 }}>
          <Skeleton width={148} height={34} rounded={8} />
          <Skeleton height={130} rounded={16} />
          <View className="flex-row" style={{ gap: GAP }}>
            {Array.from({ length: 3 }, (_, i) => (
              <View key={i} className="flex-1">
                <Skeleton height={120} rounded={14} />
              </View>
            ))}
          </View>
          <Skeleton height={230} rounded={16} />
        </ScrollView>
        <HomeChatBubble />
      </SafeAreaView>
    );
  }
  if (error || !data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
        {homeHeader}
        <ErrorState message={error?.message ?? 'Panel yüklenemedi.'} onRetry={() => void refetch()} />
        <HomeChatBubble />
      </SafeAreaView>
    );
  }

  const num = (v: number | null) => (v === null ? '—' : String(v));
  const money = (total: { currency: string; total: number } | null) => (total ? `${formatCompact(total.total)} ${total.currency}` : '—');
  const overdueValue = data.overdueReceivables
    ? data.overdueReceivables.byCurrency.map((row) => `${formatCompact(row.amount)} ${row.currencyCode}`).join(' · ') || '0'
    : '—';

  const topStage = data.stages[0];
  const bottomStage = data.stages[data.stages.length - 1];
  const conversionRate = topStage && bottomStage && topStage.value > 0 ? Math.round((bottomStage.value / topStage.value) * 100) : null;
  const FUNNEL_ROWS = 5;
  const restTotal = data.stages.slice(FUNNEL_ROWS).reduce((sum, s) => sum + s.value, 0);
  const funnelStages =
    data.stages.length > FUNNEL_ROWS ? [...data.stages.slice(0, FUNNEL_ROWS), { code: '', label: 'Diğer', value: restTotal }] : data.stages;

  const radar = departmentScores({
    openOpportunities: data.openOpportunities ?? 0,
    totalOpportunities: analytics.data?.total ?? 0,
    approvedQuotes: quotesApproved.data?.totalCount ?? 0,
    totalQuotes: quotesAll.data?.totalCount ?? 0,
    overdueReceivables: data.overdueReceivables?.count ?? 0,
    totalReceivables: data.receivableTotal ?? 0,
    openServices: data.openServices ?? 0,
    totalServices: data.serviceTotal ?? 0,
    availableStock: stockCount('available'),
    totalStock: stockTotal,
  });
  const radarHref: Record<string, Href> = {
    Satış: toHref(String(opportunitiesHref({ focus: 'open' }))),
    Teklif: toHref('/modules/quotes'),
    Tahsilat: toHref('/modules/receivables'),
    Servis: toHref('/modules/service-tickets'),
    Stok: toHref('/modules/inventory'),
  };
  const radarHrefFor = (label: string): Href => {
    const href = radarHref[label];
    if (href) return href;
    return DASHBOARD_HREF;
  };

  const openCard = (id: string) => {
    setOpportunityOrder(openSalesCards.map((row) => row.id));
    go(toHref(`/modules/opportunities/${id}`));
  };

  const toggleReport = (key: keyof typeof openReport) => setOpenReport((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      {homeHeader}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingTop: 4, paddingBottom: 96 + GLASS_TAB_BAR_HEIGHT, gap: 14 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching || completedPayments.isRefetching || analytics.isRefetching}
            onRefresh={refreshAll}
            tintColor={colors.mutedForeground}
          />
        }
      >
        <Text accessibilityRole="header" className="font-display-semibold text-[24px] leading-[28px] text-foreground" style={{ marginTop: -6 }}>
          Ana Sayfa
        </Text>

        <Tabs<Section>
          tabs={[
            { value: 'bugun', label: 'Bugün', icon: 'today-outline', badge: counts.total || undefined },
            { value: 'rapor', label: 'Rapor', icon: 'stats-chart-outline' },
          ]}
          value={section}
          onChange={setSection}
        />

        {section === 'bugun' ? (
          <>
            <DashboardBriefing
              firstName={user?.fullName?.split(' ')[0] ?? 'ekip'}
              counts={counts}
              onToday={press('/calendar')}
              onOverdue={press(toHref('/modules/receivables'))}
            />

            <View className="flex-row flex-wrap gap-2">
              {([
                { label: 'İşlerim', icon: 'checkbox-outline', href: '/modules/tasks' },
                { label: 'Takvim', icon: 'calendar-outline', href: '/calendar' },
                { label: 'Teklifler', icon: 'document-text-outline', href: '/modules/quotes' },
              ] as const).filter((item) => canOpen(toHref(item.href))).map((item) => (
                <Pressable key={item.label} accessibilityRole="button" onPress={() => go(toHref(item.href))}
                  className="min-h-12 flex-row items-center justify-center gap-2 rounded-control border border-border bg-card px-4 active:opacity-70">
                  <Ionicons name={item.icon} size={18} color={colors.primary} />
                  <Text className="font-inter-medium text-[13px] text-foreground">{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <SignalList
              title="Öncelikli İşler"
              hint="Geciken ve yakın takip gerektiren kayıtlar"
              signals={signals}
              limit={5}
              empty="Takip gerektiren öncelikli kayıt yok."
            />
            <DashboardTasksPanel compact />
            <Enter>
              <KpiGrid>
                <KpiCard icon="alert-circle-outline" label="Geciken ödeme" value={overdueValue} onPress={press(toHref('/modules/receivables'))} />
                <KpiCard icon="construct-outline" label="Açık servis" value={num(data.openServices)} onPress={press(toHref('/modules/service-tickets'))} />
                <KpiCard icon="calendar-outline" label="Bugünkü etkinlik" value={todayEvents.data ? String(todayEvents.data.length) : '—'} onPress={press('/calendar')} />
                <KpiCard icon="briefcase-outline" label="Açık fırsat" value={money(openTotal)} onPress={press(opportunitiesHref({ focus: 'open' }))} />
              </KpiGrid>
            </Enter>

            {canReadOpps ? (
              <Card className="gap-2">
                <Text accessibilityRole="header" className="font-display-semibold text-[17px] text-foreground">
                  Açık Satış Kartları
                </Text>
                <Text className="font-inter text-[12px] text-muted-foreground">Sıradaki aksiyon tarihine göre</Text>
                {analytics.isPending ? null : openSalesCards.length === 0 ? (
                  <Text className="font-inter text-[13px] text-muted-foreground">Açık satış kartı yok</Text>
                ) : (
                  openSalesCards.map((row) => {
                    const stage = asQualification(row.qualificationStage);
                    return (
                      <Pressable
                        key={row.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${partyName(row)} fırsat detayını aç`}
                        onPress={() => openCard(row.id)}
                        className="min-h-[52px] flex-row items-center gap-2 border-t border-border py-2 active:opacity-70"
                      >
                        <View className="min-w-0 flex-1">
                          <Text className="font-inter-semibold text-[14px] text-foreground" numberOfLines={1}>
                            {partyName(row)}
                          </Text>
                          <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
                            {row.nextAction ? `${row.nextAction}${row.nextActionAt ? ` · ${formatDate(row.nextActionAt)}` : ''}` : 'Sonraki aktivite planlanmamış'}
                          </Text>
                        </View>
                        <View className="items-end gap-1">
                          <Chip tone={STAGE_TONE[stage]} label={QUALIFICATION_LABELS[stage]} />
                          {Number(row.estimatedValue ?? 0) ? (
                            <Text className="font-inter-semibold text-[12px] text-primary">{formatAmount(row.estimatedValue, row.currency?.code ?? 'TRY')}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </Card>
            ) : null}

            {canReadService ? (
              <Card className="gap-2">
                <Text accessibilityRole="header" className="font-display-semibold text-[17px] text-foreground">
                  Açık Servis Talepleri
                </Text>
                {openTickets.isPending ? null : openTickets.error ? (
                  <ErrorState message={openTickets.error.message} onRetry={() => void openTickets.refetch()} />
                ) : (openTickets.data?.items ?? []).length === 0 ? (
                  <Text className="font-inter text-[13px] text-muted-foreground">Açık servis talebi yok</Text>
                ) : (
                  (openTickets.data?.items ?? []).slice(0, 6).map((ticket) => (
                    <Pressable
                      key={ticket.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${ticket.ticketNo} ${ticket.subject}`}
                      onPress={press(toHref(`/modules/service-tickets/${ticket.id}`))}
                      className="min-h-[52px] flex-row items-center gap-2 border-t border-border py-2 active:opacity-70"
                    >
                      <View className="min-w-0 flex-1">
                        <Text className="font-inter-semibold text-[14px] text-foreground" numberOfLines={1}>
                          {ticket.subject}
                        </Text>
                        <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
                          {`${ticket.ticketNo} · ${ticket.company?.shortName ?? ticket.company?.legalTitle ?? 'Firma yok'} · ${formatDate(ticket.reportedAt)}`}
                        </Text>
                      </View>
                      {ticket.status ? <Chip tone={ticket.severity === 'critical' || ticket.severity === 'high' ? 'destructive' : 'neutral'} label={ticket.status.name} /> : null}
                    </Pressable>
                  ))
                )}
              </Card>
            ) : null}

            <View className={wide ? 'flex-row items-stretch' : 'gap-3'} style={wide ? { gap: GAP } : undefined}>
              <PanelCard title="Üretim & Stok" onMore={press('/modules/inventory')}>
                <PanelRow icon="cube-outline" label="Stokta" value={stockSummary.data ? String(stockCount('available')) : '—'} onPress={press('/modules/inventory')} />
                <PanelRow
                  icon="lock-closed-outline"
                  label="Rezerve"
                  value={stockSummary.data ? String(stockCount('reserved')) : '—'}
                  valueTone="primary"
                  onPress={press('/modules/inventory')}
                />
                <PanelRow icon="car-outline" label="Sevkiyatta" value={stockSummary.data ? String(stockCount('in_transit')) : '—'} onPress={press('/modules/inventory')} />
              </PanelCard>

              <PanelCard title="Bugünkü Etkinlikler" onMore={press('/modules/calendar')}>
                {todayEvents.isPending ? null : (todayEvents.data ?? []).length === 0 ? (
                  <Text className="py-4 text-center font-inter text-[12px] text-muted-foreground">Bugün planlanmış etkinlik yok.</Text>
                ) : (
                  (todayEvents.data ?? []).slice(0, 4).map((event, index) => (
                    <View key={event.id} className="flex-row items-center gap-2 py-2">
                      <Ionicons name="calendar-outline" size={15} color={index === 0 ? colors.primary : colors.mutedForeground} />
                      <Text className="flex-1 font-inter text-[12px] text-foreground" numberOfLines={1}>
                        {event.title}
                      </Text>
                      <Text className="font-inter-semibold text-[12px]" style={{ color: index === 0 ? colors.primary : colors.mutedForeground }}>
                        {formatTime(event.startsAt)}
                      </Text>
                    </View>
                  ))
                )}
              </PanelCard>
            </View>

            <PanelCard title="Yaklaşan Etkinlikler" onMore={press('/modules/calendar')}>
              {(upcomingEvents.data ?? []).length === 0 ? (
                <Text className="font-inter text-[12px] text-muted-foreground">Önümüzdeki 14 günde etkinlik yok.</Text>
              ) : (
                (upcomingEvents.data ?? []).slice(0, 3).map((event) => (
                  <Pressable
                    key={event.id}
                    accessibilityRole="button"
                    accessibilityLabel={event.title}
                    onPress={press('/modules/calendar')}
                    className="min-h-[44px] flex-row items-center gap-2.5 py-2 active:opacity-70"
                  >
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.primary }} />
                    <Text className="font-inter-medium text-[13px]" style={{ color: colors.primary }} numberOfLines={1}>
                      {new Date(event.startsAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                    </Text>
                    <Text className="flex-1 font-inter text-[13px] text-foreground" numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text className="font-inter text-[13px] text-muted-foreground">{formatTime(event.startsAt)}</Text>
                  </Pressable>
                ))
              )}
            </PanelCard>
          </>
        ) : null}

        {section === 'rapor' ? (
          <>
            <Tabs<ReportPane>
              tabs={[
                { value: 'ozet', label: 'Özet', icon: 'grid-outline' },
                { value: 'grafikler', label: 'Grafikler', icon: 'stats-chart-outline' },
                { value: 'hedefler', label: 'Hedefler', icon: 'flag-outline' },
              ]}
              value={reportPane}
              onChange={setReportPane}
            />

            {reportPane === 'ozet' ? (
              <ReportSection title="KPI Özeti" hint="Müşteri, ciro, teklif ve operasyon" open={openReport.ozet} onToggle={() => toggleReport('ozet')}>
                <KpiGrid>
                  <KpiCard icon="people-outline" label="Aktif Müşteri" value={num(data.activeCustomers)} onPress={press('/modules/companies')} />
                  <KpiCard icon="wallet-outline" label="Kazanılan ciro" value={money(wonTotal)} onPress={press(opportunitiesHref({ focus: 'won' }))} />
                  <KpiCard icon="briefcase-outline" label="Fırsat (açık)" value={money(openTotal)} onPress={press(opportunitiesHref({ focus: 'open' }))} />
                  <KpiCard icon="alert-circle-outline" label="Geciken ödeme" value={overdueValue} onPress={press(toHref('/modules/receivables'))} />
                  <KpiCard icon="construct-outline" label="Açık servis" value={num(data.openServices)} onPress={press(toHref('/modules/service-tickets'))} />
                  <KpiCard icon="hardware-chip-outline" label="Aktif Makine" value={num(data.activeMachines)} onPress={press(toHref('/modules/customer-devices'))} />
                  <KpiCard icon="document-text-outline" label="Bu Ay Teklifler" value={num(quotesThisMonth)} onPress={press('/modules/quotes')} />
                  <KpiCard
                    icon="cash-outline"
                    label="Tahsilat"
                    value={collectionsThisMonth ?? '—'}
                    delta={collectionsDelta}
                    deltaNote={collectionsDelta ? '(Geçen aya göre)' : undefined}
                    onPress={press('/modules/payments')}
                  />
                  <KpiCard icon="car-outline" label="Sevkiyat" value={num(activeShipments)} onPress={press('/modules/shipments')} />
                </KpiGrid>

                {canReadOpps ? (
                  analytics.error ? (
                    <ErrorState message={analytics.error.message} onRetry={() => void analytics.refetch()} />
                  ) : (
                    <>
                      <SalesPerformancePanel performance={performance} truncated={analytics.data?.truncated ?? false} />
                      <QualificationPanel rows={rows} />
                    </>
                  )
                ) : null}

                <DashboardTasksPanel />
                <TeamActivityPanel />

                <View className={wide ? 'flex-row items-stretch' : 'gap-3'} style={wide ? { gap: GAP } : undefined}>
                  <PanelCard title="Satış Trendi" hint={trend ? '(Son 6 Ay)' : undefined} onMore={() => setReportPane('grafikler')}>
                    {trend ? (
                      <View className="gap-1.5">
                        <View className="flex-row items-center gap-1.5">
                          <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.primary }} />
                          <Text className="font-inter text-[11px] text-muted-foreground">Tahsilat ({trend.currencyCode})</Text>
                        </View>
                        <LineChart
                          data={trendMonths.map((b) => ({ value: b.total, label: b.label }))}
                          areaChart
                          curved
                          width={wide ? 112 : Math.min(220, width - 96)}
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
                      <Text className="py-6 text-center font-inter text-[12px] text-muted-foreground">Son 6 ayda tahsilat kaydı yok.</Text>
                    )}
                  </PanelCard>

                  <PanelCard title="Fırsat Aşama Özeti" onMore={press('/modules/opportunities')}>
                    {data.stages.length > 0 ? (
                      <View className="gap-2.5">
                        <View className="flex-row items-center gap-2.5">
                          <Funnel steps={funnelStages.map((s) => s.value)} width={46} height={22 * funnelStages.length} />
                          <View className="flex-1">
                            {funnelStages.map((stage) => (
                              <View key={stage.label} className="h-[22px] flex-row items-center justify-between gap-1">
                                <Text className="flex-1 font-inter text-[12px] text-foreground" numberOfLines={1}>
                                  {stage.label}
                                </Text>
                                <Text className="font-inter-semibold text-[13px] text-foreground" style={{ fontVariant: ['tabular-nums'] }}>
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
                      <Text className="py-6 text-center font-inter text-[12px] text-muted-foreground">Açık fırsat yok.</Text>
                    )}
                  </PanelCard>
                </View>
              </ReportSection>
            ) : null}

            {reportPane === 'grafikler' ? (
              <ReportSection title="Grafikler & Huniler" hint="Aylık satış, aşama ve departman" open={openReport.grafikler} onToggle={() => toggleReport('grafikler')}>
                <KpiGrid>
                  <KpiCard icon="document-text-outline" label="Teklif dönüşümü" value={quoteConversion == null ? '—' : `%${quoteConversion}`} onPress={press('/modules/quotes')} />
                  <KpiCard icon="construct-outline" label="Açık servis" value={num(data.openServices)} onPress={press(toHref('/modules/service-tickets'))} />
                  <KpiCard icon="cube-outline" label="Stok riski" value={num(stockRisk)} onPress={press('/modules/inventory')} />
                  <KpiCard icon="car-outline" label="Bekleyen sevkiyat" value={num(activeShipments)} onPress={press('/modules/shipments')} />
                  <KpiCard icon="hardware-chip-outline" label="Aktif Makine" value={num(data.activeMachines)} onPress={press(toHref('/modules/customer-devices'))} />
                </KpiGrid>
                <MonthlySalesChart buckets={monthly} title="Aylık Satış Performansı" hint="Teklif vs kazanılan (onaylanan teklif)" />
                <StageDistribution stages={data.stages} />
                <BarList
                  title="Satış Hunisi"
                  hint="Operasyon aşamalarına göre açık kart · satıra dokunun"
                  rows={data.stages.map((stage) => ({
                    key: stage.code,
                    label: stage.label,
                    value: stage.value,
                    href: opportunitiesHref({ stageCode: stage.code, stageName: stage.label }),
                  }))}
                />
                <BarList
                  title="Departman Performansı"
                  hint="KPI · 0–100 endeks · ölçülemeyen eksen “—”"
                  max={100}
                  rows={radar.map((axis) => ({ key: axis.label, label: axis.label, value: axis.value, href: radarHrefFor(axis.label) }))}
                />
                <RevenueChart buckets={monthly} currency={revenueCurrency} />
                <WonLostChart buckets={monthly} />
              </ReportSection>
            ) : null}

            {reportPane === 'hedefler' ? (
              <ReportSection title="Hedefler" hint="Kişisel ve ekip hedefleri" open={openReport.hedefler} onToggle={() => toggleReport('hedefler')}>
                <MyTargetsPanel />
              </ReportSection>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <HomeChatBubble />
    </SafeAreaView>
  );
}
