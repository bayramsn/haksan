import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTaskCounts, useTaskList, useToggleTaskDone } from '@/src/api/tasks.hooks';
import type { Task, TaskView } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { chipClass, chipTextClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { EmptyState, ErrorState, FilterChips, ListSkeleton, ScreenHeader } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';

/** Bir "Tümü" çipi zaten var; kalan görünümler onun yanına dizilir. */
const VIEWS: { value: Exclude<TaskView, 'all'>; label: string }[] = [
  { value: 'mine', label: 'Bana Atananlar' },
  { value: 'today', label: 'Bugün' },
  { value: 'overdue', label: 'Gecikenler' },
  { value: 'upcoming', label: 'Yaklaşan' },
  { value: 'completed', label: 'Tamamlananlar' },
];

const PRIORITY: Record<Task['priority'], { label: string; tone: Tone }> = {
  urgent: { label: 'Acil', tone: 'destructive' },
  high: { label: 'Yüksek', tone: 'warning' },
  normal: { label: 'Normal', tone: 'neutral' },
  low: { label: 'Düşük', tone: 'neutral' },
};

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'Yapılacak',
  in_progress: 'Devam Ediyor',
  done: 'Tamamlandı',
  cancelled: 'İptal Edildi',
};

/** Son tarihi insan diline çevirir; gecikme sunucudan `overdue` olarak gelir. */
function dueText(task: Task): { text: string; tone: Tone } {
  if (!task.dueAt) return { text: 'Tarihsiz', tone: 'neutral' };
  const due = new Date(task.dueAt);
  const time = `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor((due.getTime() - startOfToday.getTime()) / 86_400_000);
  if (task.overdue) {
    // Takvim günü yerine gerçek fark: dün 23:59'da biten görev bugün 00:30'da
    // "1 gün gecikti" demesin.
    const lateMs = Date.now() - due.getTime();
    if (lateMs < 3_600_000) return { text: `${Math.max(1, Math.round(lateMs / 60_000))} dk gecikti`, tone: 'destructive' };
    if (lateMs < 86_400_000) return { text: `${Math.floor(lateMs / 3_600_000)} saat gecikti`, tone: 'destructive' };
    return { text: `${Math.floor(lateMs / 86_400_000)} gün gecikti`, tone: 'destructive' };
  }
  if (days === 0) return { text: `Bugün ${time}`, tone: 'warning' };
  if (days === 1) return { text: `Yarın ${time}`, tone: 'info' };
  return { text: `${due.getDate()}.${due.getMonth() + 1} ${time}`, tone: 'neutral' };
}

function relatedText(task: Task): string | null {
  if (task.company) return task.company.shortName ?? task.company.legalTitle;
  if (task.opportunity) return task.opportunity.title;
  if (task.quote) return `Teklif ${task.quote.documentNo}`;
  if (task.serviceTicket) return `Servis ${task.serviceTicket.ticketNo}`;
  if (task.contact) return task.contact.fullName;
  return null;
}

export default function TasksScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('tasks.create');
  const [view, setView] = useState<Exclude<TaskView, 'all'> | null>('mine');

  const list = useTaskList({ view: view ?? 'all' });
  const counts = useTaskCounts();
  const toggle = useToggleTaskDone();

  const options = useMemo(
    () => VIEWS.map((item) => ({ value: item.value, label: item.label, count: counts.data?.[item.value] })),
    [counts.data]
  );

  const items = list.data?.data ?? [];

  // İyimser güncelleme yok; yavaş bağlantıda kullanıcı ikinci kez dokununca
  // ikinci PATCH görevi geri açıyordu. İstek uçarken kutucuk kilitli.
  const onToggle = (task: Task) => {
    if (toggle.isPending) return;
    toggle.mutate(
      { id: task.id, status: task.status === 'done' ? 'todo' : 'done' },
      { onError: (error) => Alert.alert('Güncellenemedi', error.message) }
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Görevler"
        subtitle="Bugün yapılacak işler, gecikenler ve size atananlar."
        actions={
          canCreate
            ? [{ icon: 'add' as const, label: 'Yeni görev', onPress: () => router.push('/modal/task' as Href) }]
            : []
        }
      />

      <View className="px-4 pb-1">
        <FilterChips options={options} value={view} onChange={setView} allLabel="Tüm Görevler" />
      </View>

      {list.isPending ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={
            <EmptyState title="Görev yok" hint="Bu görünümde yapılacak bir iş görünmüyor." />
          }
          renderItem={({ item }) => {
            const due = dueText(item);
            const related = relatedText(item);
            const done = item.status === 'done';
            const closed = done || item.status === 'cancelled';
            return (
              <View
                className="my-[5px] flex-row items-center gap-3 rounded-[16px] border border-border bg-card px-3.5 py-3.5"
                style={{ borderCurve: 'continuous', boxShadow: '0 1px 4px rgba(15, 23, 42, 0.05)' }}
              >
                {/* Tek dokunuşla kapatma: durum değiştirmek için detaya girmek gerekmiyor. */}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={done ? 'Görevi tekrar aç' : 'Görevi tamamla'}
                  hitSlop={10}
                  disabled={toggle.isPending}
                  onPress={() => onToggle(item)}
                  className={`h-11 w-11 items-center justify-center active:opacity-60 ${toggle.isPending ? 'opacity-50' : ''}`}
                >
                  <Ionicons
                    name={done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={26}
                    color={done ? toneColor(colors, 'success') : colors.mutedForeground}
                  />
                </Pressable>

                <Pressable
                  className="flex-1 gap-0.5 active:opacity-60"
                  onPress={() => router.push(`/(tabs)/modules/tasks/${item.id}` as Href)}
                >
                  <Text
                    numberOfLines={1}
                    className={`text-[16px] font-inter-semibold leading-[21px] text-foreground ${closed ? 'line-through opacity-60' : ''}`}
                  >
                    {item.title}
                  </Text>
                  {related ? (
                    <Text numberOfLines={1} className="font-inter text-[13px] leading-[17px] text-muted-foreground">
                      {related}
                    </Text>
                  ) : null}
                  <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
                    <View className={`self-start rounded-full border px-2 py-0.5 ${chipClass[due.tone]}`}>
                      <Text className={`font-inter-medium text-xs leading-[1.35] ${chipTextClass[due.tone]}`}>
                        {due.text}
                      </Text>
                    </View>
                    {item.priority !== 'normal' && item.priority !== 'low' ? (
                      <View className={`self-start rounded-full border px-2 py-0.5 ${chipClass[PRIORITY[item.priority].tone]}`}>
                        <Text
                          className={`font-inter-medium text-xs leading-[1.35] ${chipTextClass[PRIORITY[item.priority].tone]}`}
                        >
                          {PRIORITY[item.priority].label}
                        </Text>
                      </View>
                    ) : null}
                    {item.assignee ? (
                      <Text numberOfLines={1} className="font-inter text-xs text-muted-foreground">
                        {item.assignee.fullName}
                      </Text>
                    ) : null}
                    {closed ? (
                      <Text className="font-inter text-xs text-muted-foreground">{STATUS_LABEL[item.status]}</Text>
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
