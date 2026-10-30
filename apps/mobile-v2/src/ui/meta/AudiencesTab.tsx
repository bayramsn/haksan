import { Alert, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { getMetaErrorMessage } from '@/src/api/meta.api';
import { useDeleteMetaAudience, useMetaAudiences } from '@/src/api/meta.hooks';
import { toast } from '@/src/ui/toast';
import { SYNC_STATUS_LABELS, formatMetaDate, type MetaAudience } from '@/src/ui/meta/metaNormalize';
import { MetaButton, MetaSection, MetaStatusChip, Notice, QueryState } from '@/src/ui/meta/parts';

export function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="font-inter text-[11px] text-muted-foreground">{label}</Text>
      <Text className="font-inter-semibold text-[13px] text-foreground" numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function AudiencesTab({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const audiences = useMetaAudiences();
  const remove = useDeleteMetaAudience();

  const openMembers = (audience: MetaAudience, mode: 'add' | 'remove') =>
    router.push({
      pathname: '/modal/meta-audience-members',
      params: { id: audience.id, connectionId: audience.connectionId, name: audience.name, mode },
    } as unknown as Href);

  const confirmDelete = (audience: MetaAudience) =>
    Alert.alert('Özel hedef kitleyi sil', `${audience.name} hem CRM bağlantısından hem bağlı Meta hesabından silinecek. Bu işlem geri alınamaz.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kalıcı olarak sil',
        style: 'destructive',
        onPress: () =>
          remove.mutate(
            { id: audience.id, connectionId: audience.connectionId },
            {
              onSuccess: () => toast.success('Özel hedef kitle silindi'),
              onError: (error) => toast.error(`Kitle silinemedi: ${getMetaErrorMessage(error)}`),
            },
          ),
      },
    ]);

  return (
    <View className="gap-4">
      <Notice
        title="Kişisel veri koruması"
        text="Telefon ve e-posta tarayıcıdan Meta'ya gönderilmez. CRM fırsat kimlikleri sunucuda izin kontrolü ve SHA-256 eşlemesi sonrası işlenir."
      />
      <MetaSection
        title="Özel hedef kitleler"
        description="CRM segmentlerini Meta hesaplarına izinli ve denetlenebilir biçimde senkronlayın."
        actions={
          <MetaButton icon="add" variant="primary" label="Kitle oluştur" disabled={!canManage} onPress={() => router.push('/modal/meta-audience' as Href)} />
        }
      >
        <QueryState
          loading={audiences.isLoading}
          error={audiences.isError}
          errorMessage={getMetaErrorMessage(audiences.error)}
          onRetry={() => void audiences.refetch()}
          empty={(audiences.data?.length ?? 0) === 0}
          emptyIcon="people-circle-outline"
          emptyTitle="Özel hedef kitle yok"
          emptyHint="CRM segmenti senkronlamak için bağlı bir reklam hesabında kitle oluşturun."
        >
          {(audiences.data ?? []).map((audience) => (
            <View key={audience.id} className="gap-2 rounded-control border border-border bg-card-subtle p-3">
              <View className="flex-row items-start gap-2">
                <Text className="flex-1 font-display text-[17px] text-foreground" numberOfLines={1}>{audience.name}</Text>
                <MetaStatusChip status={audience.syncStatus} label={SYNC_STATUS_LABELS[audience.syncStatus] ?? 'Bekliyor'} />
              </View>
              <Text className="font-inter text-xs text-muted-foreground" numberOfLines={2}>{audience.description || 'Açıklama eklenmemiş'}</Text>
              <View className="flex-row gap-3 border-t border-border pt-2">
                <CardStat label="Tahmini üye" value="-" />
                <CardStat label="Son senkron" value={formatMetaDate(audience.lastSyncAt)} />
              </View>
              <View className="flex-row flex-wrap gap-2">
                <MetaButton icon="person-add-outline" label="Üye ekle" disabled={!canManage} onPress={() => openMembers(audience, 'add')} />
                <MetaButton
                  icon="person-remove-outline"
                  label="Üye çıkar"
                  accessibilityLabel={`${audience.name} kitlesinden üye çıkar`}
                  disabled={!canManage}
                  onPress={() => openMembers(audience, 'remove')}
                />
                <MetaButton
                  icon="trash-outline"
                  variant="destructive"
                  label="Sil"
                  accessibilityLabel={`${audience.name} kitlesini sil`}
                  disabled={!canManage || remove.isPending}
                  onPress={() => confirmDelete(audience)}
                />
              </View>
            </View>
          ))}
        </QueryState>
      </MetaSection>
    </View>
  );
}
