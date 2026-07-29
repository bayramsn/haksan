import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const PRIMARY = '#000c69';

type POStatus = 'all' | 'onay_bekliyor' | 'onaylandi' | 'gonderildi' | 'tamamlandi';

const MOCK_POS = [
  { id: 'po1', no: 'PO-2026-001', supplier: 'Kontrol Elektronik Ltd.', type: 'Ticari', total: 3200, currency: 'EUR', dueDate: '15.07.2026', status: 'onay_bekliyor', items: 2 },
  { id: 'po2', no: 'PO-2026-002', supplier: 'Endüstriyel Parça A.Ş.', type: 'Ticari', total: 8700, currency: 'EUR', dueDate: '20.06.2026', status: 'tamamlandi', items: 5 },
  { id: 'po3', no: 'PO-2026-003', supplier: 'Siemens Türkiye', type: 'İdari', total: 4500, currency: 'EUR', dueDate: '01.08.2026', status: 'onaylandi', items: 1 },
  { id: 'po4', no: 'PO-2026-004', supplier: 'Yedek Parça Ltd.', type: 'Ticari', total: 1800, currency: 'EUR', dueDate: '30.07.2026', status: 'gonderildi', items: 3 },
  { id: 'po5', no: 'PO-2026-005', supplier: 'Makine Ekipman A.Ş.', type: 'İdari', total: 920, currency: 'EUR', dueDate: '10.07.2026', status: 'onay_bekliyor', items: 4 },
];

const STATUS_CONFIG: Record<POStatus | string, { label: string; bg: string; text: string }> = {
  onay_bekliyor: { label: 'Onay Bekliyor', bg: '#FFFBEB', text: '#D97706' },
  onaylandi: { label: 'Onaylandı', bg: '#EEF2FF', text: PRIMARY },
  gonderildi: { label: 'Gönderildi', bg: '#F0FDF4', text: '#059669' },
  tamamlandi: { label: 'Tamamlandı', bg: '#F3F4F6', text: '#6B7280' },
};

const STATUS_TABS: { key: POStatus; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'onay_bekliyor', label: 'Bekliyor' },
  { key: 'onaylandi', label: 'Onaylı' },
  { key: 'gonderildi', label: 'Gönderildi' },
  { key: 'tamamlandi', label: 'Tamamlandı' },
];

export function PurchaseOrdersListScreen() {
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<POStatus>('all');

  const filtered = useMemo(() => {
    return MOCK_POS.filter(p => {
      const matchSearch = `${p.no} ${p.supplier}`.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusTab === 'all' || p.status === statusTab;
      return matchSearch && matchStatus;
    });
  }, [search, statusTab]);

  const totalValue = MOCK_POS.reduce((s, p) => s + p.total, 0);

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
          <Text style={[styles.kpiValue, { color: '#717182' }]}>{MOCK_POS.length}</Text>
          <Text style={styles.kpiLabel}>sipariş</Text>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: '#FFFBEB' }]}>
          <Text style={[styles.kpiValue, { color: '#D97706' }]}>{MOCK_POS.filter(p => p.status === 'onay_bekliyor').length}</Text>
          <Text style={styles.kpiLabel}>onay</Text>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: '#EEF2FF' }]}>
          <Text style={[styles.kpiValue, { color: PRIMARY }]}>€{(totalValue / 1000).toFixed(1)}K</Text>
          <Text style={styles.kpiLabel}>toplam</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          {STATUS_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setStatusTab(tab.key)}
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
            placeholder="PO no veya tedarikçi..."
            placeholderTextColor="#717182"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>
      </View>

      {/* List */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {filtered.map(po => {
          const cfg = STATUS_CONFIG[po.status];
          return (
            <View key={po.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.avatar, { backgroundColor: PRIMARY }]}>
                  <Text style={styles.avatarText}>{po.supplier.charAt(0)}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.supplierText} numberOfLines={1}>{po.supplier}</Text>
                  <Text style={styles.metaText}>{po.no} · {po.type} · {po.items} kalem</Text>
                  <Text style={styles.dateText}>Vade: {po.dueDate}</Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.priceText}>€{po.total.toLocaleString('tr-TR')}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                  </View>
                </View>
              </View>

              {/* Actions */}
              {(po.status === 'onay_bekliyor' || po.status === 'onaylandi') && (
                <View style={styles.actionsRow}>
                  {po.status === 'onay_bekliyor' && (
                    <TouchableOpacity style={styles.actionBtn}>
                      <Ionicons name="checkmark-circle" size={14} color="#059669" />
                      <Text style={[styles.actionBtnText, { color: '#059669' }]}>Onayla</Text>
                    </TouchableOpacity>
                  )}
                  {po.status === 'onaylandi' && (
                    <TouchableOpacity style={styles.actionBtn}>
                      <Ionicons name="send" size={14} color={PRIMARY} />
                      <Text style={[styles.actionBtnText, { color: PRIMARY }]}>Gönder</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.actionsDivider} />
                  <TouchableOpacity style={styles.actionChevron}>
                    <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => router.push('/forms/purchase-order')}>
        <Ionicons name="add" size={24} color="#ffffff" />
      </TouchableOpacity>
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
