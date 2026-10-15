import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateTicketWithMeta } from '@/src/api/service.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { Button, Field } from '@/src/ui';
import { CompanyPicker, ContactPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { toast } from '@/src/ui/toast';
import { ChoiceChips, DevicePicker, FormSection, UserPicker, type DeviceChoice } from '@/src/ui/service/fields';
import { historyTimestamp, SEVERITY_LABELS, TICKET_TYPE_LABELS } from '@/src/ui/service/serviceStage';

type Severity = 'low' | 'normal' | 'high' | 'critical';
type TicketType = 'complaint' | 'request' | 'warranty_claim' | 'question';

const SEVERITIES = (['low', 'normal', 'high', 'critical'] as Severity[]).map((value) => ({ value, label: SEVERITY_LABELS[value]! }));
const TICKET_TYPES = (['complaint', 'request', 'warranty_claim', 'question'] as TicketType[]).map((value) => ({ value, label: TICKET_TYPE_LABELS[value]! }));

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Web CreateServiceDialog + store.addService metadata'sı. */
export default function NewTicketScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const canCreate = useCan('service_tickets.create');
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string; customerDeviceId?: string }>();
  const create = useCreateTicketWithMeta();

  const initialCompanyId = first(params.companyId);
  const [company, setCompany] = useState<PickedRecord | null>(
    initialCompanyId ? { id: initialCompanyId, name: first(params.companyName) || 'Seçili firma' } : null,
  );
  const [deviceId, setDeviceId] = useState<string | null>(first(params.customerDeviceId) || null);
  const [device, setDevice] = useState<DeviceChoice | null>(null);
  const [contact, setContact] = useState<PickedRecord | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [ticketType, setTicketType] = useState<TicketType>('complaint');
  const [severity, setSeverity] = useState<Severity>('normal');
  const [subject, setSubject] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [serviceNote, setServiceNote] = useState('');
  const [companyError, setCompanyError] = useState<string>();

  if (!canCreate) return <Redirect href="/(tabs)/modules/service-tickets" />;

  const submit = () => {
    if (!company) {
      setCompanyError('Firma seçimi zorunludur.');
      return;
    }
    const createdAt = historyTimestamp(new Date());
    const stamp = Date.now();
    const by = assignee ?? user?.id;
    const derivedSubject =
      subject.trim() || (device ? [device.model, device.serialNumber].filter(Boolean).join(' · ') : '') || 'Servis talebi';
    const description = [diagnosis, serviceNote].map((value) => value.trim()).filter(Boolean).join('\n\n') || derivedSubject;
    create.mutate(
      {
        companyId: company.id,
        contactId: contact?.id,
        customerDeviceId: deviceId ?? undefined,
        subject: derivedSubject.slice(0, 255),
        description: description.slice(0, 4000),
        severity,
        ticketType,
        source: 'manual',
        assignedToUserId: assignee ?? undefined,
        metadata: {
          quoteRequired: false,
          serviceStage: 'Request Opened',
          serviceQuote: null,
          noteHistory: serviceNote.trim() ? [{ id: `srv-note-${stamp}`, text: serviceNote.trim(), createdAt, byUserId: by }] : [],
          complaints: diagnosis.trim() ? [{ id: `srv-complaint-${stamp}`, text: diagnosis.trim(), createdAt, byUserId: by }] : [],
          activityHistory: [{ id: `srv-act-${stamp}`, text: 'Servis talebi açıldı.', createdAt, byUserId: by }],
          operations: [],
          timerStatus: 'idle',
          timerElapsedSeconds: 0,
          serviceHourlyRate: 120,
          serviceCurrency: 'USD',
        },
      },
      {
        onSuccess: (created) => {
          toast.success(`Servis talebi oluşturuldu · ${created.ticketNo}`);
          router.back();
        },
        onError: (error) => toast.error(`Servis talebi oluşturulamadı: ${error.message}`),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni Servis Talebi', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <FormSection title="Müşteri ve makine">
            <CompanyPicker
              label="Firma *"
              value={company}
              error={companyError}
              onChange={(next) => {
                setCompany(next);
                setCompanyError(undefined);
                setContact(null);
                setDeviceId(null);
                setDevice(null);
              }}
            />
            <DevicePicker
              label="Makine (opsiyonel)"
              companyId={company?.id ?? null}
              value={deviceId}
              onChange={(next) => {
                setDeviceId(next?.id ?? null);
                setDevice(next);
              }}
            />
            <ContactPicker label="İlgili Kişi" companyId={company?.id ?? null} value={contact} onChange={setContact} placeholder="Firma genel iletişimi" />
            <UserPicker label="Atanan Servis Personeli" value={assignee} onChange={setAssignee} placeholder="Personel seçin" />
          </FormSection>

          <FormSection title="Talep">
            <ChoiceChips label="Kayıt Tipi *" value={ticketType} options={TICKET_TYPES} onChange={setTicketType} />
            <ChoiceChips label="Öncelik" value={severity} options={SEVERITIES} onChange={setSeverity} />
            <Field label="Konu" value={subject} onChangeText={setSubject} maxLength={255} placeholder="Boş bırakılırsa makine bilgisinden üretilir" />
            <Field
              label="Arıza / Talep Açıklaması"
              value={diagnosis}
              onChangeText={setDiagnosis}
              placeholder="Müşterinin bildirdiği problem..."
              multiline
              maxLength={4000}
              style={{ minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }}
            />
            <Field
              label="Servis Notu"
              value={serviceNote}
              onChangeText={setServiceNote}
              placeholder="İç not / planlama..."
              multiline
              maxLength={4000}
              style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }}
            />
          </FormSection>

          <Text className="font-inter text-xs text-muted-foreground">
            Talep numarası sunucuda otomatik üretilir; firma ve bölüm erişimi yeniden doğrulanır.
          </Text>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <Button className="flex-1" label="Vazgeç" variant="ghost" onPress={() => router.back()} />
          <Button className="flex-[2]" label="Talebi Oluştur" loading={create.isPending} disabled={create.isPending} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
