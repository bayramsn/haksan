import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateServiceComplaint } from '@/src/api/service.endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { CompanyPickerField, type PickedCompany } from '@/src/features/CompanyPickerField';
import { Button, Eyebrow, Field } from '@/src/ui';
import { ChoiceChips } from '@/src/features/ChoiceChips';
import { toast } from '@/src/ui/toast';

type Severity = 'low' | 'normal' | 'high' | 'critical';
type TicketType = 'complaint' | 'request' | 'warranty_claim' | 'question';

const SEVERITIES: { value: Severity; label: string }[] = [
  { value: 'low', label: 'Düşük' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yüksek' },
  { value: 'critical', label: 'Kritik' },
];
const TYPES: { value: TicketType; label: string }[] = [
  { value: 'complaint', label: 'Şikayet' },
  { value: 'request', label: 'Talep' },
  { value: 'warranty_claim', label: 'Garanti' },
  { value: 'question', label: 'Soru' },
];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

/** Gelen şikayet kaydı (web CreateComplaintDialog). Makine kartından açılınca firma ve makine dolu gelir. */
export default function NewComplaintScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string; customerDeviceId?: string; deviceLabel?: string }>();
  const canCreate = useCan('service_tickets.create');
  const create = useCreateServiceComplaint();
  const deviceId = first(params.customerDeviceId);
  const [company, setCompany] = useState<PickedCompany | null>(
    params.companyId ? { id: first(params.companyId), name: first(params.companyName) || 'Firma' } : null
  );
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('normal');
  const [ticketType, setTicketType] = useState<TicketType>('complaint');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [subjectError, setSubjectError] = useState('');

  if (!canCreate) return <Redirect href="/modules/service-complaints" />;

  function submit() {
    if (subject.trim().length < 3) {
      setSubjectError('Konu en az 3 karakter olmalı.');
      return;
    }
    create.mutate(
      {
        companyId: company?.id ?? null,
        // Firma değişince eski firmanın makinesi taşınmasın.
        customerDeviceId: deviceId && company?.id === first(params.companyId) ? deviceId : null,
        source: 'manual',
        subject: subject.trim(),
        description: description.trim() || null,
        severity,
        ticketType,
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
      },
      {
        onSuccess: (created) => {
          toast.success('Şikayet kaydedildi');
          router.replace(`/modules/service-complaints/${created.id}`);
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni Şikayet', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="gap-3">
            <Eyebrow>Müşteri</Eyebrow>
            <CompanyPickerField value={company} onChange={setCompany} />
            {deviceId && company?.id === first(params.companyId) ? (
              <Text className="font-inter text-xs text-muted-foreground">Makine: {first(params.deviceLabel) || 'Makine kartından'}</Text>
            ) : null}
            <Field label="İlgili kişi" value={contactName} onChangeText={setContactName} maxLength={255} />
            <Field label="Telefon" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" maxLength={64} />
          </View>
          <View className="gap-3">
            <Eyebrow>Şikayet</Eyebrow>
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Tür</Text>
              <ChoiceChips options={TYPES} value={ticketType} onChange={setTicketType} />
            </View>
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Ciddiyet</Text>
              <ChoiceChips options={SEVERITIES} value={severity} onChange={setSeverity} />
            </View>
            <Field label="Konu *" value={subject} onChangeText={(v) => { setSubject(v); setSubjectError(''); }} maxLength={255} error={subjectError || undefined} />
            <Field label="Açıklama" value={description} onChangeText={setDescription} multiline maxLength={4000} />
          </View>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Şikayeti Kaydet" loading={create.isPending} disabled={create.isPending} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
