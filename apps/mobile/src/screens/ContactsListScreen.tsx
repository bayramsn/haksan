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
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { contactService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000c69';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  aktif: { label: 'Aktif', bg: '#ECFDF5', text: '#10B981' },
  pasif: { label: 'Pasif', bg: '#F3F4F6', text: '#6B7280' },
  potansiyel: { label: 'Potansiyel', bg: '#FFFBEB', text: '#F59E0B' },
  default: { label: 'Aktif', bg: '#ECFDF5', text: '#10B981' }, // Fallback to Aktif
};

function getStatusConfig(statusString?: string) {
  const s = (statusString || '').toLowerCase();
  if (s.includes('aktif') || s.includes('active')) return STATUS_CONFIG.aktif;
  if (s.includes('pasif') || s.includes('passive')) return STATUS_CONFIG.pasif;
  if (s.includes('potansiyel') || s.includes('potential')) return STATUS_CONFIG.potansiyel;
  return STATUS_CONFIG.default;
}

const COLORS = ['#000c69', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#3B82F6'];

export function ContactsListScreen() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const params: Record<string, string | number | undefined> = { pageSize: 50 };
      if (search.trim()) params.q = search.trim();
      const res = await contactService.list(params);
      setItems(normalizeList(res));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    }
  }, [search]);

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

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kontaklar</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="İsim, firma veya pozisyon ara..."
            placeholderTextColor="#9ca3af"
            returnKeyType="search"
          />
        </View>
      </View>

      <View style={styles.countSection}>
        <Text style={styles.countText}>{items.length} kontakt</Text>
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
          data={items}
          keyExtractor={(item, idx) => String(item.id ?? idx)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => {
            const firstName = String(item.firstName ?? item.name ?? 'İsimsiz');
            const lastName = String(item.lastName ?? item.surname ?? '');
            const fullName = `${firstName} ${lastName}`.trim();
            const initials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
            
            const position = String(item.title ?? item.position ?? 'Pozisyon Yok');
            
            // Resolve company
            const coObj = item.company as Record<string, unknown> | undefined;
            const companyName = String(coObj?.legalTitle ?? coObj?.shortName ?? item.companyName ?? 'Bilinmeyen Firma');

            const statusObj = item.status as Record<string, unknown> | undefined;
            const statusStr = String(statusObj?.name ?? statusObj?.code ?? item.statusCode ?? '');
            const status = getStatusConfig(statusStr);

            const avatarColor = COLORS[index % COLORS.length];

            const email = String(item.email ?? item.emailAddress ?? '');
            const phone = String(item.phone ?? item.mobile ?? item.phoneNumber ?? '');

            return (
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.contactCard}
                onPress={() => item.id && router.push(`/modules/contacts/${String(item.id)}`)}
              >
                {/* Avatar */}
                <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>

                {/* Info */}
                <View style={styles.infoContent}>
                  <View style={styles.titleRow}>
                    <Text style={styles.fullName} numberOfLines={1}>{fullName}</Text>
                    <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.positionText} numberOfLines={1}>{position}</Text>
                  <Text style={styles.companyText} numberOfLines={1}>{companyName}</Text>
                </View>

                {/* Actions */}
                <View style={styles.actionsRow}>
                  {!!email && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#f3f4f6' }]}
                      onPress={(e) => {
                        e.stopPropagation();
                        Linking.openURL(`mailto:${email}`);
                      }}
                    >
                      <Ionicons name="mail" size={14} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                  {!!phone && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#eef2ff' }]}
                      onPress={(e) => {
                        e.stopPropagation();
                        Linking.openURL(`tel:${phone}`);
                      }}
                    >
                      <Ionicons name="call" size={14} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                  <View style={styles.chevronWrapper}>
                    <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => router.push('/forms/contact')}
      >
        <Ionicons name="add" size={24} color="#ffffff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' },
  loader: { marginTop: 40 },
  error: { color: '#ef4444', padding: 16, fontSize: 14 },
  
  headerContainer: { backgroundColor: '#ffffff' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
  
  countSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  countText: { fontSize: 12, color: '#6b7280' },
  
  list: { flex: 1 },
  listContent: {
    paddingVertical: 8,
    paddingBottom: 100,
  },
  
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#ffffff', fontSize: 14, fontWeight: 'bold' },
  
  infoContent: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fullName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  statusChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 100 },
  statusText: { fontSize: 10, fontWeight: '500' },
  
  positionText: { fontSize: 11, color: '#4b5563', marginTop: 2 },
  companyText: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn: { padding: 8, borderRadius: 12 },
  chevronWrapper: { padding: 8 },
  
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

