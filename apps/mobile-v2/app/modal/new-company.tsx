import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useRouter } from 'expo-router';
import { companyCreateSchema, type CompanyCreateInput } from '@haksan/shared';
import { useCreateCompany } from '@/src/api/companies.hooks';
import { Button, Field } from '@/src/ui';
import { useCan } from '@/src/auth/AuthProvider';

type FormState = {
  legalTitle: string;
  shortName: string;
  sector: string;
  primaryPhone: string;
  primaryEmail: string;
  website: string;
  notes: string;
};

const EMPTY: FormState = {
  legalTitle: '',
  shortName: '',
  sector: '',
  primaryPhone: '',
  primaryEmail: '',
  website: '',
  notes: '',
};

/** Boş metin alanları şemaya `undefined` gitmeli; '' bazı alanlarda geçersiz. */
const blank = (v: string): string | undefined => (v.trim() === '' ? undefined : v.trim());

export default function NewCompanyScreen() {
  const router = useRouter();
  const canCreate = useCan('companies.create');
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const create = useCreateCompany(() => {
    Alert.alert('Müşteri oluşturuldu');
    router.back();
  });

  if (!canCreate) return <Redirect href="/(tabs)/modules/companies" />;

  const set = <K extends keyof FormState>(key: K, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Düzeltilen alanın hatası anında kalksın.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  function submit() {
    const candidate = {
      legalTitle: form.legalTitle.trim(),
      shortName: blank(form.shortName),
      sector: blank(form.sector),
      primaryPhone: blank(form.primaryPhone),
      primaryEmail: blank(form.primaryEmail),
      website: blank(form.website),
      notes: blank(form.notes),
    };

    // Sunucudaki ile birebir aynı şema — istemci doğrulaması sadece UX içindir,
    // API aynı şemayı ZodValidationPipe ile yeniden uygular.
    const parsed = companyCreateSchema.safeParse(candidate);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors(
        Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v?.[0]])) as Partial<
          Record<keyof FormState, string>
        >
      );
      return;
    }
    setErrors({});
    create.mutate(parsed.data as CompanyCreateInput, {
      onError: (error) => Alert.alert('Müşteri oluşturulamadı', error.message),
    });
  }

  return (
    // §2.3: tam ekran modalda dört kenar da güvenli alana saygı duymalı.
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni müşteri', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <Field
            label="Ünvan *"
            value={form.legalTitle}
            onChangeText={(v) => set('legalTitle', v)}
            error={errors.legalTitle}
            autoFocus
          />
          <Field label="Kısa ad" value={form.shortName} onChangeText={(v) => set('shortName', v)} error={errors.shortName} />
          <Field label="Sektör" value={form.sector} onChangeText={(v) => set('sector', v)} error={errors.sector} />
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
            Yeni firma kaydı çevrimiçi bağlantı gerektirir. Böylece aynı kaydın iki kez oluşması engellenir.
          </Text>
        </ScrollView>

        {/* §6.1: onay başparmak bölgesinde, alt kenarda sabit. */}
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1">
            <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} />
          </View>
          <View className="flex-[2]">
            <Button label="Kaydet" loading={create.isPending} onPress={submit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
