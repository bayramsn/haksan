import {
  Pressable,
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
import { currencySymbol, formatOfferMoney } from '@/src/ui/offer/OfferFormWidgets';

export const OPPORTUNITY_STEPS = ['Firma', 'Ürün', 'Detay', 'Özet'] as const;
export type OpportunityStep = (typeof OPPORTUNITY_STEPS)[number];

export const CATEGORY_OPTIONS = [
  { label: 'CNC Tezgahlar', value: 'cnc' },
  { label: 'Lazer Kesim', value: 'laser' },
  { label: 'Pres Makinaları', value: 'press' },
  { label: 'Diğer', value: 'other' },
] as const;

export const CURRENCY_SEGMENTS = [
  { label: 'TL', code: 'TRY' },
  { label: 'USD', code: 'USD' },
  { label: 'EUR', code: 'EUR' },
] as const;

export const TAG_PRESETS = [
  { label: '2026 Q3', tone: 'info' as const },
  { label: 'Öncelikli', tone: 'priority' as const },
];

export const SOURCE_OPTIONS = [
  { label: 'Referans', value: 'referral' },
  { label: 'Fuar', value: 'fair' },
  { label: 'Web', value: 'web' },
  { label: 'Soğuk Arama', value: 'cold_call' },
] as const;

export type OpportunityProductChip = { id: string; name: string; quantity: number };

export function parseMoneyInput(value: string): number {
  const cleaned = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoneyInput(value: string, currencyCode: string): string {
  const n = parseMoneyInput(value);
  if (!n) return '';
  const sym = currencySymbol(currencyCode);
  try {
    return `${sym} ${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
  } catch {
    return `${sym} ${Math.round(n).toLocaleString('tr-TR')}`;
  }
}

/** Stitch `cdd7b1b1` — İptal | başlık | Kaydet */
export function OpportunityFormHeader({
  title = 'Yeni Satış Kartı',
  onCancel,
  onSave,
  saveDisabled,
  saving,
}: {
  title?: string;
  onCancel: () => void;
  onSave?: () => void;
  saveDisabled?: boolean;
  saving?: boolean;
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
          disabled={!onSave || saveDisabled || saving}
          hitSlop={8}
          style={({ pressed }) => pressFade(pressed)}
        >
          <Text style={[styles.saveText, (!onSave || saveDisabled || saving) && styles.saveTextDisabled]}>
            Kaydet
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function OpportunityStepper({ activeIndex }: { activeIndex: number }) {
  return (
    <View style={styles.stepperBar}>
      {OPPORTUNITY_STEPS.map((label, idx) => {
        const done = idx < activeIndex;
        const active = idx === activeIndex;
        return (
          <View key={label} style={styles.stepperSegment}>
            {idx > 0 ? (
              <View style={[styles.stepperLineFlex, done || active ? styles.stepperLineDone : null]} />
            ) : null}
            <View style={styles.stepperCol}>
              <View
                style={[
                  styles.stepDot,
                  done || active ? styles.stepDotActive : styles.stepDotPending,
                  active && styles.stepDotRing,
                ]}
              >
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

/** Stitch — seçili firma kartı */
export function OpportunityCompanyCard({
  companyName,
  onChange,
}: {
  companyName: string;
  onChange: () => void;
}) {
  return (
    <View style={styles.companyCard}>
      <View style={styles.companyCardLeft}>
        <View style={styles.companyIconWrap}>
          <Ionicons name="checkmark-circle" size={18} color={colors.statusActiveText} />
        </View>
        <View style={styles.companyCardText}>
          <Text style={styles.companyCardLabel}>Seçili Firma</Text>
          <Text style={styles.companyCardName} numberOfLines={2}>
            {companyName}
          </Text>
        </View>
      </View>
      <Pressable onPress={onChange} hitSlop={8}>
        <Text style={styles.companyCardChange}>Değiştir</Text>
      </Pressable>
    </View>
  );
}

/** Stitch Firmalar #01 — firma seçim tetikleyici */
export function OpportunityCompanySelectRow({
  companyName,
  onPress,
}: {
  companyName: string;
  onPress: () => void;
}) {
  const selected = Boolean(companyName.trim());

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>Firma *</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.companySelectRow, pressFade(pressed)]}
      >
        <View style={styles.companySelectLeft}>
          <Ionicons
            name={selected ? 'business' : 'search-outline'}
            size={18}
            color={selected ? colors.onPrimaryContainer : colors.outline}
          />
          <Text
            style={[styles.companySelectText, !selected && styles.companySelectPlaceholder]}
            numberOfLines={1}
          >
            {companyName || 'Firma ara ve seç…'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.outlineVariant} />
      </Pressable>
    </View>
  );
}

export function OpportunitySectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

export function OpportunityField({
  label,
  ...props
}: { label: string } & TextInputProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.onSecondaryContainer} style={styles.fieldInput} {...props} />
    </View>
  );
}

export function OpportunityMoneyField({
  label,
  value,
  onChangeText,
  currencyCode,
  large,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  currencyCode: string;
  large?: boolean;
}) {
  const sym = currencySymbol(currencyCode);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.moneyInputWrap, large && styles.moneyInputWrapLarge]}>
        <Text style={[styles.moneyPrefix, large && styles.moneyPrefixLarge]}>{sym}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholderTextColor={colors.onSecondaryContainer}
          style={[styles.moneyInput, large && styles.moneyInputLarge]}
          placeholder="0"
        />
      </View>
    </View>
  );
}

/** Stitch `32e21711` — tarih satırı */
export function OpportunityDateField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pickerRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.onSecondaryContainer}
          style={styles.pickerRowInput}
        />
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
      </View>
    </View>
  );
}

export function OpportunitySourceChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>Kaynak</Text>
      <View style={styles.sourceTrack}>
        {SOURCE_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[styles.sourceChip, active && styles.sourceChipActive]}
            >
              <Text style={[styles.sourceChipText, active && styles.sourceChipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function OpportunitySelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.selectRow}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[styles.selectChip, active && styles.selectChipActive]}
            >
              <Text style={[styles.selectChipText, active && styles.selectChipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function OpportunityCurrencySegment({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>Para Birimi</Text>
      <View style={styles.segmentTrack}>
        {CURRENCY_SEGMENTS.map((seg) => {
          const active = value === seg.code || (value === 'TL' && seg.code === 'TRY');
          return (
            <Pressable
              key={seg.code}
              onPress={() => onChange(seg.code)}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>{seg.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function OpportunityProbabilityControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.probHeader}>
        <Text style={styles.fieldLabel}>Kazanma Olasılığı</Text>
        <Text style={styles.probValue}>%{value}</Text>
      </View>
      <View style={styles.probTrackWrap}>
        <View style={[styles.probFill, { width: `${value}%` }]} />
        <View style={styles.probControls}>
          <Pressable onPress={() => onChange(clamp(value - 5))} style={styles.probBtn} hitSlop={8}>
            <Ionicons name="remove" size={18} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => onChange(clamp(value + 5))} style={styles.probBtn} hitSlop={8}>
            <Ionicons name="add" size={18} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function OpportunityProductChips({
  products,
  onRemove,
  onAdd,
}: {
  products: OpportunityProductChip[];
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>Ürün(ler)</Text>
      <View style={styles.chipRow}>
        {products.map((p) => (
          <View key={p.id} style={styles.productChip}>
            <Text style={styles.productChipText}>
              {p.name} x{p.quantity}
            </Text>
            <Pressable onPress={() => onRemove(p.id)} hitSlop={6}>
              <Ionicons name="close" size={16} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={onAdd} style={({ pressed }) => [styles.addChipBtn, pressFade(pressed)]}>
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={styles.addChipText}>Ekle</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function OpportunityTagChips({
  tags,
  onToggle,
  onAdd,
}: {
  tags: string[];
  onToggle: (tag: string) => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>Etiketler</Text>
      <View style={styles.chipRow}>
        {TAG_PRESETS.map((preset) => {
          const active = tags.includes(preset.label);
          return (
            <Pressable
              key={preset.label}
              onPress={() => onToggle(preset.label)}
              style={[
                styles.tagChip,
                preset.tone === 'priority' ? styles.tagChipPriority : styles.tagChipInfo,
                active && styles.tagChipActive,
              ]}
            >
              <Text
                style={[
                  styles.tagChipText,
                  preset.tone === 'priority' ? styles.tagChipTextPriority : styles.tagChipTextInfo,
                ]}
              >
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
        {tags
          .filter((t) => !TAG_PRESETS.some((p) => p.label === t))
          .map((tag) => (
            <Pressable key={tag} onPress={() => onToggle(tag)} style={[styles.tagChip, styles.tagChipActive]}>
              <Text style={styles.tagChipText}>{tag}</Text>
            </Pressable>
          ))}
        <Pressable onPress={onAdd} style={({ pressed }) => [styles.addTagBtn, pressFade(pressed)]}>
          <Ionicons name="add" size={14} color={colors.onSurfaceVariant} />
          <Text style={styles.addTagText}>Ekle</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function OpportunityOwnerRow({ name }: { name: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>Satış Temsilcisi</Text>
      <View style={styles.ownerRow}>
        <View style={styles.ownerAvatar}>
          <Text style={styles.ownerAvatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.ownerName}>{name}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.outline} />
      </View>
    </View>
  );
}

export function OpportunitySummaryCard({
  companyName,
  title,
  categoryLabel,
  products,
  amount,
  currencyCode,
  probability,
  closeDate,
  ownerName,
  tags,
}: {
  companyName: string;
  title: string;
  categoryLabel: string;
  products: OpportunityProductChip[];
  amount: number;
  currencyCode: string;
  probability: number;
  closeDate?: string;
  ownerName: string;
  tags: string[];
}) {
  return (
    <View style={[styles.summaryCard, shadowCard]}>
      <Text style={styles.summaryCompany}>{companyName}</Text>
      <Text style={styles.summaryTitle}>{title || '—'}</Text>
      <View style={styles.summaryMeta}>
        <Text style={styles.summaryMetaText}>{categoryLabel}</Text>
        <Text style={styles.summaryMetaText}>· %{probability} olasılık</Text>
      </View>
      {products.length > 0 ? (
        <Text style={styles.summaryProducts}>
          {products.map((p) => `${p.name} x${p.quantity}`).join(', ')}
        </Text>
      ) : null}
      <Text style={styles.summaryAmount}>{formatOfferMoney(amount, currencyCode)}</Text>
      {closeDate ? <Text style={styles.summaryDate}>Kapanış: {closeDate}</Text> : null}
      <Text style={styles.summaryOwner}>Temsilci: {ownerName}</Text>
      {tags.length > 0 ? (
        <View style={styles.summaryTags}>
          {tags.map((tag) => (
            <View key={tag} style={styles.summaryTag}>
              <Text style={styles.summaryTagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
  cancelText: { ...typography.bodySm, color: colors.primary, minWidth: 48 },
  headerTitle: {
    ...typography.headlineMd,
    fontFamily: fonts.bold,
    color: colors.stitchPrimary,
  },
  saveText: {
    ...typography.bodySm,
    fontFamily: fonts.semibold,
    color: colors.primary,
    minWidth: 48,
    textAlign: 'right',
  },
  saveTextDisabled: { color: colors.outline },
  stepperBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: layout.containerMargin,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceVariant,
    backgroundColor: colors.canvas,
  },
  stepperSegment: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  stepperCol: { alignItems: 'center', gap: spacing.xs, minWidth: 48 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotPending: { backgroundColor: colors.surfaceVariant },
  stepDotRing: {
    borderWidth: 4,
    borderColor: 'rgba(0, 12, 105, 0.2)',
  },
  stepNum: { ...typography.caption, color: colors.onSurfaceVariant, fontFamily: fonts.semibold },
  stepNumActive: { color: '#fff' },
  stepLabel: { ...typography.caption, color: colors.onSurfaceVariant, textAlign: 'center' },
  stepLabelActive: { color: colors.primary, fontFamily: fonts.bold },
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
  companyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(198, 197, 211, 0.3)',
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    gap: spacing.sm,
    ...shadowCard,
  },
  companyCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  companyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.statusActiveBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyCardText: { flex: 1, gap: 2 },
  companyCardLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  companyCardName: { ...typography.bodySm, fontFamily: fonts.semibold, color: colors.textPrimary },
  companyCardChange: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  companySelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.touchMin,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHighest,
    ...shadowCard,
  },
  companySelectLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginRight: spacing.sm,
  },
  companySelectText: { flex: 1, ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.semibold },
  companySelectPlaceholder: { color: colors.onSurfaceVariant, fontFamily: fonts.regular },
  sectionTitle: {
    ...typography.headlineMd,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  fieldWrap: { gap: 6 },
  fieldLabel: { ...typography.caption, color: colors.onSurfaceVariant },
  fieldInput: {
    ...typography.body,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: layout.touchMin,
    color: colors.textPrimary,
  },
  moneyInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  moneyInputWrapLarge: {
    minHeight: 72,
    paddingVertical: spacing.sm,
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: colors.primarySoft,
  },
  moneyPrefix: {
    ...typography.headlineMd,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  moneyPrefixLarge: {
    fontSize: 32,
    lineHeight: 38,
    color: colors.primary,
  },
  moneyInput: {
    flex: 1,
    ...typography.headlineMd,
    fontFamily: fonts.bold,
    fontVariant: ['tabular-nums'],
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  moneyInputLarge: {
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.6,
    color: colors.primary,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    minHeight: layout.touchMin,
    gap: spacing.sm,
  },
  pickerRowInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  },
  sourceTrack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sourceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.card,
  },
  sourceChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sourceChipText: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  sourceChipTextActive: {
    color: '#fff',
    fontFamily: fonts.semibold,
  },
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  selectChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.card,
  },
  selectChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  selectChipText: { ...typography.bodySm, color: colors.onSurfaceVariant },
  selectChipTextActive: { color: colors.primary, fontFamily: fonts.semibold },
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
  },
  segmentBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  segmentBtnActive: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  segmentBtnText: { ...typography.caption, color: colors.onSurfaceVariant },
  segmentBtnTextActive: { color: colors.textPrimary, fontFamily: fonts.semibold },
  probHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  probValue: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  probTrackWrap: {
    height: 36,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: radius.sm,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  probFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 12, 105, 0.15)',
  },
  probControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  probBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  productChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  productChipText: { ...typography.bodySm, color: colors.textPrimary },
  addChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },
  addChipText: { ...typography.caption, color: colors.primary, fontFamily: fonts.semibold },
  tagChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  tagChipInfo: { backgroundColor: colors.secondaryContainer, borderColor: colors.secondaryContainer },
  tagChipPriority: { backgroundColor: colors.accentRedSoft, borderColor: '#ffdad6' },
  tagChipActive: { opacity: 1 },
  tagChipText: { ...typography.caption, fontFamily: fonts.semibold },
  tagChipTextInfo: { color: colors.onSecondaryContainer },
  tagChipTextPriority: { color: colors.error },
  addTagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outline,
  },
  addTagText: { ...typography.caption, color: colors.onSurfaceVariant },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    minHeight: layout.touchMin,
  },
  ownerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatarText: { ...typography.bodySm, fontFamily: fonts.bold, color: colors.primary },
  ownerName: { ...typography.body, flex: 1, color: colors.textPrimary },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(198, 197, 211, 0.3)',
  },
  summaryCompany: { ...typography.caption, color: colors.secondary },
  summaryTitle: { ...typography.headlineMd, color: colors.textPrimary },
  summaryMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  summaryMetaText: { ...typography.bodySm, color: colors.secondary },
  summaryProducts: { ...typography.bodySm, color: colors.onSurfaceVariant },
  summaryAmount: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: fonts.bold,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.sm,
  },
  summaryDate: { ...typography.bodySm, color: colors.secondary },
  summaryOwner: { ...typography.bodySm, color: colors.secondary },
  summaryTags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  summaryTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerLow,
  },
  summaryTagText: { ...typography.caption, color: colors.onSurfaceVariant },
});
