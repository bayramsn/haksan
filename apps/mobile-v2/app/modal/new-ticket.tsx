import { useAssistantFormDraft } from '@/src/call-assistant/useAssistantFormDraft';
import { useCompany } from '@/src/api/companies.hooks';
import { useContact } from '@/src/api/crm.hooks';
import { useCustomerDevice } from '@/src/api/operations.hooks';
import { useTheme } from '@/src/theme/theme';
import { intakeContactInfo, machineIntakeCustomer, ticketIntakeMetadata } from '@/src/ui/service/ticket-intake';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from 'react-native';
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
  const { colors } = useTheme();
  const canCreate = useCan('service_tickets.create');
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string; customerDeviceId?: string; assistantDraftId?: string }>();
  const create = useCreateTicketWithMeta();

  const assistantDraftId = first(params.assistantDraftId);
  const initialCompanyId = assistantDraftId ? '' : first(params.companyId);
  const [company, setCompany] = useState<PickedRecord | null>(
    initialCompanyId ? { id: initialCompanyId, name: first(params.companyName) || 'Seçili firma' } : null,
  );
  const [deviceId, setDeviceId] = useState<string | null>(assistantDraftId ? null : first(params.customerDeviceId) || null);
  const [device, setDevice] = useState<DeviceChoice | null>(null);
  const [contact, setContact] = useState<PickedRecord | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [ticketType, setTicketType] = useState<TicketType>('complaint');
  const [severity, setSeverity] = useState<Severity>('normal');
  const [subject, setSubject] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [serviceNote, setServiceNote] = useState('');
  const [quoteRequired, setQuoteRequired] = useState(false);
  const [companyError, setCompanyError] = useState<string>();
  const assistant = useAssistantFormDraft(assistantDraftId, 'service_ticket', (draft) => {
    setCompany(draft.company); setContact(draft.contact ? { id: draft.contact.id, name: draft.contact.name, phone: draft.contact.phone ?? undefined, email: draft.contact.email ?? undefined } : null); setSubject(draft.title ?? ''); setDiagnosis(draft.text ?? '');
  });

  const companyDetail = useCompany(company?.id ?? '');
  const contactDetail = useContact(contact?.id ?? '');
  const machineDetail = useCustomerDevice(deviceId ?? '');
  const contactInfo = intakeContactInfo(contactDetail.data, companyDetail.data);

  // A preselected machine follows the same owner/customer rule as an explicit selection.
  useEffect(() => {
    const row = machineDetail.data;
    if (!row || device || row.id !== deviceId) return;
    const next: DeviceChoice = { id: row.id, label: [row.brandName, row.productModelName ?? row.model, row.serialNumber].filter(Boolean).join(' · '), companyId: row.companyId, companyName: row.company?.shortName ?? row.company?.legalTitle, serialNumber: row.serialNumber, brand: row.brandName, model: row.productModelName ?? row.model, controlUnit: row.controlUnit, controlUnitSerialNumber: row.controlUnitSerialNumber ?? null, productTypeName: row.productTypeName };
    setDevice(next);
    const owner = machineIntakeCustomer(next, company);
    if (owner.resetContact) { setCompany(owner.company); setContact(null); }
  }, [company, device, deviceId, machineDetail.data]);

  if (!canCreate) return <Redirect href="/modules/service-tickets" />;

  const submit = async () => {
    if (assistant.blocked || assistant.saving || create.isPending) return;
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
    const body = {
        companyId: company.id,
        contactId: contact?.id,
        customerDeviceId: deviceId ?? undefined,
        subject: derivedSubject.slice(0, 255),
        description: description.slice(0, 4000),
        severity,
        ticketType,
        source: 'manual' as const,
        assignedToUserId: assignee ?? undefined,
        metadata: ticketIntakeMetadata({ quoteRequired, serviceNote, diagnosis, createdAt, stamp, byUserId: by }),
      };
    if (assistant.active) {
      try { await assistant.save(body); toast.success('Servis talebi oluşturuldu'); router.back(); }
      catch (error) { toast.error(error instanceof Error ? error.message : 'Servis talebi kaydedilemedi'); }
      return;
    }
    create.mutate(body,
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
          {assistant.error ? <View className="gap-2"><Text className="text-destructive">{assistant.error}</Text><Button label="Taslağı tekrar yükle" variant="ghost" onPress={() => void assistant.retry()} /></View> : null}
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
              allowOtherCompanies
              companyId={company?.id ?? null}
              value={deviceId}
              onChange={(next) => {
                setDeviceId(next?.id ?? null);
                setDevice(next);
                const owner = machineIntakeCustomer(next, company);
                if (owner.resetContact) { setCompany(owner.company); setContact(null); setCompanyError(undefined); }
              }}
            />
            <ContactPicker label="İlgili Kişi" companyId={company?.id ?? null} value={contact} onChange={setContact} placeholder="Firma genel iletişimi" />
            <View className="gap-3 rounded-control border border-border p-3">
              <Text className="font-inter-medium text-sm text-foreground">İletişim bilgileri</Text>
              <Field label="Telefon" value={contactInfo.phone} editable={false} placeholder={contactDetail.isPending && contact ? 'Yükleniyor…' : 'Telefon bulunamadı'} />
              <Field label="E-posta" value={contactInfo.email} editable={false} placeholder={contactDetail.isPending && contact ? 'Yükleniyor…' : 'E-posta bulunamadı'} />
              <Text className="font-inter text-xs text-muted-foreground">Seçili kişinin bilgileri kullanılır; eksik bilgiler firma kartından tamamlanır.</Text>
            </View>
            <UserPicker label="Atanan Servis Personeli" value={assignee} onChange={setAssignee} placeholder="Personel seçin" serviceOnly />
          </FormSection>

          <FormSection title="Talep">
            <ChoiceChips label="Kayıt Tipi *" value={ticketType} options={TICKET_TYPES} onChange={setTicketType} />
            <ChoiceChips label="Öncelik" value={severity} options={SEVERITIES} onChange={setSeverity} />
            <View className="min-h-[56px] flex-row items-center gap-3 rounded-control border border-border p-3">
              <View className="flex-1 gap-1">
                <Text className="font-inter-medium text-sm text-foreground">Servis teklifi gerekli</Text>
                <Text className="font-inter text-xs text-muted-foreground">Yedek parça veya işçilik bedeli için teklif akışı açılır.</Text>
              </View>
              <Switch accessibilityLabel="Servis teklifi gerekli" value={quoteRequired} onValueChange={setQuoteRequired} trackColor={{ true: colors.primary }} />
            </View>
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
          <Button className="flex-[2]" label="Talebi Oluştur" loading={create.isPending || assistant.saving || assistant.loading} disabled={create.isPending || assistant.saving || assistant.blocked} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
