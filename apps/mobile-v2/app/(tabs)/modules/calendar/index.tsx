import { useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCalendarEventsExt, useCalendarOwners, useUpdateCalendarEventExt } from '@/src/api/crm-general.hooks';
import type { CalendarEventFull } from '@/src/api/crm-general.api';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { formatTime } from '@/src/lib/format';
import { presentCalendarEditor } from '@/src/native/calendar';
import { toneColor, useTheme } from '@/src/theme/theme';
import { Chip, EmptyState, ErrorState, Eyebrow, FilterChips, ListRow, Loading, SCREEN_PAD, ScreenHeader } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { toast } from '@/src/ui/toast';
import { SheetMenu, type SheetMenuItem } from '@/src/ui/crm/SheetMenu';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_TYPE_LABELS,
  CALENDAR_VIEW_LABELS,
  TR_MONTHS,
  TR_WEEKDAYS,
  addDays,
  calendarRange,
  calendarSourceLabel,
  canEditCalendarEvent,
  dateKey,
  daysInRange,
  groupByDay,
  listSections,
  moveCursor,
  normalizeEventType,
  periodLabel,
  todayEventCount,
  upcomingEvents,
  type CalendarEventType,
  type CalendarView,
} from '@/src/ui/crm/calendar-logic';
import { CALENDAR_TYPE_STYLE } from '@/src/ui/crm/calendar-style';

const GRID_WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const VIEWS: CalendarView[] = ['month', 'week', 'day', 'list'];

const styleOf = (event: CalendarEventFull) => CALENDAR_TYPE_STYLE[normalizeEventType(event.eventType)];

function dayTitle(date: Date): string {
  return `${TR_WEEKDAYS[date.getDay()]} · ${date.getDate()} ${TR_MONTHS[date.getMonth()]}`;
}

/** Web CalendarPage: Ay/Hafta/Gün/Liste, kullanıcı filtresi, arşiv, içe aktarma. */
export default function CalendarScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const canCreate = useCan('calendar.create');
  const canUpdate = useCan('calendar.update');
  const isSuperAdmin = Boolean(user?.roles.includes('super_admin'));
  const owners = useCalendarOwners(isSuperAdmin);
  const updateEvent = useUpdateCalendarEventExt();
  const menu = useRef<BottomSheetModal>(null);

  const [view, setView] = useState<CalendarView>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [ownerUserId, setOwnerUserId] = useState('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [menuEvent, setMenuEvent] = useState<CalendarEventFull | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const range = useMemo(() => calendarRange(view, cursor), [view, cursor]);
  const query = useCalendarEventsExt({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    ownerUserId: ownerUserId === 'all' ? undefined : ownerUserId,
    includeArchived,
  });

  const allEvents = query.data ?? [];
  const events = useMemo(
    () => (typeFilter ? allEvents.filter((event) => normalizeEventType(event.eventType) === typeFilter) : allEvents),
    [allEvents, typeFilter],
  );
  const byDay = useMemo(() => groupByDay(events), [events]);
  const upcoming = useMemo(() => upcomingEvents(events), [events]);
  const typeOptions = useMemo(
    () =>
      CALENDAR_EVENT_TYPES.map((type) => ({
        value: type,
        label: CALENDAR_TYPE_LABELS[type],
        count: allEvents.filter((event) => normalizeEventType(event.eventType) === type && !event.deletedAt).length,
      })),
    [allEvents],
  );
  const ownerOptions = useMemo(
    () => [{ value: 'all', label: 'Tüm kullanıcılar' }, ...(owners.data ?? []).map((owner) => ({ value: owner.id, label: owner.fullName, hint: owner.email }))],
    [owners.data],
  );

  function openCreate(date?: Date) {
    const base = date ?? selected;
    router.push(`/modal/calendar-event?date=${encodeURIComponent(base.toISOString())}` as Href);
  }

  function goToday() {
    const now = new Date();
    setCursor(now);
    setSelected(now);
  }

  function move(direction: -1 | 1) {
    const next = moveCursor(view, cursor, direction);
    setCursor(next);
    if (view !== 'list') setSelected(next);
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  function canEdit(event: CalendarEventFull) {
    return canUpdate && canEditCalendarEvent(event, user?.id);
  }

  function toggleCompleted(event: CalendarEventFull) {
    updateEvent.mutate(
      { id: event.id, patch: { completedAt: event.completedAt ? null : new Date().toISOString() } },
      {
        onSuccess: () => toast.success('Etkinlik güncellendi'),
        onError: (error) => toast.error(error.message || 'Etkinlik kaydedilemedi'),
      },
    );
  }

  const menuItems: SheetMenuItem[] = menuEvent
    ? [
        ...(canEdit(menuEvent)
          ? [
              {
                key: 'edit',
                label: menuEvent.deletedAt ? 'Aç / Geri al' : 'Düzenle',
                icon: 'create-outline' as const,
                onPress: () => router.push(`/modal/calendar-event?id=${menuEvent.id}` as Href),
              },
            ]
          : []),
        ...(canEdit(menuEvent) && !menuEvent.deletedAt
          ? [
              {
                key: 'done',
                label: menuEvent.completedAt ? 'Tamamlanmadı işaretle' : 'Tamamlandı işaretle',
                icon: (menuEvent.completedAt ? 'refresh-outline' : 'checkmark-circle-outline') as 'refresh-outline',
                onPress: () => toggleCompleted(menuEvent),
              },
            ]
          : []),
        {
          key: 'device',
          label: 'Telefon takvimine ekle',
          icon: 'phone-portrait-outline',
          onPress: () =>
            void presentCalendarEditor(menuEvent).catch((error) =>
              toast.error(error instanceof Error ? error.message : 'Etkinlik eklenemedi.'),
            ),
        },
        ...(menuEvent.companyId
          ? [
              {
                key: 'company',
                label: 'Firma kartını aç',
                icon: 'business-outline' as const,
                onPress: () => router.push(`/(tabs)/modules/companies/${menuEvent.companyId}` as Href),
              },
            ]
          : []),
      ]
    : [];

  function openEvent(event: CalendarEventFull) {
    setMenuEvent(event);
    menu.current?.present();
  }

  function renderEvent(event: CalendarEventFull, keyPrefix = '') {
    const style = styleOf(event);
    const type = normalizeEventType(event.eventType);
    const source = calendarSourceLabel(event.source);
    const at = new Date(event.startsAt);
    const time = event.allDay ? 'Tüm gün' : `${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`;
    const dimmed = Boolean(event.deletedAt || event.completedAt);
    return (
      <View key={`${keyPrefix}${event.id}`} className={dimmed ? 'opacity-50' : ''}>
        <ListRow
          title={event.title}
          lines={[
            view === 'list' || keyPrefix ? `${at.getDate()} ${TR_MONTHS[at.getMonth()]} · ${time}` : time,
            [event.company?.shortName ?? event.company?.legalTitle, event.location].filter(Boolean).join(' · ') || null,
            [isSuperAdmin && ownerUserId === 'all' ? event.owner?.fullName : null, source].filter(Boolean).join(' · ') || null,
          ]}
          icon={event.completedAt ? 'checkmark-circle-outline' : style.icon}
          iconTone={event.completedAt ? 'success' : style.tone}
          chip={
            event.deletedAt
              ? { label: 'Arşivde', tone: 'neutral' }
              : event.completedAt
                ? { label: 'Tamamlandı', tone: 'success' }
                : { label: CALENDAR_TYPE_LABELS[type], tone: style.tone }
          }
          onPress={() => openEvent(event)}
        />
      </View>
    );
  }

  const gridDays = view === 'month' ? Array.from({ length: 42 }, (_, index) => addDays(range.from, index)) : [];
  const selectedEvents = byDay.get(dateKey(selected)) ?? [];
  const sections = view === 'list' ? listSections(events) : [];
  const agendaDays = view === 'week' || view === 'day' ? daysInRange(range.from, range.to) : [];
  const visibleCount = allEvents.filter((event) => !event.deletedAt).length;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Takvim"
        subtitle="Telefon takvimleri, toplantılar ve müşteri ziyaretleri tek akışta."
        actions={
          canCreate
            ? [
                { icon: 'cloud-upload-outline' as const, label: 'İçe aktar', onPress: () => router.push('/modal/calendar-import' as Href) },
                { icon: 'add' as const, label: 'Yeni etkinlik', onPress: () => openCreate() },
              ]
            : []
        }
      />

      <ScrollView
        contentContainerClassName="gap-3 pb-10"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
      >
        <View style={{ paddingHorizontal: SCREEN_PAD }} className="gap-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <Chip tone="info" label={`Bugün ${todayEventCount(allEvents)}`} />
            <Chip tone="neutral" label={`Bu görünümde ${visibleCount}`} />
          </View>

          <View className="flex-row rounded-control border border-border bg-card p-1" accessibilityRole="tablist">
            {VIEWS.map((item) => {
              const active = view === item;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${CALENDAR_VIEW_LABELS[item]} görünümü`}
                  onPress={() => setView(item)}
                  className={`min-h-11 flex-1 items-center justify-center rounded-control ${active ? 'bg-primary' : ''}`}
                >
                  <Text className={`font-inter-semibold text-sm ${active ? 'text-primary-foreground' : 'text-foreground'}`}>
                    {CALENDAR_VIEW_LABELS[item]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Önceki dönem"
              onPress={() => move(-1)}
              className="h-11 w-11 items-center justify-center rounded-full border border-border bg-card active:opacity-60"
            >
              <Ionicons name="chevron-back" size={18} color={colors.foreground} />
            </Pressable>
            <Text className="flex-1 text-center font-display text-lg text-foreground" numberOfLines={1}>
              {periodLabel(view, cursor)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sonraki dönem"
              onPress={() => move(1)}
              className="h-11 w-11 items-center justify-center rounded-full border border-border bg-card active:opacity-60"
            >
              <Ionicons name="chevron-forward" size={18} color={colors.foreground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bugüne git"
              onPress={goToday}
              className="h-11 items-center justify-center rounded-full border border-border bg-card px-4 active:opacity-60"
            >
              <Text className="font-inter-semibold text-sm text-foreground">Bugün</Text>
            </Pressable>
          </View>

          {isSuperAdmin ? (
            <OptionPicker
              label="Kullanıcı"
              icon="people-outline"
              value={ownerUserId}
              options={ownerOptions}
              searchable
              onChange={(value) => setOwnerUserId(value ?? 'all')}
            />
          ) : null}

          <View className="min-h-11 flex-row items-center justify-between rounded-control border border-border bg-card px-3">
            <Text className="font-inter text-sm text-foreground">Arşivi göster</Text>
            <Switch
              accessibilityLabel="Arşivi göster"
              value={includeArchived}
              onValueChange={setIncludeArchived}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        </View>

        <FilterChips options={typeOptions} value={typeFilter} onChange={setTypeFilter} allLabel="Tümü" />

        <View style={{ paddingHorizontal: SCREEN_PAD }} className="flex-row flex-wrap gap-x-3 gap-y-1">
          {CALENDAR_EVENT_TYPES.map((type: CalendarEventType) => (
            <View key={type} className="flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: toneColor(colors, CALENDAR_TYPE_STYLE[type].tone) }} />
              <Text className="font-inter text-xs text-muted-foreground">{CALENDAR_TYPE_LABELS[type]}</Text>
            </View>
          ))}
        </View>

        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={query.error.message || 'Takvim yüklenemedi'} onRetry={() => void query.refetch()} />
        ) : (
          <View style={{ paddingHorizontal: SCREEN_PAD }} className="gap-3">
            {view === 'month' ? (
              <>
                <View className="rounded-[16px] border border-border bg-card p-2">
                  <View className="flex-row pb-1">
                    {GRID_WEEKDAYS.map((label) => (
                      <Text key={label} className="flex-1 text-center font-inter-medium text-[11px] uppercase text-muted-foreground">
                        {label}
                      </Text>
                    ))}
                  </View>
                  <View className="flex-row flex-wrap">
                    {gridDays.map((day) => {
                      const key = dateKey(day);
                      const rows = byDay.get(key) ?? [];
                      const outside = day.getMonth() !== cursor.getMonth();
                      const isToday = key === dateKey(new Date());
                      const isSelected = key === dateKey(selected);
                      const tones = [...new Set(rows.map((row) => styleOf(row).tone))].slice(0, 3);
                      return (
                        <Pressable
                          key={key}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          accessibilityLabel={`${day.getDate()} ${TR_MONTHS[day.getMonth()]}${rows.length ? `, ${rows.length} etkinlik` : ''}`}
                          accessibilityHint={canCreate ? 'Uzun basarak bu güne etkinlik ekleyin' : undefined}
                          onPress={() => setSelected(day)}
                          onLongPress={canCreate ? () => openCreate(day) : undefined}
                          className={`h-12 w-[14.28%] items-center justify-center ${outside ? 'opacity-40' : ''}`}
                        >
                          <View
                            className={`h-8 w-8 items-center justify-center rounded-full ${isSelected ? 'bg-primary' : isToday ? 'border border-primary' : ''}`}
                          >
                            <Text className={`font-inter-medium text-[13px] ${isSelected ? 'text-primary-foreground' : 'text-foreground'}`}>
                              {day.getDate()}
                            </Text>
                          </View>
                          {tones.length > 0 ? (
                            <View className="absolute bottom-1 flex-row gap-0.5">
                              {tones.map((tone) => (
                                <View key={tone} className="h-1 w-1 rounded-full" style={{ backgroundColor: toneColor(colors, tone) }} />
                              ))}
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View className="flex-row items-baseline justify-between">
                  <Text className="font-inter-semibold text-[15px] text-foreground">
                    {dateKey(selected) === dateKey(new Date()) ? 'Bugün · ' : ''}
                    {dayTitle(selected)}
                  </Text>
                  <Text className="font-inter text-[13px] text-muted-foreground">{selectedEvents.length} etkinlik</Text>
                </View>
                {selectedEvents.length === 0 ? (
                  <EmptyState
                    title="Planlanmış etkinlik yok."
                    actionLabel={canCreate ? 'Yeni etkinlik' : undefined}
                    onAction={canCreate ? () => openCreate(selected) : undefined}
                  />
                ) : (
                  selectedEvents.map((event) => renderEvent(event))
                )}
              </>
            ) : null}

            {agendaDays.map((day) => {
              const rows = byDay.get(dateKey(day)) ?? [];
              return (
                <View key={dateKey(day)} className="gap-1">
                  <Eyebrow>{dayTitle(day)}</Eyebrow>
                  {rows.length === 0 ? (
                    <Text className="py-2 font-inter text-sm text-muted-foreground">Planlanmış etkinlik yok.</Text>
                  ) : (
                    rows.map((event) => renderEvent(event))
                  )}
                </View>
              );
            })}

            {view === 'list' ? (
              sections.length === 0 ? (
                <EmptyState title="Planlanmış etkinlik yok." />
              ) : (
                sections.map((section) => (
                  <View key={section.key} className="gap-1">
                    <Eyebrow>{`${dayTitle(section.date)} ${section.date.getFullYear()}`}</Eyebrow>
                    {section.events.map((event) => renderEvent(event))}
                  </View>
                ))
              )
            ) : null}

            {view !== 'list' ? (
              <View className="gap-1 pt-2">
                <Eyebrow>Yaklaşanlar</Eyebrow>
                {upcoming.length === 0 ? (
                  <Text className="py-2 font-inter text-sm text-muted-foreground">Yaklaşan etkinlik yok</Text>
                ) : (
                  upcoming.map((event) => renderEvent(event, 'up-'))
                )}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      <SheetMenu
        ref={menu}
        title={menuEvent?.title ?? 'Etkinlik'}
        subtitle={
          menuEvent && !canEdit(menuEvent) ? 'Bu etkinliği yalnız sahibi veya atayan kişi düzenleyebilir.' : undefined
        }
        items={menuItems}
      />
    </SafeAreaView>
  );
}
