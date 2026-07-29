import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { ApiError } from '@/src/api/apiClient';
import { enqueueMutation } from '@/src/offline/queue';
import { Button } from '@/src/ui/Button';
import { Input } from '@/src/ui/Input';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { SectionTitle } from '@/src/ui/SectionTitle';
import { SignaturePad } from '@/src/ui/SignaturePad';
import { colors, typography } from '@/src/theme/tokens';

/** Stitch #51 Servis Tamamlama — imza + foto + offline kuyruk */
export function ServiceCompleteFormScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId?: string }>();
  const [notes, setNotes] = useState('');
  const [signed, setSigned] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [ticketLabel, setTicketLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) return;
    void serviceService.tickets({ pageSize: 300 }).then((res) => {
      const row = normalizeList(res).find((r) => String(r.id) === ticketId);
      if (row) setTicketLabel(String(row.ticketNo ?? row.subject ?? ticketId));
    });
  }, [ticketId]);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin gerekli', 'Kamera izni verin');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!res.canceled && res.assets[0]?.uri) {
      setPhotos((p) => [...p, res.assets[0].uri]);
    }
  };

  const complete = async () => {
    if (!ticketId) throw new Error('Servis talebi ID eksik');
    const resolutionNotes = [notes || 'Mobil tamamlandı', photos.length ? `${photos.length} fotoğraf eklendi` : '']
      .filter(Boolean)
      .join(' · ');
    await serviceService.update(ticketId, { resolutionNotes });
    await serviceService.updateTicketStatus(ticketId, 'completed', 'closed');
  };

  const submit = async () => {
    if (!ticketId) {
      Alert.alert('Hata', 'Servis talebi ID eksik');
      return;
    }
    if (!signed) {
      Alert.alert('İmza gerekli', 'Lütfen müşteri imzasını alın');
      return;
    }
    setLoading(true);
    try {
      await complete();
      Alert.alert('Başarılı', 'Servis tamamlandı', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (e) {
      const offline = e instanceof ApiError ? e.status >= 500 || e.status === 0 : e instanceof TypeError;
      if (offline) {
        await enqueueMutation({
          kind: 'service-complete',
          payload: { ticketId, notes: notes || 'Mobil tamamlandı (offline)' },
        });
        Alert.alert('Offline kaydedildi', 'Bağlantı gelince otomatik gönderilecek', [
          { text: 'Tamam', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Hata', e instanceof Error ? e.message : 'Tamamlanamadı');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormPageLayout title="Servis Tamamlama" subtitle={`Talep: ${ticketLabel ?? ticketId ?? '—'}`}>
      <Input label="Çözüm Notları" value={notes} onChangeText={setNotes} multiline />
      <SectionTitle title="Fotoğraflar" />
      <View style={styles.photos}>
        {photos.map((uri) => (
          <Image key={uri} source={{ uri }} style={styles.thumb} />
        ))}
        <Pressable style={styles.addPhoto} onPress={() => void pickPhoto()}>
          <Text style={styles.addPhotoText}>+ Fotoğraf</Text>
        </Pressable>
      </View>
      <SignaturePad onChange={() => setSigned(true)} />
      <Button title="Tamamla ve İmzala" onPress={() => void submit()} loading={loading} />
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.headline, color: colors.textPrimary, marginBottom: 4 },
  sub: { color: colors.textMuted, marginBottom: 16 },
  section: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  addPhoto: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: { fontSize: 11, color: colors.primary, fontWeight: '600', textAlign: 'center' },
  btn: { marginTop: 16 },
});
