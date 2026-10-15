import type { Ionicons } from '@expo/vector-icons';
import type { Tone } from '@/src/theme/theme';
import type { CalendarEventType } from './calendar-logic';

/** Web TYPE_STYLES renk eşlemesi: ziyaret yeşil, toplantı mavi, arama sarı, görev kırmızımsı, diğer nötr. */
export const CALENDAR_TYPE_STYLE: Record<CalendarEventType, { icon: keyof typeof Ionicons.glyphMap; tone: Tone }> = {
  customer_visit: { icon: 'navigate-outline', tone: 'success' },
  meeting: { icon: 'people-outline', tone: 'info' },
  call: { icon: 'call-outline', tone: 'warning' },
  task: { icon: 'checkbox-outline', tone: 'stage' },
  other: { icon: 'calendar-outline', tone: 'neutral' },
};
