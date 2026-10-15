import { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getMetaErrorMessage, type MetaCatalogProductAction } from '@/src/api/meta.api';
import { useMetaCatalogProducts, useMetaPermissions } from '@/src/api/meta.hooks';
import { EmptyState, Field } from '@/src/ui';
import { ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { parseIds } from '@/src/ui/meta/metaNormalize';

const TITLES: Record<MetaCatalogProductAction, string> = {
  remove: 'Ürünleri katalogdan çıkar',
  sync: 'Kataloğu tam senkronla',
  upsert: 'Ürünleri ekle veya güncelle',
};

const SUBMIT_LABELS: Record<MetaCatalogProductAction, string> = {
  remove: 'Ürünleri çıkar',
  sync: 'Tam senkronu başlat',
  upsert: 'Ürünleri aktar',
};

export default function MetaCatalogProductsModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; connectionId?: string; name?: string; mode?: string }>();
  const mode: MetaCatalogProductAction = params.mode === 'remove' || params.mode === 'sync' ? params.mode : 'upsert';
  const { canManageCatalogs } = useMetaPermissions();
  const [ids, setIds] = useState('');
  const mutation = useMetaCatalogProducts();
  const parsed = parseIds(ids);

  if (!params.id || !params.connectionId) {
    return (
      <ModalForm title={TITLES[mode]} submitLabel="Kapat" onSubmit={() => router.back()}>
        <EmptyState title="Katalog bulunamadı" hint="Listeyi yenileyip tekrar açın." />
      </ModalForm>
    );
  }

  const submit = () => {
    if (parsed.length === 0) {
      toast.error('En az bir CRM ürün kimliği girin');
      return;
    }
    mutation.mutate(
      { id: params.id!, action: mode, connectionId: params.connectionId!, productIds: parsed },
      {
        onSuccess: (result) => {
          toast.success(`Katalog ürünleri işleme alındı: ${result.accepted ?? parsed.length} kayıt kabul edildi.`);
          router.back();
        },
        onError: (error) => toast.error(`Katalog ürünleri güncellenemedi: ${getMetaErrorMessage(error)}`),
      },
    );
  };

  return (
    <ModalForm title={TITLES[mode]} submitLabel={SUBMIT_LABELS[mode]} onSubmit={submit} loading={mutation.isPending} disabled={!canManageCatalogs}>
      <Text className="font-inter text-sm text-muted-foreground">
        {params.name ? `${params.name} · ` : ''}CRM ürün kimliklerini virgül, boşluk veya yeni satırla ayırın. Sunucu ürün verilerini yeniden doğrular.
      </Text>
      <Field
        label="CRM ürün kimlikleri"
        value={ids}
        onChangeText={setIds}
        placeholder={'ürün-kimliği-1\nürün-kimliği-2'}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        textAlignVertical="top"
        maxLength={20000}
        style={{ minHeight: 140 }}
      />
      <Text className="font-inter text-xs text-muted-foreground">{parsed.length} benzersiz ürün</Text>
    </ModalForm>
  );
}
