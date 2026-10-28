import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { MAIL_SIGNATURE_MAX } from '@haksan/shared';
import {
  useMailAccount,
  useMailConnect,
  useMailDisconnect,
  useMailImageSignature,
  useMailTextSignature,
} from '@/src/api/settings.hooks';
import { useAuth } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import { Button, Card, Chip, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { ActionPill, Notice, confirmDestructive } from '@/src/ui/admin/controls';
import { Help } from '@/src/ui/admin/ModalShell';
import { SettingsSubpage } from '@/src/ui/admin/SettingsSubpage';
import { signatureDataUrl } from '@/src/ui/admin/signature-meta';
import { pickSignatureImage } from '@/src/ui/admin/signature-upload';

export default function WebmailSettingsScreen() {
  const { user } = useAuth();
  const account = useMailAccount();
  const connect = useMailConnect();
  const disconnect = useMailDisconnect();
  const textSignature = useMailTextSignature();
  const imageSignature = useMailImageSignature();
  const status = account.data;

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState(user?.fullName ?? '');
  // Parola yalnız bu bileşenin belleğinde durur; bağlantıdan sonra silinir, loglanmaz/saklanmaz.
  const [password, setPassword] = useState('');
  const [signature, setSignature] = useState('');

  useEffect(() => {
    if (!status) return;
    setEmail(status.email ?? '');
    setDisplayName(status.displayName ?? user?.fullName ?? '');
    setSignature(status.signature ?? status.defaultSignature);
  }, [status, user?.fullName]);

  useEffect(() => () => setPassword(''), []);

  const connected = Boolean(status?.configured && status.status === 'active');
  const connectionError = Boolean(status?.configured && status.status === 'error');
  const featureEnabled = Boolean(status?.featureEnabled);
  const busy = connect.isPending || disconnect.isPending;

  const submitConnect = () => {
    if (!email.trim() || !displayName.trim() || !password) {
      toast.error('E-posta, görünen ad ve webmail şifresi zorunludur');
      return;
    }
    connect.mutate(
      { email: email.trim(), displayName: displayName.trim(), password },
      {
        onSuccess: () => {
          setPassword('');
          toast.success('Webmail hesabı bağlandı. SMTP bağlantısı doğrulandı ve gönderime hazır.');
        },
        onError: (err) => {
          setPassword('');
          toast.error(`Webmail hesabı bağlanamadı: ${err.message || 'Bilgileri kontrol edip tekrar deneyin.'}`);
        },
      }
    );
  };

  const askDisconnect = () =>
    confirmDestructive(
      'Webmail bağlantısını kaldır?',
      'Şifreli hesap bilgisi silinir ve CRM’den kendi adresinizle e-posta gönderemezsiniz. Daha sonra yeniden bağlayabilirsiniz.',
      'Bağlantıyı kaldır',
      () =>
        disconnect.mutate(undefined, {
          onSuccess: () => {
            setEmail('');
            setDisplayName(user?.fullName ?? '');
            setPassword('');
            toast.success('Webmail bağlantısı kaldırıldı');
          },
          onError: (err) => toast.error(`Bağlantı kaldırılamadı: ${err.message}`),
        })
    );

  const saveSignature = (value: string | null) =>
    textSignature.mutate(value, {
      onSuccess: () =>
        toast.success(
          value === null
            ? 'Varsayılan imzaya dönüldü. Bundan sonraki maillerin altına eklenir.'
            : value.trim()
              ? 'İmza kaydedildi. Bundan sonraki maillerin altına eklenir.'
              : 'İmza kapatıldı. Mailler imzasız gönderilecek.'
        ),
      onError: (err) => toast.error(`İmza kaydedilemedi: ${err.message}`),
    });

  const saveImage = async (remove: boolean) => {
    try {
      if (remove) {
        await imageSignature.mutateAsync({ image: null, filename: null });
        toast.success('Mail imzası kaldırıldı');
        return;
      }
      const picked = await pickSignatureImage({ withBase64: true });
      if (!picked) return;
      if (!picked.base64) throw new Error('Görsel okunamadı');
      await imageSignature.mutateAsync({ image: signatureDataUrl(picked, picked.base64), filename: picked.filename });
      toast.success('Mail imzası kaydedildi');
    } catch (err) {
      toast.error(`Mail imzası kaydedilemedi: ${err instanceof Error ? err.message : 'PNG, JPG veya WEBP seçin; imza görseli en fazla 2 MB olabilir.'}`);
    }
  };

  return (
    <SettingsSubpage
      title="Webmail bağlantısı"
      subtitle="CRM e-postalarını kendi kurumsal adresinizden gönderin."
      loading={account.isPending}
      error={account.error ? `Webmail ayarları alınamadı: ${account.error.message}` : null}
      onRetry={() => void account.refetch()}
      refreshing={account.isRefetching}
      onRefresh={() => void account.refetch()}
    >
      {!featureEnabled ? (
        <Notice tone="warning">
          Kişisel webmail bağlantısı sunucuda henüz açılmamış. Sistem yöneticisi SMTP sunucusunu ve izin verilen kurumsal alan adlarını tanımladıktan sonra bu ekran aktif olur.
        </Notice>
      ) : null}

      <Card className="gap-2">
        <Text className="font-inter-semibold text-[11px] uppercase tracking-[1.2px] text-info">KİŞİSEL GÖNDERİCİ</Text>
        <Text className="font-display text-[20px] text-foreground" numberOfLines={2}>
          {connected ? status?.email : connectionError ? 'Hesabı yeniden doğrulayın' : 'Webmail hesabınızı bağlayın'}
        </Text>
        <Text className="font-inter text-[12px] leading-[17px] text-muted-foreground">
          {connected
            ? 'CRM’den gönderdiğiniz e-postalar doğrudan bu kurumsal adresten çıkar.'
            : 'E-posta adresinizi ve webmail giriş şifrenizi kullanarak güvenli SMTP bağlantısı kurun.'}
        </Text>
        <Chip
          tone={connected ? 'success' : connectionError ? 'warning' : 'neutral'}
          label={connected ? 'Gönderime hazır' : connectionError ? 'Bağlantı kesildi' : 'Bağlı değil'}
        />
        {status?.serverLabel ? (
          <Text className="font-inter text-[11px] text-muted-foreground">
            {status.serverLabel} · Son doğrulama: {formatDate(status.lastVerifiedAt)}
            {status.lastUsedAt ? ` · Son gönderim: ${formatDate(status.lastUsedAt)}` : ''}
          </Text>
        ) : null}
      </Card>

      <Card className="gap-3">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1 gap-0.5">
            <Text className="font-inter-semibold text-[15px] text-foreground">
              {status?.configured ? 'Webmail bilgilerini güncelle' : 'Webmail ile bağlan'}
            </Text>
            <Help>Şifre yalnız bağlantı kurulurken gönderilir; ekranda ve cihaz depolamasında tutulmaz.</Help>
          </View>
          {status?.configured ? <ActionPill icon="power-outline" tone="destructive" label="Bağlantıyı kaldır" disabled={busy} onPress={askDisconnect} /> : null}
        </View>
        <Field
          label="Gönderen adı"
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={255}
          editable={featureEnabled && !busy}
          placeholder="Ad Soyad"
        />
        <Field
          label="Kurumsal e-posta"
          value={email}
          onChangeText={setEmail}
          maxLength={255}
          editable={featureEnabled && !busy}
          placeholder="ad.soyad@firma.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
        />
        <Field
          label="Webmail şifresi"
          value={password}
          onChangeText={setPassword}
          maxLength={512}
          editable={featureEnabled && !busy}
          placeholder={status?.configured ? 'Değiştirmek için şifreyi yeniden girin' : 'Webmail giriş şifreniz'}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          importantForAutofill="no"
        />
        <Notice tone="success">Parola AES-256-GCM ile şifrelenir ve hiçbir API yanıtında geri döndürülmez.</Notice>
        <Button
          label={connect.isPending ? 'Doğrulanıyor' : status?.configured ? 'Yeniden doğrula' : 'Bağlantıyı doğrula'}
          loading={connect.isPending}
          disabled={!featureEnabled || busy || !email.trim() || !displayName.trim() || !password}
          onPress={submitConnect}
        />
      </Card>

      {status?.configured ? (
        <Card className="gap-3">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1 gap-0.5">
              <Text className="font-inter-semibold text-[15px] text-foreground">E-posta imzası</Text>
              <Help>CRM'den gönderdiğiniz her mailin altına logoyla birlikte eklenir. Boş bırakırsanız mailler imzasız gider.</Help>
            </View>
            {status.signature !== null ? (
              <ActionPill icon="refresh-outline" label="Profilden üret" disabled={textSignature.isPending} onPress={() => saveSignature(null)} />
            ) : null}
          </View>
          <Field
            label="İmza metni"
            value={signature}
            onChangeText={setSignature}
            maxLength={MAIL_SIGNATURE_MAX}
            editable={!textSignature.isPending}
            multiline
            placeholder={'Ad Soyad\nÜnvan\nFirma\nTelefon'}
            style={{ minHeight: 140, paddingTop: 12, textAlignVertical: 'top' }}
          />
          <Help>
            {status.signature === null
              ? 'Şu an profilinizden (ad, ünvan, telefon, e-posta) üretilen imza kullanılıyor.'
              : 'Kendi kaydettiğiniz imza kullanılıyor.'}
          </Help>
          <Button
            label="İmzayı kaydet"
            loading={textSignature.isPending}
            disabled={signature === (status.signature ?? status.defaultSignature)}
            onPress={() => saveSignature(signature)}
          />
        </Card>
      ) : null}

      <Card className="gap-3">
        <View className="gap-0.5">
          <Text className="font-inter-semibold text-[15px] text-foreground">Görsel mail imzası</Text>
          <Help>Yüklediğiniz imza tüm CRM e-postalarınıza otomatik eklenir. PNG, JPG veya WEBP · en fazla 2 MB.</Help>
        </View>
        {status?.signatureImage ? (
          <Image
            source={{ uri: status.signatureImage }}
            accessibilityLabel="Kayıtlı mail imzası"
            resizeMode="contain"
            className="h-28 w-full rounded border border-border bg-card"
          />
        ) : null}
        {!status?.configured ? (
          <Help>İmzanızı şimdi yükleyebilirsiniz; webmail hesabınızı bağladığınızda maillere otomatik eklenir.</Help>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          <ActionPill
            icon="cloud-upload-outline"
            label={imageSignature.isPending ? 'İmza kaydediliyor…' : 'İmza görseli seç'}
            disabled={busy || imageSignature.isPending}
            onPress={() => void saveImage(false)}
          />
          {status?.signatureImage ? (
            <ActionPill
              icon="trash-outline"
              tone="destructive"
              label="İmzayı kaldır"
              disabled={busy || imageSignature.isPending}
              onPress={() =>
                confirmDestructive('Mail imzası kaldırılsın mı?', 'Görsel imza bundan sonraki maillere eklenmez.', 'Kaldır', () => void saveImage(true))
              }
            />
          ) : null}
        </View>
      </Card>
    </SettingsSubpage>
  );
}
