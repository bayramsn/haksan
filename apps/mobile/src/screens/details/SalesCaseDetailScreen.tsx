import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const PRIMARY = '#000c69';
const RED = '#cf060c';
const INK = '#1a1c1d';
const MUTED = '#717182';

const STAGES = [
  { key: 'lead', label: 'Lead', color: '#9CA3AF' },
  { key: 'arama', label: 'Arama', color: PRIMARY },
  { key: 'ziyaret', label: 'Ziyaret', color: '#4F46E5' },
  { key: 'teklif', label: 'Teklif', color: '#F59E0B' },
  { key: 'satis', label: 'Satış', color: '#137333' },
];

const TABS = ['Zaman Çizelgesi', 'Teklifler', 'Dokümanlar', 'Ödemeler'];

// MOCK DATA
const companies = [
  { id: '1', name: 'Haksan Makina', avatarColor: '#000c69' },
  { id: '2', name: 'Asil Çelik', avatarColor: '#10B981' },
];

const salesCards = [
  { id: '1', companyId: '1', notes: 'Yeni CNC Tezgahı Alımı', stage: 'teklif', createdAt: '20.06.2026', value: 24500, companyName: 'Haksan Makina' },
];

const MOCK_TIMELINE = [
  { id: 't1', type: 'stage', text: 'Satış kartı oluşturuldu — Lead aşamasında', time: '01.06.2026 09:00', user: 'Satış' },
  { id: 't2', type: 'call', text: 'Arama yapıldı — müşteri bilgilendirildi', time: '03.06.2026 10:30', user: 'Ahmet K.' },
  { id: 't3', type: 'stage', text: 'Aşama güncellendi: Lead → Arama', time: '05.06.2026 09:15', user: 'Sistem' },
  { id: 't4', type: 'visit', text: 'Saha ziyareti tamamlandı', time: '08.06.2026 14:00', user: 'Serkan T.' },
  { id: 't5', type: 'offer', text: 'Teklif oluşturuldu: TKL-2026-001 — €24.500', time: '10.06.2026 11:30', user: 'Satış' },
  { id: 't6', type: 'stage', text: 'Aşama güncellendi: Arama → Teklif', time: '10.06.2026 11:31', user: 'Sistem' },
];

const MOCK_QUOTES = [
  { id: 'q1', no: 'TKL-2026-001', amount: 24500, status: 'gonderilen', date: '10.06.2026', revision: 1 },
];

const MOCK_DOCS = [
  { id: 'd1', name: 'Teknik_Şartname.pdf', type: 'PDF', size: '2.4 MB', date: '05.06.2026' },
];

const TIMELINE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  stage: 'refresh-outline', call: 'call-outline', visit: 'car-outline', offer: 'document-text-outline', note: 'create-outline', payment: 'cash-outline',
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  taslak: { label: 'Taslak', bg: '#f3f4f6', text: '#4b5563' },
  gonderilen: { label: 'Gönderildi', bg: '#eef2ff', text: PRIMARY },
  onaylanan: { label: 'Onaylandı', bg: '#e6f4ea', text: '#137333' },
  reddedilen: { label: 'Reddedildi', bg: '#fef2f2', text: RED },
};

type Props = { id: string };

export function SalesCaseDetailScreen({ id }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [stageModalOpen, setStageModalOpen] = useState(false);

  const card = salesCards.find(c => c.id === id) ?? salesCards[0];
  const company = companies.find(c => c.id === card.companyId);
  const stageIndex = STAGES.findIndex(s => s.key === card.stage);
  
  // Fake days
  const daysInStage = 12;

  const renderTimeline = () => (
    <View style={styles.tabPanel}>
      {MOCK_TIMELINE.map((event, i) => (
        <View key={event.id} style={styles.timelineRow}>
          <View style={styles.timelineLeft}>
            <View style={styles.timelineIconBox}>
              <Ionicons name={TIMELINE_ICONS[event.type] || 'ellipse'} size={14} color={INK} />
            </View>
            {i < MOCK_TIMELINE.length - 1 && <View style={styles.timelineLine} />}
          </View>
          <View style={styles.timelineContent}>
            <Text style={styles.timelineText}>{event.text}</Text>
            <Text style={styles.timelineMeta}>{event.time} · {event.user}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const renderTeklifler = () => (
    <View style={styles.tabPanel}>
      {MOCK_QUOTES.map(q => {
        const cfg = STATUS_CONFIG[q.status] || STATUS_CONFIG.taslak;
        return (
          <View key={q.id} style={styles.quoteCard}>
            <View style={styles.quoteHeader}>
              <View>
                <Text style={styles.quoteNo}>{q.no}</Text>
                <Text style={styles.quoteMeta}>Rev. {q.revision} · {q.date}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={styles.quoteAmount}>€{q.amount.toLocaleString('tr-TR')}</Text>
                <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
                </View>
              </View>
            </View>
            <View style={styles.quoteActions}>
              <TouchableOpacity style={[styles.quoteBtn, { backgroundColor: '#eef2ff' }]}>
                <Text style={[styles.quoteBtnText, { color: PRIMARY }]}>PDF Önizle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quoteBtn, { backgroundColor: '#e6f4ea' }]}>
                <Text style={[styles.quoteBtnText, { color: '#137333' }]}>Onayla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quoteBtn, { backgroundColor: '#fef2f2' }]}>
                <Text style={[styles.quoteBtnText, { color: RED }]}>Reddet</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
      <TouchableOpacity style={styles.actionBtnPrimary}>
        <Ionicons name="add" size={16} color={PRIMARY} />
        <Text style={styles.actionBtnPrimaryText}>Yeni Teklif Oluştur</Text>
      </TouchableOpacity>
    </View>
  );

  const renderDokumanlar = () => (
    <View style={styles.tabPanel}>
      {MOCK_DOCS.map(doc => (
        <View key={doc.id} style={styles.docCard}>
          <View style={styles.docIconBox}>
            <Ionicons name="document-text" size={18} color={RED} />
          </View>
          <View style={styles.docContent}>
            <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
            <Text style={styles.docMeta}>{doc.type} · {doc.size} · {doc.date}</Text>
          </View>
          <TouchableOpacity style={{ padding: 8 }}>
            <Ionicons name="trash-outline" size={16} color={RED} />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={[styles.actionBtnPrimary, { backgroundColor: '#fef7e0' }]}>
        <Ionicons name="cloud-upload-outline" size={16} color="#854d0e" />
        <Text style={[styles.actionBtnPrimaryText, { color: '#854d0e' }]}>Doküman Yükle</Text>
      </TouchableOpacity>
    </View>
  );

  const renderOdemeler = () => (
    <View style={styles.tabPanel}>
      <View style={styles.emptyState}>
        <Ionicons name="card-outline" size={32} color="#d1d5db" />
        <Text style={styles.emptyTitle}>Ödeme planı yok</Text>
        <TouchableOpacity style={styles.actionBtnOutline}>
          <Ionicons name="add" size={16} color="#0f766e" />
          <Text style={styles.actionBtnOutlineText}>Ödeme Planı Oluştur</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <Ionicons name="arrow-back" size={24} color={INK} />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={[styles.avatar, { backgroundColor: company?.avatarColor ?? PRIMARY }]}>
              <Text style={styles.avatarText}>{company?.name.charAt(0) ?? 'K'}</Text>
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroTitle}>{company?.name ?? card.companyName}</Text>
              <Text style={styles.heroDesc}>{card.notes}</Text>
            </View>
            <View style={styles.heroRight}>
              <Text style={styles.heroValue}>€{card.value.toLocaleString('tr-TR')}</Text>
              <View style={styles.heroMetaRow}>
                <Ionicons name="time-outline" size={10} color={MUTED} />
                <Text style={styles.heroMetaText}>{daysInStage}g aşamada</Text>
              </View>
            </View>
          </View>

          {/* Stage Timeline */}
          <TouchableOpacity style={styles.stageTimeline} onPress={() => setStageModalOpen(true)}>
            <View style={styles.stageTrack}>
              {STAGES.slice(0, 5).map((s, i) => {
                const isPast = i < stageIndex;
                const isCurrent = i === stageIndex;
                return (
                  <View key={s.key} style={styles.stageCol}>
                    <View style={[styles.stageBar, { backgroundColor: isCurrent ? s.color : isPast ? `${s.color}60` : '#e5e7eb' }]} />
                    {isCurrent && <Text style={[styles.stageLabel, { color: s.color }]}>{s.label}</Text>}
                  </View>
                );
              })}
            </View>
          </TouchableOpacity>

          {/* Action Row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.qaList}>
            {[
              { label: 'Teklif Oluştur', icon: 'document-text', color: '#137333', bg: '#e6f4ea' },
              { label: 'Aktivite', icon: 'calendar', color: PRIMARY, bg: '#eef2ff' },
              { label: 'Doküman', icon: 'cloud-upload', color: '#854d0e', bg: '#fef7e0' },
              { label: 'Ödeme Planı', icon: 'card', color: '#0f766e', bg: '#ecfdf5' },
            ].map(a => (
              <TouchableOpacity key={a.label} style={[styles.qaBtn, { backgroundColor: a.bg }]}>
                <Ionicons name={a.icon as any} size={15} color={a.color} />
                <Text style={[styles.qaText, { color: a.color }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Tabs */}
        <View style={styles.tabsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {TABS.map((t, i) => (
              <TouchableOpacity key={t} style={[styles.tabBtn, activeTab === i && styles.tabBtnActive]} onPress={() => setActiveTab(i)}>
                <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Content */}
        <View style={styles.contentArea}>
          {activeTab === 0 && renderTimeline()}
          {activeTab === 1 && renderTeklifler()}
          {activeTab === 2 && renderDokumanlar()}
          {activeTab === 3 && renderOdemeler()}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Stage Modal */}
      <Modal visible={stageModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Aşamayı Değiştir</Text>
            <View style={{ gap: 6 }}>
              {STAGES.map(s => (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => setStageModalOpen(false)}
                  style={[styles.modalOption, card.stage === s.key && { backgroundColor: '#eef2ff' }]}
                >
                  <View style={[styles.modalOptionDot, { backgroundColor: s.color }]} />
                  <Text style={[styles.modalOptionText, card.stage === s.key && { color: PRIMARY }]}>{s.label}</Text>
                  {card.stage === s.key && <Text style={styles.modalOptionCurrent}>Mevcut</Text>}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setStageModalOpen(false)} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
