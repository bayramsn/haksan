import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { taskKeys, useAddTaskComment, useTaskDetail, useUpdateTask } from '@/src/api/tasks.hooks';
import { deleteTask } from '@/src/api/general.endpoints';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { isChatMessageTarget, routeForNavigation } from '@/src/modules/navigate';
import { formatDateTime } from '@/src/lib/format';
import type { Tone } from '@/src/theme/theme';
import { Button, Card, Chip, DetailHeader, ErrorState, Eyebrow, Field, Loading } from '@/src/ui';
import { InfoRows, type InfoItem } from '@/src/ui/data';

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

export default function TaskDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useTaskDetail(id);
  const update = useUpdateTask();
  const addComment = useAddTaskComment();
  const [comment, setComment] = useState('');
  const canUpdate = useCan('tasks.update');
  const canDelete = useCan('tasks.delete');
  const canManage = useCan('tasks.manage');
  const { user } = useAuth();
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  if (query.isPending || query.error || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
        <DetailHeader title="Görev" />
        {query.isPending ? (
          <Loading />
        ) : (
          <ErrorState message={query.error?.message ?? 'Görev yüklenemedi.'} onRetry={() => void query.refetch()} />
        )}
      </SafeAreaView>
    );
  }

  const task = query.data;
  const chatSourcePrefix = 'Sohbet mesajı: ';
  const descriptionLines = task.description?.split(/\r?\n/) ?? [];
  const source = descriptionLines
    .filter((line) => line.startsWith(chatSourcePrefix))
    .map((line) => line.slice(chatSourcePrefix.length))
    .find(isChatMessageTarget);
  const sourceRoute = source ? routeForNavigation('chat', source) : null;
  const description = source
    ? descriptionLines.filter((line) => line !== `${chatSourcePrefix}${source}`).join('\n').trim()
    : task.description;
  const status = STATUS[task.status] ?? STATUS.todo!;
  const priority = PRIORITY[task.priority] ?? PRIORITY.normal!;

  const setStatus = (next: 'todo' | 'done' | 'cancelled' | 'in_progress', label: string) =>
    update.mutate(
      { id, body: { status: next } },
      { onError: (error) => Alert.alert(`${label} başarısız`, error.message) }
    );

  // Sunucu kuralı: tasks.manage yoksa yalnız kendi açtığı görevi silebilir.
  const createdBy = (task as typeof task & { createdBy?: string | null }).createdBy;
  const showDelete = canDelete && (canManage || createdBy === user?.id);
  const confirmDelete = () =>
    Alert.alert('Görevi sil', `"${task.title}" silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          setDeleting(true);
          deleteTask(id)
            .then(() => {
              qc.removeQueries({ queryKey: taskKeys.detail(id) });
              router.back();
              void qc.invalidateQueries({ queryKey: taskKeys.all });
            })
            .catch((error: unknown) => Alert.alert('Görev silinemedi', error instanceof Error ? error.message : 'Bilinmeyen hata.'))
            .finally(() => setDeleting(false));
        },
      },
    ]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['left', 'right']}>
      <DetailHeader
        title="Görev Detayı"
        subtitle={task.assignee?.fullName ?? 'Atanmamış'}
        actions={
          canUpdate
            ? [
                {
                  icon: 'create-outline' as const,
                  label: 'Görevi düzenle',
                  onPress: () => router.push(`/modal/task?id=${encodeURIComponent(id)}` as Href),
                },
              ]
            : []
        }
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <Card className="gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <Chip label={status.label} tone={status.tone} />
            <Chip label={priority.label} tone={priority.tone} />
            {task.overdue ? <Chip label="Gecikti" tone="destructive" /> : null}
          </View>
          <Text className="font-inter-semibold text-[20px] text-foreground">{task.title}</Text>
          <Text className="font-inter text-[13px] text-muted-foreground">
            {task.dueAt ? `Son tarih: ${formatDateTime(task.dueAt)}` : 'Son tarih yok'}
          </Text>
        </Card>

        {canUpdate ? (
          task.status === 'done' || task.status === 'cancelled' ? (
            <Button label="Tekrar Aç" variant="ghost" loading={update.isPending} onPress={() => setStatus('todo', 'Tekrar açma')} />
          ) : (
            <Button label="Tamamla" loading={update.isPending} onPress={() => setStatus('done', 'Tamamlama')} />
          )
        ) : null}

        <Card>
          <InfoRows
            items={[
              { label: 'Atanan', value: task.assignee?.fullName },
              { label: 'Firma', value: task.company?.shortName ?? task.company?.legalTitle },
              { label: 'Kontak', value: task.contact?.fullName },
              { label: 'Fırsat', value: task.opportunity?.title },
              { label: 'Teklif', value: task.quote?.documentNo },
              { label: 'Servis', value: task.serviceTicket?.ticketNo },
              { label: 'Oluşturulma', value: formatDateTime(task.createdAt) },
              { label: 'Tamamlanma', value: task.completedAt ? formatDateTime(task.completedAt) : null },
            ] satisfies InfoItem[]}
          />
        </Card>

        {task.description ? (
          <Card className="gap-1.5">
            <Eyebrow>Açıklama</Eyebrow>
            {description ? (
              <Text selectable className="font-inter text-sm text-foreground">{description}</Text>
            ) : null}
            {sourceRoute ? (
              <Button label="Sohbet mesajını aç" variant="ghost" onPress={() => router.push(sourceRoute as Href)} />
            ) : null}
          </Card>
        ) : null}

        {canUpdate ? (
          <Card className="gap-3">
            <Eyebrow>Göreve yorum ekle</Eyebrow>
            <Field
              label="Yorum"
              value={comment}
              onChangeText={(value) => setComment(value.slice(0, 512))}
              placeholder="Görüşme sonucu veya ekip notu…"
              multiline
              maxLength={512}
              className="min-h-[88px]"
            />
            <Button
              label="Yorumu ekle"
              loading={addComment.isPending}
              disabled={!comment.trim() || addComment.isPending}
              onPress={() => addComment.mutate(
                { id, comment: comment.trim() },
                {
                  onSuccess: () => setComment(''),
                  onError: (error) => Alert.alert('Yorum eklenemedi', error.message),
                }
              )}
            />
          </Card>
        ) : null}

        {task.events.length ? (
          <Card className="gap-2">
            <Eyebrow>Yorumlar ve hareketler</Eyebrow>
            {task.events.map((event) => (
              <View key={event.id} className="gap-0.5">
                <Text className="font-inter text-sm text-foreground">{event.summary}</Text>
                <Text className="font-inter text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                  {event.actor ? ` · ${event.actor.fullName}` : ''}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {task.companyId ? (
          <Button
            label="Firmaya Git"
            variant="ghost"
            onPress={() => router.push(`/modules/companies/${task.companyId}` as Href)}
          />
        ) : null}
        {task.opportunityId ? (
          <Button
            label="Fırsata Git"
            variant="ghost"
            onPress={() => router.push(`/modules/opportunities/${task.opportunityId}` as Href)}
          />
        ) : null}
        {canUpdate && task.status !== 'cancelled' && task.status !== 'done' ? (
          <Button label="İptal Et" variant="ghost" onPress={() => setStatus('cancelled', 'İptal')} />
        ) : null}
        {showDelete ? (
          <Button label="Görevi Sil" variant="destructive" loading={deleting} disabled={deleting} onPress={confirmDelete} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
