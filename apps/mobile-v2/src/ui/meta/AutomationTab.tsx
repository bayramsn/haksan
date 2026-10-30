import { Alert, Switch, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { getMetaErrorMessage } from '@/src/api/meta.api';
import { useMetaConversionEvents, useMetaMappings, useProcessMetaJobs, useToggleMetaMapping } from '@/src/api/meta.hooks';
import { useTheme } from '@/src/theme/theme';
import { Chip } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { formatMetaDate, formatMetaMoney } from '@/src/ui/meta/metaNormalize';
import { LoadMore, MetaButton, MetaSection, MetaStatusChip, QueryState } from '@/src/ui/meta/parts';

export function AutomationTab({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const mappings = useMetaMappings();
  const events = useMetaConversionEvents();
  const toggle = useToggleMetaMapping();
  const processJobs = useProcessMetaJobs();
  const eventItems = events.data?.pages.flatMap((page) => page.items) ?? [];
  const eventTotal = events.data?.pages.at(-1)?.total ?? 0;

  const confirmProcess = () =>
    Alert.alert(
      'Meta iş kuyruğunu işle',
      'Bekleyen ve yeniden denenebilir webhook, CAPI ve senkron işlerini şimdi çalıştırır.\n\nBu yönetim işlemi dış Meta API istekleri ve kota tüketimi oluşturabilir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İşleri çalıştır',
          onPress: () =>
            processJobs.mutate(undefined, {
              onSuccess: (result) => toast.success(`Meta işleri işlendi: ${result.processed} işlendi, ${result.failed} başarısız.`),
              onError: (error) => toast.error(`Meta işleri işlenemedi: ${getMetaErrorMessage(error)}`),
            }),
        },
      ],
    );

  return (
    <View className="gap-4">
      <MetaSection
        title="Lead form otomasyonları"
        description="Meta form alanlarını CRM alanlarına eşleyin ve kaynak bazlı atama akışını etkinleştirin."
        actions={
          <MetaButton icon="add" variant="primary" label="Form eşle" disabled={!canManage} onPress={() => router.push('/modal/meta-mapping' as Href)} />
        }
      >
        <QueryState
          loading={mappings.isLoading}
          error={mappings.isError}
          errorMessage={getMetaErrorMessage(mappings.error)}
          onRetry={() => void mappings.refetch()}
          empty={(mappings.data?.length ?? 0) === 0}
          emptyIcon="git-merge-outline"
          emptyTitle="Form eşlemesi yok"
          emptyHint="Bir Meta lead formunu CRM alanları ve kaynak koduyla eşleyerek otomasyonu başlatın."
        >
          {(mappings.data ?? []).map((mapping) => (
            <View key={mapping.id} className="gap-1.5 border-t border-border py-3">
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Text className="font-inter-semibold text-sm text-foreground" numberOfLines={1}>{mapping.formName}</Text>
                  <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>{mapping.formId} · meta_lead_ads</Text>
                </View>
                <Switch
                  accessibilityLabel={`${mapping.formName} otomasyonunu ${mapping.isActive ? 'durdur' : 'etkinleştir'}`}
                  value={mapping.isActive}
                  disabled={!canManage || toggle.isPending}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  onValueChange={(isActive) =>
                    toggle.mutate(
                      { id: mapping.id, isActive },
                      {
                        onSuccess: () => toast.success('Otomasyon durumu güncellendi'),
                        onError: (error) => toast.error(`Otomasyon güncellenemedi: ${getMetaErrorMessage(error)}`),
                      },
                    )
                  }
                />
              </View>
              <View className="flex-row flex-wrap gap-1">
                {Object.entries(mapping.fieldMappings)
                  .slice(0, 4)
                  .map(([from, to]) => (
                    <Chip key={from} tone="neutral" label={`${from} → ${to}`} />
                  ))}
              </View>
              <Text className="font-inter text-[11px] text-muted-foreground">Son lead: {formatMetaDate(mapping.lastLeadAt)}</Text>
            </View>
          ))}
        </QueryState>
      </MetaSection>

      <MetaSection
        title="Conversions API olayları"
        description="CRM nitelik ve satış sinyallerini sunucu tarafında eşleyip Meta'ya güvenli biçimde iletin."
        actions={
          <>
            <MetaButton icon="refresh" label="Kuyruğu işle" disabled={!canManage} loading={processJobs.isPending} onPress={confirmProcess} />
            <MetaButton icon="send" variant="primary" label="Olay gönder" disabled={!canManage} onPress={() => router.push('/modal/meta-conversion' as Href)} />
          </>
        }
      >
        <QueryState
          loading={events.isLoading}
          error={events.isError}
          errorMessage={getMetaErrorMessage(events.error)}
          onRetry={() => void events.refetch()}
          empty={eventItems.length === 0}
          emptyIcon="pulse-outline"
          emptyTitle="Dönüşüm olayı yok"
          emptyHint="CRM aşamaları tetiklendiğinde CAPI olayları burada izlenecek."
        >
          {eventItems.map((event) => (
            <View key={event.id} className="gap-1 border-t border-border py-3">
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 font-inter-semibold text-sm text-foreground" numberOfLines={1}>{event.eventName}</Text>
                <MetaStatusChip status={event.status} />
              </View>
              <Text className="font-inter text-[11px] text-muted-foreground" numberOfLines={1}>Fırsat: {event.opportunityId}</Text>
              <Text className="font-inter text-xs text-foreground">
                Değer: {event.valueMinor == null ? '-' : formatMetaMoney(event.valueMinor, event.currency ?? 'TRY')} · Deneme: {event.retryCount}
              </Text>
              <Text className="font-inter text-[11px] text-muted-foreground">Oluşma: {formatMetaDate(event.occurredAt)}</Text>
              {event.lastError ? <Text className="font-inter text-xs text-destructive" numberOfLines={2}>{event.lastError}</Text> : null}
            </View>
          ))}
          <LoadMore
            caption={`${eventItems.length} / ${Math.max(eventTotal, eventItems.length)} kayıt`}
            visible={Boolean(events.hasNextPage)}
            loading={events.isFetchingNextPage}
            onPress={() => void events.fetchNextPage()}
          />
        </QueryState>
      </MetaSection>
    </View>
  );
}
