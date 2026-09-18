import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { productService, reportService } from '@/src/api/services';
import { ListPageLayout } from '@/src/ui/ListPageLayout';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';
import { ListRow } from '@/src/ui/ListRow';

const PRIMARY = '#000c69';

const TABS = ['Operasyonel', 'Karlılık', 'Analitik'];
const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/**
 * Raporlar ekranı SUNUCUDAN beslenir. Önceki sürüm sabit örnek seriler (gelir,
 * maliyet, şikayet, departman, ürün) basıyordu ve bunlar canlı veri sanılıyordu.
 * "Maliyet" ve "kâr marjı" sistemde tutulmadığı için hiç gösterilmez; uydurmak
 * yerine gerçekten ölçülen değerler basılır.
 */
type Bar = { label: string; primary: number; secondary?: number };
type Kpi = { key: string; label: string; value: string; color: string; bg: string };
type Progress = { label: string; current: number; target: number; pct: number };

type ReportData = {
  operationalKpis: Kpi[];
  pipeline: Bar[];
  complaints: Bar[];
  profitKpis: Kpi[];
  monthlyOutcome: Bar[];
  departments: Progress[];
  productQuotes: Bar[];
};

const compactNumber = (value: number) =>
  Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}K` : String(Math.round(value));
const formatUsd = (value: number) => `$${compactNumber(value)}`;
const currentPeriod = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
/** 403/404 yutulur: yetkisi olmayan kart boş kalır, ekranın kalanı çalışır. */
const settled = async <T,>(promise: Promise<T>): Promise<T | null> => promise.then((value) => value).catch(() => null);

async function loadReports(): Promise<ReportData> {
  const year = new Date().getFullYear();
  const period = currentPeriod();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [pipelineRows, operational, complaints, yearEnd, departmentPerformance, productRows] = await Promise.all([
    settled(reportService.pipelineSummary()),
    settled(reportService.operational({ year, period: 'monthly' })),
    settled(reportService.serviceComplaintsSummary()),
    settled(reportService.yearEnd(year)),
    settled(reportService.departmentPerformance({ period })),
    settled(reportService.monthlyQuotes({ from, to })),
  ]);

  const rows = operational?.rows ?? [];
  const quoteTotal = rows.reduce((sum, row) => sum + Number(row.quotes ?? 0), 0);
  const serviceTotal = rows.reduce((sum, row) => sum + Number(row.service ?? 0), 0);
  const pipelineValue = (pipelineRows ?? []).reduce((sum: number, row: any) => sum + Number(row.totalValue ?? 0), 0);

  const operationalKpis: Kpi[] = [
    { key: 'pipeline', label: 'Pipeline Değeri', value: formatUsd(pipelineValue), color: PRIMARY, bg: '#EEF2FF' },
    { key: 'quotes', label: `${year} Teklif`, value: String(quoteTotal), color: '#059669', bg: '#ECFDF5' },
    { key: 'service', label: `${year} Servis`, value: String(serviceTotal), color: '#F59E0B', bg: '#FFFBEB' },
  ];

  const pipeline: Bar[] = (pipelineRows ?? []).map((row: any) => ({
    label: String(row.stageName ?? row.stageCode ?? '—'),
    primary: Number(row.count ?? 0),
  }));

  // Şikayet özeti durum kırılımıdır (aylık seri sunucuda yok); uydurma ay
  // serisi yerine gerçekten dönen durumlar gösterilir.
  const complaintBars: Bar[] = complaints
    ? [
        { label: 'Yeni', primary: Number(complaints.new ?? 0) },
        { label: 'İnceleme', primary: Number(complaints.reviewing ?? 0) },
        { label: 'Servise', primary: Number(complaints.converted ?? 0) },
        { label: 'Ret', primary: Number(complaints.rejected ?? 0) },
        { label: 'Garanti', primary: Number(complaints.warrantyClaim ?? 0) },
      ]
    : [];

  const summary = yearEnd?.summary;
  const profitKpis: Kpi[] = summary
    ? [
        { key: 'won', label: 'Kazanılan', value: formatUsd(Number(summary.wonValue ?? 0)), color: '#059669', bg: '#ECFDF5' },
        { key: 'lost', label: 'Kaybedilen', value: formatUsd(Number(summary.lostValue ?? 0)), color: '#cf060c', bg: '#FEF2F2' },
        { key: 'winRate', label: 'Kazanma Oranı', value: `%${Number(summary.winRate ?? 0)}`, color: PRIMARY, bg: '#EEF2FF' },
      ]
    : [];

  const monthlyOutcome: Bar[] = (yearEnd?.monthly ?? []).map((row) => {
    const monthIndex = Number(String(row.month).slice(5, 7)) - 1;
    return {
      label: MONTH_SHORT[monthIndex] ?? String(row.month),
      primary: Number(row.wonValue ?? 0),
      secondary: Number(row.lostValue ?? 0),
    };
  });

  const departments: Progress[] = (departmentPerformance?.departments ?? []).map((dept: any) => ({
    label: String(dept.departmentName ?? '—'),
    current: Number(dept.actuals?.wonValue ?? 0),
    target: Number(dept.targets?.departmentSalesAmount ?? 0),
    pct: Number(dept.attainment?.salesPct ?? 0),
  }));

  // Ürün bazlı teklif: aynı ürün birden çok kovada/para biriminde dönebilir.
  const byProduct = new Map<string, number>();
  for (const row of productRows ?? []) {
    const name = String((row as any).productName ?? 'Diğer');
    byProduct.set(name, (byProduct.get(name) ?? 0) + Number((row as any).count ?? 0));
  }
  const productQuotes: Bar[] = [...byProduct.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([label, primary]) => ({ label, primary }));

  return { operationalKpis, pipeline, complaints: complaintBars, profitKpis, monthlyOutcome, departments, productQuotes };
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={repStyles.chartCard}>
      <Text style={repStyles.chartCardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function KpiRow({ items }: { items: Kpi[] }) {
  if (items.length === 0) return null;
  return (
    <View style={repStyles.kpiRow}>
      {items.map((kpi) => (
        <View key={kpi.key} style={[repStyles.kpiCard, { backgroundColor: kpi.bg }]}>
          <Text style={[repStyles.kpiVal, { color: kpi.color }]}>{kpi.value}</Text>
          <Text style={repStyles.kpiLabel}>{kpi.label}</Text>
        </View>
      ))}
    </View>
  );
}

function BarChart({ bars, legend }: { bars: Bar[]; legend?: [string, string] }) {
  if (bars.length === 0) return <Text style={repStyles.emptyText}>Bu dönem için kayıt yok.</Text>;
  const max = Math.max(1, ...bars.map((bar) => Math.max(bar.primary, bar.secondary ?? 0)));
  const paired = bars.some((bar) => bar.secondary != null);
  return (
    <>
      <View style={repStyles.barChartRow}>
        {bars.map((bar) => (
          <View key={bar.label} style={repStyles.barCol}>
            <View style={[repStyles.barWrapper, paired && { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }]}>
              <View style={[repStyles.barFill, paired && { width: 10 }, { height: `${Math.max(4, (bar.primary / max) * 100)}%`, backgroundColor: PRIMARY }]} />
              {paired && (
                <View style={[repStyles.barFill, { width: 10, height: `${Math.max(4, ((bar.secondary ?? 0) / max) * 100)}%`, backgroundColor: '#cf060c', opacity: 0.6 }]} />
              )}
            </View>
            <Text style={repStyles.barLabel} numberOfLines={1}>{bar.label}</Text>
          </View>
        ))}
      </View>
      {legend && (
        <View style={repStyles.legendRow}>
          <View style={repStyles.legendItem}>
            <View style={[repStyles.legendDot, { backgroundColor: PRIMARY }]} />
            <Text style={repStyles.legendText}>{legend[0]}</Text>
          </View>
          <View style={repStyles.legendItem}>
            <View style={[repStyles.legendDot, { backgroundColor: '#cf060c', opacity: 0.6 }]} />
            <Text style={repStyles.legendText}>{legend[1]}</Text>
          </View>
        </View>
      )}
    </>
  );
}

/** Stitch #56 Raporlar */
export function ReportsScreen() {
  const [activeTab, setActiveTab] = useState(0);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const year = useMemo(() => new Date().getFullYear(), []);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await loadReports());
    } catch (err: any) {
      setError(err?.message ?? 'Rapor verisi alınamadı.');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Önceden hiçbir işlem yapmayan düğme: artık sunucudaki .xlsx dökümünü indirir.
  const downloadYearEnd = useCallback(async () => {
    setDownloading(true);
    try {
      await reportService.downloadYearEnd(year);
    } catch (err: any) {
      Alert.alert('Rapor indirilemedi', err?.message ?? 'Bu rapor için yetkiniz olmayabilir.');
    } finally {
      setDownloading(false);
    }
  }, [year]);

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

      <ScrollView
        style={repStyles.scrollArea}
        contentContainerStyle={repStyles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={repStyles.loadingBox}>
            <ActivityIndicator color={PRIMARY} />
            <Text style={repStyles.emptyText}>Raporlar yükleniyor…</Text>
          </View>
        ) : error || !data ? (
          <View style={repStyles.chartCard}>
            <Text style={repStyles.emptyText}>{error ?? 'Veri alınamadı.'}</Text>
            <TouchableOpacity style={[repStyles.actionBtnOutline, { marginTop: 12 }]} onPress={onRefresh}>
              <Ionicons name="refresh" size={16} color="#059669" style={{ marginRight: 6 }} />
              <Text style={repStyles.actionBtnOutlineText}>Yeniden dene</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {activeTab === 0 && (
              <>
                <KpiRow items={data.operationalKpis} />
                <ChartCard title="Satış Hunisi (Kart Sayısı)">
                  <BarChart bars={data.pipeline} />
                </ChartCard>
                <ChartCard title="Servis Şikayet Özeti (Durum)">
                  <BarChart bars={data.complaints} />
                </ChartCard>
              </>
            )}

            {activeTab === 1 && (
              <>
                <KpiRow items={data.profitKpis} />
                <ChartCard title={`${year} Aylık Kazanılan / Kaybedilen`}>
                  <BarChart bars={data.monthlyOutcome} legend={['Kazanılan', 'Kaybedilen']} />
                </ChartCard>
                <ChartCard title="Departman Performansı (Bu Ay)">
                  {data.departments.length === 0 ? (
                    <Text style={repStyles.emptyText}>Departman hedefi girilmemiş ya da görme yetkiniz yok.</Text>
                  ) : (
                    <View style={{ gap: 12 }}>
                      {data.departments.map((dept) => {
                        const pct = Math.min(100, Math.max(0, Math.round(dept.pct)));
                        return (
                          <View key={dept.label}>
                            <View style={repStyles.progressHeader}>
                              <Text style={repStyles.progressTitle}>{dept.label}</Text>
                              <Text style={[repStyles.progressPct, { color: PRIMARY }]}>{pct}%</Text>
                            </View>
                            <View style={repStyles.progressTrack}>
                              <View style={[repStyles.progressFill, { width: `${pct}%`, backgroundColor: PRIMARY }]} />
                            </View>
                            <Text style={repStyles.progressSub}>
                              {formatUsd(dept.current)} / {dept.target > 0 ? formatUsd(dept.target) : 'hedef yok'}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </ChartCard>

                <TouchableOpacity
                  style={repStyles.downloadBtn}
                  activeOpacity={0.8}
                  onPress={downloadYearEnd}
                  disabled={downloading}
                >
                  <Ionicons name="download-outline" size={16} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={repStyles.downloadBtnText}>
                    {downloading ? 'İndiriliyor…' : 'Yıl Sonu Raporu İndir (Excel)'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {activeTab === 2 && (
              <ChartCard title={`${year} Ürün Bazlı Teklif Sayısı`}>
                {data.productQuotes.length === 0 ? (
                  <Text style={repStyles.emptyText}>Bu yıl ürün bazlı teklif kaydı yok.</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {data.productQuotes.map((row) => {
                      const max = Math.max(1, ...data.productQuotes.map((item) => item.primary));
                      const pct = Math.max(10, (row.primary / max) * 100);
                      return (
                        <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ width: 90, fontSize: 10, color: '#717182' }} numberOfLines={1}>{row.label}</Text>
                          <View style={{ flex: 1, height: 16, flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ height: 16, backgroundColor: PRIMARY, width: `${pct}%`, borderRadius: 4, marginRight: 8 }} />
                            <Text style={{ fontSize: 10, fontWeight: '700' }}>{row.primary}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </ChartCard>
            )}
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
  emptyText: {
    fontSize: 12,
    color: '#6b7280',
  },
  loadingBox: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 8,
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
