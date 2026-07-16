import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { companyService, serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { deliveryFormData, deliveryStatusCode } from '@/src/ui/deliveries/deliveryHelpers';
import {
  DeliveryDetailFooter,
  DeliveryDetailHeader,
  DeliveryDetailTabs,
  DeliveryHeroCard,
  DeliveryInfoPanel,
  DeliveryMachinePanel,
  DeliveryTutanakPreview,
  type DeliveryDetailTab,
} from '@/src/ui/deliveries/DeliveryDetailWidgets';
import { Screen } from '@/src/ui/Screen';
import { colors, fonts, layout, spacing, typography } from '@/src/theme/tokens';

type Props = { id: string };

/** Stitch Teslimat Detay — `a7be4c1821214795b36e06f2d98bab30` */
export function DeliveryDetailScreen({ id }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DeliveryDetailTab>('ozet');

  const load = useCallback(async () => {
    try {
      const [deliveriesRes, companiesRes] = await Promise.all([
        serviceService.deliveries({ pageSize: 300 }),
        companyService.list({ pageSize: 500 }),
      ]);
      const companies = normalizeList(companiesRes);
      const byId = new Map(companies.map((c) => [String(c.id), c]));
      const found = normalizeList(deliveriesRes).find((r) => String(r.id) === id);
      if (!found) throw new Error('Teslimat bulunamadı');
      const companyId = String(found.companyId ?? '');
      const company = byId.get(companyId);
      setData(company ? { ...found, company } : found);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detay yüklenemedi');
    }
  }, [id]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const markCompleted = async () => {
    setActing(true);
    try {
      await serviceService.updateDeliveryStatus(id, 'completed');
      Alert.alert('Tamamlandı', 'Kurulum tutanağı tamamlandı olarak işaretlendi.');
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <Screen padded={false}>
        <DeliveryDetailHeader onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen padded={false}>
        <DeliveryDetailHeader onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'Kayıt bulunamadı'}</Text>
        </View>
      </Screen>
    );
  }

  const fd = deliveryFormData(data);
  const isPending = deliveryStatusCode(data) === 'pending';

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <DeliveryDetailHeader
        onBack={() => router.back()}
        onMore={() =>
          Alert.alert('İşlemler', undefined, [
            { text: 'Düzenle', onPress: () => router.push(`/forms/delivery?id=${id}`) },
            { text: 'İptal', style: 'cancel' },
          ])
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <DeliveryHeroCard data={data} />
        <DeliveryDetailTabs value={tab} onChange={setTab} />
        <View style={styles.tabBody}>
          {tab === 'ozet' ? (
            <View>
              <DeliveryInfoPanel label="İlgili Kişi" value={fd.ilgili?.trim() || '—'} />
              <DeliveryInfoPanel label="Kurulumu Yapan" value={fd.kurulumuYapan?.trim() || '—'} />
              <DeliveryInfoPanel label="Notlar" value={String(data.notes ?? '—')} />
            </View>
          ) : null}
          {tab === 'tezgah' ? <DeliveryMachinePanel data={data} /> : null}
          {tab === 'pdf' ? (
            <View>
              <DeliveryTutanakPreview data={data} />
              <Pressable
                style={styles.openFull}
                onPress={() => router.push(`/forms/kurulum-tutanagi?deliveryId=${id}`)}
              >
                <Text style={styles.openFullText}>Tam Ekran Önizleme</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <DeliveryDetailFooter
        primaryLabel={isPending ? 'İmza Al' : 'Tutanağı Aç'}
        onPrimary={() =>
          isPending
            ? router.push(`/forms/delivery-signature?id=${id}`)
            : router.push(`/forms/kurulum-tutanagi?deliveryId=${id}`)
        }
        secondaryLabel={isPending ? 'Tamamla' : 'Düzenle'}
        onSecondary={() =>
          isPending ? void markCompleted() : router.push(`/forms/delivery?id=${id}`)
        }
        loading={acting}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: layout.containerMargin },
  errorText: { ...typography.body, color: colors.error, textAlign: 'center' },
  scroll: { flex: 1, backgroundColor: colors.canvas },
  body: { paddingBottom: 120 },
  tabBody: { paddingHorizontal: layout.containerMargin, paddingTop: spacing.md },
  openFull: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
  },
  openFullText: { ...typography.label, color: colors.primary, fontFamily: fonts.semibold },
});
