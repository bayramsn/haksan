import { Image, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { mailAccount } from '@/src/api/general.endpoints';
import { Card, DetailHeader, ErrorState, Eyebrow, Loading } from '@/src/ui';
import { SettingsGroup, SettingsRow } from '@/src/ui/settings';

/** Mail hesabı ve imza yalnız okunur; bağlama ve düzenleme webde (Ayarlar › Mail). */
export default function MailSignatureScreen() {
  const query = useQuery({ queryKey: ['mail', 'account'], queryFn: mailAccount });
  const data = query.data;
  // null = varsayılan imza kullanılır; boş metin = kullanıcı imzasız gönderiyor (sunucu da öyle).
  const usesDefault = data?.signature == null;
  const signature = (usesDefault ? data?.defaultSignature : data?.signature)?.trim() || null;
  const image = data?.signatureImage?.startsWith('data:image/') ? data.signatureImage : null;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <DetailHeader title="Mail İmzası" />
      {query.isPending ? <Loading /> : query.error || !data ? (
        <ErrorState message={query.error?.message ?? 'Mail bilgisi yüklenemedi.'} onRetry={() => void query.refetch()} />
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-4 px-4 pb-10 pt-4">
          <SettingsGroup title="Mail hesabı">
            <SettingsRow
              first
              kind="info"
              icon="mail-outline"
              tone={data.status === 'error' ? 'destructive' : 'info'}
              title={data.email ?? 'Bağlı hesap yok'}
              subtitle={!data.featureEnabled ? 'Kişisel mail bu sunucuda kapalı.' : data.status === 'error' ? 'Bağlantı hatalı; webde yeniden bağlayın.' : data.configured ? 'Bağlı' : 'Webde Ayarlar › Mail bölümünden bağlanır.'}
            />
          </SettingsGroup>
          <Card className="gap-2">
            <Eyebrow>{usesDefault ? 'Varsayılan imza' : 'İmza'}</Eyebrow>
            {signature ? <Text selectable className="font-inter text-sm leading-5 text-foreground">{signature}</Text> : <Text className="font-inter text-sm text-muted-foreground">İmza tanımlı değil.</Text>}
            {image ? <Image source={{ uri: image }} resizeMode="contain" style={{ width: '100%', height: 120 }} accessibilityLabel="İmza görseli" /> : null}
            <Text className="font-inter text-xs text-muted-foreground">İmza webde düzenlenir; gönderilen her mailin sonuna eklenir.</Text>
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
