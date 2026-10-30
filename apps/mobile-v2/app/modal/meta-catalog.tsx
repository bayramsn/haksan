import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';

import { activeConnections, getMetaErrorMessage } from '@/src/api/meta.api';
import { useCreateMetaCatalog, useMetaConnections, useMetaPermissions } from '@/src/api/meta.hooks';
import { Field } from '@/src/ui';
import { ChoiceChips, ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { ConnectionSelect } from '@/src/ui/meta/parts';

type Vertical = 'commerce' | 'vehicles';

export default function MetaCatalogModal() {
  const router = useRouter();
  const { canManageCatalogs } = useMetaPermissions();
  const connections = useMetaConnections();
  const active = useMemo(() => activeConnections(connections.data ?? []), [connections.data]);
  const [connectionId, setConnectionId] = useState('');
  const [name, setName] = useState('');
  const [vertical, setVertical] = useState<Vertical>('commerce');
  const create = useCreateMetaCatalog();

  const submit = () => {
    if (!connectionId || !name.trim()) {
      toast.error('Bağlantı ve katalog adı zorunludur');
      return;
    }
    create.mutate(
      { connectionId, name: name.trim(), vertical },
      {
        onSuccess: () => {
          toast.success('Meta kataloğu oluşturuldu');
          router.back();
        },
        onError: (error) => toast.error(`Katalog oluşturulamadı: ${getMetaErrorMessage(error)}`),
      },
    );
  };

  return (
    <ModalForm title="Meta kataloğu oluştur" submitLabel="Kataloğu oluştur" onSubmit={submit} loading={create.isPending} disabled={!canManageCatalogs}>
      <Text className="font-inter text-sm text-muted-foreground">Katalog bağlı işletme hesabında oluşturulur. Ürün aktarımı sonraki adımda yapılır.</Text>
      <ConnectionSelect connections={active} value={connectionId} onChange={setConnectionId} label="İşletme bağlantısı" />
      <Field label="Katalog adı" value={name} onChangeText={setName} maxLength={100} />
      <ChoiceChips
        label="Dikey"
        options={[
          { value: 'commerce' as Vertical, label: 'Ticaret' },
          { value: 'vehicles' as Vertical, label: 'Araç' },
        ]}
        value={vertical}
        onChange={setVertical}
      />
    </ModalForm>
  );
}
