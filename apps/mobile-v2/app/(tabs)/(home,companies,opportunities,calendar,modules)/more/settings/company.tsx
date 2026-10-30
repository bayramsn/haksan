import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { USER_REPORT_RECIPIENTS_MAX } from '@haksan/shared';
import { useTenantSettings, useUpdateTenant } from '@/src/api/admin.hooks';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { Notice, confirmDestructive } from '@/src/ui/admin/controls';
import { Help } from '@/src/ui/admin/ModalShell';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';

type CompanyForm = { companyName: string; taxId: string; email: string; phone: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CompanySettingsScreen() {
  const { colors } = useTheme();
  const access = useAdminAccess();
  const canEditTenant = access.has('tenants.update');
  const tenant = useTenantSettings();
  const update = useUpdateTenant();

  const baseline = useMemo<CompanyForm>(
    () => ({
      companyName: tenant.data?.name ?? '',
      taxId: tenant.data?.taxNumber ?? '',
      email: tenant.data?.email ?? '',
      phone: tenant.data?.phone ?? '',
    }),
    [tenant.data]
  );
  const baselineRecipients = useMemo(() => tenant.data?.userReportRecipients ?? [], [tenant.data]);
  const [company, setCompany] = useState<CompanyForm>(baseline);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setCompany(baseline);
    setRecipients(baselineRecipients);
  }, [baseline, baselineRecipients]);

  const dirty =
    JSON.stringify(company) !== JSON.stringify(baseline) ||
    JSON.stringify(recipients) !== JSON.stringify(baselineRecipients) ||
    draft.trim().length > 0;

  /** Kutudaki adresi listeye alır; Kaydet de çağırır ki yazılan adres kaybolmasın. */
  const flushDraft = (): string[] | null => {
    const value = draft.trim().toLowerCase();
    if (!value) return recipients;
    if (!EMAIL_RE.test(value)) {
      toast.error('Geçerli bir e-posta adresi girin');
      return null;
    }
    if (recipients.includes(value)) {
      setDraft('');
      return recipients;
    }
    if (recipients.length >= USER_REPORT_RECIPIENTS_MAX) {
      toast.error(`En fazla ${USER_REPORT_RECIPIENTS_MAX} alıcı eklenebilir`);
      return null;
    }
    const next = [...recipients, value];
    setRecipients(next);
    setDraft('');
    return next;
  };

  const save = () => {
    if (!canEditTenant) return;
    const nextRecipients = flushDraft();
    if (!nextRecipients) return;
    if (!company.companyName.trim()) {
      toast.error('Şirket adı zorunlu');
      return;
    }
    const email = company.email.trim();
    if (email && !EMAIL_RE.test(email)) {
      toast.error('Geçerli bir e-posta adresi girin');
      return;
    }
    const recipientsChanged = JSON.stringify(nextRecipients) !== JSON.stringify(baselineRecipients);
    update.mutate(
      {
        name: company.companyName.trim(),
        taxNumber: company.taxId.trim() || null,
        email: email || null,
        phone: company.phone.trim() || null,
        ...(recipientsChanged ? { userReportRecipients: nextRecipients } : {}),
      },
      {
        onSuccess: () => toast.success('Şirket bilgileri kaydedildi'),
        onError: (err) => toast.error(`Şirket bilgileri kaydedilemedi: ${err.message}`),
      }
    );
  };

  const reset = () =>
    confirmDestructive('Değişiklikler geri alınsın mı?', 'Kurumsal profil henüz tüm kullanıcılara yansıtılmadı.', 'Geri Al', () => {
      setCompany(baseline);
      setRecipients(baselineRecipients);
      setDraft('');
    });

  return (
    <SettingsSubpage
      title="Şirket profili"
      subtitle="Tüm kullanıcıların gördüğü doğrulanmış şirket bilgileri."
      loading={tenant.isPending}
      error={tenant.error ? 'Şirket bilgileri yüklenemedi' : null}
      onRetry={() => void tenant.refetch()}
      refreshing={tenant.isRefetching}
      onRefresh={() => {
        if (!dirty) void tenant.refetch();
      }}
    >
      <Card className="gap-3">
        <View className="gap-0.5">
          <Text className="font-inter-semibold text-[15px] text-foreground">Şirket Bilgileri</Text>
          <Help>Tenant kaydından yönetilir; tüm kullanıcılarda ortaktır.</Help>
        </View>
        <Field
          label="Şirket Adı"
          value={company.companyName}
          editable={canEditTenant}
          onChangeText={(companyName) => setCompany((prev) => ({ ...prev, companyName }))}
          maxLength={255}
        />
        <Field
          label="VKN"
          value={company.taxId}
          editable={canEditTenant}
          onChangeText={(taxId) => setCompany((prev) => ({ ...prev, taxId }))}
          keyboardType="number-pad"
          maxLength={32}
        />
        <Field
          label="E-posta"
          value={company.email}
          editable={canEditTenant}
          onChangeText={(email) => setCompany((prev) => ({ ...prev, email }))}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={255}
        />
        <Field
          label="Telefon"
          value={company.phone}
          editable={canEditTenant}
          onChangeText={(phone) => setCompany((prev) => ({ ...prev, phone }))}
          keyboardType="phone-pad"
          maxLength={32}
        />
        {!canEditTenant ? <Help>Düzenleme için yönetici yetkisi gerekir.</Help> : null}
      </Card>

      {canEditTenant ? (
        <Card className="gap-3">
          <View className="gap-0.5">
            <Text className="font-inter-semibold text-[15px] text-foreground">Haftalık Kullanıcı Raporu Alıcıları</Text>
            <Help>Pazartesi sabahı gönderilen kullanıcı performansı ve hesap denetimi raporu bu adreslere gider.</Help>
          </View>
          <Notice tone="info">
            Liste boşsa rapor süper adminlere gider. Adres eklerseniz mail onların yerine bu adreslere çıkar; uygulama içi bildirim her hâlükârda süper adminlerde kalır.
          </Notice>
          {recipients.map((address) => (
            <View key={address} className="min-h-11 flex-row items-center gap-2 rounded-control border border-border bg-card-subtle pl-3">
              <Text className="flex-1 font-inter text-[14px] text-foreground" numberOfLines={1}>
                {address}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${address} adresini listeden çıkar`}
                onPress={() => setRecipients((prev) => prev.filter((item) => item !== address))}
                className="h-11 w-11 items-center justify-center active:opacity-60"
              >
                <Ionicons name="trash-outline" size={18} color={colors.destructive} />
              </Pressable>
            </View>
          ))}
          <View className="flex-row items-end gap-2">
            <View className="flex-1">
              <Field
                label="Alıcı e-postası"
                value={draft}
                onChangeText={setDraft}
                placeholder="bt@firma.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => void flushDraft()}
              />
            </View>
            <Button label="Ekle" variant="ghost" disabled={!draft.trim()} onPress={() => void flushDraft()} />
          </View>
          <Help>
            {recipients.length}/{USER_REPORT_RECIPIENTS_MAX} alıcı · Değişiklik “Kaydet” ile uygulanır.
          </Help>
        </Card>
      ) : null}

      <Card className="gap-1 bg-primary">
        <Text className="font-display text-[20px] text-primary-foreground">{company.companyName || 'Şirket adını girin'}</Text>
        <Text className="font-inter text-[12px] text-primary-foreground opacity-75">
          VKN {company.taxId || '—'} · {company.phone || 'Telefon bilgisi yok'}
        </Text>
        <Text className="font-inter text-[12px] text-primary-foreground opacity-75" numberOfLines={1}>
          {company.email || 'E-posta bilgisi yok'}
        </Text>
      </Card>

      {canEditTenant && dirty ? (
        <Notice tone="warning" title="Kaydedilmemiş değişiklikler var">
          Kurumsal profil henüz tüm kullanıcılara yansıtılmadı.
        </Notice>
      ) : null}
      {canEditTenant ? (
        <View className="flex-row gap-2">
          {dirty ? (
            <View className="flex-1">
              <Button label="Vazgeç" variant="ghost" onPress={reset} />
            </View>
          ) : null}
          <View className="flex-1">
            <Button label="Kaydet" loading={update.isPending} disabled={!dirty} onPress={save} />
          </View>
        </View>
      ) : null}
    </SettingsSubpage>
  );
}
