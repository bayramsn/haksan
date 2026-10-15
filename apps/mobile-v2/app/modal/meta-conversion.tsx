import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';

import { activeConnections, getMetaErrorMessage } from '@/src/api/meta.api';
import { useCreateMetaConversion, useMetaConnections, useMetaPermissions } from '@/src/api/meta.hooks';
import { Field } from '@/src/ui';
import { ChoiceChips, ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { CONVERSION_EVENTS, parseDecimal } from '@/src/ui/meta/metaNormalize';
import { ConfirmCheck, ConnectionSelect } from '@/src/ui/meta/parts';

type EventName = (typeof CONVERSION_EVENTS)[number]['value'];
type Currency = 'TRY' | 'USD' | 'EUR';

export default function MetaConversionModal() {
  const router = useRouter();
  const { canManageAutomation } = useMetaPermissions();
  const connections = useMetaConnections();
  const datasets = useMemo(() => activeConnections(connections.data ?? []).filter((item) => item.datasetId), [connections.data]);
  const [connectionId, setConnectionId] = useState('');
  const [opportunityId, setOpportunityId] = useState('');
  const [eventName, setEventName] = useState<EventName>('QualifiedLead');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [value, setValue] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const create = useCreateMetaConversion();

  const submit = () => {
    const amount = value.trim() ? parseDecimal(value) : undefined;
    const opportunity = opportunityId.trim();
    if (!connectionId || !opportunity || !confirmed || (amount !== undefined && (!Number.isFinite(amount) || amount < 0))) {
      toast.error('Fırsat kimliği, onay ve tutar alanlarını kontrol edin');
      return;
    }
    create.mutate(
      {
        connectionId,
        opportunityId: opportunity,
        eventName,
        occurredAt: new Date().toISOString(),
        value: amount,
        currency: amount === undefined ? undefined : currency,
        eventId: `crm-${opportunity}-${eventName}-${Date.now()}`,
      },
      {
        onSuccess: () => {
          toast.success('Dönüşüm olayı kuyruğa alındı');
          router.back();
        },
        onError: (error) => toast.error(`Dönüşüm olayı oluşturulamadı: ${getMetaErrorMessage(error)}`),
      },
    );
  };

  return (
    <ModalForm
      title="CAPI olayı gönder"
      submitLabel="Onaylayıp kuyruğa al"
      onSubmit={submit}
      loading={create.isPending}
      disabled={!canManageAutomation || !confirmed}
    >
      <Text className="font-inter text-sm text-muted-foreground">Seçili CRM fırsatı için dönüşüm sinyalini kuyruğa ekleyin.</Text>
      <ConnectionSelect
        connections={datasets}
        value={connectionId}
        onChange={setConnectionId}
        label="Meta dataset bağlantısı"
        emptyText="Dataset tanımlı aktif Meta bağlantısı yok."
      />
      <Field label="CRM fırsat kimliği" value={opportunityId} onChangeText={setOpportunityId} autoCapitalize="none" autoCorrect={false} maxLength={64} />
      <ChoiceChips label="Olay" options={CONVERSION_EVENTS.map((item) => ({ value: item.value, label: item.label }))} value={eventName} onChange={setEventName} />
      <ChoiceChips
        label="Para birimi"
        options={(['TRY', 'USD', 'EUR'] as Currency[]).map((item) => ({ value: item, label: item }))}
        value={currency}
        onChange={setCurrency}
      />
      <Field label="Dönüşüm değeri (isteğe bağlı)" value={value} onChangeText={setValue} keyboardType="decimal-pad" maxLength={14} />
      <ConfirmCheck checked={confirmed} onChange={setConfirmed} text="Bu CRM olayının Meta reklam optimizasyonuna sinyal olarak gönderileceğini onaylıyorum." />
    </ModalForm>
  );
}
