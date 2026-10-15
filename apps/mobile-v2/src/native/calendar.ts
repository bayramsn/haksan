import * as Calendar from 'expo-calendar';
import type { CalendarEvent } from '@/src/api/endpoints';

export function calendarEventPayload(event: CalendarEvent): Omit<Partial<Calendar.Event>, 'id'> {
  const companyName = event.company?.shortName ?? event.company?.legalTitle;
  return {
    title: event.title,
    startDate: new Date(event.startsAt),
    endDate: new Date(event.endsAt),
    allDay: event.allDay,
    location: event.location ?? undefined,
    notes: [event.description, companyName ? `Firma: ${companyName}` : null, 'Haksan mobil uygulamasından eklendi.']
      .filter(Boolean)
      .join('\n'),
    alarms: event.allDay ? [] : [{ relativeOffset: -15 }],
  };
}

/** Kullanıcıya OS takvim editörünü gösterir; otomatik/sessiz takvim yazımı yapmaz. */
export async function presentCalendarEditor(event: CalendarEvent): Promise<void> {
  if (!(await Calendar.isAvailableAsync())) throw new Error('Bu cihazda takvim kullanılamıyor.');
  await Calendar.createEventInCalendarAsync(calendarEventPayload(event));
}
