import { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000c69';
const RED = '#cf060c';

type Direction = 'all' | 'received' | 'paid';
type PayStatus = 'all' | 'paid' | 'pending' | 'overdue';

interface Payment {
  id: string;
  company: string;
  type: string;
  amount: number;
  currency: 'EUR' | 'TRY' | 'USD';
  date: string;
  dueDate?: string;
  direction: 'received' | 'paid';
  status: 'paid' | 'pending' | 'overdue';
  method: string;
}

const MOCK_PAYMENTS: Payment[] = [
  { id: 'p1', company: 'Omega Endüstri', type: 'Satış Tahsilatı', amount: 28500, currency: 'EUR', date: '25.05.2026', direction: 'received', status: 'paid', method: 'Havale' },
  { id: 'p2', company: 'Kartal Endüstri A.Ş.', type: 'Satış Tahsilatı', amount: 19800, currency: 'EUR', date: '28.05.2026', direction: 'received', status: 'paid', method: 'EFT' },
  { id: 'p3', company: 'Kaya Metal A.Ş.', type: 'Satış Tahsilatı', amount: 33700, currency: 'EUR', date: '02.06.2026', direction: 'received', status: 'paid', method: 'Çek' },
  { id: 'p4', company: 'Kontrol Elektronik Ltd.', type: 'Satın Alma', amount: 3200, currency: 'EUR', date: '26.06.2026', direction: 'paid', status: 'pending', method: 'Havale' },
  { id: 'p5', company: 'Haksan Makine A.Ş.', type: 'Satış Tahsilatı', amount: 12250, currency: 'EUR', date: '15.07.2026', dueDate: '15.07.2026', direction: 'received', status: 'pending', method: 'Havale' },
  { id: 'p6', company: 'Precision CNC Ltd.', type: 'Satış Tahsilatı', amount: 9100, currency: 'EUR', date: '20.07.2026', dueDate: '20.07.2026', direction: 'received', status: 'overdue', method: 'EFT' },
  { id: 'p7', company: 'Bozkurt Makine A.Ş.', type: 'Satış Tahsilatı', amount: 21000, currency: 'EUR', date: '01.08.2026', dueDate: '01.08.2026', direction: 'received', status: 'pending', method: 'Çek' },
  { id: 'p8', company: 'Endüstriyel Parça A.Ş.', type: 'Satın Alma', amount: 8700, currency: 'EUR', date: '20.06.2026', direction: 'paid', status: 'paid', method: 'EFT' },
];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  paid: { label: 'Ödendi', bg: '#ECFDF5', text: '#059669' },
  pending: { label: 'Bekliyor', bg: '#EEF2FF', text: PRIMARY },
  overdue: { label: 'Gecikmiş', bg: '#FEF2F2', text: RED },
};

const AVATAR_COLORS = [PRIMARY, '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#F97316'];
function getColor(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xFFFFFF;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function PaymentsListScreen() {
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<Direction>('all');
  const [payStatus, setPayStatus] = useState<PayStatus>('all');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = MOCK_PAYMENTS.filter(p => {
    const matchSearch = p.company.toLowerCase().includes(search.toLowerCase());
    const matchDir = direction === 'all' || p.direction === direction;
    const matchStatus = payStatus === 'all' || p.status === payStatus;
    return matchSearch && matchDir && matchStatus;
  });

  const totalReceived = MOCK_PAYMENTS.filter(p => p.direction === 'received' && p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const totalPaid = MOCK_PAYMENTS.filter(p => p.direction === 'paid' && p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const balance = totalReceived - totalPaid;
  const overdueCount = MOCK_PAYMENTS.filter(p => p.status === 'overdue').length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(res => setTimeout(res, 600));
    setRefreshing(false);
  }, []);

  const renderHeader = () => (
    <View style={styles.headerBar}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#111827" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Ödemeler & Kasa</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {renderHeader()}

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        stickyHeaderIndices={[2, 3]} // Optional: you can sticky the tabs
      >
        {/* KPI Cards */}
        <View style={styles.kpiContainer}>
          <View style={styles.kpiHeaderRow}>
            <Text style={styles.kpiTitle}>Kasa Özeti</Text>
            <View style={styles.fxBadge}>
              <Text style={styles.fxBadgeText}>€1 = ₺33.20</Text>
            </View>
          </View>
          <View style={styles.kpiCardsRow}>
            <View style={[styles.kpiCard, { backgroundColor: '#ECFDF5' }]}>
              <View style={styles.kpiIconRow}>
                <Ionicons name="trending-up" size={12} color="#059669" />
                <Text style={styles.kpiLabel}>Alınan</Text>
              </View>
              <Text style={[styles.kpiValue, { color: '#059669' }]}>€{(totalReceived / 1000).toFixed(0)}K</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: '#FEF2F2' }]}>
              <View style={styles.kpiIconRow}>
                <Ionicons name="trending-down" size={12} color={RED} />
                <Text style={styles.kpiLabel}>Ödenen</Text>
              </View>
              <Text style={[styles.kpiValue, { color: RED }]}>€{(totalPaid / 1000).toFixed(0)}K</Text>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: '#EEF2FF' }]}>
              <View style={styles.kpiIconRow}>
                <Ionicons name="cash" size={12} color={PRIMARY} />
                <Text style={styles.kpiLabel}>Bakiye</Text>
              </View>
              <Text style={[styles.kpiValue, { color: PRIMARY }]}>€{(balance / 1000).toFixed(0)}K</Text>
            </View>
          </View>
          {overdueCount > 0 && (
            <View style={styles.overdueAlert}>
              <Ionicons name="alert-circle" size={14} color={RED} />
              <Text style={styles.overdueText}>{overdueCount} gecikmiş ödeme var</Text>
            </View>
          )}
        </View>

        {/* Direction Tabs */}
        <View style={styles.tabsContainer}>
          {[
            { key: 'all' as Direction, label: 'Tümü' },
            { key: 'received' as Direction, label: 'Alınan' },
            { key: 'paid' as Direction, label: 'Ödenen' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setDirection(tab.key)}
              style={[styles.tabBtn, direction === tab.key && styles.tabBtnActive]}
            >
              <Text style={[styles.tabText, direction === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Status Chips */}
        <View style={styles.chipsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(['all', 'paid', 'pending', 'overdue'] as PayStatus[]).map(s => {
              const labels: Record<PayStatus, string> = { all: 'Tümü', paid: 'Ödendi', pending: 'Bekliyor', overdue: 'Gecikmiş' };
              const isActive = payStatus === s;
              const activeBg = s === 'overdue' ? RED : PRIMARY;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setPayStatus(s)}
                  style={[
                    styles.chipBtn,
                    { backgroundColor: isActive ? activeBg : '#F3F4F6' }
                  ]}
                >
                  <Text style={[styles.chipText, { color: isActive ? '#fff' : '#6B7280' }]}>
                    {labels[s]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search" size={14} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Firma ara..."
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        {/* List */}
        <View style={styles.listContainer}>
          {filtered.map(p => {
            const cfg = STATUS_CONFIG[p.status];
            const color = getColor(p.company);
            const isReceived = p.direction === 'received';
            return (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.8}
                onPress={() => router.push(`/modules/payments/${p.id}`)}
                style={styles.card}
              >
                <View style={[styles.avatar, { backgroundColor: color }]}>
                  <Text style={styles.avatarText}>{p.company.charAt(0)}</Text>
                </View>

                <View style={styles.infoCol}>
                  <Text style={styles.companyText} numberOfLines={1}>{p.company}</Text>
                  <View style={styles.dateRow}>
                    <Text style={styles.dateText}>{p.type}</Text>
                    <Text style={styles.dateDot}>·</Text>
                    <Text style={styles.dateText}>{p.date}</Text>
                    <Text style={styles.dateDot}>·</Text>
                    <Text style={styles.dateText}>{p.method}</Text>
                  </View>
                </View>

                <View style={styles.amountCol}>
                  <Text style={[styles.amountText, { color: isReceived ? '#059669' : RED }]}>
                    {isReceived ? '+' : '-'}€{p.amount.toLocaleString('tr-TR')}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.fab} activeOpacity={0.8}>
        <Ionicons name="add" size={24} color="#ffffff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },

  mainScroll: { flex: 1 },
  mainContent: { paddingBottom: 100 },

  kpiContainer: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiTitle: { fontSize: 12, fontWeight: '600', color: '#1a1c1d' },
  fxBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  fxBadgeText: { fontSize: 10, fontWeight: '600', color: '#717182' },
  kpiCardsRow: { flexDirection: 'row', gap: 8 },
  kpiCard: { flex: 1, borderRadius: 12, padding: 10 },
  kpiIconRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  kpiLabel: { fontSize: 10, fontWeight: '500', color: '#717182' },
  kpiValue: { fontSize: 14, fontWeight: '900' },
  overdueAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 8,
    gap: 8,
  },
  overdueText: { fontSize: 12, fontWeight: '600', color: RED },

  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 12, fontWeight: '600', color: '#717182' },
  tabTextActive: { color: PRIMARY },

  chipsContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  chipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chipText: { fontSize: 12, fontWeight: '600' },

  searchContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#1a1c1d', padding: 0 },

  listContainer: { padding: 16, gap: 10 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 16,
    elevation: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  
  infoCol: { flex: 1, minWidth: 0 },
  companyText: { fontSize: 14, fontWeight: '700', color: '#1a1c1d' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  dateText: { fontSize: 11, color: '#717182' },
  dateDot: { fontSize: 11, color: '#d1d5db' },

  amountCol: { alignItems: 'flex-end', gap: 4 },
  amountText: { fontSize: 14, fontWeight: '900' },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 },
  statusBadgeText: { fontSize: 10, fontWeight: '600' },

  fab: {
    position: 'absolute',
    bottom: 24,
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
