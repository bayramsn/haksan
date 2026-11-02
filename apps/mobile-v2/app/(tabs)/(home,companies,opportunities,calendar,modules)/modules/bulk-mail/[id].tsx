import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCan } from '@/src/auth/AuthProvider';
import { useAddMailSuppression, useMailCampaign, useMailCampaignAction } from '@/src/api/mail-campaigns.hooks';
import { formatDateTime } from '@/src/lib/format';
import { useTheme } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Loading } from '@/src/ui';
import { ProgressBar } from '@/src/ui/data';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { toast } from '@/src/ui/toast';
import { campaignActions, countByStatus, statusMeta } from '@/src/ui/bulk-mail/bulkMailLogic';

const COUNT_ORDER = ['sent', 'pending', 'failed', 'skipped'] as const;

/** Web CampaignDialog: ilerleme, alıcı sonuçları, durdur / sürdür, ret listesine ekleme. */
export default function BulkMailDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const bottomInset = useNavigationBottomInset();
  const { colors } = useTheme();
  const canSend = useCan('mail_campaigns.create');
  const query = useMailCampaign(id);
  const action = useMailCampaignAction();
  const suppress = useAddMailSuppression();
  const [showBody, setShowBody] = useState(false);

  if (!query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Toplu mail" subtitle={query.isPending ? 'Yükleniyor…' : undefined} />
        {query.isPending ? (
          <Loading />
        ) : (
          <ErrorState message={query.error?.message || 'Toplu mail açılamadı'} onRetry={() => void query.refetch()} />
        )}
      </SafeAreaView>
    );
  }

  const detail = query.data;
  const status = statusMeta(detail.status);
  const counts = countByStatus(detail.recipients);
  const { canCancel, resumeCount } = campaignActions(detail.status, counts, canSend);
  const busy = action.isPending;

  const run = (kind: 'cancel' | 'resume') =>
    action.mutate(
      { id: detail.id, action: kind },
      {
        onSuccess: () => toast.success(kind === 'cancel' ? 'Gönderim durduruldu' : 'Gönderim sürdürülüyor'),
        onError: (error) => toast.error(`${kind === 'cancel' ? 'Durdurulamadı' : 'Sürdürülemedi'}: ${error.message}`),
      },
    );

  const confirmCancel = () =>
    Alert.alert('Gönderim durdurulsun mu?', 'Henüz gönderilmemiş alıcılar bekletilir; daha sonra kalanlara gönderebilirsiniz.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Gönderimi durdur', style: 'destructive', onPress: () => run('cancel') },
    ]);

  const confirmResume = () =>
    Alert.alert(`Kalan ${resumeCount} alıcıya gönderilsin mi?`, 'Gönderim arka planda sürer; ret listesindekiler atlanır.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Gönder', onPress: () => run('resume') },
    ]);

  const confirmSuppress = (email: string) =>
    Alert.alert('Ret listesine eklensin mi?', `${email} sonraki toplu gönderimlerde atlanır.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Ekle',
        style: 'destructive',
        onPress: () =>
          suppress.mutate(
            { email, reason: `Toplu mail: ${detail.subject}`.slice(0, 255) },
            {
              onSuccess: () => toast.success(`Ret listesine eklendi · ${email}`),
              onError: (error) => toast.error(`Eklenemedi: ${error.message}`),
            },
          ),
      },
    ]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title={detail.subject} subtitle={`${formatDateTime(detail.createdAt)} · ${detail.recipients.length} alıcı`} />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: bottomInset + 32 }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}
      >
        {query.error ? (
          <Text accessibilityLiveRegion="polite" className="font-inter text-xs text-destructive">
            Güncel durum alınamadı: {query.error.message}
          </Text>
        ) : null}
        <Card className="gap-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <Chip label={status.label} tone={status.tone} />
            {COUNT_ORDER.map((key) =>
              counts[key] ? (
                <Text key={key} className="font-inter text-xs text-muted-foreground">
                  {statusMeta(key).label}: <Text className="font-inter-semibold text-foreground">{counts[key]}</Text>
                </Text>
              ) : null,
            )}
          </View>
          <ProgressBar label="Gönderilen" done={counts.sent ?? 0} total={detail.recipients.length} tone={counts.failed ? 'warning' : 'success'} />
          {detail.error ? (
            <Text selectable className="rounded-control border border-destructive-border bg-destructive-soft px-3 py-2 font-inter text-xs text-destructive">
              {detail.error}
            </Text>
          ) : null}
          {canCancel ? <Button label="Gönderimi durdur" variant="ghost" loading={busy} disabled={busy} onPress={confirmCancel} /> : null}
          {resumeCount ? <Button label={`Kalan ${resumeCount} alıcıya gönder`} loading={busy} disabled={busy} onPress={confirmResume} /> : null}
        </Card>

        <Card className="gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showBody ? 'Mesajı gizle' : 'Mesajı göster'}
            accessibilityState={{ expanded: showBody }}
            onPress={() => setShowBody((value) => !value)}
            className="min-h-[44px] flex-row items-center justify-between active:opacity-70"
          >
            <Eyebrow>Mesaj</Eyebrow>
            <Ionicons name={showBody ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
          </Pressable>
          {showBody ? (
            <Text selectable className="font-inter text-sm leading-[20px] text-foreground">
              {detail.body}
            </Text>
          ) : null}
        </Card>

        <Card className="gap-0 px-3 py-1">
          <View className="py-2">
            <Eyebrow>Alıcılar</Eyebrow>
          </View>
          {detail.recipients.map((row) => {
            const rowStatus = statusMeta(row.status);
            const sub = [row.companyName, row.error].filter(Boolean).join(' · ');
            return (
              <View key={row.id} className="min-h-11 flex-row items-center gap-2 border-t border-border py-2.5">
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="font-inter-medium text-sm text-foreground" numberOfLines={1}>
                    {row.name ? `${row.name} · ` : ''}
                    {row.email}
                  </Text>
                  {sub ? (
                    <Text className="font-inter text-xs text-muted-foreground" numberOfLines={2}>
                      {sub}
                    </Text>
                  ) : null}
                  <View className="flex-row items-center gap-2 pt-0.5">
                    <Chip label={rowStatus.label} tone={rowStatus.tone} shrink />
                    <Text className="font-inter text-xs text-muted-foreground">{formatDateTime(row.sentAt)}</Text>
                  </View>
                </View>
                {canSend && row.status !== 'skipped' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${row.email} ret listesine ekle`}
                    disabled={suppress.isPending}
                    onPress={() => confirmSuppress(row.email)}
                    className="h-11 w-11 items-center justify-center active:opacity-60"
                  >
                    <Ionicons name="ban-outline" size={18} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
