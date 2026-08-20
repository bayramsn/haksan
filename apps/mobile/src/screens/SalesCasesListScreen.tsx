import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { opportunityService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { RootHeader } from '@/src/ui/RootHeader';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000c69';
const INK = '#1a1c1d';
const MUTED = '#717182';

type DealStage = string;

const STAGES = [
  { key: 'lead', label: 'Lead', color: '#6B7280', dot: '#9CA3AF', bg: '#f3f4f6' },
  { key: 'arama', label: 'Arama', color: PRIMARY, dot: PRIMARY, bg: '#eef2ff' },
  { key: 'ziyaret', label: 'Ziyaret', color: '#4F46E5', dot: '#4F46E5', bg: '#eef2ff' },
  { key: 'teklif', label: 'Teklif', color: '#D97706', dot: '#F59E0B', bg: '#fef7e0' },
  { key: 'satis', label: 'Satış', color: '#137333', dot: '#10B981', bg: '#e6f4ea' },
  { key: 'iptal', label: 'İptal', color: '#B91C1C', dot: '#EF4444', bg: '#fef2f2' },
  { key: 'proforma', label: 'Proforma', color: '#6d28d9', dot: '#8B5CF6', bg: '#f5f3ff' },
  { key: 'sozlesme', label: 'Sözleşme', color: '#4338ca', dot: '#6366F1', bg: '#eef2ff' },
  { key: 'odeme_plani', label: 'Ödeme Planı', color: '#0f766e', dot: '#14B8A6', bg: '#ecfdf5' },
  { key: 'ticari_fatura', label: 'Ticari Fatura', color: '#c2410c', dot: '#F97316', bg: '#fff7ed' },
  { key: 'gumruk', label: 'Gümrük', color: '#be185d', dot: '#EC4899', bg: '#fdf2f8' },
  { key: 'stok_secimi', label: 'Stok Seçimi', color: '#4d7c0f', dot: '#84CC16', bg: '#f7fee7' },
  { key: 'sevkiyat', label: 'Sevkiyat', color: '#0e7490', dot: '#06B6D4', bg: '#ecfeff' },
  { key: 'kurulum', label: 'Kurulum', color: '#6d28d9', dot: '#7C3AED', bg: '#f5f3ff' },
  { key: 'teslim_edildi', label: 'Teslim Edildi', color: '#065f46', dot: '#059669', bg: '#ecfdf5' },
];

function getStageConfig(stageStr: string) {
  const normalized = (stageStr || '').toLowerCase();
  const found = STAGES.find(s => normalized.includes(s.label.toLowerCase()) || s.key === normalized);
  return found || STAGES[0];
}

const AVATAR_COLORS = [PRIMARY, '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
function getAvatarColor(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xFFFFFF;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function SalesCasesListScreen({ isTabRoot }: { isTabRoot?: boolean } = {}) {
  const segments: readonly string[] = useSegments();
  const tabRoot = isTabRoot ?? (segments[0] === '(tabs)' && segments[1] === 'sales');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<'kanban' | 'list' | 'history'>('kanban');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await opportunityService.list({ pageSize: 100 });
      setItems(normalizeList(res));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, 350);
    return () => clearTimeout(t);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = items.filter(c => {
    const name = String(c.companyName ?? (c.company as any)?.legalTitle ?? '');
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const renderHeader = () =>
    tabRoot ? (
      <RootHeader title="Satış Kartları" />
    ) : (
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Satış Kartları</Text>
        <View style={{ width: 40 }} />
      </View>
    );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {renderHeader()}

      {/* View Tabs */}
      <View style={styles.tabsContainer}>
        {[
          { key: 'kanban', label: 'Kanban', icon: 'albums-outline' },
          { key: 'list', label: 'Liste', icon: 'list-outline' },
          { key: 'history', label: 'Geçmiş', icon: 'time-outline' },
        ].map(tab => {
          const isActive = activeView === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveView(tab.key as any)}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
            >
              <Ionicons name={tab.icon as any} size={14} color={isActive ? PRIMARY : MUTED} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Toolbar */}
      <View style={styles.toolbarContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={14} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Müşteri / ürün ara..."
            placeholderTextColor="#9ca3af"
          />
        </View>
        <TouchableOpacity style={styles.filterBtn}>
          <Ionicons name="filter" size={12} color={MUTED} />
          <Text style={styles.filterText}>Filtre</Text>
        </TouchableOpacity>
      </View>

      {loading && items.length === 0 ? (
        <ActivityIndicator color={PRIMARY} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <View style={styles.contentArea}>
          {activeView === 'kanban' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.kanbanScroll}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {STAGES.map(stage => {
                const stageCards = filtered.filter(c => {
                  const sStr = String((c.stage as any)?.name ?? c.stageCode ?? '');
                  return getStageConfig(sStr).key === stage.key;
                });
                if (stageCards.length === 0) return null; // Only show non-empty columns for brevity

                const total = stageCards.reduce((s, c) => s + Number(c.amount ?? c.value ?? 0), 0);
                
                return (
                  <View key={stage.key} style={styles.kanbanCol}>
                    <View style={[styles.colHeader, { backgroundColor: stage.bg }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.stageDot, { backgroundColor: stage.dot }]} />
                        <Text style={[styles.colTitle, { color: stage.color }]} numberOfLines={1}>{stage.label}</Text>
                        <View style={styles.colCountBadge}>
                          <Text style={[styles.colCountText, { color: stage.color }]}>{stageCards.length}</Text>
                        </View>
                      </View>
                      <Text style={[styles.colTotal, { color: stage.color }]}>₺{total.toLocaleString('tr-TR')}</Text>
                    </View>

                    <ScrollView nestedScrollEnabled contentContainerStyle={styles.colCards}>
                      {stageCards.map(card => {
                        const id = String(card.id);
                        const company = String(card.companyName ?? (card.company as any)?.legalTitle ?? 'Bilinmeyen Firma');
                        const amt = Number(card.amount ?? card.value ?? 0);
                        const initial = company.charAt(0).toUpperCase();
                        const color = getAvatarColor(company);
                        
                        return (
                          <TouchableOpacity
                            key={id}
                            activeOpacity={0.8}
                            onPress={() => router.push(`/modules/sales-cases/${id}`)}
                            style={styles.kanbanCard}
                          >
                            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                              <View style={[styles.kanbanAvatar, { backgroundColor: color }]}>
                                <Text style={styles.kanbanAvatarText}>{initial}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.kanbanCardTitle} numberOfLines={1}>{company}</Text>
                                <Text style={styles.kanbanCardSub}>Satış kartı</Text>
                              </View>
                              <Ionicons name="arrow-forward" size={14} color="#d1d5db" />
                            </View>
                            <View style={styles.kanbanCardFooter}>
                              <Text style={[styles.kanbanCardAmount, { color: stage.color }]}>₺{amt.toLocaleString('tr-TR')}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {activeView === 'list' && (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {filtered.map(card => {
                const id = String(card.id);
                const company = String(card.companyName ?? (card.company as any)?.legalTitle ?? 'Bilinmeyen Firma');
                const amt = Number(card.amount ?? card.value ?? 0);
                const sStr = String((card.stage as any)?.name ?? card.stageCode ?? '');
                const stage = getStageConfig(sStr);
                const color = getAvatarColor(company);

                return (
                  <TouchableOpacity
                    key={id}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/modules/sales-cases/${id}`)}
                    style={styles.listCard}
                  >
                    <View style={[styles.listAvatar, { backgroundColor: color }]}>
                      <Text style={styles.kanbanAvatarText}>{company.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kanbanCardTitle} numberOfLines={1}>{company}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View style={[styles.stageDot, { backgroundColor: stage.dot, width: 6, height: 6 }]} />
                          <Text style={[styles.listStageText, { color: stage.color }]}>{stage.label}</Text>
                        </View>
                        <Text style={{ color: '#d1d5db', fontSize: 10 }}>·</Text>
                        <Text style={[styles.listAmountText, { color: stage.color }]}>₺{amt.toLocaleString('tr-TR')}</Text>
                      </View>
                    </View>
                    <View style={styles.listActionBtn}>
                      <Ionicons name="arrow-forward" size={16} color={PRIMARY} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {activeView === 'history' && (
            <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Geçmiş satırları burada listelenecek</Text>
              </View>
            </ScrollView>
          )}
        </View>
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => router.push('/forms/opportunity')}>
        <Ionicons name="add" size={24} color="#ffffff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' },
  loader: { marginTop: 40 },
  error: { color: '#ef4444', padding: 16, fontSize: 14 },
  
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
    gap: 8,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabBtnActive: { backgroundColor: '#eef2ff' },
  tabText: { fontSize: 12, fontWeight: '600', color: MUTED },
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
  searchInput: { flex: 1, fontSize: 12, color: INK, padding: 0 },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  filterText: { fontSize: 12, fontWeight: '600', color: MUTED },

  contentArea: { flex: 1 },
  
  kanbanScroll: { padding: 12, gap: 12 },
  kanbanCol: {
    width: 260,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
    maxHeight: '100%',
  },
  colHeader: {
    padding: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  stageDot: { width: 10, height: 10, borderRadius: 5 },
  colTitle: { flex: 1, fontSize: 12, fontWeight: '700' },
  colCountBadge: { backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  colCountText: { fontSize: 10, fontWeight: '700' },
  colTotal: { fontSize: 11, marginTop: 4, marginLeft: 16, opacity: 0.7 },
  
  colCards: { padding: 8, gap: 8 },
  kanbanCard: {
    backgroundColor: '#f7f7f8',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
  },
  kanbanAvatar: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kanbanAvatarText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  kanbanCardTitle: { fontSize: 12, fontWeight: '700', color: INK },
  kanbanCardSub: { fontSize: 10, color: MUTED },
  kanbanCardFooter: { marginTop: 8 },
  kanbanCardAmount: { fontSize: 12, fontWeight: '900' },

  listScroll: { flex: 1 },
  listContent: { padding: 16, gap: 8, paddingBottom: 100 },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  listAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  listStageText: { fontSize: 11 },
  listAmountText: { fontSize: 11, fontWeight: '700' },
  listActionBtn: { padding: 8, borderRadius: 12, backgroundColor: '#eef2ff' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', height: 100 },
  emptyText: { color: '#9ca3af', fontSize: 12 },

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
