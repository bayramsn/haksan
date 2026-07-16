import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  TextInput,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { productService } from '@/src/api/services';
import { ListPageLayout } from '@/src/ui/ListPageLayout';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';
import { ListRow } from '@/src/ui/ListRow';

const PRIMARY = '#000c69';

const revenueData = [
  { month: 'Oca', gelir: 38000, maliyet: 22000 },
  { month: 'Şub', gelir: 42000, maliyet: 25000 },
  { month: 'Mar', gelir: 51000, maliyet: 29000 },
  { month: 'Nis', gelir: 47000, maliyet: 28000 },
  { month: 'May', gelir: 58000, maliyet: 31000 },
  { month: 'Haz', gelir: 63000, maliyet: 34000 },
];

const pipelineData = [
  { stage: 'Lead', count: 2 },
  { stage: 'Arama', count: 4 },
  { stage: 'Ziyaret', count: 6 },
  { stage: 'Teklif', count: 5 },
  { stage: 'Satış', count: 3 },
];

const serviceComplaintData = [
  { month: 'Oca', sikayet: 3, cozulen: 2 },
  { month: 'Şub', sikayet: 5, cozulen: 4 },
  { month: 'Mar', sikayet: 2, cozulen: 2 },
  { month: 'Nis', sikayet: 4, cozulen: 3 },
  { month: 'May', sikayet: 6, cozulen: 5 },
  { month: 'Haz', sikayet: 3, cozulen: 3 },
];

const deptData = [
  { dept: 'Satış', hedef: 120000, gercek: 82000 },
  { dept: 'Servis', hedef: 30000, gercek: 18500 },
  { dept: 'Stok', hedef: 50000, gercek: 38000 },
];

const productQuoteData = [
  { product: 'VMC 850', count: 8 },
  { product: 'FC 3015', count: 6 },
  { product: 'TC 500', count: 5 },
  { product: 'P3000', count: 3 },
  { product: 'R2040', count: 4 },
];

const TABS = ['Operasyonel', 'Karlılık', 'Analitik'];

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={repStyles.chartCard}>
      <Text style={repStyles.chartCardTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** Stitch #56 Raporlar */
export function ReportsScreen() {
  const [activeTab, setActiveTab] = useState(0);

  const renderHeader = () => (
    <View style={repStyles.headerBar}>
      <TouchableOpacity onPress={() => router.back()} style={repStyles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#111827" />
      </TouchableOpacity>
      <Text style={repStyles.headerTitle}>Raporlar</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  return (
    <SafeAreaView style={repStyles.root} edges={['top', 'left', 'right']}>
      {renderHeader()}

      <View style={repStyles.tabsWrapper}>
        <View style={repStyles.tabsContainer}>
          {TABS.map((tab, i) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(i)}
              style={[repStyles.tabBtn, activeTab === i && repStyles.tabBtnActive]}
            >
              <Text style={[repStyles.tabText, activeTab === i && repStyles.tabTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={repStyles.scrollArea} contentContainerStyle={repStyles.contentContainer}>
        {activeTab === 0 && (
          <>
            <View style={repStyles.kpiRow}>
              <View style={[repStyles.kpiCard, { backgroundColor: '#EEF2FF' }]}>
                <Text style={[repStyles.kpiVal, { color: PRIMARY }]}>€252K</Text>
                <Text style={repStyles.kpiLabel}>Pipeline Değeri</Text>
              </View>
              <View style={[repStyles.kpiCard, { backgroundColor: '#ECFDF5' }]}>
                <Text style={[repStyles.kpiVal, { color: '#059669' }]}>66</Text>
                <Text style={repStyles.kpiLabel}>Aylık Ziyaret</Text>
              </View>
              <View style={[repStyles.kpiCard, { backgroundColor: '#FFFBEB' }]}>
                <Text style={[repStyles.kpiVal, { color: '#F59E0B' }]}>%87</Text>
                <Text style={repStyles.kpiLabel}>Servis SLA</Text>
              </View>
            </View>

            <ChartCard title="Satış Hunisi (Kart Sayısı)">
              <View style={repStyles.barChartRow}>
                {pipelineData.map(d => {
                  const h = Math.max(10, (d.count / 6) * 100);
                  return (
                    <View key={d.stage} style={repStyles.barCol}>
                      <View style={repStyles.barWrapper}>
                        <View style={[repStyles.barFill, { height: `${h}%`, backgroundColor: PRIMARY }]} />
                      </View>
                      <Text style={repStyles.barLabel}>{d.stage}</Text>
                    </View>
                  );
                })}
              </View>
            </ChartCard>

            <ChartCard title="Servis Şikayet Özeti">
              <View style={repStyles.barChartRow}>
                {serviceComplaintData.map(d => {
                  const max = 6;
                  const sh = Math.max(5, (d.sikayet / max) * 100);
                  const ch = Math.max(5, (d.cozulen / max) * 100);
                  return (
                    <View key={d.month} style={repStyles.barCol}>
                      <View style={[repStyles.barWrapper, { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }]}>
                        <View style={[repStyles.barFill, { width: 10, height: `${sh}%`, backgroundColor: '#cf060c', opacity: 0.7 }]} />
                        <View style={[repStyles.barFill, { width: 10, height: `${ch}%`, backgroundColor: '#10B981' }]} />
                      </View>
                      <Text style={repStyles.barLabel}>{d.month}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={repStyles.legendRow}>
                <View style={repStyles.legendItem}>
                  <View style={[repStyles.legendDot, { backgroundColor: '#cf060c', opacity: 0.7 }]} />
                  <Text style={repStyles.legendText}>Şikayet</Text>
                </View>
                <View style={repStyles.legendItem}>
                  <View style={[repStyles.legendDot, { backgroundColor: '#10B981' }]} />
                  <Text style={repStyles.legendText}>Çözülen</Text>
                </View>
              </View>
            </ChartCard>
          </>
        )}

        {activeTab === 1 && (
          <>
            <View style={repStyles.kpiRow}>
              <View style={[repStyles.kpiCard, { backgroundColor: '#ECFDF5' }]}>
                <Text style={[repStyles.kpiVal, { color: '#059669' }]}>€299K</Text>
                <Text style={repStyles.kpiLabel}>Toplam Gelir</Text>
              </View>
              <View style={[repStyles.kpiCard, { backgroundColor: '#FEF2F2' }]}>
                <Text style={[repStyles.kpiVal, { color: '#cf060c' }]}>€169K</Text>
                <Text style={repStyles.kpiLabel}>Maliyet</Text>
              </View>
              <View style={[repStyles.kpiCard, { backgroundColor: '#EEF2FF' }]}>
                <Text style={[repStyles.kpiVal, { color: PRIMARY }]}>%43</Text>
                <Text style={repStyles.kpiLabel}>Kâr Marjı</Text>
              </View>
            </View>

            <ChartCard title="Aylık Gelir vs Maliyet">
              <View style={repStyles.barChartRow}>
                {revenueData.map(d => {
                  const max = 65000;
                  const gh = Math.max(5, (d.gelir / max) * 100);
                  const mh = Math.max(5, (d.maliyet / max) * 100);
                  return (
                    <View key={d.month} style={repStyles.barCol}>
                      <View style={[repStyles.barWrapper, { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }]}>
                        <View style={[repStyles.barFill, { width: 10, height: `${gh}%`, backgroundColor: PRIMARY }]} />
                        <View style={[repStyles.barFill, { width: 10, height: `${mh}%`, backgroundColor: '#cf060c', opacity: 0.6 }]} />
                      </View>
                      <Text style={repStyles.barLabel}>{d.month}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={repStyles.legendRow}>
                <View style={repStyles.legendItem}>
                  <View style={[repStyles.legendDot, { backgroundColor: PRIMARY }]} />
                  <Text style={repStyles.legendText}>Gelir</Text>
                </View>
                <View style={repStyles.legendItem}>
                  <View style={[repStyles.legendDot, { backgroundColor: '#cf060c', opacity: 0.6 }]} />
                  <Text style={repStyles.legendText}>Maliyet</Text>
                </View>
              </View>
            </ChartCard>

            <ChartCard title="Departman Performansı">
              <View style={{ gap: 12 }}>
                {deptData.map(d => {
                  const pct = Math.min(100, Math.round((d.gercek / d.hedef) * 100));
                  return (
                    <View key={d.dept}>
                      <View style={repStyles.progressHeader}>
                        <Text style={repStyles.progressTitle}>{d.dept}</Text>
                        <Text style={[repStyles.progressPct, { color: PRIMARY }]}>{pct}%</Text>
                      </View>
                      <View style={repStyles.progressTrack}>
                        <View style={[repStyles.progressFill, { width: `${pct}%`, backgroundColor: PRIMARY }]} />
                      </View>
                      <Text style={repStyles.progressSub}>€{(d.gercek / 1000).toFixed(0)}K / €{(d.hedef / 1000).toFixed(0)}K</Text>
                    </View>
                  );
                })}
              </View>
            </ChartCard>

            <TouchableOpacity style={repStyles.downloadBtn} activeOpacity={0.8}>
              <Ionicons name="download-outline" size={16} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={repStyles.downloadBtnText}>Yıl Sonu Raporu İndir</Text>
            </TouchableOpacity>
          </>
        )}

        {activeTab === 2 && (
          <>
            <ChartCard title="Ürün Bazlı Teklif Sayısı">
              <View style={{ gap: 8 }}>
                {productQuoteData.map(d => {
                  const pct = Math.max(10, (d.count / 8) * 100);
                  return (
                    <View key={d.product} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ width: 60, fontSize: 10, color: '#717182' }}>{d.product}</Text>
                      <View style={{ flex: 1, height: 16, flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ height: 16, backgroundColor: PRIMARY, width: `${pct}%`, borderRadius: 4, marginRight: 8 }} />
                        <Text style={{ fontSize: 10, fontWeight: '700' }}>{d.count}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ChartCard>

            <View style={repStyles.actionRow}>
              <TouchableOpacity style={repStyles.actionBtnOutline}>
                <Ionicons name="document-text-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
                <Text style={repStyles.actionBtnOutlineText}>Excel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={repStyles.actionBtnPrimary}>
                <Ionicons name="stats-chart" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={repStyles.actionBtnPrimaryText}>Rapor Oluştur</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const repStyles = StyleSheet.create({
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

  tabsWrapper: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  tabsContainer: { flexDirection: 'row', paddingHorizontal: 16 },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  tabBtnActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 12, fontWeight: '600', color: '#717182' },
  tabTextActive: { color: PRIMARY },

  scrollArea: { flex: 1 },
  contentContainer: { padding: 16, gap: 12, paddingBottom: 100 },

  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiCard: { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
  kpiVal: { fontSize: 14, fontWeight: '900' },
  kpiLabel: { fontSize: 10, fontWeight: '500', color: '#717182', marginTop: 2, textAlign: 'center' },

  chartCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  chartCardTitle: { fontSize: 14, fontWeight: '700', color: '#1a1c1d', marginBottom: 12 },

  barChartRow: { flexDirection: 'row', height: 100, alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 10 },
  barCol: { alignItems: 'center', flex: 1 },
  barWrapper: { height: 70, width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  barFill: { width: 20, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { fontSize: 9, color: '#9CA3AF', marginTop: 4 },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: '#717182' },

  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressTitle: { fontSize: 12, fontWeight: '600', color: '#1a1c1d' },
  progressPct: { fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressSub: { fontSize: 10, color: '#717182', marginTop: 4 },

  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  downloadBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  actionBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(0,0,0,0.12)' },
  actionBtnOutlineText: { fontSize: 14, fontWeight: '700', color: '#1a1c1d' },
  actionBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: PRIMARY },
  actionBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
});

const RED = '#cf060c';

interface Statement {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
}

const MOCK_STATEMENTS: Record<string, Statement[]> = {
  c1: [
    { id: 's1', date: '01.06.2026', description: 'Satış faturası - TKL-2026-001', amount: 24500, type: 'debit' },
    { id: 's2', date: '15.06.2026', description: 'Tahsilat - EFT', amount: 12250, type: 'credit' },
  ],
  c3: [
    { id: 's3', date: '05.06.2026', description: 'Satış faturası - TKL-2026-002', amount: 18200, type: 'debit' },
    { id: 's4', date: '20.06.2026', description: 'Tahsilat - Çek', amount: 18200, type: 'credit' },
  ],
  c8: [
    { id: 's5', date: '08.06.2026', description: 'Satış faturası - TKL-2026-003', amount: 31000, type: 'debit' },
  ],
};

const FAKE_BALANCES: Record<string, number> = {
  c1: 12250, c2: 0, c3: 0, c4: 5500, c5: 8900, c6: 0, c7: -2000,
  c8: 31000, c9: 7200, c10: 0, c11: 15000, c12: 5500, c13: 11000,
  c14: 0, c15: 8500, c16: 42000, c17: 0, c18: 19800, c19: 0, c20: 6300,
};

const MOCK_COMPANIES = [
  { id: 'c1', name: 'Haksan Makine A.Ş.', city: 'İstanbul', sector: 'Makine', avatarColor: '#000c69' },
  { id: 'c3', name: 'Kaya Metal A.Ş.', city: 'Bursa', sector: 'Metal', avatarColor: '#F59E0B' },
  { id: 'c8', name: 'Bozkurt Makine A.Ş.', city: 'Kocaeli', sector: 'Makine', avatarColor: '#10B981' },
  { id: 'c7', name: 'Beta Tedarik', city: 'İzmir', sector: 'Hizmet', avatarColor: '#EF4444' },
];

/** Stitch #48 Cari / Ekstre */
export function CustomerBalancesScreen() {
  const [search, setSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  const filtered = MOCK_COMPANIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.city.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCo = MOCK_COMPANIES.find(c => c.id === selectedCompany);
  const statements = MOCK_STATEMENTS[selectedCompany ?? ''] ?? [];

  const totalAlacak = Object.values(FAKE_BALANCES).filter(v => v > 0).reduce((s, v) => s + v, 0);
  const totalBorc = Math.abs(Object.values(FAKE_BALANCES).filter(v => v < 0).reduce((s, v) => s + v, 0));

  const renderHeader = () => (
    <View style={cbStyles.headerBar}>
      <TouchableOpacity onPress={() => router.back()} style={cbStyles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#111827" />
      </TouchableOpacity>
      <Text style={cbStyles.headerTitle}>Cari Rapor</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  return (
    <SafeAreaView style={cbStyles.root} edges={['top', 'left', 'right']}>
      {renderHeader()}

      {/* Toolbar */}
      <View style={cbStyles.toolbar}>
        <View style={cbStyles.toolbarRow}>
          <View style={cbStyles.searchInputWrapper}>
            <Ionicons name="search" size={14} color="#9ca3af" />
            <TextInput
              style={cbStyles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Firma ara..."
              placeholderTextColor="#9ca3af"
            />
          </View>
          <TouchableOpacity style={cbStyles.iconBtn}>
            <Ionicons name="refresh" size={16} color="#717182" />
          </TouchableOpacity>
          <TouchableOpacity style={cbStyles.iconBtn}>
            <Ionicons name="document-text" size={16} color="#059669" />
          </TouchableOpacity>
        </View>

        <View style={cbStyles.summaryRow}>
          <View style={cbStyles.summaryCard}>
            <Text style={[cbStyles.summaryValue, { color: '#059669' }]}>
              €{(totalAlacak / 1000).toFixed(0)}K
            </Text>
            <Text style={cbStyles.summaryLabel}>Toplam Alacak</Text>
          </View>
          <View style={cbStyles.summaryCard}>
            <Text style={[cbStyles.summaryValue, { color: RED }]}>
              €{(totalBorc / 1000).toFixed(0)}K
            </Text>
            <Text style={cbStyles.summaryLabel}>Toplam Borç</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={({ item }) => {
          const balance = FAKE_BALANCES[item.id] ?? 0;
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSelectedCompany(item.id)}
              style={cbStyles.listRow}
            >
              <View style={[cbStyles.avatar, { backgroundColor: item.avatarColor }]}>
                <Text style={cbStyles.avatarText}>{item.name.charAt(0)}</Text>
              </View>
              <View style={cbStyles.listInfo}>
                <Text style={cbStyles.listTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={cbStyles.listSubtitle}>{item.city} · {item.sector}</Text>
              </View>
              <View style={cbStyles.listRight}>
                {balance !== 0 ? (
                  <Text style={[cbStyles.balanceText, { color: balance > 0 ? '#059669' : RED }]}>
                    {balance > 0 ? '+' : ''}€{Math.abs(balance).toLocaleString('tr-TR')}
                  </Text>
                ) : (
                  <Text style={[cbStyles.balanceText, { color: '#717182' }]}>€0</Text>
                )}
                {balance !== 0 && (
                  <Text style={[cbStyles.balanceLabel, { color: balance > 0 ? '#059669' : RED }]}>
                    {balance > 0 ? 'Alacak' : 'Borç'}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          );
        }}
      />

      {/* Sheet */}
      <Modal visible={!!selectedCompany} transparent animationType="slide">
        <View style={cbStyles.sheetOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setSelectedCompany(null)} />
          <View style={cbStyles.sheetContent}>
            <View style={cbStyles.sheetHandle} />
            <View style={cbStyles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={cbStyles.sheetTitle}>{selectedCo?.name}</Text>
                <Text style={cbStyles.sheetSubtitle}>Cari Hesap Ekstresi</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedCompany(null)} style={cbStyles.sheetClose}>
                <Ionicons name="close" size={20} color="#717182" />
              </TouchableOpacity>
            </View>
            
            <View style={cbStyles.sheetKpiRow}>
              <View style={[cbStyles.sheetKpiCard, { backgroundColor: '#FEF2F2' }]}>
                <Text style={[cbStyles.sheetKpiVal, { color: RED }]}>
                  €{((statements.filter(s => s.type === 'debit').reduce((sum, s) => sum + s.amount, 0) + (FAKE_BALANCES[selectedCompany ?? ''] ?? 0))).toLocaleString('tr-TR')}
                </Text>
                <Text style={cbStyles.sheetKpiLabel}>Borç</Text>
              </View>
              <View style={[cbStyles.sheetKpiCard, { backgroundColor: '#ECFDF5' }]}>
                <Text style={[cbStyles.sheetKpiVal, { color: '#059669' }]}>
                  €{statements.filter(s => s.type === 'credit').reduce((sum, s) => sum + s.amount, 0).toLocaleString('tr-TR')}
                </Text>
                <Text style={cbStyles.sheetKpiLabel}>Alacak</Text>
              </View>
              <View style={[cbStyles.sheetKpiCard, { backgroundColor: '#EEF2FF' }]}>
                <Text style={[cbStyles.sheetKpiVal, { color: PRIMARY }]}>
                  €{(FAKE_BALANCES[selectedCompany ?? ''] ?? 0).toLocaleString('tr-TR')}
                </Text>
                <Text style={cbStyles.sheetKpiLabel}>Bakiye</Text>
              </View>
            </View>

            <ScrollView style={{ flex: 1 }}>
              {statements.length === 0 ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Text style={{ color: '#717182' }}>Hareket bulunamadı</Text>
                </View>
              ) : (
                statements.map(s => (
                  <View key={s.id} style={cbStyles.stmtRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={cbStyles.stmtDesc}>{s.description}</Text>
                      <Text style={cbStyles.stmtDate}>{s.date}</Text>
                    </View>
                    <Text style={[cbStyles.stmtAmount, { color: s.type === 'credit' ? '#059669' : RED }]}>
                      {s.type === 'credit' ? '+' : '-'}€{s.amount.toLocaleString('tr-TR')}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={cbStyles.sheetActions}>
              <TouchableOpacity style={cbStyles.actionBtnOutline}>
                <Ionicons name="document-text" size={16} color="#059669" style={{ marginRight: 4 }} />
                <Text style={cbStyles.actionBtnOutlineText}>Excel Ekstre</Text>
              </TouchableOpacity>
              <TouchableOpacity style={cbStyles.actionBtnPrimary}>
                <Text style={cbStyles.actionBtnPrimaryText}>PDF Ekstre</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const cbStyles = StyleSheet.create({
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
  toolbar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
    gap: 8,
  },
  toolbarRow: { flexDirection: 'row', gap: 8 },
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
  iconBtn: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCard: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 12, padding: 8 },
  summaryValue: { fontSize: 14, fontWeight: '900' },
  summaryLabel: { fontSize: 10, color: '#717182' },
  
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  avatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  listInfo: { flex: 1, minWidth: 0 },
  listTitle: { fontSize: 14, fontWeight: '700', color: '#1a1c1d' },
  listSubtitle: { fontSize: 12, color: '#717182', marginTop: 2 },
  listRight: { alignItems: 'flex-end' },
  balanceText: { fontSize: 14, fontWeight: '900' },
  balanceLabel: { fontSize: 10, marginTop: 2 },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheetContent: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#1a1c1d' },
  sheetSubtitle: { fontSize: 12, color: '#717182', marginTop: 2 },
  sheetClose: { padding: 4 },
  
  sheetKpiRow: { flexDirection: 'row', gap: 8, padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  sheetKpiCard: { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  sheetKpiVal: { fontSize: 14, fontWeight: '900' },
  sheetKpiLabel: { fontSize: 10, color: '#717182', marginTop: 2 },

  stmtRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  stmtDesc: { fontSize: 12, fontWeight: '600', color: '#1a1c1d' },
  stmtDate: { fontSize: 11, color: '#717182', marginTop: 2 },
  stmtAmount: { fontSize: 14, fontWeight: '900' },

  sheetActions: { flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingBottom: 32 },
  actionBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(0,0,0,0.1)' },
  actionBtnOutlineText: { fontSize: 12, fontWeight: '700', color: '#1a1c1d' },
  actionBtnPrimary: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: PRIMARY },
  actionBtnPrimaryText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
});

/** Stitch #55 Fiyat listesi */
export function PriceListScreen() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void productService
      .listPriceLists()
      .then((r) => {
        if (!active) return;
        const data = 'data' in r ? r.data : (r as unknown as Record<string, unknown>[]);
        setRows(data as Record<string, unknown>[]);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <ListPageLayout title="Satış Fiyat Listesi" subtitle={loading ? undefined : `${rows.length} liste`}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(row, i) => String(row.id ?? i)}
          contentContainerStyle={{ padding: layout.screenPadding, paddingTop: spacing.sm, paddingBottom: spacing.lg }}
          renderItem={({ item: row }) => (
            <ListRow
              title={String(row.name ?? 'Liste')}
              subtitle={String(row.currencyCode ?? '')}
              onPress={() =>
                router.push(
                  `/forms/price-list-detail?id=${encodeURIComponent(String(row.id))}&name=${encodeURIComponent(String(row.name ?? 'Liste'))}`
                )
              }
            />
          )}
        />
      )}
    </ListPageLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  headerTitle: { ...typography.headline, color: '#fff' },
  body: { padding: layout.screenPadding, gap: spacing.sm, paddingBottom: spacing.lg },
  kpi: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  muted: { ...typography.bodySm, color: colors.textMuted, marginBottom: spacing.sm },
});
