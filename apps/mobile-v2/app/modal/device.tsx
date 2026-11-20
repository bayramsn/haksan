import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceKeys, useCustomerDevice } from '@/src/api/operations.hooks';
import { dayText, parseDay, useCreateCustomerDevice } from '@/src/api/service.endpoints';
import { devices } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { CompanyPickerField, type PickedCompany } from '@/src/features/CompanyPickerField';
import { Button, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

/** "2026-01-31" + n yıl; web CreateMachineDialog garanti bitişini kurulum + 2 yıl önerir. */
function addYears(day: string, years: number): string {
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[1]) + years}-${match[2]}-${match[3]}` : '';
}

/** Makine ekleme (web "Yeni Makine / Varlık Ekle") ve tarih/not düzenleme. Firma değişikliği makine kartındaki "Firma Değiştir"de. */
export default function DeviceFormScreen() {
  const params = useLocalSearchParams<{ id?: string; companyId?: string; companyName?: string }>();
  const id = first(params.id);
  const canSave = useCan('customer_devices.update');
  const existing = useCustomerDevice(id);
  if (!canSave) return <Redirect href="/modules/customer-devices" />;
  if (id && (existing.isPending || existing.error || !existing.data)) {
    return (
      <SafeAreaView className="flex-1 bg-canvas">
        <Stack.Screen options={{ title: 'Makineyi Düzenle', headerShown: true }} />
        {existing.isPending ? <Loading /> : <ErrorState message={existing.error?.message ?? 'Makine yüklenemedi.'} onRetry={() => void existing.refetch()} />}
      </SafeAreaView>
    );
  }
  return (
    <DeviceForm
      key={id || 'new'}
      id={id}
      initialCompany={params.companyId ? { id: first(params.companyId), name: first(params.companyName) || 'Firma' } : null}
      device={existing.data ?? null}
    />
  );
}

function DeviceForm({
  id,
  initialCompany,
  device,
}: {
  id: string;
  initialCompany: PickedCompany | null;
  device: ReturnType<typeof useCustomerDevice>['data'] | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const create = useCreateCustomerDevice();
  const update = useMutation({
    mutationFn: (body: Parameters<typeof devices.updateDevice>[1]) => devices.updateDevice(id, body),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: serviceKeys.device(id) }),
        qc.invalidateQueries({ queryKey: ['inventory', 'customer-devices'] }),
      ]);
    },
  });
  const [company, setCompany] = useState<PickedCompany | null>(initialCompany);
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [installationDate, setInstallationDate] = useState(dayText(device?.installationDate));
  const [warrantyStart, setWarrantyStart] = useState(dayText(device?.warrantyStartDate));
  const [warrantyEnd, setWarrantyEnd] = useState(dayText(device?.warrantyEndDate));
  const [notes, setNotes] = useState(device?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function changeInstallation(value: string) {
    setInstallationDate(value);
    // Garanti alanlarına dokunulmadıysa kurulum tarihinden türet (web ile aynı).
    if (!warrantyStart || warrantyStart === installationDate) setWarrantyStart(value);
    if (!warrantyEnd || warrantyEnd === addYears(installationDate, 2)) setWarrantyEnd(addYears(value, 2));
  }

  function submit() {
    const next: Record<string, string> = {};
    if (!id) {
      if (!company) next.company = 'Firma seçin.';
      if (!model.trim()) next.model = 'Model zorunludur.';
      if (!serial.trim()) next.serial = 'Seri no zorunludur.';
    }
    const install = parseDay(installationDate);
    const start = parseDay(warrantyStart);
    const end = parseDay(warrantyEnd);
    if (install === undefined) next.installationDate = 'Biçim: YYYY-AA-GG';
    if (start === undefined) next.warrantyStart = 'Biçim: YYYY-AA-GG';
    if (end === undefined) next.warrantyEnd = 'Biçim: YYYY-AA-GG';
    if (start && end && end < start) next.warrantyEnd = 'Bitiş başlangıçtan önce olamaz.';
    setErrors(next);
    if (Object.keys(next).length) return;

    const onError = (error: Error) => toast.error(error.message);
    if (id) {
      update.mutate(
        // Güncelleme şeması null kabul etmez: boş tarih gönderilmez (1970'e dönmesin), not boş metinle temizlenir.
        { installationDate: install ?? undefined, warrantyStartDate: start ?? undefined, warrantyEndDate: end ?? undefined, notes: notes.trim() },
        { onSuccess: () => { toast.success('Makine güncellendi'); router.back(); }, onError },
      );
      return;
    }
    create.mutate(
      {
        companyId: company!.id,
        initialCompanyId: company!.id,
        installationDate: install ? new Date(install) : undefined,
        warrantyStartDate: start ? new Date(start) : undefined,
        warrantyEndDate: end ? new Date(end) : undefined,
        // Stok kaydı bağlanmadığında model/seri yalnız notta yaşar (web addMachine ile aynı).
        notes: [[model.trim(), serial.trim()].join(' · '), notes.trim()].filter(Boolean).join('\n'),
      },
      {
        onSuccess: (created) => {
          toast.success('Makine eklendi');
          router.replace(`/modules/customer-devices/${created.id}`);
        },
        onError,
      },
    );
  }

  const saving = create.isPending || update.isPending;
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: id ? 'Makineyi Düzenle' : 'Yeni Makine', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          {id ? null : (
            <View className="gap-3">
              <Eyebrow>Makine</Eyebrow>
              <CompanyPickerField value={company} onChange={(c) => { setCompany(c); setErrors((p) => ({ ...p, company: '' })); }} required error={errors.company || undefined} />
              <Field label="Model *" value={model} onChangeText={setModel} maxLength={255} error={errors.model || undefined} />
              <Field label="Seri no *" value={serial} onChangeText={setSerial} maxLength={128} autoCapitalize="characters" error={errors.serial || undefined} />
            </View>
          )}
          <View className="gap-3">
            <Eyebrow>Tarihler</Eyebrow>
            <Field label="Kurulum tarihi" value={installationDate} onChangeText={changeInstallation} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} error={errors.installationDate || undefined} />
            <Field label="Garanti başlangıcı" value={warrantyStart} onChangeText={setWarrantyStart} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} error={errors.warrantyStart || undefined} />
            <Field label="Garanti bitişi" value={warrantyEnd} onChangeText={setWarrantyEnd} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} error={errors.warrantyEnd || undefined} />
          </View>
          <Field label="Not" value={notes} onChangeText={setNotes} multiline maxLength={4000} />
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label={id ? 'Kaydet' : 'Makineyi Ekle'} loading={saving} disabled={saving} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
