import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { calendarService, companyService, type CalendarEventDTO, type CalendarEventType } from '../api/services';
import { runCalendarSync } from '../calendarSync';

const LABELS: Record<CalendarEventType, string> = {
  customer_visit: 'Ziyaret',
  meeting: 'Toplantı',
  call: 'Arama',
  task: 'Görev',
  other: 'Diğer',
};

export function CalendarScreen({ navigation }: { navigation: any }) {
  const [events, setEvents] = useState<CalendarEventDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CalendarEventType>('customer_visit');
  const [companies, setCompanies] = useState<Array<{ id: string; legalTitle: string; shortName?: string | null }>>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const range = useMemo(() => {
    const now = new Date();
    const from = new Date(now);
    from.setMonth(from.getMonth() - 6);
    const to = new Date(now);
    to.setMonth(to.getMonth() + 6);
    return { from, to };
  }, []);

  useLayoutEffect(() => {
    navigation?.setOptions?.({
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.navigate('CalendarSettings')} style={{ paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 18 }}>⚙️</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const load = async () => {
    setLoading(true);
    try {
      const [rows, companyRows] = await Promise.all([
        calendarService.events({ from: range.from.toISOString(), to: range.to.toISOString() }),
        companyService.list({ pageSize: 200 }),
      ]);
      setEvents(rows);
      setCompanies(companyRows.data);
    } catch (error) {
      Alert.alert('Takvim yüklenemedi', message(error));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      await runCalendarSync(true);
      await load();
      Alert.alert('Senkron tamamlandı', 'Telefon ve CRM takvimi güncellendi.');
    } catch (error) {
      Alert.alert('Senkron başarısız', message(error));
    } finally {
      setSyncing(false);
    }
  };
  const create = async () => {
    if (!title.trim()) return Alert.alert('Başlık gerekli');
    if (type === 'customer_visit' && !companyId) return Alert.alert('Müşteri ziyareti için firma seçin');
    const start = new Date();
    start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
    const end = new Date(start.getTime() + 3_600_000);
    try {
      await calendarService.create({
        eventType: type,
        title: title.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        allDay: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul',
        companyId,
      });
      setTitle('');
      setCompanyId(null);
      setFormOpen(false);
      await load();
    } catch (error) {
      Alert.alert('Etkinlik kaydedilemedi', message(error));
    }
  };

  return (
    <View style={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>12 AYLIK AJANDA</Text>
        <Text style={styles.heroTitle}>Kişisel Takvim</Text>
        <Text style={styles.heroText}>Geçmiş 6 ay ve gelecek 6 ay, telefon takviminle birlikte.</Text>
        <View style={styles.actions}>
          <Action label="Şimdi senkronla" onPress={sync} busy={syncing} />
          <Action label={formOpen ? 'Formu kapat' : 'Yeni etkinlik'} onPress={() => setFormOpen((value) => !value)} secondary />
        </View>
      </View>
      {formOpen && (
        <View style={styles.card}>
          <Text style={styles.title}>Hızlı etkinlik</Text>
          <View style={styles.chips}>
            {(Object.keys(LABELS) as CalendarEventType[]).map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.chip, type === item && styles.chipActive]}
                onPress={() => {
                  setType(item);
                  if (item !== 'customer_visit') setCompanyId(null);
                }}
              >
                <Text style={[styles.chipText, type === item && styles.chipTextActive]}>{LABELS[item]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Etkinlik başlığı" />
          {type === 'customer_visit' && (
            <View style={styles.companyList}>
              {companies.slice(0, 30).map((company) => (
                <TouchableOpacity
                  key={company.id}
                  style={[styles.company, companyId === company.id && styles.companyActive]}
                  onPress={() => setCompanyId(company.id)}
                >
                  <Text numberOfLines={1} style={styles.companyText}>
                    {company.shortName || company.legalTitle}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Action label="Şimdi için oluştur" onPress={create} />
        </View>
      )}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : events.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.title}>Etkinlik yok</Text>
          <Text style={styles.muted}>Takvimlerini ⚙️ Ayarlar'dan bağlayabilirsin.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {events.map((event) => (
            <View key={event.id} style={styles.event}>
              <View style={styles.date}>
                <Text style={styles.day}>{new Date(event.startsAt).getDate()}</Text>
                <Text style={styles.month}>
                  {new Date(event.startsAt).toLocaleDateString('tr-TR', { month: 'short' }).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.muted}>
                  {new Date(event.startsAt).toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} ·{' '}
                  {LABELS[event.eventType]}
                </Text>
                {event.company && <Text style={styles.companyLabel}>{event.company.shortName || event.company.legalTitle}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Action({ label, onPress, busy, secondary }: { label: string; onPress: () => void; busy?: boolean; secondary?: boolean }) {
  return (
    <TouchableOpacity disabled={busy} onPress={onPress} style={[styles.button, secondary && styles.buttonSecondary]}>
      {busy ? (
        <ActivityIndicator color={secondary ? '#0f172a' : '#fff'} />
      ) : (
        <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : 'Beklenmeyen hata';
}
const styles = StyleSheet.create({
  content: { padding: 18, gap: 14 },
  hero: { backgroundColor: '#07131f', borderRadius: 18, padding: 20, gap: 6 },
  eyebrow: { color: '#34d399', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  heroTitle: { color: '#fff', fontSize: 27, fontWeight: '900' },
  heroText: { color: '#cbd5e1', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, gap: 12 },
  title: { color: '#0f172a', fontSize: 17, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#f1f5f9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  chipActive: { backgroundColor: '#0f172a' },
  chipText: { color: '#475569', fontSize: 11, fontWeight: '800' },
  chipTextActive: { color: '#fff' },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 9, paddingHorizontal: 12, color: '#0f172a' },
  companyList: { maxHeight: 150, gap: 5 },
  company: { padding: 9, borderRadius: 7, backgroundColor: '#f8fafc' },
  companyActive: { backgroundColor: '#d1fae5', borderWidth: 1, borderColor: '#6ee7b7' },
  companyText: { color: '#334155', fontWeight: '700' },
  button: { minHeight: 42, paddingHorizontal: 13, borderRadius: 9, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', flex: 1 },
  buttonSecondary: { backgroundColor: '#fff' },
  buttonText: { color: '#fff', fontWeight: '900' },
  buttonTextSecondary: { color: '#0f172a' },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', borderRadius: 14, padding: 24, alignItems: 'center', gap: 5 },
  muted: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  list: { gap: 9 },
  event: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12 },
  date: { width: 46, height: 50, borderRadius: 9, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center' },
  day: { color: '#065f46', fontSize: 19, fontWeight: '900' },
  month: { color: '#059669', fontSize: 9, fontWeight: '900' },
  flex: { flex: 1 },
  eventTitle: { color: '#0f172a', fontSize: 15, fontWeight: '900' },
  companyLabel: { color: '#047857', fontSize: 12, fontWeight: '800', marginTop: 3 },
});
