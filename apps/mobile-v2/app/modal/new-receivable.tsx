import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyList } from '@/src/api/companies.hooks';
import { useCreateReceivable } from '@/src/api/finance.hooks';
import type { CompanyListItem } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { parseLocalDateTime } from '@/src/lib/format';
import { Button, EmptyState, ErrorState, Eyebrow, Field, Loading, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const CURRENCIES = ['TRY', 'USD', 'EUR'] as const;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Yeni alacak kaydı — web CreatePaymentPlanDialog'un tek taksit hali. */
export default function NewReceivableScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('receivables.create');
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string }>();
  const create = useCreateReceivable();

  const [companyId, setCompanyId] = useState(first(params.companyId));
  const [companyName, setCompanyName] = useState(first(params.companyName));
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState<'TRY' | 'USD' | 'EUR'>('TRY');
  const [dueDate, setDueDate] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [search, setSearch] = useState('');
  const companySheet = useRef<BottomSheetModal>(null);

  const companyList = useCompanyList(
    useMemo(() => ({ search: search.trim() || undefined, sortBy: 'name' as const, sortDir: 'asc' as const }), [search])
  );

  if (!canCreate) return <Redirect href="/(tabs)/modules/receivables" />;

  function submit() {
    const nextErrors: Record<string, string | undefined> = {};
    if (!companyId) nextErrors.companyId = 'Firma seçin.';
    const valueNumber = Number(amount.replace(',', '.'));
    if (!amount.trim() || Number.isNaN(valueNumber) || valueNumber <= 0) nextErrors.amount = 'Geçerli bir tutar girin.';
    const due = parseLocalDateTime(`${dueDate.trim()} 00:00`.slice(0, 16));
    if (!dueDate.trim() || !due) nextErrors.dueDate = 'Vade tarihi zorunludur (YYYY-AA-GG).';
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      return;
    }
    create.mutate(
      {
        companyId,
        amount: valueNumber,
        currencyCode,
        dueDate: due!.toISOString(),
        invoiceNo: invoiceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Alacak kaydı oluşturuldu');
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
      <Stack.Screen options={{ title: 'Yeni Alacak', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
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

          <View className="flex-row gap-2">
            <View className="flex-[2]">
              <Field
                label="Tutar *"
                value={amount}
                onChangeText={(v) => { setAmount(v); setErrors((p) => ({ ...p, amount: undefined })); }}
                keyboardType="decimal-pad"
                error={errors.amount}
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
            label="Vade tarihi *"
            value={dueDate}
            onChangeText={(v) => { setDueDate(v); setErrors((p) => ({ ...p, dueDate: undefined })); }}
            placeholder="YYYY-AA-GG"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            error={errors.dueDate}
          />
          <Field label="Fatura no" value={invoiceNo} onChangeText={setInvoiceNo} maxLength={64} />
          <Field
            label="Not"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            className="min-h-[80px] rounded-control border border-border bg-card px-3.5 py-3 text-base text-foreground"
          />
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Kaydet" loading={create.isPending} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>

      <BottomSheetModal ref={companySheet} {...sheetProps}>
        <BottomSheetView className="gap-3 px-4 pb-2">
          <Eyebrow>Firma seçin</Eyebrow>
          <SearchBar value={search} onChange={setSearch} placeholder="Firma ara" />
        </BottomSheetView>
        <BottomSheetFlatList
          data={companyList.data?.items ?? []}
          keyExtractor={(item: CompanyListItem) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          renderItem={({ item }: { item: CompanyListItem }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setCompanyId(item.id);
                setCompanyName(item.shortName ?? item.legalTitle);
                setErrors((prev) => ({ ...prev, companyId: undefined }));
                companySheet.current?.dismiss();
              }}
              className="min-h-[56px] flex-row items-center gap-3 border-b border-border py-2 active:opacity-70"
            >
              <Ionicons name="business-outline" size={19} color={colors.mutedForeground} />
              <View className="flex-1">
                <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.shortName ?? item.legalTitle}</Text>
                {item.shortName ? <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{item.legalTitle}</Text> : null}
              </View>
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
