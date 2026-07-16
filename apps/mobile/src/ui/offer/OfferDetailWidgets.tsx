import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatOfferMoney } from '@/src/ui/offer/OfferFormWidgets';
import {
  companyNameFromRow,
  currencyCodeFromRow,
  documentNoFromRow,
  formatQuoteMoney,
  lineItemQuantity,
  lineItemTotal,
  lineItemUnitPrice,
  offerStatusVisual,
  revisionFromRow,
  unitLabelFromItem,
  validityLabelFromRow,
} from '@/src/ui/offer/offerHelpers';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export type OfferDetailTab = 'kalemler' | 'kosullar' | 'aktivite' | 'revizyonlar' | 'pdf';

export const OFFER_DETAIL_TABS: { key: OfferDetailTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'kalemler', label: 'Kalemler', icon: 'list' },
  { key: 'kosullar', label: 'Koşullar', icon: 'document-text-outline' },
  { key: 'aktivite', label: 'Aktivite', icon: 'time-outline' },
  { key: 'revizyonlar', label: 'Revizyonlar', icon: 'git-branch-outline' },
  { key: 'pdf', label: 'PDF', icon: 'document-outline' },
];

export function OfferDetailHeader({
  title,
  onBack,
  onShare,
  onMore,
}: {
  title: string;
  onBack: () => void;
  onShare?: () => void;
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
      <View style={styles.headerActions}>
        {onShare ? (
          <Pressable onPress={onShare} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
            <Ionicons name="share-outline" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
        {onMore ? (
          <Pressable onPress={onMore} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
            <Ionicons name="ellipsis-vertical" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function OfferHeroCard({
  data,
  title,
  onCompanyPress,
}: {
  data: Record<string, unknown>;
  title?: string;
  onCompanyPress?: () => void;
}) {
  const status = offerStatusVisual(data);
  const company = companyNameFromRow(data);
  const rev = revisionFromRow(data);
  const quoteTitle =
    title ||
    String(data.notes ?? '').trim().split('\n')[0] ||
    `Teklif v${rev}`;

  return (
    <View style={[styles.heroCard, shadowCard]}>
      <View style={styles.heroTop}>
        <Pressable onPress={onCompanyPress} style={styles.companyLink} disabled={!onCompanyPress}>
          <Text style={styles.companyName} numberOfLines={1}>
            {company}
          </Text>
          {onCompanyPress ? <Ionicons name="chevron-forward" size={18} color={colors.outline} /> : null}
        </Pressable>
        <View style={[styles.statusPill, { backgroundColor: colors.secondaryContainer }]}>
          <Ionicons name="send" size={12} color={colors.onSecondaryContainer} />
          <Text style={styles.statusPillText}>{status.label}</Text>
        </View>
      </View>
      <Text style={styles.heroTitle} numberOfLines={2}>
        {quoteTitle}
      </Text>
      <View style={styles.validityRow}>
        <Ionicons name="time-outline" size={14} color={colors.outline} />
        <Text style={styles.validityText}>{validityLabelFromRow(data)}</Text>
        {rev > 1 ? <Text style={styles.revText}>· v{rev}</Text> : null}
      </View>
    </View>
  );
}

export function OfferDetailTotalsPanel({ data }: { data: Record<string, unknown> }) {
  const currency = currencyCodeFromRow(data);
  const subtotal = Number(data.subtotal ?? 0);
  const vatAmount = Number(data.vatAmount ?? 0);
  const grandTotal = Number(data.grandTotal ?? 0);
  const vatRate = Number(data.vatRate ?? 20);

  return (
    <View style={[styles.totalsCard, shadowCard]}>
      <View style={styles.totalsRow}>
        <Text style={styles.totalsLabel}>KDV Hariç</Text>
        <Text style={styles.totalsValue}>{formatOfferMoney(subtotal, currency)}</Text>
      </View>
      <View style={[styles.totalsRow, styles.totalsRowBorder]}>
        <Text style={styles.totalsLabel}>KDV %{vatRate}</Text>
        <Text style={styles.totalsValue}>{formatOfferMoney(vatAmount, currency)}</Text>
      </View>
      <View style={styles.totalsRow}>
        <Text style={styles.totalsGrandLabel}>TOPLAM</Text>
        <Text style={styles.totalsGrandValue}>{formatQuoteMoney(data, grandTotal)}</Text>
      </View>
    </View>
  );
}

export function OfferDetailTabBar({
  value,
  onChange,
}: {
  value: OfferDetailTab;
  onChange: (tab: OfferDetailTab) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
      {OFFER_DETAIL_TABS.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.tabChip, active && styles.tabChipActive]}
          >
            <Ionicons name={tab.icon} size={16} color={active ? '#fff' : colors.onSurfaceVariant} />
            <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function OfferLineReadCard({
  item,
  currencyCode,
}: {
  item: Record<string, unknown>;
  currencyCode: string;
}) {
  const qty = lineItemQuantity(item);
  const unit = unitLabelFromItem(item);
  const unitPrice = lineItemUnitPrice(item);
  const total = lineItemTotal(item);
  const description = String(item.description ?? item.productName ?? 'Kalem');

  return (
    <View style={[styles.lineReadCard, shadowCard]}>
      <Text style={styles.lineReadTitle} numberOfLines={2}>
        {description}
      </Text>
      <View style={styles.lineReadFooter}>
        <Text style={styles.lineReadMeta}>
          {qty} {unit} x {formatOfferMoney(unitPrice, currencyCode)}
        </Text>
        <Text style={styles.lineReadTotal}>{formatOfferMoney(total, currencyCode)}</Text>
      </View>
    </View>
  );
}

export function OfferTermsBlock({ data }: { data: Record<string, unknown> }) {
  const terms = (data.terms as Record<string, unknown> | undefined) ?? {};
  const blocks = [
    { label: 'Ödeme Şartları', value: String(data.paymentTerms ?? terms.paymentTermsText ?? '') },
    { label: 'Teslimat Şartları', value: String(data.deliveryTerms ?? terms.deliveryTermsText ?? '') },
    { label: 'Garanti Şartları', value: String(data.warrantyTerms ?? terms.warrantyTermsText ?? '') },
    { label: 'Notlar', value: String(data.notes ?? '') },
  ].filter((b) => b.value.trim());

  if (!blocks.length) {
    return <Text style={styles.emptyText}>Koşul veya not girilmemiş.</Text>;
  }

  return (
    <View style={styles.termsWrap}>
      {blocks.map((block) => (
        <View key={block.label} style={[styles.termsCard, shadowCard]}>
          <Text style={styles.termsLabel}>{block.label}</Text>
          <Text style={styles.termsValue}>{block.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function OfferActivityCard({ item }: { item: Record<string, unknown> }) {
  return (
    <View style={[styles.activityCard, shadowCard]}>
      <Text style={styles.activitySubject}>{String(item.subject ?? item.activityTypeCode ?? 'Aktivite')}</Text>
      <Text style={styles.activityMeta}>
        {String(item.activityDate ?? item.createdAt ?? '—')}
        {item.description ? ` · ${String(item.description)}` : ''}
      </Text>
    </View>
  );
}

export function OfferRevisionCard({
  row,
  currentId,
  onPress,
}: {
  row: Record<string, unknown>;
  currentId?: string;
  onPress?: () => void;
}) {
  const isCurrent = String(row.id) === currentId;
  const status = offerStatusVisual(row);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.revisionCard,
        isCurrent && styles.revisionCardCurrent,
        pressFade(pressed),
      ]}
    >
      <View style={styles.revisionTop}>
        <Text style={styles.revisionDoc}>{documentNoFromRow(row)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusBadgeText, { color: status.fg }]}>{status.label}</Text>
        </View>
      </View>
      <Text style={styles.revisionMeta}>
        Rev. {revisionFromRow(row)} · {formatQuoteMoney(row)}
      </Text>
    </Pressable>
  );
}

export function OfferDetailFooter({
  statusCode,
  hasOrder,
  orderNo,
  sending,
  creatingOrder,
  onPdf,
  onSend,
  onApprove,
  onReject,
  onCreateOrder,
  onEdit,
}: {
  statusCode: string;
  hasOrder?: boolean;
  orderNo?: string;
  sending?: boolean;
  creatingOrder?: boolean;
  onPdf: () => void;
  onSend?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onCreateOrder?: () => void;
  onEdit?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const code = statusCode.toLowerCase();

  const primaryAction =
    code === 'draft' && onSend
      ? { label: sending ? 'Gönderiliyor…' : 'Müşteriye Gönder', icon: 'flash' as const, onPress: onSend, disabled: sending }
      : code === 'sent' && onApprove
        ? { label: 'Onayla', icon: 'checkmark-circle' as const, onPress: onApprove, disabled: false }
        : code === 'approved' && !hasOrder && onCreateOrder
          ? {
              label: creatingOrder ? 'Oluşturuluyor…' : 'Sipariş Oluştur',
              icon: 'clipboard-outline' as const,
              onPress: onCreateOrder,
              disabled: creatingOrder,
            }
          : code === 'draft' && onEdit
            ? { label: 'Düzenle', icon: 'create-outline' as const, onPress: onEdit, disabled: false }
            : null;

  const secondaryAction =
    code === 'sent' && onReject
      ? { label: 'Reddet', icon: 'close-circle-outline' as const, onPress: onReject, destructive: true }
      : null;

  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {hasOrder && orderNo ? (
        <View style={styles.orderBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#2e7d32" />
          <Text style={styles.orderBannerText}>Sipariş: {orderNo}</Text>
        </View>
      ) : null}
      <View style={styles.footerRow}>
        <Pressable onPress={onPdf} style={({ pressed }) => [styles.footerOutline, pressFade(pressed)]}>
          <Ionicons name="download-outline" size={18} color={colors.primary} />
          <Text style={styles.footerOutlineText}>PDF İndir</Text>
        </Pressable>
        {secondaryAction ? (
          <Pressable
            onPress={secondaryAction.onPress}
            style={({ pressed }) => [styles.footerReject, pressFade(pressed)]}
          >
            <Ionicons name={secondaryAction.icon} size={18} color={colors.error} />
            <Text style={styles.footerRejectText}>{secondaryAction.label}</Text>
          </Pressable>
        ) : null}
        {primaryAction ? (
          <Pressable
            onPress={primaryAction.onPress}
            disabled={primaryAction.disabled}
            style={({ pressed }) => [
              styles.footerPrimary,
              primaryAction.disabled && styles.footerDisabled,
              pressFade(pressed),
            ]}
          >
            <Ionicons name={primaryAction.icon} size={18} color="#fff" />
            <Text style={styles.footerPrimaryText}>{primaryAction.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas,
    paddingHorizontal: layout.containerMargin,
    minHeight: 56,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.headlineMd,
    color: colors.primary,
    fontFamily: fonts.bold,
    marginHorizontal: spacing.sm,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  companyLink: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  companyName: { ...typography.headlineMd, color: colors.primary, flex: 1 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  statusPillText: { ...typography.caption, color: colors.onSecondaryContainer },
  heroTitle: { ...typography.body, color: colors.textPrimary, marginTop: spacing.xs },
  validityRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  validityText: { ...typography.caption, color: colors.outline },
  revText: { ...typography.caption, color: colors.outline },
  totalsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalsRowBorder: {
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceVariant,
  },
  totalsLabel: { ...typography.bodySm, color: colors.onSurfaceVariant },
  totalsValue: { ...typography.bodySm, color: colors.onSurfaceVariant },
  totalsGrandLabel: { ...typography.headlineMd, color: colors.primary },
  totalsGrandValue: { ...typography.display, color: colors.primary, fontSize: 24, lineHeight: 30 },
  tabRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerHigh,
  },
  tabChipActive: { backgroundColor: colors.primary },
  tabChipText: { ...typography.label, color: colors.onSurfaceVariant },
  tabChipTextActive: { color: '#fff', fontFamily: fonts.semibold },
  lineReadCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  lineReadTitle: { ...typography.body, color: colors.textPrimary, fontFamily: fonts.semibold },
  lineReadFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  lineReadMeta: { ...typography.bodySm, color: colors.onSurfaceVariant, flex: 1, paddingRight: spacing.sm },
  lineReadTotal: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  termsWrap: { gap: spacing.sm },
  termsCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  termsLabel: { ...typography.caption, color: colors.outline, textTransform: 'uppercase', letterSpacing: 0.8 },
  termsValue: { ...typography.bodySm, color: colors.textPrimary, lineHeight: 22 },
  emptyText: { ...typography.bodySm, color: colors.onSurfaceVariant, paddingVertical: spacing.lg },
  activityCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  activitySubject: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  activityMeta: { ...typography.caption, color: colors.outline },
  revisionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  revisionCardCurrent: { borderColor: colors.primary, backgroundColor: '#f8f9ff' },
  revisionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  revisionDoc: { ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  revisionMeta: { ...typography.caption, color: colors.outline },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  statusBadgeText: { ...typography.caption, fontSize: 10 },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
  },
  orderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  orderBannerText: { ...typography.label, color: '#2e7d32', fontFamily: fonts.semibold },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
  footerOutline: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerOutlineText: { ...typography.headlineMd, color: colors.primary, fontSize: 14 },
  footerReject: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerRejectText: { ...typography.headlineMd, color: colors.error, fontSize: 14 },
  footerPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerPrimaryText: { ...typography.headlineMd, color: '#fff', fontSize: 15 },
  footerDisabled: { opacity: 0.6 },
});
