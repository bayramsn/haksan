import {
  Pressable,
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
  borderRadius: radius.lg,
  padding: spacing.lg,
  ...shadowCard,
};

export const VISIT_TYPES = ['Saha', 'Online', 'Fuar', 'Demo'] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const VISIT_PURPOSES = [
  'Yeni Satış',
  'Mevcut Geliştirme',
  'Sorun Çözüm',
  'Sunum',
  'Demo',
] as const;
export type VisitPurpose = (typeof VISIT_PURPOSES)[number];

export const REMINDER_OPTIONS = ['1 gün önce', '15 dk önce', '1 saat önce'] as const;
export type ReminderOption = (typeof REMINDER_OPTIONS)[number];

export type VisitStep = 1 | 2 | 3;

export type Participant = {
  id: string;
  name: string;
  role?: string;
  kind: 'customer' | 'team';
  isSelf?: boolean;
};

/** Stitch Yeni Ziyaret Planla — `7456e3b60ec94b6faa3d282858eead0a` */
export function VisitFormHeader({
  onClose,
  onDraft,
}: {
  onClose: () => void;
  onDraft?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <Pressable
        onPress={onClose}
        hitSlop={8}
        style={({ pressed }) => [styles.headerIconBtn, pressFade(pressed)]}
        accessibilityLabel="Kapat"
      >
        <Ionicons name="close" size={24} color={colors.onSurfaceVariant} />
      </Pressable>
      <Text style={styles.headerTitle}>Yeni Ziyaret Planla</Text>
      <Pressable
        onPress={onDraft}
        hitSlop={8}
        style={({ pressed }) => [styles.draftBtn, pressFade(pressed)]}
      >
        <Text style={styles.draftBtnText}>Taslak</Text>
      </Pressable>
    </View>
  );
}

export function VisitFormStepper({ step }: { step: VisitStep }) {
  const steps: { n: VisitStep; label: string }[] = [
    { n: 1, label: 'Bilgi' },
    { n: 2, label: 'Hedef' },
    { n: 3, label: 'Onay' },
  ];

  return (
    <View style={styles.stepper}>
      {steps.map((item, index) => {
        const active = step === item.n;
        const done = step > item.n;
        const showLine = index < steps.length - 1;
        const lineActive = step > item.n;

        return (
          <View key={item.n} style={styles.stepperItemWrap}>
            <View style={styles.stepperCol}>
              <View
                style={[
                  styles.stepDot,
                  (active || done) && styles.stepDotActive,
                  !active && !done && styles.stepDotIdle,
                ]}
              >
                <Text
                  style={[
                    styles.stepDotText,
                    (active || done) && styles.stepDotTextActive,
                    !active && !done && styles.stepDotTextIdle,
                  ]}
                >
                  {item.n}
                </Text>
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  (active || done) && styles.stepLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </View>
            {showLine ? (
              <View
                style={[
                  styles.stepLine,
                  lineActive ? styles.stepLineActive : styles.stepLineIdle,
                ]}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function VisitCustomerCard({
  companyName,
  companyCode,
  segmentLabel,
  initials,
  onChange,
}: {
  companyName: string;
  companyCode?: string;
  segmentLabel?: string;
  initials: string;
  onChange: () => void;
}) {
  return (
    <View style={[styles.customerCard, sectionCard]}>
      <View style={styles.customerAvatar}>
        <Text style={styles.customerAvatarText}>{initials}</Text>
      </View>
      <View style={styles.customerBody}>
        <Text style={styles.customerName} numberOfLines={1}>
          {companyName || 'Firma seçin'}
        </Text>
        <Text style={styles.customerMeta} numberOfLines={1}>
          {companyCode ? `${companyCode} · Müşteri` : 'Müşteri seçilmedi'}
        </Text>
        {segmentLabel ? (
          <View style={styles.segmentBadge}>
            <Text style={styles.segmentBadgeText}>{segmentLabel}</Text>
          </View>
        ) : null}
      </View>
      <Pressable onPress={onChange} hitSlop={8} style={({ pressed }) => pressFade(pressed)}>
        <Text style={styles.changeBtn}>Değiştir</Text>
      </Pressable>
    </View>
  );
}

export function VisitFormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, sectionCard]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function VisitTypeSegment({
  value,
  onChange,
}: {
  value: VisitType;
  onChange: (v: VisitType) => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <VisitFieldLabel label="Tip" required />
      <View style={styles.typeSegmentWrap}>
        {VISIT_TYPES.map((type) => {
          const active = type === value;
          return (
            <Pressable
              key={type}
              onPress={() => onChange(type)}
              style={[styles.typeSegmentBtn, active && styles.typeSegmentBtnActive]}
            >
              <Text style={[styles.typeSegmentText, active && styles.typeSegmentTextActive]}>
                {type}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function VisitPurposeChips({
  selected,
  onToggle,
}: {
  selected: VisitPurpose[];
  onToggle: (purpose: VisitPurpose) => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <VisitFieldLabel label="Amaç" required />
      <View style={styles.chipWrap}>
        {VISIT_PURPOSES.map((purpose) => {
          const active = selected.includes(purpose);
          return (
            <Pressable
              key={purpose}
              onPress={() => onToggle(purpose)}
              style={[styles.purposeChip, active && styles.purposeChipActive]}
            >
              <Text style={[styles.purposeChipText, active && styles.purposeChipTextActive]}>
                {purpose}
              </Text>
              {active ? (
                <Ionicons name="close" size={14} color="#fff" />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function VisitFieldLabel({
  label,
  required,
}: {
  label: string;
  required?: boolean;
}) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

export function VisitFieldInput({
  label,
  required,
  ...inputProps
}: {
  label: string;
  required?: boolean;
} & TextInputProps) {
  return (
    <View style={styles.fieldBlock}>
      <VisitFieldLabel label={label} required={required} />
      <TextInput
        placeholderTextColor={colors.outline}
        style={[styles.input, inputProps.multiline && styles.inputMultiline]}
        {...inputProps}
      />
    </View>
  );
}

export function VisitTimeRow({
  startTime,
  endTime,
  onStartChange,
  onEndChange,
}: {
  startTime: string;
  endTime: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
}) {
  return (
    <View style={styles.timeRow}>
      <View style={styles.timeCol}>
        <VisitFieldLabel label="Başlangıç" required />
        <TextInput
          value={startTime}
          onChangeText={onStartChange}
          placeholder="10:00"
          placeholderTextColor={colors.outline}
          style={styles.input}
        />
      </View>
      <View style={styles.timeCol}>
        <VisitFieldLabel label="Bitiş" required />
        <TextInput
          value={endTime}
          onChangeText={onEndChange}
          placeholder="12:00"
          placeholderTextColor={colors.outline}
          style={styles.input}
        />
      </View>
    </View>
  );
}

export function VisitSelectField({
  label,
  value,
  placeholder,
  onPress,
  leftIcon,
}: {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  leftIcon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.fieldBlock}>
      <VisitFieldLabel label={label} />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.selectTrigger, pressFade(pressed)]}
      >
        {leftIcon ? (
          <Ionicons name={leftIcon} size={18} color={colors.primary} style={styles.selectLeftIcon} />
        ) : null}
        <Text
          style={[styles.selectText, !value && styles.selectPlaceholder]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

export function VisitLocationPreview({
  locationLabel,
  onDirections,
}: {
  locationLabel?: string;
  onDirections?: () => void;
}) {
  if (!locationLabel) return null;

  return (
    <View style={styles.mapRow}>
      <View style={styles.mapThumb}>
        <Ionicons name="location" size={22} color={colors.primary} />
      </View>
      <Pressable onPress={onDirections} style={({ pressed }) => pressFade(pressed)}>
        <Text style={styles.directionsLink}>Yol Tarifi</Text>
      </Pressable>
    </View>
  );
}

export function VisitParticipantChip({
  participant,
  onRemove,
}: {
  participant: Participant;
  onRemove?: () => void;
}) {
  const initials = initialsFromName(participant.name);
  const isTeam = participant.kind === 'team';

  return (
    <View style={[styles.participantChip, isTeam && styles.participantChipTeam]}>
      <View style={[styles.participantAvatar, isTeam && styles.participantAvatarTeam]}>
        <Text style={[styles.participantAvatarText, isTeam && styles.participantAvatarTextTeam]}>
          {initials}
        </Text>
      </View>
      <Text style={[styles.participantName, isTeam && styles.participantNameTeam]}>
        {participant.name}
        {participant.role ? (
          <Text style={styles.participantRole}> ({participant.role})</Text>
        ) : null}
        {participant.isSelf ? (
          <Text style={styles.participantSelf}> (sen)</Text>
        ) : null}
      </Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8}>
          <Ionicons name="close" size={14} color={isTeam ? 'rgba(255,255,255,0.8)' : colors.onSurfaceVariant} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function VisitAddChipButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.addChipBtn, pressFade(pressed)]}
    >
      <Ionicons name={icon} size={16} color={colors.onSurfaceVariant} />
      <Text style={styles.addChipBtnText}>{label}</Text>
    </Pressable>
  );
}

export function VisitReminderChips({
  selected,
  onToggle,
  onAdd,
}: {
  selected: ReminderOption[];
  onToggle: (option: ReminderOption) => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <VisitFieldLabel label="Hatırlatma" />
      <View style={styles.chipWrap}>
        {selected.map((option) => (
          <Pressable
            key={option}
            onPress={() => onToggle(option)}
            style={[styles.reminderChip, styles.reminderChipActive]}
          >
            <Text style={styles.reminderChipTextActive}>{option}</Text>
            <Ionicons name="close" size={14} color={colors.onSecondaryContainer} />
          </Pressable>
        ))}
        <VisitAddChipButton label="Ekle" icon="notifications-outline" onPress={onAdd} />
      </View>
    </View>
  );
}

export function VisitToggleRow({
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

export function VisitSummaryCard({
  companyName,
  visitType,
  subject,
  purposes,
  dateLabel,
  timeRange,
  location,
}: {
  companyName: string;
  visitType: VisitType;
  subject: string;
  purposes: VisitPurpose[];
  dateLabel: string;
  timeRange: string;
  location?: string;
}) {
  return (
    <View style={[styles.summaryCard, sectionCard]}>
      <Text style={styles.summaryTitle}>Ziyaret Özeti</Text>
      <SummaryRow label="Firma" value={companyName} />
      <SummaryRow label="Tip" value={visitType} />
      <SummaryRow label="Konu" value={subject || '—'} />
      <SummaryRow label="Amaç" value={purposes.length ? purposes.join(', ') : '—'} />
      <SummaryRow label="Tarih" value={dateLabel} />
      <SummaryRow label="Saat" value={timeRange} />
      {location ? <SummaryRow label="Konum" value={location} /> : null}
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export function VisitFormFooter({
  step,
  loading,
  onCancel,
  onPrimary,
}: {
  step: VisitStep;
  loading?: boolean;
  onCancel: () => void;
  onPrimary: () => void;
}) {
  const insets = useSafeAreaInsets();
  const primaryLabel = step === 3 ? 'Ziyareti Planla' : 'Sonraki';

  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }, shadowCard]}>
      <Pressable
        onPress={onCancel}
        style={({ pressed }) => [styles.footerSecondary, pressFade(pressed)]}
      >
        <Text style={styles.footerSecondaryText}>{step === 1 ? 'Vazgeç' : 'Geri'}</Text>
      </Pressable>
      <Pressable
        onPress={onPrimary}
        disabled={loading}
        style={({ pressed }) => [
          styles.footerPrimary,
          shadowElevated,
          pressFade(pressed),
          loading && styles.footerPrimaryDisabled,
        ]}
      >
        <Text style={styles.footerPrimaryText}>{loading ? 'Kaydediliyor…' : primaryLabel}</Text>
        {step < 3 && !loading ? (
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        ) : null}
      </Pressable>
    </View>
  );
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function formatDateDisplayTr(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const formatted = date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return `${formatted} · ${days[date.getDay()]}`;
}

export function combineDateAndTime(isoDate: string, time: string): Date {
  const [hh = '10', mm = '00'] = time.split(':');
  return new Date(`${isoDate}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:00`);
}

export function buildVisitPurposePayload({
  visitType,
  subject,
  purposes,
  notes,
  reminders,
}: {
  visitType: VisitType;
  subject: string;
  purposes: VisitPurpose[];
  notes?: string;
  reminders?: ReminderOption[];
}): string {
  const parts = [`[${visitType}] ${subject.trim()}`];
  if (purposes.length) parts.push(`Amaç: ${purposes.join(', ')}`);
  if (reminders?.length) parts.push(`Hatırlatma: ${reminders.join(', ')}`);
  if (notes?.trim()) parts.push(`Not: ${notes.trim()}`);
  return parts.join(' · ').slice(0, 1000);
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.md,
    backgroundColor: colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceVariant,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.headlineMd,
    color: colors.textPrimary,
  },
  draftBtn: {
    minWidth: 52,
    alignItems: 'flex-end',
  },
  draftBtnText: {
    ...typography.label,
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    maxWidth: 280,
    alignSelf: 'center',
    width: '100%',
  },
  stepperItemWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepperCol: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: colors.primary,
  },
  stepDotIdle: {
    backgroundColor: colors.surfaceVariant,
  },
  stepDotText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.semibold,
  },
  stepDotTextActive: {
    color: '#fff',
  },
  stepDotTextIdle: {
    color: colors.onSurfaceVariant,
  },
  stepLabel: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  stepLabelActive: {
    color: colors.primary,
  },
  stepLine: {
    flex: 1,
    height: 1,
    marginTop: 12,
    marginHorizontal: spacing.sm,
  },
  stepLineActive: {
    backgroundColor: colors.primary,
    opacity: 0.3,
  },
  stepLineIdle: {
    backgroundColor: colors.surfaceVariant,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    ...typography.headlineMd,
    color: '#fff',
  },
  customerBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  customerName: {
    ...typography.bodySm,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
  },
  customerMeta: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  segmentBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.secondaryContainer,
  },
  segmentBadgeText: {
    ...typography.caption,
    color: colors.onSecondaryContainer,
    fontFamily: fonts.semibold,
  },
  changeBtn: {
    ...typography.label,
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.onSurfaceVariant,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  fieldBlock: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  required: {
    color: colors.error,
  },
  typeSegmentWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  typeSegmentBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  typeSegmentBtnActive: {
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  typeSegmentText: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  typeSegmentTextActive: {
    color: '#fff',
    fontFamily: fonts.medium,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  purposeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  purposeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  purposeChipText: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  purposeChipTextActive: {
    color: '#fff',
  },
  input: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  timeCol: {
    flex: 1,
    gap: spacing.xs,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  selectLeftIcon: {
    marginRight: -4,
  },
  selectText: {
    flex: 1,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  selectPlaceholder: {
    color: colors.outline,
  },
  mapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  mapThumb: {
    width: 96,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionsLink: {
    ...typography.label,
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  participantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.md,
    paddingLeft: 4,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
  },
  participantChipTeam: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  participantAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantAvatarTeam: {
    backgroundColor: '#fff',
  },
  participantAvatarText: {
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.onSecondaryContainer,
  },
  participantAvatarTextTeam: {
    color: colors.primary,
  },
  participantName: {
    ...typography.label,
    color: colors.textPrimary,
  },
  participantNameTeam: {
    color: '#fff',
  },
  participantRole: {
    color: colors.onSurfaceVariant,
    fontFamily: fonts.regular,
  },
  participantSelf: {
    opacity: 0.7,
    fontFamily: fonts.regular,
  },
  addChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
  },
  addChipBtnText: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  reminderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  reminderChipActive: {
    backgroundColor: colors.secondaryContainer,
  },
  reminderChipTextActive: {
    ...typography.label,
    color: colors.onSecondaryContainer,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
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
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
  },
  footerSecondary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  footerSecondaryText: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  footerPrimary: {
    flex: 1,
    maxWidth: '65%',
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  footerPrimaryDisabled: {
    opacity: 0.7,
  },
  footerPrimaryText: {
    ...typography.headlineMd,
    color: '#fff',
  },
});
