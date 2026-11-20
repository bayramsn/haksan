import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { companyCreateSchema, type CompanyCreateInput } from '@haksan/shared';
import { useCreateCompany } from '@/src/api/companies.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import {
  CompanyFormFields,
  contactSourcePayload,
  newAddressDraft,
  normalizeRoles,
  toAddressInput,
  useBusinessUnits,
  validateCompanyForm,
  type CompanyFormState,
} from '@/src/features/CompanyFormFields';
import { Button } from '@/src/ui';

const text = (value: string): string | undefined => value.trim() || undefined;
const url = (value: string): string | undefined => {
  const raw = value.trim();
  return raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : undefined;
};

export default function NewCompanyScreen() {
  const router = useRouter();
  const source = useLocalSearchParams<{ companyName?: string; phone?: string; email?: string; notes?: string }>();
  const canCreate = useCan('companies.create');
  const { scope } = useAuth();
  const units = useBusinessUnits();
  // Web: aktif birim iş birimiyse o, değilse birincil, yoksa ilk birim varsayılır.
  const fallbackDivision = units.find((unit) => unit.id === scope.divisionId)?.id ?? units.find((unit) => unit.isPrimary)?.id ?? units[0]?.id;
  const [form, setForm] = useState<CompanyFormState>(() => ({
    companyType: 'company',
    firmType: 'customer',
    salesStatus: 'potential',
    supplierCategoryCode: null,
    divisionIds: fallbackDivision ? [fallbackDivision] : [],
    companyGroupCode: null,
    contactSourceCode: null,
    contactSourceText: '',
    sector: '',
    legalTitle: source.companyName ?? '',
    primaryPhone: source.phone ?? '',
    secondaryPhone: '',
    fax: '',
    primaryEmail: source.email ?? '',
    secondaryEmail: '',
    website: '',
    taxOffice: '',
    taxNumber: '',
    notes: source.notes ?? '',
    addresses: [newAddressDraft(true)],
  }));

  const create = useCreateCompany(() => {
    Alert.alert('Firma oluşturuldu', form.legalTitle.trim());
    router.back();
  });

  if (!canCreate) return <Redirect href="/modules/companies" />;

  function submit() {
    const problem = validateCompanyForm(form);
    if (problem) return Alert.alert('Eksik bilgi', problem);
    const { contactSourceCode, contactSourceText } = contactSourcePayload(form);
    const addresses = normalizeRoles(form.addresses).filter((row) => row.fullAddress.trim() || row.province.trim() || row.district.trim());
    const candidate = {
      companyType: form.companyType,
      legalTitle: form.legalTitle.trim(),
      shortName: form.companyType === 'person' ? form.legalTitle.trim() : undefined,
      sector: text(form.sector),
      supplierCategoryCode: form.supplierCategoryCode ?? undefined,
      taxOffice: text(form.taxOffice),
      taxNumber: text(form.taxNumber),
      website: url(form.website),
      primaryPhone: text(form.primaryPhone),
      secondaryPhone: text(form.secondaryPhone),
      fax: text(form.fax),
      primaryEmail: text(form.primaryEmail),
      secondaryEmail: text(form.secondaryEmail),
      addresses: addresses.length ? addresses.map(toAddressInput) : undefined,
      notes: text(form.notes),
      relationTypeCode: form.firmType,
      customerStatusCode: form.salesStatus,
      companyGroupCode: form.companyGroupCode ?? undefined,
      companyGroupCodes: form.companyGroupCode ? [form.companyGroupCode] : [],
      divisionId: form.divisionIds[0],
      divisionIds: form.divisionIds,
      contactSourceCode: contactSourceCode ?? undefined,
      contactSourceText: contactSourceText ?? undefined,
    };
    // Sunucudaki ile aynı şema; istemci doğrulaması yalnız UX için.
    const parsed = companyCreateSchema.safeParse(candidate);
    if (!parsed.success) return Alert.alert('Alanları kontrol edin', parsed.error.issues[0]?.message ?? 'Geçersiz bilgi.');
    create.mutate(parsed.data as CompanyCreateInput, {
      onError: (error) => Alert.alert('Firma oluşturulamadı', error.message),
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni Firma', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-5 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <CompanyFormFields form={form} onChange={setForm} />
          <Text className="font-inter text-xs text-muted-foreground">Firma logosu ve harita konumu webden eklenir; konum firma kartındaki "Konumu buraya kaydet" ile de kaydedilebilir.</Text>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Firmayı Oluştur" loading={create.isPending} disabled={create.isPending} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
