import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { calendarService, inventoryService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';
import { Button } from '@/src/ui/Button';
import { FormPageLayout } from '@/src/ui/FormPageLayout';
import { InfoCard } from '@/src/ui/DetailLayout';
import { SectionTitle } from '@/src/ui/SectionTitle';
import { colors, layout, spacing, typography } from '@/src/theme/tokens';
import { cardElevated } from '@/src/theme/styles';

/** Stitch #53 Bakım Planı Detay & Takvim */
export function MaintenancePlanScreen() {
  const { deviceId } = useLocalSearchParams<{ deviceId?: string }>();
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [device, setDevice] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const to = new Date(now.getFullYear(), now.getMonth() + 6, 0).toISOString();
      const rows = await calendarService.events({ from, to });
      const filtered = (rows as unknown as Record<string, unknown>[]).filter(
        (e) => e.eventType === 'task' || String(e.title ?? '').toLowerCase().includes('bakım')
      );
      setEvents(filtered);

      if (deviceId) {
        const devices = await inventoryService.customerDevices({ pageSize: 300 });
        const found = normalizeList(devices).find((d) => String(d.id) === deviceId);
        if (found) setDevice(found);
      }
      setLoading(false);
    })();
  }, [deviceId]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return (
    <FormPageLayout
      title="Bakım Planı"
      subtitle={device ? String(device.serialNumber ?? device.modelName ?? '') : deviceId}
    >
      {device ? (
        <View style={styles.deviceCard}>
          <InfoCard label="Seri No" value={String(device.serialNumber ?? '—')} />
          <InfoCard label="Model" value={String(device.modelName ?? device.modelCode ?? '—')} />
          <InfoCard label="Garanti Bitiş" value={String(device.warrantyEndDate ?? '—')} />
        </View>
      ) : null}
      <Button
        title="Yeni Bakım Etkinliği"
        variant="secondary"
        onPress={() => router.push(`/forms/calendar-event?companyId=${String(device?.companyId ?? '')}`)}
      />
      <SectionTitle title="Planlanan Etkinlikler" />
      {events.length === 0 ? (
        <Text style={styles.empty}>Planlanmış bakım etkinliği yok</Text>
      ) : (
        events.map((e) => (
          <InfoCard
            key={String(e.id)}
            label={String(e.startsAt ?? '').slice(0, 10)}
            value={`${String(e.title ?? 'Bakım')} · ${String(e.location ?? 'Saha')}`}
          />
        ))
      )}
      <View style={styles.legend}>
        <Text style={styles.legendText}>Takvimdeki bakım ve görev etkinlikleri listelenir.</Text>
      </View>
    </FormPageLayout>
  );
}

const styles = StyleSheet.create({
  deviceCard: { gap: spacing.sm },
  empty: { ...typography.bodySm, color: colors.textMuted, paddingVertical: spacing.xxl, textAlign: 'center' },
  legend: { ...cardElevated, padding: layout.screenPadding, backgroundColor: colors.primarySoft, borderColor: 'transparent' },
  legendText: { ...typography.bodySm, color: colors.primary },
});
