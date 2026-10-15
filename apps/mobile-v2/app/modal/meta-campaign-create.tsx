import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { activeConnections, getMetaErrorMessage } from '@/src/api/meta.api';
import { useCreateMetaCampaign, useMetaConnections, useMetaPermissions } from '@/src/api/meta.hooks';
import { Field } from '@/src/ui';
import { ChoiceChips, ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { CAMPAIGN_OBJECTIVES, parseDecimal } from '@/src/ui/meta/metaNormalize';
import { ConfirmCheck, ConnectionSelect } from '@/src/ui/meta/parts';

type Objective = (typeof CAMPAIGN_OBJECTIVES)[number]['value'];

export default function MetaCampaignCreateModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ connectionId?: string }>();
  const { canManageCampaigns } = useMetaPermissions();
  const connections = useMetaConnections();
  const active = useMemo(() => activeConnections(connections.data ?? []), [connections.data]);
  const [connectionId, setConnectionId] = useState(params.connectionId ?? '');
  const [name, setName] = useState('');
  const [objective, setObjective] = useState<Objective>('OUTCOME_LEADS');
  const [dailyBudget, setDailyBudget] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const create = useCreateMetaCampaign();

  const submit = () => {
    const budget = parseDecimal(dailyBudget);
    if (!connectionId || name.trim().length < 2 || !Number.isFinite(budget) || budget <= 0) {
      toast.error('Hesap, kampanya adı ve günlük bütçe alanlarını kontrol edin');
      return;
    }
    if (!confirmed) {
      toast.error('Reklam hesabı etkisini onaylamanız gerekiyor');
      return;
    }
    create.mutate(
      { connectionId, name: name.trim(), objective, dailyBudgetMinor: Math.round(budget * 100) },
      {
        onSuccess: () => {
          toast.success('Kampanya oluşturuldu');
          router.back();
        },
        onError: (error) => toast.error(`Kampanya oluşturulamadı: ${getMetaErrorMessage(error)}`),
      },
    );
  };

  return (
    <ModalForm
      title="Meta kampanyası oluştur"
      submitLabel={create.isPending ? 'Oluşturuluyor' : 'Onaylayıp oluştur'}
      onSubmit={submit}
      loading={create.isPending}
      disabled={!canManageCampaigns || !confirmed}
    >
      <Text className="font-inter text-sm text-muted-foreground">
        Yeni kampanyayı bağlı reklam hesabında oluşturun. Secret ve erişim token'ı uygulamaya aktarılmaz.
      </Text>
      <ConnectionSelect connections={active} value={connectionId} onChange={setConnectionId} label="Reklam hesabı" />
      <Field label="Kampanya adı" value={name} onChangeText={setName} maxLength={120} />
      <ChoiceChips label="Hedef" options={CAMPAIGN_OBJECTIVES.map((item) => ({ value: item.value, label: item.label }))} value={objective} onChange={setObjective} />
      <Field label="Günlük bütçe" value={dailyBudget} onChangeText={setDailyBudget} keyboardType="decimal-pad" placeholder="0,00" maxLength={14} />
      <ConfirmCheck
        checked={confirmed}
        onChange={setConfirmed}
        text="Bu işlemin bağlı reklam hesabında bütçeli, duraklatılmış bir kampanya oluşturacağını onaylıyorum. Yayına alma ayrıca onaylanır."
      />
    </ModalForm>
  );
}
