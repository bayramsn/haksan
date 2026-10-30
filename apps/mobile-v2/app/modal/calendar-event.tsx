import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  useArchiveCalendarEvent,
  useCalendarOwners,
  useCreateCalendarEventExt,
  useRestoreCalendarEvent,
  useUpdateCalendarEventExt,
} from '@/src/api/crm-general.hooks';
import type { CalendarEventFull } from '@/src/api/crm-general.api';
import type { CalendarEventPatch } from '@/src/api/endpoints';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { chipClass, chipTextClass, toneColor, useTheme } from '@/src/theme/theme';
import { Button, Card, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { CompanyPicker, type PickedRecord } from '@/src/ui/pickers/CompanyPicker';
import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { CompanyAddressSelect } from '@/src/ui/select/fields';
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_TYPE_LABELS,
  canEditCalendarEvent,
  defaultEventWindow,
  normalizeEventType,
  validateEventDraft,
  type CalendarEventType,
  type EventDraftValidation,
} from '@/src/ui/crm/calendar-logic';
import { CALENDAR_TYPE_STYLE } from '@/src/ui/crm/calendar-style';

type Params = {
  id?: string;
  eventType?: string;
  title?: string;
  description?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  date?: string;
  companyId?: string;
  companyName?: string;
  contactId?: string;
  opportunityId?: string;
};

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Tek kayıt GET ucu yok; liste önbelleğinden okunur (takvim ekranından açılır). */
function useCachedEvent(id: string | undefined): CalendarEventFull | null {
  const qc = useQueryClient();
  return useMemo(() => {
    if (!id) return null;
    for (const [, rows] of qc.getQueriesData<CalendarEventFull[]>({ queryKey: ['calendar', 'events'] })) {
      const found = Array.isArray(rows) ? rows.find((row) => row.id === id) : undefined;
      if (found) return found;
    }
    return null;
  }, [id, qc]);
}

/** Web CalendarPage etkinlik düzenleyicisi. */
export default function CalendarEventScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<Params>();
  const canCreate = useCan('calendar.create');
  const canUpdate = useCan('calendar.update');
  const canDelete = useCan('calendar.delete');
  const isSuperAdmin = Boolean(user?.roles.includes('super_admin'));
  const event = useCachedEvent(params.id);
  const editing = Boolean(params.id);
  const owners = useCalendarOwners(isSuperAdmin && !editing);

  const create = useCreateCalendarEventExt();
  const update = useUpdateCalendarEventExt();
  const archive = useArchiveCalendarEvent();
  const restore = useRestoreCalendarEvent();

  const initialWindow = useMemo(() => {
    const base = parseDate(params.date);
    if (!base) return defaultEventWindow();
    const start = new Date(base);
    if (start.getHours() === 0 && start.getMinutes() === 0) start.setHours(9, 0, 0, 0);
    return { startsAt: start, endsAt: new Date(start.getTime() + 60 * 60 * 1000) };
  }, [params.date]);

  const [eventType, setEventType] = useState<CalendarEventType>(() =>
    event ? normalizeEventType(event.eventType) : params.eventType ? normalizeEventType(params.eventType) : 'customer_visit',
  );
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [company, setCompany] = useState<PickedRecord | null>(() => {
    if (event?.company) return { id: event.company.id, name: event.company.shortName ?? event.company.legalTitle };
    const id = event?.companyId ?? params.companyId;
    return id ? { id, name: params.companyName || 'Seçili firma' } : null;
  });
  const [title, setTitle] = useState(event?.title ?? params.title ?? '');
  const [startsAt, setStartsAt] = useState<Date | null>(
    parseDate(event?.startsAt) ?? parseDate(params.startsAt) ?? initialWindow.startsAt,
  );
  const [endsAt, setEndsAt] = useState<Date | null>(parseDate(event?.endsAt) ?? parseDate(params.endsAt) ?? initialWindow.endsAt);
  const [location, setLocation] = useState(event?.location ?? params.location ?? '');
  const [description, setDescription] = useState(event?.description ?? params.description ?? '');
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [completed, setCompleted] = useState(Boolean(event?.completedAt));
  const [errors, setErrors] = useState<EventDraftValidation>({});

  const archived = Boolean(event?.deletedAt);
  const editable = !editing || (event ? canEditCalendarEvent(event, user?.id) : false);

  const ownerOptions = useMemo(
    () => [
      { value: '', label: 'Kendi takvimim' },
      ...(owners.data ?? []).filter((owner) => owner.id !== user?.id).map((owner) => ({ value: owner.id, label: owner.fullName, hint: owner.email })),
    ],
    [owners.data, user?.id],
  );

  if (!editing && !canCreate) return <Redirect href="/modules/calendar" />;

  if (editing && (!event || !editable || !canUpdate)) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-3 bg-canvas p-6" edges={['top', 'bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Etkinliği düzenle', headerShown: true }} />
        <Ionicons name="lock-closed-outline" size={28} color={colors.mutedForeground} />
        <Text className="text-center font-inter text-sm text-muted-foreground">
          {!event
            ? 'Etkinlik bulunamadı. Takvimi yenileyip tekrar deneyin.'
            : 'Bu etkinliği yalnız sahibi veya atayan kişi düzenleyebilir.'}
        </Text>
        <Button label="Geri dön" variant="ghost" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  function selectType(next: CalendarEventType) {
    setEventType(next);
    setErrors((prev) => ({ ...prev, companyId: undefined }));
  }

  function resolvedWindow(): { start: Date | null; end: Date | null } {
    if (!allDay || !startsAt) return { start: startsAt, end: endsAt };
    const start = new Date(startsAt);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endsAt && endsAt.getTime() >= start.getTime() ? endsAt : start);
    end.setHours(23, 59, 0, 0);
    return { start, end };
  }

  function submit() {
    const { start, end } = resolvedWindow();
    const nextErrors = validateEventDraft({ eventType, title, companyId: company?.id ?? null, startsAt: start, endsAt: end });
    setErrors(nextErrors);
    if (nextErrors.companyId) toast.error('Müşteri ziyareti için firma seçin');
    if (nextErrors.title || nextErrors.companyId || nextErrors.endsAt || !start || !end) return;

    const fields: CalendarEventPatch = {
      eventType,
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      allDay,
      companyId: company?.id ?? null,
    };

    if (editing && event) {
      update.mutate(
        { id: event.id, patch: { ...fields, completedAt: completed ? (event.completedAt ?? new Date().toISOString()) : null } },
        {
          onSuccess: () => {
            toast.success('Etkinlik güncellendi');
            router.back();
          },
          onError: (error) => toast.error(error.message || 'Etkinlik kaydedilemedi'),
        },
      );
      return;
    }

    create.mutate(
      {
        ...fields,
        eventType,
        title: title.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        timezone: 'Europe/Istanbul',
        contactId: params.contactId || null,
        opportunityId: params.opportunityId || null,
        ...(ownerUserId ? { ownerUserId } : {}),
      },
      {
        onSuccess: () => {
          toast.success(ownerUserId ? 'Görev atandı' : 'Etkinlik oluşturuldu');
          router.back();
        },
        onError: (error) => toast.error(error.message || 'Etkinlik kaydedilemedi'),
      },
    );
  }

  function confirmArchive() {
    if (!event) return;
    Alert.alert('Etkinlik arşive alınsın mı?', '30 gün içinde geri alınabilir.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Arşive al',
        style: 'destructive',
        onPress: () =>
          archive.mutate(event.id, {
            onSuccess: () => {
              toast.success('Etkinlik arşive alındı · 30 gün içinde geri alınabilir.');
              router.back();
            },
            onError: (error) => toast.error(error.message || 'Etkinlik silinemedi'),
          }),
      },
    ]);
  }

  function runRestore() {
    if (!event) return;
    restore.mutate(event.id, {
      onSuccess: () => {
        toast.success('Etkinlik geri alındı');
        router.back();
      },
      onError: (error) => toast.error(error.message || 'Etkinlik geri alınamadı'),
    });
  }

  const busy = create.isPending || update.isPending || archive.isPending || restore.isPending;
  const description_ =
    event?.source === 'device'
      ? 'Değişiklik bir sonraki senkronda telefona yazılır.'
      : isSuperAdmin && !editing
        ? 'Kendi takvimine ekle ya da bir kullanıcıya görev olarak ata.'
        : 'Kişisel takvimine yeni bir kayıt ekle.';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: editing ? 'Etkinliği düzenle' : 'Yeni etkinlik', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <Text className="font-inter text-sm text-muted-foreground">{description_}</Text>
          {archived ? (
            <Card className="flex-row items-center gap-2 p-3">
              <Ionicons name="archive-outline" size={18} color={colors.mutedForeground} />
              <Text className="flex-1 font-inter text-sm text-muted-foreground">
                Bu etkinlik arşivde. Düzenlemek için önce geri alın.
              </Text>
            </Card>
          ) : null}

          <View className="gap-2">
            <Text className="font-inter-medium text-sm text-foreground">Etkinlik türü</Text>
            <View className="flex-row flex-wrap gap-2">
              {CALENDAR_EVENT_TYPES.map((type) => {
                const style = CALENDAR_TYPE_STYLE[type];
                const active = eventType === type;
                return (
                  <Pressable
                    key={type}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={CALENDAR_TYPE_LABELS[type]}
                    onPress={() => selectType(type)}
                    className={`min-h-11 flex-row items-center gap-1.5 self-start rounded-full border px-3 ${active ? chipClass[style.tone] : 'border-border bg-card'}`}
                  >
                    <Ionicons name={style.icon} size={14} color={toneColor(colors, active ? style.tone : 'neutral')} />
                    <Text className={`font-inter-medium text-xs ${active ? chipTextClass[style.tone] : 'text-foreground'}`}>
                      {CALENDAR_TYPE_LABELS[type]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {isSuperAdmin && !editing ? (
            <OptionPicker
              label="Kime"
              icon="person-outline"
              value={ownerUserId ?? ''}
              options={ownerOptions}
              searchable
              onChange={(value) => setOwnerUserId(value || null)}
            />
          ) : null}

          <CompanyPicker
            label={eventType === 'customer_visit' ? 'Firma *' : 'Firma'}
            value={company}
            onChange={(next) => {
              setCompany(next);
              setErrors((prev) => ({ ...prev, companyId: undefined }));
            }}
            error={errors.companyId}
          />

          <Field
            label="Başlık *"
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setErrors((prev) => ({ ...prev, title: undefined }));
            }}
            placeholder="Örn. Haksan CNC fabrika ziyareti"
            maxLength={255}
            error={errors.title}
          />

          <DateTimeField
            label="Başlangıç *"
            mode={allDay ? 'date' : 'datetime'}
            value={startsAt}
            onChange={(value) => {
              setStartsAt(value);
              if (value && endsAt && endsAt.getTime() < value.getTime()) setEndsAt(new Date(value.getTime() + 60 * 60 * 1000));
              setErrors((prev) => ({ ...prev, endsAt: undefined }));
            }}
          />
          <DateTimeField
            label="Bitiş *"
            mode={allDay ? 'date' : 'datetime'}
            value={endsAt}
            onChange={(value) => {
              setEndsAt(value);
              setErrors((prev) => ({ ...prev, endsAt: undefined }));
            }}
            error={errors.endsAt}
          />

          <CompanyAddressSelect label="Konum" companyId={company?.id} value={location} onChange={(next) => setLocation(next.slice(0, 512))} />
          <Field
            label="Not"
            value={description}
            onChangeText={setDescription}
            maxLength={4000}
            multiline
            numberOfLines={3}
            className="min-h-[80px] rounded-control border border-border bg-card px-3.5 py-3 text-base text-foreground"
          />

          <View className="min-h-11 flex-row items-center justify-between">
            <Text className="font-inter text-sm text-foreground">Tüm gün</Text>
            <Switch
              accessibilityLabel="Tüm gün"
              value={allDay}
              onValueChange={setAllDay}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          {editing ? (
            <View className="min-h-11 flex-row items-center justify-between">
              <Text className="font-inter text-sm text-foreground">Tamamlandı</Text>
              <Switch
                accessibilityLabel="Tamamlandı"
                value={completed}
                onValueChange={setCompleted}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          ) : null}
        </ScrollView>

        <View className="gap-2 border-t border-border bg-card px-4 py-3">
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button label="Vazgeç" variant="ghost" disabled={busy} onPress={() => router.back()} />
            </View>
            <View className="flex-[2]">
              <Button
                label={create.isPending || update.isPending ? 'Kaydediliyor…' : 'Kaydet'}
                loading={create.isPending || update.isPending}
                disabled={busy || archived}
                onPress={submit}
              />
            </View>
          </View>
          {editing && !archived && canDelete ? (
            <Button label="Arşive al" variant="destructive" loading={archive.isPending} disabled={busy} onPress={confirmArchive} />
          ) : null}
          {editing && archived ? (
            <Button label="Geri al" variant="ghost" loading={restore.isPending} disabled={busy} onPress={runRestore} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
