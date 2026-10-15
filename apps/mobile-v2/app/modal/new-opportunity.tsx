import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCompany } from '@/src/api/companies.hooks';
import { useCreateOpportunity } from '@/src/api/crm.hooks';
import { useCreateOpportunityFromActivity } from '@/src/api/sales.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { Button, Eyebrow, Field } from '@/src/ui';
import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { SearchSelect } from '@/src/ui/select/SearchSelect';
import {
  AssigneeSelect,
  CompanySelect,
  ContactSelect,
  DistrictSelect,
  LookupSelect,
  ProductSelect,
  ProvinceSelect,
  companyLabel,
  contactEmail,
  contactPhone,
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
 * Hızlı fırsat (web LeadCaptureDialog karşılığı). Firma, kontak, ürün, il/ilçe,
 * irtibat şekli, bölüm ve sorumlu veritabanındaki listelerden aranarak seçilir;
 * listede olmayan firma/kontak/ürün yine yazılabilir ve lead alanlarında kalır.
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
      if ('companyId' in next) delete cleared.contactName;
      return cleared;
    });
  }

  // Firma rotadan geldiyse (firma detayı → yeni fırsat) iletişim alanlarını kayıttan doldur.
  const routeCompany = useCompany(param(params.companyId));
  useEffect(() => {
    const company = routeCompany.data;
    if (!company) return;
    const address = company.addresses.find((a) => a.isDefault) ?? company.addresses[0];
    const phone = company.phones.find((p) => p.isDefault) ?? company.phones[0];
    const email = company.emails.find((e) => e.isDefault) ?? company.emails[0];
    setForm((prev) => ({
      ...prev,
      companyTitle: prev.companyTitle || (company.shortName ?? company.legalTitle),
      city: prev.city || address?.province || '',
      district: prev.district || address?.district || '',
      phone: prev.phone || phone?.phone || '',
      email: prev.email || email?.email || '',
    }));
  }, [routeCompany.data]);

  if (activityId ? !canConvertActivity : !canCreate) return <Redirect href={'/(tabs)/modules/opportunities' as Href} />;

  const pending = create.isPending || createFromActivity.isPending;

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
        <ScrollView contentContainerClassName="gap-6 p-4 pb-10" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-sm text-muted-foreground">
            Talebi fırsatın ilk C alanına kaydedin. Firma ve kontak kayıtlı listeden seçilebilir; listede yoksa yazabilirsiniz.
          </Text>

          <View className="gap-3">
            <Eyebrow>Firma ve kontak</Eyebrow>
            <CompanySelect
              label="Firma"
              value={form.companyTitle}
              selectedId={form.companyId}
              allowCustom
              clearable
              placeholder="Kayıtlı firmadan seçin veya yazın"
              onSelect={(item) => {
                const company = item?.data;
                if (!item) return patch({ companyId: '', companyTitle: '', contactId: '' });
                if (!company) return patch({ companyId: '', companyTitle: item.label, contactId: '' });
                patch({
                  companyId: company.id,
                  companyTitle: companyLabel(company),
                  contactId: '',
                  city: form.city || company.primaryAddress?.province || '',
                  district: form.district || company.primaryAddress?.district || '',
                  phone: form.phone || company.primaryPhone || '',
                  email: form.email || company.primaryEmail || '',
                });
              }}
            />
            <ContactSelect
              label={form.companyId ? 'Kontak' : 'Kontak ismi *'}
              companyId={form.companyId || null}
              value={form.contactName}
              selectedId={form.contactId}
              allowCustom
              clearable
              placeholder={form.companyId ? 'Firmanın kontağını seçin veya yazın' : 'Kontak ismini yazın'}
              error={errors.contactName}
              onSelect={(item) => {
                const contact = item?.data;
                if (!item) return patch({ contactId: '', contactName: '' });
                if (!contact) return patch({ contactId: '', contactName: item.label });
                patch({
                  contactId: contact.id,
                  contactName: contact.fullName,
                  phone: contactPhone(contact) || form.phone,
                  email: contactEmail(contact) || form.email,
                });
              }}
            />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Field
                  label="Telefon"
                  value={form.phone}
                  onChangeText={(phone) => patch({ phone })}
                  keyboardType="phone-pad"
                  placeholder="05xx xxx xx xx"
                  maxLength={64}
                  error={errors.phone}
                />
              </View>
              <View className="flex-1">
                <Field
                  label="E-posta"
                  value={form.email}
                  onChangeText={(email) => patch({ email })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="ornek@firma.com"
                  maxLength={254}
                  error={errors.email}
                />
              </View>
            </View>
            <ProvinceSelect
              label="İl *"
              value={form.city}
              onChange={(city) => patch({ city, district: city === form.city ? form.district : '' })}
              error={errors.city}
            />
            <DistrictSelect label="İlçe" province={form.city} value={form.district} onChange={(district) => patch({ district })} />
            <LookupSelect
              name="contact-sources"
              label="İrtibat şekli"
              placeholder="Seçim zorunlu değil"
              icon="call-outline"
              value={form.contactMethod}
              onChange={(contactMethod) => patch({ contactMethod })}
            />
          </View>

          <View className="gap-3">
            <Eyebrow>Talep</Eyebrow>
            <View className="flex-row gap-2">
              <View className="flex-[3]">
                <ProductSelect
                  label="İstenen ürün *"
                  value={form.product}
                  selectedId={form.productModelId}
                  clearable
                  placeholder="Katalogdan arayın veya yazın"
                  error={errors.product}
                  onSelect={(item) => patch({ productModelId: item?.id ?? '', product: item?.label ?? '' })}
                />
              </View>
              <View className="flex-1">
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
              placeholder={quickOpportunityTitle({ ...form, title: '' }) || 'Boş bırakılırsa ürün ve adetten oluşur'}
              maxLength={255}
            />
          </View>

          <View className="gap-3">
            <Eyebrow>Ticari (opsiyonel)</Eyebrow>
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
              <View className="flex-1 flex-row gap-1 pt-6">
                {CURRENCIES.map((code) => (
                  <Pressable
                    key={code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: form.currencyCode === code }}
                    onPress={() => patch({ currencyCode: code })}
                    className={`flex-1 items-center justify-center rounded-control border ${form.currencyCode === code ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
                  >
                    <Text className={`font-inter-semibold text-xs ${form.currencyCode === code ? 'text-primary' : 'text-foreground'}`}>{code}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Field
                  label="Olasılık (%)"
                  value={form.probability}
                  onChangeText={(probability) => patch({ probability: probability.replace(/\D/g, '') })}
                  keyboardType="number-pad"
                  maxLength={3}
                  error={errors.probability}
                />
              </View>
              <View className="flex-[2]">
                <DateTimeField
                  label="Beklenen kapanış"
                  mode="date"
                  value={form.expectedCloseDate}
                  onChange={(expectedCloseDate) => patch({ expectedCloseDate })}
                  placeholder="Tarih seçin"
                  clearable
                />
              </View>
            </View>
          </View>

          <View className="gap-3">
            <Eyebrow>Takip</Eyebrow>
            <Field
              label="İlk takip aksiyonu"
              value={form.nextAction}
              onChangeText={(nextAction) => patch({ nextAction })}
              placeholder="Örn. Teknik ihtiyaç için satın alma müdürünü ara"
              maxLength={1000}
              error={errors.nextAction}
            />
            <DateTimeField
              label="Takip zamanı"
              value={form.nextActionAt}
              onChange={(nextActionAt) => patch({ nextActionAt })}
              placeholder="Tarih ve saat seçin"
              clearable
            />
            <Field
              label="Not"
              value={form.description}
              onChangeText={(description) => patch({ description })}
              multiline
              numberOfLines={3}
              maxLength={3000}
              className="min-h-[88px] rounded-control border border-transparent bg-input-background px-3.5 py-3 font-inter text-base text-foreground"
            />
          </View>

          <View className="gap-3">
            <Eyebrow>Atama</Eyebrow>
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
          </View>
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
