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

type InvoiceType = 'all' | 'satis' | 'alis';

const MOCK_INVOICES = [
  { id: 'inv1', no: 'FAT-2026-001', company: 'Omega Endüstri', type: 'satis', date: '26.05.2026', dueDate: '26.06.2026', amount: 28500, kdv: 5130, currency: 'EUR', status: 'odendi', relatedOffer: 'TKL-2026-003' },
  { id: 'inv2', no: 'FAT-2026-002', company: 'Kartal Endüstri A.Ş.', type: 'satis', date: '29.05.2026', dueDate: '29.06.2026', amount: 19800, kdv: 3564, currency: 'EUR', status: 'odendi', relatedOffer: 'TKL-2026-004' },
  { id: 'inv3', no: 'FAT-2026-003', company: 'Kaya Metal A.Ş.', type: 'satis', date: '02.06.2026', dueDate: '02.07.2026', amount: 33700, kdv: 6066, currency: 'EUR', status: 'bekliyor', relatedOffer: 'TKL-2026-002' },
  { id: 'inv4', no: 'FAT-2026-004', company: 'Kontrol Elektronik Ltd.', type: 'alis', date: '10.06.2026', dueDate: '10.07.2026', amount: 3200, kdv: 576, currency: 'EUR', status: 'odendi', relatedOffer: 'PO-2026-001' },
  { id: 'inv5', no: 'FAT-2026-005', company: 'Haksan Makine A.Ş.', type: 'satis', date: '15.06.2026', dueDate: '15.07.2026', amount: 24500, kdv: 4410, currency: 'EUR', status: 'bekliyor', relatedOffer: 'TKL-2026-001' },
  { id: 'inv6', no: 'FAT-2026-006', company: 'Endüstriyel Parça A.Ş.', type: 'alis', date: '20.06.2026', dueDate: '20.07.2026', amount: 8700, kdv: 1566, currency: 'EUR', status: 'odendi', relatedOffer: 'PO-2026-002' },
];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  odendi: { label: 'Ödendi', bg: '#ECFDF5', text: '#059669' },
  bekliyor: { label: 'Bekliyor', bg: '#EEF2FF', text: PRIMARY },
  gecikti: { label: 'Gecikti', bg: '#FEF2F2', text: '#cf060c' },
};

const TYPE_TABS: { key: InvoiceType; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'satis', label: 'Satış' },
  { key: 'alis', label: 'Alış' },
];

export function AccountingInvoicesListScreen() {
  const [search, setSearch] = useState('');
  const [typeTab, setTypeTab] = useState<InvoiceType>('all');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = MOCK_INVOICES.filter(inv => {
    const matchSearch = `${inv.no} ${inv.company}`.toLowerCase().includes(search.toLowerCase());
    const matchType = typeTab === 'all' || inv.type === typeTab;
    return matchSearch && matchType;
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(res => setTimeout(res, 600));
    setRefreshing(false);
  }, []);

  const totalAmount = filtered.reduce((s, i) => s + i.amount, 0);

  const renderHeader = () => (
    <View style={styles.headerBar}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#111827" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Faturalar</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {renderHeader()}

      <View style={styles.tabsContainer}>
        {TYPE_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setTypeTab(tab.key)}
            style={[styles.tabBtn, typeTab === tab.key && styles.tabBtnActive]}
          >
            <Text style={[styles.tabText, typeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toolbarContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={14} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Fatura no veya firma..."
            placeholderTextColor="#9ca3af"
          />
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Ionicons name="refresh" size={16} color="#717182" />
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {filtered.length} fatura · Toplam €{totalAmount.toLocaleString('tr-TR')}
        </Text>
      </View>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filtered.map(inv => {
          const cfg = STATUS_CONFIG[inv.status];
          return (
            <TouchableOpacity
              key={inv.id}
              activeOpacity={0.8}
              onPress={() => router.push(`/modules/accounting-invoices/${inv.id}`)}
              style={styles.card}
            >
              <View
                style={[
                  styles.typeIcon,
                  { backgroundColor: inv.type === 'satis' ? PRIMARY : '#F97316' }
                ]}
              >
                <Text style={styles.typeIconText}>{inv.type === 'satis' ? 'SAT' : 'ALI'}</Text>
              </View>

              <View style={styles.infoCol}>
                <Text style={styles.companyText} numberOfLines={1}>{inv.company}</Text>
                <Text style={styles.noText}>{inv.no}</Text>
                <View style={styles.dateRow}>
                  <Text style={styles.dateText}>{inv.date}</Text>
                  <Text style={styles.dateDot}>·</Text>
                  <Text style={styles.dateText}>Vade: {inv.dueDate}</Text>
                </View>
              </View>

              <View style={styles.amountCol}>
                <Text style={styles.amountText}>€{inv.amount.toLocaleString('tr-TR')}</Text>
                <Text style={styles.kdvText}>+KDV €{inv.kdv.toLocaleString('tr-TR')}</Text>
                <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
                </View>
              </View>

              <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          );
        })}
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

  toolbarContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
    gap: 8,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#1a1c1d', padding: 0 },
  refreshBtn: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statsBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  statsText: { fontSize: 11, color: '#717182' },

  listScroll: { flex: 1 },
  listContent: { padding: 16, gap: 10, paddingBottom: 100 },

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
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  typeIconText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  
  infoCol: { flex: 1, minWidth: 0 },
  companyText: { fontSize: 14, fontWeight: '700', color: '#1a1c1d' },
  noText: { fontSize: 12, color: '#717182', marginTop: 2 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dateText: { fontSize: 11, color: '#717182' },
  dateDot: { fontSize: 11, color: '#d1d5db' },

  amountCol: { alignItems: 'flex-end', gap: 4 },
  amountText: { fontSize: 14, fontWeight: '900', color: '#1a1c1d' },
  kdvText: { fontSize: 10, color: '#717182' },
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
