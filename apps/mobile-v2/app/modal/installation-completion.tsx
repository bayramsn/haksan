import { useEffect, useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { INSTALLATION_FORM_DEFAULT_CHECKS, installationFormDataSchema } from '@haksan/shared';
import { useCompany } from '@/src/api/companies.hooks';
import { useInstallation, useSetInstallationStatus } from '@/src/api/operations.hooks';
import { useUpdateInstallation } from '@/src/api/service.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, Card, ErrorState, Field, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { ChoiceChips, DayField, FormSection } from '@/src/ui/service/fields';
import { InstallationDocument } from '@/src/ui/service/InstallationDocument';
import {
  companyUserInfo,
  completionError,
  fillUserInfo,
  installationDraft,
  installationPayload,
  type CheckDraft,
  type InstallationFormDraft,
} from '@/src/ui/service/logistics';

const CHECK_OPTIONS = [
  { value: 'done' as const, label: 'Tamamlandı' },
  { value: 'not_done' as const, label: 'Tamamlanmadı' },
];
const PROBLEM_OPTIONS = [
  { value: 'no' as const, label: 'Hayır' },
  { value: 'yes' as const, label: 'Evet' },
];

function durationText(minutes: number | null): string | null {
  if (minutes == null) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} sa` : null, rest ? `${rest} dk` : null].filter(Boolean).join(' ') || '0 dk';
}

/** Web InstallationFormDialog: Kurulum Tutanağı — kaydet, kaydet ve tamamla, yazdır. */
export default function InstallationCompletionScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const canUpdate = useCan('installations.update');
  const query = useInstallation(id);
  const company = useCompany(query.data?.companyId ?? '');
  const save = useUpdateInstallation(id);
  const complete = useSetInstallationStatus(id);
  const [form, setForm] = useState<InstallationFormDraft | null>(null);
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const row = query.data;
    if (!row || form) return;
    const draft = installationDraft(row, row.formData, INSTALLATION_FORM_DEFAULT_CHECKS);
    setForm({
      ...draft,
      kurulumTarihi: draft.kurulumTarihi || (row.completedAt ?? row.scheduledDate ?? '').slice(0, 10),
      adres: draft.adres || row.location || '',
      kurulumuYapan: draft.kurulumuYapan || row.assignedTo?.fullName || '',
      teslimAlan: draft.teslimAlan || row.contact?.fullName || '',
    });
  }, [form, query.data]);

  useEffect(() => {
    if (!form || filled || !company.data) return;
    setForm(fillUserInfo(form, companyUserInfo(company.data)));
    setFilled(true);
  }, [company.data, filled, form]);

  if (!canUpdate) return <Redirect href={`/modules/installations/${id}` as Href} />;

  if (query.isPending || query.error || !query.data || !form) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Kurulum Tutanağı', headerShown: true }} />
        {query.error ? <ErrorState message={query.error.message} onRetry={() => void query.refetch()} /> : <Loading />}
      </SafeAreaView>
    );
  }

  const data = query.data;
  const closed = data.status?.code === 'completed' || data.status?.code === 'cancelled' || Boolean(data.completedAt);
  const busy = save.isPending || complete.isPending;
  const update = <K extends keyof InstallationFormDraft>(key: K, value: InstallationFormDraft[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  const updateCheck = (checkId: string, patch: Partial<CheckDraft>) =>
    setForm((current) =>
      current ? { ...current, checks: current.checks.map((check) => (check.id === checkId ? { ...check, ...patch } : check)) } : current,
    );

  const validPayload = () => {
    const parsed = installationFormDataSchema.safeParse(installationPayload(form));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Tutanak alanlarını kontrol edin.');
      return null;
    }
    return parsed.data;
  };

  const saveForm = () => {
    setError(null);
    const payload = validPayload();
    if (!payload) return;
    save.mutate(
      { formData: payload },
      {
        onSuccess: () => toast.success('Kurulum tutanağı kaydedildi'),
        onError: (mutationError) => toast.error(`Kurulum tutanağı kaydedilemedi: ${mutationError.message}`),
      },
    );
  };

  const completeInstallation = () => {
    setError(null);
    const missing = completionError(form);
    if (missing) return setError(missing);
    const payload = validPayload();
    if (!payload) return;
    complete.mutate(
      {
        statusCode: 'completed',
        installationDate: payload.kurulumTarihi ? new Date(payload.kurulumTarihi).toISOString() : new Date().toISOString(),
        formData: payload,
      },
      {
        onSuccess: () => {
          toast.success('Kurulum tamamlandı');
          router.back();
        },
        onError: (mutationError) => {
          setError(mutationError.message);
          toast.error('Kurulum tamamlanamadı');
        },
      },
    );
  };

  const textField = (label: string, key: keyof InstallationFormDraft, extra?: Partial<ComponentProps<typeof Field>>) => (
    <Field label={label} value={String(form[key] ?? '')} onChangeText={(value) => update(key, value as never)} maxLength={255} {...extra} />
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Kurulum Tutanağı', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <Card className="gap-1">
            <Text className="font-display-semibold text-base text-foreground">{data.company?.shortName ?? data.company?.legalTitle ?? 'Firma'}</Text>
            <Text className="font-inter text-sm text-muted-foreground">{(data.scheduledDate ?? '').slice(0, 10) || '—'}</Text>
          </Card>

          <FormSection title="Form">
            {textField('Form No', 'formNo', { maxLength: 64 })}
            <DayField label="Tezgah Teslim Tarihi" value={form.teslimTarihi} onChange={(value) => update('teslimTarihi', value)} />
            <DayField label="Tezgah Kurulum Tarihi" value={form.kurulumTarihi} onChange={(value) => update('kurulumTarihi', value)} />
          </FormSection>

          <FormSection title="Tezgah Bilgileri">
            {textField('Tezgah Markası', 'tezgahMarka')}
            {textField('Tezgah Tipi', 'tezgahTip')}
            {textField('Tezgah Modeli', 'tezgahModel')}
            {textField('Tezgah Seri No', 'tezgahSeriNo')}
          </FormSection>

          <FormSection title="Kontrol Ünitesi Bilgileri">
            {textField('Cnc Markası', 'cncMarka')}
            {textField('Cnc Modeli', 'cncModel')}
            {textField('Cnc Seri No', 'cncSeriNo')}
            {textField('Cnc Main S/W', 'cncMainSw')}
          </FormSection>

          <FormSection title="Kullanıcı Bilgileri">
            {textField('Firma', 'firma')}
            {textField('İlgili', 'ilgili')}
            {textField('Telefon', 'telefon', { keyboardType: 'phone-pad' })}
            {textField('Adres', 'adres', { multiline: true, maxLength: 1000, style: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 } })}
            {textField('Faks', 'faks', { keyboardType: 'phone-pad' })}
            {textField('Gsm', 'gsm', { keyboardType: 'phone-pad' })}
            {textField('E-Posta', 'eposta', { keyboardType: 'email-address', autoCapitalize: 'none' })}
          </FormSection>

          <FormSection title="Tezgah Kontrol Çizelgesi">
            {form.checks.map((check) => (
              <View key={check.id} className="gap-2 border-b border-border pb-3">
                <Text className="font-inter-medium text-[14px] text-foreground">{check.label}</Text>
                <ChoiceChips
                  value={check.status}
                  options={CHECK_OPTIONS}
                  destructiveValue="not_done"
                  onChange={(status) => updateCheck(check.id, { status })}
                />
                <Field
                  label="Not"
                  value={check.note}
                  onChangeText={(note) => updateCheck(check.id, { note })}
                  placeholder="İsteğe bağlı"
                  maxLength={500}
                />
              </View>
            ))}
          </FormSection>

          <FormSection title="Kurulumda Problem Kontrolü">
            <ChoiceChips
              label="Problem var mı?"
              value={form.problemHasProblem}
              options={PROBLEM_OPTIONS}
              destructiveValue="yes"
              onChange={(value) => update('problemHasProblem', value)}
            />
            {textField('Açıklama', 'problemNote', { multiline: true, maxLength: 2000, style: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 } })}
            {textField('Yapılan İşlem', 'problemActionNote', { multiline: true, maxLength: 2000, style: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 } })}
          </FormSection>

          <FormSection title="İmza Bilgileri">
            {textField('Kurulumu Yapan', 'kurulumuYapan')}
            {textField('Tezgahı Teslim Alan', 'teslimAlan')}
          </FormSection>

          <FormSection title="Yazdır / PDF">
            <InstallationDocument
              form={form}
              fileName={`kurulum-tutanagi-${form.formNo || data.id.slice(0, 6)}`}
              location={data.location}
              duration={durationText(data.durationMinutes)}
              notes={data.notes}
            />
          </FormSection>

          {error ? <Text accessibilityLiveRegion="assertive" className="font-inter text-sm text-destructive">{error}</Text> : null}
        </ScrollView>

        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <Button className="flex-1" label="Kaydet" variant="ghost" loading={save.isPending} disabled={busy} onPress={saveForm} />
          {!closed ? (
            <Button className="flex-[2]" label="Kaydet ve Tamamla" trailingIcon="lock-closed-outline" loading={complete.isPending} disabled={busy} onPress={completeInstallation} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
