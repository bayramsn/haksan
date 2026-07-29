import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
import { inventoryService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';

const PRIMARY = '#000c69';
const INK = '#1a1c1d';
const MUTED = '#717182';

const AVATAR_COLORS = [PRIMARY, '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
function getColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

type WarrantyFilter = 'Tümü' | 'Garantili' | 'Garanti Bitti' | 'Bilinmiyor';
const FILTER_TABS: WarrantyFilter[] = ['Tümü', 'Garantili', 'Garanti Bitti', 'Bilinmiyor'];

function getWarrantyInfo(item: Record<string, unknown>) {
  const end = item.warrantyEndDate;
  if (!end) return { label: 'Bilinmiyor', tone: 'neutral' as const };
  const endDate = new Date(String(end));
  if (Number.isNaN(endDate.getTime())) return { label: 'Bilinmiyor', tone: 'neutral' as const };
  const isExpired = endDate < new Date();
  return {
    label: isExpired ? 'Garanti Bitti' : 'Garantili',
    tone: isExpired ? ('error' as const) : ('success' as const),
    date: endDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

function getCompanyTitle(item: Record<string, unknown>) {
  if (item.company && typeof item.company === 'object') {
    const comp = item.company as Record<string, unknown>;
    return String(comp.legalTitle ?? comp.name ?? '');
  }
  if (item.companyName) return String(item.companyName);
  return '—';
}

const WARRANTY_STYLE: Record<string, { bg: string; text: string }> = {
  success: { bg: '#ECFDF5', text: '#059669' },
  error: { bg: '#FEF2F2', text: '#DC2626' },
  neutral: { bg: '#F3F4F6', text: '#6B7280' },
};

export function MachinesListScreen() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<WarrantyFilter>('Tümü');
  const [searchOpen, setSearchOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const params: Record<string, string | number | undefined> = { pageSize: 50 };
      if (q.trim()) params.search = q.trim();
      const res = await inventoryService.customerDevices(params);
      setItems(normalizeList(res));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    }
  }, [q]);

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

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const warranty = getWarrantyInfo(item);
      if (filter !== 'Tümü' && warranty.label !== filter) return false;
      if (q.trim()) {
        const serial = String(item.serialNumber ?? '').toLowerCase();
        const model = String(item.modelName ?? item.productName ?? '').toLowerCase();
        const company = getCompanyTitle(item).toLowerCase();
        const term = q.toLowerCase();
        if (!serial.includes(term) && !model.includes(term) && !company.includes(term)) return false;
      }
      return true;
    });
  }, [items, filter, q]);

  /* KPI values */
  const totalCount = items.length;
  const warrantyCount = items.filter((i) => getWarrantyInfo(i).tone === 'success').length;
  const expiredCount = items.filter((i) => getWarrantyInfo(i).tone === 'error').length;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={INK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Makineler</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => setSearchOpen((v) => !v)} style={styles.headerIconBtn}>
            <Ionicons name={searchOpen ? 'close' : 'search'} size={22} color={INK} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/forms/machine')} style={styles.headerIconBtn}>
            <Ionicons name="add-circle-outline" size={22} color={PRIMARY} />
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
          <Ionicons name="hardware-chip-outline" size={16} color="#fff" />
          <View>
            <Text style={styles.kpiLabelLight}>Toplam</Text>
            <Text style={styles.kpiValueLight}>{totalCount}</Text>
          </View>
        </View>
        <View style={[styles.kpiChip, { backgroundColor: '#ECFDF5' }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#059669" />
          <View>
            <Text style={[styles.kpiLabel, { color: '#059669' }]}>Garantili</Text>
            <Text style={[styles.kpiValue, { color: '#059669' }]}>{warrantyCount}</Text>
          </View>
        </View>
        <View style={[styles.kpiChip, { backgroundColor: '#FEF2F2' }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
          <View>
            <Text style={[styles.kpiLabel, { color: '#DC2626' }]}>Garanti Bitti</Text>
            <Text style={[styles.kpiValue, { color: '#DC2626' }]}>{expiredCount}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          {FILTER_TABS.map((tab) => (
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

      {/* Search */}
      {searchOpen && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder="Seri no, model veya firma ara..."
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
              <Ionicons name="hardware-chip-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>Makine bulunamadı</Text>
              <Text style={styles.emptySub}>Aramayı veya filtreyi değiştirmeyi deneyin</Text>
            </View>
          }
          renderItem={({ item }) => {
            const serial = String(item.serialNumber ?? '—');
            const model = String(item.modelName ?? item.productName ?? '');
            const company = getCompanyTitle(item);
            const warranty = getWarrantyInfo(item);
            const wStyle = WARRANTY_STYLE[warranty.tone];
            const color = getColor(company);

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => item.id && router.push(`/modules/machines/${String(item.id)}`)}
                style={styles.card}
              >
                <View style={styles.cardRow}>
                  {/* Avatar */}
                  <View style={[styles.avatar, { backgroundColor: color }]}>
                    <Ionicons name="hardware-chip" size={18} color="#fff" />
                  </View>

                  {/* Info */}
                  <View style={styles.cardInfo}>
                    <Text style={styles.serialText} numberOfLines={1}>
                      {serial}
                    </Text>
                    {model ? (
                      <Text style={styles.modelText} numberOfLines={1}>
                        {model}
                      </Text>
                    ) : null}
                    <View style={styles.metaRow}>
                      <Ionicons name="business-outline" size={12} color={MUTED} />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {company}
                      </Text>
                    </View>
                  </View>

                  {/* Right column */}
                  <View style={styles.cardRight}>
                    <View style={[styles.warrantyBadge, { backgroundColor: wStyle.bg }]}>
                      <Text style={[styles.warrantyText, { color: wStyle.text }]}>{warranty.label}</Text>
                    </View>
                    {warranty.date ? (
                      <Text style={styles.warrantyDate}>{warranty.date}</Text>
                    ) : null}
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
  serialText: { fontSize: 15, fontWeight: '700', color: INK },
  modelText: { fontSize: 13, color: MUTED },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { fontSize: 12, color: MUTED, flex: 1 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  warrantyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  warrantyText: { fontSize: 11, fontWeight: '600' },
  warrantyDate: { fontSize: 11, color: MUTED },
});
