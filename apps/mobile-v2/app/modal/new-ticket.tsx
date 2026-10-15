import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  useCompanyList,
} from '@/src/api/companies.hooks';
import { useCreateServiceTicket } from '@/src/api/operations.hooks';
import type { CompanyListItem } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { chipClass, chipTextClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Button, EmptyState, ErrorState, Eyebrow, Field, FilterChips, Loading, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const SEVERITIES: { value: 'low' | 'normal' | 'high' | 'critical'; label: string; tone: Tone }[] = [
  { value: 'low', label: 'Düşük', tone: 'neutral' },
  { value: 'normal', label: 'Normal', tone: 'info' },
  { value: 'high', label: 'Yüksek', tone: 'warning' },
  { value: 'critical', label: 'Kritik', tone: 'destructive' },
];

const TICKET_TYPES: { value: 'complaint' | 'request' | 'warranty_claim' | 'question'; label: string }[] = [
  { value: 'complaint', label: 'Şikayet' },
  { value: 'request', label: 'Talep' },
  { value: 'warranty_claim', label: 'Garanti' },
  { value: 'question', label: 'Soru' },
];

function clean(v: string): string | undefined {
  const trimmed = v.trim();
  return trimmed || undefined;
}

export default function NewTicketScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('service_tickets.create');
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string }>();

  const create = useCreateServiceTicket();
  const [companyId, setCompanyId] = useState(first(params.companyId));
  const [companyName, setCompanyName] = useState(first(params.companyName));
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const [ticketType, setTicketType] = useState<'complaint' | 'request' | 'warranty_claim' | 'question'>('complaint');
  const [errors, setErrors] = useState<{ companyId?: string; subject?: string }>({});
  const [search, setSearch] = useState('');
  const companySheet = useRef<BottomSheetModal>(null);

  const companyList = useCompanyList(
    useMemo(() => ({ search: clean(search), sortBy: 'name' as const, sortDir: 'asc' as const }), [search])
  );

  if (!canCreate) return <Redirect href="/(tabs)/modules/service-tickets" />;

  function chooseCompany(company: CompanyListItem) {
    setCompanyId(company.id);
    setCompanyName(company.shortName ?? company.legalTitle);
    setErrors((prev) => ({ ...prev, companyId: undefined }));
    companySheet.current?.dismiss();
  }

  function submit() {
    const nextErrors: typeof errors = {};
    if (!companyId) nextErrors.companyId = 'Firma seçin.';
    if (!subject.trim()) nextErrors.subject = 'Konu zorunludur.';
    if (nextErrors.companyId || nextErrors.subject) {
      setErrors(nextErrors);
      return;
    }
    create.mutate(
      {
        companyId,
        subject: subject.trim(),
        description: clean(description),
        severity,
        ticketType,
        source: 'manual',
      },
      {
        onSuccess: () => {
          toast.success('Servis talebi oluşturuldu');
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
      <Stack.Screen options={{ title: 'Yeni Servis Talebi', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <View className="gap-3">
            <Eyebrow>Firma</Eyebrow>
            <Pressable
              accessibilityRole="button"
              onPress={() => companySheet.current?.present()}
              className={`min-h-12 flex-row items-center gap-3 rounded-control border bg-card px-3 py-2 ${errors.companyId ? 'border-destructive' : 'border-border'} active:opacity-70`}
            >
              <Ionicons name="business-outline" size={19} color={colors.primary} />
              <View className="flex-1 gap-0.5">
                <Text className="font-inter-medium text-xs text-muted-foreground">Firma *</Text>
                <Text className="font-inter text-base text-foreground" numberOfLines={1}>
                  {companyName || 'Firma seçin'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </Pressable>
            {errors.companyId ? <Text className="font-inter text-xs text-destructive">{errors.companyId}</Text> : null}
          </View>

          <View className="gap-3">
            <Eyebrow>Talep</Eyebrow>
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Tür</Text>
              <FilterChips
                options={TICKET_TYPES}
                value={ticketType}
                onChange={(value) => value && setTicketType(value)}
                allLabel=""
              />
            </View>
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Ciddiyet</Text>
              <View className="flex-row flex-wrap gap-2">
                {SEVERITIES.map((item) => {
                  const active = severity === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => setSeverity(item.value)}
                      className={`self-start rounded-full border px-3 py-2 ${active ? chipClass[item.tone] : 'border-border bg-card'}`}
                    >
                      <Text className={`font-inter-medium text-xs ${active ? chipTextClass[item.tone] : 'text-foreground'}`}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Field label="Konu *" value={subject} onChangeText={(v) => { setSubject(v); setErrors((p) => ({ ...p, subject: undefined })); }} maxLength={255} autoFocus error={errors.subject} />
            <Field
              label="Arıza / talep açıklaması"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={4000}
              className="min-h-24 rounded-control border border-border bg-input-background px-3 py-2 font-inter text-base text-foreground"
            />
          </View>

          <Text className="font-inter text-xs text-muted-foreground">
            Talep numarası sunucuda otomatik üretilir; firma ve bölüm erişimi yeniden doğrulanır.
          </Text>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Talebi Oluştur" loading={create.isPending} onPress={submit} /></View>
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

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
