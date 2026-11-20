import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import type { PipelineStageCode } from '@haksan/shared';
import { opportunityService, quoteService, fileService, financeService } from '@/src/api/services';
import { ApiError } from '@/src/api/apiClient';
import { openStoredFile } from '@/src/api/download';
import { useAuth } from '@/src/auth/AuthProvider';

const PRIMARY = '#000c69';
const RED = '#cf060c';
const INK = '#1a1c1d';
const MUTED = '#717182';
const TABS = ['Zaman Çizelgesi', 'Teklifler', 'Dokümanlar', 'Ödemeler'];
const STAGES: { key: PipelineStageCode; label: string; color: string }[] = [
  { key: 'lead', label: 'Lead', color: MUTED }, { key: 'call', label: 'Arama', color: PRIMARY },
  { key: 'visit', label: 'Ziyaret', color: '#4f46e5' }, { key: 'quote', label: 'Teklif', color: '#d97706' },
  { key: 'sales', label: 'Satış', color: PRIMARY }, { key: 'proforma', label: 'Proforma', color: PRIMARY },
  { key: 'contract', label: 'Sözleşme', color: PRIMARY }, { key: 'payment_plan', label: 'Ödeme Planı', color: PRIMARY },
  { key: 'commercial_invoice', label: 'Ticari Fatura', color: PRIMARY }, { key: 'customs_approved', label: 'Gümrük Onayı', color: PRIMARY },
  { key: 'stock_picking', label: 'Stok Hazırlama', color: PRIMARY }, { key: 'shipping', label: 'Sevkiyat', color: PRIMARY },
  { key: 'installation', label: 'Kurulum', color: PRIMARY }, { key: 'delivered', label: 'Teslim Edildi', color: '#137333' },
];
const stageName = (code: string) => STAGES.find(s => s.key === code)?.label ?? code;
const date = (value: unknown) => {
  const parsed = new Date(String(value ?? ''));
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('tr-TR');
};
const money = (value: unknown, currency?: string) => `${Number(value ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${currency ?? ''}`.trim();
function failure(error: unknown) { return error instanceof Error ? error.message : 'İşlem tamamlanamadı. Tekrar deneyin.'; }
function blockerMessages(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const details = value as { blockerLabels?: unknown[]; blockers?: unknown[] };
  const source = details.blockerLabels ?? details.blockers ?? [];
  return source.flatMap(item => typeof item === 'string' ? [item] : item && typeof item === 'object' && 'label' in item ? [String(item.label)] : []);
}

type Props = { id: string };
export function SalesCaseDetailScreen({ id }: Props) {
  const { user } = useAuth();
  const can = (permission: string) => Boolean(user?.permissions.includes(permission) || user?.roles.includes('super_admin'));
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState('');
  const [revision, setRevision] = useState(0);
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const request = ++epoch.current;
    setLoading(true); setError('');
    try {
      const result = await opportunityService.get(id);
      if (request === epoch.current) { setCard(result); setPage(1); setRevision(v => v + 1); }
    } catch (err) { if (request === epoch.current) { setCard(null); setError(failure(err)); } }
    finally { if (request === epoch.current) setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => {
    setCard(null); setRows([]); void load();
    return () => { epoch.current += 1; };
  }, [load]));
  useEffect(() => {
    let current = true;
    if (page === 1) { setRows([]); setTotal(0); } setSectionError('');
    if (!card || activeTab === 0) { setSectionLoading(false); return; }
    const permission = activeTab === 1 ? 'quotes.read' : activeTab === 2 ? 'files.read' : 'payments.read';
    if (!can(permission)) { setSectionError('Bu kayıtları görüntüleme yetkiniz yok.'); setSectionLoading(false); return; }
    if (activeTab === 3 && !card.companyId) { setSectionLoading(false); return; }
    setSectionLoading(true);
    const request = activeTab === 1
      ? quoteService.list({ opportunityId: id, page, pageSize: 100 })
      : activeTab === 2 ? fileService.links({ entityType: 'opportunity', entityId: id, page, pageSize: 100 })
      : financeService.payments({ companyId: card.companyId, page, pageSize: 100 });
    void request.then(result => {
      if (current) { setRows(previous => page === 1 ? result.data : [...previous, ...result.data]); setTotal(result.meta.total ?? result.data?.length ?? 0); }
    }).catch(err => { if (current) setSectionError(failure(err)); })
      .finally(() => { if (current) setSectionLoading(false); });
    return () => { current = false; };
  }, [id, activeTab, card?.id, card?.companyId, revision, user, page]);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch (err) {
      const missing = err instanceof ApiError ? blockerMessages(err.details) : [];
      if (missing.length) { setStageModalOpen(false); setBlockers(missing); } else Alert.alert('İşlem tamamlanamadı', failure(err));
    } finally { setBusy(false); }
  };
  const changeStage = (key: PipelineStageCode) => {
    const target = card.processReadiness?.targets?.find((t: any) => t.axis === 'operation' && t.code === key);
    const missing = blockerMessages(target);
    if (missing.length) { setStageModalOpen(false); setBlockers(missing); return; }
    if (target?.requiresReason && !reason.trim()) { Alert.alert('Gerekçe gerekli', 'Önceki aşamaya dönmek için gerekçe yazın.'); return; }
    void run(async () => {
      await opportunityService.changeStage(id, { toStage: key, changeReason: reason.trim() || undefined });
      setStageModalOpen(false); setReason(''); await load();
    });
  };
  const editOpportunity = () => { setBlockers(null); router.push({ pathname: '/forms/opportunity', params: { id } }); };
  const newQuote = () => router.push({ pathname: '/forms/offer', params: { opportunityId: id, companyId: card.companyId ?? '' } });
  const companyName = card?.company?.shortName || card?.company?.legalTitle || card?.leadCompanyName || 'Firma bağlantısı yok';
  const qualificationLabels: Record<string, string> = { lead: 'Lead', c: 'C', b: 'B', a: 'A', a_plus: 'A+', win: 'Kazanıldı', lost: 'Kaybedildi' };
  const qualificationName = (code: string) => qualificationLabels[code] ?? code;
  const timeline = card ? [
    ...(card.qualificationHistory ?? []).map((event: any) => ({ id: `qualification-${event.id}`, text: `Satış derecesi: ${qualificationName(event.fromStage ?? event.fromStageCode ?? '')} → ${qualificationName(event.toStage ?? event.toStageCode ?? '')}`, at: event.createdAt })),
    ...(card.history ?? []).map((event: any) => ({ id: `stage-${event.id}`, text: `${event.fromStage?.name ?? 'Başlangıç'} → ${event.toStage?.name ?? 'Aşama'}${event.changeReason ? ` · ${event.changeReason}` : ''}`, at: event.createdAt })),
    ...(card.contactEvents ?? []).map((event: any) => ({ id: `contact-${event.id}`, text: event.subject || event.note || 'Müşteri teması', at: event.occurredAt, user: event.actor?.fullName })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()) : [];
  const header = <View style={styles.headerBar}><TouchableOpacity accessibilityLabel="Geri" onPress={() => router.back()} style={{ padding: 8 }}><Ionicons name="arrow-back" size={24} color={INK} /></TouchableOpacity><Text style={styles.heroTitle}>Fırsat Detayı</Text></View>;
  if (loading && !card) return <SafeAreaView style={styles.root}>{header}<ActivityIndicator style={{ margin: 32 }} color={PRIMARY} /></SafeAreaView>;
  if (!card) return <SafeAreaView style={styles.root}>{header}<View style={styles.tabPanel}><Text>{error || 'Fırsat bulunamadı.'}</Text><TouchableOpacity onPress={() => void load()} style={styles.actionBtnPrimary}><Text>Tekrar Dene</Text></TouchableOpacity></View></SafeAreaView>;
  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
    {header}
    <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{card.title || 'Fırsat'}</Text>
        <TouchableOpacity disabled={!card.companyId} onPress={() => router.push(`/modules/customers/${card.companyId}`)}><Text style={styles.heroDesc}>{companyName}</Text></TouchableOpacity>
        <Text style={styles.heroValue}>{money(card.estimatedValue, card.currency?.code)}</Text>
        <Text style={styles.heroMetaText}>{card.stage?.name ?? stageName(card.stage?.code ?? '')} · {card.primaryContact?.fullName || card.leadContactName || 'Yetkili belirtilmemiş'}</Text>
        {card.description ? <Text style={styles.timelineText}>{card.description}</Text> : null}
        <View style={styles.qaList}>
          {can('opportunities.update') && <TouchableOpacity style={styles.qaBtn} onPress={() => router.push({ pathname: '/forms/opportunity', params: { id } })}><Text style={styles.qaText}>Düzenle</Text></TouchableOpacity>}
          {can('opportunities.update') && !card.processReadiness?.closed && <TouchableOpacity style={styles.qaBtn} onPress={() => setStageModalOpen(true)}><Text style={styles.qaText}>Aşamayı Değiştir</Text></TouchableOpacity>}
          {can('quotes.create') && <TouchableOpacity style={styles.qaBtn} onPress={newQuote}><Text style={styles.qaText}>Teklif Oluştur</Text></TouchableOpacity>}
        </View>
      </View>
      <ScrollView horizontal style={styles.tabsWrapper} contentContainerStyle={styles.tabsScroll}>{TABS.map((tab, index) => <TouchableOpacity key={tab} onPress={() => { setRows([]); setPage(1); setSectionError(''); setActiveTab(index); }} style={[styles.tabBtn, activeTab === index && styles.tabBtnActive]}><Text style={[styles.tabText, activeTab === index && styles.tabTextActive]}>{tab}</Text></TouchableOpacity>)}</ScrollView>
      <View style={styles.tabPanel}>
        {activeTab === 0 && (timeline.length ? timeline.map(event => <View key={event.id} style={styles.quoteCard}><Text style={styles.timelineText}>{event.text}</Text><Text style={styles.timelineMeta}>{date(event.at)}{event.user ? ` · ${event.user}` : ''}</Text></View>) : <Text style={styles.emptyTitle}>Henüz zaman çizelgesi kaydı yok.</Text>)}
        {sectionLoading && <ActivityIndicator color={PRIMARY} />}
        {sectionError ? <View><Text style={{ color: RED }}>{sectionError}</Text><TouchableOpacity style={styles.actionBtnPrimary} onPress={() => setRevision(value => value + 1)}><Text style={styles.actionBtnPrimaryText}>Tekrar Dene</Text></TouchableOpacity></View> : null}
        {activeTab === 3 && <Text style={styles.quoteMeta}>Firmanın tüm tahsilat ve ödemeleri gösterilir.</Text>}
        {activeTab > 0 && !sectionLoading && !sectionError && !rows.length && <Text style={styles.emptyTitle}>Kayıt bulunamadı.</Text>}
        {activeTab === 1 && rows.map(quote => <View key={quote.id} style={styles.quoteCard}>
          <TouchableOpacity onPress={() => router.push(`/modules/offers/${quote.id}`)}><Text style={styles.quoteNo}>{quote.documentNo || quote.subject || 'Teklif'}</Text><Text style={styles.quoteMeta}>Rev. {quote.revisionNo ?? 1} · {date(quote.createdAt)}</Text><Text style={styles.quoteAmount}>{money(quote.totalAmount ?? quote.grandTotal, quote.currency?.code)}</Text><Text style={styles.quoteMeta}>{quote.status?.name ?? quote.statusCode ?? ''}</Text></TouchableOpacity>
          <TouchableOpacity disabled={busy} style={styles.actionBtnPrimary} onPress={() => void run(() => quoteService.openPdf(quote.id))}><Text style={styles.actionBtnPrimaryText}>CRM PDF'ini Aç / Paylaş</Text></TouchableOpacity>
        </View>)}
        {activeTab === 2 && rows.map(link => <TouchableOpacity key={link.id} disabled={busy || !link.file?.id} style={styles.docCard} onPress={() => void run(() => openStoredFile(link.file.id))}><Ionicons name="document-text-outline" size={24} color={PRIMARY} /><View style={styles.docContent}><Text style={styles.docName}>{link.file?.originalFilename || 'Dosya'}</Text><Text style={styles.docMeta}>{link.documentType?.name ?? ''} · {date(link.file?.createdAt)}</Text></View><Ionicons name="download-outline" size={20} color={PRIMARY} /></TouchableOpacity>)}
        {activeTab === 3 && rows.map(payment => <TouchableOpacity key={payment.id} style={styles.quoteCard} onPress={() => router.push(`/modules/payments/${payment.id}`)}><Text style={styles.quoteAmount}>{money(payment.amount, payment.currency?.code)}</Text><Text style={styles.quoteMeta}>{date(payment.paymentDate)} · {payment.status?.name ?? ''}</Text><Text style={styles.timelineText}>{payment.description ?? payment.notes ?? ''}</Text></TouchableOpacity>)}
        {activeTab > 0 && total > rows.length && !sectionLoading && <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => setPage(value => value + 1)}><Text style={styles.actionBtnPrimaryText}>Daha Fazla Göster ({rows.length}/{total})</Text></TouchableOpacity>}
      </View>
    </ScrollView>
    <Modal visible={stageModalOpen} transparent animationType="slide" onRequestClose={() => setStageModalOpen(false)}><View style={styles.modalOverlay}><View style={[styles.modalContent, { maxHeight: '85%' }]}><Text style={styles.modalTitle}>Aşamayı Değiştir</Text><TextInput placeholder="Geri geçiş gerekçesi" value={reason} onChangeText={setReason} maxLength={1000} style={styles.modalOption} /><ScrollView>{STAGES.map(stage => <TouchableOpacity key={stage.key} disabled={busy || card.stage?.code === stage.key} onPress={() => changeStage(stage.key)} style={styles.modalOption}><View style={[styles.modalOptionDot, { backgroundColor: stage.color }]} /><Text style={styles.modalOptionText}>{stage.label}</Text>{card.stage?.code === stage.key && <Text style={styles.modalOptionCurrent}>Mevcut</Text>}</TouchableOpacity>)}</ScrollView><TouchableOpacity disabled={busy} style={styles.modalCancel} onPress={() => setStageModalOpen(false)}><Text>Kapat</Text></TouchableOpacity></View></View></Modal>
    <Modal visible={blockers !== null} transparent animationType="fade" onRequestClose={() => setBlockers(null)}><View style={styles.modalOverlay}><View style={[styles.modalContent, { maxHeight: '80%' }]}><Text style={styles.modalTitle}>Önce eksik bilgileri tamamlayın</Text><ScrollView>{blockers?.map((label, index) => <Text key={`${index}-${label}`} style={styles.timelineText}>• {label}</Text>)}</ScrollView><TouchableOpacity style={styles.actionBtnPrimary} onPress={editOpportunity}><Text style={styles.actionBtnPrimaryText}>Fırsat Bilgilerini Düzenle</Text></TouchableOpacity>{card.companyId && <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => { setBlockers(null); router.push(`/modules/customers/${card.companyId}`); }}><Text style={styles.actionBtnPrimaryText}>Firma / Yetkili Bilgileri</Text></TouchableOpacity>}<Text style={styles.quoteMeta}>Aktivite ve operasyon belgelerine ilişkin eksikler ilgili CRM ekranından tamamlanmalıdır.</Text><TouchableOpacity style={styles.modalCancel} onPress={() => setBlockers(null)}><Text>Kapat</Text></TouchableOpacity></View></View></Modal>
  </SafeAreaView>;
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
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  avatarText: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  heroInfo: { flex: 1 },
  heroTitle: { fontSize: 16, fontWeight: 'bold', color: INK },
  heroDesc: { fontSize: 12, color: MUTED, marginTop: 2 },
  heroRight: { alignItems: 'flex-end', flexShrink: 0 },
  heroValue: { fontSize: 18, fontWeight: '900', color: PRIMARY },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  heroMetaText: { fontSize: 11, color: MUTED },
  
  stageTimeline: { marginTop: 16 },
  stageTrack: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  stageCol: { flex: 1, alignItems: 'center', gap: 4 },
  stageBar: { width: '100%', height: 6, borderRadius: 3 },
  stageLabel: { fontSize: 9, fontWeight: 'bold' },

  qaList: { flexDirection: 'row', gap: 8, marginTop: 16, paddingBottom: 2 },
  qaBtn: { flexDirection: 'column', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  qaText: { fontSize: 10, fontWeight: 'bold' },

  tabsWrapper: { backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.07)' },
  tabsScroll: { paddingHorizontal: 16 },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 12, fontWeight: '600', color: MUTED },
  tabTextActive: { color: PRIMARY },

  contentArea: { flex: 1 },
  tabPanel: { padding: 16, gap: 8 },

  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineLeft: { alignItems: 'center' },
  timelineIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.07)',
  },
  timelineLine: { width: 2, flex: 1, backgroundColor: 'rgba(0,0,0,0.07)', marginTop: 4, minHeight: 16 },
  timelineContent: { flex: 1, paddingBottom: 12 },
  timelineText: { fontSize: 14, fontWeight: '500', color: INK },
  timelineMeta: { fontSize: 11, color: MUTED, marginTop: 2 },

  quoteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  quoteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  quoteNo: { fontSize: 14, fontWeight: 'bold', color: INK },
  quoteMeta: { fontSize: 12, color: MUTED, marginTop: 2 },
  quoteAmount: { fontSize: 14, fontWeight: '900', color: PRIMARY },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 },
  statusBadgeText: { fontSize: 10, fontWeight: 'bold' },
  quoteActions: { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  quoteBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  quoteBtnText: { fontSize: 12, fontWeight: '600' },

  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    marginTop: 8,
  },
  actionBtnPrimaryText: { fontSize: 14, fontWeight: 'bold', color: PRIMARY },

  docCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  docIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
  docContent: { flex: 1 },
  docName: { fontSize: 14, fontWeight: 'bold', color: INK },
  docMeta: { fontSize: 12, color: MUTED, marginTop: 2 },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 14, fontWeight: '500', color: MUTED, marginTop: 8 },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
  },
  actionBtnOutlineText: { fontSize: 14, fontWeight: 'bold', color: '#0f766e' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 32 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 14, fontWeight: 'bold', color: INK, marginBottom: 12 },
  modalOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f7f7f8' },
  modalOptionDot: { width: 10, height: 10, borderRadius: 5 },
  modalOptionText: { fontSize: 14, fontWeight: '500', color: INK, flex: 1 },
  modalOptionCurrent: { fontSize: 12, fontWeight: '600', color: PRIMARY },
  modalCancel: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '500', color: MUTED },
});
