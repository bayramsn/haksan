import { useEffect, useMemo, useState } from 'react';
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
import { adminService } from '@/src/api/services';
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

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin: { bg: '#FEF2F2', text: '#DC2626' },
  manager: { bg: '#EEF2FF', text: PRIMARY },
  user: { bg: '#ECFDF5', text: '#059669' },
  default: { bg: '#F3F4F6', text: MUTED },
};

function getRoleBadge(row: Record<string, unknown>) {
  const role = String(row.role ?? row.roleName ?? '').toLowerCase();
  if (role.includes('admin')) return { label: 'Admin', ...ROLE_COLORS.admin };
  if (role.includes('manager') || role.includes('müdür')) return { label: 'Yönetici', ...ROLE_COLORS.manager };
  if (role.includes('user') || role.includes('kullanıcı')) return { label: 'Kullanıcı', ...ROLE_COLORS.user };
  return null;
}

type Props = { navKey: string };

/** Stitch #13 Kullanıcılar & admin listeleri — premium tasarım */
export function AdminListScreen({ navKey }: Props) {
  const mod = getModule(navKey);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const titleField = navKey === 'users' ? 'fullName' : 'name';
  const subField = navKey === 'users' ? 'email' : 'code';
  const iconName: any =
    navKey === 'users'
      ? 'people-outline'
      : navKey === 'roles'
        ? 'shield-outline'
        : navKey === 'divisions'
          ? 'grid-outline'
          : 'business-outline';

  const pageTitle = mod?.label ?? 'Liste';

  const load = async () => {
    try {
      const res =
        navKey === 'users'
          ? await adminService.users()
          : navKey === 'roles'
            ? await adminService.roles()
            : navKey === 'divisions'
              ? await adminService.divisions()
              : await adminService.departments();
      setRows(res as Record<string, unknown>[]);
    } catch {
      /* empty */
    }
  };

  useEffect(() => {
    void load().then(() => setLoading(false));
  }, [navKey]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const term = q.toLowerCase();
    return rows.filter((row) => {
      const title = String(row[titleField] ?? '').toLowerCase();
      const sub = String(row[subField] ?? '').toLowerCase();
      return title.includes(term) || sub.includes(term);
    });
  }, [rows, q, titleField, subField]);

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
      <View style={styles.kpiContainer}>
        <View style={[styles.kpiChip, { backgroundColor: PRIMARY }]}>
          <Ionicons name={iconName} size={16} color="#fff" />
          <View>
            <Text style={styles.kpiLabelLight}>Toplam</Text>
            <Text style={styles.kpiValueLight}>{rows.length}</Text>
          </View>
        </View>
        {navKey === 'users' && (
          <View style={[styles.kpiChip, { backgroundColor: '#EEF2FF' }]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={PRIMARY} />
            <View>
              <Text style={[styles.kpiLabel, { color: PRIMARY }]}>Admin</Text>
              <Text style={[styles.kpiValue, { color: PRIMARY }]}>
                {rows.filter((r) => String(r.role ?? r.roleName ?? '').toLowerCase().includes('admin')).length}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Search */}
      {searchOpen && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder={`${pageTitle} ara...`}
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
      {loading ? (
        <ActivityIndicator color={PRIMARY} style={styles.loader} />
      ) : (
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(row, i) => String(row.id ?? i)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name={iconName} size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>Kayıt bulunamadı</Text>
            </View>
          }
          renderItem={({ item: row }) => {
            const title = String(row[titleField] ?? '—');
            const subtitle = String(row[subField] ?? '');
            const initial = title.charAt(0).toUpperCase();
            const color = getColor(title);
            const badge = navKey === 'users' ? getRoleBadge(row) : null;

            return (
              <TouchableOpacity activeOpacity={0.8} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={[styles.avatar, { backgroundColor: color }]}>
                    <Text style={styles.avatarText}>{initial}</Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.titleText} numberOfLines={1}>
                      {title}
                    </Text>
                    {subtitle ? (
                      <Text style={styles.subtitleText} numberOfLines={1}>
                        {subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {badge && (
                    <View style={[styles.roleBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.roleText, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
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
  kpiContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#fff',
  },
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
  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: INK },
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
  avatar: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cardInfo: { flex: 1, gap: 2 },
  titleText: { fontSize: 15, fontWeight: '700', color: INK },
  subtitleText: { fontSize: 13, color: MUTED },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleText: { fontSize: 11, fontWeight: '600' },
});
