import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  currencyCodeFromRow,
  formatExpectedDate,
  formatPurchaseMoney,
  grandTotalFromRow,
  linesFromPurchase,
  orderNoFromRow,
  purchaseStatusVisual,
  statusCodeFromRow,
  supplierNameFromRow,
} from '@/src/ui/purchase/purchaseOrderHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export type PurchaseDetailTab = 'kalemler' | 'bilgi';

export const PURCHASE_DETAIL_TABS: { key: PurchaseDetailTab; label: string }[] = [
  { key: 'kalemler', label: 'Kalemler' },
  { key: 'bilgi', label: 'Bilgi' },
];

export function PurchaseDetailHeader({
  title,
  onBack,
  onMore,
}: {
  title: string;
  onBack: () => void;
  onMore?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
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

export function PurchaseHeroCard({ data }: { data: Record<string, unknown> }) {
  const status = purchaseStatusVisual(data);
  const supplier = supplierNameFromRow(data);

  return (
    <View style={[styles.hero, shadowCard]}>
      <View style={styles.heroTop}>
        <View style={styles.heroIcon}>
          <Ionicons name="cart-outline" size={28} color={colors.onPrimaryContainer} />
        </View>
        <View style={styles.heroMeta}>
          <Text style={styles.heroSupplier}>{supplier}</Text>
          <Text style={styles.heroOrderNo}>{orderNoFromRow(data)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusBadgeText, { color: status.fg }]}>{status.label}</Text>
        </View>
      </View>
      <View style={styles.heroStats}>
        <View style={styles.heroStat}>
          <Text style={styles.heroStatLabel}>Toplam</Text>
          <Text style={styles.heroStatValue}>{formatPurchaseMoney(data)}</Text>
        </View>
        <View style={styles.heroDivider} />
        <View style={styles.heroStat}>
          <Text style={styles.heroStatLabel}>Termin</Text>
          <Text style={styles.heroStatValue}>{formatExpectedDate(data)}</Text>
        </View>
      </View>
    </View>
  );
}

export function PurchaseDetailTabs({
  value,
  onChange,
}: {
  value: PurchaseDetailTab;
  onChange: (v: PurchaseDetailTab) => void;
}) {
  return (
    <View style={styles.tabRow}>
      {PURCHASE_DETAIL_TABS.map((t) => {
        const active = t.key === value;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} style={styles.tabBtn}>
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            {active ? <View style={styles.tabUnderline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function PurchaseLineCard({
  row,
  currencyCode,
}: {
  row: Record<string, unknown>;
  currencyCode: string;
}) {
  const qty = Number(row.quantity ?? 1);
  const unitPrice = Number(row.unitPrice ?? 0);
  const total = qty * unitPrice;
  const moneyRow = { currencyCode, grandTotal: total };

  return (
    <View style={[styles.lineCard, shadowCard]}>
      <Text style={styles.lineTitle}>{String(row.description ?? 'Kalem')}</Text>
      <Text style={styles.lineSub}>
        {qty} {String(row.unitCode ?? 'adet')} × {formatPurchaseMoney(moneyRow, unitPrice)}
      </Text>
      <Text style={styles.lineTotal}>{formatPurchaseMoney(moneyRow, total)}</Text>
    </View>
  );
}

export function PurchaseInfoPanel({ data }: { data: Record<string, unknown> }) {
  const rows = [
    { label: 'Sipariş Tarihi', value: formatDateField(data.orderDate) },
    { label: 'Beklenen Tarih', value: formatDateField(data.expectedDate) },
    { label: 'Para Birimi', value: currencyCodeFromRow(data) },
    { label: 'Ödeme Tipi', value: paymentTypeLabel(data) },
    { label: 'INCOTERMS', value: String(data.incoterm ?? '—') },
    { label: 'Sevkiyat Ref.', value: String(data.shipmentReference ?? '—') },
    { label: 'Notlar', value: String(data.notes ?? '—') },
  ];

  return (
    <View style={[styles.infoCard, shadowCard]}>
      {rows.map((row, i) => (
        <View key={row.label} style={[styles.infoRow, i < rows.length - 1 && styles.infoRowBorder]}>
          <Text style={styles.infoLabel}>{row.label}</Text>
          <Text style={styles.infoValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function PurchaseTotalsPanel({ data }: { data: Record<string, unknown> }) {
  const subtotal = Number(data.subtotal ?? 0);
  const vat = Number(data.vatTotal ?? data.taxTotal ?? 0);
  const total = grandTotalFromRow(data);

  return (
    <View style={[styles.totalsCard, shadowCard]}>
      <View style={styles.totalsRow}>
        <Text style={styles.totalsLabel}>Ara Toplam</Text>
        <Text style={styles.totalsValue}>{formatPurchaseMoney(data, subtotal)}</Text>
      </View>
      <View style={styles.totalsRow}>
        <Text style={styles.totalsLabel}>KDV</Text>
        <Text style={styles.totalsValue}>{formatPurchaseMoney(data, vat)}</Text>
      </View>
      <View style={styles.totalsDivider} />
      <View style={styles.totalsRow}>
        <Text style={styles.totalsTotalLabel}>TOPLAM</Text>
        <Text style={styles.totalsTotalValue}>{formatPurchaseMoney(data, total)}</Text>
      </View>
    </View>
  );
}

export function PurchaseDetailFooter({
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
          <Text style={styles.footerSecondaryText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
      {primaryLabel && onPrimary ? (
        <Pressable
          onPress={onPrimary}
          disabled={primaryLoading}
          style={({ pressed }) => [styles.footerPrimary, pressFade(pressed), primaryLoading && { opacity: 0.6 }]}
        >
          <Text style={styles.footerPrimaryText}>{primaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function formatDateField(value: unknown): string {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR');
}

function paymentTypeLabel(data: Record<string, unknown>): string {
  const code = String(data.paymentType ?? '');
  const days = data.paymentTermDays;
  if (code === 'cash') return 'Peşin';
  if (code === 'term') {
    const n = Number(days);
    return Number.isFinite(n) && n > 0 ? `Vadeli (${n} gün)` : 'Vadeli';
  }
  if (code === 'leasing') return 'Leasing';
  return code || '—';
}

export { linesFromPurchase, statusCodeFromRow };

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
  headerTitle: { flex: 1, ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold, textAlign: 'center' },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMeta: { flex: 1, gap: 4 },
  heroSupplier: { ...typography.headlineMd, color: colors.textPrimary },
  heroOrderNo: { ...typography.label, color: colors.outline },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusBadgeText: { ...typography.caption, fontFamily: fonts.bold, textTransform: 'uppercase' },
  heroStats: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, gap: 4 },
  heroStatLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  heroStatValue: { ...typography.headlineMd, color: colors.onPrimaryContainer, fontFamily: fonts.bold },
  heroDivider: { width: 1, height: 36, backgroundColor: colors.surfaceContainerHigh, marginHorizontal: spacing.sm },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHigh,
  },
  tabBtn: { paddingBottom: spacing.sm },
  tabText: { ...typography.label, color: colors.secondary },
  tabTextActive: { color: colors.primary, fontFamily: fonts.semibold },
  tabUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.primary,
  },
  lineCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  lineTitle: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  lineSub: { ...typography.label, color: colors.onSurfaceVariant },
  lineTotal: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.bold, marginTop: 4 },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  infoRow: { padding: spacing.md, gap: 4 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerLow },
  infoLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  infoValue: { ...typography.bodySm, color: colors.textPrimary },
  totalsCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalsLabel: { ...typography.bodySm, color: colors.onSurfaceVariant },
  totalsValue: { ...typography.bodySm, color: colors.onSurfaceVariant },
  totalsDivider: { height: 1, backgroundColor: colors.outlineVariant, marginVertical: spacing.xs },
  totalsTotalLabel: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  totalsTotalValue: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerLow,
  },
  footerSecondary: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerSecondaryText: { ...typography.headlineMd, color: colors.primary },
  footerPrimary: {
    flex: 1.4,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerPrimaryText: { ...typography.headlineMd, color: '#fff' },
});
