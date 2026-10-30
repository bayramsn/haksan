import { useAssistantFormDraft } from '@/src/call-assistant/useAssistantFormDraft';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCompany } from '@/src/api/companies.hooks';
import { useCreateOpportunity } from '@/src/api/crm.hooks';
import { useCreateOpportunityFromActivity } from '@/src/api/sales.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { Button, Card, Eyebrow, Field } from '@/src/ui';
import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { SearchSelect } from '@/src/ui/select/SearchSelect';
import {
  AssigneeSelect,
  CompanySelect,
  ContactSelect,
  DistrictSelect,
  LookupSelect,
  ProvinceSelect,
  companyLabel,
  contactEmail,
  contactPhone,
} from '@/src/ui/select/fields';
import {
  buildQuickOpportunityBody,
  validateQuickOpportunity,
  type QuickOpportunityErrors,
  type QuickOpportunityForm,
} from '@/src/ui/sales/quick-opportunity';
import { toast } from '@/src/ui/toast';

const emptyContact = { contactId: '', contactName: '', phone: '', email: '' } as const;

function param(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Hızlı fırsat — web LeadCaptureDialog ile aynı alanlar.
 * Yeni Kart / çoklu makine için `create-case` modalına bakın.
 */
export default function NewOpportunityScreen() {
  const router = useRouter();
  const { user, scope } = useAuth();
  const params = useLocalSearchParams<{ activityId?: string; companyId?: string; companyName?: string; title?: string; assistantDraftId?: string }>();
  const assistantDraftId = param(params.assistantDraftId);
  const activityId = assistantDraftId ? null : param(params.activityId) || null;
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
    companyId: assistantDraftId ? '' : param(params.companyId),
    companyTitle: assistantDraftId ? '' : param(params.companyName),
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
    extraMachines: [],
    title: assistantDraftId ? '' : param(params.title),
    estimatedValue: '',
    currencyCode: 'USD',
    probability: '50',
    expectedCloseDate: null,
    nextAction: '',
    nextActionAt: null,
    description: '',
    divisionId: defaultDivision,
    ownerUserId: '',
    paymentTermDays: '',
  }));
  const [errors, setErrors] = useState<QuickOpportunityErrors>({});
  const assistant = useAssistantFormDraft(assistantDraftId, 'opportunity', (draft) => {
    setForm((previous) => ({ ...previous, companyId: draft.company.id, companyTitle: draft.company.name, contactId: draft.contact?.id ?? '', contactName: draft.contact?.name ?? '', phone: draft.contact?.phone ?? '', email: draft.contact?.email ?? '', title: draft.title ?? '', description: draft.text ?? '', nextActionAt: draft.dueAt ? new Date(draft.dueAt) : null, nextAction: draft.dueAt ? draft.title || 'Takip et' : '' }));
  });

  function patch(next: Partial<QuickOpportunityForm>) {
    setForm((prev) => ({ ...prev, ...next }));
    setErrors((prev) => {
      const cleared = { ...prev };
      for (const key of Object.keys(next) as (keyof QuickOpportunityForm)[]) delete cleared[key];
      if ('email' in next || 'phone' in next) {
        delete cleared.phone;
        delete cleared.email;
      }
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

  if (activityId ? !canConvertActivity : !canCreate) return <Redirect href={'/modules/opportunities' as Href} />;

  const pending = create.isPending || createFromActivity.isPending || assistant.saving;
  const phoneFilled = form.phone.trim().length > 0;
  const emailFilled = form.email.trim().length > 0;
  // Web: biri doluysa diğeri opsiyonel; ikisi de boşsa ikisi de zorunlu görünür.
  const phoneLabel = phoneFilled || !emailFilled ? 'Telefon *' : 'Telefon';
  const emailLabel = emailFilled || !phoneFilled ? 'E-posta *' : 'E-posta';
  const contactLabel = form.companyId ? 'Kontak ismi' : 'Kontak ismi *';

  async function submit() {
    if (pending || assistant.blocked) return;
    const nextErrors = validateQuickOpportunity(form, divisions.length > 0);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error(Object.values(nextErrors)[0] ?? 'Eksik bilgi');
      return;
    }
    const body = buildQuickOpportunityBody(form);
    if (assistant.active) {
      try { await assistant.save(body); toast.success('Fırsat oluşturuldu'); router.back(); }
      catch (error) { toast.error(error instanceof Error ? error.message : 'Fırsat kaydedilemedi'); }
      return;
    }
    if (activityId) {
      createFromActivity.mutate(
        { activityId, body: { ...body, sourceActivityId: activityId } },
        {
          onSuccess: (created) => {
            toast.success('Aktiviteden fırsat oluşturuldu');
            router.replace(`/modules/opportunities/${created.id}` as Href);
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
          {assistant.error ? <View className="gap-2"><Text className="text-destructive">{assistant.error}</Text><Button label="Taslağı tekrar yükle" variant="ghost" onPress={() => void assistant.retry()} /></View> : null}
          <Text className="font-inter text-[13px] leading-[18px] text-muted-foreground">
            Talebi Fırsat’ın ilk C alanına kaydedin. Firma veya kontak ana kaydı daha sonra bağlanabilir.
          </Text>

          <Card className="gap-3">
            <Eyebrow>Firma ve kontak</Eyebrow>
            <CompanySelect
              label="Firma"
              value={form.companyTitle}
              selectedId={form.companyId || null}
              allowCustom
              clearable
              placeholder="Kayıtlı firmadan seçin veya yazın"
              searchPlaceholder="Firma ara…"
              createLabel={(q) => `“${q}” firmasını fırsata yaz`}
              onSelect={(item) => {
                const company = item?.data;
                if (!item) {
                  return patch({ companyId: '', companyTitle: '', ...emptyContact, city: '', district: '' });
                }
                if (!company) {
                  return patch({ companyId: '', companyTitle: item.label, ...emptyContact });
                }
                patch({
                  companyId: company.id,
                  companyTitle: companyLabel(company),
                  ...emptyContact,
                  city: company.primaryAddress?.province || '',
                  district: company.primaryAddress?.district || '',
                  phone: company.primaryPhone || '',
                  email: company.primaryEmail || '',
                });
              }}
            />
            {form.companyId ? (
              <Text className="font-inter text-[11px] text-muted-foreground">
                Kayıtlı firma bağlandı; kart doğrudan C aşamasına hazır açılır.
              </Text>
            ) : form.companyTitle.trim() ? (
              <Text className="font-inter text-[11px] text-muted-foreground">
                Elle giriş: “{form.companyTitle.trim()}” yalnız fırsata yazılır, firma kaydı oluşturulmaz.
              </Text>
            ) : (
              <Text className="font-inter text-[11px] text-muted-foreground">
                Kayıtlıysa seçin, değilse yazın — firma ana kaydı açılmaz.
              </Text>
            )}

            <ContactSelect
              label={contactLabel}
              companyId={form.companyId || null}
              value={form.contactName}
              selectedId={form.contactId || null}
              allowCustom
              clearable
              placeholder={form.companyId ? 'Firmanın kontağını seçin veya yazın' : 'Ahmet Yılmaz'}
              error={errors.contactName}
              onSelect={(item) => {
                const contact = item?.data;
                if (!item) return patch({ ...emptyContact });
                if (!contact) return patch({ contactId: '', contactName: item.label });
                patch({
                  contactId: contact.id,
                  contactName: contact.fullName,
                  phone: contactPhone(contact) || form.phone,
                  email: contactEmail(contact) || form.email,
                });
              }}
            />
            {form.companyId ? (
              <Text className="font-inter text-[11px] text-muted-foreground">Kontak opsiyonel; listeden seçin veya ismi yazın.</Text>
            ) : null}

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Field
                  label={phoneLabel}
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
                  label={emailLabel}
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
            <Text
              className={`font-inter text-[11px] ${phoneFilled || emailFilled ? 'text-muted-foreground' : 'text-destructive'}`}
            >
              Telefon veya e-postadan en az biri zorunludur; birini yazınca diğeri opsiyonel olur.
            </Text>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <ProvinceSelect
                  label="İl *"
                  value={form.city}
                  placeholder="İl seçin veya yazın"
                  onChange={(city) => patch({ city, district: city === form.city ? form.district : '' })}
                  error={errors.city}
                />
              </View>
              <View className="flex-1">
                <DistrictSelect
                  label="İlçe"
                  province={form.city}
                  value={form.district}
                  placeholder={form.city ? 'İlçe seçin veya yazın' : 'Önce il seçin'}
                  onChange={(district) => patch({ district })}
                />
              </View>
            </View>
            <LookupSelect
              name="contact-sources"
              label="İrtibat şekli"
              placeholder="Seçim zorunlu değil"
              icon="call-outline"
              value={form.contactMethod}
              onChange={(contactMethod) => patch({ contactMethod })}
              clearable
            />
          </Card>

          <Card className="gap-3">
            <Eyebrow>Talep</Eyebrow>
            <View className="flex-row gap-2">
              <View className="flex-[3]">
                <Field
                  label="İstenen ürün *"
                  value={form.product}
                  onChangeText={(product) => patch({ product, productModelId: '' })}
                  placeholder="İşleme Merkezi"
                  maxLength={255}
                  error={errors.product}
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
          </Card>

          <Card className="gap-3 border-primary/20 bg-primary/5">
            <Eyebrow>İlk takip</Eyebrow>
            <Field
              label="İlk takip aksiyonu"
              value={form.nextAction}
              onChangeText={(nextAction) => patch({ nextAction })}
              placeholder="Örn. Teknik ihtiyaç için satın alma müdürünü ara"
              maxLength={1000}
              error={errors.nextAction}
              multiline
              numberOfLines={3}
              className="min-h-[64px] rounded-control border border-transparent bg-card px-3.5 py-2.5 font-inter text-base text-foreground"
            />
            <DateTimeField
              label="Takip zamanı"
              value={form.nextActionAt}
              onChange={(nextActionAt) => patch({ nextActionAt })}
              placeholder="Tarih ve saat"
              clearable
            />
            <Text className="font-inter text-[10px] leading-4 text-muted-foreground">
              Kart, zamanı gelince aksiyon listesinde öne çıkar.
            </Text>
          </Card>

          <Card className="gap-3">
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
              label="Sorumlu"
              value={form.ownerUserId}
              onChange={(ownerUserId) => patch({ ownerUserId })}
              divisionId={form.divisionId || null}
              onlyUserId={canAssignOthers ? null : user?.id ?? null}
              placeholder="Atama kuralına bırak"
              clearable
            />
            <Text className="font-inter text-[11px] text-muted-foreground">
              Seçim yapmazsanız mevcut fırsat atama kuralları uygulanır; uygun kural yoksa kayıt sahipsiz açılır.
            </Text>
          </Card>
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1">
            <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} disabled={pending} />
          </View>
          <View className="flex-[2]">
            <Button label={pending ? 'Oluşturuluyor…' : 'Fırsat Oluştur'} loading={pending || assistant.loading} disabled={pending || assistant.blocked} onPress={() => void submit()} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
