/**
 * Cihaz takvimi ↔ CRM senkronunun saf mantığı (POST /mobile/calendar/sync).
 * Sunucu sözleşmesi: packages/shared calendarDeviceEventSchema + calendar.service.sync.
 * node:test doğrudan import ettiği için alias/React/expo kullanılmaz.
 *
 * Önemli sunucu davranışı: bağlı bir cihaz etkinliği pencere içinde gövdede yoksa
 * CRM'de silinir. Bu dosyadaki korumaların çoğu bu yüzden var.
 *
 * Android'de etkinlik değişiklik zamanı yok; `modifiedAt` her iki platformda da
 * içerik özetinden türetilir: içerik değişmediyse son bilinen zaman korunur.
 *
 * ponytail: tekrarlayan etkinlikler senkrona alınmaz (örnek anahtarı kararsız,
 * Android örnek güncellemesi seriyi bozar). Gerekirse iOS originalStartDate ile eklenir.
 */

export type DeviceEventLike = {
  id: string;
  calendarId: string;
  title?: string | null;
  notes?: string | null;
  location?: string | null;
  startDate: string | Date;
  endDate: string | Date;
  allDay?: boolean;
  timeZone?: string | null;
  recurrenceRule?: unknown;
};

/** Sunucunun cihaza yazılmasını istediği etkinlik (calendar.service.toDeviceCommand). */
export type DeviceUpsertCommand = {
  crmEventId: string;
  externalCalendarId: string | null;
  externalEventId: string | null;
  occurrenceId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  recurrenceRule?: string | null;
  modifiedAt: string;
};

/** GET /calendar/events satırının eşleştirme için gereken kısmı. */
export type CrmEventLike = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  recurrenceRule?: string | null;
};

export type StateEntry = { hash: string; modifiedAt: string; crmEventId?: string };
export type SyncState = Record<string, StateEntry>;

export const MAX_SYNC_EVENTS = 2000; // calendarSyncSchema.events.max
/** Cihazdan pencerenin iki yanında bu kadar fazla okunur; sunucu penceresiyle kayma sınırda silme yaratmasın. */
export const DEVICE_MARGIN_DAYS = 35;
/** Bir takvimde en az bu kadar kayıt varken yarıdan fazlası kaybolursa tur durur. */
const DROP_MIN_PREVIOUS = 5;

const DAY_MS = 86_400_000;
const iso = (value: string | Date) => new Date(value).toISOString();
const clean = (value: string | null | undefined, max: number) => (value ?? '').trim().slice(0, max);

export const isRecurring = (event: { recurrenceRule?: unknown }) => Boolean(event.recurrenceRule);

export function eventKey(calendarId: string, eventId: string, occurrenceId = ''): string {
  return `${calendarId}\u0000${eventId}\u0000${occurrenceId}`;
}
const calendarOfKey = (key: string) => key.split('\u0000')[0]!;

/**
 * Tüm gün etkinliğinin günü. Android sağlayıcısı tüm günü UTC gece yarısında,
 * CRM ve iOS yerel gece yarısında tutar; tam UTC gece yarısı ise UTC tarihi alınır.
 */
export function allDayKey(value: string | Date): string {
  const date = new Date(value);
  const utcMidnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
  const [y, m, d] = utcMidnight
    ? [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()]
    : [date.getFullYear(), date.getMonth(), date.getDate()];
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

type Content = { title: string; notes: string; location: string; start: string | Date; end: string | Date; allDay: boolean };

function contentHash(c: Content): string {
  // ponytail: tüm gün etkinliğinde yalnız başlangıç günü karşılaştırılır; çok günlük süre değişikliği yakalanmaz.
  const when = c.allDay ? [allDayKey(c.start)] : [new Date(c.start).getTime(), new Date(c.end).getTime()];
  return JSON.stringify([c.title, c.notes, c.location, c.allDay, ...when]);
}

export function deviceHash(event: DeviceEventLike): string {
  return contentHash({
    title: clean(event.title, 255) || 'Başlıksız',
    notes: clean(event.notes, 4000),
    location: clean(event.location, 512),
    start: event.startDate,
    end: event.endDate,
    allDay: Boolean(event.allDay),
  });
}

export function crmHash(event: { title: string; description?: string | null; location?: string | null; startsAt: string; endsAt: string; allDay: boolean }): string {
  return contentHash({
    title: clean(event.title, 255),
    notes: clean(event.description, 4000),
    location: clean(event.location, 512),
    start: event.startsAt,
    end: event.endsAt,
    allDay: event.allDay,
  });
}
export const commandHash = (command: DeviceUpsertCommand) => crmHash(command);

/** Cihaz etkinliklerini sunucu gövdesine çevirir ve yeni durum tablosunu döner. */
export function buildDeviceEvents(events: DeviceEventLike[], state: SyncState, observedAt: Date) {
  const nextState: SyncState = {};
  const payload = events.map((event) => {
    const key = eventKey(event.calendarId, event.id);
    const hash = deviceHash(event);
    const previous = state[key];
    const modifiedAt = previous?.hash === hash ? previous.modifiedAt : observedAt.toISOString();
    nextState[key] = { hash, modifiedAt, ...(previous?.crmEventId ? { crmEventId: previous.crmEventId } : {}) };
    return {
      crmEventId: previous?.crmEventId ?? null,
      externalCalendarId: event.calendarId,
      externalEventId: event.id,
      occurrenceId: '',
      title: clean(event.title, 255) || 'Başlıksız',
      description: clean(event.notes, 4000) || null,
      location: clean(event.location, 512) || null,
      startsAt: iso(event.startDate),
      endsAt: iso(event.endDate),
      allDay: Boolean(event.allDay),
      timezone: clean(event.timeZone, 64) || 'Europe/Istanbul',
      recurrenceRule: null,
      modifiedAt,
      deleted: false,
    };
  });
  return { payload, nextState };
}

/**
 * Bu telefonda ilk tur (durum boş): CRM'de aynı içerikli etkinlik varsa onunla
 * eşleştir. Yoksa ana cihaz değişiminde/yeniden kurulumda her şey iki kez açılır.
 */
export function prelinkByContent(events: DeviceEventLike[], crmEvents: CrmEventLike[], state: SyncState): SyncState {
  const byHash = new Map<string, string[]>();
  for (const event of crmEvents) {
    if (isRecurring(event)) continue;
    const hash = crmHash(event);
    byHash.set(hash, [...(byHash.get(hash) ?? []), event.id]);
  }
  const next: SyncState = { ...state };
  for (const event of events) {
    const ids = byHash.get(deviceHash(event));
    const id = ids?.shift();
    if (!id) continue;
    const key = eventKey(event.calendarId, event.id);
    // Eski CRM zamanı: içerik aynı olduğundan sunucu kaydı değiştirmez, yalnız bağlar.
    next[key] = { hash: deviceHash(event), modifiedAt: new Date(0).toISOString(), crmEventId: id };
  }
  return next;
}

/** Önceki turda kaydı olan takvimlerden yarıdan fazlası kaybolanlar (gizlenmiş/boşalmış takvim). */
export function droppedCalendars(previous: SyncState, events: DeviceEventLike[], calendarIds: string[]): string[] {
  return calendarIds.filter((id) => {
    const before = Object.keys(previous).filter((key) => calendarOfKey(key) === id).length;
    if (before < DROP_MIN_PREVIOUS) return false;
    const now = events.filter((event) => event.calendarId === id).length;
    return now * 2 < before;
  });
}

export type UpsertPlan =
  | { kind: 'skip' }
  | { kind: 'link'; key: string }
  | { kind: 'update'; key: string }
  | { kind: 'create'; calendarId: string };

/**
 * Sunucu komutunun cihazda ne gerektirdiğine karar verir. Aynı içerik yeniden
 * yazılmaz (yazmak değişiklik gibi görünür ve her turda geri döner).
 */
export function planUpsert(
  command: DeviceUpsertCommand,
  present: Map<string, DeviceEventLike>,
  state: SyncState,
  writable: (calendarId: string) => boolean
): UpsertPlan {
  if (command.occurrenceId || isRecurring(command)) return { kind: 'skip' };
  if (command.externalEventId && command.externalCalendarId) {
    const key = eventKey(command.externalCalendarId, command.externalEventId);
    const device = present.get(key);
    if (!device) return { kind: 'skip' };
    if (deviceHash(device) === commandHash(command)) return { kind: 'link', key };
    return writable(command.externalCalendarId) ? { kind: 'update', key } : { kind: 'skip' };
  }
  if (!command.externalCalendarId || !writable(command.externalCalendarId)) return { kind: 'skip' };
  // Önceki turda oluşturuldu ama sunucu henüz bağlamadıysa ikinci kopya açma.
  const pending = Object.entries(state).some(([key, entry]) => entry.crmEventId === command.crmEventId && present.has(key));
  return pending ? { kind: 'skip' } : { kind: 'create', calendarId: command.externalCalendarId };
}

/** Sunucu penceresi (UTC ay aritmetiği) ve cihazdan okunacak geniş aralık. */
export function syncWindow(observedAt: Date, pastMonths: number, futureMonths: number) {
  const from = new Date(observedAt);
  from.setUTCMonth(from.getUTCMonth() - pastMonths);
  const to = new Date(observedAt);
  to.setUTCMonth(to.getUTCMonth() + futureMonths);
  return {
    from,
    to,
    readFrom: new Date(from.getTime() - DEVICE_MARGIN_DAYS * DAY_MS),
    readTo: new Date(to.getTime() + DEVICE_MARGIN_DAYS * DAY_MS),
  };
}

/**
 * Android sağlayıcısı tüm gün etkinliğini UTC gece yarısı ve ertesi gün (hariç) bitiş ister;
 * CRM'in yerel gece yarısını olduğu gibi yazmak bir gün geri kaydırır.
 */
export function androidAllDayRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) + DAY_MS;
  return { startDate: new Date(startUtc), endDate: new Date(Math.max(endUtc, startUtc + DAY_MS)) };
}
