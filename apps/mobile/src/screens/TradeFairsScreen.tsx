import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { tradeFairExportPath, tradeFairsService, TRADE_FAIR_PROVINCES, type TradeFairRecord, type TradeFairSummary } from '@/src/api/tradeFairs';
import { openExportUrl, openStoredFile } from '@/src/api/download';
import { fileService } from '@/src/api/services';
import { useAuth } from '@/src/auth/AuthProvider';

const PRIMARY = '#000c69';
const fold = (value: string) => value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
const failure = (error: unknown) => error instanceof Error ? error.message : 'İşlem tamamlanamadı. Tekrar deneyin.';
type Choice = { value: string; label: string };
type Picker = 'fair' | 'province' | 'staff';

export function TradeFairsScreen() {
  const { user } = useAuth();
  const can = (permission: string) => Boolean(user?.permissions.includes(permission) || user?.roles.includes('super_admin'));
  const readable = can('trade_fairs.read');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [fairName, setFairName] = useState('');
  const [province, setProvince] = useState('');
  const [staffId, setStaffId] = useState('');
  const [staff, setStaff] = useState<Choice[]>([]);
  const [summary, setSummary] = useState<TradeFairSummary>({ fairs: [], byUser: [] });
  const [metadataError, setMetadataError] = useState('');
  const [rows, setRows] = useState<TradeFairRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selected, setSelected] = useState<TradeFairRecord | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [metadataRevision, setMetadataRevision] = useState(0);
  const epoch = useRef(0);
  useEffect(() => {
    const timer = setTimeout(() => { setRows([]); setPage(1); setQuery(search.trim()); }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const filters = useMemo(() => ({ fairName: fairName || undefined, q: query || undefined, province: province || undefined, metByUserId: staffId || undefined }), [fairName, query, province, staffId]);
  const load = useCallback(async () => {
    const request = ++epoch.current;
    if (!readable) { setRows([]); setTotal(0); setLoading(false); return; }
    setLoading(true); setError('');
    if (page === 1) { setRows([]); setTotal(0); }
    try {
      const result = await tradeFairsService.list({ ...filters, page, pageSize: 50 });
      if (request === epoch.current) {
        setRows(previous => page === 1 ? result.data : [...previous, ...result.data]);
        setTotal(result.meta.total);
      }
    } catch (err) { if (request === epoch.current) setError(failure(err)); }
    finally { if (request === epoch.current) setLoading(false); }
  }, [filters, page, readable]);
  useFocusEffect(useCallback(() => { void load(); return () => { epoch.current += 1; }; }, [load]));
  useFocusEffect(useCallback(() => { setMetadataRevision(value => value + 1); }, [readable]));
  useEffect(() => {
    let current = true;
    if (!readable) return;
    setMetadataError('');
    void Promise.allSettled([tradeFairsService.summary(fairName || undefined), tradeFairsService.staff()]).then(([stats, people]) => {
      if (!current) return;
      if (stats.status === 'fulfilled') setSummary(stats.value); else setMetadataError('Fuar özeti yüklenemedi.');
      if (people.status === 'fulfilled') setStaff(people.value.map(person => ({ value: person.id, label: person.fullName }))); else setMetadataError(message => `${message} Görüşen kişi listesi yüklenemedi.`.trim());
    });
    return () => { current = false; };
  }, [fairName, readable, metadataRevision]);
  useEffect(() => {
    let current = true;
    setAttachments([]); setAttachmentError('');
    if (!selected || !can('files.read')) { setAttachmentLoading(false); return; }
    setAttachmentLoading(true);
    void (async () => {
      const all: any[] = [];
      let filePage = 1;
      let fileTotal = 0;
      do {
        const result = await fileService.links({ entityType: 'trade_fair_contact', entityId: selected.id, page: filePage, pageSize: 100 });
        if (!current) return;
        all.push(...result.data); fileTotal = result.meta.total; filePage += 1;
        if (!result.data.length && all.length < fileTotal) throw new Error('Dosya listesi tamamlanamadı.');
      } while (all.length < fileTotal);
      if (current) setAttachments(all);
    })().catch(err => { if (current) setAttachmentError(failure(err)); }).finally(() => { if (current) setAttachmentLoading(false); });
    return () => { current = false; };
  }, [selected?.id, user]);
  const applyChoice = (value: string) => {
    setRows([]); setPage(1);
    if (picker === 'fair') setFairName(value); else if (picker === 'province') setProvince(value); else setStaffId(value);
    setPicker(null); setPickerSearch('');
  };
  const choices: Choice[] = picker === 'fair' ? summary.fairs.map(fair => ({ value: fair.name, label: fair.name }))
    : picker === 'province' ? [...TRADE_FAIR_PROVINCES].sort((a, b) => a.localeCompare(b, 'tr')).map(city => ({ value: city, label: city })) : staff;
  const exportExcel = async () => {
    if (exporting || loading || search.trim() !== query) return;
    setExporting(true);
    try { await openExportUrl(tradeFairExportPath(filters)); }
    catch (err) { Alert.alert('Excel indirilemedi', failure(err)); }
    finally { setExporting(false); }
  };
  const openFile = async (fileId: string) => {
    if (fileBusy) return;
    setFileBusy(true);
    try { await openStoredFile(fileId); } catch (err) { Alert.alert('Dosya açılamadı', failure(err)); } finally { setFileBusy(false); }
  };
  const openLink = (url: string) => { void Linking.openURL(url).catch(() => Alert.alert('Açılamadı', 'Uygun uygulama bulunamadı.')); };
  const reset = () => { setRows([]); setPage(1); setFairName(''); setProvince(''); setStaffId(''); setSearch(''); setQuery(''); };
  const refresh = () => { if (page === 1) void load(); else setPage(1); setMetadataRevision(value => value + 1); };
  const detailRows: Array<[string, string | null | undefined]> = selected ? [
    ['Fuar', selected.fairName], ['Firma', selected.companyName], ['Yetkili', selected.contactName], ['Unvan', selected.contactTitle],
    ['Telefon', selected.mobilePhone], ['E-posta', selected.email], ['Konum', [selected.district, selected.province, selected.country].filter(Boolean).join(', ')],
    ['Görüşen', selected.metByName], ['Kişi Sayısı', String(selected.visitorCount)], ['Ürün Kategorisi', selected.productCategory], ['Ürün', selected.productType],
    ['İletişime Geçildi', selected.contacted ? 'Evet' : 'Hayır'], ['Görüşme Tarihi', selected.contactDate], ['Görüşme Notu', selected.contactNotes],
    ['Teklif Gönderildi', selected.offerSent ? 'Evet' : 'Hayır'], ['Müşteriye Dönüştü', selected.customerConverted ? 'Evet' : 'Hayır'], ['Notlar', selected.notes],
  ] : [];
  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
    <View style={styles.header}><TouchableOpacity accessibilityLabel="Geri" onPress={() => router.back()} style={styles.iconButton}><Ionicons name="arrow-back" size={24} color={PRIMARY} /></TouchableOpacity><Text style={styles.title}>Fuar Kayıtları</Text>{readable && can('reports.export') ? <TouchableOpacity accessibilityLabel="Filtreli Excel indir" disabled={exporting || loading || search.trim() !== query} onPress={() => void exportExcel()} style={styles.iconButton}>{exporting ? <ActivityIndicator color={PRIMARY} /> : <Ionicons name="download-outline" size={24} color={PRIMARY} />}</TouchableOpacity> : <View style={styles.iconButton} />}</View>
    {!readable ? <View style={styles.panel}><Text>Fuar kayıtlarını görüntüleme yetkiniz yok.</Text></View> : <>
      <View style={styles.panel}>
        <TextInput accessibilityLabel="Fuar kayıtlarında ara" style={styles.input} placeholder="Firma, yetkili, telefon, şehir veya ürün ara…" value={search} onChangeText={setSearch} maxLength={200} autoCorrect={false} />
        <View style={styles.filters}>{([['fair', fairName || 'Tüm Fuarlar'], ['province', province || 'Tüm Şehirler'], ['staff', staff.find(person => person.value === staffId)?.label || (staffId ? 'Seçili Kişi' : 'Tüm Kişiler')]] as const).map(([key, label]) => <TouchableOpacity key={key} style={styles.chip} onPress={() => { setPicker(key); setPickerSearch(''); }}><Text style={styles.chipText}>{label}</Text><Ionicons name="chevron-down" size={14} color={PRIMARY} /></TouchableOpacity>)}</View>
        {(query || fairName || province || staffId) && <TouchableOpacity onPress={reset} style={styles.textButton}><Text style={styles.link}>Filtreleri Temizle</Text></TouchableOpacity>}
        <Text style={styles.meta}>{loading && !rows.length ? 'Yükleniyor…' : `${total} eşleşen kayıt`}</Text>
        {metadataError ? <TouchableOpacity style={styles.textButton} onPress={() => setMetadataRevision(value => value + 1)}><Text style={styles.error}>{metadataError} Tekrar Dene</Text></TouchableOpacity> : null}
        {summary.byUser.length > 0 && <><Text style={styles.meta}>Kişiye dokunun, girdiklerini filtreleyin. Sayılar yalnız seçili fuar kapsamındadır.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.staffList}>{summary.byUser.filter(person => person.userId).map(person => <TouchableOpacity key={person.userId!} style={[styles.staffCard, staffId === person.userId && styles.staffSelected]} onPress={() => { setRows([]); setPage(1); setStaffId(current => current === person.userId ? '' : person.userId!); }}><Text style={styles.label}>{person.fullName || 'Kullanıcı'}</Text><Text style={styles.meta}>{person.meetings} kayıt · {person.people} kişi</Text></TouchableOpacity>)}</ScrollView></>}
      </View>
      <FlatList data={rows} keyExtractor={record => record.id} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading && page === 1} onRefresh={refresh} />} renderItem={({ item }) => <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}><Text style={styles.label}>{item.companyName}</Text><Text style={styles.body}>{item.contactName}{item.contactTitle ? ` · ${item.contactTitle}` : ''}</Text><Text style={styles.meta}>{item.fairName} · {[item.province, item.country].filter(Boolean).join(', ')}</Text><Text style={styles.meta}>Görüşen: {item.metByName || 'Belirtilmemiş'}</Text><View style={styles.filters}>{item.offerSent && <Text style={styles.badge}>Teklif Gönderildi</Text>}{item.customerConverted && <Text style={styles.badge}>Müşteriye Dönüştü</Text>}</View></TouchableOpacity>} ListEmptyComponent={!loading && !error ? <Text style={styles.empty}>Filtrelere uygun kayıt bulunamadı.</Text> : null} ListFooterComponent={<View>{loading && <ActivityIndicator color={PRIMARY} />}{error ? <View><Text style={styles.error}>{error}</Text><TouchableOpacity style={styles.button} onPress={() => void load()}><Text style={styles.link}>Tekrar Dene</Text></TouchableOpacity></View> : null}{!loading && !error && rows.length < total && <TouchableOpacity style={styles.button} onPress={() => setPage(value => value + 1)}><Text style={styles.link}>Daha Fazla Göster ({rows.length}/{total})</Text></TouchableOpacity>}</View>} />
    </>}
    <Modal transparent visible={picker !== null} animationType="slide" onRequestClose={() => setPicker(null)}><View style={styles.overlay}><View style={styles.sheet}><Text style={styles.title}>{picker === 'fair' ? 'Fuar Seçin' : picker === 'province' ? 'Şehir Seçin' : 'Görüşen Kişiyi Seçin'}</Text><TextInput style={styles.input} placeholder="Listede ara…" value={pickerSearch} onChangeText={setPickerSearch} autoCorrect={false} /><FlatList data={[{ value: '', label: 'Tümü' }, ...choices.filter(choice => fold(choice.label).includes(fold(pickerSearch)))]} keyExtractor={choice => choice.value} renderItem={({ item }) => <TouchableOpacity style={styles.option} onPress={() => applyChoice(item.value)}><Text style={styles.body}>{item.label}</Text></TouchableOpacity>} /><TouchableOpacity style={styles.button} onPress={() => setPicker(null)}><Text style={styles.link}>Kapat</Text></TouchableOpacity></View></View></Modal>
    <Modal transparent visible={selected !== null} animationType="slide" onRequestClose={() => setSelected(null)}><View style={styles.overlay}><View style={styles.sheet}><Text style={styles.title}>Fuar Kaydı</Text><ScrollView>{detailRows.filter(([, value]) => value).map(([label, value]) => <View key={label} style={styles.detailRow}><Text style={styles.meta}>{label}</Text><Text style={styles.body}>{value}</Text></View>)}<View style={styles.filters}>{selected?.mobilePhone && <TouchableOpacity style={styles.button} onPress={() => openLink(`tel:${selected.mobilePhone!.replace(/[^0-9+]/g, '')}`)}><Text style={styles.link}>Ara</Text></TouchableOpacity>}{selected?.email && <TouchableOpacity style={styles.button} onPress={() => openLink(`mailto:${encodeURIComponent(selected.email!)}`)}><Text style={styles.link}>E-posta</Text></TouchableOpacity>}</View>{attachmentLoading && <ActivityIndicator color={PRIMARY} />}{attachmentError ? <Text style={styles.error}>{attachmentError}</Text> : null}{attachments.map(attachment => <TouchableOpacity key={attachment.id} disabled={fileBusy || !attachment.file?.id} style={styles.option} onPress={() => void openFile(attachment.file.id)}><Text style={styles.link}>{attachment.file?.originalFilename || 'Dosyayı Aç / Paylaş'}</Text></TouchableOpacity>)}</ScrollView><TouchableOpacity style={styles.button} onPress={() => setSelected(null)}><Text style={styles.link}>Kapat</Text></TouchableOpacity></View></View></Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' }, header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 8 },
  title: { color: '#1a1c1d', fontSize: 18, fontWeight: '700' }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  panel: { padding: 16, gap: 10, backgroundColor: '#fff' }, input: { minHeight: 44, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, color: '#1a1c1d' },
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#eef2ff' }, chipText: { color: PRIMARY, fontSize: 12, fontWeight: '600' },
  textButton: { minHeight: 32, justifyContent: 'center' }, link: { color: PRIMARY, fontWeight: '600' }, meta: { color: '#717182', fontSize: 12 },
  staffList: { gap: 8 }, staffCard: { padding: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, gap: 4 }, staffSelected: { borderColor: PRIMARY, backgroundColor: '#eef2ff' },
  list: { padding: 16, gap: 10, paddingBottom: 40 }, card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, backgroundColor: '#fff', gap: 6 }, label: { color: '#1a1c1d', fontWeight: '700', fontSize: 14 }, body: { color: '#1a1c1d', fontSize: 14 },
  badge: { fontSize: 11, color: '#137333', backgroundColor: '#e6f4ea', padding: 6, borderRadius: 6 }, error: { color: '#cf060c', paddingVertical: 8 }, empty: { textAlign: 'center', padding: 24, color: '#717182' },
  button: { minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#eef2ff', borderRadius: 10, marginVertical: 4 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.4)' }, sheet: { maxHeight: '85%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  option: { minHeight: 44, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }, detailRow: { paddingVertical: 8, gap: 4 },
});
