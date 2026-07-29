import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { serviceService } from '@/src/api/services';
import {
  companyIdFromRow,
  linesFromShipment,
  statusCodeFromRow,
} from '@/src/ui/shipments/shipmentHelpers';
import {
  ShipmentDetailFooter,
  ShipmentDetailHeader,
  ShipmentDetailTabs,
  ShipmentHeroCard,
  ShipmentHistoryTimeline,
  ShipmentLineCard,
  ShipmentLinesHeader,
  ShipmentOzetPanel,
  type ShipmentDetailTab,
} from '@/src/ui/shipments/ShipmentDetailWidgets';
import { ShipmentStatusSheet } from '@/src/ui/shipments/ShipmentStatusSheet';
import { Screen } from '@/src/ui/Screen';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

type Props = { id: string };

/** Stitch Sevkiyat v3 — `825e9ad5` özet · `5e3310f6` kalemler · `8daf21bc` geçmiş */
export function ShipmentDetailScreen({ id }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ShipmentDetailTab>('ozet');
  const [statusOpen, setStatusOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const row = (await serviceService.shipment(id)) as Record<string, unknown>;
      setData(row);
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

  const onStatusSelect = async (statusCode: string) => {
    if (statusCode === statusCodeFromRow(data ?? {})) {
      setStatusOpen(false);
      return;
    }
    setActing(true);
    try {
      await serviceService.updateShipmentStatus(id, statusCode);
      setStatusOpen(false);
      Alert.alert('Güncellendi', 'Sevkiyat durumu kaydedildi.');
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Durum güncellenemedi');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <Screen padded={false}>
        <ShipmentDetailHeader onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen padded={false}>
        <ShipmentDetailHeader onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'Kayıt bulunamadı'}</Text>
        </View>
      </Screen>
    );
  }

  const lines = linesFromShipment(data);
  const delivered = statusCodeFromRow(data) === 'delivered';
  const companyId = companyIdFromRow(data);

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <ShipmentDetailHeader
        onBack={() => router.back()}
        onMore={() =>
          Alert.alert('İşlemler', undefined, [
            {
              text: 'İrsaliye Önizle',
              onPress: () => router.push(`/forms/shipment-dispatch?shipmentId=${id}`),
            },
            { text: 'İptal', style: 'cancel' },
          ])
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ShipmentHeroCard data={data} />
        <ShipmentDetailTabs value={tab} onChange={setTab} />

        {tab === 'ozet' ? (
          <ShipmentOzetPanel
            data={data}
            onCompanyPress={
              companyId ? () => router.push(`/modules/customers/${companyId}`) : undefined
            }
          />
        ) : tab === 'kalemler' ? (
          <View style={styles.section}>
            <ShipmentLinesHeader lines={lines} />
            {lines.length === 0 ? (
              <Text style={styles.empty}>Paket kalemi bulunamadı</Text>
            ) : (
              lines.map((line, i) => <ShipmentLineCard key={String(line.id ?? i)} row={line} />)
            )}
          </View>
        ) : (
          <ShipmentHistoryTimeline data={data} />
        )}
      </ScrollView>

      <ShipmentDetailFooter
        secondaryLabel={delivered ? undefined : 'Durum Güncelle'}
        onSecondary={delivered ? undefined : () => setStatusOpen(true)}
        primaryLabel="İrsaliye Yazdır"
        onPrimary={() => router.push(`/forms/shipment-dispatch?shipmentId=${id}`)}
        primaryLoading={acting}
      />

      <ShipmentStatusSheet
        visible={statusOpen}
        data={data}
        loading={acting}
        onClose={() => setStatusOpen(false)}
        onSelect={(code) => void onStatusSelect(code)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
    paddingBottom: 120,
    gap: spacing.lg,
    backgroundColor: colors.canvas,
  },
  section: { gap: spacing.sm },
  empty: { ...typography.bodySm, color: colors.onSurfaceVariant, paddingVertical: spacing.md },
  errorText: { color: colors.error },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
