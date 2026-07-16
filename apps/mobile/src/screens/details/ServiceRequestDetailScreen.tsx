import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const PRIMARY = '#000c69';
const RED = '#cf060c';
const INK = '#1a1c1d';
const MUTED = '#717182';
const SERVICE_GREEN = '#0f766e';

const STAGE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  servis_talep: { label: 'Talep Açıldı', bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db' },
  musteri_iletisim: { label: 'Müşteri İletişim', bg: '#eef2ff', text: PRIMARY, border: '#c7d2fe' },
  servis_teklifi: { label: 'Servis Teklifi', bg: '#fef7e0', text: '#b06000', border: '#f7d98c' },
  bakim_onarim: { label: 'Bakım/Onarım', bg: '#fff7ed', text: '#f97316', border: '#fed7aa' },
  servis_devam: { label: 'Devam Ediyor', bg: '#ecfdf5', text: SERVICE_GREEN, border: '#a7f3d0' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  dusuk: { label: 'Düşük', color: '#9CA3AF' },
  orta: { label: 'Orta', color: '#F59E0B' },
  yuksek: { label: 'Yüksek', color: '#F97316' },
  kritik: { label: 'Kritik', color: RED },
};

const TABS = [
  { label: 'Özet', icon: 'settings-outline' },
  { label: 'Servis Teklifi', icon: 'document-text-outline' },
  { label: 'Garanti/RMA', icon: 'shield-checkmark-outline' },
  { label: 'Tamamlama', icon: 'checkbox-outline' },
  { label: 'Notlar', icon: 'chatbox-outline' },
];

const CHECKLIST_ITEMS = [
  { id: 'c1', label: 'Makine genel kontrolü yapıldı', status: 'done' },
  { id: 'c2', label: 'Elektrik sistemi test edildi', status: 'done' },
  { id: 'c3', label: 'Yağlama sistemi kontrol edildi', status: 'na' },
  { id: 'c4', label: 'CNC parametreleri yedeklendi', status: 'pending' },
  { id: 'c5', label: 'İlk çalıştırma yapıldı', status: 'pending' },
  { id: 'c6', label: 'Müşteri eğitimi verildi', status: 'pending' },
];

const CHECKLIST_STATUS = {
  done: { label: 'Tamam', bg: '#e6f4ea', text: '#137333' },
  pending: { label: 'Bekliyor', bg: '#f3f4f6', text: '#6b7280' },
  na: { label: 'Geçerli Değil', bg: '#f5f3ff', text: '#6d28d9' },
};

// MOCK DATA
const serviceRequests = [
  { 
    id: 'sr123', 
    companyName: 'Haksan Makina', 
    machineName: 'HS-2000 CNC Torna', 
    stage: 'servis_devam', 
    priority: 'yuksek',
    tags: ['Mekanik', 'Garantili'],
    description: 'Makine Z ekseni hata veriyor. Eksen motorundan ses geliyor.',
    assignedTo: 'Serkan Teknisyen'
  },
];

function TimerDisplay({ seconds }: { seconds: number }) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return (
    <Text style={styles.timerText}>
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </Text>
  );
}

type Props = { id: string };

export function ServiceRequestDetailScreen({ id }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  const request = serviceRequests.find(r => r.id === id) ?? serviceRequests[0];
  const stageCfg = STAGE_CONFIG[request.stage] ?? STAGE_CONFIG.servis_talep;
  const priCfg = PRIORITY_CONFIG[request.priority] ?? PRIORITY_CONFIG.orta;

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const renderOzet = () => (
    <View style={styles.tabPanel}>
      <View style={styles.card}>
        <Text style={styles.cardHeader}>MÜŞTERİ PROBLEMI</Text>
        <Text style={styles.cardBody}>{request.description || 'Makine Z ekseni hata veriyor.'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardHeader}>ATANAN</Text>
        <View style={styles.assignedRow}>
          <View style={styles.assignedAvatar}>
            <Text style={styles.assignedAvatarText}>T</Text>
          </View>
          <View>
            <Text style={styles.assignedName}>{request.assignedTo}</Text>
            <Text style={styles.assignedRole}>Servis Teknisyeni</Text>
          </View>
        </View>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#eef2ff' }]}>
          <Text style={[styles.actionBtnText, { color: PRIMARY }]}>Aşama Güncelle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#fef7e0' }]}>
          <Text style={[styles.actionBtnText, { color: '#b06000' }]}>Not Ekle</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTeklif = () => (
    <View style={styles.tabPanel}>
      <View style={styles.card}>
        <Text style={styles.cardHeader}>KALEMLER</Text>
        {[
          { desc: 'Z ekseni kontrol kartı', qty: 1, price: 1200, unit: 'adet' },
          { desc: 'Teknik servis işçiliği (4 saat)', qty: 4, price: 200, unit: 'saat' },
        ].map((item, i) => (
          <View key={i} style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.desc}</Text>
              <Text style={styles.itemMeta}>{item.qty} {item.unit} × €{item.price}</Text>
            </View>
            <Text style={styles.itemTotal}>€{(item.qty * item.price).toLocaleString('tr-TR')}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Toplam</Text>
          <Text style={styles.totalVal}>€2.000</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.addBtn}>
        <Ionicons name="add" size={16} color={PRIMARY} />
        <Text style={styles.addBtnText}>Kalem Ekle</Text>
      </TouchableOpacity>
      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: SERVICE_GREEN }]}>
          <Text style={[styles.actionBtnText, { color: '#ffffff' }]}>Kaydet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: PRIMARY }]}>
          <Text style={[styles.actionBtnText, { color: '#ffffff' }]}>Kaydet & Yazdır</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderGaranti = () => (
    <View style={styles.tabPanel}>
      <View style={styles.card}>
        <Text style={styles.cardHeader}>GARANTİ DURUMU</Text>
        <View style={styles.garantiBadge}>
          <Ionicons name="shield-checkmark" size={16} color="#137333" />
          <View style={styles.garantiChip}>
            <Text style={styles.garantiText}>Garanti Kapsamında</Text>
          </View>
        </View>
        <Text style={styles.garantiDate}>Garanti bitiş: 15.03.2027</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardHeader}>RMA TALEP</Text>
        {[
          { label: 'Arıza Kategorisi', value: 'Elektronik Arıza' },
          { label: 'Tedarikçi', value: 'Siemens Türkiye' },
          { label: 'Değerlendirme', value: 'Kontrol kartı değişimi gerekli' },
        ].map((f, i) => (
          <View key={f.label} style={styles.rmaRow}>
            <Text style={styles.rmaLabel}>{f.label}</Text>
            <Text style={styles.rmaVal}>{f.value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#fef7e0' }]}>
          <Text style={[styles.actionBtnText, { color: '#b06000' }]}>Onaya Gönder</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: PRIMARY }]}>
          <Text style={[styles.actionBtnText, { color: '#ffffff' }]}>Kaydet</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTamamlama = () => {
    const doneCount = CHECKLIST_ITEMS.filter(c => c.status === 'done').length;
    return (
      <View style={styles.tabPanel}>
        <View style={styles.card}>
          <View style={styles.clHeader}>
            <Text style={styles.cardHeader}>KONTROL LİSTESİ</Text>
            <Text style={styles.clProgressText}>{doneCount}/{CHECKLIST_ITEMS.length}</Text>
          </View>
          <View style={styles.clTrack}>
            <View style={[styles.clFill, { width: `${(doneCount / CHECKLIST_ITEMS.length) * 100}%` }]} />
          </View>
          {CHECKLIST_ITEMS.map((item, i) => {
            const cfg = CHECKLIST_STATUS[item.status as keyof typeof CHECKLIST_STATUS];
            return (
              <View key={item.id} style={[styles.clItem, i > 0 && styles.clItemBorder]}>
                <View style={[styles.clBox, { backgroundColor: cfg.bg, borderColor: `${cfg.text}30` }]}>
                  {item.status === 'done' && <Ionicons name="checkmark" size={12} color={cfg.text} />}
                  {item.status === 'na' && <Text style={[styles.clNa, { color: cfg.text }]}>N/A</Text>}
                </View>
                <Text style={styles.clLabel}>{item.label}</Text>
                <View style={[styles.clBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.clBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: SERVICE_GREEN }]}>
          <Text style={[styles.actionBtnText, { color: '#ffffff' }]}>Servisi Kapat</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderNotlar = () => (
    <View style={styles.tabPanel}>
      {[
        { text: 'Müşteri, sorunun yazılım kaynaklı olduğunu düşünüyor. Ancak donanım problemi tespit edildi.', user: 'Serkan T.', time: '29.06.2026 15:30' },
        { text: 'Yedek parça temin süreci başlatıldı. 3-5 iş günü bekleniyor.', user: 'Teknik Servis', time: '30.06.2026 09:15' },
      ].map((note, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.noteText}>{note.text}</Text>
          <Text style={styles.noteMeta}>{note.time} · {note.user}</Text>
        </View>
      ))}
      <TouchableOpacity style={styles.addBtn}>
        <Ionicons name="add" size={16} color={PRIMARY} />
        <Text style={styles.addBtnText}>Servis Notu Ekle</Text>
      </TouchableOpacity>
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
          <Text style={styles.heroId}>SR-2026-00{request.id.replace('sr', '')}</Text>
          <Text style={styles.heroTitle}>{request.companyName}</Text>
          {request.machineName && <Text style={styles.heroSub}>{request.machineName}</Text>}
          
          <View style={styles.heroTags}>
            <View style={[styles.stageChip, { backgroundColor: stageCfg.bg, borderColor: stageCfg.border }]}>
              <Text style={[styles.stageChipText, { color: stageCfg.text }]}>{stageCfg.label}</Text>
            </View>
            <Text style={[styles.priorityText, { color: priCfg.color }]}>▲ {priCfg.label}</Text>
            {request.tags.map(tag => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagChipText}>{tag}</Text>
              </View>
            ))}
          </View>

          {/* Timer */}
          <View style={styles.timerBox}>
            <View>
              <Text style={styles.timerLabel}>SÜRE</Text>
              <TimerDisplay seconds={timerSeconds} />
            </View>
            <View style={styles.timerActions}>
              {!timerRunning ? (
                <TouchableOpacity style={styles.timerPlayBtn} onPress={() => setTimerRunning(true)}>
                  <Ionicons name="play" size={14} color="#ffffff" />
                  <Text style={styles.timerPlayText}>Başlat</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity style={styles.timerPauseBtn} onPress={() => setTimerRunning(false)}>
                    <Ionicons name="pause" size={16} color="#b06000" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.timerStopBtn} onPress={() => { setTimerRunning(false); setTimerSeconds(0); }}>
                    <Ionicons name="square" size={14} color={RED} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {TABS.map((t, i) => (
              <TouchableOpacity key={t.label} style={[styles.tabBtn, activeTab === i && styles.tabBtnActive]} onPress={() => setActiveTab(i)}>
                <Ionicons name={t.icon as any} size={14} color={activeTab === i ? PRIMARY : MUTED} style={{ marginRight: 6 }} />
                <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Content */}
        <View style={styles.contentArea}>
          {activeTab === 0 && renderOzet()}
          {activeTab === 1 && renderTeklif()}
          {activeTab === 2 && renderGaranti()}
          {activeTab === 3 && renderTamamlama()}
          {activeTab === 4 && renderNotlar()}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
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
