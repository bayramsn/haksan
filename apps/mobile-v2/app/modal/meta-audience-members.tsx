import { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getMetaErrorMessage } from '@/src/api/meta.api';
import { useMetaAudienceMembers, useMetaPermissions } from '@/src/api/meta.hooks';
import { EmptyState, Field } from '@/src/ui';
import { ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { parseIds } from '@/src/ui/meta/metaNormalize';
import { ConfirmCheck } from '@/src/ui/meta/parts';

export default function MetaAudienceMembersModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; connectionId?: string; name?: string; mode?: string }>();
  const remove = params.mode === 'remove';
  const { canManageAudiences } = useMetaPermissions();
  const [ids, setIds] = useState('');
  const [legalBasis, setLegalBasis] = useState(false);
  const mutation = useMetaAudienceMembers();
  const parsed = parseIds(ids);
  const title = remove ? 'Kitleden üye çıkar' : 'Kitleye üye ekle';

  if (!params.id || !params.connectionId) {
    return (
      <ModalForm title={title} submitLabel="Kapat" onSubmit={() => router.back()}>
        <EmptyState title="Kitle bulunamadı" hint="Listeyi yenileyip tekrar açın." />
      </ModalForm>
    );
  }

  const submit = () => {
    if (parsed.length === 0) {
      toast.error('En az bir CRM fırsat kimliği girin');
      return;
    }
    if (!remove && !legalBasis) {
      toast.error('İzinli veri kullanımını onaylamanız gerekiyor');
      return;
    }
    mutation.mutate(
      { id: params.id!, connectionId: params.connectionId!, opportunityIds: parsed, remove },
      {
        onSuccess: (result) => {
          toast.success(`Kitle üyeleri güncellendi: ${result.accepted ?? parsed.length} kayıt işleme alındı.`);
          router.back();
        },
        onError: (error) => toast.error(`Kitle üyeleri güncellenemedi: ${getMetaErrorMessage(error)}`),
      },
    );
  };

  return (
    <ModalForm
      title={title}
      submitLabel={remove ? 'Üyeleri çıkar' : 'Onaylayıp ekle'}
      onSubmit={submit}
      loading={mutation.isPending}
      disabled={!canManageAudiences || (!remove && !legalBasis)}
    >
      <Text className="font-inter text-sm text-muted-foreground">
        {params.name ? `${params.name} · ` : ''}CRM fırsat kimliklerini virgül, boşluk veya yeni satırla ayırın.
      </Text>
      <Field
        label="CRM fırsat kimlikleri"
        value={ids}
        onChangeText={setIds}
        placeholder={'fırsat-kimliği-1\nfırsat-kimliği-2'}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        textAlignVertical="top"
        maxLength={20000}
        style={{ minHeight: 140 }}
      />
      <Text className="font-inter text-xs text-muted-foreground">{parsed.length} benzersiz kayıt</Text>
      {!remove ? (
        <ConfirmCheck
          checked={legalBasis}
          onChange={setLegalBasis}
          text="Bu segmentteki kişilerin reklam hedefleme aktarımı için geçerli rıza veya hukuki dayanağı olduğunu onaylıyorum."
        />
      ) : null}
    </ModalForm>
  );
}
