import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCompany } from '@/src/api/companies.hooks';
import { useCreateOpportunity } from '@/src/api/crm.hooks';
import { useCreateOpportunityFromActivity } from '@/src/api/sales.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { Button, Card, Eyebrow, Field } from '@/src/ui';
import { CompanyPicker, ContactPicker } from '@/src/ui/pickers/CompanyPicker';
import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { SearchSelect } from '@/src/ui/select/SearchSelect';
import {
  AssigneeSelect,
  DistrictSelect,
  LookupSelect,
  ProductSelect,
  ProvinceSelect,
} from '@/src/ui/select/fields';
import {
  buildQuickOpportunityBody,
  quickOpportunityTitle,
  validateQuickOpportunity,
  type QuickOpportunityErrors,
  type QuickOpportunityForm,
} from '@/src/ui/sales/quick-opportunity';
import { toast } from '@/src/ui/toast';

const CURRENCIES = ['TRY', 'USD', 'EUR'] as const;

function param(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Hızlı fırsat — web LeadCaptureDialog.
 * Firma/kontak: kanıtlanmış CompanyPicker/ContactPicker + elle yazılabilir alanlar.
 */
export default function NewOpportunityScreen() {
  const router = useRouter();
  const { user, scope } = useAuth();
  const params = useLocalSearchParams<{ activityId?: string; companyId?: string; companyName?: string; title?: string }>();
  const activityId = param(params.activityId) || null;
  const canCreate = useCan('opportunities.create');
  const canConvertActivity = useCan('activities.convert');
  const create = useCreateOpportunity();
  const createFromActivity = useCreateOpportunityFromActivity();

  const divisions = useMemo(() => user?.divisions ?? [], [user?.divisions]);
  const defaultDivision =
    (scope.divisionId && divisions.some((d) => d.id === scope.divisionId) ? scope.divisionId : null) ??
    divisions.find((d) => d.isPrimary)?.id ??
    divisions[0]?.id ??
    '';
  const canAssignOthers = user?.roles?.some((role) => role === 'super_admin' || role === 'sales') ?? false;

  const [form, setForm] = useState<QuickOpportunityForm>(() => ({
    companyId: param(params.companyId),
    companyTitle: param(params.companyName),
    contactId: '',
    contactName: '',
    phone: '',
    email: '',
    city: '',
    district: '',
    contactMethod: '',
    productModelId: '',
    product: '',
    quantity: '1',
    title: param(params.title),
    estimatedValue: '',
    currencyCode: 'USD',
    probability: '50',
    expectedCloseDate: null,
    nextAction: '',
    nextActionAt: null,
    description: '',
    divisionId: defaultDivision,
    ownerUserId: '',
  }));
  const [errors, setErrors] = useState<QuickOpportunityErrors>({});

  function patch(next: Partial<QuickOpportunityForm>) {
    setForm((prev) => ({ ...prev, ...next }));
    setErrors((prev) => {
      const cleared = { ...prev };
      for (const key of Object.keys(next) as (keyof QuickOpportunityForm)[]) delete cleared[key];
      if ('email' in next) delete cleared.phone;
      if ('companyId' in next || 'contactName' in next) delete cleared.contactName;
      return cleared;
    });
  }

  const selectedCompany = useCompany(form.companyId || '');
  useEffect(() => {
    const company = selectedCompany.data;
    if (!company || !form.companyId || company.id !== form.companyId) return;
    const address = company.addresses.find((a) => a.isDefault) ?? company.addresses[0];
    const phone = company.phones.find((p) => p.isDefault) ?? company.phones[0];
    const email = company.emails.find((e) => e.isDefault) ?? company.emails[0];
    setForm((prev) => ({
      ...prev,
      companyTitle: company.shortName ?? company.legalTitle,
      city: prev.city.trim() ? prev.city : address?.province || '',
      district: prev.district.trim() ? prev.district : address?.district || '',
      phone: prev.phone.trim() ? prev.phone : phone?.phone || '',
      email: prev.email.trim() ? prev.email : email?.email || '',
    }));
  }, [form.companyId, selectedCompany.data]);

  if (activityId ? !canConvertActivity : !canCreate) return <Redirect href={'/(tabs)/modules/opportunities' as Href} />;

  const pending = create.isPending || createFromActivity.isPending;
  const companyPick = form.companyId ? { id: form.companyId, name: form.companyTitle || 'Firma' } : null;
  const contactPick = form.contactId ? { id: form.contactId, name: form.contactName || 'Kontak' } : null;

  function submit() {
    const nextErrors = validateQuickOpportunity(form, divisions.length > 0);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error(Object.values(nextErrors)[0] ?? 'Eksik bilgi');
      return;
    }
    const body = buildQuickOpportunityBody(form);
    if (activityId) {
      createFromActivity.mutate(
        { activityId, body: { ...body, sourceActivityId: activityId } },
        {
          onSuccess: (created) => {
            toast.success('Aktiviteden fırsat oluşturuldu');
            router.replace(`/(tabs)/modules/opportunities/${created.id}` as Href);
          },
          onError: (error) => toast.error(`Fırsat oluşturulamadı: ${error.message}`),
        }
      );
      return;
    }
    create.mutate(body, {
      onSuccess: () => {
        toast.success(`Fırsat oluşturuldu: ${body.title}`);
        router.back();
      },
      onError: (error) => toast.error(`Fırsat oluşturulamadı: ${error.message}`),
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: activityId ? 'Aktiviteden Fırsat' : 'Hızlı Fırsat', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-3 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-[13px] leading-[18px] text-muted-foreground">
            Kayıtlı firma/kontak seçin veya yazın. Telefon veya e-postadan en az biri zorunlu.
          </Text>

          <Card className="gap-3">
            <Eyebrow>1 · Firma ve kontak</Eyebrow>
            <CompanyPicker
              label="Firma (kayıtlı)"
              value={companyPick}
              placeholder="CRM’den firma seçin"
              clearable
              onChange={(next) => {
                if (!next) {
                  return patch({
                    companyId: '',
                    contactId: '',
                    contactName: '',
                    phone: '',
                    email: '',
                    city: '',
                    district: '',
                  });
                }
                patch({
                  companyId: next.id,
                  companyTitle: next.name,
                  contactId: '',
                  contactName: '',
                });
              }}
            />
            {!form.companyId ? (
              <Field
                label="veya firma ünvanı yazın"
                value={form.companyTitle}
                onChangeText={(companyTitle) => patch({ companyTitle, companyId: '', contactId: '' })}
                placeholder="Kayıtsız firma ünvanı"
                maxLength={255}
              />
            ) : (
              <Text className="font-inter text-[11px] text-muted-foreground">Kayıtlı firma bağlandı: {form.companyTitle}</Text>
            )}

            {form.companyId ? (
              <ContactPicker
                label="Kontak (kayıtlı)"
                companyId={form.companyId}
                value={contactPick}
                placeholder="Firmanın kontağını seçin"
                onChange={(next) => {
                  if (!next) return patch({ contactId: '', contactName: '' });
                  patch({
                    contactId: next.id,
                    contactName: next.name,
                    phone: next.phone || form.phone,
                    email: next.email || form.email,
                  });
                }}
              />
            ) : null}
            <Field
              label={form.companyId ? 'Kontak ismi (opsiyonel / elle)' : 'Kontak ismi *'}
              value={form.contactName}
              onChangeText={(contactName) => patch({ contactName, contactId: contactName !== form.contactName ? '' : form.contactId })}
              placeholder={form.companyId ? 'veya isim yazın' : 'Ahmet Yılmaz'}
              error={errors.contactName}
              maxLength={200}
            />

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Field
                  label="Telefon *"
                  value={form.phone}
                  onChangeText={(phone) => patch({ phone })}
                  keyboardType="phone-pad"
                  placeholder="05xx…"
                  maxLength={64}
                  error={errors.phone}
                />
              </View>
              <View className="flex-1">
                <Field
                  label="E-posta *"
                  value={form.email}
                  onChangeText={(email) => patch({ email })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="ornek@…"
                  maxLength={254}
                  error={errors.email}
                />
              </View>
            </View>
            <Text className="font-inter text-[11px] text-muted-foreground">Telefon veya e-postadan en az biri yeterlidir.</Text>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <ProvinceSelect
                  label="İl *"
                  value={form.city}
                  onChange={(city) => patch({ city, district: city === form.city ? form.district : '' })}
                  error={errors.city}
                />
              </View>
              <View className="flex-1">
                <DistrictSelect label="İlçe" province={form.city} value={form.district} onChange={(district) => patch({ district })} />
              </View>
            </View>
            <LookupSelect
              name="contact-sources"
              label="İrtibat şekli"
              placeholder="Opsiyonel"
              icon="call-outline"
              value={form.contactMethod}
              onChange={(contactMethod) => patch({ contactMethod })}
            />
          </Card>

          <Card className="gap-3">
            <Eyebrow>2 · Talep</Eyebrow>
            <View className="flex-row gap-2">
              <View className="flex-[3]">
                <ProductSelect
                  label="İstenen ürün *"
                  value={form.product}
                  selectedId={form.productModelId}
                  clearable
                  placeholder="Katalogdan seçin veya yazın"
                  error={errors.product}
                  onSelect={(item) => patch({ productModelId: item?.id ?? '', product: item?.label ?? '' })}
                />
              </View>
              <View className="w-[72px]">
                <Field
                  label="Adet"
                  value={form.quantity}
                  onChangeText={(quantity) => patch({ quantity: quantity.replace(/\D/g, '') })}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
            </View>
            <Field
              label="Kart başlığı"
              value={form.title}
              onChangeText={(title) => patch({ title })}
              placeholder={quickOpportunityTitle({ ...form, title: '' }) || 'Boşsa ürün + adetten oluşur'}
              maxLength={255}
            />
          </Card>

          <Card className="gap-3">
            <Eyebrow>3 · Ticari (opsiyonel)</Eyebrow>
            <View className="flex-row gap-2">
              <View className="flex-[2]">
                <Field
                  label="Tahmini tutar"
                  value={form.estimatedValue}
                  onChangeText={(estimatedValue) => patch({ estimatedValue })}
                  keyboardType="decimal-pad"
                  error={errors.estimatedValue}
                />
              </View>
              <View className="flex-1 justify-end gap-1">
                <Text className="font-inter-medium text-[13px] text-muted-foreground">Para birimi</Text>
                <View className="min-h-12 flex-row gap-1">
                  {CURRENCIES.map((code) => (
                    <Pressable
                      key={code}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: form.currencyCode === code }}
                      onPress={() => patch({ currencyCode: code })}
                      className={`flex-1 items-center justify-center rounded-control border ${form.currencyCode === code ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
                    >
                      <Text className={`font-inter-semibold text-[11px] ${form.currencyCode === code ? 'text-primary' : 'text-foreground'}`}>{code}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <View className="flex-row gap-2">
              <View className="w-[88px]">
                <Field
                  label="Olasılık %"
                  value={form.probability}
                  onChangeText={(probability) => patch({ probability: probability.replace(/\D/g, '') })}
                  keyboardType="number-pad"
                  maxLength={3}
                  error={errors.probability}
                />
              </View>
              <View className="flex-1">
                <DateTimeField
                  label="Beklenen kapanış"
                  mode="date"
                  value={form.expectedCloseDate}
                  onChange={(expectedCloseDate) => patch({ expectedCloseDate })}
                  placeholder="Tarih"
                  clearable
                />
              </View>
            </View>
          </Card>

          <Card className="gap-3">
            <Eyebrow>4 · Takip ve atama</Eyebrow>
            <Field
              label="İlk takip aksiyonu"
              value={form.nextAction}
              onChangeText={(nextAction) => patch({ nextAction })}
              placeholder="Örn. Satın alma müdürünü ara"
              maxLength={1000}
              error={errors.nextAction}
            />
            <DateTimeField
              label="Takip zamanı"
              value={form.nextActionAt}
              onChange={(nextActionAt) => patch({ nextActionAt })}
              placeholder="Tarih ve saat"
              clearable
            />
            <Field
              label="Not"
              value={form.description}
              onChangeText={(description) => patch({ description })}
              multiline
              numberOfLines={3}
              maxLength={3000}
              className="min-h-[72px] rounded-control border border-transparent bg-input-background px-3.5 py-2.5 font-inter text-base text-foreground"
            />
            {divisions.length > 1 ? (
              <SearchSelect
                label="Bölüm *"
                placeholder="Bölüm seçin"
                icon="git-branch-outline"
                value={divisions.find((d) => d.id === form.divisionId)?.name ?? ''}
                selectedId={form.divisionId}
                options={divisions.map((d) => ({ id: d.id, label: d.name }))}
                onSelect={(item) => patch({ divisionId: item?.id ?? '', ownerUserId: '' })}
                error={errors.divisionId}
              />
            ) : null}
            <AssigneeSelect
              value={form.ownerUserId}
              onChange={(ownerUserId) => patch({ ownerUserId })}
              divisionId={form.divisionId || null}
              onlyUserId={canAssignOthers ? null : user?.id ?? null}
            />
          </Card>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1">
            <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} />
          </View>
          <View className="flex-[2]">
            <Button label="Fırsatı Oluştur" loading={pending} onPress={submit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
