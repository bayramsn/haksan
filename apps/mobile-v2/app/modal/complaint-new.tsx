import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCompany } from '@/src/api/companies.hooks';
import { useContact } from '@/src/api/crm.hooks';
import { useCreateComplaint } from '@/src/api/service.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, Field } from '@/src/ui';
import { CompanyPicker, ContactPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { toast } from '@/src/ui/toast';
import { ChoiceChips, DevicePicker, FormSection } from '@/src/ui/service/fields';
import { COMPLAINT_SOURCE_LABELS, SEVERITY_LABELS, TICKET_TYPE_LABELS } from '@/src/ui/service/serviceStage';

type Source = 'phone' | 'whatsapp' | 'email' | 'manual';
type Severity = 'low' | 'normal' | 'high' | 'critical';
type TicketType = 'complaint' | 'request' | 'warranty_claim' | 'question';

const SOURCES = (['manual', 'phone', 'whatsapp', 'email'] as Source[]).map((value) => ({ value, label: COMPLAINT_SOURCE_LABELS[value]! }));
const SEVERITIES = (['low', 'normal', 'high', 'critical'] as Severity[]).map((value) => ({ value, label: SEVERITY_LABELS[value]! }));
const TYPES = (['complaint', 'request', 'warranty_claim', 'question'] as TicketType[]).map((value) => ({ value, label: TICKET_TYPE_LABELS[value]! }));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Web CreateComplaintDialog: "Yeni İç Şikayet Kaydı". */
export default function NewComplaintScreen() {
  const router = useRouter();
  const canCreate = useCan('service_tickets.create');
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string; customerDeviceId?: string }>();
  const create = useCreateComplaint();

  const initialCompanyId = first(params.companyId);
  const [company, setCompany] = useState<PickedRecord | null>(
    initialCompanyId ? { id: initialCompanyId, name: first(params.companyName) || 'Seçili firma' } : null,
  );
  const [deviceId, setDeviceId] = useState<string | null>(first(params.customerDeviceId) || null);
  const [contact, setContact] = useState<PickedRecord | null>(null);
  const [source, setSource] = useState<Source>('manual');
  const [severity, setSeverity] = useState<Severity>('normal');
  const [ticketType, setTicketType] = useState<TicketType>('complaint');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [errors, setErrors] = useState<{ subject?: string; email?: string }>({});

  const companyDetail = useCompany(company?.id ?? '');
  const contactDetail = useContact(contact?.id ?? '');

  // Web: kişi seçilince ad/telefon/e-posta kişiden, yoksa firma kartından dolar.
  useEffect(() => {
    const person = contactDetail.data;
    const firm = companyDetail.data;
    if (!contact || !person) return;
    const firmPhone = firm?.phones.find((row) => row.isDefault)?.phone ?? firm?.phones[0]?.phone;
    const firmEmail = firm?.emails.find((row) => row.isDefault)?.email ?? firm?.emails[0]?.email;
    setContactName(person.fullName || contact.name);
    setContactPhone(person.mobilePhone || person.workPhone || firmPhone || '');
    setContactEmail(person.workEmail || person.personalEmail || firmEmail || '');
  }, [companyDetail.data, contact, contactDetail.data]);

  if (!canCreate) return <Redirect href={'/modules/service-complaints' as Href} />;

  const submit = () => {
    const nextErrors: typeof errors = {};
    if (subject.trim().length < 3) nextErrors.subject = 'Konu en az 3 karakter olmalı.';
    if (contactEmail.trim() && !EMAIL.test(contactEmail.trim())) nextErrors.email = 'Geçerli bir e-posta girin.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    create.mutate(
      {
        companyId: company?.id ?? null,
        customerDeviceId: deviceId,
        source,
        severity,
        ticketType,
        subject: subject.trim(),
        description: description.trim() || null,
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
      },
      {
        onSuccess: (created) => {
          toast.success(`Şikayet kaydı açıldı · ${created.complaintNo}`);
          router.back();
        },
        onError: (error) => toast.error(`Şikayet kaydı açılamadı: ${error.message}`),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni İç Şikayet Kaydı', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <FormSection title="Eşleştirme" hint="Telefon, WhatsApp, e-posta veya iç bildirim olarak gelen şikayeti kutuya alın.">
            <CompanyPicker
              label="Firma"
              placeholder="Eşleşmemiş"
              value={company}
              onChange={(next) => {
                setCompany(next);
                setDeviceId(null);
                setContact(null);
                setContactName('');
                setContactPhone('');
                setContactEmail('');
              }}
            />
            <DevicePicker label="Makine" companyId={company?.id ?? null} value={deviceId} onChange={(next) => setDeviceId(next?.id ?? null)} />
          </FormSection>

          <FormSection title="Kayıt">
            <ChoiceChips label="Kaynak" value={source} options={SOURCES} onChange={setSource} />
            <ChoiceChips label="Öncelik" value={severity} options={SEVERITIES} onChange={setSeverity} />
            <ChoiceChips label="Kayıt Tipi" value={ticketType} options={TYPES} onChange={setTicketType} />
            <Field label="Konu" value={subject} onChangeText={setSubject} maxLength={255} error={errors.subject} />
            <Field
              label="Açıklama"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={4000}
              style={{ minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }}
            />
          </FormSection>

          <FormSection title="İletişim">
            <ContactPicker label="İlgili Kişi" companyId={company?.id ?? null} value={contact} onChange={setContact} placeholder="Firma bilgisi / elle giriş" />
            <Field label="İlgili Kişi Adı" value={contactName} onChangeText={setContactName} maxLength={255} />
            <Field label="Telefon" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" maxLength={64} />
            <Field
              label="E-posta"
              value={contactEmail}
              onChangeText={setContactEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={255}
              error={errors.email}
            />
          </FormSection>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <Button className="flex-1" label="Vazgeç" variant="ghost" onPress={() => router.back()} />
          <Button className="flex-[2]" label="Kaydet" loading={create.isPending} disabled={create.isPending} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
