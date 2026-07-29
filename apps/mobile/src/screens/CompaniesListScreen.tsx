import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { companyService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000c69';
const RELATION_TABS = ['Tümü', 'Müşteri', 'Tedarikçi+Müşteri', 'Tedarikçi'];
const SECTORS = ['Tümü', 'CNC', 'Sac İşleme', 'Universal'];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  aktif: { label: 'Aktif', bg: '#ECFDF5', text: '#10B981' },
  pasif: { label: 'Pasif', bg: '#F3F4F6', text: '#6B7280' },
  potansiyel: { label: 'Potansiyel', bg: '#FFFBEB', text: '#F59E0B' },
  default: { label: 'Bilinmiyor', bg: '#F3F4F6', text: '#6B7280' },
};

function getStatusConfig(statusString?: string) {
  const s = (statusString || '').toLowerCase();
  if (s.includes('aktif') || s.includes('active')) return STATUS_CONFIG.aktif;
  if (s.includes('pasif') || s.includes('passive')) return STATUS_CONFIG.pasif;
  if (s.includes('potansiyel') || s.includes('potential') || s.includes('aday')) return STATUS_CONFIG.potansiyel;
  return STATUS_CONFIG.default;
}

const COLORS = ['#000c69', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#3B82F6'];

export function CompaniesListScreen() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('Tümü');
  const [relationTab, setRelationTab] = useState('Tümü');

  const load = useCallback(async () => {
    try {
      const params: Record<string, string | number | undefined> = { pageSize: 50 };
      if (search.trim()) params.search = search.trim();
      // Simplified mock filtering mapping for demonstration if needed:
      // if (relationTab !== 'Tümü') params.type = relationTab;
      
      const res = await companyService.list(params);
      setItems(normalizeList(res));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    }
  }, [search, relationTab]);

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

  // Local filtering for Sector mock
  const filteredItems = items.filter((item) => {
    if (sector === 'Tümü') return true;
    const itemSector = String(item.sector ?? item.industry ?? '');
    return itemSector.toLowerCase().includes(sector.toLowerCase()) || sector === 'Tümü';
  });

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Relation Tabs */}
      <View style={styles.relationTabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relationTabsScroll}>
          {RELATION_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setRelationTab(tab)}
              style={[styles.relationTab, relationTab === tab && styles.relationTabActive]}
            >
              <Text style={[styles.relationTabText, relationTab === tab && styles.relationTabTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Search + Sector Filter */}
      <View style={styles.filterSection}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search" size={16} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Firma, şehir veya yetkili..."
              placeholderTextColor="#9ca3af"
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity style={styles.filterButton}>
            <Ionicons name="filter" size={16} color="#4b5563" />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectorTabsScroll}>
          {SECTORS.map((s) => {
            const isActive = sector === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setSector(s)}
                style={[styles.sectorChip, isActive ? styles.sectorChipActive : styles.sectorChipInactive]}
              >
                <Text style={[styles.sectorChipText, isActive ? styles.sectorChipTextActive : styles.sectorChipTextInactive]}>
                  {s}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Count */}
      <View style={styles.countSection}>
        <Text style={styles.countText}>{filteredItems.length} firma</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {renderHeader()}
      
      {loading && items.length === 0 ? (
        <ActivityIndicator color={PRIMARY} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          style={styles.list}
          data={filteredItems}
          keyExtractor={(item, idx) => String(item.id ?? idx)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => {
            const name = String(item.legalTitle ?? item.shortName ?? item.name ?? 'Bilinmeyen Firma');
            const initial = name.charAt(0).toUpperCase();
            const avatarColor = COLORS[index % COLORS.length];
            const city = String(item.city ?? item.location ?? 'Bilinmeyen Şehir');
            const sec = String(item.sector ?? item.industry ?? 'Bilinmeyen Sektör');
            const statusObj = item.customerStatus as Record<string, unknown> | undefined;
            const statusStr = String(statusObj?.name ?? statusObj?.code ?? item.status ?? '');
            const status = getStatusConfig(statusStr);
            const phone = String(item.phone ?? item.phoneNumber ?? '');

            // Mock openDeals/revenue for visual parity if not in real data
            const openDeals = Number(item.openDeals ?? 0);
            const totalRevenue = Number(item.totalRevenue ?? 0);

            return (
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.companyCard}
                onPress={() => item.id && router.push(`/modules/customers/${String(item.id)}`)}
              >
                {/* Avatar */}
                <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>

                {/* Content */}
                <View style={styles.cardContent}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.companyName} numberOfLines={1}>{name}</Text>
                    <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.cardMetaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons name="location" size={10} color="#6b7280" />
                      <Text style={styles.metaText}>{city}</Text>
                    </View>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.metaText}>{sec}</Text>
                  </View>

                  {openDeals > 0 && (
                    <View style={styles.dealRow}>
                      <View style={styles.dealBadge}>
                        <Text style={styles.dealBadgeText}>{openDeals} kart</Text>
                      </View>
                      {totalRevenue > 0 && (
                        <Text style={styles.revenueText}>€{(totalRevenue / 1000).toFixed(0)}K</Text>
                      )}
                    </View>
                  )}
                </View>

                {/* Actions */}
                <View style={styles.actionsRow}>
                  {!!phone && (
                    <TouchableOpacity
                      style={styles.phoneButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        Linking.openURL(`tel:${phone}`);
                      }}
                    >
                      <Ionicons name="call" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                  <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => router.push('/forms/company')}
      >
        <Ionicons name="add" size={24} color="#ffffff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f7f8',
  },
  loader: {
    marginTop: 40,
  },
  error: {
    color: '#ef4444',
    padding: 16,
    fontSize: 14,
  },
  headerContainer: {
    backgroundColor: '#ffffff',
  },
  relationTabsWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  relationTabsScroll: {
    paddingHorizontal: 16,
  },
  relationTab: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  relationTabActive: {
    borderBottomColor: PRIMARY,
  },
  relationTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  relationTabTextActive: {
    color: PRIMARY,
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
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
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  sectorTabsScroll: {
    gap: 8,
    paddingBottom: 2,
  },
  sectorChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  sectorChipInactive: {
    backgroundColor: '#F3F4F6',
  },
  sectorChipActive: {
    backgroundColor: PRIMARY,
  },
  sectorChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectorChipTextInactive: {
    color: '#374151',
  },
  sectorChipTextActive: {
    color: '#ffffff',
  },
  countSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  countText: {
    fontSize: 12,
    color: '#6b7280',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
    paddingBottom: 100,
  },
  companyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  cardContent: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  companyName: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
  },
  statusChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 100,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metaText: {
    fontSize: 11,
    color: '#6b7280',
  },
  metaDot: {
    color: '#d1d5db',
    fontSize: 11,
  },
  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  dealBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 100,
  },
  dealBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: PRIMARY,
  },
  revenueText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#16a34a',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phoneButton: {
    padding: 8,
    borderRadius: 12,
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

