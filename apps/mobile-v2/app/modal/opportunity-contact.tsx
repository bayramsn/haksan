import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as Crypto from 'expo-crypto';
import type { LeadContactEventBody } from '@/src/api/sales.api';
import { useRecordLeadContact } from '@/src/api/sales.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { parseLocalDateTime } from '@/src/lib/format';
import { Button, Eyebrow, Field } from '@/src/ui';
import { PillGroup } from '@/src/ui/sales/Sheet';
import { CONTACT_CHANNEL_LABELS, CONTACT_OUTCOME_LABELS, validateContactEvent } from '@/src/ui/sales/sales-logic';
import { toast } from '@/src/ui/toast';
import { DateTextField } from '@/src/ui/select/DateTextField';

type Channel = LeadContactEventBody['channel'];
type Outcome = LeadContactEventBody['outcome'];

const CHANNEL_OPTIONS = (Object.keys(CONTACT_CHANNEL_LABELS) as Channel[]).map((value) => ({ value, label: CONTACT_CHANNEL_LABELS[value] }));
const OUTCOME_OPTIONS = (Object.keys(CONTACT_OUTCOME_LABELS) as Outcome[]).map((value) => ({ value, label: CONTACT_OUTCOME_LABELS[value] }));

/** Lead ilk temas sonucu (`POST /opportunities/:id/contact-events`). */
export default function OpportunityContactScreen() {
  const router = useRouter();
  const { id, title } = useLocalSearchParams<{ id?: string; title?: string }>();
  const canUpdate = useCan('opportunities.update');
  const record = useRecordLeadContact();

  const [idempotencyKey, setIdempotencyKey] = useState(() => Crypto.randomUUID());
  const [channel, setChannel] = useState<Channel>('phone');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionAt, setNextActionAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!canUpdate || typeof id !== 'string' || !id) return <Redirect href={'/modules/opportunities' as Href} />;
  const opportunityId = id;

  function submit() {
    if (!outcome) {
      setError('Temas sonucunu seçin.');
      return;
    }
    let at: Date | null = null;
    if (nextActionAt.trim()) {
      at = parseLocalDateTime(nextActionAt.trim());
      if (!at) {
        setError('Takip zamanı biçimi: YYYY-AA-GG SS:DD');
        return;
      }
    }
    const invalid = validateContactEvent({ note, nextAction, hasNextActionAt: Boolean(at) });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    record.mutate(
      {
        id: opportunityId,
        body: {
          idempotencyKey,
          channel,
          outcome,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(nextAction.trim() ? { nextAction: nextAction.trim() } : {}),
          ...(at ? { nextActionAt: at.toISOString() } : {}),
        },
      },
      {
        onSuccess: () => {
          setIdempotencyKey(Crypto.randomUUID());
          toast.success(`Temas kaydedildi · ${CONTACT_OUTCOME_LABELS[outcome]}`);
          router.back();
        },
        onError: (err) => toast.error(`Temas kaydedilemedi: ${err.message}`),
      }
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Temas Kaydet', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          {typeof title === 'string' && title ? (
            <Text className="font-display text-lg text-foreground" numberOfLines={2}>{title}</Text>
          ) : null}
          <View className="gap-3">
            <Eyebrow>İlk temas</Eyebrow>
            <PillGroup label="Kanal" options={CHANNEL_OPTIONS} value={channel} onChange={(v) => v && setChannel(v)} allowClear={false} />
            <PillGroup label="Sonuç *" options={OUTCOME_OPTIONS} value={outcome} onChange={(v) => { setOutcome(v); setError(null); }} allowClear={false} />
            <Field label="Not" value={note} onChangeText={setNote} maxLength={2000} multiline numberOfLines={3} />
          </View>
          <View className="gap-3">
            <Eyebrow>Takip</Eyebrow>
            <Field label="Sonraki aksiyon" value={nextAction} onChangeText={setNextAction} maxLength={1000} />
            <DateTextField
              label="Takip zamanı"
              value={nextActionAt}
              onChangeText={setNextActionAt}
              mode="datetime"
            />
          </View>
          {error ? (
            <Text accessibilityRole="alert" className="font-inter-medium text-sm text-destructive">{error}</Text>
          ) : null}
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Temas Kaydet" loading={record.isPending} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
