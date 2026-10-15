import { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getMetaErrorMessage } from '@/src/api/meta.api';
import { useMetaPermissions, useUpdateMetaCampaign } from '@/src/api/meta.hooks';
import { EmptyState, Field } from '@/src/ui';
import { ModalForm } from '@/src/ui/documents/pickers';
import { toast } from '@/src/ui/toast';
import { parseDecimal } from '@/src/ui/meta/metaNormalize';

export default function MetaCampaignBudgetModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; connectionId?: string; name?: string; currency?: string; budget?: string }>();
  const { canManageCampaigns } = useMetaPermissions();
  const [budget, setBudget] = useState((params.budget ?? '').replace('.', ','));
  const update = useUpdateMetaCampaign();
  const currency = params.currency || 'TRY';

  if (!params.id || !params.connectionId) {
    return (
      <ModalForm title="Günlük bütçeyi güncelle" submitLabel="Kapat" onSubmit={() => router.back()}>
        <EmptyState title="Kampanya bulunamadı" hint="Listeyi yenileyip tekrar açın." />
      </ModalForm>
    );
  }

  const submit = () => {
    const parsed = parseDecimal(budget);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('Geçerli bir günlük bütçe girin');
      return;
    }
    update.mutate(
      { id: params.id!, patch: { connectionId: params.connectionId!, dailyBudgetMinor: Math.round(parsed * 100) } },
      {
        onSuccess: () => {
          toast.success('Kampanya güncellendi');
          router.back();
        },
        onError: (error) => toast.error(`Kampanya güncellenemedi: ${getMetaErrorMessage(error)}`),
      },
    );
  };

  return (
    <ModalForm title="Günlük bütçeyi güncelle" submitLabel="Onaylayıp güncelle" onSubmit={submit} loading={update.isPending} disabled={!canManageCampaigns}>
      <Text className="font-inter text-sm text-muted-foreground">{params.name} için yeni günlük limiti hesap para biriminde girin.</Text>
      <Field label={`Günlük bütçe (${currency})`} value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="0,00" maxLength={14} />
      <Text className="font-inter text-xs text-muted-foreground">Bütçe sunucu tarafından alt ve üst limitlere göre yeniden doğrulanır.</Text>
    </ModalForm>
  );
}
