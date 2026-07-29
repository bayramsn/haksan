import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { serviceService } from '@/src/api/services';
import { Button } from '@/src/ui/Button';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { SectionTitle } from '@/src/ui/SectionTitle';
import { colors, radius, typography } from '@/src/theme/tokens';

const CHECKLIST = [
  'Makine sevkiyat alanı hazır',
  'Elektrik bağlantıları kontrol edildi',
  'Hidrolik yağ seviyesi uygun',
  'Test parçası işlendi',
  'Operatör eğitimi verildi',
  'Güvenlik etiketleri yerinde',
];

/** Stitch #52 Kurulum Check-list */
export function InstallationChecklistScreen() {
  const { installationId } = useLocalSearchParams<{ installationId?: string }>();
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!res.canceled && res.assets[0]?.uri) setPhotos((p) => [...p, res.assets[0].uri]);
  };

  const allDone = CHECKLIST.every((_, i) => checked[i]);

  const toggle = (i: number) => setChecked((c) => ({ ...c, [i]: !c[i] }));

  const submit = async () => {
    if (!installationId) {
      Alert.alert('Hata', 'Kurulum ID eksik');
      return;
    }
    if (!allDone) {
      Alert.alert('Eksik maddeler', 'Tüm checklist maddelerini işaretleyin');
      return;
    }
    setLoading(true);
    try {
      await serviceService.updateInstallationStatus(installationId, {
        statusCode: 'completed',
        installationDate: new Date().toISOString(),
      });
      Alert.alert('Başarılı', 'Kurulum tamamlandı', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormPageLayout title="Kurulum Checklist" subtitle={`Kurulum #${installationId ?? '—'}`}>
      {CHECKLIST.map((label, i) => (
        <Pressable key={label} style={[styles.row, checked[i] && styles.rowOn]} onPress={() => toggle(i)}>
          <View style={[styles.box, checked[i] && styles.boxOn]} />
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      ))}
      <SectionTitle title={`Kurulum Fotoğrafları (${photos.length})`} />
      <View style={styles.photos}>
        {photos.map((uri) => (
          <Image key={uri} source={{ uri }} style={styles.thumb} />
        ))}
        <Pressable style={styles.addPhoto} onPress={() => void pickPhoto()}>
          <Text style={styles.addPhotoText}>+ Foto</Text>
        </Pressable>
      </View>
      <Button title="Kurulumu Tamamla" onPress={() => void submit()} loading={loading} disabled={!allDone} />
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.headline, color: colors.textPrimary, marginBottom: 4 },
  sub: { color: colors.textMuted, marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  rowOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.border },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { flex: 1, fontSize: 15, color: colors.textPrimary },
  photoSection: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginTop: 12, marginBottom: 8 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
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
  addPhotoText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  btn: { marginTop: 16 },
});
