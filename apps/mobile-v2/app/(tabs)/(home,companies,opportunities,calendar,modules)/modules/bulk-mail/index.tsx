import { MAIL_CAMPAIGN_MAX_RECIPIENTS } from '@haksan/shared';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCan } from '@/src/auth/AuthProvider';
import { useMailCampaigns } from '@/src/api/mail-campaigns.hooks';
import { formatDateTime } from '@/src/lib/format';
import { EmptyState, ErrorState, Fab, ListRow, ListSkeleton, SCREEN_PAD, ScreenHeader } from '@/src/ui';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { progressText, statusMeta } from '@/src/ui/bulk-mail/bulkMailLogic';

/** Web BulkMailPage: kampanya listesi + ret listesi + yeni toplu mail. */
export default function BulkMailScreen() {
  const bottomInset = useNavigationBottomInset();
  const router = useRouter();
  const canSend = useCan('mail_campaigns.create');
  const campaigns = useMailCampaigns();
  const openNew = () => router.push('/modules/bulk-mail/new' as Href);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Toplu Mail"
        subtitle="Kontaklara ve listelere kendi hesabınızdan katalog ve duyuru"
        actions={[{ icon: 'ban-outline', label: 'Ret listesi', onPress: () => router.push('/modules/bulk-mail/suppressions' as Href) }]}
      />
      {campaigns.isPending ? (
        <ListSkeleton />
      ) : !campaigns.data ? (
        <ErrorState message={campaigns.error?.message || 'Toplu mailler yüklenemedi'} onRetry={() => void campaigns.refetch()} />
      ) : (
        <FlashList
          style={{ flex: 1 }}
          data={campaigns.data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingBottom: bottomInset + 88 }}
          ListHeaderComponent={
            <View className="gap-2 pb-2">
              {campaigns.error ? (
                <Text accessibilityLiveRegion="polite" className="font-inter text-xs text-destructive">
                  Liste yenilenemedi: {campaigns.error.message}
                </Text>
              ) : null}
              <Text className="font-inter text-[13px] leading-[19px] text-muted-foreground">
                Her alıcıya ayrı e-posta, kendi webmail hesabınızdan gider (dakikada ~20). Tek gönderimde en fazla {MAIL_CAMPAIGN_MAX_RECIPIENTS} alıcı.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const status = statusMeta(item.status);
            return (
              <ListRow
                title={item.subject}
                icon="mail-outline"
                iconTone={status.tone}
                lines={[item.createdByName ?? '—', formatDateTime(item.createdAt)]}
                chip={{ label: status.label, tone: status.tone }}
                metaLabel="Gönderilen"
                trailing={progressText(item)}
                trailingTone={item.failed ? 'destructive' : 'neutral'}
                onPress={() => router.push(`/modules/bulk-mail/${encodeURIComponent(item.id)}` as Href)}
              />
            );
          }}
          refreshing={campaigns.isRefetching}
          onRefresh={() => void campaigns.refetch()}
          ListEmptyComponent={
            <EmptyState
              icon="mail-outline"
              title="Henüz toplu mail gönderilmedi."
              actionLabel={canSend ? 'Yeni toplu mail' : undefined}
              onAction={canSend ? openNew : undefined}
            />
          }
        />
      )}
      {canSend ? <Fab icon="add" label="Yeni toplu mail" extended onPress={openNew} /> : null}
    </SafeAreaView>
  );
}
