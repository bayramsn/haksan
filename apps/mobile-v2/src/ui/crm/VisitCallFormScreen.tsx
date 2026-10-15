import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateActivity } from '@/src/api/crm.hooks';
import { useCreateCall, useCreateVisit } from '@/src/api/crm-general.hooks';
import { Button, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { CompanyPicker, ContactPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { CompanyAddressSelect } from '@/src/ui/select/fields';
import {
  VISIT_CALL_LABELS,
  VISIT_CALL_LIMITS,
  buildVisitCallPayloads,
  validateVisitCall,
  type VisitCallKind,
} from './visit-call-logic';

type Params = {
  companyId?: string;
  companyName?: string;
  contactId?: string;
  contactName?: string;
  opportunityId?: string;
};

function initialRecord(id?: string, name?: string): PickedRecord | null {
  return id ? { id, name: name || 'Seçili kayıt' } : null;
}

/** Firma detayı ve haritadan açılan Müşteri Ziyareti / Giden Arama kaydı. */
export function VisitCallFormScreen({ kind }: { kind: VisitCallKind }) {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const createVisit = useCreateVisit();
  const createCall = useCreateCall();
  const createActivity = useCreateActivity();

  const [company, setCompany] = useState<PickedRecord | null>(() => initialRecord(params.companyId, params.companyName));
  const [contact, setContact] = useState<PickedRecord | null>(() => initialRecord(params.contactId, params.contactName));
  const [date, setDate] = useState<Date | null>(() => new Date());
  const [subject, setSubject] = useState('');
  const [location, setLocation] = useState('');
  const [purpose, setPurpose] = useState('');
  const [result, setResult] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [saving, setSaving] = useState(false);

  const label = VISIT_CALL_LABELS[kind];

  async function submit() {
    if (saving) return;
    const form = {
      companyId: company?.id ?? '',
      contactId: contact?.id,
      opportunityId: params.opportunityId,
      date: date ?? new Date(Number.NaN),
      subject,
      location,
      purpose,
      result,
      nextAction,
    };
    const error = validateVisitCall(kind, form);
    if (error) {
      toast.error(error);
      return;
    }
    const { record, activity } = buildVisitCallPayloads(kind, form);
    setSaving(true);
    try {
      if (record.kind === 'visit') await createVisit.mutateAsync(record.body);
      else await createCall.mutateAsync(record.body);
    } catch (err) {
      toast.error(`Aktivite kaydedilemedi · ${err instanceof Error ? err.message : 'API isteği başarısız oldu.'}`);
      setSaving(false);
      return;
    }
    try {
      await createActivity.mutateAsync(activity);
      toast.success(`${label} kaydedildi`);
    } catch (err) {
      toast.error(
        `${label} kaydedildi ancak aktivite geçmişine eklenemedi · ${err instanceof Error ? err.message : 'API isteği başarısız oldu.'}`,
      );
    } finally {
      setSaving(false);
    }
    router.back();
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: `${label} Kaydı`, headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-sm text-muted-foreground">Firma ile yapılan görüşmeyi CRM aktivite geçmişine ekleyin.</Text>
          <CompanyPicker
            label="Firma *"
            value={company}
            clearable={!params.companyId}
            disabled={Boolean(params.companyId) || saving}
            onChange={(next) => {
              setCompany(next);
              if (next?.id !== company?.id) setContact(null);
            }}
          />
          <DateTimeField label="Tarih *" value={date} onChange={setDate} clearable={false} disabled={saving} />
          <Field
            label="Konu"
            value={subject}
            onChangeText={setSubject}
            placeholder={label}
            maxLength={VISIT_CALL_LIMITS.subject}
            editable={!saving}
          />
          <ContactPicker
            label="Kontak"
            companyId={company?.id ?? null}
            value={contact}
            onChange={setContact}
            placeholder="Opsiyonel"
          />
          {kind === 'visit' ? (
            <>
              <CompanyAddressSelect
                label="Konum"
                companyId={company?.id}
                value={location}
                onChange={(next) => setLocation(next.slice(0, VISIT_CALL_LIMITS.location))}
                disabled={saving}
              />
              <Field label="Amaç" value={purpose} onChangeText={setPurpose} maxLength={VISIT_CALL_LIMITS.purpose} editable={!saving} />
            </>
          ) : null}
          <Field
            label="Sonuç"
            value={result}
            onChangeText={setResult}
            multiline
            maxLength={VISIT_CALL_LIMITS.result}
            className="min-h-[88px]"
            textAlignVertical="top"
            editable={!saving}
          />
          <Field
            label="Sonraki adım"
            value={nextAction}
            onChangeText={setNextAction}
            multiline
            maxLength={VISIT_CALL_LIMITS.nextAction}
            className="min-h-[64px]"
            textAlignVertical="top"
            editable={!saving}
          />
          <View className="flex-row gap-3 pt-2">
            <View className="flex-1">
              <Button label="İptal" variant="ghost" disabled={saving} onPress={() => router.back()} />
            </View>
            <View className="flex-1">
              <Button label={saving ? 'Kaydediliyor…' : 'Kaydet'} loading={saving} disabled={saving || !company} onPress={() => void submit()} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
