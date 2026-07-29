import { useEffect, useState } from 'react';
import { Alert, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { calendarService } from '@/src/api/services';
import { CompanyPicker } from '@/src/ui/CompanyPicker';
import { Button } from '@/src/ui/Button';
import { Input } from '@/src/ui/Input';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { colors } from '@/src/theme/tokens';

export function CalendarEventFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('10:00');
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(isEdit);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const now = new Date();
      const from = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString();
      const to = new Date(now.getFullYear() + 1, now.getMonth(), 0).toISOString();
      const rows = await calendarService.events({ from, to });
      const event = (rows as unknown as Record<string, unknown>[]).find((e) => String(e.id) === id);
      if (!event) {
        Alert.alert('Hata', 'Etkinlik bulunamadı');
        return;
      }
      setTitle(String(event.title ?? ''));
      setLocation(String(event.location ?? ''));
      const starts = String(event.startsAt ?? '');
      if (starts) {
        setDate(starts.slice(0, 10));
        setTime(starts.slice(11, 16) || '10:00');
      }
      setCompanyId(String(event.companyId ?? ''));
      setCompanyName(String(event.companyName ?? ''));
    })()
      .catch((e) => Alert.alert('Hata', e instanceof Error ? e.message : 'Yüklenemedi'))
      .finally(() => setBooting(false));
  }, [id]);

  const submit = async () => {
    if (!title.trim()) {
      Alert.alert('Hata', 'Başlık zorunlu');
      return;
    }
    const startsAt = new Date(`${date}T${time}:00`);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    setLoading(true);
    try {
      const body = {
        eventType: 'customer_visit' as const,
        title: title.trim(),
        location: location || undefined,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        allDay: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul',
        companyId: companyId || null,
      };
      if (isEdit && id) {
        await calendarService.update(id, body);
        Alert.alert('Başarılı', 'Etkinlik güncellendi', [{ text: 'Tamam', onPress: () => router.back() }]);
      } else {
        await calendarService.create(body);
        Alert.alert('Başarılı', 'Etkinlik oluşturuldu', [{ text: 'Tamam', onPress: () => router.back() }]);
      }
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setLoading(false);
    }
  };

  if (booting) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return (
    <FormPageLayout title={isEdit ? 'Etkinlik Düzenle' : 'Yeni Takvim Etkinliği'}>
      <CompanyPicker
        label="Firma (opsiyonel)"
        value={companyId}
        displayName={companyName}
        onSelect={(c) => {
          setCompanyId(c.id);
          setCompanyName(String(c.legalTitle ?? c.shortName ?? c.id));
        }}
      />
      <Input label="Başlık *" value={title} onChangeText={setTitle} />
      <Input label="Konum" value={location} onChangeText={setLocation} />
      <Input label="Tarih" value={date} onChangeText={setDate} />
      <Input label="Saat" value={time} onChangeText={setTime} />
      <Button title={isEdit ? 'Güncelle' : 'Kaydet'} onPress={() => void submit()} loading={loading} />
    </FormPageLayout>
  );
}
