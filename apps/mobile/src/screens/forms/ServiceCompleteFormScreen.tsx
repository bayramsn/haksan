import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, ApiError } from '@/src/api/apiClient';
import { completeServiceTicket, enqueueMutation, type ServiceCompletionPayload } from '@/src/offline/queue';
import { useAuth } from '@/src/auth/AuthProvider';
import { Button } from '@/src/ui/Button';
import { Input } from '@/src/ui/Input';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { SectionTitle } from '@/src/ui/SectionTitle';
import { SignaturePad } from '@/src/ui/SignaturePad';
import { colors } from '@/src/theme/tokens';

type Completion = ServiceCompletionPayload['completionForm'];
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asText = (value: unknown): string => typeof value === 'string' ? value : '';

/** İmzalı CRM servis formunu kaydeder; bağlantı yoksa aynı form güvenli kuyrukta tutulur. */
export function ServiceCompleteFormScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId?: string }>();
  const { user } = useAuth();
  const [notes, setNotes] = useState('');
  const [technician, setTechnician] = useState('');
  const [recipient, setRecipient] = useState('');
  const [serviceType, setServiceType] = useState<Completion['serviceType']>('ariza');
  const [responsibility, setResponsibility] = useState<Completion['responsibility']>('ucretli');
  const [signed, setSigned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recordLoading, setRecordLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ticketLabel, setTicketLabel] = useState('');
  const [existingForm, setExistingForm] = useState<Record<string, unknown>>({});
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setRecordLoading(true);
    setLoadError(null);
    setSigned(false);
    void (async () => {
      try {
        if (!ticketId) throw new Error('Servis talebi seçilmedi.');
        const ticket = await api.get<Record<string, unknown>>(`/service-tickets/${encodeURIComponent(ticketId)}`);
        if (!active) return;
        const completion = asRecord(asRecord(ticket.metadata).completionForm);
        setExistingForm(completion);
        setTicketLabel(asText(ticket.ticketNo) || asText(ticket.subject) || ticketId);
        setNotes(asText(completion.yapilanIsler) || asText(ticket.resolutionNote));
        setTechnician(asText(completion.kurulumuYapan) || user?.fullName || '');
        setRecipient(asText(completion.teslimAlan));
        if (['montaj', 'ariza', 'periyodik'].includes(asText(completion.serviceType))) setServiceType(completion.serviceType as Completion['serviceType']);
        if (['ucretli', 'garanti', 'bakim'].includes(asText(completion.responsibility))) setResponsibility(completion.responsibility as Completion['responsibility']);
      } catch (cause) {
        if (active) setLoadError(cause instanceof Error ? cause.message : 'Servis kaydı yüklenemedi.');
      } finally {
        if (active) setRecordLoading(false);
      }
    })();
    return () => { active = false; };
  }, [ticketId, retry, user?.fullName]);

  const submit = async () => {
    if (loading) return;
    if (!ticketId || loadError || recordLoading) {
      Alert.alert('Kayıt gerekli', 'Önce servis kaydını yükleyin.');
      return;
    }
    if (!notes.trim() || !technician.trim() || !recipient.trim()) {
      Alert.alert('Eksik bilgiler', 'Yapılan işleri, teknisyeni ve teslim alan kişinin adını doldurun.');
      return;
    }
    if (!signed) {
      Alert.alert('İmza gerekli', 'Teslim alan müşterinin imzasını alın.');
      return;
    }
    const payload: ServiceCompletionPayload = {
      ticketId,
      completionForm: {
        ...existingForm, serviceType, responsibility,
        yapilanIsler: notes.trim(), kurulumuYapan: technician.trim(), teslimAlan: recipient.trim(),
        signedAt: new Date().toISOString(), ...(user?.id ? { signedByUserId: user.id } : {}),
      },
    };
    setLoading(true);
    try {
      await completeServiceTicket(payload);
      Alert.alert('Başarılı', 'İmzalı servis formu CRM’ye kaydedildi ve servis kapatıldı.', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (cause) {
      const offline = cause instanceof ApiError ? cause.status >= 500 || cause.status === 0 : cause instanceof TypeError;
      if (offline) {
        try {
          await enqueueMutation({ kind: 'service-complete', payload });
          Alert.alert('Gönderim bekliyor', 'İmzalı form güvenli kuyruğa alındı. Bağlantı geldiğinde CRM’ye gönderilecek; servis henüz kapatılmış sayılmaz.', [{ text: 'Tamam', onPress: () => router.back() }]);
        } catch (queueError) {
          Alert.alert('Kaydedilemedi', queueError instanceof Error ? queueError.message : 'Form kuyrukta saklanamadı. Sayfayı kapatmadan tekrar deneyin.');
        }
      } else Alert.alert('Tamamlanamadı', cause instanceof Error ? cause.message : 'Servis kaydedilemedi.');
    } finally { setLoading(false); }
  };

  return (
    <FormPageLayout title="Servis Tamamlama" subtitle={`Talep: ${ticketLabel || ticketId || '—'}`}>
      {recordLoading ? <ActivityIndicator color={colors.primary} /> : loadError ? <><Text accessibilityRole="alert" style={styles.error}>{loadError}</Text><Button title="Tekrar dene" onPress={() => setRetry(value => value + 1)} /></> : <>
        <SectionTitle title="Servis Türü" />
        <View style={styles.options}>{([['ariza', 'Arıza'], ['montaj', 'Montaj'], ['periyodik', 'Periyodik']] as const).map(([value, label]) => <Button key={value} title={label} variant={serviceType === value ? 'primary' : 'secondary'} disabled={loading} onPress={() => { setServiceType(value); setSigned(false); }} />)}</View>
        <SectionTitle title="Sorumluluk" />
        <View style={styles.options}>{([['ucretli', 'Ücretli'], ['garanti', 'Garanti'], ['bakim', 'Bakım']] as const).map(([value, label]) => <Button key={value} title={label} variant={responsibility === value ? 'primary' : 'secondary'} disabled={loading} onPress={() => { setResponsibility(value); setSigned(false); }} />)}</View>
        <Input label="Yapılan İşler" value={notes} onChangeText={value => { setNotes(value); setSigned(false); }} multiline maxLength={8000} editable={!loading} />
        <Input label="Servisi Yapan Teknisyen" value={technician} onChangeText={value => { setTechnician(value); setSigned(false); }} maxLength={255} editable={!loading} />
        <Input label="Teslim Alan Kişi" value={recipient} onChangeText={value => { setRecipient(value); setSigned(false); }} maxLength={255} editable={!loading} />
        <SignaturePad onChange={setSigned} />
        {!signed ? <Text style={styles.hint}>Bilgileri tamamladıktan sonra müşteri imzasını alın.</Text> : null}
        <Button title="İmzalı Formu Kaydet ve Servisi Kapat" onPress={() => void submit()} loading={loading} />
      </>}
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.accentRed },
  hint: { color: colors.textMuted, fontSize: 13 },
});
