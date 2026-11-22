import { ScopeSummary } from '@/src/ui/ScopeSummary';
import { ProfileButton } from '@/src/ui/ProfileButton';
import { HomeChatBubble } from '@/src/ui/HomeChatBubble';
import { Children, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LayoutAnimation, Platform, Pressable, RefreshControl, ScrollView, Text, UIManager, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboard } from '@/src/api/dashboard';
import { useCalendarEvents } from '@/src/api/calendar.hooks';
import { useCompletedPayments } from '@/src/api/finance.hooks';
import { useQuoteList, useQuoteSummary } from '@/src/api/crm.hooks';
import { useServiceTickets, useShipments } from '@/src/api/operations.hooks';
import { useStockSummary } from '@/src/api/inventory.hooks';
import { useUnreadCount } from '@/src/api/notifications.hooks';
import { useLeadSummary, useSalesAnalytics } from '@/src/api/sales.hooks';
import { useTaskCounts } from '@/src/api/tasks.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { useCanAccessModule, useCanOpenHref } from '@/src/modules/useModuleAccess';
import { useTheme } from '@/src/theme/theme';
import { formatAmount, formatCompact, formatDate, formatTime } from '@/src/lib/format';
import { Card, Chip, ErrorState, SCREEN_PAD } from '@/src/ui';
import { Tabs } from '@/src/ui/data';
import { KpiCard, PanelCard, PanelRow } from '@/src/ui/dashboard';
import { GlassNavigationControl } from '@/src/ui/NavigationGlass';
import { Logo } from '@/src/ui/Logo';
import { Skeleton } from '@/src/ui/motion';
import { SyncStatus } from '@/src/ui/SyncStatus';
import {
  BarList,
  buildMobileManagementInsights,
  DashboardTasksPanel,
  ManagementOpsSummary,
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
  hint = '',
  open,
  onToggle,
  children,
}: {
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View className="overflow-hidden rounded-surface bg-card" style={{ borderCurve: 'continuous' }}>
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
          <Text className="font-inter-semibold text-[16px] text-foreground">{title}</Text>
          {hint ? (
            <Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>
              {hint}
            </Text>
          ) : null}
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
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 720;
  const { user } = useAuth();
  const canOpen = useCanOpenHref();
  const canReadOpps = useCanAccessModule('opportunities');
  const canReadTasks = useCanAccessModule('tasks');
  const canReadService = useCanAccessModule('service-tickets');
  const canReadQuotes = useCanAccessModule('quotes');
  const canCreateOpportunity = useCan('opportunities.create');
  const canCreateQuote = useCan('quotes.create');
  const canCreateTask = useCan('tasks.create');
  const canCreateActivity = useCan('activities.create');
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [section, setSection] = useState<Section>('bugun');
  const [reportPane, setReportPane] = useState<ReportPane>('ozet');
  // Hedef uyarısı bildirimi `?section=rapor&pane=hedefler` ile gelir.
  const focusParams = useLocalSearchParams<{ section?: string; pane?: string }>();
  useEffect(() => {
    if (focusParams.section === 'rapor') setSection('rapor');
    if (focusParams.pane === 'ozet' || focusParams.pane === 'grafikler' || focusParams.pane === 'hedefler') setReportPane(focusParams.pane);
  }, [focusParams.section, focusParams.pane]);
  // Mobilde rapor bölümleri kapalı başlar; kullanıcı açar (dağınıklık azaltma).
  const [openReport, setOpenReport] = useState({ ozet: false, grafikler: false, hedefler: false });
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
  const quoteList = useQuoteList(thisMonthRange, canReadQuotes);
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
  const agenda = useMemo(() => [...(todayEvents.data ?? []), ...(upcomingEvents.data ?? [])]
    .filter(event => !event.completedAt)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 4), [todayEvents.data, upcomingEvents.data]);
  const quickActions = [
    { label: 'Fırsat', icon: 'add-circle-outline' as const, href: '/modal/new-opportunity', module: '/modules/opportunities', allowed: canCreateOpportunity },
    { label: 'Teklif', icon: 'document-text-outline' as const, href: '/modal/quote-form', module: '/modules/quotes', allowed: canCreateQuote },
    { label: 'Görev', icon: 'checkbox-outline' as const, href: '/modal/task', module: '/modules/tasks', allowed: canCreateTask },
    { label: 'Görüşme', icon: 'chatbubble-ellipses-outline' as const, href: '/modal/activity', module: '/modules/activities', allowed: canCreateActivity },
  ].filter(item => item.allowed && canOpen(toHref(item.module)));

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
      <View className="px-4"><ScopeSummary /></View>
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
      <View className="px-4"><ScopeSummary /></View>
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
      <View className="px-4"><ScopeSummary /></View>
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
        <View className="gap-1 pb-1">
          <Text className="font-inter text-[12px] text-muted-foreground">{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          <Text accessibilityRole="header" className="font-inter-semibold text-[24px] leading-[32px] text-foreground">{section === 'bugun' ? `Merhaba, ${user?.fullName?.split(' ')[0] || 'ekip'}` : 'Raporlar'}</Text>
          {section === 'bugun' && counts.total ? <Text className="font-inter text-[14px] text-muted-foreground">{`${counts.total} öncelikli iş · ${counts.critical} kritik · ${counts.warning} yakın takip`}</Text> : null}
        </View>

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
            {/* Hızlı oluştur üstte: altta Sohbet düğmesi dördüncü karonun üstüne biniyordu. */}
            {quickActions.length ? <View accessibilityLabel="Hızlı oluştur">
              <View className="flex-row flex-wrap gap-2">
                {quickActions.map(item => <Pressable key={item.href} accessibilityRole="button" accessibilityLabel={`Yeni ${item.label.toLocaleLowerCase('tr-TR')} oluştur`} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(toHref(item.href)); }} style={{ flexBasis: width < 380 || fontScale >= 1.4 ? '47%' : '22%', flexGrow: 1 }} className="min-h-[64px] items-center justify-center gap-1.5 rounded-[12px] px-1 py-2 active:bg-secondary">
                  <Ionicons name={item.icon} size={21} color={colors.primary} />
                  <Text className="font-inter-medium text-[13px] text-center text-primary" numberOfLines={2}>{item.label}</Text>
                </Pressable>)}
              </View>
            </View> : null}

            <SignalList
              title="Öncelikli İşler"
              signals={signals}
              limit={5}
              empty="Takip gerektiren öncelikli kayıt yok."
            />

            {canOpen('/calendar') ? <Card className="gap-2">
              <View className="flex-row items-center justify-between gap-2">
                <Text accessibilityRole="header" className="font-inter-semibold text-[16px] text-foreground">Ajandam</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Takvimin tamamını aç" onPress={() => go('/calendar')} className="min-h-11 justify-center px-2"><Text className="font-inter-medium text-[13px] text-primary">Tümü</Text></Pressable>
              </View>
              {todayEvents.isPending || upcomingEvents.isPending ? <Skeleton height={64} rounded={12} /> : todayEvents.error || upcomingEvents.error ? <ErrorState message="Ajanda yüklenemedi." onRetry={() => { void todayEvents.refetch(); void upcomingEvents.refetch(); }} /> : !agenda.length ? <View className="gap-0.5 py-1"><Text className="font-inter-medium text-[14px] text-foreground">Ajandanızda boşluk var</Text><Text className="font-inter text-[13px] text-muted-foreground">Yeni ziyaret için takvimi açın.</Text></View> : agenda.slice(0, 3).map(event => {
                const today = new Date(event.startsAt).toDateString() === new Date().toDateString();
                return <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`${event.title}, ${formatDate(event.startsAt)}, ${formatTime(event.startsAt)}`} onPress={() => go('/calendar')} className="min-h-[64px] flex-row items-center gap-3 border-t border-border py-2.5 active:opacity-70">
                  <View className="w-14 items-center gap-1 rounded-control bg-primary/10 py-2"><Text className="font-inter-semibold text-[14px] text-primary">{event.allDay ? 'Gün boyu' : formatTime(event.startsAt)}</Text><Text className="font-inter text-[11px] text-muted-foreground">{today ? 'Bugün' : new Date(event.startsAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</Text></View>
                  <View className="flex-1 gap-1"><Text className="font-inter-medium text-[14px] text-foreground" numberOfLines={2}>{event.title}</Text><Text className="font-inter text-[12px] text-muted-foreground" numberOfLines={1}>{event.company?.shortName || event.company?.legalTitle || event.location || 'Takvim etkinliği'}</Text></View>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </Pressable>;
              })}
            </Card> : null}

            {canReadOpps ? (
              <Card className="gap-2">
                <View className="flex-row items-center justify-between gap-2">
                  <Text accessibilityRole="header" className="font-inter-semibold text-[16px] text-foreground">Açık fırsatlar</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Tüm fırsatları aç" onPress={() => go(opportunitiesHref({ focus: 'open' }))} className="min-h-11 justify-center px-2">
                    <Text className="font-inter-medium text-[13px] text-primary">Tümü</Text>
                  </Pressable>
                </View>
                {analytics.isPending ? <Skeleton height={64} rounded={12} /> : openSalesCards.length === 0 ? (
                  <Text className="font-inter text-[13px] text-muted-foreground">Açık satış kartı yok</Text>
                ) : (
                  openSalesCards.slice(0, 4).map((row) => {
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
                        <Chip tone={STAGE_TONE[stage]} label={QUALIFICATION_LABELS[stage]} />
                      </Pressable>
                    );
                  })
                )}
              </Card>
            ) : null}

            <ReportSection title="Daha fazla" open={operationsOpen} onToggle={() => setOperationsOpen(value => !value)}>
            {canReadQuotes ? <Card className="gap-3">
              <View className="flex-row items-center justify-between"><View className="gap-1"><Text accessibilityRole="header" className="font-inter-semibold text-[17px] text-foreground">Son teklifler</Text><Text className="font-inter text-[12px] text-muted-foreground">Bu ay</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Tüm teklifleri aç" onPress={() => go('/modules/quotes')} className="min-h-11 justify-center px-2"><Text className="font-inter-medium text-[13px] text-primary">Tümü</Text></Pressable></View>
              {quoteList.isPending ? <Skeleton height={64} rounded={12} /> : quoteList.error ? <ErrorState message="Teklifler yüklenemedi." onRetry={() => void quoteList.refetch()} /> : !quoteList.data?.items.length ? <Text className="py-3 font-inter text-[13px] text-muted-foreground">Bu ay henüz teklif yok.</Text> : [...quoteList.data.items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3).map(quote => <Pressable key={quote.id} accessibilityRole="button" onPress={() => go(toHref(`/modules/quotes/${quote.id}`))} className="min-h-[64px] gap-1 border-t border-border py-2.5 active:opacity-70"><View className="flex-row items-center justify-between gap-3"><Text className="flex-1 font-inter-medium text-[14px] text-foreground" numberOfLines={1}>{quote.company?.shortName || quote.company?.legalTitle || quote.documentNo}</Text><Text className="font-inter-semibold text-[13px] text-primary" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{formatAmount(quote.grandTotal, quote.currency?.code ?? 'TRY')}</Text></View><Text className="font-inter text-[12px] text-muted-foreground">{quote.documentNo} · {quote.status?.name || 'Durum yok'}</Text></Pressable>)}
            </Card> : null}
            {canReadService ? (
              <Card className="gap-2">
                <Text accessibilityRole="header" className="font-inter-semibold text-[17px] text-foreground">
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

            </View>
            </ReportSection>
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
              <ReportSection title="KPI Özeti" open={openReport.ozet} onToggle={() => toggleReport('ozet')}>
                <KpiGrid>
                  <KpiCard icon="people-outline" label="Aktif Müşteri" value={num(data.activeCustomers)} onPress={press('/modules/companies')} />
                  <KpiCard icon="wallet-outline" label="Kazanılan ciro" value={money(wonTotal)} onPress={press(opportunitiesHref({ focus: 'won' }))} />
                  <KpiCard icon="briefcase-outline" label="Fırsat (açık)" value={money(openTotal)} onPress={press(opportunitiesHref({ focus: 'open' }))} />
                  <KpiCard icon="alert-circle-outline" label="Geciken ödeme" value={overdueValue} onPress={press(toHref('/modules/receivables'))} />
                  <KpiCard icon="construct-outline" label="Açık servis" value={num(data.openServices)} onPress={press(toHref('/modules/service-tickets'))} />
                </KpiGrid>

                <ManagementOpsSummary
                  insights={buildMobileManagementInsights({
                    overdueReceivables: data.overdueReceivables?.count ?? null,
                    openServices: data.openServices ?? null,
                    openOpportunities: data.openOpportunities ?? openRows.length,
                    quoteConversion,
                    stockReserved: stockSummary.data ? stockCount('reserved') : null,
                    signals,
                  })}
                />

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
              </ReportSection>
            ) : null}

            {reportPane === 'grafikler' ? (
              <ReportSection title="Grafikler & Huniler" open={openReport.grafikler} onToggle={() => toggleReport('grafikler')}>
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
              <ReportSection title="Hedefler" open={openReport.hedefler} onToggle={() => toggleReport('hedefler')}>
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
