import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useComplaintLinkMutations, useComplaintLinks } from '@/src/api/service.hooks';
import type { ComplaintLink } from '@/src/api/service.api';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDate } from '@/src/lib/format';
import { Button, Card, Chip, DetailHeader, EmptyState, ErrorState, Fab, ListSkeleton, Loading, SCREEN_PAD } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { complaintFormUrl, openComplaintUrl, shareComplaintUrl } from '@/src/ui/service/complaintShare';

const isActive = (link: ComplaintLink) => link.isActive && !link.revokedAt;

/** Web Şikayet Kutusu → "Public Linkler" görünümü. */
export default function ComplaintLinksScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
  const router = useRouter();
  const canCreate = useCan('service_tickets.create');
  const canManage = useCan('service_tickets.update');
  const list = useComplaintLinks();
  const { rotate, revoke } = useComplaintLinkMutations();
  const [busyId, setBusyId] = useState<string | null>(null);
  const items = list.data?.items ?? [];

  // Token saklanmadığı için her paylaşım yeni bir erişim anahtarı üretir (web ile aynı).
  const issue = async (link: ComplaintLink, then: (url: string) => Promise<void>) => {
    setBusyId(link.id);
    try {
      const credential = await rotate.mutateAsync(link.id);
      await then(complaintFormUrl(credential.publicPath));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Link kimlik bilgisi alınamadı.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmRevoke = (link: ComplaintLink) => {
    Alert.alert('Link iptal edilsin mi?', 'Bu linkle artık şikayet gönderilemez.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal Et',
        style: 'destructive',
        onPress: () =>
          revoke.mutate(link.id, {
            onSuccess: () => toast.success('Public link iptal edildi'),
            onError: (error) => toast.error(`Link iptal edilemedi: ${error.message}`),
          }),
      },
    ]);
  };

  const render = (link: ComplaintLink) => {
    const active = isActive(link);
    const busy = busyId === link.id;
    return (
      <Card className="mb-3 gap-2">
        <View className="flex-row items-start gap-2">
          <View className="flex-1 gap-0.5">
            <Text className="font-display-semibold text-[16px] text-foreground">{link.title || 'Servis Şikayet Formu'}</Text>
            <Text className="font-inter text-[13px] text-muted-foreground">{link.company?.shortName || link.company?.legalTitle || 'Genel link'}</Text>
            {link.machine ? (
              <Text className="font-inter text-xs text-muted-foreground">{[link.machine.model, link.machine.serialNumber].filter(Boolean).join(' · ')}</Text>
            ) : null}
            <Text className="font-inter text-[11px] text-muted-foreground">Oluşturma: {link.createdAt ? formatDate(link.createdAt) : '—'}</Text>
          </View>
          <Chip label={active ? 'Aktif' : 'Pasif'} tone={active ? 'success' : 'destructive'} />
        </View>
        {canManage && active ? (
          <View className="flex-row flex-wrap gap-2">
            <Button
              className="flex-1"
              label="Yeni link üret ve paylaş"
              variant="ghost"
              trailingIcon="share-outline"
              loading={busy}
              disabled={busy}
              onPress={() => void issue(link, (url) => shareComplaintUrl(url, link.title))}
            />
            <Button
              label="Aç"
              variant="ghost"
              trailingIcon="open-outline"
              disabled={busy}
              onPress={() => void issue(link, openComplaintUrl)}
            />
            <Button label="İptal" variant="destructive" disabled={busy || revoke.isPending} onPress={() => confirmRevoke(link)} />
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Public Linkler" subtitle={list.data ? `${list.data.total} link` : undefined} />
      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlashList
          maintainVisibleContentPosition={{ disabled: true }}
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: SCREEN_PAD, paddingTop: 12, paddingBottom: GLASS_TAB_BAR_HEIGHT + 88 }}
          renderItem={({ item }) => render(item)}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState title="Public link yok." icon="link-outline" />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
      {canCreate ? <Fab label="Public Link" extended onPress={() => router.push('/modal/complaint-link' as Href)} /> : null}
    </SafeAreaView>
  );
}
