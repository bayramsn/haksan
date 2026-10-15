import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { productUpdateSchema, type ProductUpdateInput } from '@haksan/shared';
import { useProduct, useUpdateProduct } from '@/src/api/inventory.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { Button, ErrorState, Field, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';

type FormState = {
  fullName: string;
  modelCode: string;
  modelName: string;
  series: string;
  stockCode: string;
  listPrice: string;
  cashPrice: string;
  vatRate: string;
  originCountry: string;
  productionYear: string;
  hsCode: string;
  imageUrl: string;
  description: string;
};

const EMPTY: FormState = {
  fullName: '',
  modelCode: '',
  modelName: '',
  series: '',
  stockCode: '',
  listPrice: '',
  cashPrice: '',
  vatRate: '',
  originCountry: '',
  productionYear: '',
  hsCode: '',
  imageUrl: '',
  description: '',
};

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const canUpdate = useCan('products.update');
  const detail = useProduct(id);
  const update = useUpdateProduct(id);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const data = detail.data;
    if (!data || hydrated) return;
    setForm({
      fullName: data.fullName ?? '',
      modelCode: data.modelCode ?? '',
      modelName: data.modelName ?? '',
      series: data.series ?? '',
      stockCode: data.stockCode ?? '',
      listPrice: data.listPrice ?? '',
      cashPrice: data.cashPrice ?? '',
      vatRate: data.vatRate ?? '',
      originCountry: data.originCountry ?? '',
      productionYear: data.productionYear ? String(data.productionYear) : '',
      hsCode: data.hsCode ?? '',
      imageUrl: data.imageUrl ?? '',
      description: data.description ?? '',
    });
    setHydrated(true);
  }, [detail.data, hydrated]);

  if (!canUpdate) return <Redirect href="/(tabs)/modules/products" />;

  if (detail.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Ürünü Düzenle', headerShown: true }} />
        <Loading />
      </SafeAreaView>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Ürünü Düzenle', headerShown: true }} />
        <ErrorState message={detail.error?.message ?? 'Ürün yüklenemedi.'} onRetry={() => void detail.refetch()} />
      </SafeAreaView>
    );
  }

  const set = <K extends keyof FormState>(key: K, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  function submit() {
    const original = detail.data!;
    const candidate: ProductUpdateInput = {};
    const stringFields = ['fullName', 'modelCode', 'modelName', 'series', 'stockCode', 'originCountry', 'hsCode', 'imageUrl', 'description'] as const;
    stringFields.forEach((key) => {
      const next = form[key].trim();
      if (next !== String(original[key] ?? '')) candidate[key] = next;
    });
    if (form.listPrice !== String(original.listPrice ?? '') && form.listPrice.trim()) candidate.listPrice = Number(form.listPrice);
    if (form.cashPrice !== String(original.cashPrice ?? '') && form.cashPrice.trim()) candidate.cashPrice = Number(form.cashPrice);
    if (form.vatRate !== String(original.vatRate ?? '') && form.vatRate.trim()) candidate.vatRate = Number(form.vatRate);
    if (form.productionYear !== String(original.productionYear ?? '') && form.productionYear.trim()) {
      candidate.productionYear = Number(form.productionYear);
    }

    const parsed = productUpdateSchema.safeParse(candidate);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors(Object.fromEntries(Object.entries(flat).map(([key, value]) => [key, value?.[0]])) as Partial<Record<keyof FormState, string>>);
      return;
    }
    if (Object.keys(parsed.data).length === 0) {
      router.back();
      return;
    }

    update.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('Ürün güncellendi');
        router.back();
      },
      onError: (error) => Alert.alert('Güncelleme yapılamadı', error.message),
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Ürünü Düzenle', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <Field label="Ürün adı *" value={form.fullName} onChangeText={(value) => set('fullName', value)} error={errors.fullName} />
          <Field label="Model kodu *" value={form.modelCode} onChangeText={(value) => set('modelCode', value)} error={errors.modelCode} />
          <Field label="Model adı" value={form.modelName} onChangeText={(value) => set('modelName', value)} error={errors.modelName} />
          <Field label="Seri" value={form.series} onChangeText={(value) => set('series', value)} error={errors.series} />
          <Field label="Stok kodu" value={form.stockCode} onChangeText={(value) => set('stockCode', value)} error={errors.stockCode} />
          <Field label="Liste fiyatı" value={form.listPrice} onChangeText={(value) => set('listPrice', value)} keyboardType="decimal-pad" error={errors.listPrice} />
          <Field label="Peşin fiyat" value={form.cashPrice} onChangeText={(value) => set('cashPrice', value)} keyboardType="decimal-pad" error={errors.cashPrice} />
          <Field label="KDV oranı" value={form.vatRate} onChangeText={(value) => set('vatRate', value)} keyboardType="decimal-pad" error={errors.vatRate} />
          <Field label="Menşe ülke" value={form.originCountry} onChangeText={(value) => set('originCountry', value)} error={errors.originCountry} />
          <Field label="Üretim yılı" value={form.productionYear} onChangeText={(value) => set('productionYear', value)} keyboardType="number-pad" error={errors.productionYear} />
          <Field label="GTIP" value={form.hsCode} onChangeText={(value) => set('hsCode', value)} error={errors.hsCode} />
          <Field label="Görsel URL" value={form.imageUrl} onChangeText={(value) => set('imageUrl', value)} keyboardType="url" autoCapitalize="none" error={errors.imageUrl} />
          <Field
            label="Açıklama"
            value={form.description}
            onChangeText={(value) => set('description', value)}
            multiline
            numberOfLines={4}
            className="min-h-[96px] rounded-control border border-border bg-card px-3.5 py-3 text-base text-foreground"
            error={errors.description}
          />
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
          <View className="flex-[2]"><Button label="Kaydet" loading={update.isPending} disabled={update.isPending} onPress={submit} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
