import { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { financeService } from '@/src/api/services';

const PRIMARY = '#000c69';
const INK = '#1a1c1d';
const MUTED = '#717182';
const RED = '#DC2626';

type TimeFilter = 'Tümü' | 'Bu Hafta' | 'Bu Ay' | 'Gecikmiş';
const FILTER_TABS: TimeFilter[] = ['Tümü', 'Bu Hafta', 'Bu Ay', 'Gecikmiş'];

const AVATAR_COLORS = [PRIMARY, '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
function getColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function parseDueDate(row: Record<string, unknown>): Date | null {
  const raw = row.dueDate ?? row.date;
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTR(d: Date) {
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getDaysUntilDue(d: Date): number {
  const now = new Date();
  return Math.floor((d.getTime() - now.getTime()) / 86400000);
}

/** Stitch #27 Vade Takibi — premium tasarım */
export function DueDatesScreen() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TimeFilter>('Tümü');

  const load = async () => {
    try {
      const r = await financeService.dueDates();
      setRows(r as Record<string, unknown>[]);
    } catch {
      /* empty */
    }
  };

  useEffect(() => {
    void load().then(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    if (filter === 'Tümü') return rows;
    const now = new Date();
    return rows.filter((row) => {
      const d = parseDueDate(row);
      if (!d) return false;
      const days = getDaysUntilDue(d);
      if (filter === 'Gecikmiş') return days < 0;
      if (filter === 'Bu Hafta') return days >= 0 && days <= 7;
      if (filter === 'Bu Ay') return days >= 0 && days <= 30;
      return true;
    });
  }, [rows, filter]);

  /* KPI */
  const overdueCount = rows.filter((r) => {
    const d = parseDueDate(r);
    return d && getDaysUntilDue(d) < 0;
  }).length;
  const thisWeekCount = rows.filter((r) => {
    const d = parseDueDate(r);
    return d && getDaysUntilDue(d) >= 0 && getDaysUntilDue(d) <= 7;
  }).length;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={INK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vade Takvimi</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* KPI Strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.kpiScroll}
        contentContainerStyle={styles.kpiRow}
      >
        <View style={[styles.kpiChip, { backgroundColor: PRIMARY }]}>
          <Ionicons name="calendar-outline" size={16} color="#fff" />
          <View>
            <Text style={styles.kpiLabelLight}>Toplam</Text>
            <Text style={styles.kpiValueLight}>{rows.length}</Text>
          </View>
        </View>
        <View style={[styles.kpiChip, { backgroundColor: '#FEF2F2' }]}>
          <Ionicons name="alert-circle-outline" size={16} color={RED} />
          <View>
            <Text style={[styles.kpiLabel, { color: RED }]}>Gecikmiş</Text>
            <Text style={[styles.kpiValue, { color: RED }]}>{overdueCount}</Text>
          </View>
        </View>
        <View style={[styles.kpiChip, { backgroundColor: '#FFFBEB' }]}>
          <Ionicons name="time-outline" size={16} color="#D97706" />
          <View>
            <Text style={[styles.kpiLabel, { color: '#D97706' }]}>Bu Hafta</Text>
            <Text style={[styles.kpiValue, { color: '#D97706' }]}>{thisWeekCount}</Text>
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

      {/* List */}
      {loading ? (
        <ActivityIndicator color={PRIMARY} style={styles.loader} />
      ) : (
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(_, i) => String(i)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyTitle}>Vadesi yaklaşan kayıt yok</Text>
              <Text style={styles.emptySub}>Tüm ödemeleriniz güncel görünüyor</Text>
            </View>
          }
          renderItem={({ item: row }) => {
            const name = String(row.companyName ?? row.legalTitle ?? 'Firma');
            const companyId = String(row.companyId ?? '');
            const amount = String(row.amount ?? '');
            const dueDate = parseDueDate(row);
            const days = dueDate ? getDaysUntilDue(dueDate) : null;
            const color = getColor(name);

            let statusLabel = '';
            let statusBg = '#F3F4F6';
            let statusColor = MUTED;
            if (days !== null) {
              if (days < 0) {
                statusLabel = `${Math.abs(days)} gün gecikmiş`;
                statusBg = '#FEF2F2';
                statusColor = RED;
              } else if (days === 0) {
                statusLabel = 'Bugün';
                statusBg = '#FFFBEB';
                statusColor = '#D97706';
              } else if (days <= 7) {
                statusLabel = `${days} gün kaldı`;
                statusBg = '#FFFBEB';
                statusColor = '#D97706';
              } else {
                statusLabel = `${days} gün kaldı`;
                statusBg = '#ECFDF5';
                statusColor = '#059669';
              }
            }

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.card}
                onPress={
                  companyId
                    ? () =>
                        router.push(
                          `/forms/payment?companyId=${encodeURIComponent(companyId)}&companyName=${encodeURIComponent(name)}`,
                        )
                    : undefined
                }
              >
                <View style={styles.cardRow}>
                  <View style={[styles.avatar, { backgroundColor: color }]}>
                    <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.companyText} numberOfLines={1}>
                      {name}
                    </Text>
                    {dueDate && (
                      <View style={styles.metaRow}>
                        <Ionicons name="calendar-outline" size={12} color={MUTED} />
                        <Text style={styles.metaText}>{formatDateTR(dueDate)}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.cardRight}>
                    {statusLabel ? (
                      <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                    ) : null}
                    {amount ? <Text style={styles.amountText}>{amount}</Text> : null}
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
  tabBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6' },
  tabBtnActive: { backgroundColor: PRIMARY },
  tabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  tabTextActive: { color: '#fff' },
  loader: { marginTop: 40 },
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
  avatar: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cardInfo: { flex: 1, gap: 2 },
  companyText: { fontSize: 15, fontWeight: '700', color: INK },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { fontSize: 12, color: MUTED },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
  amountText: { fontSize: 14, fontWeight: '700', color: INK },
});
