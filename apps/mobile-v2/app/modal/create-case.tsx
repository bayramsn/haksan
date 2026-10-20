/**
 * Yeni Fırsat / Yeni Kart — web CreateCaseDialog alan sırası ve etiketleri.
 */
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCreateOpportunity } from '@/src/api/crm.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { Button, Card, Eyebrow, Field } from '@/src/ui';
import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { SearchSelect } from '@/src/ui/select/SearchSelect';
import {
  AssigneeSelect,
  CompanySelect,
  ProductSelect,
  companyLabel,
} from '@/src/ui/select/fields';
import { emptyExtraMachine, quantityOf } from '@/src/ui/sales/quick-opportunity';
import { toast } from '@/src/ui/toast';

const CURRENCIES = ['EUR', 'USD', 'TRY'] as const;
type Currency = (typeof CURRENCIES)[number];

type MachineRow = { key: string; productModelId: string; product: string; quantity: string };

type Form = {
  companyId: string;
  companyTitle: string;
  machines: MachineRow[];
  requestedModel: string;
  description: string;
  quantity: string;
  estimatedValue: string;
  probability: string;
  expectedCloseDate: Date | null;
  paymentTermDays: string;
  currencyCode: Currency;
  divisionId: string;
  ownerUserId: string;
};

function param(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function parseAmount(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export default function CreateCaseScreen() {
  const router = useRouter();
  const { user, scope } = useAuth();
  const params = useLocalSearchParams<{ companyId?: string; companyName?: string }>();
  const canCreate = useCan('opportunities.create');
  const create = useCreateOpportunity();

  const divisions = useMemo(() => user?.divisions ?? [], [user?.divisions]);
  const defaultDivision =
    (scope.divisionId && divisions.some((d) => d.id === scope.divisionId) ? scope.divisionId : null) ??
    divisions.find((d) => d.isPrimary)?.id ??
    divisions[0]?.id ??
    '';
  const canPickDivision = divisions.length > 1;
  const canAssignOthers = user?.roles?.some((role) => role === 'super_admin' || role === 'sales') ?? false;
  const isSuperAdmin = user?.roles?.includes('super_admin') ?? false;

  const [form, setForm] = useState<Form>(() => ({
    companyId: param(params.companyId),
    companyTitle: param(params.companyName),
    machines: [{ key: 'm-primary', productModelId: '', product: '', quantity: '1' }],
    requestedModel: '',
    description: '',
    quantity: '1',
    estimatedValue: '',
    probability: '50',
    expectedCloseDate: null,
    paymentTermDays: '',
    currencyCode: 'USD',
    divisionId: defaultDivision,
    ownerUserId: user?.id ?? '',
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'machines', string>>>({});

  useEffect(() => {
    if (!isSuperAdmin && user?.id && form.ownerUserId !== user.id) {
      setForm((current) => ({ ...current, ownerUserId: user.id }));
    }
  }, [user?.id, isSuperAdmin, form.ownerUserId]);

  if (!canCreate) return <Redirect href={'/(tabs)/modules/opportunities' as Href} />;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, machines: undefined }));
  };

  function patchMachine(key: string, patch: Partial<MachineRow>) {
    setForm((current) => ({
      ...current,
      machines: current.machines.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));
    setErrors((current) => ({ ...current, machines: undefined }));
  }

  function addMachineFromProduct(item: { id?: string; label?: string; data?: { cashPrice?: string | number | null; listPrice?: string | number | null; currency?: { code?: string } | null; model?: string | null } } | null) {
    if (!item?.label?.trim()) return;
    const name = item.label.trim();
    setForm((current) => {
      if (current.machines.some((row) => row.product.trim().toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) {
        return current;
      }
      const product = item.data;
      const unitRaw = product?.cashPrice ?? product?.listPrice ?? null;
      const unit = unitRaw != null ? Number(unitRaw) : NaN;
      const isFirst = !current.machines.some((row) => row.product.trim());
      const nextMachines = isFirst && current.machines.length === 1 && !current.machines[0]?.product.trim()
        ? [{ key: current.machines[0]!.key, productModelId: item.id ?? '', product: name, quantity: '1' }]
        : [...current.machines.filter((row) => row.product.trim()), { key: `m-${Date.now()}`, productModelId: item.id ?? '', product: name, quantity: '1' }];
      const currency =
        isFirst && product?.currency?.code && (CURRENCIES as readonly string[]).includes(product.currency.code)
          ? (product.currency.code as Currency)
          : current.currencyCode;
      const amount =
        isFirst && Number.isFinite(unit) && !current.estimatedValue.trim()
          ? String(unit * (quantityOf(current.quantity) || 1))
          : current.estimatedValue;
      return {
        ...current,
        machines: nextMachines,
        requestedModel: isFirst ? product?.model ?? current.requestedModel : current.requestedModel,
        estimatedValue: amount,
        currencyCode: currency,
      };
    });
  }

  function submit() {
    const next: Partial<Record<keyof Form | 'machines', string>> = {};
    if (!form.companyId) next.companyId = 'Müşteri seçiniz';
    const filled = form.machines.filter((row) => row.product.trim());
    if (!filled.length) next.machines = 'En az bir makine seçiniz';
    if (canPickDivision && !form.divisionId) next.divisionId = 'Bölüm seçiniz';
    const amount = parseAmount(form.estimatedValue);
    if (Number.isNaN(amount)) next.estimatedValue = 'Sayısal bir tutar girin.';
    const probability = Number(form.probability);
    if (!Number.isInteger(probability) || probability < 0 || probability > 100) {
      next.probability = '0–100 arası bir oran girin.';
    }
    const termDays = form.paymentTermDays.trim() ? Number(form.paymentTermDays) : null;
    if (termDays !== null && (!Number.isInteger(termDays) || termDays < 0 || termDays > 3650)) {
      next.paymentTermDays = '0–3650 gün arası girin.';
    }
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      toast.error(Object.values(next)[0] ?? 'Eksik bilgi');
      return;
    }

    const primary = filled[0]!;
    const qty = quantityOf(form.quantity) || 1;
    const products = filled.map((row, index) => ({
      ...(row.productModelId ? { productModelId: row.productModelId } : {}),
      machineName: row.product.trim(),
      quantity: index === 0 ? qty : quantityOf(row.quantity) || 1,
    }));
    const title = form.requestedModel.trim()
      ? `${primary.product.trim()} ${form.requestedModel.trim()}`.trim()
      : primary.product.trim();

    create.mutate(
      {
        title,
        companyId: form.companyId,
        requestedMachine: primary.product.trim(),
        products,
        description: [
          form.description.trim() || null,
          form.requestedModel.trim() ? `Model: ${form.requestedModel.trim()}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        ...(amount != null ? { estimatedValue: amount } : {}),
        currencyCode: form.currencyCode,
        probability,
        ...(form.expectedCloseDate
          ? {
              expectedCloseDate: `${form.expectedCloseDate.getFullYear()}-${String(form.expectedCloseDate.getMonth() + 1).padStart(2, '0')}-${String(form.expectedCloseDate.getDate()).padStart(2, '0')}`,
            }
          : {}),
        ...(termDays != null ? { paymentTermDays: termDays } : {}),
        ...(form.divisionId ? { divisionId: form.divisionId } : {}),
        ...(form.ownerUserId ? { ownerUserId: form.ownerUserId } : {}),
      },
      {
        onSuccess: (created) => {
          toast.success('Fırsat oluşturuldu');
          router.replace(`/(tabs)/modules/opportunities/${created.id}` as Href);
        },
        onError: (error) => toast.error(`Satış kartı oluşturulamadı: ${error.message}`),
      }
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Yeni Fırsat', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-3 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-[13px] leading-[18px] text-muted-foreground">
            Seçilen firma için ilk C alanında bir satış fırsatı oluşturun.
          </Text>

          <Card className="gap-3">
            <Eyebrow>Müşteri ve makineler</Eyebrow>
            <CompanySelect
              label="Müşteri *"
              value={form.companyTitle}
              selectedId={form.companyId || null}
              clearable
              placeholder="Firma seçin veya adını yazın..."
              searchPlaceholder="Firma adı / şehir ara..."
              error={errors.companyId}
              onSelect={(item) => {
                const company = item?.data;
                if (!item || !company) {
                  setForm((current) => ({ ...current, companyId: '', companyTitle: '' }));
                  return;
                }
                setForm((current) => ({
                  ...current,
                  companyId: company.id,
                  companyTitle: companyLabel(company),
                }));
                setErrors((current) => ({ ...current, companyId: undefined }));
              }}
            />
            <ProductSelect
              label="Talep Edilen Makineler *"
              value=""
              selectedId={null}
              categoryCode="TEZGAH"
              allowCustom
              clearable
              placeholder="Tezgah seçin veya yazın..."
              error={errors.machines}
              onSelect={(item) => {
                if (!item) return;
                addMachineFromProduct(item.data ? item : { label: item.label });
              }}
            />
            {form.machines.filter((row) => row.product.trim()).map((machine) => (
              <View key={machine.key} className="flex-row items-center gap-2 rounded-control border border-border bg-muted/30 px-3 py-2">
                <Text className="min-w-0 flex-1 font-inter text-sm text-foreground" numberOfLines={1}>
                  {machine.product}
                </Text>
                <View className="w-16">
                  <Field
                    label=""
                    value={machine.quantity}
                    onChangeText={(quantity) => patchMachine(machine.key, { quantity: quantity.replace(/\D/g, '') })}
                    keyboardType="number-pad"
                    maxLength={3}
                    accessibilityLabel={`${machine.product} adedi`}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Kaldır"
                  onPress={() =>
                    set(
                      'machines',
                      form.machines.filter((row) => row.key !== machine.key).length
                        ? form.machines.filter((row) => row.key !== machine.key)
                        : [emptyExtraMachine()]
                    )
                  }
                  className="min-h-11 px-2"
                >
                  <Text className="font-inter-semibold text-xs text-destructive">Kaldır</Text>
                </Pressable>
              </View>
            ))}
            <Field
              label="Model"
              value={form.requestedModel}
              onChangeText={(requestedModel) => set('requestedModel', requestedModel)}
              placeholder="Model elle girilebilir"
              maxLength={255}
            />
            <Field
              label="Fırsat açıklaması"
              value={form.description}
              onChangeText={(description) => set('description', description)}
              placeholder="İhtiyaç, kullanım amacı ve ticari notlar"
              multiline
              numberOfLines={3}
              maxLength={4000}
              className="min-h-[72px] rounded-control border border-transparent bg-input-background px-3.5 py-2.5 font-inter text-base text-foreground"
            />
          </Card>

          <Card className="gap-3">
            <Eyebrow>Ticari</Eyebrow>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Field
                  label="Adet"
                  value={form.quantity}
                  onChangeText={(quantity) => set('quantity', quantity.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
              <View className="flex-[2]">
                <Field
                  label="Tahmini Tutar"
                  value={form.estimatedValue}
                  onChangeText={(estimatedValue) => set('estimatedValue', estimatedValue)}
                  keyboardType="decimal-pad"
                  error={errors.estimatedValue}
                />
              </View>
            </View>
            <Field
              label="Kazanma Olasılığı (%)"
              value={form.probability}
              onChangeText={(probability) => set('probability', probability.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={3}
              error={errors.probability}
            />
            <DateTimeField
              label="Hedef Kapanış Tarihi"
              mode="date"
              value={form.expectedCloseDate}
              onChange={(expectedCloseDate) => set('expectedCloseDate', expectedCloseDate)}
              placeholder="Tarih seçin"
              clearable
            />
            <Field
              label="Vade (gün)"
              value={form.paymentTermDays}
              onChangeText={(paymentTermDays) => set('paymentTermDays', paymentTermDays.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="Örn. 90"
              maxLength={4}
              error={errors.paymentTermDays}
            />
            <View className="gap-1.5">
              <Text className="font-inter-medium text-xs text-muted-foreground">Para Birimi</Text>
              <View className="flex-row gap-2">
                {CURRENCIES.map((code) => {
                  const active = form.currencyCode === code;
                  return (
                    <Pressable
                      key={code}
                      accessibilityRole="radio"
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
            {isSuperAdmin ? (
              <AssigneeSelect
                label="Atanan Kullanıcı"
                value={form.ownerUserId}
                onChange={(ownerUserId) => set('ownerUserId', ownerUserId)}
                divisionId={form.divisionId || null}
                clearable
              />
            ) : null}
            {canPickDivision ? (
              <SearchSelect
                label="Bölüm *"
                placeholder="Bölüm seçin (CNC / Üniversal / Sac)..."
                icon="git-branch-outline"
                value={divisions.find((d) => d.id === form.divisionId)?.name ?? ''}
                selectedId={form.divisionId}
                options={divisions.map((d) => ({ id: d.id, label: d.name }))}
                onSelect={(item) => set('divisionId', item?.id ?? '')}
                error={errors.divisionId}
              />
            ) : null}
          </Card>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1">
            <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} disabled={create.isPending} />
          </View>
          <View className="flex-[2]">
            <Button
              label={create.isPending ? 'Oluşturuluyor...' : 'Fırsatı Oluştur'}
              loading={create.isPending}
              onPress={submit}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
