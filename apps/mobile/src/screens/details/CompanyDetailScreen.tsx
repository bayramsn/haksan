import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const PRIMARY = '#000c69';
const RED = '#cf060c';
const INK = '#1a1c1d';
const MUTED = '#717182';

const STATUS_CONFIG = {
  aktif: { label: 'Aktif', bg: '#e6f4ea', text: '#137333', border: '#b7e1c1' },
  pasif: { label: 'Pasif', bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db' },
  potansiyel: { label: 'Potansiyel', bg: '#fef7e0', text: '#b06000', border: '#f7d98c' },
};

const TABS = ['Geçmiş', 'Satış Kartları', 'Aktivite', 'Cari', 'Makineler'];

// MOCK DATA
const companies = [
  { id: '1', name: 'Haksan Makina', code: 'C-001', phone: '0532 123 45 67', email: 'info@haksan.com', city: 'İstanbul', sector: 'Üretim', avatarColor: '#000c69', status: 'aktif' },
  { id: '2', name: 'Asil Çelik', code: 'C-002', phone: '0532 987 65 43', email: 'satis@asilcelik.com', city: 'Bursa', sector: 'Otomotiv', avatarColor: '#10B981', status: 'aktif' },
  { id: '3', name: 'Demirbağ Endüstri', code: 'C-003', phone: '0533 444 55 66', email: 'iletisim@demirbag.com', city: 'Ankara', sector: 'Savunma', avatarColor: '#F59E0B', status: 'pasif' },
];

const salesCards = [
  { id: '1', companyId: '1', notes: 'Yeni CNC Tezgahı Alımı', stage: 'Teklif Aşamasında', createdAt: '20.06.2026', value: 24500 },
];

const machines = [
  { id: '1', companyId: '1', model: 'HS-2000 CNC Torna', serialNumber: 'SN-2024-001', installDate: '15.01.2024', warrantyUntil: '15.01.2026', status: 'aktif' },
  { id: '2', companyId: '1', model: 'VX-500 Dik İşleme', serialNumber: 'SN-2023-045', installDate: '10.05.2023', warrantyUntil: '10.05.2025', status: 'bakim' },
];

const MOCK_ACTIVITIES = [
  { id: 'act1', type: 'call', title: 'Arama yapıldı', note: 'Teklif takibi için arandı, olumlu geri bildirim', user: 'Ahmet K.', time: '30.06.2026 10:15' },
  { id: 'act2', type: 'visit', title: 'Saha ziyareti', note: 'Makine kurulum alanı incelendi', user: 'Serkan T.', time: '28.06.2026 14:30' },
  { id: 'act3', type: 'offer', title: 'Teklif gönderildi', note: 'TKL-2026-001 — €24.500 teklif gönderildi', user: 'Satış', time: '25.06.2026 09:00' },
  { id: 'act4', type: 'note', title: 'Not eklendi', note: 'Müşteri karar sürecini Temmuz ayına erteledi', user: 'Ahmet K.', time: '20.06.2026 16:45' },
];

const MOCK_FINANCIALS = [
  { id: 'f1', date: '01.06.2026', desc: 'Satış Faturası — TKL-2026-001', amount: 24500, type: 'debit', status: 'bekliyor' },
  { id: 'f2', date: '15.05.2026', desc: 'Tahsilat — EFT', amount: 12250, type: 'credit', status: 'odendi' },
  { id: 'f3', date: '10.04.2026', desc: 'Satış Faturası — TKL-2026-000', amount: 18000, type: 'debit', status: 'odendi' },
  { id: 'f4', date: '15.03.2026', desc: 'Tahsilat — Çek', amount: 18000, type: 'credit', status: 'odendi' },
];

const ACTIVITY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  call: 'call-outline', visit: 'car-outline', offer: 'document-text-outline', note: 'create-outline', service: 'build-outline',
};

function HealthScore({ status }: { status: string }) {
  const score = status === 'aktif' ? 82 : status === 'potansiyel' ? 45 : 20;
  const color = score >= 70 ? '#137333' : score >= 40 ? '#b06000' : RED;
  return (
    <View style={styles.scoreRow}>
      <View style={styles.scoreTrack}>
        <View style={[styles.scoreFill, { width: `${score}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.scoreVal, { color }]}>{score}</Text>
    </View>
  );
}

type Props = { id: string };

export function CompanyDetailScreen({ id }: Props) {
  const [activeTab, setActiveTab] = useState(0);

  const company = companies.find(c => c.id === id) ?? companies[0];
  const cfg = STATUS_CONFIG[company.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.aktif;
  
  const companySales = salesCards.filter(s => s.companyId === company.id);
  const companyMachines = machines.filter(m => m.companyId === company.id);
  const balance = 12250;

  const handleAction = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const renderGecmis = () => (
    <View style={styles.tabPanel}>
      {MOCK_ACTIVITIES.map((act) => (
        <View key={act.id} style={styles.activityCard}>
          <View style={styles.actIconBox}>
            <Ionicons name={ACTIVITY_ICONS[act.type] || 'ellipse'} size={18} color={MUTED} />
          </View>
          <View style={styles.actContent}>
            <Text style={styles.actTitle}>{act.title}</Text>
            <Text style={styles.actNote}>{act.note}</Text>
            <View style={styles.actMeta}>
              <Ionicons name="time-outline" size={12} color={MUTED} />
              <Text style={styles.actMetaText}>{act.time} · {act.user}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  const renderSatisKartlari = () => (
    <View style={styles.tabPanel}>
      {companySales.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="trending-up" size={32} color="#d1d5db" />
          <Text style={styles.emptyTitle}>Henüz satış kartı yok</Text>
          <Text style={styles.emptyDesc}>Bu firma için ilk kartı oluşturun</Text>
        </View>
      ) : (
        companySales.map(card => (
          <TouchableOpacity
            key={card.id}
            style={styles.salesCard}
            onPress={() => router.push(`/modules/sales/${card.id}`)}
          >
            <View style={[styles.salesAvatar, { backgroundColor: company.avatarColor }]}>
              <Text style={styles.salesAvatarText}>{company.name.charAt(0)}</Text>
            </View>
            <View style={styles.salesContent}>
              <Text style={styles.salesTitle}>{card.notes || 'Satış Kartı'}</Text>
              <Text style={styles.salesDesc}>{card.stage} · {card.createdAt}</Text>
            </View>
            <View style={styles.salesRight}>
              <Text style={styles.salesValue}>€{card.value.toLocaleString('tr-TR')}</Text>
              <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
            </View>
          </TouchableOpacity>
        ))
      )}
      <TouchableOpacity style={styles.newSaleBtn}>
        <Ionicons name="add" size={18} color={PRIMARY} />
        <Text style={styles.newSaleBtnText}>Yeni Satış Kartı</Text>
      </TouchableOpacity>
    </View>
  );

  const renderAktivite = () => (
    <View style={styles.tabPanel}>
      <View style={styles.quickAddRow}>
        <TouchableOpacity style={styles.quickAddBtn}>
          <Text style={styles.quickAddText}>+ Ziyaret Ekle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAddBtn}>
          <Text style={styles.quickAddText}>+ Arama Ekle</Text>
        </TouchableOpacity>
      </View>
      {MOCK_ACTIVITIES.filter(a => ['call', 'visit'].includes(a.type)).map((act) => (
        <View key={act.id} style={styles.activityCard}>
          <View style={styles.actIconBox}>
            <Ionicons name={ACTIVITY_ICONS[act.type] || 'ellipse'} size={18} color={MUTED} />
          </View>
          <View style={styles.actContent}>
            <Text style={styles.actTitle}>{act.title}</Text>
            <Text style={styles.actNote}>{act.note}</Text>
            <Text style={styles.actMetaText}>{act.time}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const renderCari = () => (
    <View style={styles.tabPanel}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceHeader}>Cari Bakiye</Text>
        <View style={styles.balanceRow}>
          <View style={[styles.balanceItem, { backgroundColor: '#fef2f2' }]}>
            <Text style={[styles.balanceVal, { color: RED }]}>€36.500</Text>
            <Text style={styles.balanceLabel}>Borç</Text>
          </View>
          <View style={[styles.balanceItem, { backgroundColor: '#e6f4ea' }]}>
            <Text style={[styles.balanceVal, { color: '#137333' }]}>€24.250</Text>
            <Text style={styles.balanceLabel}>Ödendi</Text>
          </View>
          <View style={[styles.balanceItem, { backgroundColor: '#eef2ff' }]}>
            <Text style={[styles.balanceVal, { color: PRIMARY }]}>€{balance.toLocaleString('tr-TR')}</Text>
            <Text style={styles.balanceLabel}>Bakiye</Text>
          </View>
        </View>
      </View>
      <View style={styles.financialList}>
        {MOCK_FINANCIALS.map(f => (
          <View key={f.id} style={styles.finRow}>
            <View style={styles.finContent}>
              <Text style={styles.finDesc}>{f.desc}</Text>
              <Text style={styles.finDate}>{f.date}</Text>
            </View>
            <Text style={[styles.finAmount, { color: f.type === 'credit' ? '#137333' : RED }]}>
              {f.type === 'credit' ? '+' : '-'}€{f.amount.toLocaleString('tr-TR')}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderMakineler = () => (
    <View style={styles.tabPanel}>
      {companyMachines.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="build-outline" size={32} color="#d1d5db" />
          <Text style={styles.emptyTitle}>Kayıtlı makine yok</Text>
        </View>
      ) : (
        companyMachines.map(m => {
          const statusColor = m.status === 'aktif' ? '#137333' : m.status === 'bakim' ? '#b06000' : RED;
          const statusBg = m.status === 'aktif' ? '#e6f4ea' : m.status === 'bakim' ? '#fef7e0' : '#fef2f2';
          const statusLabel = m.status === 'aktif' ? 'Aktif' : m.status === 'bakim' ? 'Bakımda' : 'Arızalı';

          return (
            <View key={m.id} style={styles.machineCard}>
              <View style={styles.machineHeader}>
                <View style={styles.machineContent}>
                  <Text style={styles.machineModel}>{m.model}</Text>
                  <Text style={styles.machineSerial}>{m.serialNumber}</Text>
                  <Text style={styles.machineDates}>Kurulum: {m.installDate} · Garanti: {m.warrantyUntil}</Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: statusBg, borderColor: statusColor }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.serviceBtn}>
                <Ionicons name="open-outline" size={12} color={PRIMARY} />
                <Text style={styles.serviceBtnText}>Servis Talebi Aç</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
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
            <View style={[styles.avatarLarge, { backgroundColor: company.avatarColor }]}>
              <Text style={styles.avatarLargeText}>{company.name.charAt(0)}</Text>
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroTitle}>{company.name}</Text>
              <View style={styles.heroMetaRow}>
                <View style={[styles.statusChip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                  <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                </View>
                <Text style={styles.heroMetaText}>{company.sector}</Text>
                <Text style={styles.heroMetaDot}>·</Text>
                <View style={styles.heroCity}>
                  <Ionicons name="location" size={10} color={MUTED} />
                  <Text style={styles.heroMetaText}>{company.city}</Text>
                </View>
              </View>
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreLabel}>Müşteri Skoru</Text>
                <HealthScore status={company.status} />
              </View>
            </View>
          </View>
          <View style={styles.quickActions}>
            <TouchableOpacity style={[styles.qaBtn, { backgroundColor: '#e6f4ea' }]} onPress={() => handleAction(`tel:${company.phone}`)}>
              <Ionicons name="call" size={16} color="#137333" />
              <Text style={[styles.qaText, { color: '#137333' }]}>Ara</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.qaBtn, { backgroundColor: '#eef2ff' }]} onPress={() => handleAction(`mailto:${company.email}`)}>
              <Ionicons name="mail" size={16} color={PRIMARY} />
              <Text style={[styles.qaText, { color: PRIMARY }]}>Mail</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.qaBtn, { backgroundColor: '#f0fdf4' }]}>
              <Ionicons name="logo-whatsapp" size={16} color="#16a34a" />
              <Text style={[styles.qaText, { color: '#16a34a' }]}>WA</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.qaBtn, { backgroundColor: '#fef7e0' }]}>
              <Ionicons name="map" size={16} color="#854d0e" />
              <Text style={[styles.qaText, { color: '#854d0e' }]}>Harita</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {TABS.map((t, i) => (
              <TouchableOpacity
                key={t}
                style={[styles.tabBtn, activeTab === i && styles.tabBtnActive]}
                onPress={() => setActiveTab(i)}
              >
                <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Content */}
        <View style={styles.contentArea}>
          {activeTab === 0 && renderGecmis()}
          {activeTab === 1 && renderSatisKartlari()}
          {activeTab === 2 && renderAktivite()}
          {activeTab === 3 && renderCari()}
          {activeTab === 4 && renderMakineler()}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab}>
        <Ionicons name="add" size={24} color="#ffffff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  avatarLarge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  avatarLargeText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  heroInfo: { flex: 1 },
  heroTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: INK,
    lineHeight: 23,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 8,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 100,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  heroMetaText: { fontSize: 11, fontWeight: '500', color: MUTED },
  heroMetaDot: { fontSize: 10, color: '#d1d5db' },
  heroCity: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  scoreContainer: { marginTop: 8 },
  scoreLabel: { fontSize: 10, fontWeight: '600', color: MUTED, marginBottom: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreTrack: { flex: 1, height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: 3 },
  scoreVal: { fontSize: 12, fontWeight: 'bold' },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  qaBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
  },
  qaText: { fontSize: 10, fontWeight: 'bold' },
  tabsWrapper: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  tabsScroll: { paddingHorizontal: 16 },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 12, fontWeight: '600', color: MUTED },
  tabTextActive: { color: PRIMARY },
  contentArea: { flex: 1 },
  tabPanel: { padding: 16, gap: 8 },
  
  // Activities
  activityCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  actIconBox: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actContent: { flex: 1 },
  actTitle: { fontSize: 14, fontWeight: 'bold', color: INK },
  actNote: { fontSize: 12, color: MUTED, marginTop: 2 },
  actMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  actMetaText: { fontSize: 11, color: MUTED },

  // Empty State
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 14, fontWeight: '500', color: MUTED, marginTop: 8 },
  emptyDesc: { fontSize: 12, color: '#b0b0be', marginTop: 4 },

  // Sales
  salesCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  salesAvatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  salesAvatarText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  salesContent: { flex: 1 },
  salesTitle: { fontSize: 14, fontWeight: 'bold', color: INK },
  salesDesc: { fontSize: 12, color: MUTED, marginTop: 2 },
  salesRight: { alignItems: 'flex-end', gap: 4 },
  salesValue: { fontSize: 14, fontWeight: '900', color: PRIMARY },
  newSaleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    marginTop: 8,
  },
  newSaleBtnText: { fontSize: 14, fontWeight: 'bold', color: PRIMARY },

  // Activity Tab
  quickAddRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quickAddBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#eef2ff', alignItems: 'center' },
  quickAddText: { fontSize: 12, fontWeight: 'bold', color: PRIMARY },

  // Financials
  balanceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  balanceHeader: { fontSize: 12, fontWeight: 'bold', color: MUTED, marginBottom: 12 },
  balanceRow: { flexDirection: 'row', gap: 12 },
  balanceItem: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  balanceVal: { fontSize: 14, fontWeight: '900' },
  balanceLabel: { fontSize: 10, fontWeight: '500', color: MUTED, marginTop: 2 },
  financialList: { gap: 8 },
  finRow: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  finContent: { flex: 1 },
  finDesc: { fontSize: 14, fontWeight: '600', color: INK },
  finDate: { fontSize: 11, color: MUTED, marginTop: 2 },
  finAmount: { fontSize: 14, fontWeight: '900' },

  // Machines
  machineCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  machineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  machineContent: { flex: 1, paddingRight: 8 },
  machineModel: { fontSize: 14, fontWeight: 'bold', color: INK },
  machineSerial: { fontSize: 12, color: MUTED, marginTop: 2 },
  machineDates: { fontSize: 11, color: MUTED, marginTop: 4 },
  serviceBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  serviceBtnText: { fontSize: 12, fontWeight: '600', color: PRIMARY },

  // FAB
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
