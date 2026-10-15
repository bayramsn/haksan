import { useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { activeConnections, getMetaErrorMessage } from '@/src/api/meta.api';
import { useMetaCampaigns, useMetaConnections, useMetaInsights, useUpdateMetaCampaign } from '@/src/api/meta.hooks';
import { toast } from '@/src/ui/toast';
import {
  CAMPAIGN_STATUS_LABELS,
  formatMetaMoney,
  formatMetaNumber,
  insightTotals,
  metaDateRange,
  type MetaCampaign,
} from '@/src/ui/meta/metaNormalize';
import { ConnectionSelect, MetaButton, MetaSection, MetaStatusChip, Metric, Notice, QueryState } from '@/src/ui/meta/parts';

function CampaignStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[30%] flex-1">
      <Text className="font-inter text-[11px] text-muted-foreground">{label}</Text>
      <Text className="font-inter-semibold text-[13px] text-foreground" numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function useActiveConnectionId() {
  const connections = useMetaConnections();
  const active = useMemo(() => activeConnections(connections.data ?? []), [connections.data]);
  const [connectionId, setConnectionId] = useState('');
  useEffect(() => {
    if (!connectionId || !active.some((item) => item.id === connectionId)) setConnectionId(active[0]?.id ?? '');
  }, [active, connectionId]);
  return { connections, active, connectionId, setConnectionId };
}

export function CampaignsTab({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const { active, connectionId, setConnectionId } = useActiveConnectionId();
  const range = useMemo(() => metaDateRange(30), []);
  const campaigns = useMetaCampaigns(connectionId);
  const insights = useMetaInsights({ connectionId, ...range });
  const update = useUpdateMetaCampaign();
  const totals = insightTotals(insights.data ?? []);
  const currency = totals.currency || 'TRY';

  const confirmStatus = (campaign: MetaCampaign) => {
    const next = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    Alert.alert(
      'Kampanya durumunu değiştir',
      `${campaign.name} kampanyası ${next === 'ACTIVE' ? 'yayına alınacak' : 'duraklatılacak'}. Bu işlem reklam teslimini doğrudan etkiler.\n\nDeğişiklik Meta reklam hesabına gönderilir ve audit kaydına alınır.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Değişikliği onayla',
          style: next === 'ACTIVE' ? 'default' : 'destructive',
          onPress: () =>
            update.mutate(
              { id: campaign.id, patch: { connectionId: campaign.connectionId, status: next } },
              {
                onSuccess: () => toast.success('Kampanya güncellendi'),
                onError: (error) => toast.error(`Kampanya güncellenemedi: ${getMetaErrorMessage(error)}`),
              },
            ),
        },
      ],
    );
  };

  const openBudget = (campaign: MetaCampaign) =>
    router.push({
      pathname: '/modal/meta-campaign-budget',
      params: {
        id: campaign.id,
        connectionId: campaign.connectionId,
        name: campaign.name,
        currency: campaign.currency,
        budget: campaign.dailyBudgetMinor == null ? '' : String(campaign.dailyBudgetMinor / 100),
      },
    } as unknown as Href);

  return (
    <View className="gap-4">
      {!canManage ? (
        <Notice
          tone="warning"
          title="Salt okunur kampanya görünümü"
          text="Bütçe ve yayın durumu değişiklikleri yalnız Meta yönetim yetkisi olan kullanıcılara açıktır."
        />
      ) : null}

      <MetaSection title="Reklam performansı" description="Meta Insights verisini lead ve CRM dönüşüm sonuçlarıyla birlikte okuyun.">
        <ConnectionSelect connections={active} value={connectionId} onChange={setConnectionId} label="Reklam hesabı" />
        <View className="flex-row">
          <MetaButton
            icon="refresh"
            label="Yenile"
            disabled={!connectionId}
            loading={campaigns.isFetching || insights.isFetching}
            onPress={() => {
              void campaigns.refetch();
              void insights.refetch();
            }}
          />
        </View>
        {connectionId ? (
          <View className="flex-row flex-wrap gap-2">
            <Metric icon="cash-outline" label="Toplam harcama" value={formatMetaMoney(totals.spendMinor, currency)} />
            <Metric icon="eye-outline" label="Gösterim" value={formatMetaNumber(totals.impressions)} />
            <Metric icon="hand-left-outline" label="Tıklama" value={formatMetaNumber(totals.clicks)} />
            <Metric icon="people-outline" label="Lead" value={formatMetaNumber(totals.leads)} />
          </View>
        ) : null}
      </MetaSection>

      <MetaSection
        title="Kampanyalar"
        description="Yazma işlemleri her değişiklik için açık onay ister ve sunucu yetki kontrolünden geçer."
        actions={
          <MetaButton
            icon="add"
            variant="primary"
            label="Kampanya oluştur"
            disabled={!canManage || active.length === 0}
            onPress={() => router.push({ pathname: '/modal/meta-campaign-create', params: { connectionId } } as unknown as Href)}
          />
        }
      >
        {!connectionId ? null : (
          <QueryState
            loading={campaigns.isLoading}
            error={campaigns.isError}
            errorMessage={getMetaErrorMessage(campaigns.error)}
            onRetry={() => void campaigns.refetch()}
            empty={(campaigns.data?.length ?? 0) === 0}
            emptyIcon="megaphone-outline"
            emptyTitle="Kampanya bulunamadı"
            emptyHint="Bağlı reklam hesabı senkron edildiğinde kampanyalar burada listelenecek."
          >
            {(campaigns.data ?? []).map((campaign) => {
              const locked = !canManage || campaign.status === 'ARCHIVED';
              return (
                <View key={campaign.id} className="gap-2 rounded-control border border-border bg-card-subtle p-3">
                  <View className="flex-row items-start gap-2">
                    <View className="flex-1">
                      <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={2}>{campaign.name}</Text>
                      <Text className="font-inter text-[11px] text-muted-foreground">{campaign.objective ?? 'Hedef bilgisi yok'}</Text>
                    </View>
                    <MetaStatusChip status={campaign.status} label={CAMPAIGN_STATUS_LABELS[campaign.status] ?? 'Arşiv'} />
                  </View>
                  <View className="flex-row flex-wrap gap-y-2">
                    <CampaignStat label="Günlük bütçe" value={campaign.dailyBudgetMinor == null ? '-' : formatMetaMoney(campaign.dailyBudgetMinor, campaign.currency)} />
                    <CampaignStat label="Harcama" value={formatMetaMoney(campaign.spendMinor, campaign.currency)} />
                    <CampaignStat label="Gösterim" value={formatMetaNumber(campaign.impressions)} />
                    <CampaignStat label="Tıklama" value={formatMetaNumber(campaign.clicks)} />
                    <CampaignStat label="Lead" value={formatMetaNumber(campaign.leads)} />
                    <CampaignStat label="Nitelikli" value={formatMetaNumber(campaign.qualifiedLeads)} />
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <MetaButton
                      icon="create-outline"
                      label="Bütçe"
                      accessibilityLabel={`${campaign.name} bütçesini düzenle`}
                      disabled={locked}
                      onPress={() => openBudget(campaign)}
                    />
                    <MetaButton
                      icon={campaign.status === 'ACTIVE' ? 'pause' : 'play'}
                      label={campaign.status === 'ACTIVE' ? 'Duraklat' : 'Yayına al'}
                      accessibilityLabel={`${campaign.name} kampanyasını ${campaign.status === 'ACTIVE' ? 'duraklat' : 'yayına al'}`}
                      disabled={locked || update.isPending}
                      onPress={() => confirmStatus(campaign)}
                    />
                  </View>
                </View>
              );
            })}
          </QueryState>
        )}
      </MetaSection>
    </View>
  );
}
