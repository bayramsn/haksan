import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';

import { getMetaErrorMessage } from '@/src/api/meta.api';
import { useMetaConnections, useMetaOverview } from '@/src/api/meta.hooks';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, ErrorState, Field, FilterChips, ListSkeleton } from '@/src/ui';
import {
  PLATFORM_LABELS,
  formatMetaDate,
  formatMetaMoney,
  formatMetaNumber,
  metaDateRange,
  type MetaLead,
} from '@/src/ui/meta/metaNormalize';
import { ConnectionChip, MetaButton, MetaSection, MetaStatusChip, Metric } from '@/src/ui/meta/parts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function openOpportunity(router: ReturnType<typeof useRouter>, id: string) {
  router.push(`/(tabs)/modules/opportunities/${id}` as Href);
}

export function LeadLine({ lead, onOpen, detail }: { lead: MetaLead; onOpen?: () => void; detail: string }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-3 border-t border-border py-2.5">
      <View className="h-9 w-9 items-center justify-center rounded-control bg-info-soft">
        <Ionicons name={lead.platform === 'instagram' ? 'logo-instagram' : lead.platform === 'whatsapp' ? 'logo-whatsapp' : 'logo-facebook'} size={17} color={colors.primary} />
      </View>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="shrink font-inter-semibold text-sm text-foreground" numberOfLines={1}>{lead.fullName}</Text>
          <MetaStatusChip status={lead.status} />
        </View>
        <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{detail}</Text>
        <Text className="font-inter text-[11px] text-muted-foreground">{PLATFORM_LABELS[lead.platform] ?? lead.platform} · {formatMetaDate(lead.createdAt)}</Text>
      </View>
      {lead.opportunityId && onOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${lead.fullName} CRM kaydını aç`}
          onPress={onOpen}
          className="h-11 flex-row items-center gap-1 px-2 active:opacity-60"
        >
          <Text className="font-inter-semibold text-xs text-primary">CRM</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function OverviewTab({ canOpenOpportunity }: { canOpenOpportunity: boolean }) {
  const router = useRouter();
  const initial = metaDateRange(30);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const rangeValid = DATE_RE.test(from) && DATE_RE.test(to) && from <= to;
  const params = rangeValid ? { from, to, connectionId: connectionId ?? undefined } : { ...initial, connectionId: connectionId ?? undefined };
  const connections = useMetaConnections();
  const overview = useMetaOverview(params);
  const summary = overview.data?.summary;

  return (
    <View className="gap-4">
      <MetaSection
        title="Performans özeti"
        description="Meta harcamasını CRM'deki nitelikli lead ve satış sonuçlarıyla aynı dönemde karşılaştırın."
      >
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Field label="Başlangıç tarihi" value={from} onChangeText={setFrom} placeholder="YYYY-AA-GG" autoCapitalize="none" maxLength={10} />
          </View>
          <View className="flex-1">
            <Field label="Bitiş tarihi" value={to} onChangeText={setTo} placeholder="YYYY-AA-GG" autoCapitalize="none" maxLength={10} />
          </View>
        </View>
        {!rangeValid ? <Text className="font-inter text-xs text-destructive">Tarih aralığı geçersiz; son 30 gün gösteriliyor.</Text> : null}
        {(connections.data?.length ?? 0) > 0 ? (
          <FilterChips
            allLabel="Tüm bağlantılar"
            options={(connections.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
            value={connectionId}
            onChange={setConnectionId}
          />
        ) : null}
        <View className="flex-row">
          <MetaButton icon="refresh" label="Yenile" loading={overview.isFetching} onPress={() => void overview.refetch()} />
        </View>
        {overview.isLoading ? (
          <ListSkeleton />
        ) : overview.isError ? (
          <ErrorState message={getMetaErrorMessage(overview.error)} onRetry={() => void overview.refetch()} />
        ) : (
          <View className="flex-row flex-wrap gap-2">
            <Metric icon="cash-outline" label="Harcama" value={formatMetaMoney(summary?.spendMinor, summary?.currency)} detail="Seçili dönem toplamı" />
            <Metric icon="people-outline" label="Lead" value={formatMetaNumber(summary?.leads)} detail={`${formatMetaMoney(summary?.costPerLeadMinor, summary?.currency)} lead maliyeti`} />
            <Metric icon="locate-outline" label="Nitelikli" value={formatMetaNumber(summary?.qualifiedLeads)} detail={`%${formatMetaNumber(summary?.qualificationRate)} nitelik oranı`} />
            <Metric icon="trending-up-outline" label="Dönüşüm" value={formatMetaNumber(summary?.conversions)} detail={`%${formatMetaNumber(summary?.conversionRate)} CRM dönüşümü`} />
            <Metric icon="time-outline" label="İlk yanıt" value={summary?.firstResponseMinutes == null ? '-' : `${formatMetaNumber(summary.firstResponseMinutes)} dk`} detail="Yeni lead yanıt süresi" />
          </View>
        )}
      </MetaSection>

      <MetaSection title="Son Meta lead'leri" description="Lead kaynağı, kampanya ve CRM ataması birlikte görünür.">
        {overview.isLoading ? (
          <ListSkeleton />
        ) : (overview.data?.recentLeads.length ?? 0) === 0 ? (
          <EmptyState icon="people-outline" title="Henüz Meta lead'i yok" hint="Bağlı formlardan lead geldiğinde burada CRM atamasıyla birlikte görünecek." />
        ) : (
          overview.data?.recentLeads.map((lead) => (
            <LeadLine
              key={lead.id}
              lead={lead}
              detail={`${lead.campaignName ?? lead.formName ?? 'Kampanya bilgisi yok'} / ${lead.ownerName ?? 'Atama bekliyor'}`}
              onOpen={canOpenOpportunity && lead.opportunityId ? () => openOpportunity(router, lead.opportunityId!) : undefined}
            />
          ))
        )}
      </MetaSection>

      <MetaSection title="Bağlantı sağlığı" description="Yetki, senkron ve webhook durumlarının kısa özeti.">
        {overview.isLoading ? (
          <ListSkeleton />
        ) : (overview.data?.connectionHealth.length ?? 0) === 0 ? (
          <EmptyState icon="link-outline" title="Bağlantı bulunamadı" hint="Bağlantılar sekmesinden bir Meta işletme hesabı ekleyin." />
        ) : (
          overview.data?.connectionHealth.map((item) => (
            <View key={item.connectionId} className="gap-1 rounded-control border border-border bg-card-subtle p-3">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 font-inter-semibold text-sm text-foreground" numberOfLines={1}>{item.name}</Text>
                <ConnectionChip status={item.status} />
              </View>
              <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={2}>
                {item.lastError || `Son senkron: ${formatMetaDate(item.lastSyncAt)}`}
              </Text>
            </View>
          ))
        )}
      </MetaSection>
    </View>
  );
}
