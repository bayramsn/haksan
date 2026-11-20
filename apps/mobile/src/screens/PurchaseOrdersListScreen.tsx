import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { purchaseOrderService } from '@/src/api/services';
import { useAuth } from '@/src/auth/AuthProvider';

const PRIMARY = '#000c69';

type POStatus = 'all' | 'draft' | 'pending_manager_approval' | 'approved' | 'sent' | 'in_transit' | 'received' | 'cancelled';

const STATUS_CONFIG: Record<POStatus | string, { label: string; bg: string; text: string }> = {
  draft: { label: 'Taslak', bg: '#f3f4f6', text: '#6b7280' },
  cancelled: { label: 'İptal', bg: '#fef2f2', text: '#cf060c' },
  in_transit: { label: 'Yolda', bg: '#eef2ff', text: PRIMARY },
  pending_manager_approval: { label: 'Onay Bekliyor', bg: '#FFFBEB', text: '#D97706' },
  approved: { label: 'Onaylandı', bg: '#EEF2FF', text: PRIMARY },
  sent: { label: 'Gönderildi', bg: '#F0FDF4', text: '#059669' },
  received: { label: 'Tamamlandı', bg: '#F3F4F6', text: '#6B7280' },
};

const STATUS_TABS: { key: POStatus; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'draft', label: 'Taslak' },
  { key: 'pending_manager_approval', label: 'Bekliyor' },
  { key: 'approved', label: 'Onaylı' },
  { key: 'sent', label: 'Gönderildi' },
  { key: 'in_transit', label: 'Yolda' },
  { key: 'received', label: 'Teslim Alındı' },
  { key: 'cancelled', label: 'İptal' },
];

export function PurchaseOrdersListScreen() {
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<POStatus>('all');

  const { user } = useAuth();
  const can = (permission: string) => Boolean(user?.permissions.includes(permission) || user?.roles.includes('super_admin'));
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestId = useRef(0);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const load = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true); setError('');
    if (page === 1) { setRecords([]); setTotal(0); }
    try {
      const result = await purchaseOrderService.list({ page, pageSize: 50, search: query || undefined, statusCode: statusTab === 'all' ? undefined : statusTab });
      if (request === requestId.current) { setRecords(previous => page === 1 ? result.data : [...previous, ...result.data]); setTotal(result.meta.total); }
    } catch (err) { if (request === requestId.current) setError(err instanceof Error ? err.message : 'Siparişler yüklenemedi.'); }
    finally { if (request === requestId.current) setLoading(false); }
  }, [page, query, statusTab]);
  useFocusEffect(useCallback(() => { void load(); return () => { requestId.current += 1; }; }, [load]));
  const refresh = () => { if (page === 1) void load(); else setPage(1); };
  const updateOrder = async (orderId: string, action: 'approve' | 'send') => {
    if (busyId) return;
    setBusyId(orderId);
    try { await purchaseOrderService[action](orderId); refresh(); }
    catch (err) { Alert.alert('İşlem tamamlanamadı', err instanceof Error ? err.message : 'Tekrar deneyin.'); }
    finally { setBusyId(null); }
  };
  const filtered = records.map(record => ({
    id: record.id, no: record.orderNo, supplier: record.supplier?.shortName || record.supplier?.legalTitle || 'Tedarikçi belirtilmemiş',
    type: record.purchaseType === 'administrative' ? 'İdari' : 'Ticari', total: Number(record.grandTotal ?? 0), currency: record.currency?.code ?? '',
    dueDate: record.expectedDate ? new Date(record.expectedDate).toLocaleDateString('tr-TR') : 'Belirtilmemiş', status: record.status?.code ?? '', statusName: record.status?.name ?? 'Durum belirtilmemiş',
  }));

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1a1c1d" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Satın Alma</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* KPI Row */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiBox, { backgroundColor: '#F3F4F6' }]}>
          <Text style={[styles.kpiValue, { color: '#717182' }]}>{loading && !records.length ? '—' : total}</Text>
          <Text style={styles.kpiLabel}>sipariş</Text>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: '#FFFBEB' }]}>
          <Text style={[styles.kpiValue, { color: '#D97706' }]}>{records.length}</Text>
          <Text style={styles.kpiLabel}>yüklenen</Text>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: '#EEF2FF' }]}>
          <Text style={[styles.kpiValue, { color: PRIMARY }]}>{statusTab === 'all' ? 'Tümü' : STATUS_CONFIG[statusTab]?.label}</Text>
          <Text style={styles.kpiLabel}>durum filtresi</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          {STATUS_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => { setRecords([]); setPage(1); setStatusTab(tab.key); }}
              style={[styles.tabButton, statusTab === tab.key && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, statusTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder="Sipariş numarası ara..."
            placeholderTextColor="#717182"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>
      </View>

      {/* List */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading && records.length > 0} onRefresh={refresh} />}>
        {error ? <View><Text style={{ color: '#cf060c' }}>{error}</Text><TouchableOpacity onPress={() => void load()} style={styles.actionBtn}><Text>Tekrar Dene</Text></TouchableOpacity></View> : null}
        {loading && <ActivityIndicator color={PRIMARY} />}
        {!loading && !error && !records.length && <Text>Sipariş bulunamadı.</Text>}
        {filtered.map(po => {
          const cfg = STATUS_CONFIG[po.status] ?? { label: po.statusName, bg: '#f3f4f6', text: '#6b7280' };
          return (
            <View key={po.id} style={styles.card}>
              <TouchableOpacity style={styles.cardTop} onPress={() => router.push(`/modules/purchase-orders/${po.id}`)}>
                <View style={[styles.avatar, { backgroundColor: PRIMARY }]}>
                  <Text style={styles.avatarText}>{po.supplier.charAt(0)}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.supplierText} numberOfLines={1}>{po.supplier}</Text>
                  <Text style={styles.metaText}>{po.no} · {po.type}</Text>
                  <Text style={styles.dateText}>Vade: {po.dueDate}</Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.priceText}>{po.total.toLocaleString('tr-TR')} {po.currency}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Actions */}
              {(po.status === 'pending_manager_approval' || po.status === 'approved') && (
                <View style={styles.actionsRow}>
                  {po.status === 'pending_manager_approval' && can('purchase_orders.approve') && (
                    <TouchableOpacity disabled={busyId !== null} onPress={() => void updateOrder(po.id, 'approve')} style={styles.actionBtn}>
                      <Ionicons name="checkmark-circle" size={14} color="#059669" />
                      <Text style={[styles.actionBtnText, { color: '#059669' }]}>Onayla</Text>
                    </TouchableOpacity>
                  )}
                  {po.status === 'approved' && can('purchase_orders.update') && (
                    <TouchableOpacity disabled={busyId !== null} onPress={() => void updateOrder(po.id, 'send')} style={styles.actionBtn}>
                      <Ionicons name="send" size={14} color={PRIMARY} />
                      <Text style={[styles.actionBtnText, { color: PRIMARY }]}>Gönder</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.actionsDivider} />
                  <TouchableOpacity accessibilityLabel="Sipariş detayını aç" style={styles.actionChevron} onPress={() => router.push(`/modules/purchase-orders/${po.id}`)}>
                    <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
        {!loading && !error && records.length < total && <TouchableOpacity style={styles.actionBtn} onPress={() => setPage(value => value + 1)}><Text>Daha Fazla Göster ({records.length}/{total})</Text></TouchableOpacity>}
      </ScrollView>

      {/* FAB */}
      {can('purchase_orders.create') && <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => router.push('/forms/purchase-order')}>
        <Ionicons name="add" size={24} color="#ffffff" />
      </TouchableOpacity>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 56,
    backgroundColor: '#ffffff',
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1a1c1d' },
  
  kpiRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  kpiBox: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  kpiValue: { fontSize: 14, fontWeight: '900', marginBottom: 2 },
  kpiLabel: { fontSize: 10, fontWeight: '500', color: '#717182' },

  tabsContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  tabsContent: {
    paddingHorizontal: 16,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: PRIMARY,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#717182',
  },
  tabTextActive: {
    color: PRIMARY,
  },

  searchContainer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#1a1c1d',
    padding: 0,
  },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 100 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginTop: 8,
    borderColor: 'rgba(0,0,0,0.07)',
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  cardInfo: { flex: 1 },
  supplierText: { fontSize: 14, fontWeight: '700', color: '#1a1c1d', marginBottom: 2 },
  metaText: { fontSize: 12, color: '#717182', marginBottom: 2 },
  dateText: { fontSize: 11, color: '#717182' },
  
  cardRight: { alignItems: 'flex-end', gap: 4 },
  priceText: { fontSize: 14, fontWeight: '900', color: '#1a1c1d' },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '600' },

  actionsRow: {
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
  actionBtnText: { fontSize: 12, fontWeight: '600' },
  actionsDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.06)' },
  actionChevron: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fab: {
    position: 'absolute',
    bottom: 88,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
});
