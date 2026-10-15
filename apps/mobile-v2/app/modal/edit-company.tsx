import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { companyUpdateSchema, type CompanyUpdateInput } from '@haksan/shared';
import { useCompany, useUpdateCompanyFields } from '@/src/api/companies.hooks';
import { Button, Field, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { ErrorState } from '@/src/ui';
import { useCan } from '@/src/auth/AuthProvider';

type FormState = {
  legalTitle: string;
  shortName: string;
  sector: string;
  taxOffice: string;
  taxNumber: string;
  primaryPhone: string;
  primaryEmail: string;
  website: string;
  notes: string;
};

const EMPTY: FormState = {
  legalTitle: '',
  shortName: '',
  sector: '',
  taxOffice: '',
  taxNumber: '',
  primaryPhone: '',
  primaryEmail: '',
  website: '',
  notes: '',
};

/** Boş metin alanları şemaya `null` gitmeli; PATCH'te alan silme anlamı taşır. */
const blank = (v: string): string | null => (v.trim() === '' ? null : v.trim());

/** Birincil telefon/e-posta: detay ucundaki işaretli kayıt, yoksa ilk satır. */
function preferred<T extends { isPreferred?: boolean | null }>(rows: T[] | undefined): T | undefined {
  return rows?.find((row) => row.isPreferred) ?? rows?.[0];
}

export default function EditCompanyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const canUpdate = useCan('companies.update');
  const detail = useCompany(id);
  const update = useUpdateCompanyFields(id);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [hydrated, setHydrated] = useState(false);

  // Detay geldiğinde formu bir kez doldur; kullanıcı düzenlemesi ezilmesin.
  useEffect(() => {
    const data = detail.data;
    if (!data || hydrated) return;
    const phoneRow = preferred(data.phones as ({ phone: string; isPreferred?: boolean | null }[] | undefined));
    const emailRow = preferred(data.emails as ({ email: string; isPreferred?: boolean | null }[] | undefined));
    setForm({
      legalTitle: data.legalTitle ?? '',
      shortName: data.shortName ?? '',
      sector: data.sector ?? '',
      taxOffice: data.taxOffice ?? '',
      taxNumber: data.taxNumber ?? '',
      primaryPhone: phoneRow?.phone ?? '',
      primaryEmail: emailRow?.email ?? '',
      website: data.website ?? '',
      notes: data.notes ?? '',
    });
    setHydrated(true);
  }, [detail.data, hydrated]);

  if (!canUpdate) return <Redirect href="/(tabs)/modules/companies" />;

  if (detail.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Firmayı Düzenle', headerShown: true }} />
        <Loading />
      </SafeAreaView>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Firmayı Düzenle', headerShown: true }} />
        <ErrorState message={detail.error?.message ?? 'Firma yüklenemedi.'} onRetry={() => void detail.refetch()} />
      </SafeAreaView>
    );
  }

  const set = <K extends keyof FormState>(key: K, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  function submit() {
    const candidate: CompanyUpdateInput = {
      legalTitle: form.legalTitle.trim(),
      shortName: blank(form.shortName),
      sector: blank(form.sector),
      taxOffice: blank(form.taxOffice),
      taxNumber: blank(form.taxNumber),
      primaryPhone: blank(form.primaryPhone),
      primaryEmail: blank(form.primaryEmail),
      website: blank(form.website),
      notes: blank(form.notes),
    };

    // Sunucudaki ile birebir aynı şema — istemci doğrulaması yalnızca UX içindir.
    const parsed = companyUpdateSchema.safeParse(candidate);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors(
        Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v?.[0]])) as Partial<
          Record<keyof FormState, string>
        >
      );
      return;
    }
    update.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('Firma güncellendi');
        router.back();
      },
      onError: (error) => Alert.alert('Güncelleme yapılamadı', error.message),
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Firmayı Düzenle', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <Field
            label="Ünvan *"
            value={form.legalTitle}
            onChangeText={(v) => set('legalTitle', v)}
            error={errors.legalTitle}
          />
          <Field label="Kısa ad" value={form.shortName} onChangeText={(v) => set('shortName', v)} error={errors.shortName} />
          <Field label="Sektör" value={form.sector} onChangeText={(v) => set('sector', v)} error={errors.sector} />
          <Field label="Vergi dairesi" value={form.taxOffice} onChangeText={(v) => set('taxOffice', v)} error={errors.taxOffice} />
          <Field label="Vergi no" value={form.taxNumber} onChangeText={(v) => set('taxNumber', v)} error={errors.taxNumber} />
          <Field
            label="Telefon"
            value={form.primaryPhone}
            onChangeText={(v) => set('primaryPhone', v)}
            keyboardType="phone-pad"
            error={errors.primaryPhone}
          />
          <Field
            label="E-posta"
            value={form.primaryEmail}
            onChangeText={(v) => set('primaryEmail', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.primaryEmail}
          />
          <Field
            label="Web sitesi"
            value={form.website}
            onChangeText={(v) => set('website', v)}
            keyboardType="url"
            autoCapitalize="none"
            error={errors.website}
          />
          <Field
            label="Not"
            value={form.notes}
            onChangeText={(v) => set('notes', v)}
            multiline
            numberOfLines={4}
            className="min-h-[96px] rounded-control border border-border bg-card px-3.5 py-3 text-base text-foreground"
            error={errors.notes}
          />
          <Text className="font-inter text-xs text-muted-foreground">
            Yalnızca değiştirdiğin alanlar sunucuya gönderilir; başka kullanıcının aynı anda yaptığı değişiklikler ezilmez.
          </Text>
        </ScrollView>

        {/* §6.1: onay başparmak bölgesinde, alt kenarda sabit. */}
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1">
            <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} />
          </View>
          <View className="flex-[2]">
            <Button label="Kaydet" loading={update.isPending} onPress={submit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
