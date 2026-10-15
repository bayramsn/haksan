import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Redirect, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyList } from '@/src/api/companies.hooks';
import { useCreateOpportunity } from '@/src/api/crm.hooks';
import type { CompanyListItem } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { parseLocalDateTime } from '@/src/lib/format';
import { Button, EmptyState, ErrorState, Eyebrow, Field, Loading, SearchBar } from '@/src/ui';
import { useTheme } from '@/src/theme/theme';
import { toast } from '@/src/ui/toast';

const CURRENCIES = ['TRY', 'USD', 'EUR'] as const;

function clean(v: string): string | undefined {
  const trimmed = v.trim();
  return trimmed || undefined;
}

/**
 * Hızlı fırsat/lead kartı açma (web LeadCaptureDialog karşılığı).
 * Sunucu kuralı: firma seçilmediyse kontak ismi zorunlu.
 */
export default function NewOpportunityScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('opportunities.create');
  const create = useCreateOpportunity();

  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [leadContactName, setLeadContactName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadCity, setLeadCity] = useState('');
  const [title, setTitle] = useState('');
  const [requestedMachine, setRequestedMachine] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [currencyCode, setCurrencyCode] = useState<'TRY' | 'USD' | 'EUR'>('USD');
  const [probability, setProbability] = useState('50');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionAt, setNextActionAt] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [search, setSearch] = useState('');
  const companySheet = useRef<BottomSheetModal>(null);

  const companyList = useCompanyList(
    useMemo(() => ({ search: clean(search), sortBy: 'name' as const, sortDir: 'asc' as const }), [search])
  );

  if (!canCreate) return <Redirect href="/(tabs)/modules/opportunities" />;

  function chooseCompany(company: CompanyListItem) {
    setCompanyId(company.id);
    setCompanyName(company.shortName ?? company.legalTitle);
    setErrors((prev) => ({ ...prev, companyId: undefined }));
    companySheet.current?.dismiss();
  }

  function submit() {
    const nextErrors: Record<string, string | undefined> = {};
    if (!title.trim()) nextErrors.title = 'Başlık zorunludur.';
    // Sunucu kuralı: firma yoksa kontak ismi zorunlu.
    if (!companyId && !leadContactName.trim()) nextErrors.leadContactName = 'Firma seçilmediyse kontak ismi zorunludur.';
    let closeDate: Date | null = null;
    if (expectedCloseDate.trim()) {
      closeDate = parseLocalDateTime(`${expectedCloseDate.trim()} 00:00`.slice(0, 16));
      if (!closeDate) nextErrors.expectedCloseDate = 'Biçim: YYYY-AA-GG';
    }
    let actionAt: Date | null = null;
    if (nextActionAt.trim()) {
      actionAt = parseLocalDateTime(nextActionAt);
      if (!actionAt) nextErrors.nextActionAt = 'Biçim: YYYY-AA-GG SS:DD';
    }
    if (actionAt && !nextAction.trim()) nextErrors.nextAction = 'Takip zamanı için sonraki aksiyon zorunludur.';
    const valueNumber = estimatedValue.trim() ? Number(estimatedValue.replace(',', '.')) : NaN;
    if (estimatedValue.trim() && (Number.isNaN(valueNumber))) nextErrors.estimatedValue = 'Sayısal bir tutar girin.';
    const probNumber = Number(probability || '50');
    if (Number.isNaN(probNumber) || probNumber < 0 || probNumber > 100) nextErrors.probability = '0-100 arası bir oran girin.';
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      return;
    }

    create.mutate(
      {
        title: title.trim(),
        ...(companyId ? { companyId } : {}),
        ...(!companyId ? { leadContactName: leadContactName.trim() } : {}),
        leadPhone: clean(leadPhone),
        leadCity: clean(leadCity),
        requestedMachine: clean(requestedMachine),
        description: clean(description),
        ...(estimatedValue.trim()
          ? { estimatedValue: valueNumber, currencyCode }
          : {}),
        probability: probNumber,
        ...(closeDate ? { expectedCloseDate: closeDate.toISOString() } : {}),
        nextAction: clean(nextAction),
        ...(actionAt ? { nextActionAt: actionAt.toISOString() } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Fırsat kartı oluşturuldu');
          router.back();
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  const sheetProps = {
    snapPoints: ['80%'],
    enableDynamicSizing: false,
    backgroundStyle: { backgroundColor: colors.card },
    handleIndicatorStyle: { backgroundColor: colors.mutedForeground },
    backdropComponent: (props: Parameters<typeof BottomSheetBackdrop>[0]) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
    ),
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni Fırsat', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="gap-3">
            <Eyebrow>Kart</Eyebrow>
            <Field label="Başlık *" value={title} onChangeText={(v) => { setTitle(v); setErrors((p) => ({ ...p, title: undefined })); }} maxLength={255} autoFocus error={errors.title} />
            <Field label="Talep edilen makine" value={requestedMachine} onChangeText={setRequestedMachine} maxLength={255} />

            {/* Firma seçilmediyse hızlı lead alanları açılır */}
            {!companyId ? (
              <>
                <Field
                  label="Kontak ismi *"
                  value={leadContactName}
                  onChangeText={(v) => { setLeadContactName(v); setErrors((p) => ({ ...p, leadContactName: undefined })); }}
                  error={errors.leadContactName}
                />
                <Field label="Telefon" value={leadPhone} onChangeText={setLeadPhone} keyboardType="phone-pad" />
                <Field label="Şehir" value={leadCity} onChangeText={setLeadCity} />
              </>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => companySheet.current?.present()}
              className={`min-h-12 flex-row items-center gap-3 rounded-control border bg-card px-3 py-2 active:opacity-70 ${companyId ? 'border-border' : 'border-dashed border-border'}`}
            >
              <Ionicons name={companyId ? 'business-outline' : 'add-circle-outline'} size={19} color={colors.primary} />
              <View className="flex-1 gap-0.5">
                <Text className="font-inter-medium text-xs text-muted-foreground">Firma bağla</Text>
                <Text className="font-inter text-base text-foreground" numberOfLines={1}>
                  {companyName || 'Şimdilik lead olarak bırak'}
                </Text>
              </View>
              {companyId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Firma bağlantısını kaldır"
                  onPress={() => {
                    setCompanyId('');
                    setCompanyName('');
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                </Pressable>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              )}
            </Pressable>
          </View>

          <View className="gap-3">
            <Eyebrow>Ticari</Eyebrow>
            <View className="flex-row gap-2">
              <View className="flex-[2]">
                <Field
                  label="Tahmini tutar"
                  value={estimatedValue}
                  onChangeText={(v) => { setEstimatedValue(v); setErrors((p) => ({ ...p, estimatedValue: undefined })); }}
                  keyboardType="decimal-pad"
                  error={errors.estimatedValue}
                />
              </View>
              <View className="flex-1 flex-row gap-1 pt-6">
                {CURRENCIES.map((code) => (
                  <Pressable
                    key={code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: currencyCode === code }}
                    onPress={() => setCurrencyCode(code)}
                    className={`flex-1 items-center rounded-control border py-2 ${currencyCode === code ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}
                  >
                    <Text className={`font-inter-semibold text-xs ${currencyCode === code ? 'text-primary' : 'text-foreground'}`}>{code}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Field
              label="Olasılık (%)"
              value={probability}
              onChangeText={(v) => { setProbability(v); setErrors((p) => ({ ...p, probability: undefined })); }}
              keyboardType="number-pad"
              error={errors.probability}
            />
            <Field
              label="Beklenen kapanış"
              value={expectedCloseDate}
              onChangeText={(v) => { setExpectedCloseDate(v); setErrors((p) => ({ ...p, expectedCloseDate: undefined })); }}
              placeholder="YYYY-AA-GG"
              keyboardType="numbers-and-punctuation"
              error={errors.expectedCloseDate}
            />
          </View>

          <View className="gap-3">
            <Eyebrow>Takip</Eyebrow>
            <Field
              label="Sonraki aksiyon"
              value={nextAction}
              onChangeText={(v) => { setNextAction(v); setErrors((p) => ({ ...p, nextAction: undefined })); }}
              error={errors.nextAction}
            />
            <Field
              label="Sonraki aksiyon zamanı"
              value={nextActionAt}
              onChangeText={(v) => { setNextActionAt(v); setErrors((p) => ({ ...p, nextActionAt: undefined })); }}
              placeholder="YYYY-AA-GG SS:DD"
              keyboardType="numbers-and-punctuation"
              maxLength={16}
              error={errors.nextActionAt}
            />
            <Field
              label="Açıklama"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              className="min-h-[80px] rounded-control border border-border bg-card px-3.5 py-3 text-base text-foreground"
            />
          </View>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Fırsatı Oluştur" loading={create.isPending} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>

      <BottomSheetModal ref={companySheet} {...sheetProps}>
        <BottomSheetView className="gap-3 px-4 pb-2">
          <Text className="font-inter-semibold text-base text-foreground">Firma seçin</Text>
          <SearchBar value={search} onChange={setSearch} placeholder="Firma ara" />
        </BottomSheetView>
        <BottomSheetFlatList
          data={companyList.data?.items ?? []}
          keyExtractor={(item: CompanyListItem) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }: { item: CompanyListItem }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: item.id === companyId }}
              onPress={() => chooseCompany(item)}
              className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
            >
              <Ionicons name="business-outline" size={19} color={item.id === companyId ? colors.primary : colors.mutedForeground} />
              <View className="flex-1">
                <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.shortName ?? item.legalTitle}</Text>
                {item.shortName ? <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{item.legalTitle}</Text> : null}
              </View>
              {item.id === companyId ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
            </Pressable>
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (companyList.hasNextPage && !companyList.isFetchingNextPage) void companyList.fetchNextPage(); }}
          ListEmptyComponent={
            companyList.isPending ? <Loading /> : companyList.error ? <ErrorState message={companyList.error.message} onRetry={() => void companyList.refetch()} /> : <EmptyState title="Firma bulunamadı" />
          }
          ListFooterComponent={companyList.isFetchingNextPage ? <Loading /> : null}
        />
      </BottomSheetModal>
    </SafeAreaView>
  );
}
