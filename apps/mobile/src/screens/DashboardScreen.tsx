import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DivisionChip } from '@/src/ui/DivisionChip';
import { NotificationBell } from '@/src/ui/NotificationBell';
import {
  activityService,
  companyService,
  notificationService,
  opportunityService,
  reportService,
  serviceService,
} from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';

const PRIMARY = '#000c69';
const TABS = ['Özet', 'Operasyon', 'Grafikler', 'Hedefler'];

/**
 * Gösterge paneli TAMAMEN sunucudan beslenir. Önceki sürüm sabit örnek rakamlar
 * (KPI, hedef, pipeline, uyarı) gösteriyordu; kullanıcı bunları canlı veri sanıp
 * yanlış karar verebiliyordu. Yetkisi olmayan uç 403 dönerse o kart "veri yok"
 * der, ekranın kalanı çalışmaya devam eder.
 */
type KpiCard = { key: string; label: string; value: string; sub: string; icon: string; color: string; bg: string };
type AlertCard = { key: string; icon: string; title: string; body: string; color: string; bg: string; nav: string };
type PipelineStage = { stage: string; count: number };
type MonthPoint = { label: string; revenue: number; quotes: number; won: number };
type TargetLine = { label: string; current: number; target: number; unit: 'USD' | 'adet' };
type RecentActivity = { id: string; title: string; description: string; time: string; initials: string };

type DashboardData = {
  kpis: KpiCard[];
  alerts: AlertCard[];
  pipeline: PipelineStage[];
  months: MonthPoint[];
  targets: TargetLine[];
  recent: RecentActivity[];
  targetPeriodLabel: string;
};

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const TARGET_METRIC_LABELS: Record<string, string> = {
  salesAmount: 'Satış Cirosu',
  salesNewCustomers: 'Yeni Müşteri',
  quoteTarget: 'Teklif',
  visitTarget: 'Ziyaret',
  callTarget: 'Arama',
  serviceCompleted: 'Tamamlanan Servis',
  serviceAmount: 'Servis Cirosu',
  digitalLeadTarget: 'Dijital Fırsat',
  paymentsInAmount: 'Tahsilat',
  purchaseInvoiceAmount: 'Alış Faturası',
  purchaseOrderAmount: 'Satınalma Tutarı',
  purchaseOrderCount: 'Satınalma Siparişi',
  salesOrderAmount: 'Satış Siparişi Tutarı',
  salesOrderCount: 'Satış Siparişi',
  installationCompleted: 'Kurulum',
  machineDeliveredCount: 'Teslim Edilen Tezgah',
};
const MONEY_METRIC = /amount|budget/i;

/** Dönem yerel takvimden; `toISOString` UTC verdiği için ayın ilk saatlerinde şaşar. */
const currentPeriod = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

const compactNumber = (value: number) =>
  Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}K` : String(Math.round(value));
const formatUsd = (value: number) => `$${compactNumber(value)}`;
const formatCount = (value: number) => value.toLocaleString('tr-TR');
const initialsOf = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('tr-TR') ?? '').join('') || '•';
const relativeTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return 'Dün';
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
};

/** 403/404 yutulur: yetkisi olmayan kart boş kalır, ekran ayakta kalır. */
const settled = async <T,>(promise: Promise<T>): Promise<T | null> => promise.then((value) => value).catch(() => null);
const totalOf = (res: { meta?: { total?: number } } | null) => res?.meta?.total ?? 0;

async function loadDashboard(): Promise<DashboardData> {
  const period = currentPeriod();
  const year = new Date().getFullYear();
  const [companies, opportunities, tickets, pipelineRows, operational, complaints, receivables, warranty, targets, activities] =
    await Promise.all([
      settled(companyService.list({ pageSize: 1 })),
      settled(opportunityService.list({ pageSize: 1 })),
      settled(serviceService.tickets({ pageSize: 1 })),
      settled(reportService.pipelineSummary()),
      settled(reportService.operational({ year, period: 'monthly' })),
      settled(reportService.serviceComplaintsSummary()),
      settled(reportService.expectedReceivables()),
      settled(reportService.warrantyExpiring({ days: 30 })),
      settled(reportService.myTargetProgress({ period })),
      settled(activityService.list({ pageSize: 5, page: 1 })),
    ]);

  const rows = operational?.rows ?? [];
  const months: MonthPoint[] = rows.map((row) => {
    const monthIndex = Number(String(row.bucket).slice(5, 7)) - 1;
    return {
      label: MONTH_SHORT[monthIndex] ?? String(row.bucket),
      revenue: Number(row.revenueUsd ?? 0),
      quotes: Number(row.quotes ?? 0),
      won: Number(row.won ?? 0),
    };
  });
  const revenueYtd = months.reduce((sum, month) => sum + month.revenue, 0);

  const pipeline: PipelineStage[] = (pipelineRows ?? []).map((row: any) => ({
    stage: String(row.stageName ?? row.stageCode ?? '—'),
    count: Number(row.count ?? 0),
  }));
  const pipelineValue = (pipelineRows ?? []).reduce((sum: number, row: any) => sum + Number(row.totalValue ?? 0), 0);

  const kpis: KpiCard[] = [
    { key: 'companies', label: 'Firmalar', value: formatCount(totalOf(companies)), sub: 'kayıtlı', icon: 'business-outline', color: PRIMARY, bg: '#EEF2FF' },
    { key: 'opportunities', label: 'Fırsat', value: formatCount(totalOf(opportunities)), sub: 'açık kart', icon: 'trending-up-outline', color: '#10B981', bg: '#ECFDF5' },
    { key: 'revenue', label: 'Ciro', value: formatUsd(revenueYtd), sub: `${year} kazanılan`, icon: 'cash-outline', color: '#F59E0B', bg: '#FFFBEB' },
    { key: 'service', label: 'Servis', value: formatCount(totalOf(tickets)), sub: 'talep', icon: 'build-outline', color: '#EF4444', bg: '#FEF2F2' },
  ];

  const openComplaints = Number(complaints?.new ?? 0) + Number(complaints?.reviewing ?? 0);
  const alerts: AlertCard[] = [];
  if ((receivables?.length ?? 0) > 0) {
    alerts.push({
      key: 'receivables', icon: 'alert-circle', title: 'Vade Takibi',
      body: `${receivables!.length} kayıtta ödeme vadesi bekliyor`,
      color: '#F97316', bg: '#FFF7ED', nav: '/modules/due-dates',
    });
  }
  if (openComplaints > 0) {
    alerts.push({
      key: 'complaints', icon: 'construct', title: 'Açık Şikayet / Servis Talebi',
      body: `${openComplaints} kayıt değerlendirme bekliyor`,
      color: '#EF4444', bg: '#FEF2F2', nav: '/modules/service-requests',
    });
  }
  if ((warranty?.length ?? 0) > 0) {
    alerts.push({
      key: 'warranty', icon: 'shield-checkmark', title: 'Garanti Bitiyor',
      body: `${warranty!.length} makine — 30 gün içinde garanti bitiyor`,
      color: '#6366F1', bg: '#EEF2FF', nav: '/modules/machines',
    });
  }
  if (pipelineValue > 0) {
    alerts.push({
      key: 'pipeline', icon: 'cube', title: 'Açık Pipeline',
      body: `${formatUsd(pipelineValue)} değerinde açık fırsat var`,
      color: '#8B5CF6', bg: '#F5F3FF', nav: '/modules/sales-cases',
    });
  }

  const metrics: Record<string, { target: number | null; actual: number | null }> =
    targets?.subjects?.[0]?.metrics ?? {};
  const targetLines: TargetLine[] = Object.entries(metrics)
    .filter(([, metric]) => (metric?.target ?? 0) > 0 && metric?.actual != null)
    .map(([key, metric]) => ({
      label: TARGET_METRIC_LABELS[key] ?? key,
      current: Number(metric.actual ?? 0),
      target: Number(metric.target ?? 0),
      unit: MONEY_METRIC.test(key) ? ('USD' as const) : ('adet' as const),
    }));
  for (const item of targets?.subjects?.[0]?.targetItems ?? []) {
    const target = Number(item?.target ?? 0);
    if (!Number.isFinite(target) || target <= 0 || item?.actual == null) continue;
    targetLines.push({
      label: String(item.activity ?? item.description ?? 'Hedef'),
      current: Number(item.actual ?? 0),
      target,
      unit: item.unit === 'amount' ? 'USD' : 'adet',
    });
  }

  const recent: RecentActivity[] = normalizeList(activities as any)
    .slice(0, 5)
    .map((row: any) => ({
      id: String(row.id),
      title: String(row.type?.name ?? row.subject ?? 'Aktivite'),
      description: String(row.subject ?? row.description ?? '—'),
      time: relativeTime(String(row.activityDate ?? row.createdAt ?? '')),
      initials: initialsOf(String(row.createdByUser?.fullName ?? '')),
    }));

  return {
    kpis,
    alerts,
    pipeline,
    months,
    targets: targetLines,
    recent,
    targetPeriodLabel: new Date(`${period}-01T00:00:00`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
  };
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function OzetTab({ data }: { data: DashboardData }) {
  const maxRevenue = Math.max(1, ...data.months.map((month) => month.revenue));
  return (
    <View style={styles.tabContent}>
      <View style={styles.kpiGrid}>
        {data.kpis.map((kpi) => (
          <View key={kpi.key} style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <View style={[styles.kpiIconBox, { backgroundColor: kpi.bg }]}>
                <Ionicons name={kpi.icon as any} size={15} color={kpi.color} />
              </View>
            </View>
            <Text style={styles.kpiValue}>{kpi.value}</Text>
            <Text style={styles.kpiSub}>{kpi.label} · {kpi.sub}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Aylık Ciro</Text>
            <Text style={styles.cardSubtitle}>Kazanılan fırsat değeri · USD</Text>
          </View>
        </View>
        {data.months.length === 0 ? (
          <Text style={styles.emptyText}>Bu yıl için ciro verisi yok.</Text>
        ) : (
          <View style={styles.chartPlaceholder}>
            {data.months.map((month) => (
              <View key={month.label} style={styles.chartCol}>
                <View style={[styles.chartBar, { height: `${Math.max(4, (month.revenue / maxRevenue) * 100)}%` }]} />
                <Text style={styles.chartDay}>{month.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Hızlı İşlem</Text>
        <View style={styles.quickActionGrid}>
          {[
            { label: '+ Firma', color: PRIMARY, bg: '#EEF2FF' },
            { label: '+ Teklif', color: '#10B981', bg: '#ECFDF5' },
            { label: '+ Servis', color: '#EF4444', bg: '#FEF2F2' },
          ].map((action) => (
            <TouchableOpacity key={action.label} style={[styles.quickActionButton, { backgroundColor: action.bg }]} onPress={() => router.push('/quick-create')}>
              <Text style={[styles.quickActionText, { color: action.color }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Son Aktiviteler</Text>
          <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
        </View>
        {data.recent.length === 0 ? (
          <Text style={styles.emptyText}>Kayıtlı aktivite yok.</Text>
        ) : (
          <View style={styles.activityList}>
            {data.recent.map((act) => (
              <TouchableOpacity key={act.id} style={styles.activityRow} onPress={() => router.push('/modules/sales-cases')}>
                <View style={[styles.activityAvatar, { backgroundColor: PRIMARY }]}>
                  <Text style={styles.activityAvatarText}>{act.initials}</Text>
                </View>
                <View style={styles.activityContent}>
                  <View style={styles.activityRowHeader}>
                    <Text style={styles.activityTitle}>{act.title}</Text>
                    <Text style={styles.activityTime}>{act.time}</Text>
                  </View>
                  <Text style={styles.activityDesc} numberOfLines={1}>{act.description}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function OperasyonTab({ data }: { data: DashboardData }) {
  if (data.alerts.length === 0) {
    return (
      <View style={styles.tabContent}>
        <EmptyCard text="Şu an dikkat gerektiren kayıt yok." />
      </View>
    );
  }
  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionLead}>Dikkat Gerektiren Durumlar</Text>
      {data.alerts.map((alert) => (
        <TouchableOpacity key={alert.key} style={styles.alertCard} onPress={() => router.push(alert.nav as any)}>
          <View style={[styles.alertIconBox, { backgroundColor: alert.bg }]}>
            <Ionicons name={alert.icon as any} size={18} color={alert.color} />
          </View>
          <View style={styles.alertContent}>
            <Text style={styles.alertTitle}>{alert.title}</Text>
            <Text style={styles.alertBody}>{alert.body}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={alert.color} style={{ marginTop: 2 }} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function GrafiklerTab({ data }: { data: DashboardData }) {
  const maxMonthly = Math.max(1, ...data.months.map((month) => Math.max(month.quotes, month.won)));
  const pipelineMax = Math.max(1, ...data.pipeline.map((stage) => stage.count));
  return (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Aylık Teklif ve Kazanılan</Text>
        {data.months.length === 0 ? (
          <Text style={styles.emptyText}>Bu yıl için kayıt yok.</Text>
        ) : (
          <>
            <View style={styles.chartPlaceholder}>
              {data.months.map((month) => (
                <View key={month.label} style={styles.chartCol}>
                  <View style={styles.chartBarStack}>
                    <View style={[styles.barSlice, { height: Math.max(3, (month.quotes / maxMonthly) * 80), backgroundColor: PRIMARY }]} />
                    <View style={[styles.barSlice, { height: Math.max(3, (month.won / maxMonthly) * 80), backgroundColor: '#10B981' }]} />
                  </View>
                  <Text style={styles.chartDay}>{month.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: PRIMARY }]} />
                <Text style={styles.legendText}>Teklif</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.legendText}>Kazanılan</Text>
              </View>
            </View>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Satış Hunisi</Text>
        {data.pipeline.length === 0 ? (
          <Text style={styles.emptyText}>Pipeline verisi yok.</Text>
        ) : (
          <View style={styles.pipelineRow}>
            {data.pipeline.map((stage) => (
              <View key={stage.stage} style={styles.pipelineCol}>
                <Text style={styles.pipelineCount}>{stage.count}</Text>
                <View style={[styles.pipelineBar, { height: Math.max(6, Math.round((stage.count / pipelineMax) * 80)) }]} />
                <Text style={styles.pipelineLabel} numberOfLines={1}>{stage.stage}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function HedeflerTab({ data }: { data: DashboardData }) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.targetHeader}>
        <Ionicons name="analytics" size={16} color={PRIMARY} />
        <Text style={styles.targetHeaderText}>{data.targetPeriodLabel} Hedefleri</Text>
      </View>
      {data.targets.length === 0 ? (
        <EmptyCard text="Bu dönem için ölçülebilir hedef girilmemiş." />
      ) : (
        data.targets.map((target) => {
          const pct = Math.min(100, Math.round((target.current / target.target) * 100));
          const display = target.unit === 'USD'
            ? `${formatUsd(target.current)} / ${formatUsd(target.target)}`
            : `${formatCount(target.current)} / ${formatCount(target.target)} adet`;
          return (
            <View key={target.label} style={styles.card}>
              <View style={styles.targetRowHeader}>
                <Text style={styles.targetLabel}>{target.label}</Text>
                <Text style={[styles.targetPct, { color: pct >= 100 ? '#10B981' : PRIMARY }]}>{pct}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: pct >= 100 ? '#10B981' : PRIMARY }]} />
              </View>
              <Text style={styles.targetDisplay}>{display}</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

export function DashboardScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [unread, setUnread] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await loadDashboard());
    } catch (err: any) {
      setError(err?.message ?? 'Gösterge paneli verisi alınamadı.');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await notificationService.list({ unread: true, pageSize: 50 });
        setUnread(normalizeList(res).length);
      } catch {
        /* bildirim sayısı alınamadı — rozet gizli kalır */
      }
    })();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const greetingDate = useMemo(() => {
    const now = new Date();
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    return `${days[now.getDay()]}, ${now.getDate()} ${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}`;
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.controlsRow}>
          <DivisionChip />
          <View style={styles.controlsRight}>
            <NotificationBell count={unread} onPress={() => router.push('/modules/notifications')} />
            <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/(tabs)/more')}>
              <Text style={styles.avatarText}>{(user?.fullName?.[0] ?? 'H').toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.greetingRow}>
          <Text style={styles.dateText}>{greetingDate}</Text>
          <Text style={styles.greetingText}>Merhaba, {user?.fullName?.split(' ')[0] ?? 'Kullanıcı'} 👋</Text>
        </View>

        <View style={styles.tabBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
            {TABS.map((tab, i) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabButton, activeTab === i && styles.tabButtonActive]}
                onPress={() => setActiveTab(i)}
              >
                <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={PRIMARY} />
            <Text style={styles.emptyText}>Veriler yükleniyor…</Text>
          </View>
        ) : error || !data ? (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.emptyText}>{error ?? 'Veri alınamadı.'}</Text>
              <TouchableOpacity style={[styles.quickActionButton, { backgroundColor: '#EEF2FF', marginTop: 12 }]} onPress={onRefresh}>
                <Text style={[styles.quickActionText, { color: PRIMARY }]}>Yeniden dene</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {activeTab === 0 && <OzetTab data={data} />}
            {activeTab === 1 && <OperasyonTab data={data} />}
            {activeTab === 2 && <GrafiklerTab data={data} />}
            {activeTab === 3 && <HedeflerTab data={data} />}
          </>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Hızlı kayıt: önceden hiçbir işlem yapmayan ölü bir düğmeydi. */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        accessibilityLabel="Hızlı kayıt oluştur"
        onPress={() => router.push('/quick-create')}
      >
        <Ionicons name="add" size={24} color="#ffffff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f7f8',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  controlsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  greetingRow: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
  },
  dateText: {
    fontSize: 10,
    color: '#9ca3af',
    marginBottom: 2,
  },
  greetingText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  avatarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  tabBar: {
    paddingHorizontal: 12,
  },
  tabScroll: {
    flexDirection: 'row',
    gap: 4,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: PRIMARY,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabTextActive: {
    color: PRIMARY,
  },
  scroll: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
    gap: 16,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpiCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  kpiIconBox: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiTrendBox: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 100,
  },
  kpiTrendText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  kpiSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  trendUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendUpText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#16a34a',
  },
  chartPlaceholder: {
    height: 90,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  chartBar: {
    width: '12%',
    backgroundColor: PRIMARY,
    opacity: 0.2,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  quickActionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  quickActionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  activityList: {
    gap: 12,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  activityAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityAvatarText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  activityContent: {
    flex: 1,
  },
  activityRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
  },
  activityTime: {
    fontSize: 10,
    color: '#9ca3af',
    marginLeft: 8,
  },
  activityDesc: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  sectionLead: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 4,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  alertIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  alertBody: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  chartCol: {
    alignItems: 'center',
    flex: 1,
  },
  chartBarStack: {
    height: 75,
    width: 12,
    justifyContent: 'flex-end',
    gap: 2,
  },
  barSlice: {
    width: '100%',
    borderRadius: 2,
  },
  chartDay: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 4,
  },
  chartLegend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 11,
    color: '#6b7280',
  },
  pipelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 110,
    marginTop: 8,
  },
  pipelineCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  pipelineCount: {
    fontSize: 10,
    fontWeight: 'bold',
    color: PRIMARY,
  },
  pipelineBar: {
    width: '55%',
    backgroundColor: PRIMARY,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  pipelineLabel: {
    fontSize: 9,
    color: '#9ca3af',
    marginTop: 2,
  },
  targetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  targetHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  targetRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  targetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
  },
  targetPct: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  targetDisplay: {
    fontSize: 11,
    color: '#9ca3af',
  },
  emptyText: {
    fontSize: 12,
    color: '#6b7280',
  },
  loadingBox: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 88,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 8,
  },
});


