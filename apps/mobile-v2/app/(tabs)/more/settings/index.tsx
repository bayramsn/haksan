import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { apiBaseUrl, setApiBaseUrl } from '@/src/api/config';
import { clearFailedQueue, failedCount, flushQueue, pendingCount, subscribeQueue } from '@/src/offline/queue';
import { useAuth } from '@/src/auth/AuthProvider';
import { queryClient } from '@/src/query/client';
import {
  applyThemePreference,
  loadThemePreference,
  themePreferenceLabels,
  type ThemePreference,
} from '@/src/theme/preference';
import { Button, DetailHeader, Field, FilterChips } from '@/src/ui';
import { SettingsGroup, SettingsRow } from '@/src/ui/settings';
import { useBiometricLock } from '@/src/security/BiometricLockProvider';
import { useAdminAccess } from '@/src/ui/admin/access';

const SUPPORT_EMAIL = 'destek@haksanmakina.com.tr';

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const biometric = useBiometricLock();
  const access = useAdminAccess();
  const canEditTenant = access.has('tenants.update');
  const canManageLookups = access.isSuperAdmin;
  const canManageLeadRules = access.has('lead_assignment_rules.manage');
  const canDecideAccess = access.has('companies.update');
  const open = (path: string) => router.push(`/(tabs)/more/settings/${path}` as Href);
  const [theme, setTheme] = useState<ThemePreference>(loadThemePreference);
  const [pending, setPending] = useState(pendingCount);
  const [failed, setFailed] = useState(failedCount);
  const [apiUrl, setApiUrl] = useState(apiBaseUrl);
  const [editingApi, setEditingApi] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => subscribeQueue((count) => {
    setPending(count);
    setFailed(failedCount());
  }), []);

  function chooseTheme(next: ThemePreference | null) {
    const value = next ?? 'system';
    setTheme(value);
    applyThemePreference(value);
  }

  async function syncNow() {
    setSyncing(true);
    const result = await flushQueue();
    setSyncing(false);
    Alert.alert(
      'Senkronizasyon',
      result.remaining > 0
        ? `${result.sent} işlem gönderildi, ${result.remaining} kayıt kaldı${result.failed > 0 ? `; ${result.failed} işlem çözümlenemedi` : ''}.`
        : `${result.sent} işlem gönderildi. Bekleyen yok.`
    );
  }

  function discardFailed() {
    Alert.alert(
      'Başarısız işlemleri sil',
      `${failed} durum değişikliği sunucu tarafından reddedildi veya deneme sınırına ulaştı. Bu kayıtlar gönderilmeden silinsin mi?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => void clearFailedQueue(),
        },
      ],
    );
  }

  function clearCache() {
    Alert.alert('Önbelleği temizle', 'İndirilen listeler silinir, veriler sunucudan yeniden çekilir.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Temizle',
        style: 'destructive',
        onPress: () => {
          queryClient.clear();
          Alert.alert('Önbellek temizlendi');
        },
      },
    ]);
  }

  async function saveApiUrl() {
    const trimmed = apiUrl.trim();
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      Alert.alert('Geçersiz adres', 'Adres http:// veya https:// ile başlamalı.');
      return;
    }
    // Mevcut bearer token yeni/yanlış hosta hiçbir zaman gönderilmemeli. Önce
    // geçerli sunucudaki session kapatılır, sonra geliştirme override'ı yazılır.
    await signOut();
    setApiBaseUrl(trimmed);
    setEditingApi(false);
    // Adres değişince eski sunucunun verisi ekranda kalmamalı.
    queryClient.clear();
    Alert.alert('Sunucu adresi kaydedildi', 'Yeni sunucuda tekrar giriş yapın.');
    router.replace('/(auth)/login');
  }

  const version = Constants.expoConfig?.version ?? '—';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Ayarlar" />

      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-4" keyboardShouldPersistTaps="handled">
        <View className="gap-2">
          <Text className="px-1 font-inter-semibold text-[13px] text-muted-foreground">Görünüm</Text>
          <FilterChips
            options={(['light', 'dark'] as const).map((value) => ({
              value,
              label: themePreferenceLabels[value],
            }))}
            value={theme === 'system' ? null : theme}
            onChange={chooseTheme}
            allLabel={themePreferenceLabels.system}
          />
        </View>

        <SettingsGroup title="Uygulama">
          <SettingsRow
            first
            icon="notifications-outline"
            tone="info"
            title="Bildirim İzinleri"
            subtitle="Cihaz ayarlarından açıp kapatabilirsiniz."
            onPress={() => void Linking.openSettings()}
          />
          <SettingsRow
            icon="cloud-upload-outline"
            tone={failed > 0 ? 'destructive' : pending > 0 ? 'warning' : 'success'}
            title={syncing ? 'Senkronize ediliyor...' : 'Şimdi Senkronize Et'}
            subtitle={failed > 0 ? `${failed} işlem kullanıcı kararı bekliyor.` : pending > 0 ? `${pending} işlem gönderilmeyi bekliyor.` : 'Bekleyen işlem yok.'}
            onPress={() => void syncNow()}
          />
          {failed > 0 ? (
            <SettingsRow
              icon="warning-outline"
              tone="destructive"
              title="Başarısız İşlemleri İncele"
              subtitle="Sunucudaki güncel kaydı kontrol ettikten sonra bu yerel talepleri silebilirsiniz."
              value={String(failed)}
              onPress={discardFailed}
            />
          ) : null}
          <SettingsRow
            icon="finger-print-outline"
            tone={biometric.enabled ? 'success' : 'neutral'}
            title="Biyometrik Uygulama Kilidi"
            subtitle={
              biometric.enabled
                ? 'Uygulama arka planda 30 saniye kaldığında kilitlenir.'
                : biometric.available
                  ? 'Face ID, parmak izi veya cihaz parolasıyla koruyun.'
                  : 'Bu cihazda kayıtlı biyometrik kimlik bulunamadı.'
            }
            value={biometric.enabled ? 'Açık' : 'Kapalı'}
            onPress={() => {
              if (!biometric.available && !biometric.enabled) {
                Alert.alert('Biyometri kullanılamıyor', 'Önce cihaz ayarlarından Face ID veya parmak izi ekleyin.');
                return;
              }
              void biometric.setEnabled(!biometric.enabled);
            }}
          />
          <SettingsRow
            icon="trash-bin-outline"
            tone="neutral"
            title="Önbelleği Temizle"
            subtitle="İndirilen listeleri siler."
            onPress={clearCache}
          />
        </SettingsGroup>

        <SettingsGroup title="Şirket ve Hesap">
          <SettingsRow
            first
            icon="business-outline"
            tone="info"
            title="Şirket"
            subtitle={canEditTenant ? 'Şirket profili ve haftalık rapor alıcıları' : 'Tüm kullanıcıların gördüğü şirket bilgileri'}
            onPress={() => open('company')}
          />
          {canEditTenant ? (
            <SettingsRow
              icon="create-outline"
              tone="info"
              title="Belge İmzaları"
              subtitle="Teklif, proforma ve sözleşme altına basılan imzalar"
              onPress={() => open('signatures')}
            />
          ) : null}
          {canEditTenant ? (
            <SettingsRow
              icon="eye-outline"
              tone="info"
              title="Menü & Akış"
              subtitle="Kullanıcıların kullanacağı sayfaları yönetin"
              onPress={() => open('menu')}
            />
          ) : null}
          <SettingsRow
            icon="mail-outline"
            tone="info"
            title="Webmail"
            subtitle="CRM e-postalarını kendi kurumsal adresinizden gönderin"
            onPress={() => open('webmail')}
          />
          {canManageLookups ? (
            <SettingsRow
              icon="images-outline"
              tone="info"
              title="Kullanıcı Mail İmzaları"
              subtitle="Kullanıcıların görsel mail imzalarını yönetin"
              onPress={() => open('mail-signatures')}
            />
          ) : null}
        </SettingsGroup>

        {canManageLookups || canManageLeadRules || canDecideAccess ? (
          <SettingsGroup title="Yönetim">
            {canManageLookups ? (
              <SettingsRow
                first
                icon="options-outline"
                tone="info"
                title="CRM Alan Ayarları"
                subtitle="Kayıt formlarının alan yapısı ve seçim sözlükleri"
                onPress={() => open('lookups')}
              />
            ) : null}
            {canManageLookups ? (
              <SettingsRow
                first={!canManageLookups}
                icon="people-outline"
                tone="info"
                title="Kullanıcı Departmanları"
                subtitle="Kullanıcı eklerken ve düzenlerken seçilebilen departman listesini yönetin."
                onPress={() => open('departments')}
              />
            ) : null}
            {canManageLeadRules ? (
              <SettingsRow
                first={!canManageLookups}
                icon="git-branch-outline"
                tone="info"
                title="Fırsat Atama"
                subtitle="Yeni fırsatları bölüm ve ticari kriterlere göre sırayla yönlendirin."
                onPress={() => open('lead-rules')}
              />
            ) : null}
            {canManageLookups ? (
              <SettingsRow
                icon="layers-outline"
                tone="info"
                title="Teknik Bilgi"
                subtitle="Ürün ailelerine göre teknik bilgi kapsamı"
                onPress={() => open('spec-templates')}
              />
            ) : null}
            {canManageLookups ? (
              <SettingsRow
                icon="flash-outline"
                tone="info"
                title="Makine teknik bilgileri"
                subtitle="Lazer seri, kabin, güç ve ölçü profilleri"
                onPress={() => open('laser-profiles')}
              />
            ) : null}
            {canDecideAccess ? (
              <SettingsRow
                first={!canManageLookups && !canManageLeadRules}
                icon="checkmark-done-outline"
                tone="warning"
                title="Onay Bekleyen Firma Talepleri"
                subtitle="Başka bölümün firmasına erişim talepleri"
                onPress={() => open('access-requests')}
              />
            ) : null}
          </SettingsGroup>
        ) : null}

        {__DEV__ ? <SettingsGroup title="Geliştirici Sunucusu">
          {editingApi ? (
            <View className="gap-3 p-3.5">
              <Field
                label="API adresi"
                value={apiUrl}
                onChangeText={setApiUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="https://haksan-api.onrender.com/api/v1"
              />
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button
                    label="Vazgeç"
                    variant="ghost"
                    onPress={() => {
                      setApiUrl(apiBaseUrl());
                      setEditingApi(false);
                    }}
                  />
                </View>
                <View className="flex-1">
                  <Button label="Kaydet" onPress={() => void saveApiUrl()} />
                </View>
              </View>
            </View>
          ) : (
            <SettingsRow
              first
              icon="server-outline"
              tone="neutral"
              title="Sunucu Adresi"
              subtitle={apiBaseUrl()}
              onPress={() => setEditingApi(true)}
            />
          )}
        </SettingsGroup> : null}

        <SettingsGroup title="Destek">
          <SettingsRow
            first
            icon="help-circle-outline"
            tone="info"
            title="Yardım & Destek"
            subtitle={SUPPORT_EMAIL}
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Haksan%20Mobil%20Destek`)}
          />
          <SettingsRow
            icon="information-circle-outline"
            tone="neutral"
            title="Hakkında"
            value={`v${version}`}
            onPress={() => router.push('/(tabs)/more/about')}
          />
          <SettingsRow
            icon="person-remove-outline"
            danger
            title="Hesabımı Sil"
            // Sunucuda self-servis silme ucu yok; talep destek ekibine iletiliyor.
            subtitle="Silme talebiniz destek ekibine iletilir."
            onPress={() =>
              Alert.alert(
                'Hesap silme talebi',
                'Hesabınızın ve verilerinizin silinmesi için destek ekibine bir e-posta taslağı açılacak.',
                [
                  { text: 'Vazgeç', style: 'cancel' },
                  {
                    text: 'Devam et',
                    onPress: () =>
                      void Linking.openURL(
                        `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Hesap silme talebi')}`
                      ),
                  },
                ]
              )
            }
          />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
