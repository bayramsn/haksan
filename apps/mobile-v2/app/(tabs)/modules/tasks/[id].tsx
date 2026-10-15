import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAddTaskComment, useTaskDetail, useToggleTaskDone } from '@/src/api/tasks.hooks';
import { useDeleteTask } from '@/src/api/crm-general.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatDateTime } from '@/src/lib/format';
import { useTheme, type Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';
import { toast } from '@/src/ui/toast';
import { taskRelatedLinks } from '@/src/ui/crm/task-logic';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  todo: { label: 'Yapılacak', tone: 'neutral' },
  in_progress: { label: 'Devam Ediyor', tone: 'info' },
  done: { label: 'Tamamlandı', tone: 'success' },
  cancelled: { label: 'İptal Edildi', tone: 'neutral' },
};

const PRIORITY: Record<string, { label: string; tone: Tone }> = {
  urgent: { label: 'Acil', tone: 'destructive' },
  high: { label: 'Yüksek', tone: 'warning' },
  normal: { label: 'Normal', tone: 'neutral' },
  low: { label: 'Düşük', tone: 'neutral' },
};

const COMMENT_MAX = 512;

/** Web TaskDetailPanel. */
export default function TaskDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const query = useTaskDetail(id);
  const status = useToggleTaskDone();
  const remove = useDeleteTask();
  const addComment = useAddTaskComment();
  const [comment, setComment] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const canUpdate = useCan('tasks.update');
  const canDelete = useCan('tasks.delete');

  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <DetailHeader title="Görev" />
        {query.isPending ? (
          <Loading />
        ) : (
          <ErrorState message={query.error?.message ?? 'Görev yüklenemedi'} onRetry={() => void query.refetch()} />
        )}
      </SafeAreaView>
    );
  }

  const task = query.data;
  const statusStyle = STATUS[task.status] ?? STATUS.todo!;
  const priority = PRIORITY[task.priority] ?? PRIORITY.normal!;
  const closed = task.status === 'done' || task.status === 'cancelled';
  const links = taskRelatedLinks(task);
  const busy = status.isPending || remove.isPending || addComment.isPending;

  function setStatus(next: 'todo' | 'cancelled', success: string) {
    status.mutate(
      { id, status: next },
      {
        onSuccess: () => toast.success(success),
        onError: (error) => toast.error(error.message || 'Görev güncellenemedi'),
      },
    );
  }

  function confirmDelete() {
    Alert.alert('Görev silinsin mi?', `"${task.title}" görevi silinecek.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          remove.mutate(id, {
            onSuccess: () => {
              toast.success('Görev silindi');
              router.back();
            },
            onError: (error) => toast.error(error.message || 'Görev silinemedi'),
          }),
      },
    ]);
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader
        title="Görev Detayı"
        subtitle={task.assignee?.fullName ?? 'Atanmamış'}
        actions={
          canUpdate
            ? [
                {
                  icon: 'create-outline' as const,
                  label: 'Düzenle',
                  onPress: () => router.push(`/modal/task?id=${encodeURIComponent(id)}` as Href),
                },
              ]
            : []
        }
      />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-10 pt-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
      >
        <Card className="gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <Chip label={statusStyle.label} tone={statusStyle.tone} />
            <Chip label={priority.label} tone={priority.tone} />
            {task.overdue ? <Chip label="Gecikti" tone="destructive" /> : null}
          </View>
          <Text className={`font-inter-semibold text-[20px] text-foreground ${closed ? 'line-through' : ''}`}>{task.title}</Text>
          <Text className={`font-inter text-[13px] ${task.overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
            {task.dueAt ? `Son tarih: ${formatDateTime(task.dueAt)}` : 'Tarihsiz'}
          </Text>
        </Card>

        {canUpdate ? (
          <View className="flex-row flex-wrap gap-2">
            <View className="min-w-[46%] flex-1">
              {closed ? (
                <Button label="Tekrar Aç" variant="ghost" loading={status.isPending} disabled={busy} onPress={() => setStatus('todo', 'Görev tekrar açıldı')} />
              ) : (
                <Button
                  label="Tamamla"
                  disabled={busy}
                  onPress={() =>
                    router.push(`/modal/task-complete?id=${encodeURIComponent(id)}&title=${encodeURIComponent(task.title)}` as Href)
                  }
                />
              )}
            </View>
            {task.status !== 'cancelled' ? (
              <View className="min-w-[46%] flex-1">
                <Button label="İptal Et" variant="ghost" disabled={busy} onPress={() => setStatus('cancelled', 'Görev iptal edildi')} />
              </View>
            ) : null}
          </View>
        ) : null}

        <Card>
          <InfoRows
            items={[
              { label: 'Atanan', value: task.assignee?.fullName ?? '—' },
              { label: 'Son tarih', value: task.dueAt ? formatDateTime(task.dueAt) : 'Tarihsiz' },
              { label: 'Oluşturulma', value: formatDateTime(task.createdAt) },
              { label: 'Tamamlanma', value: task.completedAt ? formatDateTime(task.completedAt) : '—' },
            ] satisfies InfoItem[]}
          />
        </Card>

        <Card className="gap-1">
          <Eyebrow>İlgili kayıt</Eyebrow>
          {links.length === 0 ? (
            <Text className="font-inter text-sm text-muted-foreground">—</Text>
          ) : (
            links.map((link) => (
              <Pressable
                key={link.route}
                accessibilityRole="link"
                accessibilityLabel={`${link.kind}: ${link.label}`}
                onPress={() => router.push(link.route as Href)}
                className="min-h-11 flex-row items-center gap-2 active:opacity-60"
              >
                <Text className="font-inter-medium text-[11px] uppercase text-muted-foreground">{link.kind}</Text>
                <Text className="flex-1 font-inter-medium text-sm text-primary" numberOfLines={1}>
                  {link.label}
                </Text>
                <Ionicons name="open-outline" size={16} color={colors.primary} />
              </Pressable>
            ))
          )}
        </Card>

        {task.description ? (
          <Card className="gap-1.5">
            <Eyebrow>Açıklama</Eyebrow>
            <Text selectable className="font-inter text-sm text-foreground">
              {task.description}
            </Text>
          </Card>
        ) : null}

        {canUpdate ? (
          <Card className="gap-3">
            <Eyebrow>Göreve yorum ekle</Eyebrow>
            <Field
              label="Yorum"
              value={comment}
              onChangeText={(value) => setComment(value.slice(0, COMMENT_MAX))}
              placeholder="Görüşme sonucu, ekip notu veya sonraki adımı yazın…"
              multiline
              maxLength={COMMENT_MAX}
              style={{ minHeight: 88, paddingTop: 12 }}
            />
            <Text className="font-inter text-[11px] text-muted-foreground">
              {comment.length}/{COMMENT_MAX}
            </Text>
            <Button
              label="Yorumu ekle"
              variant="ghost"
              loading={addComment.isPending}
              disabled={!comment.trim() || busy}
              onPress={() =>
                addComment.mutate(
                  { id, comment: comment.trim() },
                  {
                    onSuccess: () => {
                      setComment('');
                      toast.success('Yorum eklendi');
                    },
                    onError: (error) => toast.error(error.message || 'Yorum eklenemedi'),
                  },
                )
              }
            />
          </Card>
        ) : null}

        <Card className="gap-2">
          <Eyebrow>Yorumlar ve hareketler</Eyebrow>
          {task.events.length === 0 ? (
            <Text className="font-inter text-sm text-muted-foreground">Hareket yok.</Text>
          ) : (
            task.events.map((event) => (
              <View
                key={event.id}
                className={`flex-row gap-2 ${event.eventType === 'comment' ? 'rounded-control bg-muted p-2.5' : ''}`}
              >
                <Ionicons
                  name={event.eventType === 'comment' ? 'chatbox-ellipses-outline' : 'ellipse'}
                  size={event.eventType === 'comment' ? 14 : 6}
                  color={event.eventType === 'comment' ? colors.primary : colors.border}
                  style={{ marginTop: event.eventType === 'comment' ? 2 : 7 }}
                />
                <View className="flex-1 gap-0.5">
                  <Text selectable className="font-inter text-sm text-foreground">
                    {event.summary}
                  </Text>
                  <Text className="font-inter text-xs text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                    {event.actor ? ` · ${event.actor.fullName}` : ''}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>

        {canDelete ? (
          <Button label="Sil" variant="destructive" loading={remove.isPending} disabled={busy} onPress={confirmDelete} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
