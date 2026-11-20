import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { request } from '@/src/api/client';
import { calendar, companies, finance, tasks, reports } from '@/src/api/endpoints';
import { canAccessModule, modules } from '@/src/modules/catalog';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, EmptyState, ErrorState, ListRow, ScreenHeader, Skeleton } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { fetchAssignedWork } from '@/src/modules/AssignedWork';
import { prioritizeTasks } from '@/src/modules/daily-work-policy';
import { ProgressBar } from '@/src/ui/data';
import { HomeBriefing, HomeCountTile, HomeMetric, HomeNote, HomePanelTitle, HomeSectionTabs } from '@/src/dashboard/HomeComponents';
import { HomeTargets } from '@/src/dashboard/HomeTargets';
import { collectionTotals, homePeriod, initialHomeSection, orderHomeMetrics, type HomeMetricKey } from '@/src/dashboard/home-policy';
import { formatCompact } from '@/src/lib/format';

export default function TodayScreen() {
  const { user, tenant, scope } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [section, setSection] = useState(() => initialHomeSection(user?.roles ?? []));
  const access = (key: string) => {
    const entry = modules.find((item) => item.key === key);
    return Boolean(entry && canAccessModule(user, tenant, entry));
  };
  const canApproveQuotes = useCan('quotes.approve') && access('quotes');
  const canCharts = access('reports') && (access('opportunities') || access('payments'));
  const context = [user?.tenantId, user?.id, scope.divisionId, scope.departmentId];
  const today = new Date().toDateString();
  const period = useMemo(() => homePeriod(new Date()), [today]);
  const range = useMemo(() => {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [today]);
  const taskQuery = useQuery({ queryKey: ['tasks', 'today', ...context], queryFn: () => tasks.list({ view: 'mine', pageSize: 100, sortBy: 'dueAt', sortDir: 'asc' }), enabled: access('tasks') });
  const taskCounts = useQuery({ queryKey: ['tasks', 'today-counts', ...context], queryFn: () => request<{ mine: number; mineToday: number; mineOverdue: number }>('/tasks/counts'), enabled: access('tasks') });
  const eventQuery = useQuery({ queryKey: ['calendar', 'events', 'today', range, ...context], queryFn: () => calendar.events({ ...range, ownerUserId: user?.id }), enabled: access('calendar') });
  const pipeline = useQuery({ queryKey: ['today', 'pipeline', ...context], queryFn: () => reports.pipelineSummary(), enabled: section === 'charts' && access('reports') && access('opportunities') });
  const sales = useQuery({ queryKey: ['opportunities', 'today', ...context], queryFn: () => fetchAssignedWork('sales', user!.id), enabled: Boolean(user) && access('opportunities') });
  const service = useQuery({ queryKey: ['service', 'tickets', 'today', ...context], queryFn: () => fetchAssignedWork('service', user!.id), enabled: Boolean(user) && access('service-tickets') });
  const installations = useQuery({ queryKey: ['service', 'installations', 'today', ...context], queryFn: () => fetchAssignedWork('installations', user!.id), enabled: Boolean(user) && access('installations') });
  const approvals = useQuery({ queryKey: ['quotes', 'today-approvals', ...context], queryFn: () => fetchAssignedWork('approvals', user!.id), enabled: Boolean(user) && canApproveQuotes });
  const customerSummary = useQuery({ queryKey: ['home', 'companies', ...context], queryFn: companies.summary, enabled: section === 'overview' && access('companies') });
  const salesCount = useQuery({ queryKey: ['home', 'open-opportunities', ...context], queryFn: () => request<{ meta: { total: number } }>('/opportunities', { query: { view: 'active', page: 1, pageSize: 1 } }), enabled: section === 'overview' && access('opportunities') });
  const serviceCount = useQuery({ queryKey: ['home', 'open-service', ...context], queryFn: () => request<{ open: number }>('/service-tickets/summary'), enabled: section === 'overview' && access('service-tickets') });
  const machines = useQuery({ queryKey: ['home', 'warranty-machines', ...context], queryFn: () => request<{ meta: { total: number } }>('/customer-devices', { query: { preset: 'warranty', page: 1, pageSize: 1 } }), enabled: section === 'overview' && access('customer-devices') });
  const receivables = useQuery({ queryKey: ['home', 'receivables', ...context], queryFn: () => finance.receivableSummary(), enabled: section === 'overview' && access('receivables') });
  const collections = useQuery({ queryKey: ['home', 'collections', period.period, ...context], queryFn: () => reports.completedPayments({ from: period.from, to: new Date().toISOString() }), enabled: (section === 'overview' || section === 'charts') && access('reports') && access('payments') });
  const totals = collectionTotals(collections.data ?? []);
  const prioritized = prioritizeTasks((taskQuery.data?.data ?? []).filter((task) => task.status !== 'done' && task.status !== 'cancelled'));
  const queues = [
    { key: 'approvals', title: 'Fiyat onayları', enabled: canApproveQuotes, query: approvals, icon: 'checkmark-circle-outline' as const },
    { key: 'service', title: 'Servis işlerim', enabled: access('service-tickets'), query: service, icon: 'construct-outline' as const },
    { key: 'installations', title: 'Kurulum işlerim', enabled: access('installations'), query: installations, icon: 'build-outline' as const },
    { key: 'sales', title: 'Fırsatlarım', enabled: access('opportunities'), query: sales, icon: 'briefcase-outline' as const },
  ].filter((queue) => queue.enabled).sort((a, b) => Number(Boolean(b.query.data?.rows.some((row) => row.urgent))) - Number(Boolean(a.query.data?.rows.some((row) => row.urgent))));
  const dailyQueries = [
    { query: taskQuery, enabled: access('tasks') }, { query: taskCounts, enabled: access('tasks') },
    { query: eventQuery, enabled: access('calendar') }, ...queues.map(({ query }) => ({ query, enabled: true })),
  ];
  const sectionQueries = [
    { query: customerSummary, enabled: section === 'overview' && access('companies') },
    { query: salesCount, enabled: section === 'overview' && access('opportunities') },
    { query: serviceCount, enabled: section === 'overview' && access('service-tickets') },
    { query: machines, enabled: section === 'overview' && access('customer-devices') },
    { query: receivables, enabled: section === 'overview' && access('receivables') },
    { query: pipeline, enabled: section === 'charts' && access('reports') && access('opportunities') },
    { query: collections, enabled: (section === 'overview' || section === 'charts') && access('reports') && access('payments') },
  ];
  const refreshDaily = useCallback(() => { dailyQueries.filter((item) => item.enabled).forEach(({ query }) => void query.refetch()); }, [user, tenant, scope.divisionId, scope.departmentId, canApproveQuotes, today]);
  useFocusEffect(refreshDaily);
  const metrics = orderHomeMetrics([
    { key: 'customers' as HomeMetricKey, enabled: access('companies'), label: 'Aktif müşteri', value: customerSummary.data?.byStatus.active, detail: 'Aktif firma kayıtları', icon: 'people-outline' as const, route: '/modules/companies?status=active' },
    { key: 'sales' as HomeMetricKey, enabled: access('opportunities'), label: 'Açık fırsat', value: salesCount.data?.meta.total, detail: 'Aktif satış süreci', icon: 'briefcase-outline' as const, route: '/modules/opportunities' },
    { key: 'overdue' as HomeMetricKey, enabled: access('receivables'), label: 'Geciken alacak', value: receivables.data?.overdueCount, detail: 'Gecikmiş alacak kaydı', icon: 'time-outline' as const, route: '/modules/receivables' },
    { key: 'service' as HomeMetricKey, enabled: access('service-tickets'), label: 'Açık servis', value: serviceCount.data?.open, detail: 'Çözüm bekleyen talepler', icon: 'construct-outline' as const, route: '/modules/service-tickets' },
    { key: 'machines' as HomeMetricKey, enabled: access('customer-devices'), label: 'Garantili makine', value: machines.data?.meta.total, detail: 'Garantisi devam eden', icon: 'hardware-chip-outline' as const, route: '/modules/customer-devices?preset=warranty' },
  ].filter((metric) => metric.enabled), user?.roles ?? []);
  const go = (href: Href) => router.push(href);
  const openTasks = (view: 'mine' | 'today' | 'overdue') => go(`/work?kind=tasks&view=${view}` as Href);
  const counts = taskCounts.data;
  // Web DashboardTasksPanel: sayaçlar + son tarihe göre ilk işler, sekmelerin üstünde sabit.
  const taskPanel = access('tasks') ? <Card className="gap-3">
    <HomePanelTitle title={counts?.mineOverdue ? "Öncelikli görevler" : "Görevlerim"} action="Tümü" onPress={() => openTasks('mine')} />
    {taskCounts.error ? <ErrorState message={taskCounts.error.message} onRetry={() => void taskCounts.refetch()} /> : <View className="flex-row gap-2">
      <HomeCountTile label="Geciken" value={counts?.mineOverdue} alarm={Boolean(counts?.mineOverdue)} onPress={() => openTasks('overdue')} />
      <HomeCountTile label="Bugün" value={counts?.mineToday} onPress={() => openTasks('today')} />
      <HomeCountTile label="Açık" value={counts?.mine} onPress={() => openTasks('mine')} />
    </View>}
    {taskQuery.isPending ? <Skeleton height={110} /> : taskQuery.error ? <ErrorState message={taskQuery.error.message} onRetry={() => void taskQuery.refetch()} />
      : prioritized.length ? prioritized.slice(0, 3).map((task) => <ListRow key={task.id} title={task.title} lines={[task.company?.shortName ?? task.company?.legalTitle, task.overdue ? 'Gecikti' : task.dueAt ? new Date(task.dueAt).toLocaleDateString('tr-TR') : 'Tarih belirlenmemiş']} icon="checkbox-outline" iconTone={task.overdue ? 'destructive' : 'neutral'} onPress={() => go(`/modules/tasks/${task.id}`)} />)
      : <HomeNote>Bekleyen kişisel göreviniz yok.</HomeNote>}
  </Card> : null;
  const events = [...(eventQuery.data ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  // Boş gün için ayrı kart açılmaz; brifing zaten "0 randevu" der.
  const calendarPanel = access('calendar') && (events.length || eventQuery.error) ? <Card>
    <HomePanelTitle title="Bugünkü randevular" action="Takvim" onPress={() => go('/calendar')} />
    {eventQuery.error ? <ErrorState message={eventQuery.error.message} onRetry={() => void eventQuery.refetch()} />
      : events.slice(0, 3).map((event) => <ListRow key={event.id} title={event.title} lines={[new Date(event.startsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })]} icon="calendar-outline" onPress={() => go(`/modal/calendar-event?id=${event.id}` as Href)} />)}
  </Card> : null;
  const summary = [access('tasks') && counts ? `Bugün ${counts.mineToday} görev sonlanıyor, ${counts.mineOverdue} görev gecikmiş` : null,
    access('calendar') && eventQuery.data ? `${eventQuery.data.length} randevu` : null].filter(Boolean).join(' · ');

  return <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
    <SyncStatus /><ScreenHeader title="Ana Sayfa" actions={[{ icon: 'chatbubbles-outline', label: 'Sohbet', onPress: () => go('/chat') }]} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 32 }} refreshControl={<RefreshControl tintColor={colors.primary} refreshing={[...dailyQueries, ...sectionQueries].some(({ query, enabled }) => enabled && query.isRefetching)} onRefresh={() => { [...dailyQueries, ...sectionQueries].filter(({ enabled }) => enabled).forEach(({ query }) => void query.refetch()); if (section === 'targets') void queryClient.invalidateQueries({ queryKey: ['home', 'my-targets'] }); }} />}>
      <HomeBriefing name={user?.fullName?.split(' ')[0] ?? ''} date={new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })} summary={summary || 'Bugünkü işleriniz bir arada.'} onToday={access('tasks') ? () => openTasks('today') : () => setSection('operations')} onOverdue={access('receivables') ? () => go('/modules/receivables') : undefined} />
      {queues.some((queue) => queue.query.data?.rows.some((row) => row.urgent)) ? <Card>
        <HomePanelTitle title="Acil işler" action="İşler" onPress={() => go('/work')} />
        {queues.flatMap((queue) => (queue.query.data?.rows ?? []).filter((row) => row.urgent).map((row) => ({ ...row, queueKey: queue.key, icon: queue.icon }))).slice(0, 3).map((row) => <ListRow key={`${row.queueKey}:${row.id}`} title={row.title} lines={[row.context, row.detail]} icon={row.icon} iconTone="destructive" onPress={() => go(row.route as Href)} />)}
      </Card> : null}
      {taskPanel}{calendarPanel}
      <HomeSectionTabs value={section} onChange={setSection} charts={canCharts} />
      {section === 'overview' ? <>
        <View className="rounded-2xl border border-border bg-card px-4 pb-2">
        <HomePanelTitle title="İşletme özeti" action={showAllMetrics ? "Daha az göster" : "Tüm göstergeler"} onPress={() => setShowAllMetrics((value) => !value)} />
        <View>
          {(showAllMetrics ? metrics : metrics.slice(0, access('reports') && access('payments') ? 2 : 3)).map((metric) => <HomeMetric compact key={metric.key} label={metric.label} value={metric.value == null ? '—' : metric.value.toLocaleString('tr-TR')} detail={metric.detail} icon={metric.icon} alarm={metric.key === 'overdue' && Boolean(metric.value)} onPress={() => go(metric.route as Href)} />)}
          {access('reports') && access('payments') ? <HomeMetric compact label="Bu ay tahsilat" value={!collections.data ? '—' : totals.length === 1 ? `${formatCompact(Number(totals[0]!.amount))} ${totals[0]!.currencyCode}` : totals.length ? `${totals.length} para birimi` : '0'} detail="Tamamlanan tahsilatlar" icon="wallet-outline" onPress={() => setSection('charts')} /> : null}
        </View>
        </View>
        {sectionQueries.some(({ enabled, query }) => enabled && query.isPending) ? <HomeNote>Özet yükleniyor…</HomeNote> : null}
        {sectionQueries.filter(({ enabled, query }) => enabled && query.error).map(({ query }, index) => <ErrorState key={index} message={query.error!.message} onRetry={() => void query.refetch()} />)}
        {!metrics.length && !(access('reports') && access('payments')) ? <HomeNote>Bu alanda erişebildiğiniz işletme göstergesi bulunmuyor. Günlük işlerinizi Operasyon bölümünden açabilirsiniz.</HomeNote> : null}
      </> : null}
      {section === 'operations' ? <>
        <HomePanelTitle title="Günlük operasyon" />
        <HomeNote>Size atanmış işler ve yetkili olduğunuz süreçler</HomeNote>
        <View className="flex-row flex-wrap gap-3">
          {queues.map((queue) => <HomeMetric key={queue.key} label={queue.title} value={queue.query.data ? String(queue.query.data.total) : '—'} detail={queue.key === 'approvals' ? 'Onayınızı bekleyen' : 'Size atanmış açık kayıtlar'} icon={queue.icon} onPress={() => go(`/work?kind=${queue.key}` as Href)} />)}
        </View>
        {queues.map((queue) => queue.query.error ? <ErrorState key={queue.key} message={queue.query.error.message} onRetry={() => void queue.query.refetch()} /> : queue.query.data?.rows.length ? <Card key={queue.key}>
          <HomePanelTitle title={queue.title} action="Tümü" onPress={() => go(`/work?kind=${queue.key}` as Href)} />
          {queue.query.data.rows.slice(0, 2).map((row) => <ListRow key={row.id} title={row.title} lines={[row.context, row.detail]} icon={queue.icon} iconTone={row.urgent ? 'destructive' : 'neutral'} onPress={() => go(row.route as Href)} />)}
        </Card> : null)}
        {access('shipments') || access('due-dates') ? <Card className="gap-2"><HomePanelTitle title="Süreçlere hızlı erişim" />
          {access('shipments') ? <Button label="Sevkiyat ve hazırlama" variant="ghost" onPress={() => go('/work?kind=operations' as Href)} /> : null}
          {access('due-dates') ? <Button label="Vade ve tahsilat" variant="ghost" onPress={() => go('/work?kind=finance' as Href)} /> : null}
        </Card> : null}
        {!queues.length && !access('shipments') && !access('due-dates') ? <EmptyState title="Atanmış iş alanınız yok" hint="Erişebildiğiniz diğer süreçleri Modüller sekmesinde bulabilirsiniz." /> : null}
      </> : null}
      {section === 'charts' && canCharts ? <>
        {access('opportunities') ? <Card className="gap-3"><HomePanelTitle title="Fırsat aşamaları" action="Fırsatlar" onPress={() => go('/modules/opportunities')} /><HomeNote>Aşamalara göre kayıt adedi</HomeNote>
          {pipeline.isPending ? <Skeleton height={140} /> : pipeline.error ? <ErrorState message={pipeline.error.message} onRetry={() => void pipeline.refetch()} /> : pipeline.data?.length ? pipeline.data.map((stage) => <View key={stage.stageName} className="gap-2 py-1"><Text className="font-inter text-sm text-foreground">{stage.stageName} · {stage.count}</Text><ProgressBar done={stage.count} total={Math.max(1, ...(pipeline.data ?? []).map((item) => item.count))} /></View>) : <HomeNote>Gösterilecek fırsat bulunmuyor.</HomeNote>}
        </Card> : null}
        {access('payments') ? <Card className="gap-3"><HomePanelTitle title="Bu ay tamamlanan tahsilatlar" action="Ödemeler" onPress={() => go('/modules/payments')} /><HomeNote>{new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })} · Para birimi bazında</HomeNote>
          {collections.isPending ? <Skeleton height={100} /> : collections.error ? <ErrorState message={collections.error.message} onRetry={() => void collections.refetch()} /> : totals.length ? totals.map((total) => <View key={total.currencyCode} className="flex-row flex-wrap justify-between gap-2 border-b border-border py-3"><Text className="font-inter-medium text-base text-muted-foreground">{total.currencyCode}</Text><Text className="font-inter-semibold text-lg text-foreground">{Number(total.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text></View>) : <HomeNote>Bu ay tamamlanmış tahsilat bulunmuyor.</HomeNote>}
        </Card> : null}
      </> : null}
      {section === 'targets' ? <HomeTargets period={period.period} /> : null}
    </ScrollView>
  </SafeAreaView>;
}
