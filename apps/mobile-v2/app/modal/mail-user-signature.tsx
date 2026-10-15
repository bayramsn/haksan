import { Image, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMailSaveUserSignature, useMailSignatureUsers, useMailUserSignature } from '@/src/api/settings.hooks';
import { toast } from '@/src/ui/toast';
import { useAdminAccess } from '@/src/ui/admin/access';
import { ActionPill, Notice, confirmDestructive } from '@/src/ui/admin/controls';
import { Help, ModalShell } from '@/src/ui/admin/ModalShell';
import { signatureDataUrl } from '@/src/ui/admin/signature-meta';
import { pickSignatureImage } from '@/src/ui/admin/signature-upload';

export default function MailUserSignatureModal() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  const access = useAdminAccess();
  const users = useMailSignatureUsers(access.isSuperAdmin);
  const signature = useMailUserSignature(access.isSuperAdmin ? id : '');
  const save = useMailSaveUserSignature(id);
  const selected = users.data?.find((u) => u.id === id);

  const upload = async () => {
    try {
      const picked = await pickSignatureImage({ withBase64: true });
      if (!picked) return;
      if (!picked.base64) throw new Error('Görsel okunamadı');
      await save.mutateAsync({ image: signatureDataUrl(picked, picked.base64), filename: picked.filename });
      toast.success('Kullanıcının mail imzası kaydedildi');
    } catch (err) {
      toast.error(`Mail imzası kaydedilemedi: ${err instanceof Error ? err.message : 'Lütfen tekrar deneyin.'}`);
    }
  };

  const remove = () =>
    confirmDestructive('Mail imzası kaldırılsın mı?', `${selected?.name ?? 'Kullanıcı'} için kayıtlı görsel imza silinir.`, 'İmzayı kaldır', () =>
      save.mutate(
        { image: null, filename: null },
        {
          onSuccess: () => toast.success('Kullanıcının mail imzası kaldırıldı'),
          onError: (err) => toast.error(`Mail imzası kaydedilemedi: ${err.message}`),
        }
      )
    );

  const loadError = users.error?.message ?? signature.error?.message ?? (users.data && !selected ? 'Kullanıcı bulunamadı' : null);

  return (
    <ModalShell
      title={selected?.name ?? 'Mail imzası'}
      allowed={access.isSuperAdmin}
      loading={users.isPending || signature.isPending}
      error={loadError ? `Kullanıcının imzası alınamadı: ${loadError}` : null}
      onRetry={() => {
        void users.refetch();
        void signature.refetch();
      }}
      description={selected?.email}
    >
      {selected && !selected.hasMailAccount ? (
        <Notice tone="info">
          Bu kullanıcının webmail hesabı henüz bağlı değil. İmzasını şimdi yükleyebilirsiniz; hesabını bağladığında gönderdiği maillere otomatik eklenir.
        </Notice>
      ) : null}
      {signature.data?.image ? (
        <View className="gap-1">
          <Image
            source={{ uri: signature.data.image }}
            accessibilityLabel={`${selected?.name ?? 'Kullanıcı'} mail imzası`}
            resizeMode="contain"
            className="h-28 w-full rounded border border-border bg-card"
          />
          {signature.data.filename ? <Text className="font-inter text-[12px] text-muted-foreground">{signature.data.filename}</Text> : null}
        </View>
      ) : (
        <Help>Bu kullanıcı için kayıtlı görsel imza yok.</Help>
      )}
      <View className="flex-row flex-wrap gap-2">
        <ActionPill
          icon="cloud-upload-outline"
          label={save.isPending ? 'İmza kaydediliyor…' : 'İmza görseli'}
          disabled={save.isPending}
          onPress={() => void upload()}
        />
        {signature.data?.image ? (
          <ActionPill icon="trash-outline" tone="destructive" label="İmzayı kaldır" disabled={save.isPending} onPress={remove} />
        ) : null}
      </View>
      <Help>PNG, JPG veya WEBP · en fazla 2 MB. Görsel seçildiğinde kaydedilir.</Help>
    </ModalShell>
  );
}
