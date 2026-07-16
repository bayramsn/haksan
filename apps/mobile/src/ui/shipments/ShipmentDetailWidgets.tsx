import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildShipmentHistory,
  carrierFromRow,
  companyIdFromRow,
  companyNameFromRow,
  formatShipmentDate,
  formatShipmentDateTime,
  formatShipmentEta,
  linesFromShipment,
  routeLabelFromRow,
  SHIPMENT_STEPPER_STEPS,
  shipmentNoFromRow,
  shipmentStatusVisual,
  statusCodeFromRow,
  stepperIndexForStatus,
  trackingOrShipmentNoFromRow,
  type ShipmentHistoryEvent,
} from '@/src/ui/shipments/shipmentHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

/** Stitch Sevkiyat v3 — `825e9ad5` özet · `5e3310f6` kalemler · `8daf21bc` geçmiş */
export type ShipmentDetailTab = 'ozet' | 'kalemler' | 'gecmis';

export const SHIPMENT_DETAIL_TABS: { key: ShipmentDetailTab; label: string }[] = [
  { key: 'ozet', label: 'Özet' },
  { key: 'kalemler', label: 'Kalemler' },
  { key: 'gecmis', label: 'Geçmiş' },
];

export function ShipmentDetailHeader({
  onBack,
  onMore,
}: {
  onBack: () => void;
  onMore?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text style={styles.headerTitle}>Sevkiyat Detayı</Text>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.primary} />
        </Pressable>
      ) : (
        <View style={styles.headerBtn} />
      )}
    </View>
  );
}

export function ShipmentHeroCard({ data }: { data: Record<string, unknown> }) {
  const status = shipmentStatusVisual(data);
  const current = stepperIndexForStatus(statusCodeFromRow(data));
  const carrier = carrierFromRow(data);

  return (
    <View style={[styles.hero, shadowCard]}>
      <View style={styles.heroTop}>
        <View style={styles.heroMeta}>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusBadgeText, { color: status.fg }]}>{status.label}</Text>
          </View>
          <Text style={styles.heroShipmentNo}>{shipmentNoFromRow(data)}</Text>
          <Text style={styles.heroTracking}>Takip No: {trackingOrShipmentNoFromRow(data)}</Text>
        </View>
        <View style={styles.carrierChip}>
          <Text style={styles.carrierChipText}>{carrier.slice(0, 4).toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.stepperRow}>
        {SHIPMENT_STEPPER_STEPS.map((step, idx) => {
          const done = idx < current;
          const active = idx === current;
          return (
            <View key={step.code} style={styles.stepItem}>
              <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                {done ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : active ? (
                  <View style={styles.stepDotInnerActive} />
                ) : null}
              </View>
              <Text style={[styles.stepLabel, (done || active) && styles.stepLabelActive]} numberOfLines={1}>
                {step.label}
              </Text>
              {idx < SHIPMENT_STEPPER_STEPS.length - 1 ? (
                <View style={[styles.stepLine, done && styles.stepLineDone]} />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function ShipmentDetailTabs({
  value,
  onChange,
}: {
  value: ShipmentDetailTab;
  onChange: (v: ShipmentDetailTab) => void;
}) {
  return (
    <View style={styles.segmented}>
      {SHIPMENT_DETAIL_TABS.map((t) => {
        const active = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressFade(pressed)]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ShipmentOzetPanel({
  data,
  onCompanyPress,
}: {
  data: Record<string, unknown>;
  onCompanyPress?: () => void;
}) {
  const origin = String(data.origin ?? '—');
  const dest = String(data.destination ?? '—');
  const notes = String(data.notes ?? '').trim();

  return (
    <View style={styles.ozetStack}>
      <Pressable
        onPress={onCompanyPress}
        disabled={!onCompanyPress}
        style={({ pressed }) => [styles.linkCard, shadowCard, pressFade(pressed)]}
      >
        <View style={styles.linkIcon}>
          <Ionicons name="business-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.linkMeta}>
          <Text style={styles.linkLabel}>MÜŞTERİ</Text>
          <Text style={styles.linkValue}>{companyNameFromRow(data)}</Text>
        </View>
        {onCompanyPress ? <Ionicons name="chevron-forward" size={20} color={colors.primary} /> : null}
      </Pressable>

      <View style={[styles.routeCard, shadowCard]}>
        <View style={styles.routeEnds}>
          <RoutePoint label="Çıkış" place={origin} active={false} />
          <View style={styles.routeMid}>
            <View style={styles.routeTrack} />
            <View style={styles.routeTruck}>
              <Ionicons name="bus-outline" size={18} color={colors.primary} />
            </View>
          </View>
          <RoutePoint label="Varış" place={dest} active />
        </View>
      </View>

      <View style={styles.infoGrid}>
        <InfoTile label="Taşıyıcı" value={carrierFromRow(data)} />
        <InfoTile label="Incoterm" value={String(data.incoterm ?? '—')} />
        <InfoTile label="Sevk Tarihi" value={formatShipmentDate(data.shippedAt)} />
        <InfoTile label="ETA" value={formatShipmentEta(data)} accent />
      </View>

      {notes ? (
        <View style={[styles.notesCard, shadowCard]}>
          <View style={styles.notesHead}>
            <Ionicons name="document-text-outline" size={18} color={colors.primary} />
            <Text style={styles.notesTitle}>NOTLAR</Text>
          </View>
          <Text style={styles.notesBody}>{notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

function RoutePoint({ label, place, active }: { label: string; place: string; active: boolean }) {
  return (
    <View style={styles.routePoint}>
      <Text style={styles.routePointLabel}>{label}</Text>
      <View style={[styles.routePin, active && styles.routePinActive]}>
        <Ionicons name="location" size={16} color={active ? colors.primary : colors.onSurfaceVariant} />
      </View>
      <Text style={styles.routePlace} numberOfLines={2}>
        {place}
      </Text>
    </View>
  );
}

function InfoTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[styles.infoTile, shadowCard]}>
      <Text style={styles.infoTileLabel}>{label}</Text>
      <Text style={[styles.infoTileValue, accent && styles.infoTileAccent]}>{value}</Text>
    </View>
  );
}

export function ShipmentLinesHeader({ lines }: { lines: Record<string, unknown>[] }) {
  const totalQty = lines.reduce((sum, row) => sum + Number(row.quantity ?? 1), 0);
  return (
    <Text style={styles.linesHeader}>
      {lines.length} kalem · Toplam {totalQty} adet
    </Text>
  );
}

export function ShipmentLineCard({ row }: { row: Record<string, unknown> }) {
  const qty = Number(row.quantity ?? 1);
  const unit = String(row.unit ?? row.unitCode ?? 'adet');
  const serial = row.serialNumber ? String(row.serialNumber) : null;

  return (
    <View style={[styles.lineCard, shadowCard]}>
      <View style={styles.lineMeta}>
        <Text style={styles.lineTitle}>{String(row.description ?? 'Kalem')}</Text>
        {serial ? <Text style={styles.lineSerial}>S/N: {serial}</Text> : null}
      </View>
      <View style={styles.lineQtyChip}>
        <Text style={styles.lineQtyText}>
          {qty} {unit}
        </Text>
      </View>
    </View>
  );
}

export function ShipmentHistoryTimeline({ data }: { data: Record<string, unknown> }) {
  const events = buildShipmentHistory(data);

  if (events.length === 0) {
    return (
      <View style={[styles.emptyCard, shadowCard]}>
        <Text style={styles.emptyText}>Henüz durum geçmişi kaydı yok</Text>
      </View>
    );
  }

  return (
    <View style={[styles.timelineCard, shadowCard]}>
      {events.map((event, i) => (
        <ShipmentHistoryRow key={event.id} event={event} isLast={i === events.length - 1} />
      ))}
    </View>
  );
}

function ShipmentHistoryRow({ event, isLast }: { event: ShipmentHistoryEvent; isLast: boolean }) {
  const visual = shipmentStatusVisual({ statusCode: event.statusCode, status: { name: event.statusLabel } });

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineDot, { backgroundColor: visual.bg, borderColor: visual.fg }]}>
          <View style={[styles.timelineDotInner, { backgroundColor: visual.fg }]} />
        </View>
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.timelineBody}>
        <Text style={styles.timelineStatus}>{event.statusLabel}</Text>
        <Text style={styles.timelineDesc}>{event.description}</Text>
        <Text style={styles.timelineAt}>{formatShipmentDateTime(event.at)}</Text>
      </View>
    </View>
  );
}

export function ShipmentDetailFooter({
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  primaryLoading,
}: {
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  primaryLoading?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }, shadowCard]}>
      {secondaryLabel && onSecondary ? (
        <Pressable onPress={onSecondary} style={({ pressed }) => [styles.footerSecondary, pressFade(pressed)]}>
          <Ionicons name="sync-outline" size={18} color={colors.primary} />
          <Text style={styles.footerSecondaryText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
      {primaryLabel && onPrimary ? (
        <Pressable
          onPress={onPrimary}
          disabled={primaryLoading}
          style={({ pressed }) => [styles.footerPrimary, pressFade(pressed), primaryLoading && { opacity: 0.6 }]}
        >
          <Ionicons name="print-outline" size={18} color="#fff" />
          <Text style={styles.footerPrimaryText}>{primaryLabel}</Text>
        </Pressable>
      ) : null}
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
    backgroundColor: colors.card,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    ...typography.headlineMd,
    color: colors.primary,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroMeta: { flex: 1, gap: 4 },
  heroShipmentNo: { ...typography.headline, color: colors.textPrimary, fontFamily: fonts.bold },
  heroTracking: { ...typography.bodySm, color: colors.onSurfaceVariant },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusBadgeText: { ...typography.caption, fontFamily: fonts.bold, textTransform: 'uppercase' },
  carrierChip: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carrierChipText: { ...typography.caption, color: colors.primary, fontFamily: fonts.bold },
  stepperRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  stepItem: { alignItems: 'center', width: '23%', position: 'relative' },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
  },
  stepDotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepDotActive: { borderColor: colors.primary, backgroundColor: colors.card },
  stepDotInnerActive: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  stepLabel: { ...typography.caption, color: colors.onSurfaceVariant, marginTop: 6, textAlign: 'center' },
  stepLabelActive: { color: colors.primary, fontFamily: fonts.semibold },
  stepLine: {
    position: 'absolute',
    top: 11,
    left: '70%',
    width: '60%',
    height: 2,
    backgroundColor: colors.surfaceContainerHigh,
  },
  stepLineDone: { backgroundColor: colors.primary },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: 4,
  },
  segment: { flex: 1, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.card, ...shadowCard },
  segmentText: { ...typography.label, color: colors.onSurfaceVariant },
  segmentTextActive: { color: colors.primary, fontFamily: fonts.bold },
  ozetStack: { gap: spacing.sm },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkMeta: { flex: 1, gap: 2 },
  linkLabel: { ...typography.caption, color: colors.onSurfaceVariant, letterSpacing: 0.5 },
  linkValue: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  routeCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md },
  routeEnds: { flexDirection: 'row', alignItems: 'center' },
  routePoint: { width: '28%', alignItems: 'center', gap: 4 },
  routePointLabel: { ...typography.caption, color: colors.onSurfaceVariant, textTransform: 'uppercase' },
  routePin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routePinActive: { backgroundColor: colors.primarySoft },
  routePlace: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.bold, textAlign: 'center' },
  routeMid: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 32 },
  routeTrack: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: colors.surfaceContainerHigh,
    top: 15,
  },
  routeTruck: { backgroundColor: colors.card, paddingHorizontal: 4, zIndex: 1 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  infoTile: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  infoTileLabel: { ...typography.caption, color: colors.onSurfaceVariant, textTransform: 'uppercase' },
  infoTileValue: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  infoTileAccent: { color: colors.error },
  notesCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  notesHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  notesTitle: { ...typography.caption, color: colors.textPrimary, fontFamily: fonts.bold, letterSpacing: 0.5 },
  notesBody: { ...typography.bodySm, color: colors.onSurfaceVariant },
  linesHeader: { ...typography.label, color: colors.onSurfaceVariant, paddingHorizontal: 2 },
  lineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  lineMeta: { flex: 1, gap: 2 },
  lineTitle: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  lineSerial: { ...typography.caption, color: colors.onSurfaceVariant },
  lineQtyChip: {
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  lineQtyText: { ...typography.label, color: colors.textPrimary, fontFamily: fonts.semibold },
  timelineCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  timelineRow: { flexDirection: 'row', gap: spacing.sm },
  timelineRail: { width: 24, alignItems: 'center' },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotInner: { width: 6, height: 6, borderRadius: 3 },
  timelineLine: { flex: 1, width: 2, backgroundColor: colors.surfaceContainerHigh, marginVertical: 4 },
  timelineBody: { flex: 1, paddingBottom: spacing.md, gap: 2 },
  timelineStatus: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  timelineDesc: { ...typography.label, color: colors.onSurfaceVariant },
  timelineAt: { ...typography.caption, color: colors.outline, marginTop: 2 },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: { ...typography.bodySm, color: colors.onSurfaceVariant },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceContainerHigh,
  },
  footerSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  footerSecondaryText: { ...typography.label, color: colors.primary, fontFamily: fonts.bold },
  footerPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  footerPrimaryText: { ...typography.label, color: '#fff', fontFamily: fonts.bold },
});

export { companyIdFromRow, linesFromShipment };
