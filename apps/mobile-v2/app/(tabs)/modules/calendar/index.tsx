import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCalendarEvents } from '@/src/api/calendar.hooks';
import type { CalendarEvent } from '@/src/api/endpoints';
import { formatTime } from '@/src/lib/format';
import { toneColor, useTheme, type Tone } from '@/src/theme/theme';
import { EmptyState, ErrorState, Eyebrow, FilterChips, ListRow, Loading, ScreenHeader } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { presentCalendarEditor } from '@/src/native/calendar';
import { useCan } from '@/src/auth/AuthProvider';

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
// Date.getDay() 0 = Pazar ile aynı sırada (WEEKDAYS ızgara başlığı Pazartesi başlangıçlı, bu ayrı).
const WEEKDAY_FULL = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

const EVENT_STYLE: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: Tone; label: string }> = {
  meeting: { icon: 'people-outline', tone: 'stage', label: 'Toplantı' },
  visit: { icon: 'navigate-outline', tone: 'info', label: 'Ziyaret' },
  service: { icon: 'construct-outline', tone: 'warning', label: 'Servis' },
  call: { icon: 'call-outline', tone: 'info', label: 'Görüşme' },
  task: { icon: 'checkbox-outline', tone: 'success', label: 'Görev' },
  other: { icon: 'calendar-outline', tone: 'neutral', label: 'Etkinlik' },
};

const styleFor = (event: CalendarEvent) => EVENT_STYLE[event.eventType] ?? EVENT_STYLE.other!;

/** Gün hücresindeki noktalar: o günün etkinlik tiplerine göre benzersiz renkler, en fazla 3. */
function dayTones(events: CalendarEvent[]): Tone[] {
  const seen = new Set<Tone>();
  for (const event of events) {
    seen.add(styleFor(event).tone);
    if (seen.size === 3) break;
  }
  return [...seen];
}

/** Yerel gün anahtarı (UTC'ye çevirmeden), gün gruplaması için. */
function dayKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Pazartesi başlangıçlı 6x7 ızgara: ayın günleri + baştaki/sondaki boşluklar. */
function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Pazar=0 -> Pazartesi=0 düzeltmesi
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function CalendarScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const canCreate = useCan('calendar.create');
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);
  const [type, setType] = useState<string | null>(null);

  const range = useMemo(
    () => ({
      from: new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString(),
      to: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59).toISOString(),
    }),
    [cursor]
  );

  const { data, isPending, error, refetch } = useCalendarEvents(range);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of data ?? []) {
      const key = dayKey(event.startsAt);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [data]);

  const dayEvents = useMemo(() => {
    const list = byDay.get(dayKey(selected)) ?? [];
    return type ? list.filter((event) => event.eventType === type) : list;
  }, [byDay, selected, type]);

  const upcoming = useMemo(
    () =>
      (data ?? [])
        .filter((event) => new Date(event.startsAt).getTime() > Date.now())
        .slice(0, 5),
    [data]
  );

  const typeOptions = useMemo(() => {
    const seen = new Set((data ?? []).map((event) => event.eventType));
    return [...seen].map((value) => ({ value, label: (EVENT_STYLE[value] ?? EVENT_STYLE.other!).label }));
  }, [data]);

  const cells = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const shift = (delta: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  function openEvent(event: CalendarEvent) {
    const actions = [
      {
        text: 'Düzenle',
        onPress: () =>
          router.push(
            `/modal/calendar-event?id=${event.id}&eventType=${event.eventType}&title=${encodeURIComponent(event.title)}&description=${encodeURIComponent(event.description ?? '')}&location=${encodeURIComponent(event.location ?? '')}&startsAt=${encodeURIComponent(event.startsAt)}&endsAt=${encodeURIComponent(event.endsAt)}` as Href
          ),
      },
      {
        text: 'Takvime Ekle',
        onPress: () => void presentCalendarEditor(event).catch((error) =>
          Alert.alert('Takvim açılamadı', error instanceof Error ? error.message : 'Etkinlik eklenemedi.')
        ),
      },
      ...(event.companyId
        ? [{ text: 'Firma Kartı', onPress: () => router.push(`/(tabs)/modules/companies/${event.companyId}`) }]
        : []),
      { text: 'Vazgeç', style: 'cancel' as const },
    ];
    Alert.alert(event.title, 'Bu etkinlik için yapmak istediğiniz işlemi seçin.', actions);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Takvim"
        subtitle="Etkinliklerinizi planlayın, işlerinizde zamanında ilerleyin."
        actions={
          canCreate
            ? [
                {
                  icon: 'add' as const,
                  label: 'Yeni etkinlik',
                  onPress: () => {
                    const date = selected.toISOString();
                    router.push(`/modal/calendar-event?date=${encodeURIComponent(date)}` as Href);
                  },
                },
              ]
            : []
        }
      />

      <ScrollView contentContainerClassName="pb-8">
        <View className="mx-4 rounded-surface border border-border bg-card p-3">
          <View className="flex-row items-center justify-between pb-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Önceki ay"
              onPress={() => shift(-1)}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
            >
              <Ionicons name="chevron-back" size={18} color={colors.foreground} />
            </Pressable>
            <Text className="font-inter-semibold text-[15px] text-foreground">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sonraki ay"
              onPress={() => shift(1)}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
            >
              <Ionicons name="chevron-forward" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <View className="flex-row">
            {WEEKDAYS.map((label) => (
              <Text
                key={label}
                className="flex-1 text-center font-inter-medium text-[11px] uppercase text-muted-foreground"
              >
                {label}
              </Text>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {cells.map((date, index) => {
              if (!date) return <View key={`empty-${index}`} className="h-11 w-[14.28%]" />;
              const isToday = dayKey(date) === dayKey(today);
              const isSelected = dayKey(date) === dayKey(selected);
              const dayList = byDay.get(dayKey(date)) ?? [];
              const count = dayList.length;
              const tones = dayTones(dayList);
              const weekend = date.getDay() === 0 || date.getDay() === 6;
              return (
                <Pressable
                  key={date.toISOString()}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${date.getDate()} ${MONTHS[date.getMonth()]}${count ? `, ${count} etkinlik` : ''}`}
                  onPress={() => setSelected(date)}
                  className="h-11 w-[14.28%] items-center justify-center"
                >
                  <View
                    className={`h-8 w-8 items-center justify-center rounded-full ${
                      isSelected ? 'bg-primary' : isToday ? 'border border-primary' : ''
                    }`}
                  >
                    <Text
                      className={`font-inter-medium text-[13px] ${
                        isSelected
                          ? 'text-primary-foreground'
                          : weekend
                            ? 'text-destructive'
                            : 'text-foreground'
                      }`}
                    >
                      {date.getDate()}
                    </Text>
                  </View>
                  {tones.length > 0 ? (
                    <View className="absolute bottom-1 flex-row gap-0.5">
                      {tones.map((tone) => (
                        <View
                          key={tone}
                          className="h-1 w-1 rounded-full"
                          style={{ backgroundColor: toneColor(colors, tone) }}
                        />
                      ))}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {typeOptions.length > 1 ? (
          <View className="py-3">
            <FilterChips options={typeOptions} value={type} onChange={setType} />
          </View>
        ) : (
          <View className="h-3" />
        )}

        {isPending ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        ) : (
          <View className="px-4">
            <View className="pb-1">
              <Eyebrow>
                {dayKey(selected) === dayKey(today) ? 'Bugün · ' : ''}
                {selected.getDate()} {MONTHS[selected.getMonth()]} {WEEKDAY_FULL[selected.getDay()]} ·{' '}
                {dayEvents.length} etkinlik
              </Eyebrow>
            </View>

            {dayEvents.length === 0 ? (
              <EmptyState title="Bu günde etkinlik yok" />
            ) : (
              dayEvents.map((event) => {
                const style = styleFor(event);
                return (
                  <ListRow
                    key={event.id}
                    title={event.title}
                    lines={[
                      event.allDay ? 'Tüm gün' : `${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`,
                      event.company?.shortName ?? event.company?.legalTitle ?? event.location,
                      event.owner?.fullName,
                    ]}
                    icon={style.icon}
                    iconTone={style.tone}
                    chip={{ label: style.label, tone: style.tone }}
                    onPress={() => openEvent(event)}
                  />
                );
              })
            )}

            {upcoming.length > 0 ? (
              <>
                <View className="pb-1 pt-4">
                  <Eyebrow>Yaklaşan etkinlikler</Eyebrow>
                </View>
                {upcoming.map((event) => {
                  const style = styleFor(event);
                  const at = new Date(event.startsAt);
                  return (
                    <ListRow
                      key={`up-${event.id}`}
                      title={event.title}
                      lines={[
                        `${at.getDate()} ${MONTHS[at.getMonth()]} · ${formatTime(event.startsAt)}`,
                        event.company?.shortName ?? event.location,
                      ]}
                      icon={style.icon}
                      iconTone={style.tone}
                      onPress={() => setSelected(at)}
                    />
                  );
                })}
              </>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
