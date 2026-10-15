import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { companyUpdateSchema } from '@haksan/shared';
import { useCompany, useUpdateCompanyFields } from '@/src/api/companies.hooks';
import { useCompanyFormLookups } from '@/src/api/crm-general.hooks';
import type { CompanyDetail } from '@/src/api/endpoints';
import { Button, ErrorState, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useCan } from '@/src/auth/AuthProvider';
import { CompanyFormFields } from '@/src/ui/crm/CompanyFormFields';
import {
  buildCompanyUpdatePatch,
  companyFormFromDetail,
  validateCompanyForm,
  type CompanyFormErrors,
  type CompanyFormState,
} from '@/src/ui/crm/company-form-logic';

/** `GET /companies/:id` ham satırı tipte yer almayan bu alanları da döndürür. */
type CompanyDetailRaw = CompanyDetail & {
  supplierCategoryCode?: string | null;
  contactSourceId?: string | null;
  contactSourceText?: string | null;
};

const ERROR_ORDER: (keyof CompanyFormErrors)[] = ['legalTitle', 'supplierCategoryCode', 'divisionIds'];

export default function EditCompanyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const canUpdate = useCan('companies.update');
  const detail = useCompany(id);
  const lookups = useCompanyFormLookups();
  const update = useUpdateCompanyFields(id);
  const [initial, setInitial] = useState<CompanyFormState | null>(null);
  const [form, setForm] = useState<CompanyFormState | null>(null);
  const [errors, setErrors] = useState<CompanyFormErrors>({});

  // Detay ve kod eşleme listeleri geldiğinde formu bir kez doldur; kullanıcı düzenlemesi ezilmesin.
  useEffect(() => {
    if (!detail.data || lookups.isPending || initial) return;
    const next = companyFormFromDetail(detail.data as CompanyDetailRaw, lookups);
    setInitial(next);
    setForm(next);
  }, [detail.data, lookups, initial]);

  if (!canUpdate) return <Redirect href="/(tabs)/modules/companies" />;

  if (detail.error) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Firma Düzenle', headerShown: true }} />
        <ErrorState message={detail.error.message || 'Firma yüklenemedi.'} onRetry={() => void detail.refetch()} />
      </SafeAreaView>
    );
  }

  if (!initial || !form) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Firma Düzenle', headerShown: true }} />
        <Loading />
      </SafeAreaView>
    );
  }

  const change = (next: Partial<CompanyFormState>) => {
    setForm((current) => (current ? { ...current, ...next } : current));
    setErrors((current) => {
      const cleared = { ...current };
      for (const key of Object.keys(next)) delete cleared[key as keyof CompanyFormErrors];
      return cleared;
    });
  };

  function submit() {
    if (!form || !initial) return;
    const found = validateCompanyForm(form);
    // Mevcut kayıtta birim yoksa ve kullanıcı değiştirmediyse düzenlemeyi engelleme.
    if (found.divisionIds && initial.divisionIds.length === 0 && form.divisionIds.length === 0) delete found.divisionIds;
    setErrors(found);
    const first = ERROR_ORDER.find((key) => found[key]);
    if (first) {
      toast.error(found[first]!);
      return;
    }
    const patch = buildCompanyUpdatePatch(initial, form);
    if (Object.keys(patch).length === 0) {
      router.back();
      return;
    }
    const parsed = companyUpdateSchema.safeParse(patch);
    if (!parsed.success) {
      toast.error(`Firma güncellenemedi · ${parsed.error.issues[0]?.message ?? 'Alanları kontrol edin.'}`);
      return;
    }
    update.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(`Firma güncellendi · ${form.legalTitle.trim()}`);
        router.back();
      },
      onError: (error) => toast.error(`Firma güncellenemedi · ${error.message || 'API isteği başarısız oldu.'}`),
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Firma Düzenle', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <CompanyFormFields mode="edit" form={form} onChange={change} errors={errors} />
          <Text className="font-inter text-xs text-muted-foreground">
            Yalnızca değiştirdiğin alanlar sunucuya gönderilir; başka kullanıcının aynı anda yaptığı değişiklikler ezilmez.
          </Text>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1">
            <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} />
          </View>
          <View className="flex-[2]">
            <Button label={update.isPending ? 'Kaydediliyor...' : 'Kaydet'} loading={update.isPending} onPress={submit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
