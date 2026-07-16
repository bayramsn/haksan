import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { deliveryCompanyName, deliveryFormNo } from '@/src/ui/deliveries/deliveryHelpers';
import { Button } from '@/src/ui/Button';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { Input } from '@/src/ui/Input';
import { SignaturePad } from '@/src/ui/SignaturePad';
import { colors, spacing, typography } from '@/src/theme/tokens';

/** Stitch Teslimat İmza — `c45226230b6143389b0764bbe949688d` */
export function DeliverySignatureScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [signedBy, setSignedBy] = useState('');
  const [signed, setSigned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subtitle, setSubtitle] = useState('');

  useEffect(() => {
    if (!id) return;
    void serviceService.deliveries({ pageSize: 300 }).then((res) => {
      const row = normalizeList(res).find((r) => String(r.id) === id);
      if (!row) return;
      setSubtitle(`${deliveryFormNo(row)} · ${deliveryCompanyName(row)}`);
      const name = String(row.signedBy ?? '').trim();
      if (name && name !== '—') setSignedBy(name);
    });
  }, [id]);

  const submit = async () => {
    if (!id) {
      Alert.alert('Hata', 'Teslimat ID eksik');
      return;
    }
    if (!signedBy.trim()) {
      Alert.alert('Hata', 'Teslim alan kişi adını girin');
      return;
    }
    if (!signed) {
      Alert.alert('İmza gerekli', 'Müşteri imzasını alın');
      return;
    }
    setLoading(true);
    try {
      await serviceService.updateDelivery(id, { signedBy: signedBy.trim() });
      await serviceService.updateDeliveryStatus(id, 'completed');
      Alert.alert('Başarılı', 'Kurulum tutanağı imzalandı ve tamamlandı', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormPageLayout title="İmza Al" subtitle={subtitle || 'Kurulum tutanağı'}>
      <Text style={styles.hint}>Tezgahı teslim alan müşteri temsilcisinin imzasını alın.</Text>
      <Input label="Teslim Alan (Ad Soyad)" value={signedBy} onChangeText={setSignedBy} placeholder="Ad Soyad" />
      <View style={styles.padWrap}>
        <SignaturePad onChange={(has) => has && setSigned(true)} />
      </View>
      <Button title="İmzayı Kaydet ve Tamamla" onPress={() => void submit()} loading={loading} disabled={!signed} />
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  hint: { ...typography.bodySm, color: colors.onSurfaceVariant, marginBottom: spacing.sm },
  padWrap: { minHeight: 200, marginVertical: spacing.md },
});
