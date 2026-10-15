import { Alert, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { getMetaErrorMessage, type MetaCatalogProductAction } from '@/src/api/meta.api';
import { useDeleteMetaCatalog, useMetaCatalogs } from '@/src/api/meta.hooks';
import { toast } from '@/src/ui/toast';
import { SYNC_STATUS_LABELS, formatMetaDate, formatMetaNumber, type MetaCatalog } from '@/src/ui/meta/metaNormalize';
import { CardStat } from '@/src/ui/meta/AudiencesTab';
import { MetaButton, MetaSection, MetaStatusChip, Notice, QueryState } from '@/src/ui/meta/parts';

export function CatalogsTab({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const catalogs = useMetaCatalogs();
  const remove = useDeleteMetaCatalog();

  const openProducts = (catalog: MetaCatalog, mode: MetaCatalogProductAction) =>
    router.push({
      pathname: '/modal/meta-catalog-products',
      params: { id: catalog.id, connectionId: catalog.connectionId, name: catalog.name, mode },
    } as unknown as Href);

  const confirmDelete = (catalog: MetaCatalog) =>
    Alert.alert('Meta kataloğunu sil', `${catalog.name} ve CRM bağlantısı Meta hesabından kaldırılacak. Bu işlem geri alınamaz.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kalıcı olarak sil',
        style: 'destructive',
        onPress: () =>
          remove.mutate(
            { id: catalog.id, connectionId: catalog.connectionId },
            {
              onSuccess: () => toast.success('Meta kataloğu silindi'),
              onError: (error) => toast.error(`Katalog silinemedi: ${getMetaErrorMessage(error)}`),
            },
          ),
      },
    ]);

  return (
    <View className="gap-4">
      <Notice
        title="Sunucu kontrollü ürün aktarımı"
        text="Fiyat, stok, görsel ve ürün bağlantıları CRM ürün kimliği üzerinden sunucuda doğrulanır. Uygulama doğrudan Meta Graph API'ye bağlanmaz."
      />
      <MetaSection
        title="Meta ürün katalogları"
        description="CRM ürünlerini katalog reklamlarına aktarın, güncelleyin veya katalogdan çıkarın."
        actions={
          <MetaButton icon="add" variant="primary" label="Katalog oluştur" disabled={!canManage} onPress={() => router.push('/modal/meta-catalog' as Href)} />
        }
      >
        <QueryState
          loading={catalogs.isLoading}
          error={catalogs.isError}
          errorMessage={getMetaErrorMessage(catalogs.error)}
          onRetry={() => void catalogs.refetch()}
          empty={(catalogs.data?.length ?? 0) === 0}
          emptyIcon="cube-outline"
          emptyTitle="Katalog bulunamadı"
          emptyHint="Bağlı Meta işletme hesabında ilk ürün kataloğunu oluşturun."
        >
          {(catalogs.data ?? []).map((catalog) => (
            <View key={catalog.id} className="gap-2 rounded-control border border-border bg-card-subtle p-3">
              <View className="flex-row items-start gap-2">
                <View className="flex-1">
                  <Text className="font-display text-[17px] text-foreground" numberOfLines={1}>{catalog.name}</Text>
                  <Text className="font-inter text-xs text-muted-foreground">{catalog.vertical ?? 'COMMERCE'}</Text>
                </View>
                <MetaStatusChip status={catalog.syncStatus} label={SYNC_STATUS_LABELS[catalog.syncStatus] ?? 'Bekliyor'} />
              </View>
              <View className="flex-row gap-3 border-t border-border pt-2">
                <CardStat label="Ürün" value={formatMetaNumber(catalog.productCount)} />
                <CardStat label="Son senkron" value={formatMetaDate(catalog.lastSyncAt)} />
              </View>
              <View className="flex-row flex-wrap gap-2">
                <MetaButton icon="add-circle-outline" label="Ürün ekle" disabled={!canManage} onPress={() => openProducts(catalog, 'upsert')} />
                <MetaButton
                  icon="sync-outline"
                  label="Tam senkron"
                  accessibilityLabel={`${catalog.name} ürünlerini tam senkronla`}
                  disabled={!canManage}
                  onPress={() => openProducts(catalog, 'sync')}
                />
                <MetaButton
                  icon="trash-outline"
                  variant="destructive"
                  label="Sil"
                  accessibilityLabel={`${catalog.name} kataloğunu sil`}
                  disabled={!canManage || remove.isPending}
                  onPress={() => confirmDelete(catalog)}
                />
              </View>
              <MetaButton icon="remove-circle-outline" variant="ghost" label="Seçili ürünleri çıkar" disabled={!canManage} onPress={() => openProducts(catalog, 'remove')} />
            </View>
          ))}
        </QueryState>
      </MetaSection>
    </View>
  );
}
