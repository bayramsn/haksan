import { useState, useRef, useCallback } from 'react';
import { ActivityIndicator, Alert, View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/src/api/apiClient';
import { serviceService } from '@/src/api/services';
import { openFileUrl } from '@/src/api/download';
import { useAuth } from '@/src/auth/AuthProvider';
import { Button } from '@/src/ui/Button';

const PRIMARY = '#000c69';
const RED = '#cf060c';
const INK = '#1a1c1d';
const MUTED = '#717182';
const SERVICE_GREEN = '#0f766e';

type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Row[] : [];
const STAGES: Record<string, string> = {
  'Request Opened': 'Talep Açıldı', Diagnosis: 'Teşhis', 'Quote Needed': 'Teklif Gerekli',
  'Quote Sent': 'Teklif Gönderildi', Approval: 'Onay', Scheduled: 'Planlandı',
  'Service In Progress': 'Servis Devam Ediyor', 'Service Completed': 'Servis Tamamlandı',
  'Signed Form': 'İmzalı Form', Closed: 'Kapalı',
};
const PRIORITIES: Record<string, string> = { low: 'Düşük', normal: 'Normal', high: 'Yüksek', critical: 'Kritik' };
const STATUS_LABELS: Record<string, string> = { open: 'Açık', in_progress: 'Devam Ediyor', waiting_customer: 'Müşteri Bekleniyor', resolved: 'Çözüldü', closed: 'Kapalı' };
const TABS = ['Özet', 'Servis Teklifi', 'Garanti/RMA', 'Tamamlama', 'Notlar'];

export function ServiceRequestDetailScreen({ id }: { id: string }) {
  const { user, hasRole } = useAuth();
  const canUpdate = hasRole('super_admin') || Boolean(user?.permissions.includes('service_tickets.update'));
  const [request, setRequest] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stagePicker, setStagePicker] = useState(false);
  const [note, setNote] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      // Tekil endpoint sayfalama veya örnek kayda düşmeden CRM kaydını getirir.
      const data = await api.get<Row>(`/service-tickets/${encodeURIComponent(id)}`);
      if (sequence === generation.current) setRequest(data);
    } catch (cause) {
      if (sequence === generation.current) {
        setRequest(null);
        setError(cause instanceof Error ? cause.message : 'Servis kaydı yüklenemedi.');
      }
    } finally {
      if (sequence === generation.current) setLoading(false);
    }
  }, [id]);
  useFocusEffect(useCallback(() => {
    setRequest(null);
    setNote('');
    void load();
    return () => { generation.current += 1; };
  }, [load]));

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch (cause) { Alert.alert('İşlem tamamlanamadı', cause instanceof Error ? cause.message : 'Tekrar deneyin.'); }
    finally { setBusy(false); }
  };
  const setStage = (status: string, stage: string) => void run(async () => {
    await serviceService.updateTicketStatus(id, status, stage);
    setStagePicker(false);
    await load();
  });
  const saveNote = () => void run(async () => {
    const message = note.trim();
    if (!message) throw new Error('Servis notunu yazın.');
    const latest = await api.get<Row>(`/service-tickets/${encodeURIComponent(id)}`);
    const metadata = record(latest.metadata);
    const history = rows(metadata.noteHistory);
    await serviceService.update(id, { metadata: { ...metadata, noteHistory: [...history, {
      id: `mobile-${Date.now()}`, text: message, createdAt: new Date().toISOString(), userId: user?.id,
    }] } });
    setNote('');
    await load();
  });
  const download = () => void run(() => openFileUrl(`/service-tickets/${encodeURIComponent(id)}/service-form.pdf`, { method: 'GET', filename: `${text(request?.ticketNo) || 'servis-formu'}.pdf` }));

  const metadata = record(request?.metadata);
  const company = record(request?.company);
  const status = record(request?.status);
  const completion = record(metadata.completionForm);
  const machine = record(completion.tezgah);
  const quote = record(metadata.serviceQuote);
  const quoteItems = rows(quote.items);
  const operations = rows(metadata.operations);
  const checks = rows(completion.checks);
  const notes = rows(metadata.noteHistory);
  const warranty = record(request?.warrantyClaim);
  const stage = text(metadata.serviceStage);
  const currency = text(quote.currency) || 'TRY';
  const total = quoteItems.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  const field = (label: string, value: unknown) => <View key={label} style={styles.rmaRow}><Text style={styles.rmaLabel}>{label}</Text><Text style={[styles.rmaVal, { flex: 1, textAlign: 'right', paddingLeft: 12 }]}>{text(value) || '—'}</Text></View>;
  const card = (title: string, content: React.ReactNode) => <View style={styles.card}><Text style={styles.cardHeader}>{title}</Text>{content}</View>;
  const empty = (message: string) => <Text style={styles.cardBody}>{message}</Text>;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.headerBar}>
        <TouchableOpacity accessibilityLabel="Geri" accessibilityRole="button" onPress={() => router.back()} style={{ padding: 12 }}><Ionicons name="arrow-back" size={24} color={INK} /></TouchableOpacity>
        <Text style={styles.assignedName}>Servis Kaydı</Text>
      </View>
      {loading && !request ? <ActivityIndicator style={{ marginTop: 40 }} color={PRIMARY} /> : error || !request ? (
        <View style={styles.tabPanel}><Text accessibilityRole="alert" style={styles.cardBody}>{error || 'Servis kaydı bulunamadı.'}</Text><Button title="Tekrar dene" onPress={() => void load()} /></View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
          <View style={styles.hero}>
            <Text style={styles.heroId}>{text(request.ticketNo) || id}</Text>
            <Text style={styles.heroTitle}>{text(request.subject) || 'Servis talebi'}</Text>
            <Text style={styles.heroSub}>{text(company.shortName) || text(company.legalTitle) || 'Firma bilgisi yok'}</Text>
            <View style={styles.heroTags}><View style={[styles.stageChip, { borderColor: PRIMARY }]}><Text style={[styles.stageChipText, { color: PRIMARY }]}>{STAGES[stage] || STATUS_LABELS[text(status.code)] || text(status.name) || stage || 'Durum bilgisi yok'}</Text></View><Text style={styles.priorityText}>{PRIORITIES[text(request.severity)] || text(request.severity)}</Text></View>
            <View style={{ marginTop: 16 }}><Button title="Servis Formu PDF Aç / Paylaş" onPress={download} loading={busy} /></View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsWrapper} contentContainerStyle={styles.tabsScroll}>
            {TABS.map((label, index) => <TouchableOpacity key={label} accessibilityRole="tab" accessibilityState={{ selected: activeTab === index }} style={[styles.tabBtn, activeTab === index && styles.tabBtnActive]} onPress={() => setActiveTab(index)}><Text style={[styles.tabText, activeTab === index && styles.tabTextActive]}>{label}</Text></TouchableOpacity>)}
          </ScrollView>
          <View style={styles.tabPanel}>
            {activeTab === 0 ? <>
              {card('MÜŞTERİ PROBLEMİ', empty(text(request.description) || 'Açıklama kaydedilmemiş.'))}
              {card('SERVİS BİLGİLERİ', <>{field('İlgili kişi', record(request.contact).fullName)}{field('Makine', [text(machine.marka), text(machine.model), text(machine.seriNo)].filter(Boolean).join(' / '))}{field('Rapor tarihi', request.reportedAt)}{field('Çözüm notu', request.resolutionNote)}{field('Atanan kullanıcı', request.assignedToUserId || 'Atanmamış')}</>)}
              {canUpdate ? <><Button title="Aşama Güncelle" onPress={() => setStagePicker(value => !value)} disabled={busy} />{stagePicker ? <View style={{ gap: 8 }}>{[
                ['Diagnosis', 'Teşhis'], ['Quote Needed', 'Servis Teklifi'], ['Scheduled', 'Bakım/Onarım'], ['Service In Progress', 'Devam Ediyor'],
              ].map(([code, label]) => <Button key={code} variant="secondary" title={label} disabled={busy} onPress={() => setStage('in_progress', code)} />)}</View> : null}</> : null}
              {card('KAYITLI İŞLEMLER', operations.length ? operations.map((item, index) => <View key={text(item.id) || index} style={styles.itemRow}><Text style={styles.cardBody}>{text(item.description) || 'İşlem'}</Text><Text style={styles.itemMeta}>{text(item.quantity)} {text(item.currency)}</Text></View>) : empty('Bu servis için işlem kaydedilmemiş.'))}
            </> : null}
            {activeTab === 1 ? <>{card('SERVİS TEKLİFİ', quoteItems.length ? <>{field('Teklif No', quote.quoteNo)}{field('Tarih', quote.date)}{field('Konu', quote.subject)}{quoteItems.map((item, index) => <View key={text(item.id) || index} style={styles.itemRow}><View style={{ flex: 1 }}><Text style={styles.itemName}>{text(item.description)}</Text><Text style={styles.itemMeta}>{text(item.quantity)} {text(item.unit)} × {text(item.unitPrice)} {currency}</Text></View></View>)}{field('Ara toplam', `${total.toLocaleString('tr-TR')} ${currency}`)}</> : empty('CRM’de kayıtlı servis teklifi bulunmuyor.'))}</> : null}
            {activeTab === 2 ? card('GARANTİ / RMA', warranty.id ? <>{field('Durum', warranty.status)}{field('Kapsam önerisi', warranty.coverageSuggestion)}{field('Kapsam kararı', warranty.coverageDecision)}{field('RMA No', warranty.rmaNo)}{field('Tedarikçi durumu', warranty.supplierRmaStatus)}</> : empty('Garanti veya RMA kaydı bulunmuyor.')) : null}
            {activeTab === 3 ? <>
              {card('TAMAMLAMA FORMU', <>{field('Yapılan işler', completion.yapilanIsler)}{field('Teknisyen', completion.kurulumuYapan)}{field('Teslim alan', completion.teslimAlan)}{field('İmza tarihi', completion.signedAt)}{checks.length ? checks.map((item, index) => field(text(item.label) || `Kontrol ${index + 1}`, item.status === 'done' ? 'Tamamlandı' : item.status === 'na' ? 'Uygulanmaz' : 'Tamamlanmadı')) : empty('Kayıtlı kontrol listesi bulunmuyor.')}</>)}
              {canUpdate && text(status.code) !== 'closed' ? <Button title="Tamamlama Formunu Doldur ve İmzala" onPress={() => router.push({ pathname: '/forms/service-complete', params: { ticketId: id } })} /> : null}
              {canUpdate && text(status.code) !== 'closed' ? <Button title="Servisi Kapat" disabled={busy} onPress={() => Alert.alert('Servisi kapat', 'CRM’deki imzalı tamamlama formu doğrulandıktan sonra servis kapatılır.', [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Kapat', onPress: () => setStage('closed', 'Closed') }])} /> : null}
            </> : null}
            {activeTab === 4 ? <>
              {notes.length ? notes.map((item, index) => <View key={text(item.id) || index} style={styles.card}><Text style={styles.noteText}>{text(item.text)}</Text><Text style={styles.noteMeta}>{text(item.createdAt)}</Text></View>) : card('NOTLAR', empty('CRM’de servis notu bulunmuyor.'))}
              {canUpdate ? <><TextInput accessibilityLabel="Servis notu" placeholder="Yeni servis notu" value={note} onChangeText={setNote} multiline maxLength={4000} style={[styles.card, styles.cardBody, { minHeight: 100 }]} editable={!busy} /><Button title="Notu CRM’ye Kaydet" disabled={!note.trim()} loading={busy} onPress={saveNote} /></> : null}
            </> : null}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  scroll: { flex: 1 },
  hero: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  heroId: { fontFamily: 'Courier', fontSize: 12, fontWeight: '700', color: MUTED, marginBottom: 4 },
  heroTitle: { fontSize: 18, fontWeight: 'bold', color: INK },
  heroSub: { fontSize: 13, color: MUTED, marginTop: 4 },
  heroTags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
  stageChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, borderWidth: 1 },
  stageChipText: { fontSize: 11, fontWeight: 'bold' },
  priorityText: { fontSize: 11, fontWeight: 'bold' },
  tagChip: { backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100 },
  tagChipText: { fontSize: 10, fontWeight: '600', color: '#4b5563' },

  timerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f7f7f8',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  timerLabel: { fontSize: 10, fontWeight: 'bold', color: MUTED, marginBottom: 4 },
  timerText: { fontSize: 24, fontWeight: '900', color: PRIMARY, letterSpacing: 1 },
  timerActions: { flexDirection: 'row', gap: 8 },
  timerPlayBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: SERVICE_GREEN, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  timerPlayText: { color: '#ffffff', fontSize: 14, fontWeight: 'bold' },
  timerPauseBtn: { padding: 10, borderRadius: 12, backgroundColor: '#fef7e0' },
  timerStopBtn: { padding: 10, borderRadius: 12, backgroundColor: '#fef2f2' },

  tabsWrapper: { backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.07)' },
  tabsScroll: { paddingHorizontal: 12 },
  tabBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  tabTextActive: { color: PRIMARY },

  contentArea: { flex: 1 },
  tabPanel: { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  cardHeader: { fontSize: 11, fontWeight: 'bold', color: MUTED, marginBottom: 12 },
  cardBody: { fontSize: 14, color: INK, lineHeight: 20 },

  assignedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  assignedAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: SERVICE_GREEN, alignItems: 'center', justifyContent: 'center' },
  assignedAvatarText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  assignedName: { fontSize: 14, fontWeight: '600', color: INK },
  assignedRole: { fontSize: 12, color: MUTED, marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: 'bold' },

  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  itemName: { fontSize: 14, fontWeight: '600', color: INK },
  itemMeta: { fontSize: 12, color: MUTED, marginTop: 4 },
  itemTotal: { fontSize: 15, fontWeight: '900', color: INK },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, marginTop: 8, borderTopWidth: 2, borderTopColor: 'rgba(0,0,0,0.08)' },
  totalLabel: { fontSize: 14, fontWeight: 'bold', color: INK },
  totalVal: { fontSize: 18, fontWeight: '900', color: PRIMARY },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
  },
  addBtnText: { fontSize: 14, fontWeight: 'bold', color: PRIMARY },

  garantiBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  garantiChip: { backgroundColor: '#e6f4ea', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  garantiText: { color: '#137333', fontSize: 11, fontWeight: 'bold' },
  garantiDate: { fontSize: 12, color: MUTED },

  rmaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  rmaLabel: { fontSize: 12, color: MUTED },
  rmaVal: { fontSize: 12, fontWeight: '600', color: INK },

  clHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  clProgressText: { fontSize: 12, fontWeight: 'bold', color: PRIMARY },
  clTrack: { height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, marginBottom: 16, overflow: 'hidden' },
  clFill: { height: '100%', backgroundColor: SERVICE_GREEN },
  clItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  clItemBorder: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  clBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  clNa: { fontSize: 8, fontWeight: 'bold' },
  clLabel: { flex: 1, fontSize: 14, color: INK },
  clBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100 },
  clBadgeText: { fontSize: 10, fontWeight: 'bold' },

  noteText: { fontSize: 14, color: INK, lineHeight: 20 },
  noteMeta: { fontSize: 11, color: MUTED, marginTop: 8 },
});
