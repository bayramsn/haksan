import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard, shadowElevated } from '@/src/theme/styles';

const sectionCard: ViewStyle = {
  backgroundColor: colors.card,
  borderRadius: 16,
  padding: spacing.lg,
  marginBottom: spacing.md,
  ...shadowCard,
};

export const SERVICE_CATEGORIES = ['Arıza', 'Bakım', 'Kurulum', 'Kalibrasyon'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_PRIORITIES = ['Düşük', 'Orta', 'Yüksek', 'Kritik'] as const;
export type ServicePriority = (typeof SERVICE_PRIORITIES)[number];

export type ServiceTicketStep = 1 | 2 | 3;

export function categoryToTicketType(category: ServiceCategory): 'complaint' | 'request' {
  return category === 'Arıza' ? 'complaint' : 'request';
}

export function priorityToSeverity(priority: ServicePriority): 'low' | 'normal' | 'high' | 'critical' {
  if (priority === 'Düşük') return 'low';
  if (priority === 'Yüksek') return 'high';
  if (priority === 'Kritik') return 'critical';
  return 'normal';
}

export function priorityVisual(priority: ServicePriority) {
  if (priority === 'Yüksek') {
    return { border: colors.error, text: colors.error, bg: 'rgba(255, 218, 214, 0.2)' };
  }
  if (priority === 'Kritik') {
    return { border: colors.error, text: colors.error, bg: '#ffdad6' };
  }
  return { border: colors.surfaceVariant, text: colors.secondary, bg: 'transparent' };
}

/** Stitch Yeni Servis Talebi — `7bae69e33bef4490af93ee7ea66f617a` */
export function ServiceTicketFormHeader({
  onClose,
  onSave,
  saving,
}: {
  onClose: () => void;
  onSave?: () => void;
  saving?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [styles.headerIcon, pressFade(pressed)]}>
        <Ionicons name="close" size={24} color={colors.secondary} />
      </Pressable>
      <Text style={styles.headerTitle}>Yeni Kayıt</Text>
      <Pressable
        onPress={onSave}
        disabled={saving}
        hitSlop={8}
        style={({ pressed }) => [styles.saveBtn, pressFade(pressed)]}
      >
        {saving ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={styles.saveBtnText}>Kaydet</Text>
        )}
      </Pressable>
    </View>
  );
}

export function ServiceTicketFormStepper({ step }: { step: ServiceTicketStep }) {
  const steps: { n: ServiceTicketStep; label: string }[] = [
    { n: 1, label: 'Bilgi' },
    { n: 2, label: 'Detay' },
    { n: 3, label: 'Onay' },
  ];

  return (
    <View style={styles.stepperWrap}>
      <View style={styles.stepperLine} />
      <View style={styles.stepperRow}>
        {steps.map((item) => {
          const active = step === item.n;
          const done = step > item.n;
          return (
            <View key={item.n} style={styles.stepperCol}>
              <View style={[styles.stepDot, (active || done) && styles.stepDotActive, !active && !done && styles.stepDotIdle]}>
                <Text style={[styles.stepDotText, (active || done) && styles.stepDotTextActive]}>{item.n}</Text>
              </View>
              <Text style={[styles.stepLabel, (active || done) && styles.stepLabelActive]}>{item.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function ServiceTicketSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ServiceTicketSelectRow({
  label,
  required,
  value,
  placeholder,
  left,
  onPress,
}: {
  label: string;
  required?: boolean;
  value?: string;
  placeholder: string;
  left?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.selectRow, pressFade(pressed)]}>
        <View style={styles.selectLeft}>
          {left}
          <Text style={[styles.selectText, !value && styles.selectPlaceholder]} numberOfLines={1}>
            {value || placeholder}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
      </Pressable>
    </View>
  );
}

export function ServiceTicketCompanyAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View style={styles.companyAvatar}>
      <Text style={styles.companyAvatarText}>{initials || '?'}</Text>
    </View>
  );
}

export function ServiceTicketMachineIcon() {
  return (
    <View style={styles.machineIcon}>
      <Ionicons name="construct-outline" size={18} color={colors.secondary} />
    </View>
  );
}

export function ServiceTicketLocationChip({ label }: { label: string }) {
  return (
    <View style={styles.locationChip}>
      <Ionicons name="location-outline" size={16} color={colors.secondary} />
      <Text style={styles.locationChipText}>{label}</Text>
    </View>
  );
}

export function ServiceTicketCategorySegment({
  value,
  onChange,
}: {
  value: ServiceCategory;
  onChange: (v: ServiceCategory) => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>
        Kategori<Text style={styles.required}> *</Text>
      </Text>
      <View style={styles.categoryWrap}>
        {SERVICE_CATEGORIES.map((cat) => {
          const active = cat === value;
          return (
            <Pressable
              key={cat}
              onPress={() => onChange(cat)}
              style={[styles.categoryBtn, active && styles.categoryBtnActive]}
            >
              <Text style={[styles.categoryBtnText, active && styles.categoryBtnTextActive]}>{cat}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ServiceTicketPriorityChips({
  value,
  onChange,
}: {
  value: ServicePriority;
  onChange: (v: ServicePriority) => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>
        Öncelik<Text style={styles.required}> *</Text>
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.priorityRow}>
        {SERVICE_PRIORITIES.map((p) => {
          const active = p === value;
          const visual = priorityVisual(p);
          return (
            <Pressable
              key={p}
              onPress={() => onChange(p)}
              style={[
                styles.priorityChip,
                { borderColor: active ? visual.border : colors.surfaceVariant },
                active && visual.bg !== 'transparent' ? { backgroundColor: visual.bg } : null,
              ]}
            >
              <Text
                style={[
                  styles.priorityChipText,
                  { color: active ? visual.text : colors.secondary },
                  active && p === 'Yüksek' && styles.priorityChipTextBold,
                ]}
              >
                {p}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function ServiceTicketFieldInput({
  label,
  required,
  ...inputProps
}: {
  label: string;
  required?: boolean;
} & TextInputProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor={colors.outlineVariant}
        style={[styles.input, inputProps.multiline && styles.inputMultiline]}
        {...inputProps}
      />
    </View>
  );
}

export function ServiceTicketDescriptionField({
  value,
  onChangeText,
  maxLength = 500,
}: {
  value: string;
  onChangeText: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>
        Açıklama<Text style={styles.required}> *</Text>
      </Text>
      <View style={styles.textareaWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Belirtileri, ne zaman başladığını, etkilenen işlemleri yazın…"
          placeholderTextColor={`${colors.secondary}99`}
          multiline
          maxLength={maxLength}
          style={styles.textarea}
        />
        <Text style={styles.charCount}>
          {value.length}/{maxLength}
        </Text>
      </View>
    </View>
  );
}

export function ServiceTicketPhotoGrid({
  photos,
  onAdd,
  onRemove,
}: {
  photos: string[];
  onAdd: () => void;
  onRemove: (uri: string) => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>Fotoğraflar</Text>
      <View style={styles.photoGrid}>
        {photos.map((uri) => (
          <View key={uri} style={styles.photoTile}>
            <Image source={{ uri }} style={styles.photoImage} />
            <Pressable onPress={() => onRemove(uri)} style={styles.photoRemove}>
              <Ionicons name="close" size={14} color={colors.textPrimary} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={onAdd} style={({ pressed }) => [styles.photoAdd, pressFade(pressed)]}>
          <Ionicons name="image-outline" size={24} color={colors.secondary} />
          <Text style={styles.photoAddText}>+ Ekle</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ServiceTicketVoiceNoteButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.voiceBtn, pressFade(pressed)]}>
      <Ionicons name="mic-outline" size={20} color={colors.primary} />
      <Text style={styles.voiceBtnText}>Sesli Not Ekle</Text>
    </Pressable>
  );
}

export function ServiceTicketToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

export function ServiceTicketSummaryCard({
  companyName,
  machineLabel,
  category,
  priority,
  subject,
  description,
  fieldVisitRequired,
}: {
  companyName: string;
  machineLabel: string;
  category: ServiceCategory;
  priority: ServicePriority;
  subject: string;
  description: string;
  fieldVisitRequired: boolean;
}) {
  return (
    <View style={[styles.summaryCard, sectionCard]}>
      <Text style={styles.summaryTitle}>Talep Özeti</Text>
      <SummaryRow label="Müşteri" value={companyName} />
      <SummaryRow label="Makine" value={machineLabel} />
      <SummaryRow label="Kategori" value={category} />
      <SummaryRow label="Öncelik" value={priority} />
      <SummaryRow label="Başlık" value={subject || '—'} />
      <SummaryRow label="Açıklama" value={description ? description.slice(0, 80) : '—'} />
      <SummaryRow label="Saha ziyareti" value={fieldVisitRequired ? 'Gerekli' : 'Gerekmez'} />
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function ServiceTicketFormFooter({
  step,
  loading,
  onCancel,
  onPrimary,
}: {
  step: ServiceTicketStep;
  loading?: boolean;
  onCancel: () => void;
  onPrimary: () => void;
}) {
  const insets = useSafeAreaInsets();
  const primaryLabel = step === 3 ? 'Talep Aç' : 'Sonraki Adım';

  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }, shadowElevated]}>
      <Pressable onPress={onCancel} style={({ pressed }) => [styles.footerSecondary, pressFade(pressed)]}>
        <Text style={styles.footerSecondaryText}>{step === 1 ? 'Vazgeç' : 'Geri'}</Text>
      </Pressable>
      <Pressable
        onPress={onPrimary}
        disabled={loading}
        style={({ pressed }) => [
          styles.footerPrimary,
          pressFade(pressed),
          loading && styles.footerPrimaryDisabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.footerPrimaryText}>{primaryLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

export function deviceLabelFromRow(row: Record<string, unknown>): string {
  const model = String(row.productModelName ?? row.modelName ?? row.model ?? 'Makine');
  const serial = String(row.serialNumber ?? row.id ?? '').slice(0, 12);
  return serial ? `${model} (${serial})` : model;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: layout.containerMargin,
    backgroundColor: colors.canvas,
  },
  headerIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  saveBtn: {
    minWidth: 52,
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 40,
  },
  saveBtnText: {
    ...typography.label,
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  stepperWrap: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    backgroundColor: colors.canvas,
  },
  stepperLine: {
    position: 'absolute',
    left: layout.containerMargin + 24,
    right: layout.containerMargin + 24,
    top: spacing.sm + 12,
    height: 1,
    backgroundColor: colors.surfaceVariant,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepperCol: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing.sm,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepDotIdle: { backgroundColor: colors.surfaceVariant },
  stepDotText: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.onSurfaceVariant,
  },
  stepDotTextActive: { color: '#fff' },
  stepLabel: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  stepLabelActive: {
    color: colors.primary,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  fieldBlock: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.secondary,
  },
  required: { color: colors.error },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
    padding: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  selectLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  selectText: {
    flex: 1,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  selectPlaceholder: {
    color: colors.outline,
  },
  companyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
  },
  companyAvatarText: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.onSecondaryContainer,
  },
  machineIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
  },
  locationChipText: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  categoryWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  categoryBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  categoryBtnActive: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  categoryBtnText: {
    ...typography.label,
    color: colors.secondary,
  },
  categoryBtnTextActive: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
  },
  priorityRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  priorityChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  priorityChipText: {
    ...typography.label,
  },
  priorityChipTextBold: {
    fontFamily: fonts.semibold,
  },
  input: {
    height: 48,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    ...typography.bodySm,
    color: colors.textPrimary,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputMultiline: {
    height: undefined,
    minHeight: 48,
  },
  textareaWrap: {
    position: 'relative',
  },
  textarea: {
    minHeight: 110,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    ...typography.bodySm,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  charCount: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.sm,
    ...typography.caption,
    color: colors.secondary,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  photoAddText: {
    ...typography.caption,
    color: colors.secondary,
  },
  voiceBtn: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  voiceBtnText: {
    ...typography.label,
    color: colors.primary,
    fontFamily: fonts.medium,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  toggleLabel: {
    ...typography.bodySm,
    color: colors.textPrimary,
    flex: 1,
    paddingRight: spacing.md,
  },
  summaryCard: {
    gap: spacing.sm,
  },
  summaryTitle: {
    ...typography.headlineMd,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHigh,
  },
  summaryLabel: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  summaryValue: {
    ...typography.bodySm,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
    backgroundColor: 'rgba(249, 249, 250, 0.95)',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
  },
  footerSecondary: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  footerSecondaryText: {
    ...typography.label,
    color: colors.primary,
    fontFamily: fonts.medium,
  },
  footerPrimary: {
    flex: 1.5,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerPrimaryDisabled: {
    opacity: 0.85,
  },
  footerPrimaryText: {
    ...typography.label,
    color: '#fff',
    fontFamily: fonts.semibold,
  },
});
