import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { getMetaErrorMessage } from '@/src/api/meta.api';
import { useMetaLeads } from '@/src/api/meta.hooks';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useTheme } from '@/src/theme/theme';
import { EmptyState, ErrorState, FilterChips, ListSkeleton, SearchBar } from '@/src/ui';
import { LEAD_STATUS_LABELS, PLATFORM_LABELS, formatMetaDate, type MetaLeadStatus, type MetaPlatform } from '@/src/ui/meta/metaNormalize';
import { openOpportunity } from '@/src/ui/meta/OverviewTab';
import { LoadMore, MetaButton, MetaSection, MetaStatusChip } from '@/src/ui/meta/parts';

const STATUS_OPTIONS = (Object.keys(LEAD_STATUS_LABELS) as MetaLeadStatus[]).map((value) => ({ value, label: LEAD_STATUS_LABELS[value] }));
const CHANNEL_OPTIONS = (['facebook', 'instagram', 'messenger', 'whatsapp'] as MetaPlatform[]).map((value) => ({ value, label: PLATFORM_LABELS[value] }));

export function LeadsTab({ canOpenOpportunity }: { canOpenOpportunity: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MetaLeadStatus | null>(null);
  const [platform, setPlatform] = useState<MetaPlatform | null>(null);
  const q = useDebouncedValue(search.trim());
  const leads = useMetaLeads({ search: q || undefined, status: status ?? undefined, platform: platform ?? undefined });
  const items = leads.data?.pages.flatMap((page) => page.items) ?? [];
  const total = leads.data?.pages.at(-1)?.total ?? 0;
  const filtersActive = Boolean(q || status || platform);
  const reset = () => {
    setSearch('');
    setStatus(null);
    setPlatform(null);
  };

  return (
    <MetaSection title="Meta lead akışı" description="Form lead'lerini sunucu tarafında filtreleyin, atamaları görün ve ilgili CRM kaydına geçin.">
      <View className="-mx-4 gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Ad, telefon, e-posta veya kampanya ara" />
        <FilterChips allLabel="Tüm durumlar" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        <FilterChips allLabel="Tüm kanallar" options={CHANNEL_OPTIONS} value={platform} onChange={setPlatform} />
      </View>
      {filtersActive ? (
        <View className="flex-row">
          <MetaButton icon="close" variant="ghost" label="Filtreleri temizle" onPress={reset} />
        </View>
      ) : null}
      {leads.isLoading ? (
        <ListSkeleton />
      ) : leads.isError ? (
        <ErrorState message={getMetaErrorMessage(leads.error)} onRetry={() => void leads.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={filtersActive ? 'Filtreye uygun lead yok' : "Henüz Meta lead'i yok"}
          hint={filtersActive ? 'Arama veya filtreleri değiştirerek yeniden deneyin.' : 'Lead Ads formlarından gelen kayıtlar burada görünecek.'}
          actionLabel={filtersActive ? 'Filtreleri temizle' : undefined}
          onAction={filtersActive ? reset : undefined}
        />
      ) : (
        <View>
          {items.map((lead) => {
            const canOpen = canOpenOpportunity && Boolean(lead.opportunityId);
            return (
              <Pressable
                key={lead.id}
                accessibilityRole="button"
                accessibilityLabel={lead.opportunityId ? `${lead.fullName} CRM kaydını aç` : `${lead.fullName}, CRM kaydı henüz oluşmadı`}
                accessibilityState={{ disabled: !canOpen }}
                disabled={!canOpen}
                onPress={() => openOpportunity(router, lead.opportunityId!)}
                className="min-h-[44px] gap-1 border-t border-border py-3 active:opacity-70"
              >
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 font-inter-semibold text-sm text-foreground" numberOfLines={1}>{lead.fullName}</Text>
                  <MetaStatusChip status={lead.status} />
                  {canOpen ? <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} /> : null}
                </View>
                <Text className="font-inter text-xs text-muted-foreground" numberOfLines={1}>{lead.phone || lead.email || 'İletişim bilgisi yok'}</Text>
                <Text className="font-inter text-xs text-foreground" numberOfLines={1}>
                  {lead.campaignName ?? 'Kampanya yok'} · <Text className="text-muted-foreground">{lead.formName ?? 'Form bilgisi yok'}</Text>
                </Text>
                <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>
                  {PLATFORM_LABELS[lead.platform] ?? lead.platform} · {lead.ownerName ?? 'Atama bekliyor'} · {lead.opportunityId ? 'CRM kaydı oluştu' : 'İşleme alınıyor'} · {formatMetaDate(lead.createdAt)}
                </Text>
              </Pressable>
            );
          })}
          <LoadMore
            caption={`${items.length} / ${Math.max(total, items.length)} kayıt`}
            visible={Boolean(leads.hasNextPage)}
            loading={leads.isFetchingNextPage}
            onPress={() => void leads.fetchNextPage()}
          />
        </View>
      )}
    </MetaSection>
  );
}
