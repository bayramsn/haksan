import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DivisionChip } from '@/src/ui/DivisionChip';
import { NotificationBell } from '@/src/ui/NotificationBell';
import { notificationService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { colors } from '@/src/theme/tokens';

const PRIMARY = '#000c69';
const TABS = ['Özet', 'Operasyon', 'Grafikler', 'Hedefler'];

const recentActivities = [
  { id: '1', title: 'Teklif gönderildi', description: 'TKL-2026-001 - Haksan Makina', time: '10:30', initials: 'AK', avatarColor: PRIMARY },
  { id: '2', title: 'Ziyaret notu eklendi', description: 'Asil Çelik - Yeni proje görüşmesi', time: '09:15', initials: 'ST', avatarColor: '#10B981' },
  { id: '3', title: 'Tahsilat alındı', description: '€12.500 - Peşinat ödemesi', time: 'Dün', initials: 'M', avatarColor: '#F59E0B' },
];

const weeklyData = [
  { day: 'Pt', teklifler: 2, ziyaretler: 3 },
  { day: 'Sa', teklifler: 1, ziyaretler: 1 },
  { day: 'Çr', teklifler: 3, ziyaretler: 4 },
  { day: 'Pe', teklifler: 2, ziyaretler: 2 },
  { day: 'Cu', teklifler: 4, ziyaretler: 5 },
];

const pipelineData = [
  { stage: 'Lead', count: 8 },
  { stage: 'Arama', count: 6 },
  { stage: 'Ziyaret', count: 5 },
  { stage: 'Teklif', count: 4 },
  { stage: 'Satış', count: 3 },
];
const pipelineMax = Math.max(...pipelineData.map((p) => p.count));

const alerts = [
  { icon: 'alert-circle', title: 'Vade Uyarısı', body: '3 firma için ödeme vadesi yaklaşıyor', color: '#F97316', bg: '#FFF7ED' },
  { icon: 'construct', title: 'Açık Servis Talepleri', body: '2 kritik servis talebi bekliyor', color: '#EF4444', bg: '#FEF2F2' },
  { icon: 'cube', title: 'Düşük Stok', body: 'Kontrol Kartı X1 — kritik seviye', color: '#8B5CF6', bg: '#F5F3FF' },
  { icon: 'shield-checkmark', title: 'Garanti Bitiyor', body: '2 makine — 30 gün içinde garanti bitiyor', color: '#6366F1', bg: '#EEF2FF' },
];

const targets = [
  { label: 'Tezgah Satış Adedi', current: 7, target: 12, unit: 'adet', color: PRIMARY },
  { label: 'Tahsilat Tutarı', current: 82000, target: 120000, unit: '€', color: '#10B981' },
  { label: 'Yeni Müşteri Ziyareti', current: 14, target: 20, unit: 'ziyaret', color: '#F59E0B' },
  { label: 'Yeni Teklif', current: 9, target: 15, unit: 'teklif', color: '#8B5CF6' },
  { label: 'Servis Ciro Hedefi', current: 18500, target: 30000, unit: '€', color: '#EF4444' },
];

function OzetTab() {
  const kpis = [
    { label: 'Firmalar', value: '142', sub: 'aktif', icon: 'business-outline', color: PRIMARY, bg: '#EEF2FF', trend: '+3' },
    { label: 'Satış Kartı', value: '24', sub: 'açık kart', icon: 'trending-up-outline', color: '#10B981', bg: '#ECFDF5', trend: '+2' },
    { label: 'Gelir', value: '€84K', sub: 'kapanan', icon: 'cash-outline', color: '#F59E0B', bg: '#FFFBEB', trend: '+12%' },
    { label: 'Servis', value: '8', sub: 'açık talep', icon: 'build-outline', color: '#EF4444', bg: '#FEF2F2', trend: '-1' },
  ];

  return (
    <View style={styles.tabContent}>
      {/* KPI Grid */}
      <View style={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <View key={kpi.label} style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <View style={[styles.kpiIconBox, { backgroundColor: kpi.bg }]}>
                <Ionicons name={kpi.icon as any} size={15} color={kpi.color} />
              </View>
              <View style={[styles.kpiTrendBox, { backgroundColor: kpi.bg }]}>
                <Text style={[styles.kpiTrendText, { color: kpi.color }]}>{kpi.trend}</Text>
              </View>
            </View>
            <Text style={styles.kpiValue}>{kpi.value}</Text>
            <Text style={styles.kpiSub}>{kpi.sub}</Text>
          </View>
        ))}
      </View>

      {/* Revenue Chart Placeholder */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Aylık Gelir</Text>
            <Text style={styles.cardSubtitle}>Son 6 ay</Text>
          </View>
          <View style={styles.trendUp}>
            <Ionicons name="trending-up" size={12} color="#16a34a" />
            <Text style={styles.trendUpText}>+18%</Text>
          </View>
        </View>
        <View style={styles.chartPlaceholder}>
          <View style={[styles.chartBar, { height: '30%' }]} />
          <View style={[styles.chartBar, { height: '50%' }]} />
          <View style={[styles.chartBar, { height: '40%' }]} />
          <View style={[styles.chartBar, { height: '70%' }]} />
          <View style={[styles.chartBar, { height: '60%' }]} />
          <View style={[styles.chartBar, { height: '90%' }]} />
        </View>
      </View>

      {/* Hızlı İşlem */}
      <View style={styles.card}>
        <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Hızlı İşlem</Text>
        <View style={styles.quickActionGrid}>
          {[
            { label: '+ Firma', color: PRIMARY, bg: '#EEF2FF' },
            { label: '+ Teklif', color: '#10B981', bg: '#ECFDF5' },
            { label: '+ Servis', color: '#EF4444', bg: '#FEF2F2' },
          ].map((a) => (
            <TouchableOpacity key={a.label} style={[styles.quickActionButton, { backgroundColor: a.bg }]} onPress={() => router.push('/quick-create')}>
              <Text style={[styles.quickActionText, { color: a.color }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Son Aktiviteler */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Son Aktiviteler</Text>
          <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
        </View>
        <View style={styles.activityList}>
          {recentActivities.map((act) => (
            <TouchableOpacity key={act.id} style={styles.activityRow} onPress={() => router.push('/modules/sales-cases')}>
              <View style={[styles.activityAvatar, { backgroundColor: act.avatarColor }]}>
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
      </View>
    </View>
  );
}

function OperasyonTab() {
  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionLead}>Dikkat Gerektiren Durumlar</Text>
      {alerts.map((a, i) => (
        <TouchableOpacity key={i} style={styles.alertCard} onPress={() => router.push('/(tabs)/operations')}>
          <View style={[styles.alertIconBox, { backgroundColor: a.bg }]}>
            <Ionicons name={a.icon as any} size={18} color={a.color} />
          </View>
          <View style={styles.alertContent}>
            <Text style={styles.alertTitle}>{a.title}</Text>
            <Text style={styles.alertBody}>{a.body}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={a.color} style={{ marginTop: 2 }} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function GrafiklerTab() {
  return (
    <View style={styles.tabContent}>
      {/* Weekly Activity */}
      <View style={styles.card}>
        <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Haftalık Aktivite</Text>
        <View style={styles.chartPlaceholder}>
          {weeklyData.map((d) => (
            <View key={d.day} style={styles.chartCol}>
              <View style={styles.chartBarStack}>
                <View style={[styles.barSlice, { height: d.teklifler * 15, backgroundColor: PRIMARY }]} />
                <View style={[styles.barSlice, { height: d.ziyaretler * 15, backgroundColor: '#10B981' }]} />
              </View>
              <Text style={styles.chartDay}>{d.day}</Text>
            </View>
          ))}
        </View>
        <View style={styles.chartLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PRIMARY }]} />
            <Text style={styles.legendText}>Teklifler</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.legendText}>Ziyaretler</Text>
          </View>
        </View>
      </View>

      {/* Satış Hunisi */}
      <View style={styles.card}>
        <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Satış Hunisi</Text>
        <View style={styles.pipelineRow}>
          {pipelineData.map((p) => (
            <View key={p.stage} style={styles.pipelineCol}>
              <Text style={styles.pipelineCount}>{p.count}</Text>
              <View style={[styles.pipelineBar, { height: Math.max(6, Math.round((p.count / pipelineMax) * 80)) }]} />
              <Text style={styles.pipelineLabel} numberOfLines={1}>{p.stage}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function HedeflerTab() {
  return (
    <View style={styles.tabContent}>
      <View style={styles.targetHeader}>
        <Ionicons name="analytics" size={16} color={PRIMARY} />
        <Text style={styles.targetHeaderText}>Haziran 2026 Hedefleri</Text>
      </View>
      {targets.map((t) => {
        const pct = Math.min(100, Math.round((t.current / t.target) * 100));
        const display = t.unit === '€'
          ? `€${(t.current / 1000).toFixed(0)}K / €${(t.target / 1000).toFixed(0)}K`
          : `${t.current} / ${t.target} ${t.unit}`;
        
        return (
          <View key={t.label} style={styles.card}>
            <View style={styles.targetRowHeader}>
              <Text style={styles.targetLabel}>{t.label}</Text>
              <Text style={[styles.targetPct, { color: t.color }]}>{pct}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: t.color }]} />
            </View>
            <Text style={styles.targetDisplay}>{display}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function DashboardScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [unread, setUnread] = useState(0);

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

  const getGreetingDate = () => {
    const now = new Date();
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        {/* Global controls — bölüm seçici + bildirim + profil */}
        <View style={styles.controlsRow}>
          <DivisionChip />
          <View style={styles.controlsRight}>
            <NotificationBell count={unread} onPress={() => router.push('/modules/notifications')} />
            <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/(tabs)/more')}>
              <Text style={styles.avatarText}>
                {(user?.fullName?.[0] ?? 'H').toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Greeting */}
        <View style={styles.greetingRow}>
          <Text style={styles.dateText}>{getGreetingDate()}</Text>
          <Text style={styles.greetingText}>Merhaba, {user?.fullName?.split(' ')[0] ?? 'Kullanıcı'} 👋</Text>
        </View>

        {/* Tabs */}
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

      {/* Tab Content */}
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {activeTab === 0 && <OzetTab />}
        {activeTab === 1 && <OperasyonTab />}
        {activeTab === 2 && <GrafiklerTab />}
        {activeTab === 3 && <HedeflerTab />}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8}>
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

