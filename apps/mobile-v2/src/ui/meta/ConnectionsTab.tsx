import { useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';

import { getMetaErrorMessage } from '@/src/api/meta.api';
import { metaKeys, useDeleteMetaConnection, useMetaConnections, useStartMetaOAuth, useVerifyMetaConnection } from '@/src/api/meta.hooks';
import { toast } from '@/src/ui/toast';
import { formatMetaDate, isSafeAuthorizationUrl, tokenExpired, type MetaConnection } from '@/src/ui/meta/metaNormalize';
import { ConnectionChip, HealthLine, MetaButton, MetaSection, Notice, QueryState } from '@/src/ui/meta/parts';

export function ConnectionsTab({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const connections = useMetaConnections();
  const startOAuth = useStartMetaOAuth();
  const verify = useVerifyMetaConnection();
  const remove = useDeleteMetaConnection();
  const awaitingOAuth = useRef(false);

  // Tarayıcıdaki Meta yetkilendirmesinden dönünce bağlantı listesi tazelenir.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && awaitingOAuth.current) {
        awaitingOAuth.current = false;
        void queryClient.invalidateQueries({ queryKey: metaKeys.root });
      }
    });
    return () => sub.remove();
  }, [queryClient]);

  const connect = () =>
    startOAuth.mutate(undefined, {
      onSuccess: async (result) => {
        if (!isSafeAuthorizationUrl(result.authorizationUrl)) {
          toast.error('Meta bağlantısı başlatılamadı: Geçersiz yetkilendirme adresi.');
          return;
        }
        try {
          awaitingOAuth.current = true;
          await Linking.openURL(result.authorizationUrl);
          toast.info('Meta yetkilendirmesini tarayıcıda tamamlayıp uygulamaya dönün.');
        } catch {
          awaitingOAuth.current = false;
          toast.error('Meta bağlantısı başlatılamadı: Tarayıcı açılamadı.');
        }
      },
      onError: (error) => toast.error(`Meta bağlantısı başlatılamadı: ${getMetaErrorMessage(error)}`),
    });

  const runVerify = (connection: MetaConnection) =>
    verify.mutate(connection.id, {
      onSuccess: () => toast.success('Meta bağlantısı doğrulandı'),
      onError: (error) => toast.error(`Bağlantı doğrulanamadı: ${getMetaErrorMessage(error)}`),
    });

  const confirmDelete = (connection: MetaConnection) =>
    Alert.alert(
      'Meta bağlantısını kaldır',
      `${connection.name} bağlantısı durdurulur. Yeni lead, mesaj ve reklam verisi alınmaz. CRM'deki mevcut kayıtlar silinmez.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Bağlantıyı kaldır',
          style: 'destructive',
          onPress: () =>
            remove.mutate(connection.id, {
              onSuccess: () => toast.success('Meta bağlantısı kaldırıldı'),
              onError: (error) => toast.error(`Bağlantı kaldırılamadı: ${getMetaErrorMessage(error)}`),
            }),
        },
      ],
    );

  return (
    <View className="gap-4">
      <Notice
        title="Kimlik bilgisi güvenliği"
        text="Token yalnız TLS isteğinin gövdesinde backend'e iletilir, cihaz depolamasına yazılmaz ve liste yanıtlarında geri dönmez. Gönderimden sonra form belleği temizlenir."
      />
      <MetaSection
        title="Meta bağlantıları ve sağlık"
        description="Business, Page, reklam hesabı, dataset ve mesajlaşma varlıklarının doğrulama durumunu izleyin."
        actions={
          <>
            <MetaButton icon="link-outline" label="Meta ile bağlan" disabled={!canManage} loading={startOAuth.isPending} onPress={connect} />
            <MetaButton icon="add" variant="primary" label="Manuel ekle" disabled={!canManage} onPress={() => router.push('/modal/meta-connection' as Href)} />
          </>
        }
      >
        <QueryState
          loading={connections.isLoading}
          error={connections.isError}
          errorMessage={getMetaErrorMessage(connections.error)}
          onRetry={() => void connections.refetch()}
          empty={(connections.data?.length ?? 0) === 0}
          emptyIcon="link-outline"
          emptyTitle="Meta bağlantısı yok"
          emptyHint="Lead, reklam ve mesajlaşma verilerini almak için ilk işletme bağlantısını ekleyin."
        >
          {(connections.data ?? []).map((connection) => {
            const expired = tokenExpired(connection.tokenExpiresAt);
            return (
              <View key={connection.id} className="gap-2 rounded-control border border-border bg-card-subtle p-3">
                <View className="flex-row items-start gap-2">
                  <View className="flex-1">
                    <Text className="font-display text-[17px] text-foreground" numberOfLines={1}>{connection.name}</Text>
                    <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
                      {connection.businessId || connection.pageId || connection.id}
                    </Text>
                  </View>
                  <ConnectionChip status={connection.status} />
                </View>
                <View className="rounded-control border border-border bg-card px-3 py-1.5">
                  <HealthLine icon="checkmark-circle-outline" label="Son doğrulama" value={formatMetaDate(connection.lastVerifiedAt)} />
                  <HealthLine icon="refresh-outline" label="Son senkron" value={formatMetaDate(connection.lastSyncAt)} />
                  <HealthLine icon="git-network-outline" label="Son webhook" value={formatMetaDate(connection.lastWebhookAt)} />
                  <HealthLine
                    icon="time-outline"
                    label="Token süresi"
                    value={connection.tokenExpiresAt ? `${formatMetaDate(connection.tokenExpiresAt)}${expired ? ' (doldu)' : ''}` : 'Süre bilgisi yok'}
                  />
                </View>
                <View className="flex-row flex-wrap gap-x-3 gap-y-1">
                  <Text className="font-inter text-[11px] text-muted-foreground">Page: {connection.pageId || '-'}</Text>
                  <Text className="font-inter text-[11px] text-muted-foreground">IG: {connection.instagramAccountId || '-'}</Text>
                  <Text className="font-inter text-[11px] text-muted-foreground">Ads: {connection.adAccountId || '-'}</Text>
                  <Text className="font-inter text-[11px] text-muted-foreground">Dataset: {connection.datasetId || '-'}</Text>
                </View>
                {connection.lastError ? <Notice icon="pulse-outline" tone="destructive" text={connection.lastError} /> : null}
                <View className="flex-row flex-wrap gap-2">
                  <MetaButton
                    icon="refresh"
                    label="Doğrula"
                    disabled={!canManage || verify.isPending || connection.status === 'disabled'}
                    onPress={() => runVerify(connection)}
                  />
                  <MetaButton
                    icon="trash-outline"
                    variant="destructive"
                    label="Kaldır"
                    accessibilityLabel={`${connection.name} bağlantısını kaldır`}
                    disabled={!canManage || remove.isPending}
                    onPress={() => confirmDelete(connection)}
                  />
                </View>
              </View>
            );
          })}
        </QueryState>
      </MetaSection>
    </View>
  );
}
