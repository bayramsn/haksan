import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { documentService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { getModule } from '@/src/navigation/modules';

const PRIMARY = '#000c69';
const INK = '#1a1c1d';
const MUTED = '#717182';

const AVATAR_COLORS = [PRIMARY, '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
function getColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

type DocFilter = 'Tümü' | 'Proforma' | 'Sözleşme';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: 'Aktif', bg: '#ECFDF5', text: '#059669' },
  completed: { label: 'Tamamlandı', bg: '#F3F4F6', text: '#6B7280' },
  pending: { label: 'Beklemede', bg: '#FFFBEB', text: '#D97706' },
  cancelled: { label: 'İptal', bg: '#FEF2F2', text: '#DC2626' },
  draft: { label: 'Taslak', bg: '#EEF2FF', text: PRIMARY },
  default: { label: 'Bilinmiyor', bg: '#F3F4F6', text: '#6B7280' },
};

function getStatusConfig(item: Record<string, unknown>) {
  const raw = String(item.statusCode ?? item.status ?? '').toLowerCase();
  if (raw.includes('active') || raw.includes('aktif')) return STATUS_CONFIG.active;
  if (raw.includes('complet') || raw.includes('tamamla')) return STATUS_CONFIG.completed;
  if (raw.includes('pend') || raw.includes('bekle')) return STATUS_CONFIG.pending;
  if (raw.includes('cancel') || raw.includes('iptal')) return STATUS_CONFIG.cancelled;
  if (raw.includes('draft') || raw.includes('taslak')) return STATUS_CONFIG.draft;
  return STATUS_CONFIG.default;
}

function getCompanyTitle(item: Record<string, unknown>) {
  if (item.company && typeof item.company === 'object') {
    const comp = item.company as Record<string, unknown>;
    return String(comp.legalTitle ?? comp.name ?? '');
  }
  if (item.companyName) return String(item.companyName);
  return '—';
}

function formatAmount(item: Record<string, unknown>) {
  if (!item.quote || typeof item.quote !== 'object') return undefined;
  const quote = item.quote as Record<string, unknown>;
  const amount = Number(quote.grandTotal);
  if (isNaN(amount) || amount === 0) return undefined;
  let currency = '';
  if (item.currency && typeof item.currency === 'object') {
    currency = String((item.currency as Record<string, unknown>).code ?? '');
  }
  let symbol = '';
  if (currency === 'TRY' || currency === 'TL') symbol = '₺';
  else if (currency === 'USD') symbol = '$';
  else if (currency === 'EUR') symbol = '€';
  else symbol = currency ? `${currency} ` : '';
  return `${symbol}${amount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

function formatDate(item: Record<string, unknown>) {
  const raw = item.issueDate ?? item.signedDate ?? item.createdAt;
  if (!raw) return undefined;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DocumentsListScreen({ navKey }: { navKey: string }) {
  const mod = getModule(navKey);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<DocFilter>('Tümü');
  const [searchOpen, setSearchOpen] = useState(false);

  const pageTitle = navKey === 'proformas' ? 'Proformalar' : navKey === 'contracts' ? 'Sözleşmeler' : (mod?.label ?? 'Dokümanlar');
  const showTypeFilter = navKey === 'documents';

  const load = useCallback(async () => {
    try {
      const params: Record<string, string | number | undefined> = { pageSize: 50 };
      if (q.trim()) params.search = q.trim();

      let res;
      if (navKey === 'proformas') {
        res = await documentService.proformas(params);
      } else if (navKey === 'contracts') {
        res = await documentService.contracts(params);
      } else {
        const [pro, con] = await Promise.all([
          documentService.proformas(params),
          documentService.contracts(params),
        ]);
        const contracts = normalizeList(con).map((c) => ({
          ...c,
          documentNo: c.documentNo ?? c.contractNo,
          _docType: 'contract',
        }));
        const proformas = normalizeList(pro).map((p) => ({ ...p, _docType: 'proforma' }));
        res = [...proformas, ...contracts];
      }

      setItems(normalizeList(res));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    }
  }, [q, navKey]);

  useEffect(() => {
    const t = setTimeout(
      () => {
        void (async () => {
          setLoading(true);
          await load();
          setLoading(false);
        })();
      },
      searchOpen ? 350 : 0,
    );
    return () => clearTimeout(t);
  }, [load, searchOpen]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const isContract = (item: Record<string, unknown>) =>
    !!(item.contractNo || item._docType === 'contract');

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (showTypeFilter && filter !== 'Tümü') {
        if (filter === 'Sözleşme' && !isContract(item)) return false;
        if (filter === 'Proforma' && isContract(item)) return false;
      }
      return true;
    });
  }, [items, filter, showTypeFilter]);

  /* KPI */
  const totalCount = items.length;
  const proformaCount = items.filter((i) => !isContract(i)).length;
  const contractCount = items.filter((i) => isContract(i)).length;

  const FILTERS: DocFilter[] = showTypeFilter ? ['Tümü', 'Proforma', 'Sözleşme'] : ['Tümü'];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={INK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{pageTitle}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => setSearchOpen((v) => !v)} style={styles.headerIconBtn}>
            <Ionicons name={searchOpen ? 'close' : 'search'} size={22} color={INK} />
          </TouchableOpacity>
        </View>
      </View>

      {/* KPI Strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.kpiScroll}
        contentContainerStyle={styles.kpiRow}
      >
        <View style={[styles.kpiChip, { backgroundColor: PRIMARY }]}>
          <Ionicons name="folder-outline" size={16} color="#fff" />
          <View>
            <Text style={styles.kpiLabelLight}>Toplam</Text>
            <Text style={styles.kpiValueLight}>{totalCount}</Text>
          </View>
        </View>
        {showTypeFilter && (
          <>
            <View style={[styles.kpiChip, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="document-text-outline" size={16} color={PRIMARY} />
              <View>
                <Text style={[styles.kpiLabel, { color: PRIMARY }]}>Proforma</Text>
                <Text style={[styles.kpiValue, { color: PRIMARY }]}>{proformaCount}</Text>
              </View>
            </View>
            <View style={[styles.kpiChip, { backgroundColor: '#F5F3FF' }]}>
              <Ionicons name="ribbon-outline" size={16} color="#7C3AED" />
              <View>
                <Text style={[styles.kpiLabel, { color: '#7C3AED' }]}>Sözleşme</Text>
                <Text style={[styles.kpiValue, { color: '#7C3AED' }]}>{contractCount}</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Filter Tabs */}
      {showTypeFilter && (
        <View style={styles.tabsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
            {FILTERS.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setFilter(tab)}
                style={[styles.tabBtn, filter === tab && styles.tabBtnActive]}
              >
                <Text style={[styles.tabText, filter === tab && styles.tabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Search */}
      {searchOpen && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder="Doküman no veya firma ara..."
              placeholderTextColor={MUTED}
              value={q}
              onChangeText={setQ}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>
        </View>
      )}

      {/* List */}
      {loading && items.length === 0 ? (
        <ActivityIndicator color={PRIMARY} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(item, idx) => String(item.id ?? idx)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>Doküman bulunamadı</Text>
              <Text style={styles.emptySub}>Aramayı değiştirmeyi deneyin</Text>
            </View>
          }
          renderItem={({ item }) => {
            const docNo = String(item.documentNo ?? item.contractNo ?? '—');
            const company = getCompanyTitle(item);
            const isC = isContract(item);
            const docIcon = isC ? 'ribbon-outline' : 'document-text-outline';
            const docLabel = isC ? 'Sözleşme' : 'Proforma';
            const docColor = isC ? '#7C3AED' : PRIMARY;
            const docBg = isC ? '#F5F3FF' : '#EEF2FF';
            const status = getStatusConfig(item);
            const amount = formatAmount(item);
            const date = formatDate(item);
            const avatarColor = getColor(company);

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => item.id && router.push(`/modules/${navKey}/${String(item.id)}`)}
                style={styles.card}
              >
                <View style={styles.cardRow}>
                  {/* Avatar */}
                  <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                    <Ionicons name={docIcon as any} size={18} color="#fff" />
                  </View>

                  {/* Info */}
                  <View style={styles.cardInfo}>
                    <Text style={styles.docNoText} numberOfLines={1}>
                      {docNo}
                    </Text>
                    <Text style={styles.companyText} numberOfLines={1}>
                      {company}
                    </Text>
                    <View style={styles.metaRow}>
                      {showTypeFilter && (
                        <View style={[styles.typeBadge, { backgroundColor: docBg }]}>
                          <Text style={[styles.typeText, { color: docColor }]}>{docLabel}</Text>
                        </View>
                      )}
                      {date && (
                        <View style={styles.dateRow}>
                          <Ionicons name="calendar-outline" size={11} color={MUTED} />
                          <Text style={styles.dateText}>{date}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Right */}
                  <View style={styles.cardRight}>
                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                    </View>
                    {amount && <Text style={styles.amountText}>{amount}</Text>}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: -0.3 },
  headerRight: { flexDirection: 'row', gap: 4 },
  headerIconBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  kpiScroll: { flexGrow: 0, backgroundColor: '#fff', paddingBottom: 12 },
  kpiRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 8 },
  kpiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 100,
  },
  kpiLabelLight: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' },
  kpiValueLight: { fontSize: 18, fontWeight: '700', color: '#fff' },
  kpiLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  kpiValue: { fontSize: 18, fontWeight: '700' },
  tabsContainer: { backgroundColor: '#fff', paddingBottom: 8 },
  tabsContent: { paddingHorizontal: 20, gap: 6 },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  tabBtnActive: { backgroundColor: PRIMARY },
  tabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  tabTextActive: { color: '#fff' },
  searchContainer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, backgroundColor: '#f7f7f8' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
    height: 42,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchInput: { flex: 1, fontSize: 14, color: INK },
  loader: { marginTop: 40 },
  error: { color: '#ef4444', padding: 20, fontSize: 14 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: INK },
  emptySub: { fontSize: 14, color: MUTED },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1, gap: 2 },
  docNoText: { fontSize: 15, fontWeight: '700', color: INK },
  companyText: { fontSize: 13, color: MUTED },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  typeText: { fontSize: 10, fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dateText: { fontSize: 11, color: MUTED },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
  amountText: { fontSize: 14, fontWeight: '700', color: INK },
});
