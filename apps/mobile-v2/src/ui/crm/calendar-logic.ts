/** Web CalendarPage görünüm/aralık kuralları; saf mantık. */

export type CalendarView = 'month' | 'week' | 'day' | 'list';
export type CalendarEventType = 'customer_visit' | 'meeting' | 'call' | 'task' | 'other';

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = { month: 'Ay', week: 'Hafta', day: 'Gün', list: 'Liste' };

export const CALENDAR_TYPE_LABELS: Record<CalendarEventType, string> = {
  customer_visit: 'Müşteri ziyareti',
  meeting: 'Toplantı',
  call: 'Arama',
  task: 'Görev',
  other: 'Diğer',
};

export const CALENDAR_EVENT_TYPES = Object.keys(CALENDAR_TYPE_LABELS) as CalendarEventType[];

export const CALENDAR_IMPORT_TYPE_LABELS = { other: 'Diğer', meeting: 'Toplantı', call: 'Arama', task: 'Görev' } as const;

export function calendarTypeLabel(type: string): string {
  return (CALENDAR_TYPE_LABELS as Record<string, string>)[type] ?? 'Diğer';
}

/** Kaynak etiketi: web "Telefon" / "İçe aktarıldı"; elle girilen için etiket yok. */
export function calendarSourceLabel(source: string | null | undefined): string | null {
  if (source === 'device') return 'Telefon';
  if (source === 'import') return 'İçe aktarıldı';
  return null;
}

export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Görünüme göre sunucudan istenen aralık (web ile aynı; liste ±6 ay). */
export function calendarRange(view: CalendarView, cursor: Date): { from: Date; to: Date } {
  if (view === 'day') return { from: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()), to: endOfDay(cursor) };
  if (view === 'week') {
    const from = startOfWeek(cursor);
    return { from, to: endOfDay(addDays(from, 6)) };
  }
  if (view === 'list') {
    return {
      from: new Date(cursor.getFullYear(), cursor.getMonth() - 6, cursor.getDate()),
      to: endOfDay(new Date(cursor.getFullYear(), cursor.getMonth() + 6, cursor.getDate())),
    };
  }
  const from = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  return { from, to: endOfDay(addDays(from, 41)) };
}

export function moveCursor(view: CalendarView, cursor: Date, direction: -1 | 1): Date {
  if (view === 'month') return addMonths(cursor, direction);
  if (view === 'week') return addDays(cursor, direction * 7);
  if (view === 'day') return addDays(cursor, direction);
  return addMonths(cursor, direction * 6);
}

/** Aralıktaki günler (hafta: 7, gün: 1). */
export function daysInRange(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let day = new Date(from); day.getTime() <= to.getTime(); day = addDays(day, 1)) {
    days.push(new Date(day.getFullYear(), day.getMonth(), day.getDate()));
    if (days.length > 400) break;
  }
  return days;
}

export function groupByDay<T extends { startsAt: string }>(events: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const event of events) {
    const key = dateKey(new Date(event.startsAt));
    const list = map.get(key);
    if (list) list.push(event);
    else map.set(key, [event]);
  }
  return map;
}

/** Liste görünümü: yalnız etkinliği olan günler, kronolojik. */
export function listSections<T extends { startsAt: string }>(events: T[]): { key: string; date: Date; events: T[] }[] {
  const sorted = [...events].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return [...groupByDay(sorted).entries()].map(([key, rows]) => ({ key, date: new Date(rows[0]!.startsAt), events: rows }));
}

/** Web: kendi kaydın veya senin atadığın kayıt düzenlenebilir. */
export function canEditCalendarEvent(
  event: { ownerUserId?: string | null; owner?: { id: string } | null; createdBy?: string | null },
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  const ownerId = event.ownerUserId ?? event.owner?.id ?? null;
  return ownerId === userId || event.createdBy === userId;
}

export type EventDraftValidation = { companyId?: string; endsAt?: string; title?: string };

export function validateEventDraft(draft: {
  eventType: string;
  title: string;
  companyId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
}): EventDraftValidation {
  const errors: EventDraftValidation = {};
  if (!draft.title.trim()) errors.title = 'Başlık zorunlu.';
  if (draft.eventType === 'customer_visit' && !draft.companyId) errors.companyId = 'Müşteri ziyareti için firma seçin';
  if (!draft.startsAt || !draft.endsAt) errors.endsAt = 'Başlangıç ve bitiş seçin.';
  else if (draft.endsAt.getTime() < draft.startsAt.getTime()) errors.endsAt = 'Bitiş başlangıçtan önce olamaz';
  return errors;
}

/** Varsayılan taslak: en yakın yarım saat, 1 saat süre (web emptyDraft). */
export function defaultEventWindow(base: Date = new Date()): { startsAt: Date; endsAt: Date } {
  const start = new Date(base);
  start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
  return { startsAt: start, endsAt: new Date(start.getTime() + 60 * 60 * 1000) };
}

export const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const TR_MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const TR_WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** Web periodLabel ile aynı metinler (tr-TR biçimi elle; Hermes Intl'e güvenilmez). */
export function periodLabel(view: CalendarView, cursor: Date): string {
  if (view === 'list') return 'Geçmiş 6 ay · Gelecek 6 ay';
  if (view === 'day') {
    return `${cursor.getDate()} ${TR_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()} ${TR_WEEKDAYS[cursor.getDay()]}`;
  }
  if (view === 'week') {
    const { from, to } = calendarRange('week', cursor);
    return `${from.getDate()} ${TR_MONTHS_SHORT[from.getMonth()]} — ${to.getDate()} ${TR_MONTHS_SHORT[to.getMonth()]} ${to.getFullYear()}`;
  }
  return `${TR_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
}

/**
 * Sunucu yalnız 5 türü kabul eder. Eski mobil kodlar (`visit`, `service`) ve
 * bilinmeyen değerler güvenli karşılığına çevrilir.
 */
export function normalizeEventType(type: string | null | undefined): CalendarEventType {
  if (type && (CALENDAR_EVENT_TYPES as string[]).includes(type)) return type as CalendarEventType;
  if (type === 'visit') return 'customer_visit';
  return 'other';
}

type AgendaEvent = { startsAt: string; endsAt: string; deletedAt?: string | null };

/** Web "Yaklaşanlar": arşivde olmayan, bitmemiş ilk 8 etkinlik. */
export function upcomingEvents<T extends AgendaEvent>(events: T[], now: Date = new Date(), limit = 8): T[] {
  return events
    .filter((event) => !event.deletedAt && new Date(event.endsAt).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, limit);
}

export function todayEventCount<T extends AgendaEvent>(events: T[], now: Date = new Date()): number {
  const key = dateKey(now);
  return events.filter((event) => !event.deletedAt && dateKey(new Date(event.startsAt)) === key).length;
}

/** .ics içe aktarma: web input kabulüyle aynı uzantılar. */
export function isCalendarFileName(name: string): boolean {
  return /\.(ics|ical)$/i.test(name.trim());
}

export const CALENDAR_IMPORT_MAX_BYTES = 10 * 1024 * 1024;

export function validateCalendarFile(file: { name: string; size: number | null }): string | null {
  if (!isCalendarFileName(file.name)) return 'Yalnız .ics veya .ical dosyası seçin.';
  if (file.size !== null && file.size > CALENDAR_IMPORT_MAX_BYTES) return 'Dosya 10 MB sınırını aşıyor.';
  return null;
}

/** Web importSelection: "Yalnızca son/önümüzdeki 6 ay" açıksa pencere dışı kayıtlar düşer. */
export function calendarImportSelection<T extends { inWindow: boolean }>(events: T[], onlyWindow: boolean): T[] {
  return onlyWindow ? events.filter((event) => event.inWindow) : events;
}
