import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { calendarService } from '../api/services';
import { CALENDAR_SYNC_STORAGE_KEYS } from '../calendarSync';
import { CalendarNative, type DeviceCalendar } from '../native/CalendarNative';

export function CalendarSettingsScreen() {
  const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [destination, setDestination] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (!(await CalendarNative.requestAccess())) throw new Error('Takvim izni verilmedi.');
      const [deviceCalendars, settings, localState] = await Promise.all([
        CalendarNative.listCalendars(),
        calendarService.syncSettings(),
        AsyncStorage.multiGet([CALENDAR_SYNC_STORAGE_KEYS.lastSyncAt, CALENDAR_SYNC_STORAGE_KEYS.lastSyncError]),
      ]);
      const local = Object.fromEntries(localState);
      setCalendars(deviceCalendars);
      setSelected(settings?.selectedCalendars.map((item) => item.id) ?? []);
      setDestination(settings?.destinationCalendarId ?? null);
      setAutoSync(settings?.autoSync ?? false);
      setLastSync(local[CALENDAR_SYNC_STORAGE_KEYS.lastSyncAt] || settings?.lastSyncAt || null);
      setLastError(local[CALENDAR_SYNC_STORAGE_KEYS.lastSyncError] || settings?.lastSyncError || null);
    } catch (error) {
      Alert.alert('Takvim ayarları', error instanceof Error ? error.message : 'Ayarlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (destination && !calendars.find((calendar) => calendar.id === destination)?.writable)
      return Alert.alert('Yazılabilir bir hedef takvim seçin');
    setSaving(true);
    try {
      const deviceId = await CalendarNative.getDeviceId();
      await calendarService.saveSyncSettings({
        deviceId,
        platform: Platform.OS as 'android' | 'ios',
        autoSync,
        selectedCalendars: calendars.filter((calendar) => selected.includes(calendar.id)),
        destinationCalendarId: destination,
      });
      await CalendarNative.setBackgroundSyncEnabled(autoSync);
      Alert.alert('Kaydedildi', autoSync ? 'Otomatik senkron etkin.' : 'Otomatik senkron kapalı.');
    } catch (error) {
      Alert.alert('Ayar kaydedilemedi', error instanceof Error ? error.message : 'Beklenmeyen hata');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.title}>Otomatik yükle</Text>
            <Text style={styles.muted}>Uygulama açıldığında ve sistem izin verdiğinde arka planda senkronlar.</Text>
          </View>
          <Switch value={autoSync} onValueChange={setAutoSync} />
        </View>
        {lastSync && <Text style={styles.lastSync}>Son senkron: {new Date(lastSync).toLocaleString('tr-TR')}</Text>}
        {lastError ? <Text style={styles.lastError}>Son hata: {lastError}</Text> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Okunacak takvimler</Text>
        {calendars.map((calendar) => {
          const active = selected.includes(calendar.id);
          return (
            <TouchableOpacity
              key={calendar.id}
              style={styles.calendarRow}
              onPress={() => setSelected((items) => (active ? items.filter((id) => id !== calendar.id) : [...items, calendar.id]))}
            >
              <View style={[styles.dot, { backgroundColor: calendar.color || '#64748b' }]} />
              <View style={styles.flex}>
                <Text style={styles.calendarName}>{calendar.title}</Text>
                <Text style={styles.muted}>{calendar.writable ? 'Okuma ve yazma' : 'Salt okunur'}</Text>
              </View>
              <View style={[styles.check, active && styles.checkActive]}>
                <Text style={styles.checkText}>{active ? '✓' : ''}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>CRM kayıtlarının yazılacağı takvim</Text>
        {calendars
          .filter((calendar) => calendar.writable && selected.includes(calendar.id))
          .map((calendar) => (
            <TouchableOpacity
              key={calendar.id}
              style={[styles.destination, destination === calendar.id && styles.destinationActive]}
              onPress={() => setDestination(calendar.id)}
            >
              <Text style={styles.calendarName}>{calendar.title}</Text>
              <Text>{destination === calendar.id ? '●' : '○'}</Text>
            </TouchableOpacity>
          ))}
      </View>
      <TouchableOpacity disabled={saving} style={styles.save} onPress={save}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Ayarları kaydet</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, gap: 14 },
  muted: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  title: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  lastSync: { color: '#047857', fontSize: 11, fontWeight: '800' },
  lastError: { color: '#b91c1c', fontSize: 11, fontWeight: '800' },
  calendarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  calendarName: { color: '#1e293b', fontWeight: '800' },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: '#059669', borderColor: '#059669' },
  checkText: { color: '#fff', fontWeight: '900' },
  destination: { flexDirection: 'row', justifyContent: 'space-between', padding: 11, backgroundColor: '#f8fafc', borderRadius: 8 },
  destinationActive: { backgroundColor: '#d1fae5', borderWidth: 1, borderColor: '#6ee7b7' },
  save: { minHeight: 46, borderRadius: 10, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '900' },
});
