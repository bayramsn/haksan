import { useAssistantFormDraft } from '@/src/call-assistant/useAssistantFormDraft';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateTask, useTaskAssignees, useTaskDetail } from '@/src/api/tasks.hooks';
import { usePatchTask } from '@/src/api/crm-general.hooks';
import type { TaskInput, TaskPriority, TaskStatus } from '@/src/api/endpoints';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { chipClass, chipTextClass, type Tone } from '@/src/theme/theme';
import { Button, Eyebrow, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { CompanyPicker, ContactPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { TASK_COMPLETION_NOTE_MAX_LENGTH } from '@/src/ui/crm/task-logic';

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

/** Web TASK_REMINDER_OPTIONS (packages/shared). */
const REMINDERS = [
  { value: '', label: 'Hatırlatma yok' },
  { value: '0', label: 'Görev saatinde' },
  { value: '15', label: '15 dakika önce' },
  { value: '30', label: '30 dakika önce' },
  { value: '60', label: '1 saat önce' },
  { value: '1440', label: '1 gün önce' },
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

/** Web TaskFormDialog. */
export default function TaskFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    assistantDraftId?: string;
    id?: string;
    companyId?: string;
    companyName?: string;
    contactId?: string;
    opportunityId?: string;
    quoteId?: string;
    serviceTicketId?: string;
    label?: string;
  }>();
  const assistantDraftId = typeof params.assistantDraftId === 'string' ? params.assistantDraftId : '';
  const editing = !assistantDraftId && Boolean(params.id);
  const { user } = useAuth();
  const canCreate = useCan('tasks.create');
  const canUpdate = useCan('tasks.update');

  const detail = useTaskDetail(editing ? params.id ?? '' : '');
  const assignees = useTaskAssignees();
  const create = useCreateTask();
  const update = usePatchTask();

  // İlgili kayıt üst ekrandan geldiyse firma/kontak seçicileri gizlenir (web lockedRelation).
  const lockedRelation = !assistantDraftId && Boolean(params.opportunityId || params.quoteId || params.serviceTicketId || params.companyId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [dueAt, setDueAt] = useState<Date | null>(null);
  const [remind, setRemind] = useState('');
  const [company, setCompany] = useState<PickedRecord | null>(null);
  const [contact, setContact] = useState<PickedRecord | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const assistant = useAssistantFormDraft(assistantDraftId, 'task', (draft) => {
    setCompany(draft.company); setContact(draft.contact ? { id: draft.contact.id, name: draft.contact.name, phone: draft.contact.phone ?? undefined, email: draft.contact.email ?? undefined } : null); setTitle(draft.title ?? ''); setDescription(draft.text ?? ''); setDueAt(draft.dueAt ? new Date(draft.dueAt) : null);
  });

  useEffect(() => {
    const task = detail.data;
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setPriority(task.priority);
    setStatus(task.status);
    setAssignedToUserId(task.assignedToUserId && task.assignedToUserId !== user?.id ? task.assignedToUserId : '');
    setDueAt(task.dueAt ? new Date(task.dueAt) : null);
    setRemind(task.remindBeforeMinutes === null ? '' : String(task.remindBeforeMinutes));
    setCompany(task.company ? { id: task.company.id, name: task.company.shortName || task.company.legalTitle } : null);
    setContact(task.contact ? { id: task.contact.id, name: task.contact.fullName } : null);
  }, [detail.data?.id]);

  const assigneeOptions = useMemo(
    () => [
      { value: '', label: 'Kendim' },
      ...(assignees.data ?? []).filter((person) => person.id !== user?.id).map((person) => ({ value: person.id, label: person.fullName })),
    ],
    [assignees.data, user?.id],
  );

  if (!editing && !canCreate) return <Redirect href="/modules/tasks" />;
  if (editing && !canUpdate) return <Redirect href="/modules/tasks" />;

  const completing = status === 'done' && detail.data?.status !== 'done';

  const submit = async () => {
    if (assistant.blocked || assistant.saving || create.isPending || update.isPending) return;
    if (!title.trim()) {
      setError('Görev adı zorunlu');
      toast.error('Görev adı zorunlu');
      return;
    }
    if (completing && !completionNote.trim()) {
      toast.error('Görevi tamamlamak için tamamlama notu yazın');
      return;
    }
    setError(undefined);

    const body: TaskInput = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      assignedToUserId: assignedToUserId || user?.id || null,
      dueAt: dueAt ? dueAt.toISOString() : null,
      remindBeforeMinutes: dueAt && remind !== '' ? Number(remind) : null,
      companyId: assistant.active ? company?.id ?? null : params.companyId ?? company?.id ?? null,
      contactId: assistant.active ? contact?.id ?? null : params.contactId ?? contact?.id ?? null,
      opportunityId: assistant.active ? null : params.opportunityId ?? detail.data?.opportunityId ?? null,
      quoteId: assistant.active ? null : params.quoteId ?? detail.data?.quoteId ?? null,
      serviceTicketId: assistant.active ? null : params.serviceTicketId ?? detail.data?.serviceTicketId ?? null,
    };

    if (assistant.active) {
      try { await assistant.save({ ...body, status: 'todo' }); toast.success('Görev oluşturuldu'); router.back(); }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Görev kaydedilemedi'); }
      return;
    }
    if (editing && params.id) {
      update.mutate(
        {
          id: params.id,
          patch: {
            ...body,
            ...(detail.data?.status !== status ? { status } : {}),
            ...(completing ? { completionNote: completionNote.trim() } : {}),
          },
        },
        {
          onSuccess: () => {
            toast.success('Görev güncellendi');
            router.back();
          },
          onError: (err) => toast.error(err.message || 'Görev kaydedilemedi'),
        },
      );
      return;
    }
    create.mutate(
      { ...body, status: 'todo' },
      {
        onSuccess: () => {
          toast.success('Görev oluşturuldu');
          router.back();
        },
        onError: (err) => toast.error(err.message || 'Görev kaydedilemedi'),
      },
    );
  };

  const busy = create.isPending || update.isPending || assistant.saving;
  const relationLabel = assistant.active ? company?.name : params.label || params.companyName;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: editing ? 'Görevi düzenle' : 'Yeni görev', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-sm text-muted-foreground">
            {relationLabel ? `${relationLabel} kaydına bağlı görev.` : 'Kısa bir başlık, sorumlu ve son tarih yeterli.'}
          </Text>

          {assistant.error ? <View className="gap-2"><Text className="text-destructive">{assistant.error}</Text><Button label="Taslağı tekrar yükle" variant="ghost" onPress={() => void assistant.retry()} /></View> : null}
          <Field
            label="Görev adı *"
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              if (error) setError(undefined);
            }}
            placeholder="Örn. Teklif için geri dönüş yap"
            maxLength={255}
            autoFocus={!editing}
            error={error}
          />

          <OptionPicker
            label="Atanacak kullanıcı"
            icon="person-outline"
            value={assignedToUserId}
            options={assigneeOptions}
            searchable
            onChange={(value) => setAssignedToUserId(value ?? '')}
          />

          <View className="gap-2">
            <Eyebrow>Öncelik</Eyebrow>
            <ChipRow options={PRIORITIES} value={priority} onChange={setPriority} />
          </View>

          <DateTimeField label="Son tarih ve saat" value={dueAt} onChange={setDueAt} clearable />

          <OptionPicker
            label="Hatırlatma"
            icon="notifications-outline"
            value={remind}
            options={REMINDERS}
            disabled={!dueAt}
            onChange={(value) => setRemind(value ?? '')}
          />

          {editing ? (
            <View className="gap-2">
              <Eyebrow>Durum</Eyebrow>
              <ChipRow options={STATUSES} value={status} onChange={setStatus} />
            </View>
          ) : null}

          {!lockedRelation ? (
            <>
              <CompanyPicker
                label="İlgili firma"
                value={company}
                onChange={(next) => {
                  setCompany(next);
                  if (next?.id !== company?.id) setContact(null);
                }}
              />
              <ContactPicker
                requireCompany={false}
                label="İlgili kontak"
                companyId={company?.id ?? null}
                value={contact}
                onChange={setContact}
                placeholder="Kontak seçin…"
              />
            </>
          ) : null}

          {completing ? (
            <Field
              label="Tamamlama notu (zorunlu)"
              value={completionNote}
              onChangeText={setCompletionNote}
              maxLength={TASK_COMPLETION_NOTE_MAX_LENGTH}
              multiline
              placeholder="Yapılan işi ve sonucunu yazın. Not, görev geçmişine kaydedilir."
              style={{ minHeight: 88, paddingTop: 12 }}
            />
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
        </ScrollView>
        <View className="flex-row gap-3 border-t border-border bg-card px-4 py-3">
          <View className="flex-1">
            <Button label="Vazgeç" variant="ghost" disabled={busy} onPress={() => router.back()} />
          </View>
          <View className="flex-[2]">
            <Button
              label={busy ? 'Kaydediliyor…' : 'Kaydet'}
              loading={busy || assistant.loading}
              disabled={busy || assistant.blocked || (completing && !completionNote.trim())}
              onPress={submit}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
