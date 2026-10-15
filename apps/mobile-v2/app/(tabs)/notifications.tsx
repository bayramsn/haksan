import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { NotificationItem } from '@/src/api/endpoints';
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useRespondNotification,
} from '@/src/api/notifications.hooks';
import { routeForTarget } from '@/src/modules/navigate';
import { chipClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { dayLabel, relativeTime } from '@/src/lib/format';
import { EmptyState, ErrorState, Loading, ScreenHeader } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';

/** Tasarımdaki "Tümü ▾" filtresi: yalnızca 2 seçenek olduğu için `src/ui`de
 * karşılığı olmayan tam bir açılır menü yerine ekrana özel, küçük bir versiyon. */
const FILTER_OPTIONS: { value: 'unread' | null; label: string }[] = [
  { value: null, label: 'Tümü' },
  { value: 'unread', label: 'Okunmamış' },
];

function FilterDropdown({
  value,
  unreadCount,
  onChange,
}: {
  value: 'unread' | null;
  unreadCount: number;
  onChange: (next: 'unread' | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  const current = FILTER_OPTIONS.find((o) => o.value === value) ?? FILTER_OPTIONS[0]!;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Bildirimleri filtrele"
        onPress={() => setOpen(true)}
        className="min-h-[44px] flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3.5"
      >
        <Text className="font-inter-semibold text-[13px] text-foreground">{current.label}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
      </Pressable>

      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        accessibilityViewIsModal
      >
        {/* ponytail: tetikleyicinin gerçek konumunu ölçmek yerine sabit üst boşluk;
            başlığın hemen altına düşüyor, ekran boyutu değişirse ince ayar gerekebilir. */}
        <Pressable
          accessibilityLabel="Kapat"
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' }}
          onPress={() => setOpen(false)}
        >
          <View
            accessibilityRole="menu"
            accessibilityLabel="Bildirim filtresi"
            className="mx-4 mt-28 gap-0.5 rounded-surface border border-border bg-card p-1.5"
            style={{
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 6,
            }}
          >
            {FILTER_OPTIONS.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex-row items-center justify-between rounded-control px-3 py-2.5 ${selected ? 'bg-card-subtle' : ''}`}
                >
                  <Text className={`font-inter-medium text-sm ${selected ? 'text-primary' : 'text-foreground'}`}>
                    {option.label}
                    {option.value === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/**
 * Bildirim türü -> ikon + ton. Sunucudaki `type` sütunu serbest metin
 * (automation.service.ts kendi türlerini üretiyor), bu yüzden tanınmayan tür
 * nötr zile düşer; ekran yeni tür geldiğinde bozulmaz.
 */
const TYPE_STYLE: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: Tone }> = {
  lead_unassigned: { icon: 'person-add-outline', tone: 'warning' },
  lead_assigned: { icon: 'person-add-outline', tone: 'info' },
  lead_sla_breach: { icon: 'timer-outline', tone: 'destructive' },
  opportunity_assigned: { icon: 'briefcase-outline', tone: 'info' },
  opportunity_rotting: { icon: 'hourglass-outline', tone: 'warning' },
  stale_quotes: { icon: 'document-text-outline', tone: 'warning' },
  mention: { icon: 'at-outline', tone: 'stage' },
  nearby_stale_visit: { icon: 'location-outline', tone: 'info' },
  nearby_visit_declined: { icon: 'close-circle-outline', tone: 'warning' },
  company_access_request: { icon: 'shield-half-outline', tone: 'warning' },
  company_access_approved: { icon: 'shield-checkmark-outline', tone: 'success' },
  company_access_rejected: { icon: 'shield-outline', tone: 'destructive' },
  service_complaint_new: { icon: 'construct-outline', tone: 'destructive' },
  call_assistant_suggestion: { icon: 'call-outline', tone: 'stage' },
  weekly_sales_report: { icon: 'stats-chart-outline', tone: 'info' },
  daily_briefing: { icon: 'sunny-outline', tone: 'info' },
  warranty_expiry: { icon: 'ribbon-outline', tone: 'warning' },
  maintenance_due: { icon: 'build-outline', tone: 'warning' },
  overdue_receivables: { icon: 'wallet-outline', tone: 'destructive' },
};

const FALLBACK = { icon: 'notifications-outline' as const, tone: 'neutral' as Tone };

function Row({
  item,
  onPress,
  onYes,
  onNo,
  busy,
}: {
  item: NotificationItem;
  onPress: () => void;
  onYes: () => void;
  onNo: () => void;
  busy: boolean;
}) {
  const { colors } = useTheme();
  const style = TYPE_STYLE[item.type] ?? FALLBACK;
  const unread = item.readAt === null;
  const waitingForAction = item.actionStatus === 'pending';

  return (
    <View className="my-1 rounded-overlay border border-border bg-card px-3.5 py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.title}
        accessibilityHint={waitingForAction ? 'Aşağıdaki Evet veya Hayır düğmelerinden birini seçin' : undefined}
        disabled={waitingForAction}
        onPress={onPress}
        className="flex-row items-start gap-3 active:opacity-70"
      >
        {/* Okunmamışı tek bakışta ayırt eden nokta; renk körlüğüne karşı konum da farklı. */}
        <View className="pt-3">
          <View className={`h-2 w-2 rounded-full ${unread ? 'bg-destructive' : 'bg-transparent'}`} />
        </View>

        <View className={`h-10 w-10 items-center justify-center rounded-full border ${chipClass[style.tone]}`}>
          <Ionicons name={style.icon} size={19} color={toneColor(colors, style.tone)} />
        </View>

        <View className="flex-1 gap-0.5">
          <Text
            className={`text-[15px] text-foreground ${unread ? 'font-inter-semibold' : 'font-inter-medium'}`}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          {item.body ? (
            <Text className="font-inter text-[13px] leading-[1.35] text-muted-foreground" numberOfLines={waitingForAction ? 5 : 3}>
              {item.body}
            </Text>
          ) : null}
          {item.actionStatus && item.actionStatus !== 'pending' ? (
            <Text className="pt-1 font-inter-semibold text-[12px] text-success">
              Yanıtlandı: {item.actionStatus === 'accepted' ? 'Evet' : 'Hayır'}
            </Text>
          ) : null}
        </View>

        <Text className="font-inter text-[11px] text-muted-foreground">{relativeTime(item.createdAt)}</Text>
      </Pressable>

      {waitingForAction ? (
        <View className="ml-[68px] mt-3 gap-2">
          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hayır, bu firmaya gitmeyeceğim"
              disabled={busy}
              onPress={onNo}
              className={`min-h-[44px] flex-1 items-center justify-center rounded-control border border-border bg-card-subtle px-3 ${busy ? 'opacity-60' : 'active:opacity-70'}`}
            >
              <Text className="font-inter-semibold text-sm text-foreground">Hayır</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Evet, bu firmaya gideceğim"
              disabled={busy}
              onPress={onYes}
              className={`min-h-[44px] flex-1 items-center justify-center rounded-control bg-primary px-3 ${busy ? 'opacity-60' : 'active:opacity-70'}`}
            >
              <Text className="font-inter-semibold text-sm text-primary-foreground">
                {busy ? 'Kaydediliyor…' : 'Evet, gideceğim'}
              </Text>
            </Pressable>
          </View>
          <Text className="font-inter-medium text-[11px] text-warning">Yanıt verilene kadar kapatılamaz.</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<'unread' | null>(null);
  const [declining, setDeclining] = useState<NotificationItem | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const list = useNotifications(filter === 'unread');
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();
  const respond = useRespondNotification();

  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  // Tasarımdaki "Bugün / Dün / 18 Mayıs Salı" grupları. Sunucu zaten tarihe
  // göre sıralı döndürüyor, yalnızca ardışık aynı günler birleştiriliyor.
  const sections = useMemo(() => {
    const out: { title: string; data: NotificationItem[] }[] = [];
    for (const item of items) {
      const title = dayLabel(item.createdAt);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(item);
      else out.push({ title, data: [item] });
    }
    return out;
  }, [items]);

  const unreadIds = items.filter((n) => n.readAt === null).map((n) => n.id);
  const closableUnreadIds = items
    .filter((n) => n.readAt === null && n.actionStatus !== 'pending')
    .map((n) => n.id);

  function open(item: NotificationItem) {
    if (item.actionStatus === 'pending') return;
    if (item.readAt === null) markRead.mutate(item.id);
    const route = routeForTarget(item.target);
    if (route) router.push(route);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader title="Bildirimler" />

      <View className="flex-row items-center justify-between gap-2 px-4 pb-2">
        <FilterDropdown value={filter} unreadCount={unreadIds.length} onChange={setFilter} />
        {closableUnreadIds.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => markAll.mutate(closableUnreadIds)}
            disabled={markAll.isPending}
            className={`flex-row items-center gap-1.5 rounded-control border border-border bg-card px-3 py-2 active:opacity-70 ${markAll.isPending ? 'opacity-60' : ''}`}
          >
            <Ionicons name="checkmark-done-outline" size={15} color={colors.mutedForeground} />
            <Text className="font-inter-medium text-[13px] text-muted-foreground">
              {markAll.isPending ? 'İşaretleniyor...' : 'Tümünü Okundu İşaretle'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text className="pb-1 pt-4 font-inter-semibold text-[13px] text-muted-foreground">{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <Row
              item={item}
              onPress={() => open(item)}
              busy={respond.isPending && respond.variables?.id === item.id}
              onYes={() => respond.mutate({ id: item.id, decision: 'yes' })}
              onNo={() => {
                setDeclineReason('');
                setDeclining(item);
              }}
            />
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={
            <EmptyState
              title={filter === 'unread' ? 'Okunmamış bildirim yok' : 'Bildirim yok'}
              hint="Yeni bir şey olduğunda burada görürsünüz."
            />
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}

      <Modal
        transparent
        visible={!!declining}
        animationType="fade"
        onRequestClose={() => {
          if (!respond.isPending) setDeclining(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 justify-end bg-black/40"
        >
          <View className="rounded-t-[24px] bg-card px-4 pb-8 pt-5">
            <View className="mb-4 flex-row items-start justify-between gap-4">
              <View className="flex-1">
                <Text className="font-inter-bold text-xl text-foreground">Neden gitmeyeceksiniz?</Text>
                <Text className="mt-1 font-inter text-sm leading-5 text-muted-foreground">
                  Yanıtınız doğrudan süper yöneticiye iletilecek.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kapat"
                disabled={respond.isPending}
                onPress={() => setDeclining(null)}
                className="h-11 w-11 items-center justify-center rounded-full bg-card-subtle"
              >
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <TextInput
              accessibilityLabel="Gitmeme nedeni"
              autoFocus
              multiline
              maxLength={1000}
              value={declineReason}
              onChangeText={setDeclineReason}
              placeholder="Örn. Bugünkü rota dolu, firma ile yarın için randevu planlandı."
              placeholderTextColor={colors.mutedForeground}
              className="min-h-[112px] rounded-surface border border-border bg-canvas px-4 py-3 font-inter text-[15px] text-foreground"
              style={{ textAlignVertical: 'top' }}
            />
            <Text className="mt-1 text-right font-inter text-xs text-muted-foreground">
              {declineReason.trim().length}/1000
            </Text>
            {respond.error ? (
              <Text className="mt-2 font-inter-medium text-sm text-destructive">{respond.error.message}</Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={declineReason.trim().length < 3 || respond.isPending}
              onPress={() => {
                if (!declining) return;
                respond.mutate(
                  { id: declining.id, decision: 'no', reason: declineReason.trim() },
                  {
                    onSuccess: () => {
                      setDeclining(null);
                      setDeclineReason('');
                    },
                  },
                );
              }}
              className={`mt-4 min-h-[48px] items-center justify-center rounded-control bg-primary px-4 ${declineReason.trim().length < 3 || respond.isPending ? 'opacity-50' : 'active:opacity-80'}`}
            >
              <Text className="font-inter-semibold text-[15px] text-primary-foreground">
                {respond.isPending ? 'Gönderiliyor…' : 'Gönder ve Kapat'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
