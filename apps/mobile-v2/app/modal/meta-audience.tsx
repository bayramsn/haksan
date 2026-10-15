import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';

import { activeConnections, getMetaErrorMessage } from '@/src/api/meta.api';
import { useCreateMetaAudience, useMetaConnections, useMetaPermissions } from '@/src/api/meta.hooks';
import { Field } from '@/src/ui';
import { ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { ConnectionSelect } from '@/src/ui/meta/parts';

export default function MetaAudienceModal() {
  const router = useRouter();
  const { canManageAudiences } = useMetaPermissions();
  const connections = useMetaConnections();
  const active = useMemo(() => activeConnections(connections.data ?? []), [connections.data]);
  const [connectionId, setConnectionId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useCreateMetaAudience();

  const submit = () => {
    if (!connectionId || !name.trim()) {
      toast.error('Bağlantı ve kitle adı zorunludur');
      return;
    }
    create.mutate(
      { connectionId, name: name.trim(), description: description.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Özel hedef kitle oluşturuldu');
          router.back();
        },
        onError: (error) => toast.error(`Kitle oluşturulamadı: ${getMetaErrorMessage(error)}`),
      },
    );
  };

  return (
    <ModalForm title="Özel hedef kitle oluştur" submitLabel="Kitleyi oluştur" onSubmit={submit} loading={create.isPending} disabled={!canManageAudiences}>
      <Text className="font-inter text-sm text-muted-foreground">Kitle Meta reklam hesabında oluşturulur. Üyeler ayrı ve onaylı bir işlemle eklenir.</Text>
      <ConnectionSelect connections={active} value={connectionId} onChange={setConnectionId} label="Reklam hesabı" />
      <Field label="Kitle adı" value={name} onChangeText={setName} maxLength={100} />
      <Field label="Açıklama" value={description} onChangeText={setDescription} maxLength={300} multiline textAlignVertical="top" style={{ minHeight: 96 }} />
    </ModalForm>
  );
}
