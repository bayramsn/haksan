import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCustomerDevicesByCompany, useDirectory, useInstallation } from '@/src/api/operations.hooks';
import { useContactList } from '@/src/api/crm.hooks';
import { parseDay, serviceStaff, useSaveInstallation, useStaffUsers } from '@/src/api/service.endpoints';
import type { Installation } from '@/src/api/endpoints';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { formatLocalDateTime, parseLocalDateTime } from '@/src/lib/format';
import { ChoiceChips } from '@/src/features/ChoiceChips';
import { CompanyPickerField, type PickedCompany } from '@/src/features/CompanyPickerField';
import { Button, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');
const LOCATION_TYPES = [
  { value: 'istanbul_ici', label: 'İstanbul içi' },
  { value: 'istanbul_disi', label: 'İstanbul dışı' },
] as const;
type LocationType = (typeof LOCATION_TYPES)[number]['value'];
const UNASSIGNED = '__none';

/** Kurulum planlama (web kurulum oluşturma/düzenleme). Durum geçişleri ve tutanak detay ekranında kalır. */
export default function InstallationFormScreen() {
  const params = useLocalSearchParams<{ id?: string; companyId?: string; companyName?: string; opportunityId?: string; customerDeviceId?: string; contactId?: string; quoteId?: string }>();
  const id = first(params.id);
  const canSave = useCan(id ? 'installations.update' : 'installations.create');
  const existing = useInstallation(id);
  if (!canSave) return <Redirect href="/modules/installations" />;
  if (id && (existing.isPending || existing.error || !existing.data)) {
    return (
      <SafeAreaView className="flex-1 bg-canvas">
        <Stack.Screen options={{ title: 'Kurulumu Düzenle', headerShown: true }} />
        {existing.isPending ? <Loading /> : <ErrorState message={existing.error?.message ?? 'Kurulum yüklenemedi.'} onRetry={() => void existing.refetch()} />}
      </SafeAreaView>
    );
  }
  return (
    <InstallationForm
      key={id || 'new'}
      id={id}
      installation={existing.data ?? null}
      initial={{
        company: params.companyId ? { id: first(params.companyId), name: first(params.companyName) || 'Firma' } : null,
        opportunityId: first(params.opportunityId) || undefined,
        customerDeviceId: first(params.customerDeviceId) || undefined,
        contactId: first(params.contactId) || undefined,
        quoteId: first(params.quoteId) || undefined,
      }}
    />
  );
}

function todayText(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Web serviceFormNo.suggestedServiceFormNo: makine kimliğinden "DR-XXXXXX". */
function suggestedFormNo(machineId: string | undefined): string {
  const seed = (machineId ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
  return seed ? `DR-${seed}` : '';
}

function InstallationForm({
  id,
  installation,
  initial,
}: {
  id: string;
  installation: Installation | null;
  initial: { company: PickedCompany | null; opportunityId?: string; customerDeviceId?: string; contactId?: string; quoteId?: string };
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const save = useSaveInstallation(id || undefined);
  const directory = useDirectory();
  const { user } = useAuth();
  const staff = useStaffUsers(useCan('users.read'));
  const servicePeople = serviceStaff(staff.data).filter((u) => u.status !== 'passive');
  const [company, setCompany] = useState<PickedCompany | null>(
    installation?.company
      ? { id: installation.company.id, name: installation.company.shortName ?? installation.company.legalTitle }
      : initial.company
  );
  // Web yeni kurulum varsayılanları: bugün, ilk servis personeli, İstanbul içi, 60 dk.
  const [scheduled, setScheduled] = useState(installation?.scheduledDate ? formatLocalDateTime(installation.scheduledDate) : id ? '' : todayText());
  const [assignee, setAssignee] = useState(installation?.assignedToUserId ?? UNASSIGNED);
  const [location, setLocation] = useState(installation?.location ?? '');
  const [locationType, setLocationType] = useState<LocationType | null>(
    installation?.locationType === 'istanbul_ici' || installation?.locationType === 'istanbul_disi' ? installation.locationType : id ? null : 'istanbul_ici'
  );
  const [duration, setDuration] = useState(installation?.durationMinutes != null ? String(installation.durationMinutes) : id ? '' : '60');
  const [notes, setNotes] = useState(installation?.notes ?? '');
  const [contactId, setContactId] = useState(installation?.contactId ?? initial.contactId ?? '');
  const [deviceIds, setDeviceIds] = useState<string[]>(initial.customerDeviceId ? [initial.customerDeviceId] : []);
  const [devicesTouched, setDevicesTouched] = useState(Boolean(initial.customerDeviceId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const devices = useCustomerDevicesByCompany(!id ? company?.id : undefined);
  const companyMachines = devices.data?.items ?? [];
  const contacts = useContactList({ companyId: company?.id }, Boolean(company?.id));

  useEffect(() => {
    if (!id && assignee === UNASSIGNED && !installation && servicePeople[0]) setAssignee(servicePeople[0].id);
  }, [id, assignee, installation, servicePeople]);
  // Web: firma seçilince ilk makinesi otomatik seçilir.
  useEffect(() => {
    if (id || devicesTouched || devices.isPending) return;
    setDeviceIds(companyMachines[0] ? [companyMachines[0].id] : []);
  }, [id, devicesTouched, devices.isPending, companyMachines]);

  function chooseCompany(next: PickedCompany) {
    setCompany(next);
    setContactId('');
    setDevicesTouched(false);
  }

  function toggleDevice(deviceId: string) {
    setDevicesTouched(true);
    setDeviceIds((current) => (current.includes(deviceId) ? current.filter((x) => x !== deviceId) : [...current, deviceId]));
  }

  async function submit() {
    const next: Record<string, string> = {};
    if (!company) next.company = 'Firma seçin.';
    const text = scheduled.trim();
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
    const when = !text ? null : dateOnly ? parseDay(text) : parseLocalDateTime(text)?.toISOString();
    if (text && !when) next.scheduled = 'Biçim: YYYY-AA-GG veya YYYY-AA-GG SS:DD';
    const minutes = duration.trim() ? Number(duration) : null;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0)) next.duration = 'Dakika tam sayı olmalı.';
    setErrors(next);
    if (Object.keys(next).length) return;

    if (id) {
      save.mutate(
        {
          companyId: company!.id,
          contactId: contactId || null,
          scheduledDate: when ?? null,
          assignedToUserId: assignee === UNASSIGNED ? null : assignee,
          location: location.trim() || null,
          locationType,
          durationMinutes: minutes,
          notes: notes.trim() || null,
        },
        {
          onSuccess: () => { toast.success('Kurulum güncellendi'); router.back(); },
          onError: (error) => toast.error(error.message),
        }
      );
      return;
    }
    // Web: seçilen her makine için ayrı kurulum işi ve tutanak (form no) açılır.
    const targets: (string | undefined)[] = deviceIds.length ? deviceIds : [undefined];
    setCreating(true);
    try {
      const created = await Promise.all(targets.map((customerDeviceId) => {
        const formNo = suggestedFormNo(customerDeviceId);
        return save.mutateAsync({
          companyId: company!.id,
          opportunityId: initial.opportunityId,
          quoteId: initial.quoteId,
          contactId: contactId || undefined,
          customerDeviceId,
          scheduledDate: when ?? undefined,
          assignedToUserId: assignee === UNASSIGNED ? undefined : assignee,
          location: location.trim() || undefined,
          locationType: locationType ?? undefined,
          durationMinutes: minutes ?? undefined,
          notes: notes.trim() || undefined,
          formData: formNo ? { formNo, machineId: customerDeviceId } : undefined,
        });
      }));
      toast.success(created.length > 1 ? `${created.length} makine için kurulum oluşturuldu` : 'Kurulum oluşturuldu');
      if (created.length === 1 && created[0]?.id) router.replace(`/modules/installations/${created[0].id}`);
      else router.back();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kurulum oluşturulamadı.');
    } finally {
      setCreating(false);
    }
  }

  // Web teknisyen listesi servis personeli; yetki yoksa dizine düşülür ("Ben" ayrıca eklenir).
  const people = [
    { value: UNASSIGNED, label: 'Belirtilmedi' },
    ...(servicePeople.length
      ? servicePeople.map((u) => ({ value: u.id, label: u.fullName }))
      : [...(user ? [{ value: user.id, label: 'Ben' }] : []), ...(directory.data ?? []).filter((u) => u.id !== user?.id).map((u) => ({ value: u.id, label: u.fullName }))]),
  ];
  const contactRows = contacts.data?.items ?? [];
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: id ? 'Kurulumu Düzenle' : 'Yeni Kurulum', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="gap-3">
            <Eyebrow>Müşteri</Eyebrow>
            <CompanyPickerField value={company} onChange={chooseCompany} required error={errors.company || undefined} disabled={Boolean(id)} />
            {company ? (
              <View className="gap-1.5">
                <Text className="font-inter-medium text-[13px] text-muted-foreground">Kontak</Text>
                <ChoiceChips options={[{ value: '', label: 'Belirtilmedi' }, ...contactRows.map((c) => ({ value: c.id, label: c.fullName }))]} value={contactId} onChange={setContactId} />
              </View>
            ) : null}
            {!id && company ? (
              <View className="gap-1.5">
                <Text className="font-inter-medium text-[13px] text-muted-foreground">Makineler</Text>
                {companyMachines.length === 0 ? <Text className="font-inter text-xs text-muted-foreground">Bu firmaya bağlı makine yok.</Text> : companyMachines.map((machine) => {
                  const selected = deviceIds.includes(machine.id);
                  return (
                    <Pressable key={machine.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleDevice(machine.id)} className="flex-row items-center gap-3 rounded-control border border-border bg-card px-3 py-2 active:opacity-70">
                      <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={20} color={selected ? colors.primary : colors.mutedForeground} />
                      <Text className="flex-1 font-inter text-sm text-foreground" numberOfLines={2}>{`${[machine.brandName, machine.model ?? machine.productModelName].filter(Boolean).join(' ') || 'Makine'} · ${machine.serialNumber || 'Seri no yok'}`}</Text>
                    </Pressable>
                  );
                })}
                {deviceIds.length > 1 ? <Text className="font-inter text-xs text-muted-foreground">{`Seçilen ${deviceIds.length} makine için ayrı kurulum açılır.`}</Text> : null}
              </View>
            ) : null}
            <Field label="Lokasyon" value={location} onChangeText={setLocation} maxLength={255} />
            <ChoiceChips options={LOCATION_TYPES} value={locationType} onChange={setLocationType} />
          </View>
          <View className="gap-3">
            <Eyebrow>Planlama</Eyebrow>
            <Field label="Planlanan tarih" value={scheduled} onChangeText={setScheduled} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={16} error={errors.scheduled || undefined} />
            <Field label="Süre (dakika)" value={duration} onChangeText={setDuration} keyboardType="number-pad" maxLength={6} error={errors.duration || undefined} />
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Teknisyen</Text>
              <ChoiceChips options={people} value={assignee} onChange={setAssignee} />
            </View>
          </View>
          <Field label="Notlar" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label={id ? 'Kaydet' : 'Kurulumu Oluştur'} loading={save.isPending || creating} disabled={save.isPending || creating} onPress={() => void submit()} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
