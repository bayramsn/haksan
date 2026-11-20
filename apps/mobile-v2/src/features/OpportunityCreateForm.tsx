import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCreateOpportunity, useOpportunityAssignees } from '@/src/api/crm.hooks';
import type { ProductModel } from '@/src/api/endpoints';
import { useProductList } from '@/src/api/inventory.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { CompanyPickerField, type PickedCompany } from '@/src/features/CompanyPickerField';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { parseDecimal } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, EmptyState, Eyebrow, Field, FilterChips, Loading, SearchBar } from '@/src/ui';
import { toast } from '@/src/ui/toast';

type Machine = { productModelId?: string; name: string; quantity: number };
const CURRENCIES = [{ value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' }, { value: 'TRY', label: 'TRY' }] as const;
type Currency = (typeof CURRENCIES)[number]['value'];

function productLabel(product: ProductModel): string {
  return [product.brand?.name, product.modelName ?? product.modelCode].filter(Boolean).join(' ') || product.fullName;
}

/**
 * Web CreateCaseDialog ile birebir: müşteri ve en az bir makine zorunlu, ilk makine
 * başlığı/modeli ve (peşin, yoksa liste fiyatı × adet) tahmini tutarı doldurur,
 * bölüm seçimi web'deki kuralla açılır, atama yalnız süper adminde.
 */
export function OpportunityCreateForm({
  initialCompany,
  initialDescription,
  fromActivityId,
}: {
  initialCompany: PickedCompany | null;
  initialDescription?: string;
  fromActivityId?: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, scope } = useAuth();
  const create = useCreateOpportunity();
  const isSuperAdmin = Boolean(user?.roles?.includes('super_admin'));
  const assignees = useOpportunityAssignees(isSuperAdmin);

  // Web: opportunities kaynak kapsamına göre seçilebilir bölümler.
  const divisions = user?.divisions ?? [];
  const opportunityScopes = (user?.accessScopes ?? []).filter((item) => item.resource === 'opportunities');
  const canPickAll = opportunityScopes.length === 0 ? Boolean(user?.canViewAllDivisions) : opportunityScopes.some((item) => item.divisionId === null);
  const scopedIds = new Set(opportunityScopes.map((item) => item.divisionId).filter(Boolean));
  const allowedDivisions = opportunityScopes.length === 0 || canPickAll ? divisions : divisions.filter((item) => scopedIds.has(item.id));
  const activeDivision = scope.divisionId;
  const canPickDivision = !activeDivision || canPickAll || allowedDivisions.length > 1;
  const defaultDivisionId = activeDivision ?? allowedDivisions.find((item) => item.isPrimary)?.id ?? allowedDivisions[0]?.id ?? '';

  const [company, setCompany] = useState<PickedCompany | null>(initialCompany);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [requestedProduct, setRequestedProduct] = useState('');
  const [requestedModel, setRequestedModel] = useState('');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [quantity, setQuantity] = useState('1');
  const [estimatedAmount, setEstimatedAmount] = useState('0');
  const [probability, setProbability] = useState('50');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [paymentTermDays, setPaymentTermDays] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [ownerUserId, setOwnerUserId] = useState(user?.id ?? '');
  const [divisionId, setDivisionId] = useState(canPickDivision ? defaultDivisionId : '');
  const [search, setSearch] = useState('');
  const machineSheet = useRef<BottomSheetModal>(null);

  const divisionCode = (canPickDivision ? divisions.find((item) => item.id === divisionId) : divisions.find((item) => item.id === activeDivision))?.code?.toLocaleUpperCase('en-US');
  const products = useProductList({ categoryCode: 'TEZGAH', search: useDebouncedValue(search, 300).trim() || undefined });
  const productOptions = useMemo(
    () => (products.data?.items ?? []).filter((item) => !divisionCode || (item.productGroup?.code ?? '').toLocaleUpperCase('en-US') === divisionCode),
    [products.data, divisionCode],
  );

  function addMachine(machine: { productModelId?: string; name: string }, primary?: { brand: string; model: string; unit?: number; currency?: string }) {
    const name = machine.name.trim();
    if (!name || machines.some((item) => item.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) return;
    const isFirst = machines.length === 0;
    setMachines([...machines, { productModelId: machine.productModelId, name, quantity: 1 }]);
    setRequestedProduct((current) => (isFirst && primary ? primary.brand : current || primary?.brand || name));
    if (isFirst && primary) setRequestedModel(primary.model);
    if (isFirst && primary?.unit) setEstimatedAmount(String(primary.unit * (Number(quantity) || 1)));
    if (isFirst && (primary?.currency === 'USD' || primary?.currency === 'EUR' || primary?.currency === 'TRY')) setCurrency(primary.currency);
    machineSheet.current?.dismiss();
    setSearch('');
  }

  function pickProduct(product: ProductModel) {
    const brand = product.brand?.name || product.productType?.name || product.modelCode;
    const unit = Number(product.cashPrice ?? product.listPrice ?? 0) || 0;
    addMachine({ productModelId: product.id, name: productLabel(product) }, { brand, model: product.modelName ?? product.modelCode, unit, currency: product.currency?.code });
  }

  function submit() {
    if (!company) return toast.error('Müşteri seçiniz');
    if (!requestedProduct && machines.length === 0) return toast.error('En az bir makine seçiniz');
    if (canPickDivision && !divisionId) return toast.error('Bölüm seçiniz');
    const amount = parseDecimal(estimatedAmount || '0');
    if (!Number.isFinite(amount) || amount < 0) return toast.error('Tahmini tutarı 1500 veya 1.500,00 biçiminde girin.');
    if (expectedCloseDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(expectedCloseDate.trim())) return toast.error('Hedef kapanış tarihi biçimi: YYYY-AA-GG');
    const term = paymentTermDays.trim() === '' ? undefined : Math.max(0, Number(paymentTermDays) || 0);
    create.mutate(
      {
        fromActivityId,
        companyId: company.id,
        ownerUserId: (isSuperAdmin ? ownerUserId : user?.id) || undefined,
        title: requestedProduct || machines[0]?.name || '',
        description: description.trim() || undefined,
        estimatedValue: amount,
        currencyCode: currency,
        probability: Math.min(100, Math.max(0, Number(probability) || 0)),
        expectedCloseDate: expectedCloseDate.trim() ? new Date(`${expectedCloseDate.trim()}T00:00:00`).toISOString() : undefined,
        paymentTermDays: term,
        requestedMachine: machines[0]?.name ?? (requestedModel || undefined),
        products: machines.length ? machines.map((item) => ({ productModelId: item.productModelId, machineName: item.name, quantity: item.quantity })) : undefined,
        divisionId: divisionId || undefined,
      },
      {
        onSuccess: (created) => {
          toast.success('Fırsat oluşturuldu');
          router.replace(`/modules/opportunities/${created.id}`);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: fromActivityId ? 'Aktiviteden Fırsat' : 'Yeni Fırsat', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-xs text-muted-foreground">Seçilen firma için ilk C alanında bir satış fırsatı oluşturun.</Text>
          <View className="gap-3">
            <CompanyPickerField label="Müşteri" required allowCreate value={company} onChange={setCompany} />
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Talep edilen makineler *</Text>
              {machines.map((machine, index) => (
                <View key={`${machine.name}-${index}`} className="flex-row items-center gap-2 rounded-control border border-border bg-card px-3 py-2">
                  <Text className="flex-1 font-inter text-sm text-foreground" numberOfLines={2}>{machine.name}</Text>
                  <TextInput
                    accessibilityLabel={`${machine.name} adedi`}
                    keyboardType="number-pad"
                    value={String(machine.quantity)}
                    onChangeText={(value) => setMachines(machines.map((item, i) => (i === index ? { ...item, quantity: Math.max(1, Number(value) || 1) } : item)))}
                    className="h-9 w-14 rounded-control border border-border px-2 text-center font-inter text-sm text-foreground"
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel={`${machine.name} kaldır`} hitSlop={8} onPress={() => {
                    const next = machines.filter((_, i) => i !== index);
                    setMachines(next);
                  }}>
                    <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
              <Button label="Makine ekle" variant="ghost" onPress={() => machineSheet.current?.present()} />
            </View>
            <Field label="Model" value={requestedModel} onChangeText={setRequestedModel} placeholder="Model elle girilebilir" />
            <Field label="Fırsat açıklaması" value={description} onChangeText={setDescription} multiline maxLength={4000} placeholder="İhtiyaç, kullanım amacı ve ticari notlar" />
          </View>

          <View className="gap-3">
            <Eyebrow>Ticari</Eyebrow>
            <Field label="Adet" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" maxLength={4} />
            <Field label="Tahmini tutar" value={estimatedAmount} onChangeText={setEstimatedAmount} keyboardType="decimal-pad" />
            <View className="gap-1.5"><Text className="font-inter-medium text-[13px] text-muted-foreground">Para birimi</Text><FilterChips options={[...CURRENCIES]} value={currency} onChange={(value) => value && setCurrency(value)} allLabel="" /></View>
            <Field label="Kazanma olasılığı (%)" value={probability} onChangeText={setProbability} keyboardType="number-pad" maxLength={3} />
            <Field label="Hedef kapanış tarihi" value={expectedCloseDate} onChangeText={setExpectedCloseDate} placeholder="YYYY-AA-GG" keyboardType="numbers-and-punctuation" maxLength={10} />
            <Field label="Vade (gün)" value={paymentTermDays} onChangeText={setPaymentTermDays} keyboardType="number-pad" placeholder="Örn. 90" maxLength={4} />
          </View>

          {isSuperAdmin || canPickDivision ? (
            <View className="gap-3">
              <Eyebrow>Atama</Eyebrow>
              {isSuperAdmin ? (
                <View className="gap-1.5">
                  <Text className="font-inter-medium text-[13px] text-muted-foreground">Atanan kullanıcı</Text>
                  {assignees.isPending ? <Loading /> : <FilterChips options={(assignees.data ?? []).map((item) => ({ value: item.id, label: item.name }))} value={ownerUserId || null} onChange={(value) => value && setOwnerUserId(value)} allLabel="" />}
                </View>
              ) : null}
              {canPickDivision ? (
                <View className="gap-1.5">
                  <Text className="font-inter-medium text-[13px] text-muted-foreground">Bölüm *</Text>
                  <FilterChips options={allowedDivisions.map((item) => ({ value: item.id, label: item.name }))} value={divisionId || null} onChange={(value) => value && setDivisionId(value)} allLabel="" />
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Fırsatı Oluştur" loading={create.isPending} disabled={create.isPending} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>

      <BottomSheetModal ref={machineSheet} snapPoints={['80%']} enableDynamicSizing={false} backgroundStyle={{ backgroundColor: colors.card }} handleIndicatorStyle={{ backgroundColor: colors.mutedForeground }} backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}>
        <BottomSheetView className="gap-3 px-4 pb-2">
          <Text className="font-inter-semibold text-base text-foreground">Tezgah seçin</Text>
          <SearchBar value={search} onChange={setSearch} placeholder="Marka / model ara" />
        </BottomSheetView>
        <BottomSheetFlatList
          data={productOptions}
          keyExtractor={(item: ProductModel) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          ListHeaderComponent={search.trim().length >= 2 ? (
            <Pressable accessibilityRole="button" onPress={() => addMachine({ name: search.trim() }, { brand: search.trim(), model: '' })} className="min-h-12 flex-row items-center gap-2 border-b border-border py-2 active:opacity-70">
              <Ionicons name="add-circle-outline" size={19} color={colors.primary} />
              <Text className="flex-1 font-inter-medium text-sm text-primary" numberOfLines={2}>{`"${search.trim()}" serbest ürün olarak ekle`}</Text>
            </Pressable>
          ) : null}
          renderItem={({ item }: { item: ProductModel }) => (
            <Pressable accessibilityRole="button" onPress={() => pickProduct(item)} className="min-h-[56px] justify-center border-b border-border py-2 active:opacity-70">
              <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={2}>{productLabel(item)}</Text>
              {item.productType?.name ? <Text className="font-inter text-xs text-muted-foreground">{item.productType.name}</Text> : null}
            </Pressable>
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => { if (products.hasNextPage && !products.isFetchingNextPage) void products.fetchNextPage(); }}
          ListEmptyComponent={products.isPending ? <Loading /> : <EmptyState title="Tezgah bulunamadı" />}
        />
      </BottomSheetModal>
    </SafeAreaView>
  );
}
