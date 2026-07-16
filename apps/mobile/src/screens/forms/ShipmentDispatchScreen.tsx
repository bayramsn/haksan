import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { serviceService } from '@/src/api/services';
import {
  carrierFromRow,
  companyNameFromRow,
  formatShipmentDate,
  formatShipmentEta,
  linesFromShipment,
  routeLabelFromRow,
  shipmentNoFromRow,
  shipmentStatusVisual,
  trackingOrShipmentNoFromRow,
} from '@/src/ui/shipments/shipmentHelpers';
import { Screen } from '@/src/ui/Screen';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

/** Stitch Sevkiyat v3 — `425765f529a04bd3bdf1c31165ae4aeb` */
export function ShipmentDispatchScreen() {
  const { shipmentId } = useLocalSearchParams<{ shipmentId: string }>();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shipmentId) return;
    try {
      const row = (await serviceService.shipment(shipmentId)) as Record<string, unknown>;
      setData(row);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    }
  }, [shipmentId]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const shareText = useMemo(() => {
    if (!data) return '';
    const lines = linesFromShipment(data);
    const itemLines = lines
      .map((l, i) => {
        const qty = Number(l.quantity ?? 1);
        const unit = String(l.unit ?? 'adet');
        const sn = l.serialNumber ? ` (SN: ${l.serialNumber})` : '';
        return `${i + 1}. ${String(l.description ?? 'Kalem')}${sn} — ${qty} ${unit}`;
      })
      .join('\n');

    return [
      'SEVK İRSALİYESİ',
      '—'.repeat(24),
      `Sevkiyat No: ${shipmentNoFromRow(data)}`,
      `Takip No: ${trackingOrShipmentNoFromRow(data)}`,
      `Müşteri: ${companyNameFromRow(data)}`,
      `Güzergâh: ${routeLabelFromRow(data)}`,
      `Taşıyıcı: ${carrierFromRow(data)}`,
      `INCOTERMS: ${String(data.incoterm ?? '—')}`,
      `Çıkış: ${formatShipmentDate(data.shippedAt)}`,
      `Tahmini Varış: ${formatShipmentEta(data)}`,
      '',
      'KALEMLER',
      itemLines || '—',
      '',
      `Not: ${String(data.notes ?? '—')}`,
    ].join('\n');
  }, [data]);

  const onShare = async () => {
    try {
      await Share.share({ message: shareText, title: `İrsaliye — ${shipmentNoFromRow(data ?? {})}` });
    } catch {
      /* kullanıcı iptal */
    }
  };

  if (loading) {
    return (
      <Screen padded={false}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>İrsaliye Önizleme</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen padded={false}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>İrsaliye Önizleme</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.center}>
          <Text style={styles.error}>{error ?? 'Kayıt bulunamadı'}</Text>
        </View>
      </Screen>
    );
  }

  const status = shipmentStatusVisual(data);
  const lines = linesFromShipment(data);

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
          <Ionicons name="close" size={24} color={colors.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>İrsaliye Önizleme</Text>
        <Pressable onPress={() => void onShare()} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
          <Ionicons name="share-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.doc, shadowCard]}>
          <View style={styles.docHeader}>
            <Text style={styles.docBrand}>HAKSAN MAKİNA</Text>
            <Text style={styles.docType}>SEVK İRSALİYESİ</Text>
          </View>

          <View style={styles.docMeta}>
            <View style={styles.docMetaCol}>
              <Text style={styles.metaLabel}>Sevkiyat No</Text>
              <Text style={styles.metaValue}>{shipmentNoFromRow(data)}</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
              <Text style={[styles.statusText, { color: status.fg }]}>{status.label}</Text>
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Alıcı</Text>
            <Text style={styles.blockValue}>{companyNameFromRow(data)}</Text>
          </View>

          <View style={styles.grid}>
            <DocField label="Takip No" value={trackingOrShipmentNoFromRow(data)} />
            <DocField label="Taşıyıcı" value={carrierFromRow(data)} />
            <DocField label="Güzergâh" value={routeLabelFromRow(data)} />
            <DocField label="INCOTERMS" value={String(data.incoterm ?? '—')} />
            <DocField label="Çıkış Tarihi" value={formatShipmentDate(data.shippedAt)} />
            <DocField label="Tahmini Varış" value={formatShipmentEta(data)} />
          </View>

          <Text style={styles.tableTitle}>Kalemler</Text>
          {lines.length === 0 ? (
            <Text style={styles.emptyLine}>Kalem yok</Text>
          ) : (
            lines.map((line, i) => (
              <View key={String(line.id ?? i)} style={styles.tableRow}>
                <Text style={styles.tableIdx}>{i + 1}</Text>
                <View style={styles.tableBody}>
                  <Text style={styles.tableDesc}>{String(line.description ?? 'Kalem')}</Text>
                  {line.serialNumber ? (
                    <Text style={styles.tableSub}>SN: {String(line.serialNumber)}</Text>
                  ) : null}
                </View>
                <Text style={styles.tableQty}>
                  {Number(line.quantity ?? 1)} {String(line.unit ?? 'adet')}
                </Text>
              </View>
            ))
          )}

          {data.notes ? (
            <View style={styles.notes}>
              <Text style={styles.blockTitle}>Notlar</Text>
              <Text style={styles.notesText}>{String(data.notes)}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }, shadowCard]}>
        <Pressable onPress={() => void onShare()} style={({ pressed }) => [styles.shareBtn, pressFade(pressed)]}>
          <Ionicons name="share-social-outline" size={20} color="#fff" />
          <Text style={styles.shareBtnText}>Paylaş</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function DocField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
    backgroundColor: colors.canvas,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  scroll: {
    padding: layout.containerMargin,
    paddingBottom: 100,
    backgroundColor: colors.surfaceContainerLow,
  },
  doc: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  docHeader: { alignItems: 'center', gap: 4, paddingBottom: spacing.sm, borderBottomWidth: 2, borderBottomColor: colors.primary },
  docBrand: { ...typography.caption, color: colors.primary, fontFamily: fonts.bold, letterSpacing: 1 },
  docType: { ...typography.headlineMd, color: colors.textPrimary, fontFamily: fonts.bold },
  docMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  docMetaCol: { gap: 2 },
  metaLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  metaValue: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { ...typography.caption, fontFamily: fonts.bold, textTransform: 'uppercase' },
  block: { gap: 4 },
  blockTitle: { ...typography.caption, color: colors.onSurfaceVariant, textTransform: 'uppercase' },
  blockValue: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { width: '47%', gap: 2 },
  fieldValue: { ...typography.label, color: colors.textPrimary },
  tableTitle: { ...typography.caption, color: colors.onSurfaceVariant, textTransform: 'uppercase', marginTop: spacing.xs },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceContainerHigh,
  },
  tableIdx: { ...typography.caption, color: colors.outline, width: 20 },
  tableBody: { flex: 1, gap: 2 },
  tableDesc: { ...typography.bodySm, color: colors.textPrimary },
  tableSub: { ...typography.caption, color: colors.onSurfaceVariant },
  tableQty: { ...typography.label, color: colors.primary, fontFamily: fonts.semibold },
  emptyLine: { ...typography.bodySm, color: colors.onSurfaceVariant },
  notes: { gap: 4, marginTop: spacing.sm },
  notesText: { ...typography.bodySm, color: colors.textPrimary },
  footer: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    backgroundColor: colors.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceContainerHigh,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  shareBtnText: { ...typography.label, color: '#fff', fontFamily: fonts.bold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.error },
});
