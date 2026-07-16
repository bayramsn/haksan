import type { ReactNode } from 'react';
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

export const PURCHASE_STEPS = ['Tedarikçi', 'Kalemler', 'Sevkiyat', 'Onay'] as const;

export const PAYMENT_TERM_PRESETS = [30, 60, 90] as const;

export function PurchasePaymentSection({
  paymentType,
  termDays,
  onPaymentTypeChange,
  onTermDaysChange,
}: {
  paymentType: 'cash' | 'term' | 'leasing';
  termDays: string;
  onPaymentTypeChange: (type: 'cash' | 'term' | 'leasing') => void;
  onTermDaysChange: (days: string) => void;
}) {
  const isTerm = paymentType === 'term';
  const presetActive = (days: number) => isTerm && termDays === String(days);

  return (
    <View style={styles.paymentSection}>
      <PurchaseFieldLabel>Ödeme Vade</PurchaseFieldLabel>
      <View style={styles.chipRow}>
        <Pressable
          onPress={() => onPaymentTypeChange('cash')}
          style={[styles.chip, paymentType === 'cash' && styles.chipActive]}
        >
          <Text style={[styles.chipText, paymentType === 'cash' && styles.chipTextActive]}>Peşin</Text>
        </Pressable>
        <Pressable
          onPress={() => onPaymentTypeChange('term')}
          style={[styles.chip, isTerm && styles.chipActive]}
        >
          <Text style={[styles.chipText, isTerm && styles.chipTextActive]}>Vadeli</Text>
        </Pressable>
      </View>

      {isTerm ? (
        <View style={styles.termBlock}>
          <PurchaseFieldLabel>Vade süresi (gün)</PurchaseFieldLabel>
          <TextInput
            value={termDays}
            onChangeText={(text) => onTermDaysChange(text.replace(/[^\d]/g, ''))}
            placeholder="Örn. 45"
            placeholderTextColor={colors.onSurfaceVariant}
            keyboardType="number-pad"
            style={styles.input}
          />
          <View style={styles.presetRow}>
            {PAYMENT_TERM_PRESETS.map((days) => (
              <Pressable
                key={days}
                onPress={() => {
                  onPaymentTypeChange('term');
                  onTermDaysChange(String(days));
                }}
                style={[styles.presetChip, presetActive(days) && styles.presetChipActive]}
              >
                <Text style={[styles.presetChipText, presetActive(days) && styles.presetChipTextActive]}>
                  {days} gün
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function PurchaseFormHeader({
  title,
  onClose,
  onSave,
  saveLabel = 'Taslağı Kaydet',
  saving,
}: {
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saving?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}>
        <Ionicons name="close" size={24} color={colors.primary} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <Pressable
        onPress={onSave}
        disabled={!onSave || saving}
        hitSlop={8}
        style={({ pressed }) => [styles.headerBtn, pressFade(pressed)]}
      >
        <Text style={[styles.saveText, (!onSave || saving) && styles.saveTextDisabled]}>{saveLabel}</Text>
      </Pressable>
    </View>
  );
}

export function PurchaseFormStepper({ activeIndex }: { activeIndex: number }) {
  return (
    <View style={styles.stepper}>
      {PURCHASE_STEPS.map((label, idx) => {
        const active = idx === activeIndex;
        const done = idx < activeIndex;
        return (
          <View key={label} style={styles.stepSegment}>
            {idx > 0 ? <View style={[styles.stepLine, (done || active) && styles.stepLineActive]} /> : null}
            <View style={styles.stepCol}>
              <View style={[styles.stepDot, done || active ? styles.stepDotActive : styles.stepDotPending]}>
                <Text style={[styles.stepNum, (done || active) && styles.stepNumActive]}>{idx + 1}</Text>
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]} numberOfLines={1}>
                {label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function PurchaseBudgetBanner() {
  return (
    <View style={styles.banner}>
      <Ionicons name="warning-outline" size={20} color="#F57F17" />
      <Text style={styles.bannerText}>
        Bütçe limiti kontrolü web panelinde yapılır. Onay gerektiren tutarlar yöneticiye iletilir.
      </Text>
    </View>
  );
}

export function PurchaseSectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={[styles.sectionCard, shadowCard]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function PurchaseFieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function PurchaseSupplierRow({
  supplierName,
  onChange,
}: {
  supplierName: string;
  onChange: () => void;
}) {
  return (
    <View>
      <PurchaseFieldLabel>Tedarikçi *</PurchaseFieldLabel>
      <View style={styles.supplierRow}>
        <Pressable onPress={onChange} style={styles.supplierLeft}>
          <Text style={styles.supplierName} numberOfLines={1}>
            {supplierName || 'Tedarikçi seçin'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.outline} />
        </Pressable>
        <Pressable onPress={onChange}>
          <Text style={styles.changeBtn}>Değiştir</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function PurchaseInputField({
  label,
  ...props
}: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <PurchaseFieldLabel>{label}</PurchaseFieldLabel>
      <TextInput
        placeholderTextColor={colors.onSurfaceVariant}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function PurchaseFormFooter({
  onCancel,
  onSubmit,
  submitLabel = 'Önizle & Onaya Gönder',
  loading,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  loading?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }, shadowCard]}>
      <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelBtn, pressFade(pressed)]}>
        <Text style={styles.cancelBtnText}>Vazgeç</Text>
      </Pressable>
      <Pressable
        onPress={onSubmit}
        disabled={loading}
        style={({ pressed }) => [styles.submitBtn, pressFade(pressed), loading && { opacity: 0.6 }]}
      >
        <Text style={styles.submitBtnText}>{submitLabel}</Text>
      </Pressable>
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
  headerBtn: { minWidth: 72, height: 40, justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    ...typography.headlineMd,
    color: colors.primary,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  saveText: { ...typography.label, color: colors.primary, textAlign: 'right' },
  saveTextDisabled: { opacity: 0.4 },
  stepper: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.xs },
  stepSegment: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  stepLine: { flex: 1, height: 1, backgroundColor: colors.outlineVariant, marginTop: 12, marginHorizontal: 2 },
  stepLineActive: { backgroundColor: colors.primary },
  stepCol: { alignItems: 'center', gap: 4, minWidth: 52 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotPending: { backgroundColor: colors.surfaceContainerHigh },
  stepNum: { ...typography.caption, color: colors.textPrimary },
  stepNumActive: { color: '#fff' },
  stepLabel: { ...typography.caption, color: colors.onSurfaceVariant, textAlign: 'center' },
  stepLabelActive: { color: colors.primary, fontFamily: fonts.semibold },
  banner: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: '#FFF8E1',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FFE082',
    padding: spacing.sm,
    alignItems: 'flex-start',
  },
  bannerText: { flex: 1, ...typography.bodySm, color: '#F57F17' },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: { ...typography.headlineMd, color: colors.primary },
  fieldLabel: { ...typography.label, color: colors.onSurfaceVariant, marginBottom: 4 },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
  },
  supplierLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginRight: spacing.sm },
  supplierName: { flex: 1, ...typography.bodySm, color: colors.textPrimary, fontFamily: fonts.medium },
  changeBtn: { ...typography.label, color: colors.onPrimaryContainer },
  field: { gap: 0 },
  input: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    ...typography.bodySm,
    color: colors.textPrimary,
    minHeight: 44,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: 4,
  },
  chip: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  chipActive: { backgroundColor: colors.card, ...shadowCard },
  chipText: { ...typography.label, color: colors.onSurfaceVariant, fontSize: 11 },
  chipTextActive: { color: colors.primary, fontFamily: fonts.semibold },
  paymentSection: { gap: spacing.sm },
  termBlock: { gap: spacing.xs },
  presetRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', marginTop: spacing.xs },
  presetChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  presetChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  presetChipText: { ...typography.label, color: colors.onSurfaceVariant },
  presetChipTextActive: { color: colors.primary, fontFamily: fonts.semibold },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  cancelBtnText: { ...typography.label, color: colors.onPrimaryContainer },
  submitBtn: {
    flex: 2.2,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { ...typography.label, color: '#fff' },
});
