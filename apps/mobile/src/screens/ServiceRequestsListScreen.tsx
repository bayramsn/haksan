import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000c69';
const RED = '#cf060c';
const INK = '#1a1c1d';
const MUTED = '#717182';

type SRTab = 'liste' | 'kanban' | 'sikayet' | 'linkler';

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  dusuk: { label: 'Düşük', color: '#6B7280' },
  orta: { label: 'Orta', color: '#F59E0B' },
  yuksek: { label: 'Yüksek', color: '#F97316' },
  kritik: { label: 'Kritik', color: RED },
};

const STAGE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  servis_talep: { label: 'Talep Açıldı', bg: '#F3F4F6', text: '#6B7280' },
  musteri_iletisim: { label: 'Müşteri İletişim', bg: '#EEF2FF', text: PRIMARY },
  servis_teklifi: { label: 'Servis Teklifi', bg: '#FFFBEB', text: '#D97706' },
  bakim_onarim: { label: 'Bakım/Onarım', bg: '#FFF7ED', text: '#F97316' },
  servis_devam: { label: 'Devam Ediyor', bg: '#ECFDF5', text: '#059669' },
};

const MOCK_TICKETS = [
  { id: 'st1', no: 'SR-2026-001', company: 'raifcnc', machine: 'CNC Freze - VMC 850', stage: 'servis_talep', type: 'talep', priority: 'orta', date: '28.06.2026', assignee: 'Teknik Servis', isWarranty: false, isInternal: true },
  { id: 'st2', no: 'SR-2026-002', company: '—', machine: 'Torna - TC 500', stage: 'servis_talep', type: 'sikayet', priority: 'yuksek', date: '29.06.2026', assignee: 'Servis Ekibi', isWarranty: true, isInternal: true },
  { id: 'st3', no: 'SR-2026-003', company: 'Tekno Metal Sanayi', machine: 'FC 3015 Lazer', stage: 'musteri_iletisim', type: 'bakim', priority: 'dusuk', date: '20.06.2026', assignee: 'Bakım Ekibi', isWarranty: false, isInternal: false },
  { id: 'st4', no: 'SR-2026-004', company: 'Bora Sanayi Ltd.', machine: 'R2040 Router', stage: 'servis_teklifi', type: 'talep', priority: 'orta', date: '15.06.2026', assignee: 'Teknik Servis', isWarranty: false, isInternal: false },
  { id: 'st5', no: 'SR-2026-005', company: 'Omega Endüstri', machine: 'P3000 Plazma', stage: 'bakim_onarim', type: 'bakim', priority: 'yuksek', date: '10.06.2026', assignee: 'Bakım Ekibi', isWarranty: false, isInternal: false },
  { id: 'st6', no: 'SR-2026-006', company: 'Yıldız Mühendislik', machine: 'HTC 200 Torna', stage: 'servis_devam', type: 'talep', priority: 'orta', date: '05.06.2026', assignee: 'Teknik Servis', isWarranty: true, isInternal: false },
];

const MOCK_COMPLAINTS = [
  { id: 'c1', text: 'Makine tekrar aynı arızayı veriyor, çözüm kalıcı olmadı', company: 'Haksan Makine A.Ş.', date: '28.06.2026', status: 'bekliyor' },
  { id: 'c2', text: 'Servis ekibi geç geldi, üretim durdu', company: 'Precision CNC Ltd.', date: '25.06.2026', status: 'inceleniyor' },
  { id: 'c3', text: 'Yedek parça kalitesi düşük', company: 'Bozkurt Makine A.Ş.', date: '20.06.2026', status: 'donusturuldu' },
];

const MOCK_LINKS = [
  { id: 'lnk1', company: 'Haksan Makine A.Ş.', url: 'sikayet.haksan.com.tr/h8k2m', created: '25.06.2026', active: true },
  { id: 'lnk2', company: 'Precision CNC Ltd.', url: 'sikayet.haksan.com.tr/p4n7q', created: '20.06.2026', active: true },
  { id: 'lnk3', company: 'Bora Sanayi Ltd.', url: 'sikayet.haksan.com.tr/b2r9t', created: '10.06.2026', active: false },
];

const COMPLAINT_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  bekliyor: { label: 'Bekliyor', bg: '#FEF2F2', text: RED },
  inceleniyor: { label: 'İnceleniyor', bg: '#EEF2FF', text: PRIMARY },
  donusturuldu: { label: 'Dönüştürüldü', bg: '#ECFDF5', text: '#059669' },
};

export function ServiceRequestsListScreen() {
  const [activeTab, setActiveTab] = useState<SRTab>('liste');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = MOCK_TICKETS.filter(t =>
    `${t.company} ${t.machine} ${t.no}`.toLowerCase().includes(search.toLowerCase())
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 600));
    setRefreshing(false);
  }, []);

  const tabs: { key: SRTab; label: string; badge?: number }[] = [
    { key: 'liste', label: 'Liste', badge: MOCK_TICKETS.length },
    { key: 'kanban', label: 'Kanban' },
    { key: 'sikayet', label: 'Şikayet', badge: MOCK_COMPLAINTS.filter(c => c.status === 'bekliyor').length },
    { key: 'linkler', label: 'Linkler' },
  ];

  const renderHeader = () => (
    <View style={styles.headerBar}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#111827" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Servis Talepleri</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabsContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
              {tab.badge != null && (
                <View style={[styles.tabBadge, { backgroundColor: tab.key === 'sikayet' ? RED : PRIMARY }]}>
                  <Text style={styles.tabBadgeText}>{tab.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderKanban = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.kanbanScroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {Object.entries(STAGE_CONFIG).map(([stageKey, stage]) => {
        const stageCards = filtered.filter(t => t.stage === stageKey);
        
        return (
          <View key={stageKey} style={styles.kanbanCol}>
            <View style={[styles.colHeader, { backgroundColor: stage.bg }]}>
              <Text style={[styles.colTitle, { color: stage.text }]} numberOfLines={1}>{stage.label}</Text>
              <View style={styles.colCountBadge}>
                <Text style={[styles.colCountText, { color: stage.text }]}>{stageCards.length}</Text>
              </View>
            </View>

            <ScrollView nestedScrollEnabled contentContainerStyle={styles.colCards}>
              {stageCards.map(ticket => {
                const priCfg = PRIORITY_CONFIG[ticket.priority];
                return (
                  <TouchableOpacity
                    key={ticket.id}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/modules/service-requests/${ticket.id}`)}
                    style={styles.kanbanCard}
                  >
                    <Text style={styles.kanbanCardNo}>{ticket.no}</Text>
                    <Text style={styles.kanbanCardCompany} numberOfLines={1}>{ticket.company}</Text>
                    <Text style={styles.kanbanCardMachine} numberOfLines={1}>{ticket.machine}</Text>
                    
                    <View style={styles.kanbanCardFooter}>
                      <Ionicons name="flag" size={12} color={priCfg.color} />
                      <Text style={styles.kanbanCardDate}>{ticket.date}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {renderHeader()}
      {renderTabs()}

      {activeTab === 'kanban' && (
        <View style={styles.contentArea}>
          {renderKanban()}
        </View>
      )}

      {activeTab === 'sikayet' && (
        <View style={styles.contentArea}>
          <View style={styles.listSubHeader}>
            <Text style={styles.listSubHeaderText}>{MOCK_COMPLAINTS.length} şikayet</Text>
          </View>
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {MOCK_COMPLAINTS.map(c => {
              const cfg = COMPLAINT_STATUS[c.status];
              return (
                <View key={c.id} style={styles.complaintCard}>
                  <View style={styles.complaintTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.complaintText}>{c.text}</Text>
                      <View style={styles.complaintMeta}>
                        <Ionicons name="chatbubble-ellipses" size={12} color={MUTED} />
                        <Text style={styles.complaintMetaText}>{c.company} · {c.date}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
                    </View>
                  </View>
                  {c.status !== 'donusturuldu' && (
                    <View style={styles.complaintActions}>
                      <TouchableOpacity style={[styles.complaintBtn, { backgroundColor: '#EEF2FF' }]}>
                        <Text style={[styles.complaintBtnText, { color: PRIMARY }]}>Dönüştür</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.complaintBtn, { backgroundColor: '#FEF2F2' }]}>
                        <Text style={[styles.complaintBtnText, { color: RED }]}>Reddet</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => {}}>
            <Ionicons name="add" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'linkler' && (
        <View style={styles.contentArea}>
          <View style={styles.listSubHeader}>
            <Text style={styles.listSubHeaderText}>{MOCK_LINKS.length} public link</Text>
          </View>
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {MOCK_LINKS.map(lnk => (
              <View key={lnk.id} style={styles.complaintCard}>
                <View style={styles.complaintTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkCompany}>{lnk.company}</Text>
                    <View style={styles.linkUrlRow}>
                      <Ionicons name="link" size={12} color={MUTED} />
                      <Text style={styles.linkUrl} numberOfLines={1}>{lnk.url}</Text>
                    </View>
                    <Text style={styles.linkDate}>Oluşturuldu: {lnk.created}</Text>
                  </View>
                  <View style={styles.linkActionCol}>
                    <View style={[styles.statusBadge, { backgroundColor: lnk.active ? '#ECFDF5' : '#F3F4F6' }]}>
                      <Text style={[styles.statusBadgeText, { color: lnk.active ? '#059669' : '#6B7280' }]}>
                        {lnk.active ? 'Aktif' : 'İptal'}
                      </Text>
                    </View>
                    {lnk.active && (
                      <TouchableOpacity style={styles.revokeBtn}>
                        <Text style={styles.revokeBtnText}>Revoke</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => {}}>
            <Ionicons name="add" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'liste' && (
        <View style={styles.contentArea}>
          <View style={styles.toolbarContainer}>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={14} color="#9ca3af" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Ticket no, firma veya makine..."
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>

          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {filtered.map(ticket => {
              const stageCfg = STAGE_CONFIG[ticket.stage] ?? { label: ticket.stage, bg: '#F3F4F6', text: '#6B7280' };
              const priCfg = PRIORITY_CONFIG[ticket.priority];
              return (
                <TouchableOpacity
                  key={ticket.id}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/modules/service-requests/${ticket.id}`)}
                  style={styles.ticketCard}
                >
                  <View style={styles.ticketIconCol}>
                    <View style={styles.ticketIconWrap}>
                      <Ionicons name="warning-outline" size={18} color={PRIMARY} />
                    </View>
                    <Ionicons name="flag" size={12} color={priCfg.color} style={{ marginTop: 6 }} />
                  </View>

                  <View style={styles.ticketInfoCol}>
                    <View style={styles.ticketTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ticketNo}>{ticket.no}</Text>
                        <Text style={styles.ticketCompany} numberOfLines={1}>{ticket.company}</Text>
                        <Text style={styles.ticketMachine} numberOfLines={1}>{ticket.machine}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: stageCfg.bg, alignSelf: 'flex-start' }]}>
                        <Text style={[styles.statusBadgeText, { color: stageCfg.text }]}>{stageCfg.label}</Text>
                      </View>
                    </View>

                    <View style={styles.ticketTagsRow}>
                      {ticket.isWarranty && (
                        <View style={[styles.tagBadge, { backgroundColor: '#ECFDF5' }]}>
                          <Text style={[styles.tagBadgeText, { color: '#059669' }]}>Garanti</Text>
                        </View>
                      )}
                      {ticket.isInternal && (
                        <View style={[styles.tagBadge, { backgroundColor: '#f3f4f6' }]}>
                          <Text style={[styles.tagBadgeText, { color: MUTED }]}>İç kayıt</Text>
                        </View>
                      )}
                      <Text style={styles.ticketMetaText}>{ticket.date} · {ticket.assignee}</Text>
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={16} color="#d1d5db" style={{ marginTop: 4 }} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => router.push('/forms/service-ticket')}>
            <Ionicons name="add" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
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
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },

  tabsContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
    paddingHorizontal: 16,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  tabBtnActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 12, fontWeight: '600', color: MUTED },
  tabTextActive: { color: PRIMARY },
  tabBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#fff' },

  contentArea: { flex: 1 },

  listSubHeader: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  listSubHeaderText: { fontSize: 11, color: MUTED },

  listScroll: { flex: 1 },
  listContent: { padding: 16, gap: 10, paddingBottom: 100 },

  complaintCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
  },
  complaintTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  complaintText: { fontSize: 14, fontWeight: '600', color: INK, lineHeight: 20 },
  complaintMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  complaintMetaText: { fontSize: 12, color: MUTED },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },

  complaintActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  complaintBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  complaintBtnText: { fontSize: 12, fontWeight: '600' },

  linkCompany: { fontSize: 14, fontWeight: '700', color: INK },
  linkUrlRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  linkUrl: { fontSize: 12, color: MUTED, flex: 1 },
  linkDate: { fontSize: 11, color: MUTED, marginTop: 2 },
  linkActionCol: { alignItems: 'flex-end', gap: 8 },
  revokeBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  revokeBtnText: { fontSize: 10, fontWeight: '600', color: RED },

  toolbarContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 12, color: INK, padding: 0 },

  ticketCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  ticketIconCol: { alignItems: 'center' },
  ticketIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  ticketInfoCol: { flex: 1 },
  ticketTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  ticketNo: { fontSize: 12, fontWeight: '700', color: MUTED },
  ticketCompany: { fontSize: 14, fontWeight: '700', color: INK, marginTop: 2 },
  ticketMachine: { fontSize: 12, color: MUTED, marginTop: 2 },
  ticketTagsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tagBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  tagBadgeText: { fontSize: 10, fontWeight: '600' },
  ticketMetaText: { fontSize: 10, color: MUTED },

  kanbanScroll: { padding: 12, gap: 12 },
  kanbanCol: {
    width: 260,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
    maxHeight: '100%',
  },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
    gap: 8,
  },
  colTitle: { flex: 1, fontSize: 12, fontWeight: '700' },
  colCountBadge: { backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  colCountText: { fontSize: 10, fontWeight: '700' },
  
  colCards: { padding: 8, gap: 8 },
  kanbanCard: {
    backgroundColor: '#f7f7f8',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
  },
  kanbanCardNo: { fontSize: 11, fontWeight: '700', color: MUTED },
  kanbanCardCompany: { fontSize: 13, fontWeight: '700', color: INK, marginTop: 2 },
  kanbanCardMachine: { fontSize: 11, color: MUTED, marginTop: 2 },
  kanbanCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  kanbanCardDate: { fontSize: 10, color: MUTED },

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

