import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Switch, Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  contactCreateSchema,
  contactUpdateSchema,
  type ContactCreateInput,
  type ContactUpdateInput,
} from '@haksan/shared';
import {
  useContact,
  useContactSummary,
  useCreateContact,
  useLookup,
  useUpdateContact,
} from '@/src/api/crm.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { DateTextField } from '@/src/ui/select/DateTextField';
import { CompanySelect, companyLabel } from '@/src/ui/select/fields';
import { SearchSelect } from '@/src/ui/select/SearchSelect';
import { Button, Card, ErrorState, Eyebrow, Field, FilterChips, Loading } from '@/src/ui';

type FormState = {
  companyId: string;
  externalContactNo: string;
  fullName: string;
  title: string;
  department: string;
  decisionRoleCode: string;
  workPhone: string;
  phoneExtension: string;
  mobilePhone: string;
  otherPhone: string;
  workEmail: string;
  personalEmail: string;
  otherEmail: string;
  gender: string;
  birthDate: string;
  hometown: string;
  favoriteTeam: string;
  favoriteColor: string;
  graduatedSchool: string;
  notes: string;
  isBlacklisted: boolean;
  blacklistReason: string;
  isPrimary: boolean;
};

const EMPTY_FORM: FormState = {
  companyId: '',
  externalContactNo: '',
  fullName: '',
  title: '',
  department: '',
  decisionRoleCode: '',
  workPhone: '',
  phoneExtension: '',
  mobilePhone: '',
  otherPhone: '',
  workEmail: '',
  personalEmail: '',
  otherEmail: '',
  gender: '',
  birthDate: '',
  hometown: '',
  favoriteTeam: '',
  favoriteColor: '',
  graduatedSchool: '',
  notes: '',
  isBlacklisted: false,
  blacklistReason: '',
  isPrimary: false,
};

/** Web CreateContactDialog — Türkçe değerler API’ye aynen gider. */
const GENDERS = [
  { value: 'Erkek', label: 'Erkek' },
  { value: 'Kadın', label: 'Kadın' },
  { value: 'Diğer', label: 'Diğer' },
] as const;

function normalizeGender(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  const lower = raw.toLocaleLowerCase('tr');
  if (lower === 'male' || lower === 'erkek') return 'Erkek';
  if (lower === 'female' || lower === 'kadın' || lower === 'kadin') return 'Kadın';
  if (lower === 'other' || lower === 'diğer' || lower === 'diger') return 'Diğer';
  return raw;
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function displayDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function clean(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function createCandidate(form: FormState) {
  return {
    companyId: form.companyId,
    externalContactNo: clean(form.externalContactNo),
    fullName: form.fullName.trim(),
    title: clean(form.title),
    department: clean(form.department),
    decisionRoleCode: clean(form.decisionRoleCode),
    workPhone: clean(form.workPhone),
    phoneExtension: clean(form.phoneExtension),
    mobilePhone: clean(form.mobilePhone),
    otherPhone: clean(form.otherPhone),
    workEmail: clean(form.workEmail),
    personalEmail: clean(form.personalEmail),
    otherEmail: clean(form.otherEmail),
    gender: clean(form.gender),
    birthDate: clean(form.birthDate),
    hometown: clean(form.hometown),
    favoriteTeam: clean(form.favoriteTeam),
    favoriteColor: clean(form.favoriteColor),
    graduatedSchool: clean(form.graduatedSchool),
    notes: clean(form.notes),
    isBlacklisted: form.isBlacklisted,
    blacklistReason: clean(form.blacklistReason),
    isPrimary: form.isPrimary,
  };
}

function changedCandidate(form: FormState, initial: FormState): Record<string, unknown> {
  const current = createCandidate(form) as Record<keyof FormState, unknown>;
  const before = createCandidate(initial) as Record<keyof FormState, unknown>;
  return Object.fromEntries(
    (Object.keys(current) as (keyof FormState)[])
      .filter((key) => form[key] !== initial[key])
      .map((key) => {
        const value = current[key];
        if (value !== undefined) return [key, value];
        // Temizlenen opsiyonel alanlar: Zod clearable* boşu null’a çevirir.
        if (typeof before[key] === 'boolean') return [key, false];
        return [key, null];
      })
  );
}

export function ContactFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; companyId?: string | string[]; companyName?: string | string[] }>();
  const id = first(params.id);
  const requestedCompanyId = first(params.companyId);
  const requestedCompanyName = first(params.companyName);
  const editing = Boolean(id);
  const allowed = useCan(editing ? 'contacts.update' : 'contacts.create');
  const { colors } = useTheme();
  const detail = useContact(id);
  const decisionRoles = useLookup('decision-roles');
  const contactSummary = useContactSummary();
  const departmentOptions = useMemo(
    () => (contactSummary.data?.departments ?? []).map((name) => ({ id: name, label: name })),
    [contactSummary.data]
  );
  const create = useCreateContact();
  const update = useUpdateContact();
  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    companyId: requestedCompanyId,
  });
  const initialRef = useRef<FormState | null>(editing ? null : { ...EMPTY_FORM, companyId: requestedCompanyId });
  const initializedId = useRef<string | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState(requestedCompanyName);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing || !detail.data || initializedId.current === detail.data.id) return;
    // Karar rolü lookup’ı gecikse/hata verse bile formu aç; kod sonra dolar.
    const roleCode =
      decisionRoles.data?.find((item) => item.id === detail.data?.decisionRoleId)?.code ?? '';
    const next: FormState = {
      companyId: detail.data.companyId ?? detail.data.companyLinks.find((item) => item.isPrimary)?.id ?? '',
      externalContactNo: detail.data.externalContactNo ?? '',
      fullName: detail.data.fullName,
      title: detail.data.title ?? '',
      department: detail.data.department ?? '',
      decisionRoleCode: roleCode,
      workPhone: detail.data.workPhone ?? '',
      phoneExtension: detail.data.phoneExtension ?? '',
      mobilePhone: detail.data.mobilePhone ?? '',
      otherPhone: detail.data.otherPhone ?? '',
      workEmail: detail.data.workEmail ?? '',
      personalEmail: detail.data.personalEmail ?? '',
      otherEmail: detail.data.otherEmail ?? '',
      gender: normalizeGender(detail.data.gender),
      birthDate: displayDate(detail.data.birthDate),
      hometown: detail.data.hometown ?? '',
      favoriteTeam: detail.data.favoriteTeam ?? '',
      favoriteColor: detail.data.favoriteColor ?? '',
      graduatedSchool: detail.data.graduatedSchool ?? '',
      notes: detail.data.notes ?? '',
      isBlacklisted: detail.data.isBlacklisted,
      blacklistReason: detail.data.blacklistReason ?? '',
      isPrimary: detail.data.isPrimary,
    };
    setForm(next);
    initialRef.current = next;
    setSelectedCompanyName(
      detail.data.company?.shortName ??
        detail.data.company?.legalTitle ??
        detail.data.companyLinks.find((item) => item.isPrimary)?.legalTitle ??
        ''
    );
    initializedId.current = detail.data.id;
  }, [decisionRoles.data, detail.data, editing]);

  // İlk hydrate lookup’sız olduysa rol kodunu sonradan yaz (kullanıcı dokunmadıysa).
  useEffect(() => {
    if (!editing || !detail.data?.decisionRoleId || !decisionRoles.data) return;
    const roleCode = decisionRoles.data.find((item) => item.id === detail.data?.decisionRoleId)?.code ?? '';
    if (!roleCode) return;
    setForm((prev) => (prev.decisionRoleCode ? prev : { ...prev, decisionRoleCode: roleCode }));
    if (initialRef.current && !initialRef.current.decisionRoleCode) {
      initialRef.current = { ...initialRef.current, decisionRoleCode: roleCode };
    }
  }, [decisionRoles.data, detail.data?.decisionRoleId, editing]);

  if (!allowed) return <Redirect href="/(tabs)/modules/contacts" />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));
    setFormError(null);
  };

  function showValidationErrors(fieldErrors: Record<string, string[] | undefined>) {
    setErrors(
      Object.fromEntries(Object.entries(fieldErrors).map(([key, messages]) => [key, messages?.[0]])) as Partial<
        Record<keyof FormState, string>
      >
    );
    setFormError('Zorunlu veya biçimi hatalı alanları kontrol edin.');
  }

  function submit() {
    setFormError(null);
    if (editing) {
      const initial = initialRef.current;
      if (!initial) return;
      const patch = changedCandidate(form, initial);
      if (Object.keys(patch).length === 0) {
        router.back();
        return;
      }
      const parsed = contactUpdateSchema.safeParse(patch);
      if (!parsed.success) {
        showValidationErrors(parsed.error.flatten().fieldErrors);
        return;
      }
      update.mutate(
        { id, patch: parsed.data as ContactUpdateInput },
        {
          onSuccess: () => {
            Alert.alert('Kontak güncellendi');
            router.back();
          },
          onError: (error) => setFormError(error.message),
        }
      );
      return;
    }

    const parsed = contactCreateSchema.safeParse(createCandidate(form));
    if (!parsed.success) {
      showValidationErrors(parsed.error.flatten().fieldErrors);
      return;
    }
    create.mutate(parsed.data as ContactCreateInput, {
      onSuccess: (created) => {
        Alert.alert('Kontak oluşturuldu');
        router.replace(`/(tabs)/modules/contacts/${created.id}`);
      },
      onError: (error) => setFormError(error.message),
    });
  }

  if (editing && detail.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Kontak Düzenle', headerShown: true }} />
        <Loading />
      </SafeAreaView>
    );
  }
  if (editing && (detail.error || !detail.data)) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Kontak Düzenle', headerShown: true }} />
        <ErrorState message={detail.error?.message ?? 'Kontak yüklenemedi.'} onRetry={() => void detail.refetch()} />
      </SafeAreaView>
    );
  }

  const saving = create.isPending || update.isPending;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: editing ? 'Kontak Düzenle' : 'Yeni Kontak', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName="gap-5 p-4 pb-10"
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="font-inter text-[13px] leading-[18px] text-muted-foreground">
            Firmaya bağlı kişi kaydı oluşturun.
          </Text>

          <View className="gap-3">
            <Eyebrow>Firma ve kimlik</Eyebrow>
            <CompanySelect
              label="Firma *"
              value={selectedCompanyName}
              selectedId={form.companyId || null}
              clearable={!editing}
              placeholder="Firma seçin veya adını yazın..."
              searchPlaceholder="Firma adı / şehir ara..."
              error={errors.companyId}
              onSelect={(item) => {
                const company = item?.data;
                if (!item || !company) {
                  set('companyId', '');
                  setSelectedCompanyName('');
                  return;
                }
                set('companyId', company.id);
                setSelectedCompanyName(companyLabel(company));
              }}
            />
            <Field label="Adı Soyadı *" value={form.fullName} onChangeText={(value) => set('fullName', value)} maxLength={255} error={errors.fullName} autoFocus={!editing} />
            <Field label="Ünvan" value={form.title} onChangeText={(value) => set('title', value)} maxLength={128} error={errors.title} />
            <SearchSelect
              label="Departman"
              placeholder="Departman seçin veya yazın"
              icon="people-outline"
              value={form.department}
              onSelect={(item) => set('department', item?.label ?? '')}
              options={departmentOptions}
              optionsLoading={contactSummary.isPending}
              allowCustom
              clearable
              searchPlaceholder="Departman ara"
              emptyTitle="Kayıtlı departman yok"
              error={errors.department}
            />
            {decisionRoles.data?.length ? (
              <View className="gap-1.5">
                <Text className="font-inter-medium text-[13px] text-muted-foreground">Karar Yetkisi</Text>
                <FilterChips
                  options={decisionRoles.data.map((item) => ({ value: item.code, label: item.name }))}
                  value={form.decisionRoleCode || null}
                  onChange={(value) => set('decisionRoleCode', value ?? '')}
                  allLabel="Belirtilmedi"
                />
              </View>
            ) : null}
          </View>

          <View className="gap-3">
            <Eyebrow>İletişim</Eyebrow>
            <Field label="İş Telefonu" value={form.workPhone} onChangeText={(value) => set('workPhone', value)} keyboardType="phone-pad" maxLength={32} error={errors.workPhone} placeholder="+90 ..." />
            <Field label="Dahili Numarası" value={form.phoneExtension} onChangeText={(value) => set('phoneExtension', value)} keyboardType="number-pad" maxLength={16} error={errors.phoneExtension} placeholder="Örn: 112" />
            <Field label="Cep Telefonu" value={form.mobilePhone} onChangeText={(value) => set('mobilePhone', value)} keyboardType="phone-pad" maxLength={32} error={errors.mobilePhone} placeholder="+90 ..." />
            <Field label="Diğer Telefon" value={form.otherPhone} onChangeText={(value) => set('otherPhone', value)} keyboardType="phone-pad" maxLength={32} error={errors.otherPhone} placeholder="+90 ..." />
            <Field label="İş E-posta" value={form.workEmail} onChangeText={(value) => set('workEmail', value)} keyboardType="email-address" autoCapitalize="none" maxLength={255} error={errors.workEmail} />
            <Field label="Kişisel E-posta" value={form.personalEmail} onChangeText={(value) => set('personalEmail', value)} keyboardType="email-address" autoCapitalize="none" maxLength={255} error={errors.personalEmail} />
            <Field label="Diğer E-posta" value={form.otherEmail} onChangeText={(value) => set('otherEmail', value)} keyboardType="email-address" autoCapitalize="none" maxLength={255} error={errors.otherEmail} />
          </View>

          <View className="gap-3">
            <Eyebrow>Kişisel bilgiler</Eyebrow>
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Cinsiyet</Text>
              <FilterChips options={[...GENDERS]} value={form.gender || null} onChange={(value) => set('gender', value ?? '')} allLabel="Belirtilmedi" />
            </View>
            <DateTextField label="Doğum Tarihi" value={form.birthDate} onChangeText={(value) => set('birthDate', value)} error={errors.birthDate} />
            <Field label="Tuttuğu Takım" value={form.favoriteTeam} onChangeText={(value) => set('favoriteTeam', value)} maxLength={64} error={errors.favoriteTeam} />
            <Field label="Memleketi" value={form.hometown} onChangeText={(value) => set('hometown', value)} maxLength={64} error={errors.hometown} />
            <Field label="Sevdiği Renk" value={form.favoriteColor} onChangeText={(value) => set('favoriteColor', value)} maxLength={32} error={errors.favoriteColor} />
            <Field label="Mezun Olduğu Okul" value={form.graduatedSchool} onChangeText={(value) => set('graduatedSchool', value)} maxLength={128} error={errors.graduatedSchool} />
            <Field label="Not" value={form.notes} onChangeText={(value) => set('notes', value)} multiline maxLength={4000} error={errors.notes} className="min-h-24 rounded-control border border-border bg-input-background px-3 py-2 font-inter text-base text-foreground" />
            <Card className="gap-3">
              <View className="min-h-11 flex-row items-center justify-between gap-4">
                <Text className="flex-1 font-inter-medium text-sm text-foreground">Birincil kontak</Text>
                <Switch accessibilityLabel="Birincil kontak" value={form.isPrimary} onValueChange={(value) => set('isPrimary', value)} trackColor={{ false: colors.muted, true: colors.primary }} />
              </View>
              <View className="min-h-11 flex-row items-center justify-between gap-4">
                <Text className="flex-1 font-inter-medium text-sm text-destructive">Kara listeye al</Text>
                <Switch accessibilityLabel="Kara listeye al" value={form.isBlacklisted} onValueChange={(value) => set('isBlacklisted', value)} trackColor={{ false: colors.muted, true: colors.destructive }} />
              </View>
            </Card>
            {form.isBlacklisted ? (
              <Field label="Kara Liste Sebebi" value={form.blacklistReason} onChangeText={(value) => set('blacklistReason', value)} multiline maxLength={2000} error={errors.blacklistReason} placeholder="Neden kara listeye alındığını yazın" className="min-h-20 rounded-control border border-border bg-input-background px-3 py-2 font-inter text-base text-foreground" />
            ) : null}
          </View>

          {formError ? <Text selectable accessibilityLiveRegion="assertive" className="font-inter text-sm text-destructive">{formError}</Text> : null}
        </ScrollView>

        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label={editing ? 'Değişiklikleri Kaydet' : 'Kontak Oluştur'} loading={saving} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
