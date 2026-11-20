import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { companyService, opportunityService, activityService, financeService, inventoryService, contactService, fileService } from '@/src/api/services';
import { openStoredFile } from '@/src/api/download';
import { useAuth } from '@/src/auth/AuthProvider';

const PRIMARY = '#000c69';
const RED = '#cf060c';
const INK = '#1a1c1d';
const MUTED = '#717182';
const TABS = ['Aktiviteler', 'Fırsatlar', 'Cari', 'Makineler', 'Kişiler', 'Dokümanlar'];
const formatDate = (value: unknown) => { const parsed = new Date(String(value ?? '')); return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('tr-TR'); };
const money = (value: unknown, currency?: string) => `${Number(value ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${currency ?? ''}`.trim();
const failure = (error: unknown) => error instanceof Error ? error.message : 'Kayıtlar yüklenemedi. Tekrar deneyin.';

type Props = { id: string };
export function CompanyDetailScreen({ id }: Props) {
  const { user } = useAuth();
  const can = (permission: string) => Boolean(user?.permissions.includes(permission) || user?.roles.includes('super_admin'));
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<any>(null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState('');
  const [revision, setRevision] = useState(0);
  const [fileBusy, setFileBusy] = useState(false);
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const request = ++epoch.current;
    setLoading(true); setError('');
    try { const result = await companyService.get(id); if (request === epoch.current) { setCompany(result); setPage(1); setRevision(v => v + 1); } }
    catch (err) { if (request === epoch.current) { setCompany(null); setError(failure(err)); } }
    finally { if (request === epoch.current) setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { setCompany(null); setRows([]); void load(); return () => { epoch.current += 1; }; }, [load]));
  useEffect(() => {
    let current = true;
    if (page === 1) { setRows([]); setSummary(null); setTotal(0); }
    setSectionError('');
    if (!company) { setSectionLoading(false); return; }
    const permission = ['activities.read', 'opportunities.read', 'receivables.read', 'customer_devices.read', 'contacts.read', 'files.read'][activeTab];
    if (!can(permission)) { setSectionLoading(false); setSectionError('Bu kayıtları görüntüleme yetkiniz yok.'); return; }
    setSectionLoading(true);
    const params = { companyId: id, page, pageSize: 100 };
    const request = activeTab === 0 ? activityService.list(params)
      : activeTab === 1 ? opportunityService.list(params)
      : activeTab === 2 ? Promise.all([financeService.companySummary(id), financeService.companyStatement(id)]).then(([result, lines]) => ({ data: lines, meta: { total: lines.length }, summary: result }))
      : activeTab === 3 ? inventoryService.customerDevices(params)
      : activeTab === 4 ? contactService.list(params)
      : fileService.links({ entityType: 'company', entityId: id, page, pageSize: 100 });
    void request.then(result => {
      if (!current) return;
      setRows(previous => page === 1 ? result.data : [...previous, ...result.data]); setTotal(result.meta.total);
      if ('summary' in result) setSummary(result.summary);
    }).catch(err => { if (current) setSectionError(failure(err)); }).finally(() => { if (current) setSectionLoading(false); });
    return () => { current = false; };
  }, [id, company?.id, activeTab, page, revision, user]);
  const handleAction = (url: string) => { void Linking.openURL(url).catch(() => Alert.alert('Açılamadı', 'Bu işlem için uygun bir uygulama bulunamadı.')); };
  const openFile = async (fileId: string) => { if (fileBusy) return; setFileBusy(true); try { await openStoredFile(fileId); } catch (err) { Alert.alert('Dosya açılamadı', failure(err)); } finally { setFileBusy(false); } };
  const name = company?.shortName || company?.legalTitle || 'Firma';
  const address = company?.addresses?.find((item: any) => item.isDefault) ?? company?.addresses?.[0];
  const phone = company?.phones?.find((item: any) => item.isDefault)?.phone ?? company?.phones?.[0]?.phone;
  const email = company?.emails?.find((item: any) => item.isDefault)?.email ?? company?.emails?.[0]?.email;
  const addressText = address ? [address.fullAddress, address.district, address.province, address.country].filter(Boolean).join(', ') : '';
  const phoneDigits = String(phone ?? '').replace(/[^0-9+]/g, '');
  const whatsappDigits = phoneDigits.replace(/^00/, '').replace(/[^0-9]/g, '');
  const header = <View style={styles.headerBar}><TouchableOpacity accessibilityLabel="Geri" onPress={() => router.back()} style={{ padding: 8 }}><Ionicons name="arrow-back" size={24} color={INK} /></TouchableOpacity>{can('companies.update') && company && <TouchableOpacity style={{ padding: 12 }} onPress={() => router.push({ pathname: '/forms/company', params: { id } })}><Text style={{ color: PRIMARY }}>Düzenle</Text></TouchableOpacity>}</View>;
  if (loading && !company) return <SafeAreaView style={styles.root}>{header}<ActivityIndicator style={{ margin: 32 }} color={PRIMARY} /></SafeAreaView>;
  if (!company) return <SafeAreaView style={styles.root}>{header}<View style={styles.tabPanel}><Text>{error || 'Firma bulunamadı.'}</Text><TouchableOpacity style={styles.newSaleBtn} onPress={() => void load()}><Text>Tekrar Dene</Text></TouchableOpacity></View></SafeAreaView>;
  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
    {header}
    <ScrollView style={styles.scroll} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
      <View style={styles.hero}>
        <View style={styles.heroTop}><View style={[styles.avatarLarge, { backgroundColor: PRIMARY }]}><Text style={styles.avatarLargeText}>{name.charAt(0)}</Text></View><View style={styles.heroInfo}><Text style={styles.heroTitle}>{name}</Text><Text style={styles.heroMetaText}>{company.legalTitle}</Text><Text style={styles.heroMetaText}>{[company.sector, address?.province].filter(Boolean).join(' · ')}</Text></View></View>
        {phone ? <Text style={styles.heroMetaText}>{phone}</Text> : null}{email ? <Text style={styles.heroMetaText}>{email}</Text> : null}{addressText ? <Text style={styles.heroMetaText}>{addressText}</Text> : null}
        {company.notes ? <Text style={styles.actNote}>{company.notes}</Text> : null}
        <View style={styles.quickActions}>
          {phoneDigits && <TouchableOpacity style={styles.qaBtn} onPress={() => handleAction(`tel:${phoneDigits}`)}><Ionicons name="call" size={18} color={PRIMARY} /><Text style={styles.qaText}>Ara</Text></TouchableOpacity>}
          {email && <TouchableOpacity style={styles.qaBtn} onPress={() => handleAction(`mailto:${encodeURIComponent(email)}`)}><Ionicons name="mail" size={18} color={PRIMARY} /><Text style={styles.qaText}>E-posta</Text></TouchableOpacity>}
          {whatsappDigits && <TouchableOpacity style={styles.qaBtn} onPress={() => handleAction(`https://wa.me/${whatsappDigits}`)}><Ionicons name="logo-whatsapp" size={18} color="#137333" /><Text style={styles.qaText}>WhatsApp</Text></TouchableOpacity>}
          {addressText && <TouchableOpacity style={styles.qaBtn} onPress={() => handleAction(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`)}><Ionicons name="map" size={18} color={PRIMARY} /><Text style={styles.qaText}>Harita</Text></TouchableOpacity>}
        </View>
      </View>
      <ScrollView horizontal style={styles.tabsWrapper} contentContainerStyle={styles.tabsScroll}>{TABS.map((tab, index) => <TouchableOpacity key={tab} style={[styles.tabBtn, activeTab === index && styles.tabBtnActive]} onPress={() => { setRows([]); setSummary(null); setPage(1); setActiveTab(index); }}><Text style={[styles.tabText, activeTab === index && styles.tabTextActive]}>{tab}</Text></TouchableOpacity>)}</ScrollView>
      <View style={styles.tabPanel}>
        {activeTab === 0 && can('activities.create') && <TouchableOpacity style={styles.newSaleBtn} onPress={() => router.push({ pathname: '/forms/visit', params: { companyId: id } })}><Text style={styles.newSaleBtnText}>Ziyaret Ekle</Text></TouchableOpacity>}
        {activeTab === 1 && can('opportunities.create') && <TouchableOpacity style={styles.newSaleBtn} onPress={() => router.push({ pathname: '/forms/opportunity', params: { companyId: id } })}><Text style={styles.newSaleBtnText}>Yeni Fırsat</Text></TouchableOpacity>}
        {activeTab === 3 && can('service_tickets.create') && <TouchableOpacity style={styles.newSaleBtn} onPress={() => router.push({ pathname: '/forms/service-ticket', params: { companyId: id } })}><Text style={styles.newSaleBtnText}>Servis Talebi Aç</Text></TouchableOpacity>}
        {activeTab === 4 && can('contacts.create') && <TouchableOpacity style={styles.newSaleBtn} onPress={() => router.push({ pathname: '/forms/contact', params: { companyId: id } })}><Text style={styles.newSaleBtnText}>Kişi Ekle</Text></TouchableOpacity>}
        {sectionError ? <View><Text style={{ color: RED }}>{sectionError}</Text><TouchableOpacity style={styles.newSaleBtn} onPress={() => setRevision(v => v + 1)}><Text>Tekrar Dene</Text></TouchableOpacity></View> : null}
        {activeTab === 2 && summary?.byCurrency?.map((balance: any) => <View key={balance.currencyCode} style={styles.balanceCard}><Text style={styles.balanceHeader}>{balance.currencyCode} Cari Özeti</Text><Text style={styles.finDesc}>Satış: {money(balance.salesTotal, balance.currencyCode)}</Text><Text style={styles.finDesc}>Tahsilat: {money(balance.collections, balance.currencyCode)}</Text><Text style={styles.finDesc}>Borç: {money(balance.borc, balance.currencyCode)}</Text><Text style={styles.finDesc}>Alacak: {money(balance.alacak, balance.currencyCode)}</Text><Text style={styles.finDesc}>Net bakiye: {money(balance.net, balance.currencyCode)}</Text></View>)}
        {rows.map((item, index) => activeTab === 0 ? <View key={item.id} style={styles.activityCard}><View style={styles.actContent}><Text style={styles.actTitle}>{item.subject || item.type?.name || 'Aktivite'}</Text><Text style={styles.actNote}>{item.description || item.result || ''}</Text><Text style={styles.actMetaText}>{formatDate(item.occurredAt ?? item.createdAt)} · {item.createdByUser?.fullName ?? ''}</Text>{item.files?.map((file: any) => <TouchableOpacity key={file.fileId ?? file.id} disabled={fileBusy} onPress={() => void openFile(file.fileId ?? file.file?.id ?? file.id)}><Text style={{ color: PRIMARY }}>{file.originalFilename ?? file.file?.originalFilename ?? 'Aktivite eki'}</Text></TouchableOpacity>)}</View></View>
          : activeTab === 1 ? <TouchableOpacity key={item.id} style={styles.salesCard} onPress={() => router.push(`/modules/sales-cases/${item.id}`)}><View style={styles.salesContent}><Text style={styles.salesTitle}>{item.title || 'Fırsat'}</Text><Text style={styles.salesDesc}>{item.stage?.name ?? ''} · {formatDate(item.createdAt)}</Text><Text style={styles.salesValue}>{money(item.estimatedValue, item.currency?.code)}</Text></View><Ionicons name="chevron-forward" size={18} color={PRIMARY} /></TouchableOpacity>
          : activeTab === 2 ? <View key={`${item.type}-${item.id}-${index}`} style={styles.finRow}><View style={styles.finContent}><Text style={styles.finDesc}>{item.description || item.invoiceNo || 'Cari hareket'}</Text><Text style={styles.finDate}>{formatDate(item.date)}</Text><Text style={styles.finDate}>Borç {money(item.debit, item.currencyCode)} · Alacak {money(item.credit, item.currencyCode)}</Text><Text style={styles.finAmount}>Bakiye {money(item.balance, item.currencyCode)}</Text></View></View>
          : activeTab === 3 ? <TouchableOpacity key={item.id} style={styles.machineCard} onPress={() => router.push(`/modules/machines/${item.id}`)}><Text style={styles.machineModel}>{item.productModelName || item.model || 'Makine'}</Text><Text style={styles.machineSerial}>{item.serialNumber || 'Seri numarası belirtilmemiş'}</Text><Text style={styles.machineDates}>Kurulum: {formatDate(item.installationDate ?? item.installedAt)} · Garanti: {formatDate(item.warrantyEndDate)}</Text></TouchableOpacity>
          : activeTab === 4 ? <TouchableOpacity key={item.id} style={styles.activityCard} onPress={() => router.push(`/modules/contacts/${item.id}`)}><View style={styles.actContent}><Text style={styles.actTitle}>{item.fullName}</Text><Text style={styles.actNote}>{item.title || item.department || ''}</Text><Text style={styles.actMetaText}>{item.phone || item.mobilePhone || item.email || ''}</Text></View><Ionicons name="chevron-forward" size={18} color={PRIMARY} /></TouchableOpacity>
          : <TouchableOpacity key={item.id} disabled={fileBusy || !item.file?.id} style={styles.activityCard} onPress={() => void openFile(item.file.id)}><Ionicons name="document-text-outline" size={24} color={PRIMARY} /><View style={styles.actContent}><Text style={styles.actTitle}>{item.file?.originalFilename || 'Dosya'}</Text><Text style={styles.actMetaText}>{formatDate(item.file?.createdAt)}</Text></View><Ionicons name="download-outline" size={20} color={PRIMARY} /></TouchableOpacity>)}
        {sectionLoading && <ActivityIndicator color={PRIMARY} />}
        {!sectionLoading && !sectionError && !rows.length && <Text style={styles.emptyTitle}>Kayıt bulunamadı.</Text>}
        {activeTab !== 2 && total > rows.length && !sectionLoading && <TouchableOpacity style={styles.newSaleBtn} onPress={() => setPage(p => p + 1)}><Text style={styles.newSaleBtnText}>Daha Fazla Göster ({rows.length}/{total})</Text></TouchableOpacity>}
      </View>
    </ScrollView>
  </SafeAreaView>;
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
