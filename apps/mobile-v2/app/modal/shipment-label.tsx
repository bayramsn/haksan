import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCompany } from '@/src/api/companies.hooks';
import { ErrorState, Field, Loading } from '@/src/ui';
import { CompanyPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { FormSection } from '@/src/ui/service/fields';
import { cargoLabelInfo } from '@/src/ui/service/logistics';
import { CargoLabelDocument } from '@/src/ui/service/ShipmentDocuments';

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Web PrintCargoLabelDialog ("Kargo Etiketi Yazdır"). */
export default function ShipmentLabelScreen() {
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string }>();
  const [company, setCompany] = useState<PickedRecord | null>(
    first(params.companyId) ? { id: first(params.companyId), name: first(params.companyName) || 'Seçili firma' } : null,
  );
  const [phone, setPhone] = useState('');
  const [phoneFor, setPhoneFor] = useState<string | null>(null);
  const detail = useCompany(company?.id ?? '');
  const info = cargoLabelInfo(detail.data);

  useEffect(() => {
    if (!detail.data || phoneFor === detail.data.id) return;
    setPhone(info.tel);
    setPhoneFor(detail.data.id);
  }, [detail.data, info.tel, phoneFor]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Kargo Etiketi Yazdır', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <FormSection title="Etiket" hint="Etiketi yazdırılacak firmayı seçiniz.">
            <CompanyPicker
              label="Firma"
              placeholder="Firma seçin veya arayın..."
              value={company}
              onChange={(next) => {
                setCompany(next);
                setPhone('');
                setPhoneFor(null);
              }}
            />
            {detail.error ? (
              <Text className="font-inter text-xs text-destructive">Firma bilgileri alınamadı. Tekrar seçim yapın.</Text>
            ) : null}
            <Field label="Alıcı Telefonu" value={phone} onChangeText={setPhone} placeholder="Örn. 0 (212) 000 00 00" keyboardType="phone-pad" maxLength={40} />
            <Text className="font-inter text-xs text-muted-foreground">Etikette yazacak numarayı bu baskı için değiştirebilirsiniz.</Text>
          </FormSection>

          {!company ? null : detail.isPending ? (
            <Loading />
          ) : detail.error ? (
            <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} />
          ) : detail.data ? (
            <CargoLabelDocument firma={detail.data.legalTitle || detail.data.shortName || company.name} adres={info.adres} ilceSehir={info.ilceSehir} tel={phone.trim()} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
