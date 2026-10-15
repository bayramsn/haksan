import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';

import { activeConnections, getMetaErrorMessage } from '@/src/api/meta.api';
import { useCreateMetaMapping, useMetaConnections, useMetaPermissions } from '@/src/api/meta.hooks';
import { Field } from '@/src/ui';
import { ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { DEFAULT_FIELD_MAPPINGS } from '@/src/ui/meta/metaNormalize';
import { ConnectionSelect, Notice } from '@/src/ui/meta/parts';

export default function MetaMappingModal() {
  const router = useRouter();
  const { canManageAutomation } = useMetaPermissions();
  const connections = useMetaConnections();
  const active = useMemo(() => activeConnections(connections.data ?? []), [connections.data]);
  const [connectionId, setConnectionId] = useState('');
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const create = useCreateMetaMapping();

  const submit = () => {
    if (!connectionId || !formId.trim() || !formName.trim()) {
      toast.error('Bağlantı, form kimliği ve form adı zorunludur');
      return;
    }
    create.mutate(
      { connectionId, formId: formId.trim(), formName: formName.trim(), isActive: true, fieldMappings: { ...DEFAULT_FIELD_MAPPINGS } },
      {
        onSuccess: () => {
          toast.success('Form eşlemesi oluşturuldu');
          router.back();
        },
        onError: (error) => toast.error(`Form eşlemesi oluşturulamadı: ${getMetaErrorMessage(error)}`),
      },
    );
  };

  return (
    <ModalForm title="Lead formunu eşle" submitLabel="Eşlemeyi oluştur" onSubmit={submit} loading={create.isPending} disabled={!canManageAutomation}>
      <Text className="font-inter text-sm text-muted-foreground">Varsayılan kişisel bilgi alanları CRM alanlarına sunucuda allowlist ile aktarılır.</Text>
      <ConnectionSelect connections={active} value={connectionId} onChange={setConnectionId} label="Meta bağlantısı" />
      <Field label="Form kimliği" value={formId} onChangeText={setFormId} autoCapitalize="none" autoCorrect={false} maxLength={64} />
      <Field label="Form adı" value={formName} onChangeText={setFormName} maxLength={160} />
      <Notice
        icon="options-outline"
        text="Ad, e-posta, telefon ve şehir alanları varsayılan eşlemeyle kaydedilir. Ham Meta payload'ı istemciye taşınmaz."
      />
    </ModalForm>
  );
}
