import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/apiClient';
import { useAuth } from '@/src/auth/AuthProvider';
import { Button } from '@/src/ui/Button';

type Row = Record<string, unknown>;
type Page = { data: Row[]; meta: { total: number; page: number; pageSize: number; totalPages: number } };
type Tab = 'list' | 'kanban' | 'complaints' | 'links';
const rec = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const str = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const PHASES = [{ code: '', label: 'Tümü' }, { code: 'open', label: 'Açık' }, { code: 'ongoing', label: 'Devam Eden' }, { code: 'done', label: 'Tamamlanan' }];
const SEVERITIES = [{ code: '', label: 'Tüm Öncelikler' }, { code: 'low', label: 'Düşük' }, { code: 'normal', label: 'Normal' }, { code: 'high', label: 'Yüksek' }, { code: 'critical', label: 'Kritik' }];
const STATUSES: Record<string, string> = { open: 'Açık', in_progress: 'Devam Ediyor', waiting_customer: 'Müşteri Bekleniyor', resolved: 'Çözüldü', closed: 'Kapalı', new: 'Yeni', converted: 'Servise Dönüştürüldü', rejected: 'Reddedildi' };

export function ServiceRequestsListScreen() {
  const { user, hasRole } = useAuth();
  const canCreate = hasRole('super_admin') || Boolean(user?.permissions.includes('service_tickets.create'));
  const [tab, setTab] = useState<Tab>('list');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState('');
  const [severity, setSeverity] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const sequence = useRef(0);
  const tickets = tab === 'list' || tab === 'kanban';
  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); setQuery(search.trim()); }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError(null);
    setSummaryError(null);
    const filters = new URLSearchParams();
    if (tab !== 'links' && query) filters.set('search', query);
    if (tickets && phase) filters.set('phase', phase);
    if (tickets && severity) filters.set('severity', severity);
    const pagination = new URLSearchParams(filters);
    pagination.set('page', String(page));
    pagination.set('pageSize', '25');
    const endpoint = tickets ? '/service-tickets' : tab === 'complaints' ? '/service-complaints' : '/service-complaint-links';
    const results = await Promise.allSettled([
      api.get<Page>(`${endpoint}?${pagination}`),
      tickets ? api.get<Row>(`/service-tickets/summary?${filters}`) : Promise.resolve(null),
    ]);
    if (current !== sequence.current) return;
    if (results[0].status === 'fulfilled') {
      const result = results[0].value;
      setItems(result.data);
      setTotal(result.meta.total);
      setTotalPages(Math.max(1, result.meta.totalPages));
    } else {
      setItems([]); setTotal(0); setSummary(null);
      setError(results[0].reason instanceof Error ? results[0].reason.message : 'Servis kayıtları yüklenemedi.');
    }
    if (results[1].status === 'fulfilled') setSummary(results[1].value);
    else { setSummary(null); setSummaryError('Servis özeti alınamadı. Yenileyerek tekrar deneyin.'); }
    setLoading(false);
  }, [tab, query, phase, severity, page, tickets]);
  useFocusEffect(useCallback(() => { setItems([]); setSummary(null); void load(); return () => { sequence.current += 1; }; }, [load]));
  const changeTab = (next: Tab) => { setPage(1); setTab(next); };
  const renderItem = ({ item }: { item: Row }) => {
    const company = rec(item.company);
    const status = rec(item.status);
    const ticket = rec(item.serviceTicket);
    const openId = tickets ? str(item.id) : str(ticket.id);
    const title = tickets ? str(item.ticketNo) : tab === 'complaints' ? str(item.complaintNo) : str(item.title) || str(item.slug);
    const statusText = tickets ? STATUSES[str(status.code)] || str(status.name) : tab === 'complaints' ? STATUSES[str(item.status)] || str(item.status) : item.revokedAt ? 'İptal Edilmiş' : 'Aktif';
    return (
      <TouchableOpacity accessibilityRole={openId ? 'button' : undefined} disabled={!openId} style={styles.card} onPress={() => router.push(`/modules/service-requests/${openId}`)}>
        <View style={styles.row}><Text style={styles.title}>{title || 'CRM kaydı'}</Text><Text style={styles.badge}>{statusText || '—'}</Text></View>
        <Text style={styles.company}>{str(company.shortName) || str(company.legalTitle) || 'Firma bilgisi yok'}</Text>
        <Text style={styles.body}>{str(item.subject) || str(item.description) || str(item.complaintText) || str(item.slug)}</Text>
        {tickets ? <Text style={styles.meta}>{SEVERITIES.find(value => value.code === item.severity)?.label || str(item.severity)} · {str(item.reportedAt)}</Text> : <Text style={styles.meta}>{str(item.createdAt)}</Text>}
        {openId ? <Text style={styles.link}>Servis Kaydını Aç ›</Text> : null}
      </TouchableOpacity>
    );
  };
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}><TouchableOpacity accessibilityLabel="Geri" onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#000c69" /></TouchableOpacity><Text style={styles.heading}>Servis Talepleri</Text>{canCreate ? <TouchableOpacity accessibilityLabel="Yeni servis talebi" onPress={() => router.push('/forms/service-ticket')}><Ionicons name="add" size={26} color="#000c69" /></TouchableOpacity> : null}</View>
      <ScrollView horizontal style={styles.tabs} contentContainerStyle={styles.filterRow} showsHorizontalScrollIndicator={false}>
        {([{ code: 'list', label: 'Liste' }, { code: 'kanban', label: 'Aşama' }, { code: 'complaints', label: 'Şikayetler' }, { code: 'links', label: 'Şikayet Linkleri' }] as const).map(value => <Button key={value.code} title={value.label} variant={tab === value.code ? 'primary' : 'secondary'} onPress={() => changeTab(value.code)} />)}
      </ScrollView>
      {tab !== 'links' ? <TextInput style={styles.search} accessibilityLabel="Servis kayıtlarında ara" value={search} onChangeText={setSearch} maxLength={128} placeholder="Numara, firma veya konu ara" /> : null}
      {tickets ? <>
        <ScrollView horizontal style={styles.tabs} contentContainerStyle={styles.filterRow} showsHorizontalScrollIndicator={false}>{PHASES.map(value => <Button key={value.code} title={value.label} variant={phase === value.code ? 'primary' : 'secondary'} onPress={() => { setPage(1); setPhase(value.code); }} />)}</ScrollView>
        <ScrollView horizontal style={styles.tabs} contentContainerStyle={styles.filterRow} showsHorizontalScrollIndicator={false}>{SEVERITIES.map(value => <Button key={value.code} title={value.label} variant={severity === value.code ? 'primary' : 'secondary'} onPress={() => { setPage(1); setSeverity(value.code); }} />)}</ScrollView>
        {summary ? <Text style={styles.summary}>Toplam {str(summary.total)} · Açık {str(summary.open)} · Acil {str(summary.urgent)}</Text> : null}
        {summaryError ? <Text style={styles.error}>{summaryError}</Text> : null}
      </> : null}
      {error ? <View style={styles.feedback}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button title="Tekrar dene" onPress={() => void load()} /></View> : null}
      {loading && !items.length ? <ActivityIndicator style={styles.feedback} color="#000c69" /> : tab === 'kanban' ? <ScrollView horizontal contentContainerStyle={styles.board} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
        {['open', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'other'].map(code => {
          const column = items.filter(item => code === 'other' ? !['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'].includes(str(rec(item.status).code)) : str(rec(item.status).code) === code);
          if (code === 'other' && !column.length) return null;
          return <View key={code} style={styles.column}><Text style={styles.title}>{STATUSES[code] || 'Diğer'} · Bu sayfada {column.length}</Text><ScrollView contentContainerStyle={{ gap: 12 }}>{column.map(item => <View key={str(item.id)}>{renderItem({ item })}</View>)}</ScrollView></View>;
        })}
      </ScrollView> : <FlatList data={items} renderItem={renderItem} keyExtractor={item => str(item.id)} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} ListEmptyComponent={!error ? <Text style={styles.body}>Filtrelere uygun CRM kaydı bulunamadı.</Text> : null} />}
      {!error && !loading ? <View style={styles.footer}><Button title="Önceki" variant="secondary" disabled={page <= 1} onPress={() => setPage(value => value - 1)} /><Text style={styles.meta}>{page} / {totalPages} · {total} kayıt</Text><Button title="Sonraki" variant="secondary" disabled={page >= totalPages} onPress={() => setPage(value => value + 1)} /></View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, backgroundColor: '#fff' },
  heading: { fontSize: 20, fontWeight: '700', color: '#000c69' },
  tabs: { flexGrow: 0 },
  board: { padding: 12, gap: 12 },
  column: { width: 280, gap: 12, backgroundColor: '#eef1f7', borderRadius: 12, padding: 12 },
  filterRow: { padding: 8, gap: 8 },
  search: { margin: 12, padding: 14, backgroundColor: '#fff', borderRadius: 12, borderColor: '#ddd', borderWidth: 1, fontSize: 16 },
  summary: { paddingHorizontal: 16, paddingVertical: 8, color: '#000c69' },
  content: { padding: 14, gap: 12, flexGrow: 1 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 13, color: '#000c69', flex: 1, fontWeight: '700' },
  badge: { color: '#555', fontSize: 12 },
  company: { fontSize: 16, fontWeight: '600', color: '#222' },
  body: { color: '#444', lineHeight: 20 },
  meta: { color: '#777', fontSize: 12 },
  link: { color: '#000c69', marginTop: 4 },
  feedback: { margin: 20, gap: 12 },
  error: { color: '#cf060c', paddingHorizontal: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
});
