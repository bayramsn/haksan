import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCustomerDevicesByCompany } from '@/src/api/operations.hooks';
import { useCreateCustomerDevice, useReservedMachineStock } from '@/src/api/service.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, Field } from '@/src/ui';
import { CompanyPicker, ContactPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { toast } from '@/src/ui/toast';
import { ProductSelect } from '@/src/ui/select/fields';
import { DayField, FormSection, ReservedStockPicker } from '@/src/ui/service/fields';
import { addYears, machineNotes } from '@/src/ui/service/machines';

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Web CreateMachineDialog: "Yeni Makine / Varlık Ekle". */
export default function NewDeviceScreen() {
  const router = useRouter();
  const canCreate = useCan('customer_devices.update');
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string }>();
  const create = useCreateCustomerDevice();

  const initialCompanyId = first(params.companyId);
  const [company, setCompany] = useState<PickedRecord | null>(
    initialCompanyId ? { id: initialCompanyId, name: first(params.companyName) || 'Seçili firma' } : null,
  );
  const [contact, setContact] = useState<PickedRecord | null>(null);
  const [stockId, setStockId] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [installationDate, setInstallationDate] = useState('');
  const [warrantyStart, setWarrantyStart] = useState('');
  const [warrantyEnd, setWarrantyEnd] = useState('');
  const [touched, setTouched] = useState({ start: false, end: false });
  const [errors, setErrors] = useState<{ company?: string; model?: string; serial?: string }>({});

  const stock = useReservedMachineStock(company?.id ?? null);
  const devices = useCustomerDevicesByCompany(company?.id);
  const usedStock = new Set((devices.data?.items ?? []).map((device) => device.inventoryItemId).filter(Boolean));
  const candidates = (stock.data?.items ?? []).filter((item) => !usedStock.has(item.id));
  const candidateKey = candidates.map((item) => item.id).join(',');

  // Web: firma seçilince ilk uygun stok kalemi otomatik seçilir.
  useEffect(() => {
    if (stockId || !candidates[0]) return;
    applyStock(candidates[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateKey]);

  if (!canCreate) return <Redirect href={'/modules/customer-devices' as Href} />;

  function applyStock(id: string | null) {
    setStockId(id);
    const item = candidates.find((candidate) => candidate.id === id);
    if (!item) {
      setModel('');
      setSerial('');
      return;
    }
    setModel(item.product?.modelCode || item.product?.fullName || '');
    setSerial(item.serialNumber || '');
  }

  const changeInstallation = (day: string) => {
    setInstallationDate(day);
    if (!touched.start) setWarrantyStart(day);
    if (!touched.end) setWarrantyEnd(addYears(day, 2));
  };

  const submit = () => {
    const next: typeof errors = {};
    if (!company) next.company = 'Firma seçimi zorunludur.';
    if (!model.trim()) next.model = 'Model zorunludur.';
    if (!serial.trim()) next.serial = 'Seri no zorunludur.';
    setErrors(next);
    if (!company || Object.keys(next).length) {
      toast.error('Lütfen gerekli alanları doldurun.');
      return;
    }
    create.mutate(
      {
        companyId: company.id,
        contactId: contact?.id ?? undefined,
        initialCompanyId: company.id,
        inventoryItemId: stockId ?? undefined,
        installationDate: installationDate || undefined,
        warrantyStartDate: warrantyStart || undefined,
        warrantyEndDate: warrantyEnd || undefined,
        notes: machineNotes(model, serial) || undefined,
      },
      {
        onSuccess: (device) => {
          toast.success('Makine başarıyla eklendi.');
          router.replace(`/modules/customer-devices/${device.id}` as Href);
        },
        onError: (error) => toast.error(`Makine eklenirken hata oluştu: ${error.message}`),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni Makine / Varlık Ekle', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <FormSection title="Müşteri" hint="Müşteriye satılmış ve kurulumu yapılmış cihazı kaydedin.">
            <CompanyPicker
              label="Firma Seçimi *"
              placeholder="Firma seçin"
              value={company}
              error={errors.company}
              onChange={(next) => {
                setCompany(next);
                setContact(null);
                setStockId(null);
                setModel('');
                setSerial('');
                setErrors((current) => ({ ...current, company: undefined }));
              }}
            />
            <ContactPicker label="Kontak" companyId={company?.id ?? null} value={contact} onChange={setContact} />
          </FormSection>

          <FormSection title="Makine">
            <ReservedStockPicker companyId={company?.id ?? null} value={stockId ? `${model} · ${serial}` : ''} selectedId={stockId}
              excludedIds={[...usedStock] as string[]} onSelect={(item) => {
                setStockId(item?.id ?? null);
                setModel(item?.data?.product?.modelCode || item?.data?.product?.fullName || '');
                setSerial(item?.data?.serialNumber || '');
              }} />
            <ProductSelect
              label="Model *"
              placeholder="Katalogdan model arayın veya yazın"
              value={model}
              onSelect={(item) => { setStockId(null); setModel(item?.data?.modelCode || item?.label || ''); }}
              clearable
              error={errors.model}
            />
            <Field label="Seri No *" value={serial} onChangeText={(value) => { setStockId(null); setSerial(value); }} maxLength={255} autoCapitalize="characters" error={errors.serial} />
            <DayField label="Kurulum Tarihi" value={installationDate} onChange={changeInstallation} />
            <DayField
              label="Garanti Başlangıç"
              value={warrantyStart}
              onChange={(day) => {
                setTouched((current) => ({ ...current, start: true }));
                setWarrantyStart(day);
                if (!touched.end) setWarrantyEnd(addYears(day, 2));
              }}
            />
            <DayField
              label="Garanti Bitiş"
              value={warrantyEnd}
              onChange={(day) => {
                setTouched((current) => ({ ...current, end: true }));
                setWarrantyEnd(day);
              }}
            />
            {stockId ? (
              <Text className="font-inter text-xs text-muted-foreground">
                Teknik bilgiler makineye bağlı üründen otomatik gelir; değerler ürün kartında yönetilir.
              </Text>
            ) : null}
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
