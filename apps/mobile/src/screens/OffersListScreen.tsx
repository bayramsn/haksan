import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { quoteService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000c69';
const RED = '#cf060c';

type OfferStatus = 'taslak' | 'gonderilen' | 'onaylanan' | 'reddedilen';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  taslak: { label: 'Taslak', bg: '#F3F4F6', text: '#6B7280' },
  gonderilen: { label: 'Gönderildi', bg: '#EEF2FF', text: PRIMARY },
  onaylanan: { label: 'Onaylandı', bg: '#ECFDF5', text: '#059669' },
  reddedilen: { label: 'Reddedildi', bg: '#FEF2F2', text: RED },
  default: { label: 'Taslak', bg: '#F3F4F6', text: '#6B7280' },
};

function getStatusConfig(statusString?: string) {
  const s = (statusString || '').toLowerCase();
  if (s.includes('onay') || s.includes('appr')) return STATUS_CONFIG.onaylanan;
  if (s.includes('red') || s.includes('rej')) return STATUS_CONFIG.reddedilen;
  if (s.includes('gönder') || s.includes('gonder') || s.includes('sent')) return STATUS_CONFIG.gonderilen;
  return STATUS_CONFIG.taslak;
}

const STATUS_TABS: { key: OfferStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'taslak', label: 'Taslak' },
  { key: 'gonderilen', label: 'Gönderilen' },
  { key: 'onaylanan', label: 'Onaylı' },
  { key: 'reddedilen', label: 'Reddedilen' },
];

const AVATAR_COLORS = [PRIMARY, '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export function OffersListScreen() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<OfferStatus | 'all'>('all');

  const load = useCallback(async () => {
    try {
      const params: Record<string, string | number | undefined> = { pageSize: 100 };
      const res = await quoteService.list(params);
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

  const filtered = items.filter(o => {
    const docNo = String(o.documentNo ?? o.no ?? '');
    const company = String(o.companyName ?? (o.company as any)?.legalTitle ?? '');
    const matchSearch = company.toLowerCase().includes(search.toLowerCase()) ||
                        docNo.toLowerCase().includes(search.toLowerCase());
                        
    let statusKey: string = 'taslak';
    const sStr = String((o.status as any)?.name ?? o.statusCode ?? '').toLowerCase();
    if (sStr.includes('onay')) statusKey = 'onaylanan';
    else if (sStr.includes('red')) statusKey = 'reddedilen';
    else if (sStr.includes('gönder')) statusKey = 'gonderilen';
    
    const matchTab = activeTab === 'all' || statusKey === activeTab;
    return matchSearch && matchTab;
  });

  const total = items.length;
  let approvedSum = 0;
  let approvedCount = 0;
  let pendingSum = 0;
  let pendingCount = 0;
  let rejectedCount = 0;

  items.forEach(o => {
    const sStr = String((o.status as any)?.name ?? o.statusCode ?? '').toLowerCase();
    const amt = Number(o.grandTotal ?? o.amount ?? 0);
    if (sStr.includes('onay')) { approvedSum += amt; approvedCount++; }
    else if (sStr.includes('gönder')) { pendingSum += amt; pendingCount++; }
    else if (sStr.includes('red')) { rejectedCount++; }
  });

  const renderHeader = () => (
    <View style={styles.headerBar}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#111827" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Teklifler</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {renderHeader()}

      {/* KPI Row */}
      <View style={styles.kpiContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiScroll}>
          {[
            { label: 'Toplam', value: String(total), sub: 'teklif', color: '#717182', bg: '#F3F4F6' },
            { label: 'Onaylanan', value: `₺${(approvedSum / 1000).toFixed(0)}K`, sub: `${approvedCount} teklif`, color: '#059669', bg: '#ECFDF5' },
            { label: 'Bekleyen', value: `₺${(pendingSum / 1000).toFixed(0)}K`, sub: `${pendingCount} teklif`, color: PRIMARY, bg: '#EEF2FF' },
            { label: 'Reddedilen', value: String(rejectedCount), sub: 'teklif', color: RED, bg: '#FEF2F2' },
          ].map(kpi => (
            <View key={kpi.label} style={[styles.kpiCard, { backgroundColor: kpi.bg }]}>
              <Text style={[styles.kpiValue, { color: kpi.color }]}>{kpi.value}</Text>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
              <Text style={styles.kpiSub}>{kpi.sub}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Status Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {STATUS_TABS.map(tab => {
            const isActive = activeTab === tab.key;
            let count = items.length;
            if (tab.key !== 'all') {
              count = items.filter(o => {
                const sStr = String((o.status as any)?.name ?? o.statusCode ?? '').toLowerCase();
                if (tab.key === 'onaylanan' && sStr.includes('onay')) return true;
                if (tab.key === 'reddedilen' && sStr.includes('red')) return true;
                if (tab.key === 'gonderilen' && sStr.includes('gönder')) return true;
                if (tab.key === 'taslak' && !sStr.includes('onay') && !sStr.includes('red') && !sStr.includes('gönder')) return true;
                return false;
              }).length;
            }
            
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label} {tab.key !== 'all' && `(${count})`}
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
            placeholder="Teklif no veya müşteri ara..."
            placeholderTextColor="#717182"
          />
        </View>
        <TouchableOpacity style={styles.filterBtn}>
          <Ionicons name="filter" size={14} color="#717182" />
        </TouchableOpacity>
      </View>

      <View style={styles.countContainer}>
        <Text style={styles.countText}>{filtered.length} teklif</Text>
      </View>

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
          renderItem={({ item, index }) => {
            const id = String(item.id);
            const docNo = String(item.documentNo ?? item.no ?? '');
            const company = String(item.companyName ?? (item.company as any)?.legalTitle ?? 'Bilinmeyen Firma');
            const dateStr = String(item.documentDate ?? item.date ?? '');
            const amt = Number(item.grandTotal ?? item.amount ?? 0);
            
            const sStr = String((item.status as any)?.name ?? item.statusCode ?? '');
            const cfg = getStatusConfig(sStr);
            const isTaslak = cfg.label === 'Taslak';
            const isGonderilen = cfg.label === 'Gönderildi';
            
            const color = AVATAR_COLORS[index % AVATAR_COLORS.length];

            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.cardAvatar, { backgroundColor: color }]}>
                    <Text style={styles.cardAvatarText}>{company.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <View style={styles.cardInfoRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.cardCompany} numberOfLines={1}>{company}</Text>
                        <Text style={styles.cardDate}>{docNo} · {dateStr}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.cardAmount}>₺{amt.toLocaleString('tr-TR')}</Text>
                        <View style={[styles.statusChip, { backgroundColor: cfg.bg }]}>
                          <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Actions Row */}
                <View style={styles.cardActions}>
                  {isTaslak && (
                    <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
                      <Ionicons name="send" size={14} color={PRIMARY} />
                      <Text style={[styles.actionBtnText, { color: PRIMARY }]}>Gönder</Text>
                    </TouchableOpacity>
                  )}
                  {isGonderilen && (
                    <>
                      <TouchableOpacity style={[styles.actionBtn, styles.actionBtnBorderRight]} activeOpacity={0.7}>
                        <Ionicons name="checkmark-circle" size={14} color="#059669" />
                        <Text style={[styles.actionBtnText, { color: '#059669' }]}>Onayla</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
                        <Ionicons name="close-circle" size={14} color={RED} />
                        <Text style={[styles.actionBtnText, { color: RED }]}>Reddet</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {(!isTaslak && !isGonderilen) && (
                    <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={() => router.push(`/modules/offers/${id}`)}>
                      <Ionicons name="document-text" size={14} color="#717182" />
                      <Text style={[styles.actionBtnText, { color: '#717182' }]}>Detay</Text>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    style={styles.chevronBtn}
                    onPress={() => router.push(`/modules/offers/${id}`)}
                  >
                    <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => router.push('/forms/offer')}>
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
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  
  kpiContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 12,
  },
  kpiScroll: { paddingHorizontal: 16, gap: 12 },
  kpiCard: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
    justifyContent: 'center',
  },
  kpiValue: { fontSize: 12, fontWeight: '700' },
  kpiLabel: { fontSize: 10, fontWeight: '600', color: '#717182', marginTop: 2 },
  kpiSub: { fontSize: 9, color: '#9ca3af', marginTop: 1 },

  tabsContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  tabsScroll: { paddingHorizontal: 16 },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 12, fontWeight: '600', color: '#717182' },
  tabTextActive: { color: PRIMARY },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 8,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#1a1c1d', padding: 0 },
  filterBtn: {
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  countContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  countText: { fontSize: 11, color: '#717182' },

  list: { flex: 1 },
  listContent: { paddingVertical: 8, paddingBottom: 100 },
  
  card: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },
  cardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAvatarText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  cardInfo: { flex: 1 },
  cardInfoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardCompany: { fontSize: 14, fontWeight: '700', color: '#1a1c1d' },
  cardDate: { fontSize: 12, color: '#717182', marginTop: 2 },
  cardAmount: { fontSize: 14, fontWeight: '700', color: '#1a1c1d' },
  statusChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 100,
    marginTop: 4,
  },
  statusText: { fontSize: 10, fontWeight: '600' },

  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  actionBtnBorderRight: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.06)',
  },
  actionBtnText: { fontSize: 12, fontWeight: '600' },
  chevronBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },

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

