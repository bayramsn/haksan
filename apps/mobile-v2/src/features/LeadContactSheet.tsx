import { forwardRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as Crypto from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { LEAD_CONTACT_CHANNELS, LEAD_CONTACT_OUTCOMES, type LeadContactChannelCode, type LeadContactOutcomeCode } from '@haksan/shared';
import { opportunities } from '@/src/api/endpoints';
import { opportunityKeys } from '@/src/api/crm.hooks';
import { parseLocalDateTime } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const CHANNEL_LABELS: Record<LeadContactChannelCode, string> = { phone: 'Telefon', email: 'E-posta', whatsapp: 'WhatsApp' };
const OUTCOME_LABELS: Record<LeadContactOutcomeCode, string> = {
  no_answer: 'Ulaşılamadı',
  contacted: 'Görüşüldü',
  callback: 'Geri aranacak',
  requested_info: 'Bilgi istedi',
  meeting_booked: 'Toplantı ayarlandı',
  not_interested: 'İlgilenmiyor',
  wrong_contact: 'Yanlış kişi',
};

function Choice<T extends string>({ options, labels, value, onChange }: { options: readonly T[]; labels: Record<T, string>; value: T | null; onChange: (next: T) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            className={`min-h-10 justify-center rounded-full border px-3.5 ${active ? 'border-primary bg-primary' : 'border-border bg-card'}`}
          >
            <Text className={`font-inter-medium text-[13px] ${active ? 'text-primary-foreground' : 'text-foreground'}`}>{labels[option]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Lead kartına temas kaydı: kanal + sonuç + not, isteğe bağlı sonraki aksiyon. */
export const LeadContactSheet = forwardRef<BottomSheetModal, { opportunityId: string }>(function LeadContactSheet({ opportunityId }, ref) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [channel, setChannel] = useState<LeadContactChannelCode | null>('phone');
  const [outcome, setOutcome] = useState<LeadContactOutcomeCode | null>(null);
  const [note, setNote] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionAt, setNextActionAt] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Aynı kayıt iki kez gönderilmesin: anahtar ancak başarılı kayıttan sonra yenilenir.
  const [idempotencyKey, setIdempotencyKey] = useState(() => Crypto.randomUUID());

  async function save() {
    if (!channel || !outcome) return setError('Kanal ve sonucu seçin.');
    let actionAt: Date | null = null;
    if (nextActionAt.trim()) {
      actionAt = parseLocalDateTime(nextActionAt.trim());
      if (!actionAt) return setError('Takip zamanı biçimi: YYYY-AA-GG SS:DD');
      if (!nextAction.trim()) return setError('Takip zamanı için sonraki aksiyonu yazın.');
    }
    setSaving(true);
    setError('');
    try {
      await opportunities.recordContact(opportunityId, {
        idempotencyKey,
        channel,
        outcome,
        note: note.trim() || undefined,
        nextAction: nextAction.trim() || undefined,
        nextActionAt: actionAt ?? undefined,
      });
      await qc.invalidateQueries({ queryKey: opportunityKeys.all });
      toast.success('Görüşme kaydedildi');
      setIdempotencyKey(Crypto.randomUUID());
      setOutcome(null);
      setNote('');
      setNextAction('');
      setNextActionAt('');
      if (typeof ref !== 'function') ref?.current?.dismiss();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Görüşme kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      keyboardBlurBehavior="restore"
      backgroundStyle={{ backgroundColor: colors.card }}
      handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
      backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
    >
      <BottomSheetScrollView contentContainerStyle={{ gap: 14, paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text className="font-inter-semibold text-[17px] text-foreground">Görüşme kaydet</Text>
        <View className="gap-2">
          <Text className="font-inter-medium text-xs text-muted-foreground">Kanal</Text>
          <Choice options={LEAD_CONTACT_CHANNELS} labels={CHANNEL_LABELS} value={channel} onChange={setChannel} />
        </View>
        <View className="gap-2">
          <Text className="font-inter-medium text-xs text-muted-foreground">Sonuç</Text>
          <Choice options={LEAD_CONTACT_OUTCOMES} labels={OUTCOME_LABELS} value={outcome} onChange={setOutcome} />
        </View>
        <Field label="Not" value={note} onChangeText={setNote} multiline numberOfLines={3} maxLength={2000} />
        <Field label="Sonraki aksiyon" value={nextAction} onChangeText={setNextAction} maxLength={1000} />
        <Field label="Takip zamanı" value={nextActionAt} onChangeText={setNextActionAt} placeholder="YYYY-AA-GG SS:DD" keyboardType="numbers-and-punctuation" maxLength={16} />
        {error ? <Text accessibilityRole="alert" className="font-inter text-sm text-destructive">{error}</Text> : null}
        <Button label="Kaydet" loading={saving} disabled={saving} onPress={() => void save()} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});
