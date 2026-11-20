import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { calendarKeys, useCreateCalendarEvent, useDeleteCalendarEvent, useUpdateCalendarEvent } from '@/src/api/calendar.hooks';
import { restoreCalendarEvent } from '@/src/api/general.endpoints';
import { CALENDAR_EVENT_TYPES } from '@haksan/shared';
import { calendar, type CalendarEvent, type CalendarEventInput } from '@/src/api/endpoints';
import { useQuery } from '@tanstack/react-query';
import { CompanyPickerField, type PickedCompany } from '@/src/features/CompanyPickerField';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { parseLocalDateTime } from '@/src/lib/format';
import { chipClass, chipTextClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Button, Field, FilterChips, Loading } from '@/src/ui';
import { toast } from '@/src/ui/toast';

// Kodlar API'nin kabul ettiği CALENDAR_EVENT_TYPES ile birebir aynı olmalı.
const EVENT_TYPES: { code: CalendarEventType; label: string; icon: keyof typeof Ionicons.glyphMap; tone: Tone }[] = [
  { code: 'meeting', label: 'Toplantı', icon: 'people-outline', tone: 'stage' },
  { code: 'customer_visit', label: 'Müşteri Ziyareti', icon: 'navigate-outline', tone: 'info' },
  { code: 'call', label: 'Görüşme', icon: 'call-outline', tone: 'info' },
  { code: 'task', label: 'Görev', icon: 'checkbox-outline', tone: 'success' },
  { code: 'other', label: 'Diğer', icon: 'calendar-outline', tone: 'neutral' },
];

type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

type FormState = {
  eventType: CalendarEventType;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Gün başlangıcı -> "YYYY-AA-GG 09:00 / 10:00" varsayılanı. */
function defaultRange(dateText?: string): { start: string; end: string } {
  const base = dateText ? new Date(dateText) : new Date();
  const safe = Number.isNaN(base.getTime()) ? new Date() : base;
  const y = safe.getFullYear();
  const m = pad(safe.getMonth() + 1);
  const d = pad(safe.getDate());
  return { start: `${y}-${m}-${d} 09:00`, end: `${y}-${m}-${d} 10:00` };
}

function formatInput(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CalendarEventScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('calendar.create');
  const canRestore = useCan('calendar.update');
  const qc = useQueryClient();
  const params = useLocalSearchParams<{
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
  }>();

  // Düzenleme yetkisi create izniyle aynı kapıdan yönetiliyor; okuma herkese açık.
  const editing = Boolean(params.id);
  const create = useCreateCalendarEvent();
  const update = useUpdateCalendarEvent(params.id ?? '');
  const remove = useDeleteCalendarEvent();

  const { user } = useAuth();
  const isSuperAdmin = Boolean(user?.roles?.includes('super_admin'));
  const owners = useQuery({ queryKey: ['calendar', 'owners'], queryFn: () => calendar.owners(), enabled: isSuperAdmin && !params.id, staleTime: 3_600_000 });
  const fallback = defaultRange(params.date);
  const [company, setCompany] = useState<PickedCompany | null>(params.companyId ? { id: params.companyId, name: params.companyName ?? 'Seçili firma' } : null);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [originalCompleted, setOriginalCompleted] = useState(false);
  const [hydrated, setHydrated] = useState(!params.id);
  const [form, setForm] = useState<FormState>({
    // Web CalendarPage: yeni etkinliğin varsayılan türü müşteri ziyareti.
    eventType: (CALENDAR_EVENT_TYPES as readonly string[]).includes(params.eventType ?? '') ? params.eventType as CalendarEventType : 'customer_visit',
    title: params.title ?? '',
    description: params.description ?? '',
    location: params.location ?? '',
    startsAt: formatInput(params.startsAt) || fallback.start,
    endsAt: formatInput(params.endsAt) || fallback.end,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [allDay, setAllDay] = useState(false);

  // Düzenleme formu URL'deki eksik alanlardan değil, kaydın tamamından dolar (web ile aynı);
  // aksi halde tüm gün bayrağı ve başlık boş gelip kayıt ezilebiliyordu.
  useEffect(() => {
    if (!params.id || hydrated) return;
    let active = true;
    const apply = (event: CalendarEvent) => {
      if (!active) return;
      setForm({
        eventType: (CALENDAR_EVENT_TYPES as readonly string[]).includes(event.eventType) ? event.eventType as CalendarEventType : 'other',
        title: event.title,
        description: event.description ?? '',
        location: event.location ?? '',
        startsAt: formatInput(event.startsAt),
        endsAt: formatInput(event.endsAt),
      });
      setAllDay(event.allDay);
      setCompany(event.companyId ? { id: event.companyId, name: event.company?.shortName ?? event.company?.legalTitle ?? 'Firma' } : null);
      setCompleted(Boolean(event.completedAt));
      setOriginalCompleted(Boolean(event.completedAt));
      setHydrated(true);
    };
    const cached = qc.getQueriesData<CalendarEvent[]>({ queryKey: calendarKeys.allEvents })
      .flatMap(([, rows]) => (Array.isArray(rows) ? rows : []))
      .find((row) => row.id === params.id);
    if (cached) apply(cached);
    else {
      const now = Date.now();
      calendar.events({ from: new Date(now - 180 * 86_400_000).toISOString(), to: new Date(now + 365 * 86_400_000).toISOString() })
        .then((rows) => { const found = rows.find((row) => row.id === params.id); if (found) apply(found); else if (active) setHydrated(true); })
        .catch(() => { if (active) setHydrated(true); });
    }
    return () => { active = false; };
  }, [params.id, hydrated, qc]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function submit() {
    const start = parseLocalDateTime(form.startsAt);
    const end = allDay
      ? (() => {
          const s = parseLocalDateTime(form.startsAt);
          if (!s) return null;
          const e = new Date(s);
          e.setHours(23, 59, 0, 0);
          return e;
        })()
      : parseLocalDateTime(form.endsAt);

    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) nextErrors.title = 'Başlık zorunludur.';
    if (form.eventType === 'customer_visit' && !company) nextErrors.eventType = 'Müşteri ziyareti için firma seçin.';
    if (!start) nextErrors.startsAt = 'Tarih ve saati YYYY-AA-GG SS:DD biçiminde girin.';
    if (!end && !allDay) nextErrors.endsAt = 'Tarih ve saati YYYY-AA-GG SS:DD biçiminde girin.';
    if (start && end && end.getTime() < start.getTime()) nextErrors.endsAt = 'Bitiş başlangıçtan önce olamaz.';
    if (Object.keys(nextErrors).some((k) => nextErrors[k as keyof typeof nextErrors])) {
      setErrors(nextErrors);
      return;
    }

    const body: CalendarEventInput = {
      eventType: form.eventType,
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      startsAt: start!.toISOString(),
      endsAt: (end ?? start!).toISOString(),
      allDay,
    };
    if (company) body.companyId = company.id;
    else if (editing) body.companyId = null;
    if (params.contactId) body.contactId = params.contactId;
    if (!editing && isSuperAdmin && ownerUserId) body.ownerUserId = ownerUserId;
    if (params.opportunityId) body.opportunityId = params.opportunityId;

    if (editing) {
      update.mutate(completed === originalCompleted ? body : { ...body, completedAt: completed ? new Date().toISOString() : null }, {
        onSuccess: () => {
          toast.success('Etkinlik güncellendi');
          router.back();
        },
        onError: (error) => toast.error(error.message),
      });
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast.success('Etkinlik oluşturuldu');
          router.back();
        },
        onError: (error) => toast.error(error.message),
      });
    }
  }

  function handleDelete() {
    if (!params.id) return;
    const id = params.id;
    // Sunucu silmeyi arşive alma olarak yapar; 30 gün içinde geri alınabilir (web "Geri al").
    const undo = () =>
      restoreCalendarEvent(id)
        .then(() => {
          void qc.invalidateQueries({ queryKey: calendarKeys.allEvents });
          toast.success('Etkinlik geri alındı');
        })
        .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Etkinlik geri alınamadı.'));
    Alert.alert('Etkinliği Sil', 'Etkinlik arşive alınır; 30 gün içinde geri alabilirsiniz.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          remove.mutate(id, {
            onSuccess: () => {
              router.back();
              if (!canRestore) return toast.success('Etkinlik silindi');
              Alert.alert('Etkinlik silindi', undefined, [
                { text: 'Tamam', style: 'cancel' },
                { text: 'Geri al', onPress: () => void undo() },
              ]);
            },
            onError: (error) => toast.error(error.message),
          }),
      },
    ]);
  }

  if (!editing && !canCreate) return <Redirect href="/calendar" />;
  if (editing && !hydrated) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: 'Etkinliği Düzenle', headerShown: true }} />
        <Loading />
      </SafeAreaView>
    );
  }

  const busy = create.isPending || update.isPending;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: editing ? 'Etkinliği Düzenle' : 'Yeni Etkinlik', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <View className="flex-row flex-wrap gap-2">
            {EVENT_TYPES.map((type) => {
              const active = form.eventType === type.code;
              return (
                <Pressable
                  key={type.code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => set('eventType', type.code)}
                  className={`flex-row items-center gap-1.5 self-start rounded-full border px-3 py-2 ${active ? chipClass[type.tone] : 'border-border bg-card'}`}
                >
                  <Ionicons name={type.icon} size={14} color={toneColor(colors, active ? type.tone : 'neutral')} />
                  <Text className={`font-inter-medium text-xs ${active ? chipTextClass[type.tone] : 'text-foreground'}`}>
                    {type.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {form.eventType === 'customer_visit' || company ? (
            <CompanyPickerField label="Firma" required={form.eventType === 'customer_visit'} value={company} onChange={(next) => { setCompany(next); setErrors((prev) => ({ ...prev, eventType: undefined })); }} error={errors.eventType} />
          ) : null}
          <Field
            label="Başlık *"
            value={form.title}
            onChangeText={(v) => set('title', v)}
            error={errors.title}
            autoFocus={!editing}
          />
          <Field label="Konum" value={form.location} onChangeText={(v) => set('location', v)} />
          <Field
            label="Başlangıç *"
            value={form.startsAt}
            onChangeText={(v) => set('startsAt', v)}
            placeholder="YYYY-AA-GG SS:DD"
            error={errors.startsAt}
          />
          {!allDay ? (
            <Field
              label="Bitiş *"
              value={form.endsAt}
              onChangeText={(v) => set('endsAt', v)}
              placeholder="YYYY-AA-GG SS:DD"
              error={errors.endsAt}
            />
          ) : null}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allDay }}
            onPress={() => setAllDay((prev) => !prev)}
            className="h-11 flex-row items-center gap-2"
          >
            <Ionicons name={allDay ? 'checkbox' : 'square-outline'} size={20} color={colors.mutedForeground} />
            <Text className="font-inter text-sm text-foreground">Tüm gün</Text>
          </Pressable>
          {editing ? (
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: completed }} onPress={() => setCompleted((prev) => !prev)} className="h-11 flex-row items-center gap-2">
              <Ionicons name={completed ? 'checkbox' : 'square-outline'} size={20} color={colors.mutedForeground} />
              <Text className="font-inter text-sm text-foreground">Tamamlandı</Text>
            </Pressable>
          ) : null}
          {!editing && isSuperAdmin ? (
            <View className="gap-1.5">
              <Text className="font-inter-medium text-[13px] text-muted-foreground">Kimin takvimine</Text>
              <FilterChips options={[{ value: '', label: 'Bana' }, ...(owners.data ?? []).filter((item) => item.id !== user?.id).map((item) => ({ value: item.id, label: item.fullName }))]} value={ownerUserId ?? ''} onChange={(value) => setOwnerUserId(value || null)} allLabel="" />
            </View>
          ) : null}
          <Field
            label="Açıklama"
            value={form.description}
            onChangeText={(v) => set('description', v)}
            multiline
            numberOfLines={3}
            className="min-h-[80px] rounded-control border border-border bg-card px-3.5 py-3 text-base text-foreground"
          />
        </ScrollView>

        <View className="gap-2 border-t border-border bg-card px-4 py-3">
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} />
            </View>
            <View className="flex-[2]">
              <Button label={editing ? 'Kaydet' : 'Oluştur'} loading={busy} onPress={submit} />
            </View>
          </View>
          {editing ? (
            <Button
              label="Etkinliği Sil"
              variant="ghost"
              loading={remove.isPending}
              disabled={remove.isPending || busy}
              onPress={handleDelete}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
