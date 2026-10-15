import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import {
  contactCreateSchema,
  contactUpdateSchema,
  type ContactCreateInput,
  type ContactUpdateInput,
} from '@haksan/shared';
import { useCompanyList } from '@/src/api/companies.hooks';
import {
  useContact,
  useCreateContact,
  useLookup,
  useUpdateContact,
} from '@/src/api/crm.hooks';
import type { CompanyListItem } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, EmptyState, ErrorState, Eyebrow, Field, FilterChips, Loading, SearchBar } from '@/src/ui';

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

const GENDERS = [
  { value: 'male', label: 'Erkek' },
  { value: 'female', label: 'Kadın' },
] as const;

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
      .map((key) => [key, current[key] ?? (typeof before[key] === 'boolean' ? false : '')])
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
  const create = useCreateContact();
  const update = useUpdateContact();
  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    companyId: requestedCompanyId,
  });
  const initialRef = useRef<FormState | null>(editing ? null : { ...EMPTY_FORM, companyId: requestedCompanyId });
  const initializedId = useRef<string | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState(requestedCompanyName);
  const [companySearch, setCompanySearch] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const companySheetRef = useRef<BottomSheetModal>(null);

  const companyQuery = useMemo(
    () => ({ search: companySearch.trim() || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }),
    [companySearch]
  );
  const companyList = useCompanyList(companyQuery);
  const companies = companyList.data?.items ?? [];

  useEffect(() => {
    if (!editing || !detail.data || initializedId.current === detail.data.id) return;
    if (detail.data.decisionRoleId && !decisionRoles.data) return;
    const next: FormState = {
      companyId: detail.data.companyId ?? detail.data.companyLinks.find((item) => item.isPrimary)?.id ?? '',
      externalContactNo: detail.data.externalContactNo ?? '',
      fullName: detail.data.fullName,
      title: detail.data.title ?? '',
      department: detail.data.department ?? '',
      decisionRoleCode: decisionRoles.data?.find((item) => item.id === detail.data?.decisionRoleId)?.code ?? '',
      workPhone: detail.data.workPhone ?? '',
      phoneExtension: detail.data.phoneExtension ?? '',
      mobilePhone: detail.data.mobilePhone ?? '',
      otherPhone: detail.data.otherPhone ?? '',
      workEmail: detail.data.workEmail ?? '',
      personalEmail: detail.data.personalEmail ?? '',
      otherEmail: detail.data.otherEmail ?? '',
      gender: detail.data.gender ?? '',
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

  function chooseCompany(company: CompanyListItem) {
    set('companyId', company.id);
    setSelectedCompanyName(company.shortName ?? company.legalTitle);
    companySheetRef.current?.dismiss();
  }

  if (editing && (detail.isPending || (detail.data?.decisionRoleId && decisionRoles.isPending))) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Kontağı düzenle', headerShown: true }} />
        <Loading />
      </SafeAreaView>
    );
  }
  if (editing && (detail.error || !detail.data)) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Kontağı düzenle', headerShown: true }} />
        <ErrorState message={detail.error?.message ?? 'Kontak yüklenemedi.'} onRetry={() => void detail.refetch()} />
      </SafeAreaView>
    );
  }

  const saving = create.isPending || update.isPending;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: editing ? 'Kontağı düzenle' : 'Yeni kontak', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName="gap-5 p-4 pb-10"
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-3">
            <Eyebrow>Firma ve kimlik</Eyebrow>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Firma seç"
              onPress={() => companySheetRef.current?.present()}
              className={`min-h-11 flex-row items-center gap-3 rounded-control border bg-card px-3 py-2 ${errors.companyId ? 'border-destructive' : 'border-border'}`}
            >
              <Ionicons name="business-outline" size={19} color={colors.primary} />
              <View className="flex-1 gap-0.5">
                <Text className="font-inter-medium text-xs text-muted-foreground">Firma *</Text>
                <Text className="font-inter text-base text-foreground" numberOfLines={1}>
                  {selectedCompanyName || 'Firma seçin'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </Pressable>
            {errors.companyId ? <Text className="font-inter text-xs text-destructive">{errors.companyId}</Text> : null}
            <Field label="Ad soyad *" value={form.fullName} onChangeText={(value) => set('fullName', value)} maxLength={255} error={errors.fullName} autoFocus={!editing} />
            <Field label="Harici kontak no" value={form.externalContactNo} onChangeText={(value) => set('externalContactNo', value)} maxLength={32} error={errors.externalContactNo} />
            <Field label="Unvan" value={form.title} onChangeText={(value) => set('title', value)} maxLength={128} error={errors.title} />
            <Field label="Departman" value={form.department} onChangeText={(value) => set('department', value)} maxLength={128} error={errors.department} />
            {decisionRoles.data?.length ? (
              <View className="gap-1.5">
                <Text className="font-inter-medium text-[13px] text-muted-foreground">Karar rolü</Text>
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
            <Field label="Cep telefonu" value={form.mobilePhone} onChangeText={(value) => set('mobilePhone', value)} keyboardType="phone-pad" maxLength={32} error={errors.mobilePhone} />
            <Field label="İş telefonu" value={form.workPhone} onChangeText={(value) => set('workPhone', value)} keyboardType="phone-pad" maxLength={32} error={errors.workPhone} />
            <Field label="Dahili" value={form.phoneExtension} onChangeText={(value) => set('phoneExtension', value)} keyboardType="number-pad" maxLength={16} error={errors.phoneExtension} />
            <Field label="Diğer telefon" value={form.otherPhone} onChangeText={(value) => set('otherPhone', value)} keyboardType="phone-pad" maxLength={32} error={errors.otherPhone} />
            <Field label="İş e-postası" value={form.workEmail} onChangeText={(value) => set('workEmail', value)} keyboardType="email-address" autoCapitalize="none" maxLength={255} error={errors.workEmail} />
            <Field label="Kişisel e-posta" value={form.personalEmail} onChangeText={(value) => set('personalEmail', value)} keyboardType="email-address" autoCapitalize="none" maxLength={255} error={errors.personalEmail} />
            <Field label="Diğer e-posta" value={form.otherEmail} onChangeText={(value) => set('otherEmail', value)} keyboardType="email-address" autoCapitalize="none" maxLength={255} error={errors.otherEmail} />
          </View>

          <View className="gap-3">
            <Eyebrow>Kişisel bilgiler</Eyebrow>
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Cinsiyet</Text>
              <FilterChips options={[...GENDERS]} value={form.gender || null} onChange={(value) => set('gender', value ?? '')} allLabel="Belirtilmedi" />
            </View>
            <Field label="Doğum tarihi" value={form.birthDate} onChangeText={(value) => set('birthDate', value)} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} error={errors.birthDate} />
            <Field label="Memleket" value={form.hometown} onChangeText={(value) => set('hometown', value)} maxLength={64} error={errors.hometown} />
            <Field label="Mezun olduğu okul" value={form.graduatedSchool} onChangeText={(value) => set('graduatedSchool', value)} maxLength={128} error={errors.graduatedSchool} />
            <Field label="Sevdiği takım" value={form.favoriteTeam} onChangeText={(value) => set('favoriteTeam', value)} maxLength={64} error={errors.favoriteTeam} />
            <Field label="Sevdiği renk" value={form.favoriteColor} onChangeText={(value) => set('favoriteColor', value)} maxLength={32} error={errors.favoriteColor} />
          </View>

          <View className="gap-3">
            <Eyebrow>Durum ve notlar</Eyebrow>
            <Card className="gap-3">
              <View className="min-h-11 flex-row items-center justify-between gap-4">
                <Text className="flex-1 font-inter-medium text-sm text-foreground">Birincil kontak</Text>
                <Switch accessibilityLabel="Birincil kontak" value={form.isPrimary} onValueChange={(value) => set('isPrimary', value)} trackColor={{ false: colors.muted, true: colors.primary }} />
              </View>
              <View className="min-h-11 flex-row items-center justify-between gap-4">
                <Text className="flex-1 font-inter-medium text-sm text-foreground">Kara liste</Text>
                <Switch accessibilityLabel="Kara liste" value={form.isBlacklisted} onValueChange={(value) => set('isBlacklisted', value)} trackColor={{ false: colors.muted, true: colors.destructive }} />
              </View>
            </Card>
            {form.isBlacklisted ? (
              <Field label="Kara liste gerekçesi" value={form.blacklistReason} onChangeText={(value) => set('blacklistReason', value)} multiline maxLength={2000} error={errors.blacklistReason} className="min-h-20 rounded-control border border-border bg-input-background px-3 py-2 font-inter text-base text-foreground" />
            ) : null}
            <Field label="Notlar" value={form.notes} onChangeText={(value) => set('notes', value)} multiline maxLength={4000} error={errors.notes} className="min-h-24 rounded-control border border-border bg-input-background px-3 py-2 font-inter text-base text-foreground" />
          </View>

          <Text className="font-inter text-xs text-muted-foreground">Kontak kaydı çevrimiçi bağlantı gerektirir; sunucu firma görünürlüğünü ve tüm alanları yeniden doğrular.</Text>
          {formError ? <Text selectable accessibilityLiveRegion="assertive" className="font-inter text-sm text-destructive">{formError}</Text> : null}
        </ScrollView>

        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label={editing ? 'Değişiklikleri Kaydet' : 'Kontağı Oluştur'} loading={saving} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>

      <BottomSheetModal
        ref={companySheetRef}
        snapPoints={['80%']}
        enableDynamicSizing={false}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView className="gap-3 px-4 pb-2">
          <Text className="font-inter-semibold text-base text-foreground">Firma seçin</Text>
          <SearchBar value={companySearch} onChange={setCompanySearch} placeholder="Firma ara" />
        </BottomSheetView>
        <BottomSheetFlatList
          data={companies}
          keyExtractor={(item: CompanyListItem) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }: { item: CompanyListItem }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: item.id === form.companyId }}
              onPress={() => chooseCompany(item)}
              className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
            >
              <Ionicons name="business-outline" size={19} color={item.id === form.companyId ? colors.primary : colors.mutedForeground} />
              <View className="flex-1">
                <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.shortName ?? item.legalTitle}</Text>
                {item.shortName ? <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{item.legalTitle}</Text> : null}
              </View>
              {item.id === form.companyId ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
            </Pressable>
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (companyList.hasNextPage && !companyList.isFetchingNextPage) void companyList.fetchNextPage();
          }}
          ListEmptyComponent={companyList.isPending ? <Loading /> : companyList.error ? <ErrorState message={companyList.error.message} onRetry={() => void companyList.refetch()} /> : <EmptyState title="Firma bulunamadı" />}
          ListFooterComponent={companyList.isFetchingNextPage ? <Loading /> : null}
        />
      </BottomSheetModal>
    </SafeAreaView>
  );
}
