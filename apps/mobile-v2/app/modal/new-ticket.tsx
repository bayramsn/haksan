import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useContactList } from '@/src/api/crm.hooks';
import { useCreateServiceTicket, useCustomerDevice, useCustomerDevicesByCompany } from '@/src/api/operations.hooks';
import { serviceStaff, useStaffUsers } from '@/src/api/service.endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { ChoiceChips } from '@/src/features/ChoiceChips';
import { CompanyPickerField, type PickedCompany } from '@/src/features/CompanyPickerField';
import { useTheme } from '@/src/theme/theme';
import { Button, Eyebrow, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const TICKET_TYPES = [
  { value: 'complaint', label: 'Şikayet' },
  { value: 'request', label: 'Talep' },
  { value: 'warranty_claim', label: 'Garanti' },
  { value: 'question', label: 'Soru / Bilgi' },
] as const;
type TicketType = (typeof TICKET_TYPES)[number]['value'];
const NO_MACHINE = '__none';
const GENERAL_CONTACT = '__general';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

/**
 * Web CreateServiceRequestDialog + store.addService ile birebir: konu makineden
 * (yoksa "Servis talebi"), açıklama arıza + servis notu, önem "normal", meta
 * (teklif gerekli, aşama, şikayet/not/aktivite geçmişi, saatlik ücret) aynı.
 */
export default function NewTicketScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('service_tickets.create');
  const canListUsers = useCan('users.read');
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string; customerDeviceId?: string }>();
  const create = useCreateServiceTicket();
  const staff = useStaffUsers(canListUsers);
  const people = serviceStaff(staff.data).filter((u) => u.status !== 'passive');

  const [company, setCompany] = useState<PickedCompany | null>(params.companyId ? { id: first(params.companyId), name: first(params.companyName) || 'Firma' } : null);
  const [machineId, setMachineId] = useState(first(params.customerDeviceId) || NO_MACHINE);
  const [contactId, setContactId] = useState(GENERAL_CONTACT);
  const [assignee, setAssignee] = useState('');
  const [ticketType, setTicketType] = useState<TicketType>('complaint');
  const [diagnosisNote, setDiagnosisNote] = useState('');
  const [serviceNote, setServiceNote] = useState('');
  const [quoteRequired, setQuoteRequired] = useState(false);

  // Makineden açıldıysa firma makinenin sahibine göre gelir (web defaultMachineId).
  const presetDevice = useCustomerDevice(first(params.customerDeviceId));
  useEffect(() => {
    const device = presetDevice.data;
    if (device && !company) setCompany({ id: device.companyId, name: device.company?.shortName ?? device.company?.legalTitle ?? 'Firma' });
  }, [presetDevice.data, company]);
  // Web varsayılanı: ilk servis personeli.
  useEffect(() => {
    if (!assignee && people[0]) setAssignee(people[0].id);
  }, [assignee, people]);

  const devices = useCustomerDevicesByCompany(company?.id);
  const companyMachines = devices.data?.items ?? [];
  const contacts = useContactList({ companyId: company?.id }, Boolean(company?.id));
  const contactRows = contacts.data?.items ?? [];

  // Firma değişince (makine o firmaya ait değilse) tek makine varsa o seçilir.
  useEffect(() => {
    if (!company || devices.isPending) return;
    const belongs = companyMachines.some((item) => item.id === machineId);
    if (machineId !== NO_MACHINE && belongs) return;
    if (machineId !== NO_MACHINE && presetDevice.data?.id === machineId && presetDevice.data.companyId === company.id) return;
    setMachineId(companyMachines.length === 1 ? companyMachines[0]!.id : NO_MACHINE);
  }, [company, devices.isPending, companyMachines, machineId, presetDevice.data]);

  if (!canCreate) return <Redirect href="/modules/service-tickets" />;

  const machine = companyMachines.find((item) => item.id === machineId) ?? (presetDevice.data?.id === machineId ? presetDevice.data : undefined);
  const selectedContact = contactRows.find((item) => item.id === contactId);

  function chooseCompany(next: PickedCompany) {
    setCompany(next);
    setContactId(GENERAL_CONTACT);
  }

  function submit() {
    if (!company) return toast.error('Firma seçimi zorunludur');
    if (machine && machine.companyId !== company.id) return toast.error('Seçilen makine firmaya ait değil');
    const machineLabel = machine ? [machine.model ?? machine.productModelName, machine.serialNumber].filter(Boolean).join(' · ') : '';
    const subject = machineLabel || 'Servis talebi';
    const description = [diagnosisNote, serviceNote].map((value) => value.trim()).filter(Boolean).join('\n\n') || subject;
    const createdAt = new Date().toISOString().slice(0, 10);
    const by = assignee || undefined;
    const now = Date.now();
    create.mutate(
      {
        companyId: company.id,
        contactId: contactId === GENERAL_CONTACT ? undefined : contactId,
        customerDeviceId: machine?.id,
        subject,
        description,
        severity: 'normal',
        ticketType,
        source: 'manual',
        assignedToUserId: assignee || undefined,
        metadata: {
          quoteRequired,
          serviceStage: 'Request Opened',
          serviceQuote: null,
          noteHistory: serviceNote.trim() ? [{ id: `srv-note-${now}`, text: serviceNote.trim(), createdAt, byUserId: by }] : [],
          complaints: diagnosisNote.trim() ? [{ id: `srv-complaint-${now}`, text: diagnosisNote.trim(), createdAt, byUserId: by }] : [],
          activityHistory: [{ id: `srv-act-${now}`, text: 'Servis talebi açıldı.', createdAt, byUserId: by }],
          operations: [],
          timerStatus: 'idle',
          timerElapsedSeconds: 0,
          serviceHourlyRate: 120,
          serviceCurrency: 'USD',
        },
      },
      {
        onSuccess: (created) => {
          toast.success('Servis talebi oluşturuldu');
          if (created?.id) router.replace(`/modules/service-tickets/${created.id}`);
          else router.back();
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  const contactPhone = selectedContact?.mobilePhone || selectedContact?.workPhone || '';
  const contactEmail = selectedContact?.workEmail || '';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni Servis Talebi', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-xs text-muted-foreground">Firma ve ilgili kişiyi seçin; kurulu makine yoksa talebi makinesiz de açabilirsiniz.</Text>
          <View className="gap-3">
            <CompanyPickerField value={company} onChange={chooseCompany} required />
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Makine (opsiyonel)</Text>
              {!company ? <Text className="font-inter text-xs text-muted-foreground">Önce firma seçin.</Text> : (
                <ChoiceChips
                  options={[{ value: NO_MACHINE, label: 'Makine bağlama' }, ...companyMachines.map((item) => ({ value: item.id, label: [item.model ?? item.productModelName, item.serialNumber].filter(Boolean).join(' · ') || 'Makine' }))]}
                  value={machineId}
                  onChange={setMachineId}
                />
              )}
            </View>
            {company ? (
              <View className="gap-1.5">
                <Text className="font-inter-medium text-[13px] text-muted-foreground">İlgili kişi</Text>
                <ChoiceChips
                  options={[{ value: GENERAL_CONTACT, label: 'Firma genel iletişimi' }, ...contactRows.map((item) => ({ value: item.id, label: item.fullName }))]}
                  value={contactId}
                  onChange={setContactId}
                />
                {contactPhone || contactEmail ? <Text className="font-inter text-xs text-muted-foreground">{[contactPhone, contactEmail].filter(Boolean).join(' · ')}</Text> : null}
              </View>
            ) : null}
            {people.length ? (
              <View className="gap-1.5">
                <Text className="font-inter-medium text-[13px] text-muted-foreground">Atanan servis personeli</Text>
                <ChoiceChips options={people.map((u) => ({ value: u.id, label: u.department?.name ? `${u.fullName} · ${u.department.name}` : u.fullName }))} value={assignee} onChange={setAssignee} />
              </View>
            ) : null}
          </View>

          <View className="gap-3">
            <Eyebrow>Talep</Eyebrow>
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Kayıt tipi *</Text>
              <ChoiceChips options={TICKET_TYPES} value={ticketType} onChange={setTicketType} />
            </View>
            <Field label="Arıza / talep açıklaması" value={diagnosisNote} onChangeText={setDiagnosisNote} multiline maxLength={4000} placeholder="Müşterinin bildirdiği problem..." />
            <Field label="Servis notu" value={serviceNote} onChangeText={setServiceNote} multiline maxLength={4000} placeholder="İç not / planlama..." />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: quoteRequired }}
              onPress={() => setQuoteRequired((value) => !value)}
              className="flex-row items-start gap-3 rounded-control border border-border bg-card p-3 active:opacity-70"
            >
              <Ionicons name={quoteRequired ? 'checkbox' : 'square-outline'} size={20} color={quoteRequired ? colors.primary : colors.mutedForeground} />
              <View className="flex-1 gap-0.5">
                <Text className="font-inter-medium text-sm text-foreground">Servis teklifi gerekli</Text>
                <Text className="font-inter text-xs text-muted-foreground">Yedek parça veya işçilik bedeli için teklif akışı açılır.</Text>
              </View>
            </Pressable>
          </View>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Talebi Oluştur" loading={create.isPending} disabled={create.isPending} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
