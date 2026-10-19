import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useOpportunity, useUpdateOpportunity } from '@/src/api/crm.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { Button, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { AssigneeSelect, ProductSelect } from '@/src/ui/select/fields';
import { emptyExtraMachine, quantityOf } from '@/src/ui/sales/quick-opportunity';
import { toast } from '@/src/ui/toast';

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
type Currency = (typeof CURRENCIES)[number];

type MachineRow = { key: string; productModelId: string; product: string; quantity: string };

type Form = {
  title: string;
  machines: MachineRow[];
  estimatedValue: string;
  currencyCode: Currency;
  probability: string;
  expectedCloseDate: Date | null;
  description: string;
  paymentTerms: string;
  contractTerms: string;
  /** Web satış kartı — ödeme vadesi (gün). */
  paymentTermDays: string;
  ownerUserId: string;
};

/** Kapanış tarihi gün olarak saklanır; yerel takvim günü gönderilir. */
function dayString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(value: string | null | undefined): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

type OpportunityProductRow = {
  productModelId?: string | null;
  machineName?: string | null;
  quantity?: number | string | null;
};

function machinesFromDetail(data: {
  requestedMachine?: string | null;
  products?: OpportunityProductRow[] | null;
}): MachineRow[] {
  const products = Array.isArray(data.products) ? data.products : [];
  if (products.length) {
    return products.map((row, index) => ({
      key: `m-${index}-${row.productModelId ?? row.machineName ?? index}`,
      productModelId: row.productModelId ?? '',
      product: row.machineName ?? '',
      quantity: String(Number(row.quantity) > 0 ? Number(row.quantity) : 1),
    }));
  }
  if (data.requestedMachine?.trim()) {
    return [
      {
        key: 'm-primary',
        productModelId: '',
        product: data.requestedMachine.trim(),
        quantity: '1',
      },
    ];
  }
  return [{ key: 'm-empty', productModelId: '', product: '', quantity: '1' }];
}

/** Fırsat kartının ticari alanları + çoklu makine (web OpportunityMachines). */
export default function OpportunityEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const opportunityId = typeof id === 'string' ? id : '';
  const { user } = useAuth();
  const canUpdate = useCan('opportunities.update');
  const detail = useOpportunity(opportunityId);
  const update = useUpdateOpportunity();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'machines', string>>>({});
  const loaded = useRef(false);
  const canAssignOthers = user?.roles?.some((role) => role === 'super_admin' || role === 'sales') ?? false;

  useEffect(() => {
    const data = detail.data;
    if (!data || loaded.current) return;
    loaded.current = true;
    const currency = (CURRENCIES as readonly string[]).includes(data.currency?.code ?? '')
      ? (data.currency!.code as Currency)
      : 'USD';
    setForm({
      title: data.title ?? '',
      machines: machinesFromDetail(data as { requestedMachine?: string | null; products?: OpportunityProductRow[] }),
      estimatedValue: data.estimatedValue != null ? String(Number(data.estimatedValue)) : '',
      currencyCode: currency,
      probability: String(data.probability ?? 50),
      expectedCloseDate: parseDay(data.expectedCloseDate),
      description: data.description ?? '',
      paymentTerms: data.paymentTerms ?? '',
      contractTerms: data.contractTerms ?? '',
      paymentTermDays: data.paymentTermDays != null ? String(data.paymentTermDays) : '',
      ownerUserId: data.ownerUserId ?? '',
    });
  }, [detail.data]);

  if (!canUpdate || !opportunityId) return <Redirect href={'/(tabs)/modules/opportunities' as Href} />;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined, machines: undefined }));
  };

  function patchMachine(key: string, patch: Partial<MachineRow>) {
    setForm((current) =>
      current
        ? {
            ...current,
            machines: current.machines.map((row) => (row.key === key ? { ...row, ...patch } : row)),
          }
        : current
    );
  }

  function submit() {
    if (!form) return;
    const next: Partial<Record<keyof Form | 'machines', string>> = {};
    if (!form.title.trim()) next.title = 'Başlık zorunludur.';
    const filledMachines = form.machines.filter((row) => row.product.trim());
    if (!filledMachines.length) next.machines = 'En az bir makine girin.';
    const value = form.estimatedValue.trim() ? Number(form.estimatedValue.replace(',', '.')) : null;
    if (value !== null && (!Number.isFinite(value) || value < 0)) next.estimatedValue = 'Pozitif bir tutar girin.';
    const probability = Number(form.probability);
    if (!Number.isInteger(probability) || probability < 0 || probability > 100) next.probability = '0-100 arası bir oran girin.';
    const termDays = form.paymentTermDays.trim() ? Number(form.paymentTermDays) : null;
    if (termDays !== null && (!Number.isInteger(termDays) || termDays < 0 || termDays > 3650)) {
      next.paymentTermDays = '0–3650 gün arası girin.';
    }
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      return;
    }
    const products = filledMachines.map((row) => ({
      ...(row.productModelId ? { productModelId: row.productModelId } : {}),
      machineName: row.product.trim(),
      quantity: quantityOf(row.quantity) || 1,
    }));
    update.mutate(
      {
        id: opportunityId,
        title: form.title.trim(),
        requestedMachine: products[0]?.machineName ?? '',
        products,
        ...(value !== null ? { estimatedValue: value } : {}),
        currencyCode: form.currencyCode,
        probability,
        ...(form.expectedCloseDate ? { expectedCloseDate: dayString(form.expectedCloseDate) } : {}),
        description: form.description.trim(),
        paymentTerms: form.paymentTerms.trim(),
        contractTerms: form.contractTerms.trim(),
        paymentTermDays: termDays,
        ownerUserId: form.ownerUserId.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success('Fırsat güncellendi');
          router.back();
        },
        onError: (error) => toast.error(`Fırsat güncellenemedi: ${error.message}`),
      }
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Fırsatı Düzenle', headerShown: true }} />
      {detail.isPending ? (
        <Loading />
      ) : detail.error || !form ? (
        <ErrorState message={detail.error?.message ?? 'Kayıt yüklenemedi.'} onRetry={() => void detail.refetch()} />
      ) : (
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerClassName="gap-5 p-4 pb-10" keyboardShouldPersistTaps="handled">
            <View className="gap-3">
              <Eyebrow>Kart</Eyebrow>
              <Field label="Başlık *" value={form.title} onChangeText={(v) => set('title', v)} maxLength={255} error={errors.title} />
              <Field label="Açıklama" value={form.description} onChangeText={(v) => set('description', v)} maxLength={4000} multiline numberOfLines={4} />
            </View>
            <View className="gap-3">
              <Eyebrow>Makineler</Eyebrow>
              {errors.machines ? <Text className="font-inter text-xs text-destructive">{errors.machines}</Text> : null}
              {form.machines.map((machine, index) => (
                <View key={machine.key} className="gap-2 rounded-control border border-border bg-card p-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-inter-medium text-xs text-muted-foreground">
                      {index === 0 ? 'Birincil makine' : `Ek makine ${index}`}
                    </Text>
                    {form.machines.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Makineyi kaldır"
                        onPress={() => set('machines', form.machines.filter((row) => row.key !== machine.key))}
                        className="min-h-11 px-2"
                      >
                        <Text className="font-inter-semibold text-xs text-destructive">Kaldır</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View className="flex-row gap-2">
                    <View className="flex-[3]">
                      <ProductSelect
                        label="Makine"
                        value={machine.product}
                        selectedId={machine.productModelId}
                        categoryCode="TEZGAH"
                        clearable
                        placeholder="Katalogdan arayın veya yazın"
                        onSelect={(item) =>
                          patchMachine(machine.key, {
                            productModelId: item?.id ?? '',
                            product: item?.label ?? '',
                          })
                        }
                      />
                    </View>
                    <View className="w-[72px]">
                      <Field
                        label="Adet"
                        value={machine.quantity}
                        onChangeText={(quantity) => patchMachine(machine.key, { quantity: quantity.replace(/\D/g, '') })}
                        keyboardType="number-pad"
                        maxLength={3}
                      />
                    </View>
                  </View>
                </View>
              ))}
              <Button
                label="Makine Ekle"
                variant="ghost"
                trailingIcon="add"
                onPress={() => set('machines', [...form.machines, emptyExtraMachine()])}
              />
            </View>
            <View className="gap-3">
              <Eyebrow>Ticari</Eyebrow>
              <Field
                label="Tahmini tutar"
                value={form.estimatedValue}
                onChangeText={(v) => set('estimatedValue', v)}
                keyboardType="decimal-pad"
                error={errors.estimatedValue}
              />
              <View className="gap-1.5">
                <Text className="font-inter-medium text-xs text-muted-foreground">Para birimi</Text>
                <View className="flex-row gap-2">
                  {CURRENCIES.map((code) => {
                    const active = form.currencyCode === code;
                    return (
                      <Pressable
                        key={code}
                        accessibilityRole="radio"
                        accessibilityLabel={code}
                        accessibilityState={{ selected: active }}
                        onPress={() => set('currencyCode', code)}
                        className={`min-h-11 flex-1 items-center justify-center rounded-control border ${active ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
                      >
                        <Text className={`font-inter-semibold text-xs ${active ? 'text-primary' : 'text-foreground'}`}>{code}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Field
                label="Olasılık (%)"
                value={form.probability}
                onChangeText={(v) => set('probability', v)}
                keyboardType="number-pad"
                error={errors.probability}
              />
              <DateTimeField
                label="Beklenen kapanış"
                mode="date"
                value={form.expectedCloseDate}
                onChange={(v) => set('expectedCloseDate', v)}
                placeholder="Tarih seçin"
                clearable
              />
              <Field
                label="Ödeme vadesi (gün)"
                value={form.paymentTermDays}
                onChangeText={(v) => set('paymentTermDays', v.replace(/\D/g, ''))}
                keyboardType="number-pad"
                placeholder="Örn. 60"
                maxLength={4}
                error={errors.paymentTermDays}
              />
              <AssigneeSelect
                label="Sorumlu"
                value={form.ownerUserId}
                onChange={(ownerUserId) => set('ownerUserId', ownerUserId)}
                divisionId={typeof detail.data?.divisionId === 'string' ? detail.data.divisionId : null}
                onlyUserId={canAssignOthers ? null : user?.id}
                clearable
              />
            </View>
            <View className="gap-3">
              <Eyebrow>Şartlar</Eyebrow>
              <Field label="Ödeme şartları" value={form.paymentTerms} onChangeText={(v) => set('paymentTerms', v)} maxLength={2000} multiline numberOfLines={3} />
              <Field label="Sözleşme şartları" value={form.contractTerms} onChangeText={(v) => set('contractTerms', v)} maxLength={4000} multiline numberOfLines={3} />
            </View>
          </ScrollView>
          <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
            <View className="flex-1"><Button label="Vazgeç" variant="ghost" onPress={() => router.back()} /></View>
            <View className="flex-[2]"><Button label="Kaydet" loading={update.isPending} onPress={submit} /></View>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
