import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useContact } from '@/src/api/crm.hooks';
import { useUpdateCustomerDevice } from '@/src/api/service.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, Card } from '@/src/ui';
import { CompanyPicker, ContactPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { toast } from '@/src/ui/toast';
import { FormSection } from '@/src/ui/service/fields';

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Web MachinesPage "Kullanıcı Firma" diyaloğu: ilk müşteri korunur. */
export default function DeviceOwnerScreen() {
  const router = useRouter();
  const canUpdate = useCan('customer_devices.update');
  const params = useLocalSearchParams<{ id?: string; companyId?: string; companyName?: string; contactId?: string; initialCompanyName?: string }>();
  const id = first(params.id);
  const update = useUpdateCustomerDevice(id);
  const initialContactId = first(params.contactId);
  const initialContact = useContact(initialContactId);

  const [company, setCompany] = useState<PickedRecord | null>(
    first(params.companyId) ? { id: first(params.companyId), name: first(params.companyName) || 'Seçili firma' } : null,
  );
  const [contact, setContact] = useState<PickedRecord | null>(null);
  const [contactTouched, setContactTouched] = useState(false);

  useEffect(() => {
    if (contactTouched || !initialContact.data) return;
    setContact({ id: initialContact.data.id, name: initialContact.data.fullName });
  }, [contactTouched, initialContact.data]);

  if (!canUpdate || !id) return <Redirect href={'/modules/customer-devices' as Href} />;

  const save = () => {
    if (!company) return;
    update.mutate(
      { companyId: company.id, contactId: contact?.id ?? null },
      {
        onSuccess: () => {
          toast.success('Kullanıcı firma güncellendi');
          router.back();
        },
        onError: (error) => toast.error(`Kullanıcı firma güncellenemedi: ${error.message}`),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Kullanıcı Firma', headerShown: true }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
        <Card>
          <Text className="font-inter text-sm text-muted-foreground">
            İlk müşteri: <Text className="font-inter-semibold text-foreground">{first(params.initialCompanyName) || '—'}</Text>
          </Text>
        </Card>
        <FormSection title="Kullanıcı Firma" hint="İlk müşteri korunur; sadece cihazı bugün kullanan firma değiştirilir.">
          <CompanyPicker
            label="Firma"
            placeholder="Kullanıcı firma seçin"
            value={company}
            clearable={false}
            onChange={(next) => {
              setCompany(next);
              setContact(null);
              setContactTouched(true);
            }}
          />
          <ContactPicker
            label="Kontak"
            companyId={company?.id ?? null}
            value={contact}
            onChange={(next) => {
              setContact(next);
              setContactTouched(true);
            }}
          />
        </FormSection>
      </ScrollView>
      <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
        <Button className="flex-1" label="Vazgeç" variant="ghost" disabled={update.isPending} onPress={() => router.back()} />
        <Button className="flex-[2]" label="Kaydet" loading={update.isPending} disabled={!company || update.isPending} onPress={save} />
      </View>
    </SafeAreaView>
  );
}
