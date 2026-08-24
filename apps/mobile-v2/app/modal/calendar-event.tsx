import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCreateCalendarEvent, useDeleteCalendarEvent, useUpdateCalendarEvent } from '@/src/api/calendar.hooks';
import type { CalendarEventInput } from '@/src/api/endpoints';
import { useCan } from '@/src/auth/AuthProvider';
import { parseLocalDateTime } from '@/src/lib/format';
import { chipClass, chipTextClass, toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { Button, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';

const EVENT_TYPES: { code: string; label: string; icon: keyof typeof Ionicons.glyphMap; tone: Tone }[] = [
  { code: 'meeting', label: 'Toplantı', icon: 'people-outline', tone: 'stage' },
  { code: 'visit', label: 'Ziyaret', icon: 'navigate-outline', tone: 'info' },
  { code: 'service', label: 'Servis', icon: 'construct-outline', tone: 'warning' },
  { code: 'call', label: 'Görüşme', icon: 'call-outline', tone: 'info' },
  { code: 'task', label: 'Görev', icon: 'checkbox-outline', tone: 'success' },
  { code: 'other', label: 'Diğer', icon: 'calendar-outline', tone: 'neutral' },
];

type FormState = {
  eventType: string;
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
    contactId?: string;
    opportunityId?: string;
  }>();

  // Düzenleme yetkisi create izniyle aynı kapıdan yönetiliyor; okuma herkese açık.
  const editing = Boolean(params.id);
  const create = useCreateCalendarEvent();
  const update = useUpdateCalendarEvent(params.id ?? '');
  const remove = useDeleteCalendarEvent();

  const fallback = defaultRange(params.date);
  const [form, setForm] = useState<FormState>({
    eventType: params.eventType ?? 'meeting',
    title: params.title ?? '',
    description: params.description ?? '',
    location: params.location ?? '',
    startsAt: formatInput(params.startsAt) || fallback.start,
    endsAt: formatInput(params.endsAt) || fallback.end,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [allDay, setAllDay] = useState(false);

  function set<K extends keyof FormState>(key: K, value: string) {
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
    if (params.companyId) body.companyId = params.companyId;
    if (params.contactId) body.contactId = params.contactId;
    if (params.opportunityId) body.opportunityId = params.opportunityId;

    if (editing) {
      update.mutate(body, {
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
    Alert.alert('Etkinliği Sil', 'Bu etkinlik kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          remove.mutate(params.id!, {
            onSuccess: () => {
              toast.success('Etkinlik silindi');
              router.back();
            },
            onError: (error) => toast.error(error.message),
          }),
      },
    ]);
  }

  if (!editing && !canCreate) return <Redirect href="/(tabs)/modules/calendar" />;

  const busy = create.isPending || update.isPending;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: editing ? 'Etkinliği Düzenle' : 'Yeni Etkinlik', headerShown: true }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
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
