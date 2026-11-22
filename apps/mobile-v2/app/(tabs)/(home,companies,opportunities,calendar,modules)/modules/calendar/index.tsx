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
import { EmptyState, ErrorState, Eyebrow, Fab, FilterChips, ListRow, Loading, SCREEN_PAD, ScreenHeader, SegmentedTabs } from '@/src/ui';
import { SyncStatus } from '@/src/ui/SyncStatus';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
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
  canEditCalendarEvent,
  dateKey,
  daysInRange,
  groupByDay,
  listSections,
  moveCursor,
  normalizeEventType,
  periodLabel,
  upcomingEvents,
  type CalendarView,
} from '@/src/ui/crm/calendar-logic';
import { CALENDAR_TYPE_STYLE } from '@/src/ui/crm/calendar-style';

const GRID_WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
// Gün görünümü kalktı: Ay'da güne dokunmak aynı listeyi veriyordu.
const VIEWS: CalendarView[] = ['month', 'week', 'list'];

const styleOf = (event: CalendarEventFull) => CALENDAR_TYPE_STYLE[normalizeEventType(event.eventType)];

function dayTitle(date: Date): string {
  return `${TR_WEEKDAYS[date.getDay()]} · ${date.getDate()} ${TR_MONTHS[date.getMonth()]}`;
}

/** Web CalendarPage: Ay/Hafta/Gün/Liste, kullanıcı filtresi, arşiv, içe aktarma. */
export default function CalendarScreen() {
  const GLASS_TAB_BAR_HEIGHT = useNavigationBottomInset();
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
  // Filtreler varsayılan kapalı: takvim ızgarası ilk ekranda görünsün.
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  const activeFilterCount = (ownerUserId !== 'all' ? 1 : 0) + (includeArchived ? 1 : 0) + (typeFilter ? 1 : 0);

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
                onPress: () => router.push(`/modules/companies/${menuEvent.companyId}` as Href),
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
    const at = new Date(event.startsAt);
    const time = event.allDay ? 'Tüm gün' : `${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`;
    const dimmed = Boolean(event.deletedAt || event.completedAt);
    return (
      <View key={`${keyPrefix}${event.id}`} className={dimmed ? 'opacity-50' : ''}>
        <ListRow
          title={event.title}
          lines={[
            view === 'list' || keyPrefix ? `${at.getDate()} ${TR_MONTHS[at.getMonth()]} · ${time}` : time,
            [
              event.company?.shortName ?? event.company?.legalTitle,
              event.location,
              isSuperAdmin && ownerUserId === 'all' ? event.owner?.fullName ?? null : null,
            ]
              .filter(Boolean)
              .join(' · ') || null,
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
  // Haftada boş günler tek tek "etkinlik yok" yazıyordu; yalnız dolu günler.
  const agendaDays = view === 'week' ? daysInRange(range.from, range.to).filter((day) => byDay.has(dateKey(day))) : [];
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <SyncStatus />
      <ScreenHeader
        title="Takvim"
        actions={
          canCreate
            ? [{ icon: 'cloud-upload-outline' as const, label: 'İçe aktar', onPress: () => router.push('/modal/calendar-import' as Href) }]
            : []
        }
        compact/>

      <ScrollView
        contentContainerClassName="gap-3"
        contentContainerStyle={{ paddingBottom: 40 + GLASS_TAB_BAR_HEIGHT , width: '100%', maxWidth: 960, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}
      >
        <View style={{ paddingHorizontal: SCREEN_PAD }} className="gap-3">
          <SegmentedTabs
            items={VIEWS}
            value={view}
            onChange={setView}
            labelFor={(item) => CALENDAR_VIEW_LABELS[item]}
            a11yLabelFor={(item) => `${CALENDAR_VIEW_LABELS[item]} görünümü`}
          />

          {/* Dönem, gezinme ve filtre tek satırda: önceden üç ayrı kutulu satırdı. */}
          <View className="flex-row items-center">
            <Text className="flex-1 font-inter-semibold text-[17px] text-foreground" numberOfLines={1}>
              {view === 'list' ? 'Tüm etkinlikler' : periodLabel(view, cursor)}
            </Text>
            {view !== 'list' ? (
              <>
                <Pressable accessibilityRole="button" accessibilityLabel="Bugüne git" onPress={goToday} className="h-11 justify-center px-2 active:opacity-60">
                  <Text className="font-inter-medium text-[14px] text-primary">Bugün</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Önceki dönem" onPress={() => move(-1)} className="h-11 w-10 items-center justify-center active:opacity-60">
                  <Ionicons name="chevron-back" size={20} color={colors.foreground} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Sonraki dönem" onPress={() => move(1)} className="h-11 w-10 items-center justify-center active:opacity-60">
                  <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
                </Pressable>
              </>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: filtersOpen }}
              accessibilityLabel={activeFilterCount ? `Filtreler, ${activeFilterCount} etkin` : 'Filtreler'}
              onPress={() => setFiltersOpen((open) => !open)}
              className={`h-11 w-11 items-center justify-center rounded-full active:opacity-60 ${filtersOpen ? 'bg-secondary' : ''}`}
            >
              <Ionicons name="options-outline" size={20} color={activeFilterCount ? colors.primary : colors.foreground} />
              {activeFilterCount ? <View className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" /> : null}
            </Pressable>
          </View>

          {filtersOpen ? (
            <>
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

            <View className="min-h-11 flex-row items-center justify-between">
              <Text className="font-inter text-sm text-foreground">Arşivi göster</Text>
              <Switch
                accessibilityLabel="Arşivi göster"
                value={includeArchived}
                onValueChange={setIncludeArchived}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
            </>
          ) : null}
        </View>

        {/* Tür çipleri renk açıklamasını da taşıyor; ayrı nokta açıklaması tekrardı. */}
        {filtersOpen ? <FilterChips options={typeOptions} value={typeFilter} onChange={setTypeFilter} allLabel="Tümü" /> : null}

        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState message={query.error.message || 'Takvim yüklenemedi'} onRetry={() => void query.refetch()} />
        ) : (
          <View style={{ paddingHorizontal: SCREEN_PAD }} className="gap-3">
            {view === 'month' ? (
              <>
                <View className="py-1">
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
                  <Text className="py-2 font-inter text-sm text-muted-foreground">Bu gün için planlanmış etkinlik yok.</Text>
                ) : (
                  selectedEvents.map((event) => renderEvent(event))
                )}
              </>
            ) : null}

            {view === 'week' && agendaDays.length === 0 ? (
              <Text className="py-2 font-inter text-sm text-muted-foreground">Bu hafta planlanmış etkinlik yok.</Text>
            ) : null}
            {agendaDays.map((day) => (
              <View key={dateKey(day)} className="gap-1">
                <Eyebrow>{dayTitle(day)}</Eyebrow>
                {(byDay.get(dateKey(day)) ?? []).map((event) => renderEvent(event))}
              </View>
            ))}

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

      {canCreate ? <Fab extended label="Yeni etkinlik" onPress={() => openCreate()} /> : null}

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
