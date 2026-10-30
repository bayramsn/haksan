import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCustomerDevicesByCompany, useInstallation } from '@/src/api/operations.hooks';
import { useCreateInstallation, useUpdateInstallation } from '@/src/api/service.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import { Button, ErrorState, Field, Loading } from '@/src/ui';
import { CompanyPicker, ContactPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { CompanyAddressSelect } from '@/src/ui/select/fields';
import { toast } from '@/src/ui/toast';
import { ChoiceChips, DayField, DeviceRecordPicker, FormSection, UserPicker, type DeviceChoice } from '@/src/ui/service/fields';
import { dayInput, durationMinutes, LOCATION_TYPE_LABELS, parseDay, suggestedFormNo } from '@/src/ui/service/logistics';

type LocationType = 'istanbul_ici' | 'istanbul_disi';
const LOCATION_OPTIONS = (Object.keys(LOCATION_TYPE_LABELS) as LocationType[]).map((value) => ({ value, label: LOCATION_TYPE_LABELS[value]! }));

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Web CreateInstallationDialog ("Yeni Kurulum"); `id` verilirse plan alanları düzenlenir. */
export default function InstallationFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; companyId?: string; companyName?: string; opportunityId?: string; quoteId?: string }>();
  const id = first(params.id);
  const editing = Boolean(id);
  const canSave = useCan(editing ? 'installations.update' : 'installations.create');
  const existing = useInstallation(id);
  const create = useCreateInstallation();
  const update = useUpdateInstallation(id);

  const [company, setCompany] = useState<PickedRecord | null>(
    first(params.companyId) ? { id: first(params.companyId), name: first(params.companyName) || 'Seçili firma' } : null,
  );
  const [contact, setContact] = useState<PickedRecord | null>(null);
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [pickedDevices, setPickedDevices] = useState<DeviceChoice[]>([]);
  const [scheduledDate, setScheduledDate] = useState(dayInput(new Date()));
  const [assignee, setAssignee] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [locationType, setLocationType] = useState<LocationType>('istanbul_ici');
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');
  const [notes, setNotes] = useState('');
  const [sourceLinked, setSourceLinked] = useState(true);
  const [loaded, setLoaded] = useState(!editing);
  const [companyError, setCompanyError] = useState<string>();

  const devices = useCustomerDevicesByCompany(company?.id);
  const deviceRows = useMemo(() => devices.data?.items ?? [], [devices.data]);
  const selectedDevices = deviceIds.map((id) => deviceRows.find((device) => device.id === id) ?? pickedDevices.find((device) => device.id === id)).filter((device) => device !== undefined);

  useEffect(() => {
    const row = existing.data;
    if (!editing || loaded || !row) return;
    setCompany(row.company ? { id: row.company.id, name: row.company.shortName ?? row.company.legalTitle } : null);
    setContact(row.contact ? { id: row.contact.id, name: row.contact.fullName } : null);
    setDeviceIds(row.customerDeviceId ? [row.customerDeviceId] : []);
    setScheduledDate(dayInput(row.scheduledDate));
    setAssignee(row.assignedToUserId ?? row.assignedTo?.id ?? null);
    setLocation(row.location ?? '');
    setLocationType(row.locationType === 'istanbul_disi' ? 'istanbul_disi' : 'istanbul_ici');
    setHours(row.durationMinutes != null ? String(Math.floor(row.durationMinutes / 60)) : '0');
    setMinutes(row.durationMinutes != null ? String(row.durationMinutes % 60) : '0');
    setNotes(row.notes ?? '');
    setLoaded(true);
  }, [editing, existing.data, loaded]);

  // Web: firma seçilince ilk makine önseçilir.
  const firstDeviceId = deviceRows[0]?.id;
  useEffect(() => {
    if (editing || deviceIds.length || !firstDeviceId) return;
    setDeviceIds([firstDeviceId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDeviceId]);

  if (!canSave) return <Redirect href={'/modules/installations' as Href} />;

  if (editing && !loaded) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Kurulum Planı', headerShown: true }} />
        {existing.error ? <ErrorState message={existing.error.message} onRetry={() => void existing.refetch()} /> : <Loading />}
      </SafeAreaView>
    );
  }

  const total = durationMinutes(hours, minutes);
  const busy = create.isPending || update.isPending;

  const submit = async () => {
    if (!company) {
      setCompanyError('Firma seçiniz');
      toast.error('Firma seçiniz');
      return;
    }
    const scheduled = scheduledDate ? parseDay(scheduledDate) : null;
    try {
      if (editing) {
        await update.mutateAsync({
          companyId: company.id,
          contactId: contact?.id ?? null,
          customerDeviceId: deviceIds[0] ?? null,
          scheduledDate: scheduled,
          assignedToUserId: assignee,
          location: location.trim() || null,
          locationType,
          durationMinutes: total > 0 ? total : null,
          notes: notes.trim() || null,
        });
        toast.success('Kurulum güncellendi');
        router.back();
        return;
      }
      const targets: (string | undefined)[] = deviceIds.length ? deviceIds : [undefined];
      await Promise.all(
        targets.map((customerDeviceId) => {
          const formNo = suggestedFormNo(customerDeviceId);
          return create.mutateAsync({
            companyId: company.id,
            opportunityId: sourceLinked ? first(params.opportunityId) || undefined : undefined,
            quoteId: sourceLinked ? first(params.quoteId) || undefined : undefined,
            contactId: contact?.id ?? undefined,
            customerDeviceId,
            scheduledDate: scheduled ?? undefined,
            assignedToUserId: assignee ?? undefined,
            location: location.trim() || undefined,
            locationType,
            durationMinutes: total > 0 ? total : undefined,
            notes: notes.trim() || undefined,
            formData: formNo ? { formNo, machineId: customerDeviceId } : undefined,
          });
        }),
      );
      toast.success(targets.length > 1 ? `${targets.length} makine için kurulum oluşturuldu` : 'Kurulum oluşturuldu');
      router.back();
    } catch (error) {
      toast.error(`${editing ? 'Kurulum güncellenemedi' : 'Kurulum oluşturulamadı'}: ${error instanceof Error ? error.message : 'İşlem başarısız.'}`);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: editing ? 'Kurulum Planı' : 'Yeni Kurulum', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <FormSection title="Müşteri ve makine" hint="Saha kurulum planı oluşturun.">
            <CompanyPicker
              label="Firma *"
              placeholder="Firma seçin..."
              value={company}
              error={companyError}
              onChange={(next) => {
                if (next?.id !== company?.id) setSourceLinked(false);
                setCompany(next);
                setContact(null);
                setDeviceIds([]);
                setPickedDevices([]);
                setLocation('');
                setCompanyError(undefined);
              }}
            />
            <ContactPicker label="Kontak" companyId={company?.id ?? null} value={contact} onChange={setContact} />
            <DeviceRecordPicker label={editing ? 'Makine' : 'Makineler'} companyId={company?.id ?? null} values={deviceIds}
              multiple={!editing} selectedRecords={pickedDevices} onChange={(rows) => { setDeviceIds(rows.map((row) => row.id)); setPickedDevices(rows); }} />
            {selectedDevices.map((device, index) => (
              <View key={device.id} className="gap-0.5 rounded-control border border-border bg-muted px-3 py-2">
                <Text className="font-inter-semibold text-[13px] text-foreground">
                  {index + 1}. {'label' in device ? device.label : [device.brandName, device.productModelName ?? device.model].filter(Boolean).join(' ') || 'Makine'}
                </Text>
                <Text className="font-inter text-xs text-muted-foreground">
                  {`Seri No: ${device.serialNumber || '—'} · CNC: ${device.controlUnit || '—'} · Teslim: ${'deliveryDate' in device && typeof device.deliveryDate === 'string' ? formatDate(device.deliveryDate) : '—'}`}
                </Text>
              </View>
            ))}
            {!editing && deviceIds.length > 1 ? (
              <Text className="font-inter text-xs text-muted-foreground">Seçilen her makine için ayrı kurulum işi ve kurulum tutanağı oluşturulur.</Text>
            ) : null}
          </FormSection>

          <FormSection title="Saha planlama">
            <DayField label="Planlanan Tarih" value={scheduledDate} onChange={setScheduledDate} />
            <UserPicker label="Teknisyen" value={assignee} onChange={setAssignee} serviceOnly />
            <CompanyAddressSelect label="Lokasyon" companyId={company?.id} value={location} onChange={(next) => setLocation(next.slice(0, 255))} />
            <ChoiceChips label="Konum Tipi" value={locationType} options={LOCATION_OPTIONS} onChange={setLocationType} />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Süre (saat)" value={hours} onChangeText={setHours} keyboardType="number-pad" maxLength={4} />
              </View>
              <View className="flex-1">
                <Field label="Süre (dk)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" maxLength={2} />
              </View>
            </View>
            <Field
              label="Notlar"
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={2000}
              style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }}
            />
          </FormSection>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <Button className="flex-1" label="Vazgeç" variant="ghost" disabled={busy} onPress={() => router.back()} />
          <Button
            className="flex-[2]"
            label={editing ? 'Kaydet' : 'Kurulumu Oluştur'}
            loading={busy}
            disabled={busy}
            onPress={() => void submit()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
