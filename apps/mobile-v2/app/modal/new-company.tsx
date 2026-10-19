import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { companyCreateSchema } from '@haksan/shared';
import { useCreateCompany } from '@/src/api/companies.hooks';
import { Button } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { CompanyFormFields } from '@/src/ui/crm/CompanyFormFields';
import {
  BUSINESS_UNIT_CODES,
  EMPTY_COMPANY_FORM,
  buildCompanyCreateBody,
  validateCompanyForm,
  type CompanyFormErrors,
  type CompanyFormState,
} from '@/src/ui/crm/company-form-logic';

const ERROR_ORDER: (keyof CompanyFormErrors)[] = ['legalTitle', 'supplierCategoryCode', 'divisionIds'];

export default function NewCompanyScreen() {
  const router = useRouter();
  const canCreate = useCan('companies.create');
  const { user, scope } = useAuth();
  const params = useLocalSearchParams<{ name?: string | string[] }>();
  const initialName = (Array.isArray(params.name) ? params.name[0] : params.name)?.trim().slice(0, 300) ?? '';
  const [form, setForm] = useState<CompanyFormState>(() => ({ ...EMPTY_COMPANY_FORM, legalTitle: initialName }));
  const [errors, setErrors] = useState<CompanyFormErrors>({});
  const create = useCreateCompany();

  // Web: aktif birim iş birimiyse o, değilse birincil, yoksa ilk iş birimi varsayılır.
  useEffect(() => {
    if (form.divisionIds.length > 0) return;
    const units = (user?.divisions ?? []).filter((division) => BUSINESS_UNIT_CODES.has(division.code ?? ''));
    const fallback =
      units.find((division) => division.id === scope.divisionId)?.id ??
      units.find((division) => division.isPrimary)?.id ??
      units[0]?.id;
    if (fallback) setForm((current) => ({ ...current, divisionIds: [fallback] }));
  }, [user?.divisions, scope.divisionId, form.divisionIds.length]);

  if (!canCreate) return <Redirect href="/(tabs)/modules/companies" />;

  const change = (next: Partial<CompanyFormState>) => {
    setForm((current) => ({ ...current, ...next }));
    setErrors((current) => {
      const cleared = { ...current };
      for (const key of Object.keys(next)) delete cleared[key as keyof CompanyFormErrors];
      return cleared;
    });
  };

  function submit() {
    const found = validateCompanyForm(form);
    setErrors(found);
    const first = ERROR_ORDER.find((key) => found[key]);
    if (first) {
      toast.error(found[first]!);
      return;
    }
    // Sunucudaki şemayla aynı kontrol (telefon/e-posta/site biçimi); yalnız UX içindir.
    const parsed = companyCreateSchema.safeParse(buildCompanyCreateBody(form));
    if (!parsed.success) {
      toast.error(`Firma oluşturulamadı · ${parsed.error.issues[0]?.message ?? 'Alanları kontrol edin.'}`);
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: (company) => {
        toast.success(`Firma oluşturuldu · ${form.legalTitle.trim()}`);
        if (company?.id) router.replace(`/(tabs)/modules/companies/${company.id}` as Href);
        else router.back();
      },
      onError: (error) => toast.error(`Firma oluşturulamadı · ${error.message || 'API isteği başarısız oldu.'}`),
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni Firma', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-3 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-[13px] text-muted-foreground">
            CRM ile aynı alanlar · seçiciler listeden açılır, listede yoksa yazabilirsiniz.
          </Text>
          <CompanyFormFields mode="create" form={form} onChange={change} errors={errors} />
          <Text className="font-inter text-xs text-muted-foreground">
            Yeni firma kaydı çevrimiçi bağlantı gerektirir. Böylece aynı kaydın iki kez oluşması engellenir.
          </Text>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1">
            <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} />
          </View>
          <View className="flex-[2]">
            <Button label={create.isPending ? 'Oluşturuluyor...' : 'Firmayı Oluştur'} loading={create.isPending} onPress={submit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
