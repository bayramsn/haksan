import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { companyUpdateSchema, type CompanyAddressInput, type CompanyUpdateInput } from '@haksan/shared';
import { useCompany, useUpdateCompanyFields } from '@/src/api/companies.hooks';
import { useLookup } from '@/src/api/crm.hooks';
import type { CompanyDetail } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import {
  CompanyFormFields,
  contactSourcePayload,
  normalizeRoles,
  toAddressInput,
  validateCompanyForm,
  type CompanyFormState,
  type FirmType,
  type SupplierCategory,
} from '@/src/features/CompanyFormFields';
import { Button, ErrorState, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';

/** `GET /companies/:id` ham satırı; tipte olmayan sütunlar burada okunur. */
type RawCompany = CompanyDetail & { supplierCategoryCode?: string | null; contactSourceId?: string | null; contactSourceText?: string | null };

const ADDRESS_TYPES = new Set(['office', 'factory', 'work_area', 'shipping', 'billing', 'other']);
const FIRM_TYPES = new Set(['customer', 'supplier', 'supplier_customer', 'competitor']);
const SUPPLIER_CATEGORIES = new Set(['manufacturer', 'transportation', 'logistics']);
/** PATCH'te boş alan null = silme. */
const nullable = (value: string): string | null => value.trim() || null;

export default function EditCompanyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const canUpdate = useCan('companies.update');
  const detail = useCompany(id);
  const update = useUpdateCompanyFields(id);
  const relationTypes = useLookup('company-relation-types');
  const statuses = useLookup('company-statuses');
  const sources = useLookup('contact-sources');
  const [form, setForm] = useState<CompanyFormState | null>(null);
  // Pasif/kara liste statüsü formda yok; kullanıcı değiştirmedikçe gönderilmez.
  const [originalStatus, setOriginalStatus] = useState<CompanyFormState['salesStatus'] | null>(null);

  useEffect(() => {
    const data = detail.data as RawCompany | undefined;
    if (!data || form || !relationTypes.data || !statuses.data || !sources.data) return;
    const phone = (type: string) => data.phones.find((row) => row.phoneType === type)?.phone ?? '';
    const email = (type: string) => data.emails.find((row) => row.emailType === type)?.email ?? '';
    const relation = relationTypes.data.find((row) => row.id === data.relationTypeId)?.code ?? 'customer';
    const status = statuses.data.find((row) => row.id === data.customerStatusId)?.code === 'active' ? 'active' : 'potential';
    setOriginalStatus(status);
    setForm({
      companyType: data.companyType === 'person' ? 'person' : 'company',
      firmType: (FIRM_TYPES.has(relation) ? relation : 'customer') as FirmType,
      salesStatus: status,
      supplierCategoryCode: SUPPLIER_CATEGORIES.has(data.supplierCategoryCode ?? '') ? (data.supplierCategoryCode as SupplierCategory) : null,
      divisionIds: data.divisions.map((division) => division.id),
      companyGroupCode: data.companyGroups[0]?.code ?? null,
      contactSourceCode: sources.data.find((row) => row.id === data.contactSourceId)?.code ?? null,
      contactSourceText: data.contactSourceText ?? '',
      sector: data.sector ?? '',
      legalTitle: data.legalTitle ?? '',
      primaryPhone: phone('main') || (data.phones.find((row) => row.isDefault)?.phone ?? ''),
      secondaryPhone: phone('secondary'),
      fax: phone('fax'),
      primaryEmail: data.emails.find((row) => row.isDefault && row.emailType !== 'secondary')?.email ?? email('main'),
      secondaryEmail: email('secondary'),
      website: data.website ?? '',
      taxOffice: data.taxOffice ?? '',
      taxNumber: data.taxNumber ?? '',
      notes: data.notes ?? '',
      addresses: data.addresses.map((address) => ({
        key: address.id,
        original: address,
        addressType: (ADDRESS_TYPES.has(address.addressType) ? address.addressType : 'other') as CompanyAddressInput['addressType'],
        country: address.country ?? 'Türkiye',
        province: address.province ?? '',
        district: address.district ?? '',
        fullAddress: address.fullAddress ?? '',
        isDefault: address.isDefault,
        isShipping: Boolean(address.isShipping),
        isBilling: Boolean(address.isBilling),
      })),
    });
  }, [detail.data, form, relationTypes.data, statuses.data, sources.data]);

  if (!canUpdate) return <Redirect href="/modules/companies" />;

  const loadError = detail.error ?? relationTypes.error ?? statuses.error ?? sources.error;
  if (!form) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Firmayı Düzenle', headerShown: true }} />
        {loadError ? <ErrorState message={loadError.message} onRetry={() => void detail.refetch()} /> : <Loading />}
      </SafeAreaView>
    );
  }

  function submit() {
    if (!form) return;
    const problem = validateCompanyForm(form);
    if (problem) return Alert.alert('Eksik bilgi', problem);
    const rawWebsite = form.website.trim();
    const candidate: CompanyUpdateInput = {
      legalTitle: form.legalTitle.trim(),
      companyType: form.companyType,
      sector: nullable(form.sector),
      supplierCategoryCode: form.supplierCategoryCode,
      taxOffice: nullable(form.taxOffice),
      taxNumber: nullable(form.taxNumber),
      website: rawWebsite ? (/^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`) : null,
      primaryPhone: nullable(form.primaryPhone),
      secondaryPhone: nullable(form.secondaryPhone),
      fax: nullable(form.fax),
      primaryEmail: nullable(form.primaryEmail),
      secondaryEmail: nullable(form.secondaryEmail),
      notes: nullable(form.notes),
      ...contactSourcePayload(form),
      companyGroupCodes: form.companyGroupCode ? [form.companyGroupCode] : [],
      divisionIds: form.divisionIds,
      relationTypeCode: form.firmType,
      ...(form.salesStatus !== originalStatus ? { customerStatusCode: form.salesStatus } : {}),
      addresses: normalizeRoles(form.addresses).map(toAddressInput),
    } as CompanyUpdateInput;
    const parsed = companyUpdateSchema.safeParse(candidate);
    if (!parsed.success) return Alert.alert('Alanları kontrol edin', parsed.error.issues[0]?.message ?? 'Geçersiz bilgi.');
    update.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('Firma güncellendi');
        router.back();
      },
      onError: (error) => Alert.alert('Firma güncellenemedi', error.message),
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Firmayı Düzenle', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-5 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <CompanyFormFields form={form} onChange={setForm} />
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Kaydet" loading={update.isPending} disabled={update.isPending} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
