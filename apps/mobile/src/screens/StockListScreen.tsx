import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000c69';

type StockView = 'makine' | 'seri';
type StockStatus = 'all' | 'hazir' | 'rezerve' | 'satilan' | 'pasif';

interface MachineStock {
  id: string;
  model: string;
  brand: string;
  category: string;
  total: number;
  available: number;
  reserved: number;
  sold: number;
}

interface SerialStock {
  id: string;
  serial: string;
  model: string;
  brand: string;
  warehouse: string;
  status: 'hazir' | 'rezerve' | 'satilan' | 'pasif';
  reservedFor?: string;
  cost?: number;
  entryDate: string;
}

const MACHINE_STOCK: MachineStock[] = [
  { id: 'ms1', model: 'VMC 850', brand: 'Haksan', category: 'CNC', total: 5, available: 3, reserved: 1, sold: 1 },
  { id: 'ms2', model: 'TC 500', brand: 'Haksan', category: 'CNC', total: 4, available: 2, reserved: 1, sold: 1 },
  { id: 'ms3', model: 'FC 3015', brand: 'Haksan', category: 'Sac İşleme', total: 3, available: 2, reserved: 0, sold: 1 },
  { id: 'ms4', model: 'P3000', brand: 'Haksan', category: 'Sac İşleme', total: 2, available: 1, reserved: 1, sold: 0 },
  { id: 'ms5', model: 'R2040', brand: 'Haksan', category: 'CNC Router', total: 4, available: 3, reserved: 0, sold: 1 },
  { id: 'ms6', model: 'VMC 1100', brand: 'Haksan', category: 'CNC', total: 2, available: 1, reserved: 1, sold: 0 },
];

const SERIAL_STOCK: SerialStock[] = [
  { id: 'ss1', serial: 'VMC-2026-001', model: 'VMC 850', brand: 'Haksan', warehouse: 'Ana Depo', status: 'hazir', entryDate: '01.03.2026' },
  { id: 'ss2', serial: 'VMC-2026-002', model: 'VMC 850', brand: 'Haksan', warehouse: 'Ana Depo', status: 'rezerve', reservedFor: 'Haksan Makine A.Ş.', entryDate: '01.03.2026' },
  { id: 'ss3', serial: 'TC-2026-001', model: 'TC 500', brand: 'Haksan', warehouse: 'Ana Depo', status: 'hazir', entryDate: '15.04.2026' },
  { id: 'ss4', serial: 'FC-2026-001', model: 'FC 3015', brand: 'Haksan', warehouse: 'Ana Depo', status: 'satilan', entryDate: '10.02.2026' },
  { id: 'ss5', serial: 'P-2026-001', model: 'P3000', brand: 'Haksan', warehouse: 'İzmir Depo', status: 'rezerve', reservedFor: 'Omega Endüstri', entryDate: '20.03.2026' },
  { id: 'ss6', serial: 'VMC-2025-045', model: 'VMC 850', brand: 'Haksan', warehouse: 'Ana Depo', status: 'hazir', entryDate: '01.12.2025' },
  { id: 'ss7', serial: 'R-2026-001', model: 'R2040', brand: 'Haksan', warehouse: 'Ana Depo', status: 'hazir', entryDate: '05.05.2026' },
  { id: 'ss8', serial: 'VMC-2026-003', model: 'VMC 1100', brand: 'Haksan', warehouse: 'Bursa Depo', status: 'rezerve', reservedFor: 'Bozkurt Makine A.Ş.', entryDate: '15.05.2026' },
];

const SERIAL_STATUS_CONFIG: Record<SerialStock['status'], { label: string; bg: string; text: string }> = {
  hazir: { label: 'Hazır', bg: '#ECFDF5', text: '#059669' },
  rezerve: { label: 'Rezerve', bg: '#EEF2FF', text: PRIMARY },
  satilan: { label: 'Satılan', bg: '#F3F4F6', text: '#6B7280' },
  pasif: { label: 'Pasif', bg: '#FEF2F2', text: '#cf060c' },
};

const STATUS_TABS: { key: StockStatus; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'hazir', label: 'Hazır' },
  { key: 'rezerve', label: 'Rezerve' },
  { key: 'satilan', label: 'Satılan' },
  { key: 'pasif', label: 'Pasif' },
];

const CATEGORY_COLORS: Record<string, string> = {
  CNC: PRIMARY,
  'Sac İşleme': '#F97316',
  'CNC Router': '#8B5CF6',
};

export function StockListScreen() {
  const [view, setView] = useState<StockView>('makine');
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<StockStatus>('all');

  const filteredMachine = MACHINE_STOCK.filter(m =>
    `${m.model} ${m.brand} ${m.category}`.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSerial = SERIAL_STOCK.filter(s => {
    const matchSearch = `${s.serial} ${s.model} ${s.brand}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusTab === 'all' || s.status === statusTab;
    return matchSearch && matchStatus;
  });

  const renderHeader = () => (
    <View style={styles.headerBar}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#111827" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Stok Yönetimi</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {renderHeader()}

      <View style={styles.viewToggleContainer}>
        <View style={styles.viewToggleInner}>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'makine' && styles.toggleBtnActive]}
            onPress={() => setView('makine')}
          >
            <Ionicons name="cube-outline" size={14} color={view === 'makine' ? '#1a1c1d' : '#717182'} style={{ marginRight: 4 }} />
            <Text style={[styles.toggleBtnText, view === 'makine' && styles.toggleBtnTextActive]}>
              Makine Stoğu
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'seri' && styles.toggleBtnActive]}
            onPress={() => setView('seri')}
          >
            <Ionicons name="barcode-outline" size={14} color={view === 'seri' ? '#1a1c1d' : '#717182'} style={{ marginRight: 4 }} />
            <Text style={[styles.toggleBtnText, view === 'seri' && styles.toggleBtnTextActive]}>
              Seri Bazlı
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {view === 'seri' && (
        <View style={styles.tabsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
            {STATUS_TABS.map(tab => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setStatusTab(tab.key)}
                style={[styles.tabBtn, statusTab === tab.key && styles.tabBtnActive]}
              >
                <Text style={[styles.tabText, statusTab === tab.key && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.searchBar}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={14} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={view === 'makine' ? 'Model veya kategori ara...' : 'Seri no veya model ara...'}
            placeholderTextColor="#9ca3af"
          />
        </View>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.listContainer}>
        {view === 'makine' ? (
          filteredMachine.map(m => {
            const catColor = CATEGORY_COLORS[m.category] ?? PRIMARY;
            return (
              <View key={m.id} style={styles.machineCard}>
                <View style={styles.machineCardHeader}>
                  <View style={[styles.machineIcon, { backgroundColor: catColor }]}>
                    <Text style={styles.machineIconText}>{m.model.charAt(0)}</Text>
                  </View>
                  <View style={styles.machineInfo}>
                    <Text style={styles.machineTitle}>{m.brand} {m.model}</Text>
                    <Text style={styles.machineSubtitle}>{m.category} · Toplam: {m.total} adet</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                </View>
                <View style={styles.stockBreakdown}>
                  <View style={[styles.stockBox, { backgroundColor: '#ECFDF5' }]}>
                    <Text style={[styles.stockBoxVal, { color: '#059669' }]}>{m.available}</Text>
                    <Text style={[styles.stockBoxLabel, { color: '#059669' }]}>Hazır</Text>
                  </View>
                  <View style={[styles.stockBox, { backgroundColor: '#EEF2FF' }]}>
                    <Text style={[styles.stockBoxVal, { color: PRIMARY }]}>{m.reserved}</Text>
                    <Text style={[styles.stockBoxLabel, { color: PRIMARY }]}>Rezerve</Text>
                  </View>
                  <View style={[styles.stockBox, { backgroundColor: '#F3F4F6' }]}>
                    <Text style={[styles.stockBoxVal, { color: '#6B7280' }]}>{m.sold}</Text>
                    <Text style={[styles.stockBoxLabel, { color: '#6B7280' }]}>Satılan</Text>
                  </View>
                </View>
              </View>
            );
          })
        ) : (
          filteredSerial.map(s => {
            const cfg = SERIAL_STATUS_CONFIG[s.status];
            return (
              <View key={s.id} style={styles.serialCard}>
                <View style={styles.serialIcon}>
                  <Ionicons name="barcode-outline" size={16} color="#717182" />
                </View>
                <View style={styles.serialInfo}>
                  <Text style={styles.serialNo}>{s.serial}</Text>
                  <Text style={styles.serialDesc}>{s.brand} {s.model} · {s.warehouse}</Text>
                  {s.reservedFor && (
                    <Text style={styles.serialReserved}>{s.reservedFor}</Text>
                  )}
                </View>
                <View style={styles.serialRight}>
                  <View style={[styles.serialBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.serialBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
                  </View>
                  <Text style={styles.serialDate}>{s.entryDate}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: 8 }} />
              </View>
            );
          })
        )}
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

  viewToggleContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  viewToggleInner: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleBtnActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  toggleBtnText: { fontSize: 12, fontWeight: '600', color: '#717182' },
  toggleBtnTextActive: { color: '#1a1c1d' },

  tabsWrapper: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  tabsContainer: { paddingHorizontal: 16 },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 12, fontWeight: '600', color: '#717182' },
  tabTextActive: { color: PRIMARY },

  searchBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
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

  scrollArea: { flex: 1 },
  listContainer: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 100 },

  machineCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    padding: 16,
    marginTop: 6,
    marginBottom: 6,
  },
  machineCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  machineIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  machineIconText: { fontSize: 14, fontWeight: '900', color: '#ffffff' },
  machineInfo: { flex: 1 },
  machineTitle: { fontSize: 14, fontWeight: '700', color: '#1a1c1d' },
  machineSubtitle: { fontSize: 12, color: '#717182', marginTop: 2 },
  
  stockBreakdown: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stockBox: { flex: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, alignItems: 'center' },
  stockBoxVal: { fontSize: 14, fontWeight: '900' },
  stockBoxLabel: { fontSize: 10, fontWeight: '500', marginTop: 0 },

  serialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    padding: 14,
    marginTop: 6,
    marginBottom: 6,
  },
  serialIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  serialInfo: { flex: 1 },
  serialNo: { fontSize: 14, fontWeight: '700', color: '#1a1c1d', fontFamily: 'Courier' },
  serialDesc: { fontSize: 12, color: '#717182', marginTop: 2 },
  serialReserved: { fontSize: 11, fontWeight: '600', color: PRIMARY, marginTop: 2 },
  serialRight: { alignItems: 'flex-end', gap: 4 },
  serialBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 },
  serialBadgeText: { fontSize: 10, fontWeight: '600' },
  serialDate: { fontSize: 10, color: '#717182' },

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
