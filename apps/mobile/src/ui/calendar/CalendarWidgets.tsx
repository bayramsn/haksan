import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CalendarEventDTO, CalendarEventType } from '@/src/api/services';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard, shadowElevated, shadowFab } from '@/src/theme/styles';

export const CALENDAR_VIEWS = ['Gün', 'Hafta', 'Ay'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;
export const HOUR_HEIGHT = 60;
export const TIMELINE_START = 8;
export const TIMELINE_END = 18;
export const TIME_COL_WIDTH = 64;

const errorContainer = '#ffdad6';
const onErrorContainer = '#93000a';
const onPrimaryFixedVariant = '#333e92';

type EventVisual = {
  bg: string;
  border: string;
  title: string;
  subtitle: string;
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
  deadline?: boolean;
};

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getWeekDays(cursor: Date): Date[] {
  const monday = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function formatCalendarDateTitle(date: Date): string {
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
}

export function formatMonthTitle(date: Date): string {
  return date.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

function eventVisual(event: CalendarEventDTO): EventVisual {
  const isDeadline =
    /son tarih|deadline|vade|tekif son/i.test(event.title) ||
    (event.eventType === 'task' && /son tarih|deadline/i.test(event.description ?? ''));

  if (isDeadline) {
    return {
      bg: errorContainer,
      border: '#ffb4ab',
      title: onErrorContainer,
      subtitle: onErrorContainer,
      icon: 'alert-circle',
      compact: true,
      deadline: true,
    };
  }

  const map: Record<CalendarEventType, EventVisual> = {
    meeting: {
      bg: 'rgba(208, 225, 251, 0.45)',
      border: colors.surfaceTint,
      title: colors.surfaceTint,
      subtitle: colors.onSecondaryContainer,
    },
    customer_visit: {
      bg: 'rgba(223, 224, 255, 0.55)',
      border: colors.primary,
      title: colors.primary,
      subtitle: onPrimaryFixedVariant,
      icon: 'location-outline',
    },
    call: {
      bg: '#fff3e0',
      border: '#f57c00',
      title: '#e65100',
      subtitle: '#e65100',
      compact: true,
    },
    task: {
      bg: '#e8f5e9',
      border: '#388e3c',
      title: '#1b5e20',
      subtitle: '#2e7d32',
      icon: 'construct-outline',
    },
    other: {
      bg: 'rgba(208, 225, 251, 0.45)',
      border: colors.surfaceTint,
      title: colors.surfaceTint,
      subtitle: colors.onSecondaryContainer,
    },
  };

  return map[event.eventType] ?? map.other;
}

function eventsForDay(events: CalendarEventDTO[], day: Date): CalendarEventDTO[] {
  return events
    .filter((e) => sameDay(new Date(e.startsAt), day))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

function eventTop(startsAt: Date): number {
  const minutes = startsAt.getHours() * 60 + startsAt.getMinutes();
  const startMinutes = TIMELINE_START * 60;
  return Math.max(0, ((minutes - startMinutes) / 60) * HOUR_HEIGHT);
}

function eventHeight(startsAt: Date, endsAt: Date): number {
  const start = startsAt.getHours() * 60 + startsAt.getMinutes();
  const end = endsAt.getHours() * 60 + endsAt.getMinutes();
  const duration = Math.max(30, end - start);
  return Math.max(24, (duration / 60) * HOUR_HEIGHT - 2);
}

function clampEventLayout(top: number, height: number, maxHeight: number) {
  const clampedTop = Math.max(0, Math.min(top, maxHeight - 24));
  const maxH = maxHeight - clampedTop;
  return { top: clampedTop, height: Math.min(height, maxH) };
}

/** Stitch `4774acd7` — menü + Takvim + görünüm */
export function CalendarHeader({
  onMenu,
  onToday,
}: {
  onMenu?: () => void;
  onToday?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top }, shadowCard]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={onMenu}
          hitSlop={8}
          style={({ pressed }) => [styles.headerIconBtn, pressFade(pressed)]}
          accessibilityLabel="Geri"
        >
          <Ionicons name="menu-outline" size={24} color={colors.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.headerTitle}>Takvim</Text>
        <Pressable
          onPress={onToday}
          hitSlop={8}
          style={({ pressed }) => [styles.headerIconBtn, pressFade(pressed)]}
          accessibilityLabel="Gün görünümü"
        >
          <Ionicons name="calendar-number-outline" size={22} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>
    </View>
  );
}

export function CalendarControlsPanel({
  view,
  onViewChange,
  cursor,
  onSelectDay,
  onPrevDay,
  onNextDay,
  onPrevWeek,
  onNextWeek,
  onGoToday,
  dateTitle,
}: {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  cursor: Date;
  onSelectDay: (day: Date) => void;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onGoToday?: () => void;
  dateTitle: string;
}) {
  const weekDays = getWeekDays(cursor);
  const today = new Date();

  return (
    <View style={[styles.controlsWrap, shadowCard]}>
      <View style={styles.segmentWrap}>
        {CALENDAR_VIEWS.map((seg) => {
          const active = seg === view;
          return (
            <Pressable
              key={seg}
              onPress={() => onViewChange(seg)}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{seg}</Text>
            </Pressable>
          );
        })}
      </View>

      {view === 'Gün' ? (
        <View style={styles.dayNavRow}>
          <Pressable onPress={onPrevDay} hitSlop={8} style={styles.dayNavBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
          <Pressable onPress={onGoToday} style={styles.dayNavCenter}>
            <Text style={styles.dayNavToday}>Bugün</Text>
          </Pressable>
          <Pressable onPress={onNextDay} hitSlop={8} style={styles.dayNavBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>
      ) : view === 'Hafta' ? (
        <>
          <View style={styles.weekNavRow}>
            <Pressable onPress={onPrevWeek} hitSlop={8} style={styles.dayNavBtn}>
              <Ionicons name="chevron-back" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
            <Text style={styles.weekNavLabel}>{formatWeekRangeLabel(cursor)}</Text>
            <Pressable onPress={onNextWeek} hitSlop={8} style={styles.dayNavBtn}>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
          <View style={styles.weekStrip}>
            {weekDays.map((day, idx) => {
              const selected = sameDay(day, cursor);
              const isToday = sameDay(day, today);
              const weekend = idx >= 5;
              return (
                <Pressable
                  key={dateKey(day)}
                  onPress={() => onSelectDay(day)}
                  style={styles.weekDayCol}
                  accessibilityLabel={day.toLocaleDateString('tr-TR')}
                >
                  <Text
                    style={[
                      styles.weekDayLabel,
                      selected && styles.weekDayLabelActive,
                      weekend && styles.weekDayLabelWeekend,
                    ]}
                  >
                    {WEEKDAY_SHORT[idx]}
                  </Text>
                  <View
                    style={[
                      styles.weekDayBubble,
                      selected && styles.weekDayBubbleActive,
                      isToday && !selected && styles.weekDayBubbleToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.weekDayNum,
                        selected && styles.weekDayNumActive,
                        weekend && styles.weekDayNumWeekend,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={styles.dateTitle}>{dateTitle}</Text>
    </View>
  );
}

export function formatWeekRangeLabel(cursor: Date): string {
  const start = startOfWeek(cursor);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}`;
  }
  const left = start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const right = end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${left} – ${right}`;
}

function TimelineEventBlock({
  event,
  onPress,
  maxHeight,
}: {
  event: CalendarEventDTO;
  onPress?: () => void;
  maxHeight: number;
}) {
  const visual = eventVisual(event);
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt);
  const rawTop = eventTop(startsAt);
  const rawHeight = eventHeight(startsAt, endsAt);
  const { top, height } = clampEventLayout(rawTop, rawHeight, maxHeight);
  const subtitle =
    event.location?.trim() ||
    event.company?.shortName ||
    event.company?.legalTitle ||
    event.description?.trim() ||
    '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventBlock,
        {
          top,
          height,
          backgroundColor: visual.bg,
          borderLeftColor: visual.border,
        },
        visual.deadline && styles.eventDeadline,
        shadowElevated,
        pressFade(pressed),
      ]}
    >
      {visual.deadline ? (
        <View style={styles.eventDeadlineRow}>
          <Ionicons name="alert-circle" size={14} color={visual.title} />
          <Text style={[styles.eventTitle, { color: visual.title }]} numberOfLines={1}>
            {event.title}
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.eventTitle, { color: visual.title }]} numberOfLines={visual.compact ? 1 : 2}>
            {event.title}
          </Text>
          {subtitle ? (
            visual.compact ? (
              <Text style={[styles.eventSubtitle, { color: visual.subtitle, marginTop: 0 }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : (
              <View style={styles.eventMetaRow}>
                {visual.icon ? <Ionicons name={visual.icon} size={12} color={visual.subtitle} /> : null}
                <Text style={[styles.eventSubtitle, { color: visual.subtitle }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>
            )
          ) : null}
        </>
      )}
    </Pressable>
  );
}

function NowIndicator({ now, maxTop }: { now: Date; maxTop: number }) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = TIMELINE_START * 60;
  const endMinutes = (TIMELINE_END + 1) * 60;
  if (minutes < startMinutes || minutes > endMinutes) return null;

  const top = Math.min(((minutes - startMinutes) / 60) * HOUR_HEIGHT, maxTop);
  const timeLabel = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[styles.nowRow, { top }]} pointerEvents="none">
      <Text style={styles.nowTime}>{timeLabel}</Text>
      <View style={styles.nowDot} />
      <View style={styles.nowLine} />
    </View>
  );
}

export function CalendarTimeline({
  day,
  events,
  onEventPress,
  refreshControl,
}: {
  day: Date;
  events: CalendarEventDTO[];
  onEventPress?: (event: CalendarEventDTO) => void;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
}) {
  const hours = Array.from({ length: TIMELINE_END - TIMELINE_START + 1 }, (_, i) => TIMELINE_START + i);
  const dayEvents = eventsForDay(events, day);
  const gridHeight = hours.length * HOUR_HEIGHT;
  const totalHeight = gridHeight + spacing.md;
  const now = new Date();
  const showNow = sameDay(day, now);

  return (
    <ScrollView
      style={styles.timelineScroll}
      contentContainerStyle={[styles.timelineContent, { minHeight: totalHeight + 96 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      nestedScrollEnabled
    >
      <View style={[styles.timelineBody, { height: totalHeight }]}>
        {hours.map((hour) => (
          <View key={hour} style={styles.hourRow}>
            <View style={styles.hourLabelCol}>
              <Text style={styles.hourLabel}>
                {String(hour).padStart(2, '0')}:00
              </Text>
            </View>
            <View style={styles.hourLane} />
          </View>
        ))}
        <View style={[styles.eventsLayer, { height: gridHeight }]}>
          {dayEvents.map((event) => (
            <TimelineEventBlock
              key={event.id}
              event={event}
              maxHeight={gridHeight}
              onPress={() => onEventPress?.(event)}
            />
          ))}
          {showNow ? <NowIndicator now={now} maxTop={gridHeight} /> : null}
        </View>
      </View>
    </ScrollView>
  );
}

export function CalendarMonthGrid({
  cursor,
  events,
  onSelectDay,
}: {
  cursor: Date;
  events: CalendarEventDTO[];
  onSelectDay: (day: Date) => void;
}) {
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const byDay = new Map<string, CalendarEventDTO[]>();
  for (const event of events) {
    const key = dateKey(new Date(event.startsAt));
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }
  const today = new Date();

  return (
    <ScrollView style={styles.monthScroll} contentContainerStyle={styles.monthContent}>
      <View style={styles.monthWeekHeader}>
        {WEEKDAY_SHORT.map((label) => (
          <Text key={label} style={styles.monthWeekLabel}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.monthGrid}>
        {cells.map((day) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const selected = sameDay(day, cursor);
          const isToday = sameDay(day, today);
          const count = byDay.get(dateKey(day))?.length ?? 0;
          return (
            <Pressable
              key={dateKey(day)}
              onPress={() => onSelectDay(day)}
              style={[styles.monthCell, !inMonth && styles.monthCellOutside]}
            >
              <View
                style={[
                  styles.monthDayBubble,
                  selected && styles.monthDayBubbleActive,
                  isToday && !selected && styles.monthDayBubbleToday,
                ]}
              >
                <Text
                  style={[
                    styles.monthDayNum,
                    !inMonth && styles.monthDayNumOutside,
                    selected && styles.monthDayNumActive,
                  ]}
                >
                  {day.getDate()}
                </Text>
              </View>
              {count > 0 ? (
                <View style={styles.monthDots}>
                  {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                    <View key={i} style={styles.monthDot} />
                  ))}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

export function CalendarFab({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.fabHost} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.fab, shadowFab, pressFade(pressed)]}
        accessibilityRole="button"
        accessibilityLabel="Yeni etkinlik"
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

export { addDays, dateKey, sameDay, startOfWeek };

const cardBase: ViewStyle = {
  backgroundColor: colors.card,
};

const styles = StyleSheet.create({
  headerWrap: {
    ...cardBase,
    zIndex: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: layout.containerMargin,
  },
  headerIconBtn: {
    width: layout.touchMin,
    height: layout.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: fonts.bold,
    letterSpacing: -0.22,
    color: colors.stitchPrimary,
    flex: 1,
    textAlign: 'center',
  },
  controlsWrap: {
    ...cardBase,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    zIndex: 30,
  },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.xs,
    marginBottom: spacing.lg,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  segmentBtnActive: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  segmentText: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  segmentTextActive: {
    fontFamily: fonts.semibold,
    color: colors.onPrimaryContainer,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: 2,
  },
  weekNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  weekNavLabel: {
    ...typography.bodySm,
    fontFamily: fonts.semibold,
    color: colors.onSurfaceVariant,
    flex: 1,
    textAlign: 'center',
  },
  dayNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  dayNavBtn: {
    width: layout.touchMin,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNavCenter: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  dayNavToday: {
    ...typography.bodySm,
    fontFamily: fonts.semibold,
    color: colors.primary,
  },
  weekDayCol: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 48,
  },
  weekDayLabel: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  weekDayLabelActive: {
    color: colors.onPrimaryContainer,
    fontFamily: fonts.bold,
  },
  weekDayLabelWeekend: {
    opacity: 0.7,
  },
  weekDayBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayBubbleActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 6,
  },
  weekDayBubbleToday: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  weekDayNum: {
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  weekDayNumActive: {
    color: '#fff',
    fontFamily: fonts.bold,
  },
  weekDayNumWeekend: {
    opacity: 0.7,
  },
  dateTitle: {
    ...typography.headlineMd,
    color: colors.textPrimary,
  },
  timelineScroll: {
    flex: 1,
    backgroundColor: colors.card,
  },
  timelineContent: {
    paddingBottom: 96,
  },
  timelineBody: {
    position: 'relative',
    paddingTop: spacing.md,
    overflow: 'hidden',
  },
  hourRow: {
    height: HOUR_HEIGHT,
    flexDirection: 'row',
    width: '100%',
  },
  hourLabelCol: {
    width: TIME_COL_WIDTH,
    alignItems: 'flex-end',
    paddingRight: spacing.md,
  },
  hourLabel: {
    ...typography.label,
    color: colors.onSurfaceVariant,
    marginTop: -8,
  },
  hourLane: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    marginRight: layout.containerMargin,
  },
  eventsLayer: {
    position: 'absolute',
    left: TIME_COL_WIDTH,
    right: layout.containerMargin,
    top: spacing.md,
    overflow: 'hidden',
  },
  eventBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderLeftWidth: 4,
    borderTopRightRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  eventDeadline: {
    borderWidth: 1,
    borderColor: '#ffb4ab',
    borderLeftWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
  },
  eventDeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eventTitle: {
    ...typography.label,
    fontFamily: fonts.bold,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  eventSubtitle: {
    ...typography.caption,
    fontFamily: fonts.medium,
    flex: 1,
  },
  nowRow: {
    position: 'absolute',
    left: -TIME_COL_WIDTH,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  nowTime: {
    width: TIME_COL_WIDTH - 8,
    textAlign: 'right',
    ...typography.caption,
    color: colors.error,
    fontFamily: fonts.bold,
    paddingRight: spacing.sm,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
    marginLeft: spacing.xs,
    marginRight: spacing.xs,
    shadowColor: colors.error,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  nowLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.error,
  },
  monthScroll: {
    flex: 1,
    backgroundColor: colors.card,
  },
  monthContent: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
    paddingBottom: 96,
  },
  monthWeekHeader: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  monthWeekLabel: {
    flex: 1,
    textAlign: 'center',
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCell: {
    width: '14.2857%',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  monthCellOutside: {
    opacity: 0.45,
  },
  monthDayBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDayBubbleActive: {
    backgroundColor: colors.primary,
  },
  monthDayBubbleToday: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  monthDayNum: {
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  monthDayNumOutside: {
    color: colors.onSurfaceVariant,
  },
  monthDayNumActive: {
    color: '#fff',
    fontFamily: fonts.bold,
  },
  monthDots: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
  },
  monthDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  fabHost: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
  },
  fab: {
    position: 'absolute',
    right: layout.containerMargin,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
