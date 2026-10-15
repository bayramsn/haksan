import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import {
  activityCreateSchema,
  activityUpdateSchema,
  type ActivityCreateInput,
  type ActivityUpdateInput,
} from '@haksan/shared';
import { useCompanyList } from '@/src/api/companies.hooks';
import {
  useActivity,
  useContactList,
  useCreateActivity,
  useLookup,
  useOpportunityList,
  useUpdateActivity,
} from '@/src/api/crm.hooks';
import type { CompanyListItem, ContactListItem, OpportunityListItem } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { formatLocalDateTime, parseLocalDateTime } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Eyebrow, Field, FilterChips, Loading, SearchBar } from '@/src/ui';

type FormState = {
  companyId: string;
  opportunityId: string;
  contactId: string;
  activityTypeCode: string;
  subject: string;
  description: string;
  activityDate: string;
  nextFollowUpAt: string;
  result: string;
};

const EMPTY_FORM: FormState = {
  companyId: '',
  opportunityId: '',
  contactId: '',
  activityTypeCode: 'note',
  subject: '',
  description: '',
  activityDate: formatLocalDateTime(new Date()),
  nextFollowUpAt: '',
  result: '',
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function clean(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function SelectorField({
  label,
  value,
  placeholder,
  icon,
  error,
  disabled,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        className={`min-h-12 flex-row items-center gap-3 rounded-control border bg-card px-3 py-2 ${error ? 'border-destructive' : 'border-border'} ${disabled ? 'opacity-50' : 'active:opacity-70'}`}
      >
        <Ionicons name={icon} size={19} color={colors.primary} />
        <View className="flex-1 gap-0.5">
          <Text className="font-inter-medium text-xs text-muted-foreground">{label}</Text>
          <Text className="font-inter text-base text-foreground" numberOfLines={1}>{value || placeholder}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
      </Pressable>
      {error ? <Text className="font-inter text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}

export function ActivityFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string | string[];
    companyId?: string | string[];
    companyName?: string | string[];
    opportunityId?: string | string[];
    opportunityTitle?: string | string[];
    contactId?: string | string[];
    contactName?: string | string[];
  }>();
  const id = first(params.id);
  const editing = Boolean(id);
  const allowed = useCan(editing ? 'activities.update' : 'activities.create');
  const { colors } = useTheme();
  const requestedCompanyId = first(params.companyId);
  const requestedOpportunityId = first(params.opportunityId);
  const requestedContactId = first(params.contactId);
  const detail = useActivity(id);
  const types = useLookup('activity-types');
  const create = useCreateActivity();
  const update = useUpdateActivity();
  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    companyId: requestedCompanyId,
    opportunityId: requestedOpportunityId,
    contactId: requestedContactId,
  });
  const [names, setNames] = useState({
    company: first(params.companyName),
    opportunity: first(params.opportunityTitle),
    contact: first(params.contactName),
  });
  const initialRef = useRef<FormState | null>(editing ? null : { ...EMPTY_FORM, companyId: requestedCompanyId, opportunityId: requestedOpportunityId, contactId: requestedContactId });
  const initializedId = useRef<string | null>(null);
  const [companySearch, setCompanySearch] = useState('');
  const [opportunitySearch, setOpportunitySearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const companySheet = useRef<BottomSheetModal>(null);
  const opportunitySheet = useRef<BottomSheetModal>(null);
  const contactSheet = useRef<BottomSheetModal>(null);

  const companyList = useCompanyList(useMemo(() => ({
    search: clean(companySearch),
    sortBy: 'name' as const,
    sortDir: 'asc' as const,
  }), [companySearch]));
  const opportunityList = useOpportunityList(useMemo(() => ({
    companyId: form.companyId || undefined,
    search: clean(opportunitySearch),
    view: 'all' as const,
  }), [form.companyId, opportunitySearch]), Boolean(form.companyId));
  const contactList = useContactList(useMemo(() => ({
    companyId: form.companyId || undefined,
    search: clean(contactSearch),
    sortBy: 'name' as const,
    sortDir: 'asc' as const,
  }), [contactSearch, form.companyId]), Boolean(form.companyId));

  useEffect(() => {
    if (!editing || !detail.data || initializedId.current === detail.data.id) return;
    const next: FormState = {
      companyId: detail.data.companyId ?? '',
      opportunityId: detail.data.opportunityId ?? '',
      contactId: detail.data.contactId ?? '',
      activityTypeCode: detail.data.type?.code ?? 'note',
      subject: detail.data.subject,
      description: detail.data.description ?? '',
      activityDate: formatLocalDateTime(detail.data.activityDate),
      nextFollowUpAt: detail.data.nextFollowUpAt ? formatLocalDateTime(detail.data.nextFollowUpAt) : '',
      result: detail.data.result ?? '',
    };
    setForm(next);
    initialRef.current = next;
    initializedId.current = detail.data.id;
  }, [detail.data, editing]);

  useEffect(() => {
    if (!editing || !detail.data) return;
    const selectedCompany = companyList.data?.items.find((item) => item.id === detail.data?.companyId);
    const selectedOpportunity = opportunityList.data?.items.find((item) => item.id === detail.data?.opportunityId);
    const selectedContact = contactList.data?.items.find((item) => item.id === detail.data?.contactId);
    setNames((previous) => ({
      company: selectedCompany ? selectedCompany.shortName ?? selectedCompany.legalTitle : previous.company,
      opportunity: selectedOpportunity?.title ?? previous.opportunity,
      contact: selectedContact?.fullName ?? previous.contact,
    }));
  }, [companyList.data?.items, contactList.data?.items, detail.data, editing, opportunityList.data?.items]);

  if (!allowed) return <Redirect href="/(tabs)/modules/activities" />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => previous[key] ? { ...previous, [key]: undefined } : previous);
    setFormError(null);
  };

  const chooseCompany = (company: CompanyListItem) => {
    setForm((previous) => ({ ...previous, companyId: company.id, opportunityId: '', contactId: '' }));
    setNames({ company: company.shortName ?? company.legalTitle, opportunity: '', contact: '' });
    setErrors((previous) => ({ ...previous, companyId: undefined }));
    companySheet.current?.dismiss();
  };

  const chooseOpportunity = (opportunity: OpportunityListItem | null) => {
    set('opportunityId', opportunity?.id ?? '');
    setNames((previous) => ({ ...previous, opportunity: opportunity?.title ?? '' }));
    opportunitySheet.current?.dismiss();
  };

  const chooseContact = (contact: ContactListItem | null) => {
    set('contactId', contact?.id ?? '');
    setNames((previous) => ({ ...previous, contact: contact?.fullName ?? '' }));
    contactSheet.current?.dismiss();
  };

  function submit() {
    setFormError(null);
    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    const activityDate = parseLocalDateTime(form.activityDate);
    const nextFollowUpAt = form.nextFollowUpAt.trim() ? parseLocalDateTime(form.nextFollowUpAt) : undefined;
    if (!form.companyId && !form.opportunityId) nextErrors.companyId = 'Firma veya satış kartı seçin.';
    if (!form.activityTypeCode) nextErrors.activityTypeCode = 'Aktivite türü seçin.';
    if (!activityDate) nextErrors.activityDate = 'Tarih ve saati YYYY-AA-GG SS:DD biçiminde girin.';
    if (form.nextFollowUpAt.trim() && !nextFollowUpAt) nextErrors.nextFollowUpAt = 'Takip tarihini YYYY-AA-GG SS:DD biçiminde girin.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setFormError('Zorunlu veya biçimi hatalı alanları kontrol edin.');
      return;
    }

    const candidate = {
      companyId: form.companyId || undefined,
      opportunityId: form.opportunityId || undefined,
      contactId: form.contactId || undefined,
      activityTypeCode: form.activityTypeCode,
      subject: form.subject.trim(),
      description: clean(form.description),
      activityDate: activityDate!,
      nextFollowUpAt,
      result: clean(form.result),
    };

    if (!editing) {
      const parsed = activityCreateSchema.safeParse(candidate);
      if (!parsed.success) {
        const fields = parsed.error.flatten().fieldErrors;
        setErrors(Object.fromEntries(Object.entries(fields).map(([key, messages]) => [key, messages?.[0]])) as Partial<Record<keyof FormState, string>>);
        setFormError('Zorunlu veya biçimi hatalı alanları kontrol edin.');
        return;
      }
      create.mutate(parsed.data as ActivityCreateInput, {
        onSuccess: (created) => router.replace(`/(tabs)/modules/activities/${created.id}` as Href),
        onError: (error) => setFormError(error.message),
      });
      return;
    }

    const initial = initialRef.current;
    if (!initial) return;
    const patch: ActivityUpdateInput = {};
    if (form.companyId !== initial.companyId) patch.companyId = form.companyId || null;
    if (form.opportunityId !== initial.opportunityId) patch.opportunityId = form.opportunityId || null;
    if (form.contactId !== initial.contactId) patch.contactId = form.contactId || null;
    if (form.activityTypeCode !== initial.activityTypeCode) patch.activityTypeCode = form.activityTypeCode;
    if (form.subject !== initial.subject) patch.subject = form.subject.trim();
    if (form.description !== initial.description) patch.description = clean(form.description) ?? null;
    if (form.activityDate !== initial.activityDate) patch.activityDate = activityDate!;
    if (form.nextFollowUpAt !== initial.nextFollowUpAt) patch.nextFollowUpAt = nextFollowUpAt ?? null;
    if (form.result !== initial.result) patch.result = clean(form.result) ?? null;
    if (!Object.keys(patch).length) {
      router.back();
      return;
    }
    const parsed = activityUpdateSchema.safeParse(patch);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors(Object.fromEntries(Object.entries(fields).map(([key, messages]) => [key, messages?.[0]])) as Partial<Record<keyof FormState, string>>);
      setFormError('Zorunlu veya biçimi hatalı alanları kontrol edin.');
      return;
    }
    update.mutate({ id, patch: parsed.data as ActivityUpdateInput }, {
      onSuccess: () => router.replace(`/(tabs)/modules/activities/${id}` as Href),
      onError: (error) => setFormError(error.message),
    });
  }

  if (editing && detail.isPending) {
    return <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}><Stack.Screen options={{ title: 'Aktiviteyi düzenle', headerShown: true }} /><Loading /></SafeAreaView>;
  }
  if (editing && (detail.error || !detail.data)) {
    return <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}><Stack.Screen options={{ title: 'Aktiviteyi düzenle', headerShown: true }} /><ErrorState message={detail.error?.message ?? 'Aktivite yüklenemedi.'} onRetry={() => void detail.refetch()} /></SafeAreaView>;
  }

  const saving = create.isPending || update.isPending;
  const sheetProps = {
    snapPoints: ['80%'],
    enableDynamicSizing: false,
    backgroundStyle: { backgroundColor: colors.card },
    handleIndicatorStyle: { backgroundColor: colors.mutedForeground },
    backdropComponent: (props: Parameters<typeof BottomSheetBackdrop>[0]) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />,
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: editing ? 'Aktiviteyi düzenle' : 'Yeni aktivite', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="gap-3">
            <Eyebrow>Bağlantılar</Eyebrow>
            <SelectorField label="Firma *" value={names.company} placeholder="Firma seçin" icon="business-outline" error={errors.companyId} onPress={() => companySheet.current?.present()} />
            <SelectorField label="Satış kartı" value={names.opportunity} placeholder={form.companyId ? 'İsteğe bağlı' : 'Önce firma seçin'} icon="briefcase-outline" disabled={!form.companyId} onPress={() => opportunitySheet.current?.present()} />
            <SelectorField label="Kontak" value={names.contact} placeholder={form.companyId ? 'İsteğe bağlı' : 'Önce firma seçin'} icon="person-outline" disabled={!form.companyId} onPress={() => contactSheet.current?.present()} />
          </View>

          <View className="gap-3">
            <Eyebrow>Aktivite</Eyebrow>
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Tür *</Text>
              {types.isPending ? <Loading /> : types.error ? <ErrorState message={types.error.message} onRetry={() => void types.refetch()} /> : (
                <FilterChips
                  options={(types.data ?? []).map((item) => ({ value: item.code, label: item.name }))}
                  value={form.activityTypeCode || null}
                  onChange={(value) => value && set('activityTypeCode', value)}
                  allLabel=""
                />
              )}
              {errors.activityTypeCode ? <Text className="font-inter text-xs text-destructive">{errors.activityTypeCode}</Text> : null}
            </View>
            <Field label="Konu *" value={form.subject} onChangeText={(value) => set('subject', value)} maxLength={255} error={errors.subject} autoFocus={!editing} />
            <Field label="Açıklama" value={form.description} onChangeText={(value) => set('description', value)} multiline maxLength={4000} error={errors.description} className="min-h-24 rounded-control border border-border bg-input-background px-3 py-2 font-inter text-base text-foreground" />
            <Field label="Aktivite tarihi ve saati *" value={form.activityDate} onChangeText={(value) => set('activityDate', value)} placeholder="YYYY-AA-GG SS:DD" keyboardType="numbers-and-punctuation" maxLength={16} error={errors.activityDate} />
            <Field label="Sonraki takip tarihi ve saati" value={form.nextFollowUpAt} onChangeText={(value) => set('nextFollowUpAt', value)} placeholder="YYYY-AA-GG SS:DD" keyboardType="numbers-and-punctuation" maxLength={16} error={errors.nextFollowUpAt} />
            <Field label="Sonuç" value={form.result} onChangeText={(value) => set('result', value)} multiline maxLength={2000} error={errors.result} className="min-h-20 rounded-control border border-border bg-input-background px-3 py-2 font-inter text-base text-foreground" />
          </View>

          <Text className="font-inter text-xs text-muted-foreground">Aktivite kaydı çevrimiçi bağlantı gerektirir; sunucu firma, kontak, satış kartı ve bölüm erişimini yeniden doğrular.</Text>
          {formError ? <Text selectable accessibilityLiveRegion="assertive" className="font-inter text-sm text-destructive">{formError}</Text> : null}
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label={editing ? 'Değişiklikleri Kaydet' : 'Aktiviteyi Oluştur'} loading={saving} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>

      <BottomSheetModal ref={companySheet} {...sheetProps}>
        <BottomSheetView className="gap-3 px-4 pb-2"><Text className="font-inter-semibold text-base text-foreground">Firma seçin</Text><SearchBar value={companySearch} onChange={setCompanySearch} placeholder="Firma ara" /></BottomSheetView>
        <BottomSheetFlatList
          data={companyList.data?.items ?? []}
          keyExtractor={(item: CompanyListItem) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }: { item: CompanyListItem }) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: item.id === form.companyId }} onPress={() => chooseCompany(item)} className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70">
              <Ionicons name="business-outline" size={19} color={item.id === form.companyId ? colors.primary : colors.mutedForeground} />
              <View className="flex-1"><Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.shortName ?? item.legalTitle}</Text>{item.shortName ? <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{item.legalTitle}</Text> : null}</View>
              {item.id === form.companyId ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
            </Pressable>
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (companyList.hasNextPage && !companyList.isFetchingNextPage) void companyList.fetchNextPage(); }}
          ListEmptyComponent={companyList.isPending ? <Loading /> : companyList.error ? <ErrorState message={companyList.error.message} onRetry={() => void companyList.refetch()} /> : <EmptyState title="Firma bulunamadı" />}
          ListFooterComponent={companyList.isFetchingNextPage ? <Loading /> : null}
        />
      </BottomSheetModal>

      <BottomSheetModal ref={opportunitySheet} {...sheetProps}>
        <BottomSheetView className="gap-3 px-4 pb-2">
          <Text className="font-inter-semibold text-base text-foreground">Satış kartı seçin</Text>
          {form.opportunityId ? <Button label="Bağlantıyı Kaldır" variant="ghost" onPress={() => chooseOpportunity(null)} /> : null}
          <SearchBar value={opportunitySearch} onChange={setOpportunitySearch} placeholder="Satış kartı ara" />
        </BottomSheetView>
        <BottomSheetFlatList
          data={opportunityList.data?.items ?? []}
          keyExtractor={(item: OpportunityListItem) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }: { item: OpportunityListItem }) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: item.id === form.opportunityId }} onPress={() => chooseOpportunity(item)} className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70">
              <Ionicons name="briefcase-outline" size={19} color={item.id === form.opportunityId ? colors.primary : colors.mutedForeground} />
              <View className="flex-1"><Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.title}</Text><Text className="font-inter text-xs text-muted-foreground">{item.qualificationStage ?? item.stage?.name ?? 'Aşama yok'}</Text></View>
              {item.id === form.opportunityId ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
            </Pressable>
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (opportunityList.hasNextPage && !opportunityList.isFetchingNextPage) void opportunityList.fetchNextPage(); }}
          ListEmptyComponent={opportunityList.isPending ? <Loading /> : opportunityList.error ? <ErrorState message={opportunityList.error.message} onRetry={() => void opportunityList.refetch()} /> : <EmptyState title="Satış kartı bulunamadı" />}
          ListFooterComponent={opportunityList.isFetchingNextPage ? <Loading /> : null}
        />
      </BottomSheetModal>

      <BottomSheetModal ref={contactSheet} {...sheetProps}>
        <BottomSheetView className="gap-3 px-4 pb-2">
          <Text className="font-inter-semibold text-base text-foreground">Kontak seçin</Text>
          {form.contactId ? <Button label="Bağlantıyı Kaldır" variant="ghost" onPress={() => chooseContact(null)} /> : null}
          <SearchBar value={contactSearch} onChange={setContactSearch} placeholder="Kontak ara" />
        </BottomSheetView>
        <BottomSheetFlatList
          data={contactList.data?.items ?? []}
          keyExtractor={(item: ContactListItem) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }: { item: ContactListItem }) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: item.id === form.contactId }} onPress={() => chooseContact(item)} className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70">
              <Ionicons name="person-outline" size={19} color={item.id === form.contactId ? colors.primary : colors.mutedForeground} />
              <View className="flex-1"><Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.fullName}</Text><Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{[item.title, item.department].filter(Boolean).join(' · ') || 'Kontak'}</Text></View>
              {item.id === form.contactId ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
            </Pressable>
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (contactList.hasNextPage && !contactList.isFetchingNextPage) void contactList.fetchNextPage(); }}
          ListEmptyComponent={contactList.isPending ? <Loading /> : contactList.error ? <ErrorState message={contactList.error.message} onRetry={() => void contactList.refetch()} /> : <EmptyState title="Kontak bulunamadı" />}
          ListFooterComponent={contactList.isFetchingNextPage ? <Loading /> : null}
        />
      </BottomSheetModal>
    </SafeAreaView>
  );
}
