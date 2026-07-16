import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { purchaseOrderService } from '@/src/api/services';
import {
  currencyCodeFromRow,
  linesFromPurchase,
  orderNoFromRow,
  statusCodeFromRow,
} from '@/src/ui/purchase/purchaseOrderHelpers';
import {
  PurchaseDetailFooter,
  PurchaseDetailHeader,
  PurchaseDetailTabs,
  PurchaseHeroCard,
  PurchaseInfoPanel,
  PurchaseLineCard,
  PurchaseTotalsPanel,
  type PurchaseDetailTab,
} from '@/src/ui/purchase/PurchaseOrderDetailWidgets';
import { Screen } from '@/src/ui/Screen';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';

type Props = { id: string };

export function PurchaseOrderDetailScreen({ id }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PurchaseDetailTab>('kalemler');

  const load = useCallback(async () => {
    try {
      const po = (await purchaseOrderService.get(id)) as Record<string, unknown>;
      setData(po);
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

  const onSend = async () => {
    setActing(true);
    try {
      await purchaseOrderService.send(id);
      Alert.alert('Gönderildi', 'Sipariş tedarikçiye gönderildi.');
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setActing(false);
    }
  };

  const onApprove = async () => {
    setActing(true);
    try {
      await purchaseOrderService.approve(id);
      Alert.alert('Onaylandı', 'Sipariş onaylandı.');
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Onaylanamadı');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <Screen padded={false}>
        <PurchaseDetailHeader title="Satın Alma" onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen padded={false}>
        <PurchaseDetailHeader title="Satın Alma" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'Kayıt bulunamadı'}</Text>
        </View>
      </Screen>
    );
  }

  const statusCode = statusCodeFromRow(data);
  const lines = linesFromPurchase(data);
  const currencyCode = currencyCodeFromRow(data);

  let primaryLabel: string | undefined;
  let onPrimary: (() => void) | undefined;
  if (statusCode === 'draft') {
    primaryLabel = 'Tedarikçiye Gönder';
    onPrimary = () => void onSend();
  } else if (statusCode === 'pending_manager_approval') {
    primaryLabel = 'Onayla';
    onPrimary = () => void onApprove();
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <PurchaseDetailHeader
        title={orderNoFromRow(data)}
        onBack={() => router.back()}
        onMore={() =>
          Alert.alert('İşlemler', undefined, [
            { text: 'Düzenle', onPress: () => router.push(`/forms/purchase-order?id=${id}`) },
            { text: 'İptal', style: 'cancel' },
          ])
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PurchaseHeroCard data={data} />
        <PurchaseDetailTabs value={tab} onChange={setTab} />

        {tab === 'kalemler' ? (
          <View style={styles.section}>
            {lines.length === 0 ? (
              <Text style={styles.empty}>Kalem bulunamadı</Text>
            ) : (
              lines.map((line, i) => (
                <PurchaseLineCard key={String(line.id ?? i)} row={line} currencyCode={currencyCode} />
              ))
            )}
            <PurchaseTotalsPanel data={data} />
          </View>
        ) : (
          <PurchaseInfoPanel data={data} />
        )}
      </ScrollView>

      <PurchaseDetailFooter
        secondaryLabel="Düzenle"
        onSecondary={() => router.push(`/forms/purchase-order?id=${id}`)}
        primaryLabel={primaryLabel}
        onPrimary={onPrimary}
        primaryLoading={acting}
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
