import { useState, useCallback, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { financeService } from '@/src/api/services';

const PRIMARY = '#000c69';
type InvoiceType = 'all' | 'sales' | 'purchase';
const TYPE_TABS: { key: InvoiceType; label: string }[] = [{ key: 'all', label: 'Tümü' }, { key: 'sales', label: 'Satış' }, { key: 'purchase', label: 'Alış' }];
const searchText = (value: unknown) => String(value ?? '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
const date = (value: unknown) => { const parsed = new Date(String(value ?? '')); return Number.isNaN(parsed.getTime()) ? 'Belirtilmemiş' : parsed.toLocaleDateString('tr-TR'); };
const money = (value: unknown, currency?: string) => `${Number(value ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${currency ?? ''}`.trim();

export function AccountingInvoicesListScreen() {
  const [search, setSearch] = useState('');
  const [typeTab, setTypeTab] = useState<InvoiceType>('all');
  const [records, setRecords] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true); setError(''); setRecords([]); setTotal(0);
    try {
      // Bu endpoint search kabul etmez. Arama yalnız tüm sunucu sayfaları
      // tamamlandıktan sonra uygulanır; ilk sayfa ile sınırlanmaz.
      const byId = new Map<string, any>();
      let page = 1;
      let expectedTotal = 0;
      do {
        const response = await financeService.accountingInvoices({ page, pageSize: 200, type: typeTab === 'all' ? undefined : typeTab });
        if (request !== requestId.current) return;
        if (!Array.isArray(response.data) || !Number.isFinite(Number(response.total))) throw new Error('Fatura listesi beklenen biçimde alınamadı.');
        expectedTotal = Number(response.total);
        const previousCount = byId.size;
        for (const invoice of response.data) byId.set(invoice.id, invoice);
        if (byId.size < expectedTotal && byId.size === previousCount) throw new Error('Fatura listesi tamamlanamadı. Tekrar deneyin.');
        page += 1;
      } while (byId.size < expectedTotal);
      if (request === requestId.current) { setRecords([...byId.values()]); setTotal(expectedTotal); }
    } catch (err) { if (request === requestId.current) setError(err instanceof Error ? err.message : 'Faturalar yüklenemedi.'); }
    finally { if (request === requestId.current) setLoading(false); }
  }, [typeTab]);
  useFocusEffect(useCallback(() => { void load(); return () => { requestId.current += 1; }; }, [load]));
  const filtered = records.filter(invoice => searchText(`${invoice.invoiceNo} ${invoice.company?.shortName ?? ''} ${invoice.company?.legalTitle ?? ''}`).includes(searchText(search.trim())));
  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
    <View style={styles.headerBar}><TouchableOpacity accessibilityLabel="Geri" onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color="#111827" /></TouchableOpacity><Text style={styles.headerTitle}>Faturalar</Text><View style={{ width: 40 }} /></View>
    <View style={styles.tabsContainer}>{TYPE_TABS.map(tab => <TouchableOpacity key={tab.key} onPress={() => { setRecords([]); setTotal(0); setTypeTab(tab.key); }} style={[styles.tabBtn, typeTab === tab.key && styles.tabBtnActive]}><Text style={[styles.tabText, typeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text></TouchableOpacity>)}</View>
    <View style={styles.toolbarContainer}><View style={styles.searchInputWrapper}><Ionicons name="search" size={14} color="#9ca3af" /><TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Fatura no veya firma..." placeholderTextColor="#9ca3af" autoCorrect={false} /></View><TouchableOpacity accessibilityLabel="Faturaları yenile" disabled={loading} style={styles.refreshBtn} onPress={() => void load()}><Ionicons name="refresh" size={16} color="#717182" /></TouchableOpacity></View>
    <View style={styles.statsBar}><Text style={styles.statsText}>{loading ? 'CRM faturaları yükleniyor…' : error ? 'Fatura listesi yüklenemedi' : `${filtered.length} fatura${search.trim() ? ` / ${total} kayıt` : ''}`}</Text></View>
    <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
      {loading && <ActivityIndicator color={PRIMARY} />}
      {error ? <View><Text style={{ color: '#cf060c' }}>{error}</Text><TouchableOpacity style={styles.refreshBtn} onPress={() => void load()}><Text>Tekrar Dene</Text></TouchableOpacity></View> : null}
      {!loading && !error && !filtered.length && <Text style={styles.statsText}>Fatura bulunamadı.</Text>}
      {filtered.map(invoice => <TouchableOpacity key={invoice.id} activeOpacity={0.8} onPress={() => router.push(`/modules/accounting-invoices/${invoice.id}`)} style={styles.card}>
        <View style={[styles.typeIcon, { backgroundColor: invoice.type === 'sales' ? PRIMARY : '#F97316' }]}><Text style={styles.typeIconText}>{invoice.type === 'sales' ? 'SAT' : 'ALI'}</Text></View>
        <View style={styles.infoCol}><Text style={styles.companyText} numberOfLines={2}>{invoice.company?.shortName || invoice.company?.legalTitle || 'Firma belirtilmemiş'}</Text><Text style={styles.noText}>{invoice.invoiceNo}</Text><View style={styles.dateRow}><Text style={styles.dateText}>{date(invoice.invoiceDate)}</Text></View><Text style={styles.dateText}>Vade: {date(invoice.firstDueDate ?? invoice.lastDueDate)}</Text></View>
        <View style={styles.amountCol}><Text style={styles.amountText}>{money(invoice.grandTotal, invoice.currency?.code)}</Text><Text style={styles.kdvText}>KDV: {money(invoice.vatAmount, invoice.currency?.code)}</Text><View style={[styles.statusBadge, { backgroundColor: '#f3f4f6' }]}><Text style={[styles.statusBadgeText, { color: '#717182' }]}>{invoice.invoiceCategory === 'administrative' ? 'İdari' : 'Ticari'}</Text></View></View>
        <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginLeft: 8 }} />
      </TouchableOpacity>)}
    </ScrollView>
  </SafeAreaView>;
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
