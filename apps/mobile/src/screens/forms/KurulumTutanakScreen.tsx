import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { companyService, serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import {
  KurulumTutanakFooter,
  KurulumTutanakHeader,
  KurulumTutanakScroll,
  KurulumTutanakSubheader,
  KurulumTutanakZoomPill,
} from '@/src/ui/kurulum-tutanagi/KurulumTutanakWidgets';
import {
  tutanakFromDelivery,
  tutanakFromInstallation,
  type KurulumTutanakModel,
} from '@/src/ui/kurulum-tutanagi/kurulumTutanakModel';
import { Screen } from '@/src/ui/Screen';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

/** Stitch Kurulum Tutanağı v2 — `38c79ab94fde4f1383d14df3c5382514` */
export function KurulumTutanakScreen() {
  const { deliveryId, installationId } = useLocalSearchParams<{
    deliveryId?: string;
    installationId?: string;
  }>();
  const [model, setModel] = useState<KurulumTutanakModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  const load = useCallback(async () => {
    try {
      if (deliveryId) {
        const [deliveriesRes, companiesRes] = await Promise.all([
          serviceService.deliveries({ pageSize: 300 }),
          companyService.list({ pageSize: 500 }),
        ]);
        const companies = normalizeList(companiesRes);
        const byId = new Map(companies.map((c) => [String(c.id), c]));
        const found = normalizeList(deliveriesRes).find((r) => String(r.id) === deliveryId);
        if (!found) throw new Error('Teslimat bulunamadı');
        const company = byId.get(String(found.companyId ?? ''));
        setModel(tutanakFromDelivery(company ? { ...found, company } : found));
      } else if (installationId) {
        const [installationsRes, companiesRes] = await Promise.all([
          serviceService.installations({ pageSize: 300 }),
          companyService.list({ pageSize: 500 }),
        ]);
        const companies = normalizeList(companiesRes);
        const byId = new Map(companies.map((c) => [String(c.id), c]));
        const found = normalizeList(installationsRes).find((r) => String(r.id) === installationId);
        if (!found) throw new Error('Kurulum bulunamadı');
        const company = byId.get(String(found.companyId ?? ''));
        setModel(tutanakFromInstallation(company ? { ...found, company } : found));
      } else {
        throw new Error('Kayıt ID eksik');
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    }
  }, [deliveryId, installationId]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const shareText = () => {
    if (!model) return '';
    return [
      `KURULUM TUTANAĞI — ${model.formNo}`,
      model.subtitle,
      `Teslim: ${model.teslimTarihi} · Kurulum: ${model.kurulumTarihi}`,
      `Tezgah: ${model.tezgah.marka} ${model.tezgah.model} (${model.tezgah.seriNo})`,
      `Müşteri: ${model.musteri.firma}`,
    ].join('\n');
  };

  const onShare = async () => {
    try {
      await Share.share({ message: shareText(), title: 'Kurulum Tutanağı' });
    } catch {
      Alert.alert('Paylaşım', 'Paylaşım iptal edildi veya desteklenmiyor.');
    }
  };

  const onPdf = () => Alert.alert('PDF İndir', 'PDF dışa aktarma yakında eklenecek.');
  const onPrint = () => Alert.alert('Yazdır', 'AirPrint entegrasyonu yakında eklenecek.');
  const onEmail = () => Alert.alert('E-posta', 'E-posta gönderimi yakında eklenecek.');

  if (loading) {
    return (
      <Screen padded={false}>
        <KurulumTutanakHeader onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !model) {
    return (
      <Screen padded={false}>
        <KurulumTutanakHeader onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.error}>{error ?? 'Tutanak yüklenemedi'}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <KurulumTutanakHeader
        onBack={() => router.back()}
        onDownload={onPdf}
        onPrint={onPrint}
        onShare={() => void onShare()}
      />
      <KurulumTutanakSubheader model={model} />
      <KurulumTutanakScroll
        model={model}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(150, z + 10))}
        onZoomOut={() => setZoom((z) => Math.max(50, z - 10))}
      />
      <KurulumTutanakZoomPill
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(150, z + 10))}
        onZoomOut={() => setZoom((z) => Math.max(50, z - 10))}
      />
      <KurulumTutanakFooter onPdf={onPdf} onEmail={onEmail} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: layout.containerMargin },
  error: { ...typography.body, color: colors.error, textAlign: 'center' },
});
