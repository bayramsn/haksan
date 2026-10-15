import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateTask, useTaskAssignees, useTaskDetail, useUpdateTask } from '@/src/api/tasks.hooks';
import type { TaskInput, TaskPriority, TaskStatus } from '@/src/api/endpoints';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { formatLocalDateTime, parseLocalDateTime } from '@/src/lib/format';
import { chipClass, chipTextClass, type Tone } from '@/src/theme/theme';
import { Button, Eyebrow, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const PRIORITIES: { value: TaskPriority; label: string; tone: Tone }[] = [
  { value: 'low', label: 'Düşük', tone: 'neutral' },
  { value: 'normal', label: 'Normal', tone: 'neutral' },
  { value: 'high', label: 'Yüksek', tone: 'warning' },
  { value: 'urgent', label: 'Acil', tone: 'destructive' },
];

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'Yapılacak' },
  { value: 'in_progress', label: 'Devam Ediyor' },
  { value: 'done', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal Edildi' },
];

const REMINDERS: { value: number | null; label: string }[] = [
  { value: null, label: 'Yok' },
  { value: 0, label: 'Saatinde' },
  { value: 15, label: '15 dk önce' },
  { value: 30, label: '30 dk önce' },
  { value: 60, label: '1 saat önce' },
  { value: 1440, label: '1 gün önce' },
];

/** Seçim satırı: mobilde açılır liste yerine tek dokunuşluk çip dizisi. */
function ChipRow<T>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; tone?: Tone }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        const tone: Tone = active ? option.tone ?? 'info' : 'neutral';
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            className={`min-h-11 justify-center rounded-full border px-3 ${chipClass[tone]} ${active ? '' : 'opacity-70'} active:opacity-60`}
          >
            <Text className={`font-inter-medium text-[13px] ${chipTextClass[tone]}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TaskFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    companyId?: string;
    contactId?: string;
    opportunityId?: string;
    quoteId?: string;
    serviceTicketId?: string;
  }>();
  const editing = Boolean(params.id);
  const { user } = useAuth();
  const canCreate = useCan('tasks.create');

  const detail = useTaskDetail(params.id ?? '');
  const assignees = useTaskAssignees();
  const create = useCreateTask();
  const update = useUpdateTask();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [assignedToUserId, setAssignedToUserId] = useState<string>('');
  const [dueAt, setDueAt] = useState('');
  const [remind, setRemind] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const task = detail.data;
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setPriority(task.priority);
    setStatus(task.status);
    setAssignedToUserId(task.assignedToUserId ?? '');
    setDueAt(task.dueAt ? formatLocalDateTime(task.dueAt) : '');
    setRemind(task.remindBeforeMinutes);
  }, [detail.data?.id]);

  if (!editing && !canCreate) return <Redirect href="/(tabs)/modules/tasks" />;

  const submit = () => {
    if (!title.trim()) {
      setError('Görev adı zorunludur.');
      return;
    }
    const due = dueAt.trim() ? parseLocalDateTime(dueAt) : null;
    if (dueAt.trim() && !due) {
      setError('Son tarihi YYYY-AA-GG SS:DD biçiminde girin.');
      return;
    }
    setError(undefined);

    const body: TaskInput = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      assignedToUserId: assignedToUserId || user?.id || null,
      dueAt: due ? due.toISOString() : null,
      remindBeforeMinutes: remind,
      companyId: params.companyId ?? detail.data?.companyId ?? null,
      contactId: params.contactId ?? detail.data?.contactId ?? null,
      opportunityId: params.opportunityId ?? detail.data?.opportunityId ?? null,
      quoteId: params.quoteId ?? detail.data?.quoteId ?? null,
      serviceTicketId: params.serviceTicketId ?? detail.data?.serviceTicketId ?? null,
    };

    if (editing && params.id) {
      update.mutate(
        { id: params.id, body },
        {
          onSuccess: () => {
            toast.success('Görev güncellendi');
            router.back();
          },
          onError: (err) => toast.error(err.message),
        }
      );
      return;
    }
    create.mutate(body, {
      onSuccess: () => {
        toast.success('Görev oluşturuldu');
        router.back();
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const busy = create.isPending || update.isPending;
  const people = assignees.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: editing ? 'Görevi Düzenle' : 'Yeni Görev', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <Field
            label="Görev adı"
            value={title}
            onChangeText={setTitle}
            placeholder="Örn. Müşteriyi ara"
            maxLength={255}
            error={error}
          />

          <View className="gap-2">
            <Eyebrow>Öncelik</Eyebrow>
            <ChipRow options={PRIORITIES} value={priority} onChange={setPriority} />
          </View>

          {people.length > 1 ? (
            <View className="gap-2">
              <Eyebrow>Atanan</Eyebrow>
              <ChipRow
                options={people.map((person) => ({
                  value: person.id,
                  label: person.id === user?.id ? 'Kendim' : person.fullName,
                }))}
                value={assignedToUserId || user?.id || ''}
                onChange={setAssignedToUserId}
              />
            </View>
          ) : null}

          <Field
            label="Son tarih ve saat"
            value={dueAt}
            onChangeText={setDueAt}
            placeholder="YYYY-AA-GG SS:DD"
            keyboardType="numbers-and-punctuation"
            maxLength={16}
          />

          {dueAt.trim() ? (
            <View className="gap-2">
              <Eyebrow>Hatırlatma</Eyebrow>
              <ChipRow
                options={REMINDERS.map((option) => ({ value: option.value ?? -1, label: option.label }))}
                value={remind ?? -1}
                onChange={(next) => setRemind(next === -1 ? null : next)}
              />
            </View>
          ) : null}

          {editing ? (
            <View className="gap-2">
              <Eyebrow>Durum</Eyebrow>
              <ChipRow options={STATUSES} value={status} onChange={setStatus} />
            </View>
          ) : null}

          <Field
            label="Açıklama"
            value={description}
            onChangeText={setDescription}
            placeholder="Gerekliyse kısa bir not."
            multiline
            numberOfLines={3}
            style={{ minHeight: 88, paddingTop: 12 }}
          />

          <Button label={editing ? 'Kaydet' : 'Görevi Oluştur'} loading={busy} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
