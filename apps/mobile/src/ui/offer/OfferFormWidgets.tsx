import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export const OFFER_STEPS = ['Firma', 'Kalemler', 'Koşullar', 'Önizleme'] as const;
export type OfferStep = (typeof OFFER_STEPS)[number];

export const VALIDITY_OPTIONS = [
  { label: '15 gün', value: 15 },
  { label: '30 gün', value: 30 },
  { label: '60 gün', value: 60 },
] as const;

export const CURRENCY_OPTIONS = [
  { label: 'USD', code: 'USD' },
  { label: 'EUR', code: 'EUR' },
  { label: 'TL', code: 'TRY' },
] as const;

export const VAT_OPTIONS = ['20', '18', '8', '1', '0'] as const;

/** Web QuoteDialog ile aynı teslim şekli seçenekleri */
export const DELIVERY_TERM_OPTIONS = [
  { code: '', label: 'Seçilmedi', importCostsExcluded: true },
  { code: 'nationalized', label: 'Millileştirilmiş Teklif', importCostsExcluded: false },
  { code: 'customs', label: 'Gümrük Teklif', importCostsExcluded: true },
  { code: 'ex_works', label: 'İşletme Teslim', importCostsExcluded: false },
  { code: 'fob', label: 'F.O.B Teslim', importCostsExcluded: true },
] as const;

export type OfferLine = {
  id: string;
  productModelId?: string;
  stockCode?: string;
  description: string;
  quantity: string;
  unitCode: string;
  unitPrice: string;
  vatRate: string;
  /** API `discountAmount` — satır indirimi (para birimi) */
  discountAmount: string;
};

export function newOfferLine(): OfferLine {
  return {
    id: Math.random().toString(36).slice(2),
    description: '',
    quantity: '1',
    unitCode: 'adet',
    unitPrice: '',
    vatRate: '20',
    discountAmount: '0',
  };
}

export function parseAmount(value: string): number {
  const cleaned = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** API calcItem ile uyumlu: brüt − indirim = net, KDV net üzerinden */
export function lineGross(line: OfferLine): number {
  const qty = parseAmount(line.quantity) || 0;
  return qty * parseAmount(line.unitPrice);
}

export function lineDiscount(line: OfferLine): number {
  return parseAmount(line.discountAmount);
}

export function lineSubtotal(line: OfferLine): number {
  return Math.max(0, lineGross(line) - lineDiscount(line));
}

export function lineVat(line: OfferLine): number {
  return lineSubtotal(line) * (parseAmount(line.vatRate) / 100);
}

export function lineTotal(line: OfferLine): number {
  return lineSubtotal(line) + lineVat(line);
}

export function currencySymbol(code: string): string {
  if (code === 'TRY' || code === 'TL') return '₺';
  if (code === 'USD') return '$';
  if (code === 'EUR') return '€';
  return code;
}

export function formatOfferMoney(amount: number, currencyCode: string): string {
  const sym = currencySymbol(currencyCode);
  const code = currencyCode === 'TL' ? 'TRY' : currencyCode;
  try {
    return `${sym}${amount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
  } catch {
    return `${sym}${Math.round(amount).toLocaleString('tr-TR')}`;
  }
}

/** Stitch `0fbd72b2` — İptal | başlık | Kaydet */
export function OfferFormHeader({
  onCancel,
  onSave,
  saveLabel = 'Kaydet',
  saving,
  title = 'Yeni Teklif',
}: {
  onCancel: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saving?: boolean;
  title?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top }, shadowCard]}>
      <View style={styles.headerRow}>
        <Pressable onPress={onCancel} hitSlop={8} style={({ pressed }) => pressFade(pressed)}>
          <Text style={styles.cancelText}>İptal</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <Pressable
          onPress={onSave}
          disabled={!onSave || saving}
          hitSlop={8}
          style={({ pressed }) => pressFade(pressed)}
        >
          <Text style={[styles.saveText, (!onSave || saving) && styles.saveTextDisabled]}>{saveLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function OfferStepper({ activeIndex }: { activeIndex: number }) {
  return (
    <View style={styles.stepper}>
      {OFFER_STEPS.map((label, idx) => {
        const done = idx < activeIndex;
        const active = idx === activeIndex;
        return (
          <View key={label} style={styles.stepperSegment}>
            {idx > 0 ? (
              <View style={[styles.stepperLineFlex, done || active ? styles.stepperLineDone : null]} />
            ) : null}
            <View style={styles.stepperCol}>
              <View style={[styles.stepDot, done || active ? styles.stepDotActive : styles.stepDotPending]}>
                {done ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <Text style={[styles.stepNum, (done || active) && styles.stepNumActive]}>{idx + 1}</Text>
                )}
              </View>
              <Text
                style={[styles.stepLabel, active && styles.stepLabelActive, !done && !active && styles.stepLabelPending]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function OfferCompanyBar({
  companyName,
  onChange,
}: {
  companyName: string;
  onChange: () => void;
}) {
  return (
    <View style={styles.companyBar}>
      <View style={styles.companyBarLeft}>
        <Ionicons name="checkmark-circle" size={20} color={colors.onPrimaryContainer} />
        <Text style={styles.companyBarName} numberOfLines={1}>
          {companyName}
        </Text>
      </View>
      <Pressable onPress={onChange} hitSlop={8}>
        <Text style={styles.companyBarChange}>Değiştir</Text>
      </Pressable>
    </View>
  );
}

export function OfferSectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

export function OfferField({
  label,
  ...props
}: { label: string } & TextInputProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.onSecondaryContainer}
        style={styles.fieldInput}
        {...props}
      />
    </View>
  );
}

export function OfferSelectField({
  label,
  value,
  options,
  onChange,
  compact,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.fieldWrap, compact && styles.fieldWrapCompact]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.selectWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selectRow}
          nestedScrollEnabled
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => onChange(opt.value)}
                style={[styles.selectChip, compact && styles.selectChipCompact, active && styles.selectChipActive]}
              >
                <Text style={[styles.selectChipText, active && styles.selectChipTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

export function OfferLineCard({
  line,
  currencyCode,
  onChange,
  onRemove,
  canRemove,
}: {
  line: OfferLine;
  currencyCode: string;
  onChange: (patch: Partial<OfferLine>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const sym = currencySymbol(currencyCode);
  const gross = lineGross(line);
  const discount = lineDiscount(line);
  const net = lineSubtotal(line);
  const vat = lineVat(line);
  const total = lineTotal(line);
  const vatLabel = parseAmount(line.vatRate);

  return (
    <View style={[styles.lineCard, shadowCard]}>
      {canRemove ? (
        <Pressable onPress={onRemove} style={styles.lineDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={20} color={colors.outline} />
        </Pressable>
      ) : null}
      <View style={[styles.lineBody, canRemove && styles.lineBodyWithDelete]}>
        <OfferField
          label="Açıklama"
          value={line.description}
          onChangeText={(v) => onChange({ description: v })}
          placeholder="Ürün veya hizmet açıklaması"
          numberOfLines={1}
          style={styles.lineInputSm}
        />
        <View style={styles.lineRow}>
          <View style={styles.qtyCol}>
            <OfferField
              label="Miktar"
              value={line.quantity}
              onChangeText={(v) => onChange({ quantity: v })}
              keyboardType="decimal-pad"
              style={[styles.lineInputSm, styles.qtyInput]}
            />
          </View>
          <View style={styles.priceCol}>
            <Text style={styles.fieldLabel}>Birim Fiyat</Text>
            <View style={styles.prefixInputWrap}>
              <Text style={styles.inputPrefix}>{sym}</Text>
              <TextInput
                value={line.unitPrice}
                onChangeText={(v) => onChange({ unitPrice: v })}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.onSecondaryContainer}
                style={[styles.fieldInput, styles.lineInputSm, styles.prefixInput]}
              />
            </View>
          </View>
        </View>
        <OfferSelectField
          label="KDV"
          value={line.vatRate}
          options={VAT_OPTIONS.map((v) => ({ label: `%${v}`, value: v }))}
          onChange={(v) => onChange({ vatRate: v })}
          compact
        />
        <View style={styles.discountField}>
          <Text style={styles.fieldLabel}>İskonto</Text>
          <View style={[styles.prefixInputWrap, styles.discountInputWrap]}>
            <Text style={styles.inputPrefix}>{sym}</Text>
            <TextInput
              value={line.discountAmount}
              onChangeText={(v) => onChange({ discountAmount: v })}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.onSecondaryContainer}
              style={[styles.fieldInput, styles.lineInputSm, styles.prefixInput]}
            />
          </View>
        </View>
        <View style={styles.lineBreakdown}>
          {gross > 0 ? (
            <View style={styles.lineBreakdownRow}>
              <Text style={styles.lineBreakdownLabel}>Brüt Tutar</Text>
              <Text style={styles.lineBreakdownValue}>{formatOfferMoney(gross, currencyCode)}</Text>
            </View>
          ) : null}
          {discount > 0 ? (
            <View style={styles.lineBreakdownRow}>
              <Text style={styles.lineBreakdownLabel}>İskonto</Text>
              <Text style={[styles.lineBreakdownValue, styles.lineBreakdownDiscount]}>
                -{formatOfferMoney(discount, currencyCode)}
              </Text>
            </View>
          ) : null}
          <View style={styles.lineBreakdownRow}>
            <Text style={styles.lineBreakdownLabel}>Net Tutar</Text>
            <Text style={styles.lineBreakdownValue}>{formatOfferMoney(net, currencyCode)}</Text>
          </View>
          <View style={styles.lineBreakdownRow}>
            <Text style={styles.lineBreakdownLabel}>KDV (%{vatLabel})</Text>
            <Text style={[styles.lineBreakdownValue, styles.lineBreakdownVat]}>
              {formatOfferMoney(vat, currencyCode)}
            </Text>
          </View>
          <View style={styles.lineTotalRow}>
            <Text style={styles.lineTotalLabel}>Toplam</Text>
            <Text style={styles.lineTotal}>{formatOfferMoney(total, currencyCode)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function OfferAddLineButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.addLineBtn, pressFade(pressed)]}>
      <Ionicons name="add" size={20} color={colors.onPrimaryContainer} />
      <Text style={styles.addLineText}>Yeni Kalem Ekle</Text>
    </Pressable>
  );
}

export function OfferCatalogButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.catalogBtn, pressFade(pressed)]}>
      <Ionicons name="book-outline" size={16} color={colors.onPrimaryContainer} />
      <Text style={styles.catalogText}>Katalogtan Ekle</Text>
    </Pressable>
  );
}

export function OfferTotalsPanel({
  subtotal,
  discountTotal,
  vatTotal,
  grandTotal,
  currencyCode,
  compact,
}: {
  subtotal: number;
  discountTotal?: number;
  vatTotal: number;
  grandTotal: number;
  currencyCode: string;
  compact?: boolean;
}) {
  const gross = subtotal + (discountTotal ?? 0);
  return (
    <View style={[styles.totalsPanel, compact && styles.totalsPanelCompact]}>
      <View style={styles.totalsRows}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Brüt Toplam</Text>
          <Text style={styles.totalsValue}>{formatOfferMoney(gross, currencyCode)}</Text>
        </View>
        {(discountTotal ?? 0) > 0 ? (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>İskonto</Text>
            <Text style={[styles.totalsValue, styles.totalsDiscount]}>-{formatOfferMoney(discountTotal ?? 0, currencyCode)}</Text>
          </View>
        ) : null}
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Net Ara Toplam</Text>
          <Text style={styles.totalsValue}>{formatOfferMoney(subtotal, currencyCode)}</Text>
        </View>
        <View style={styles.totalsRow}>
          <Text style={[styles.totalsLabel, styles.totalsVatLabel]}>KDV Toplamı</Text>
          <Text style={[styles.totalsValue, styles.totalsVatValue]}>{formatOfferMoney(vatTotal, currencyCode)}</Text>
        </View>
      </View>
      <View style={styles.totalsDivider} />
      <View style={styles.totalsRow}>
        <Text style={styles.totalsGrandLabel}>TOPLAM</Text>
        <Text style={styles.totalsGrandValue}>{formatOfferMoney(grandTotal, currencyCode)}</Text>
      </View>
    </View>
  );
}

/** Kalemler adımında footer üstünde sabit özet — KDV her zaman görünür */
export function OfferStickyTotals({
  subtotal,
  discountTotal,
  vatTotal,
  grandTotal,
  currencyCode,
}: {
  subtotal: number;
  discountTotal?: number;
  vatTotal: number;
  grandTotal: number;
  currencyCode: string;
}) {
  return (
    <View style={styles.stickyTotals}>
      <View style={styles.stickyRow}>
        <Text style={styles.stickyLabel}>Net · KDV</Text>
        <Text style={styles.stickyMeta}>
          {formatOfferMoney(subtotal, currencyCode)}
          {' · '}
          <Text style={styles.stickyVat}>{formatOfferMoney(vatTotal, currencyCode)}</Text>
        </Text>
      </View>
      <View style={styles.stickyGrandRow}>
        <Text style={styles.stickyGrandLabel}>TOPLAM</Text>
        <Text style={styles.stickyGrandValue}>{formatOfferMoney(grandTotal, currencyCode)}</Text>
      </View>
    </View>
  );
}

export function OfferPreviewPanel({
  companyName,
  contactName,
  quoteDate,
  validityDays,
  currency,
  opportunityLabel,
  selectedOpportunityId,
  caseTitle,
  lines,
  paymentTerms,
  deliveryTerms,
  warrantyTerms,
  notes,
  buildDescription,
}: {
  companyName: string;
  contactName?: string;
  quoteDate: string;
  validityDays: string;
  currency: string;
  opportunityLabel?: string;
  selectedOpportunityId?: string;
  caseTitle?: string;
  lines: OfferLine[];
  paymentTerms?: string;
  deliveryTerms?: string;
  warrantyTerms?: string;
  notes?: string;
  buildDescription: (line: OfferLine) => string;
}) {
  const validLines = lines.filter(
    (l) => (l.description.trim() || l.productModelId) && parseAmount(l.quantity) > 0,
  );

  return (
    <View style={styles.previewWrap}>
      <View style={[styles.previewHero, shadowCard]}>
        <Text style={styles.previewHeroCompany}>{companyName || '—'}</Text>
        <Text style={styles.previewHeroTitle}>
          {caseTitle?.trim() || opportunityLabel || validLines[0]?.description || 'Yeni Teklif'}
        </Text>
        <Text style={styles.previewHeroMeta}>
          {quoteDate} · {validityDays} gün · {currency}
        </Text>
      </View>

      <Text style={styles.previewSectionTitle}>Kalemler ({validLines.length})</Text>
      <View style={styles.previewLines}>
        {validLines.map((line) => (
          <View key={line.id} style={[styles.previewLineCard, shadowCard]}>
            <Text style={styles.previewLineTitle} numberOfLines={2}>
              {buildDescription(line)}
            </Text>
            <View style={styles.previewLineFooter}>
              <Text style={styles.previewLineMeta}>
                {parseAmount(line.quantity) || 1} {line.unitCode} x {formatOfferMoney(parseAmount(line.unitPrice), currency)}
              </Text>
              <Text style={styles.previewLineTotal}>{formatOfferMoney(lineTotal(line), currency)}</Text>
            </View>
          </View>
        ))}
      </View>

      {(paymentTerms || deliveryTerms || warrantyTerms || notes || contactName) ? (
        <>
          <Text style={styles.previewSectionTitle}>Koşullar & Notlar</Text>
          <View style={[styles.previewTermsCard, shadowCard]}>
            {contactName ? (
              <View style={styles.previewTermRow}>
                <Text style={styles.previewTermLabel}>Kontak</Text>
                <Text style={styles.previewTermValue}>{contactName}</Text>
              </View>
            ) : null}
            {selectedOpportunityId ? (
              <View style={styles.previewTermRow}>
                <Text style={styles.previewTermLabel}>Satış Kartı</Text>
                <Text style={styles.previewTermValue}>{opportunityLabel || selectedOpportunityId.slice(0, 8)}</Text>
              </View>
            ) : (
              <View style={styles.previewTermRow}>
                <Text style={styles.previewTermLabel}>Satış Kartı</Text>
                <Text style={styles.previewTermValue}>Otomatik oluşturulacak</Text>
              </View>
            )}
            {paymentTerms ? (
              <View style={styles.previewTermRow}>
                <Text style={styles.previewTermLabel}>Ödeme</Text>
                <Text style={styles.previewTermValue}>{paymentTerms}</Text>
              </View>
            ) : null}
            {deliveryTerms ? (
              <View style={styles.previewTermRow}>
                <Text style={styles.previewTermLabel}>Teslimat</Text>
                <Text style={styles.previewTermValue}>{deliveryTerms}</Text>
              </View>
            ) : null}
            {warrantyTerms ? (
              <View style={styles.previewTermRow}>
                <Text style={styles.previewTermLabel}>Garanti</Text>
                <Text style={styles.previewTermValue}>{warrantyTerms}</Text>
              </View>
            ) : null}
            {notes ? (
              <View style={styles.previewTermRow}>
                <Text style={styles.previewTermLabel}>Notlar</Text>
                <Text style={styles.previewTermValue}>{notes}</Text>
              </View>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

export function OfferFormFooter({
  backLabel = 'Geri',
  nextLabel,
  onBack,
  onNext,
  nextDisabled,
}: {
  backLabel?: string;
  nextLabel: string;
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {onBack ? (
        <Pressable onPress={onBack} style={({ pressed }) => [styles.footerBack, pressFade(pressed)]}>
          <Text style={styles.footerBackText}>{backLabel}</Text>
        </Pressable>
      ) : (
        <View style={styles.footerBack} />
      )}
      <Pressable
        onPress={onNext}
        disabled={nextDisabled}
        style={({ pressed }) => [styles.footerNext, nextDisabled && styles.footerNextDisabled, pressFade(pressed)]}
      >
        <Text style={styles.footerNextText}>{nextLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: { backgroundColor: colors.canvas, zIndex: 50 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
  },
  cancelText: { ...typography.bodySm, color: colors.stitchPrimary, minWidth: 48 },
  headerTitle: {
    ...typography.headlineMd,
    fontFamily: fonts.bold,
    color: colors.stitchPrimary,
  },
  saveText: {
    ...typography.headlineMd,
    color: colors.onPrimaryContainer,
    minWidth: 48,
    textAlign: 'right',
  },
  saveTextDisabled: { opacity: 0.4 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  stepperSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepperCol: { alignItems: 'center', gap: spacing.xs, minWidth: 52 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotPending: { backgroundColor: colors.surfaceContainerHigh },
  stepNum: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    fontFamily: fonts.semibold,
  },
  stepNumActive: { color: '#fff' },
  stepLabel: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  stepLabelActive: {
    color: colors.onPrimaryContainer,
    fontFamily: fonts.bold,
  },
  stepLabelPending: { color: colors.onSurfaceVariant },
  stepperLineFlex: {
    flex: 1,
    height: 2,
    backgroundColor: colors.surfaceVariant,
    marginTop: 11,
    marginHorizontal: 2,
    minWidth: 8,
  },
  stepperLineDone: { backgroundColor: colors.primary },
  companyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(198, 197, 211, 0.3)',
  },
  companyBarLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  companyBarName: {
    ...typography.bodySm,
    fontFamily: fonts.medium,
    color: colors.stitchPrimary,
    flex: 1,
  },
  companyBarChange: {
    ...typography.label,
    color: colors.onPrimaryContainer,
    textDecorationLine: 'underline',
  },
  sectionTitle: {
    ...typography.headlineMd,
    color: colors.stitchPrimary,
    marginBottom: spacing.sm,
  },
  fieldWrap: { gap: spacing.xs },
  fieldWrapCompact: { width: '100%' },
  fieldLabel: {
    ...typography.label,
    color: colors.onSecondaryContainer,
  },
  fieldInput: {
    height: 48,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  lineInputSm: { height: 40, paddingHorizontal: spacing.sm },
  selectWrap: { minHeight: 40, justifyContent: 'center', overflow: 'hidden' },
  selectRow: { gap: spacing.xs, paddingRight: spacing.xs },
  selectChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerLow,
  },
  selectChipCompact: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  selectChipActive: {
    backgroundColor: colors.secondaryContainer,
    borderWidth: 1,
    borderColor: colors.onPrimaryContainer,
  },
  selectChipText: { ...typography.label, color: colors.onSurfaceVariant },
  selectChipTextActive: { color: colors.stitchPrimary, fontFamily: fonts.semibold },
  lineCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHighest,
    position: 'relative',
  },
  lineDelete: { position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 2 },
  lineBody: { gap: spacing.md },
  lineBodyWithDelete: { paddingRight: spacing.xxl },
  lineRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  qtyCol: { width: 88 },
  priceCol: { flex: 1, minWidth: 0 },
  discountField: { gap: spacing.xs, maxWidth: '50%' },
  discountInputWrap: { width: '100%' },
  qtyInput: { textAlign: 'center' },
  prefixInputWrap: { position: 'relative', justifyContent: 'center' },
  inputPrefix: {
    position: 'absolute',
    left: spacing.sm,
    zIndex: 1,
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
  },
  prefixInput: { paddingLeft: 28 },
  lineBreakdown: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHighest,
    gap: 6,
  },
  lineBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineBreakdownLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  lineBreakdownValue: { ...typography.bodySm, color: colors.onSurface, fontFamily: fonts.medium },
  lineBreakdownDiscount: { color: colors.error },
  lineBreakdownVat: { color: colors.onPrimaryContainer, fontFamily: fonts.semibold },
  lineTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHighest,
  },
  lineTotalLabel: { ...typography.label, color: colors.stitchPrimary, fontFamily: fonts.semibold },
  lineTotal: {
    ...typography.headlineMd,
    color: colors.stitchPrimary,
    fontFamily: fonts.bold,
  },
  addLineBtn: {
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.onPrimaryContainer,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  addLineText: {
    ...typography.headlineMd,
    color: colors.onPrimaryContainer,
  },
  catalogBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  catalogText: {
    ...typography.label,
    color: colors.onPrimaryContainer,
  },
  totalsPanel: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
  },
  totalsPanelCompact: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  totalsRows: { gap: spacing.xs, marginBottom: spacing.sm },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalsLabel: { ...typography.bodySm, color: colors.onSurfaceVariant },
  totalsValue: { ...typography.bodySm, color: colors.onSurfaceVariant, fontFamily: fonts.medium },
  totalsDiscount: { color: colors.error },
  totalsVatLabel: { fontFamily: fonts.semibold, color: colors.onSurface },
  totalsVatValue: { color: colors.onPrimaryContainer, fontFamily: fonts.bold },
  totalsDivider: {
    height: 1,
    backgroundColor: 'rgba(198, 197, 211, 0.5)',
    marginBottom: spacing.sm,
  },
  totalsGrandLabel: {
    ...typography.headline,
    color: colors.stitchPrimary,
  },
  totalsGrandValue: {
    ...typography.headline,
    fontFamily: fonts.bold,
    color: colors.stitchPrimary,
  },
  stickyTotals: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: 4,
  },
  stickyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stickyLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  stickyMeta: { ...typography.bodySm, color: colors.onSurface, fontFamily: fonts.medium },
  stickyVat: { color: colors.onPrimaryContainer, fontFamily: fonts.bold },
  stickyGrandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stickyGrandLabel: { ...typography.label, color: colors.stitchPrimary, fontFamily: fonts.bold },
  stickyGrandValue: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
  },
  footerBack: {
    paddingHorizontal: spacing.lg,
    height: 48,
    justifyContent: 'center',
  },
  footerBackText: {
    ...typography.headlineMd,
    color: colors.stitchPrimary,
  },
  footerNext: {
    flex: 1,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerNextDisabled: { opacity: 0.5 },
  footerNextText: {
    ...typography.headlineMd,
    color: '#fff',
  },
  previewWrap: { gap: spacing.md, marginBottom: spacing.lg },
  previewHero: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  previewHeroCompany: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  previewHeroTitle: { ...typography.body, color: colors.textPrimary },
  previewHeroMeta: { ...typography.caption, color: colors.outline },
  previewSectionTitle: {
    ...typography.headlineMd,
    color: colors.stitchPrimary,
    marginTop: spacing.sm,
  },
  previewLines: { gap: spacing.sm },
  previewLineCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  previewLineTitle: { ...typography.body, color: colors.textPrimary, fontFamily: fonts.semibold },
  previewLineFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  previewLineMeta: { ...typography.bodySm, color: colors.onSurfaceVariant, flex: 1, paddingRight: spacing.sm },
  previewLineTotal: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  previewTermsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  previewTermRow: { gap: 4 },
  previewTermLabel: { ...typography.caption, color: colors.outline, textTransform: 'uppercase', letterSpacing: 0.6 },
  previewTermValue: { ...typography.bodySm, color: colors.textPrimary, lineHeight: 20 },
});
