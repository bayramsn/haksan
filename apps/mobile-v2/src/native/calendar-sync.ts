import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as Crypto from 'expo-crypto';
import type { CalendarSyncSettingsInput } from '@haksan/shared';
import { request } from '@/src/api/client';
import { kv } from '@/src/offline/storage';
import {
  MAX_SYNC_EVENTS,
  androidAllDayRange,
  buildDeviceEvents,
  commandHash,
  droppedCalendars,
  eventKey,
  isRecurring,
  planUpsert,
  prelinkByContent,
  syncWindow,
  type CrmEventLike,
  type DeviceEventLike,
  type DeviceUpsertCommand,
  type SyncState,
} from './calendar-sync-logic';

/** GET /calendar/sync-settings (calendar_sync_settings satırı; hiç kaydedilmediyse null). */
export type CalendarSyncSettings = {
  primaryDeviceId: string;
  platform: 'android' | 'ios';
  autoSync: boolean;
  selectedCalendars: CalendarSyncSettingsInput['selectedCalendars'];
  destinationCalendarId: string | null;
  windowPastMonths: number;
  windowFutureMonths: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

type SyncResponse = {
  upserts: DeviceUpsertCommand[];
  deletions: { crmEventId: string; externalCalendarId: string; externalEventId: string; occurrenceId: string }[];
  syncedAt: string;
};

export type SyncResult = { sent: number; written: number; deleted: number; failed: number };

/** Bir takvimdeki etkinliklerin çoğu kaybolduğunda tur durur; kullanıcı onaylarsa `force` ile geçilir. */
export class CalendarDropError extends Error {
  constructor(readonly calendars: string[]) {
    super(`${calendars.join(', ')} takviminde etkinliklerin çoğu görünmüyor. Takvim gizlenmiş ya da hesap senkronu durmuş olabilir; devam edilirse bu etkinlikler CRM'den de silinir.`);
  }
}

export const calendarSyncApi = {
  // Ayar hiç kaydedilmediyse sunucu boş gövde döner; React Query `undefined` kabul etmez.
  settings: async () => (await request<CalendarSyncSettings | null | undefined>('/calendar/sync-settings')) ?? null,
  save: (body: CalendarSyncSettingsInput) =>
    request<CalendarSyncSettings>('/calendar/sync-settings', { method: 'PUT', body }),
};

export const syncPlatform = (): 'android' | 'ios' => (Platform.OS === 'ios' ? 'ios' : 'android');

const DEVICE_KEY = 'calendar-sync:device-id';

/** Bu kurulumun kalıcı kimliği; sunucu yalnız "ana cihaz"dan gelen senkronu kabul eder. */
export function calendarDeviceId(): string {
  let id = kv.getString(DEVICE_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    kv.set(DEVICE_KEY, id);
  }
  return id;
}

// Eşleme tablosu kullanıcıya özel: aynı telefonda başka hesap açılırsa karışmasın.
const stateKey = (scope: string) => `calendar-sync:state:${scope}`;

function loadState(scope: string): SyncState | null {
  const raw = kv.getString(stateKey(scope));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncState;
  } catch {
    return null;
  }
}

/** Oturumdaki hesap; tur ortasında hesap değişirse başka kullanıcının verisi gönderilmez. */
let activeScope: string | null = null;
export function setCalendarSyncScope(scope: string | null) {
  activeScope = scope;
}
function assertScope(scope: string) {
  if (activeScope !== scope) throw new Error('Oturum değişti; senkron durduruldu.');
}

export async function ensureCalendarPermission(ask: boolean): Promise<boolean> {
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.granted || !ask) return current.granted;
  return (await Calendar.requestCalendarPermissionsAsync()).granted;
}

export async function deviceCalendars() {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars.map((calendar) => ({
    id: calendar.id,
    title: calendar.title || calendar.source?.name || 'Takvim',
    color: calendar.color ?? null,
    writable: calendar.allowsModifications,
  }));
}

function devicePayload(command: DeviceUpsertCommand): Omit<Partial<Calendar.Event>, 'id' | 'organizer'> {
  const range =
    command.allDay && Platform.OS === 'android'
      ? androidAllDayRange(command.startsAt, command.endsAt)
      : { startDate: new Date(command.startsAt), endDate: new Date(command.endsAt) };
  return {
    title: command.title,
    notes: command.description ?? '',
    location: command.location ?? '',
    ...range,
    allDay: command.allDay,
    // Android tüm gün etkinliğini UTC ister.
    timeZone: command.allDay && Platform.OS === 'android' ? 'UTC' : command.timezone,
  };
}

let running: { scope: string; promise: Promise<SyncResult> } | null = null;

/**
 * Tek tur: seçili takvimlerin pencere içindeki etkinliklerini gönderir, sunucunun
 * döndürdüğü CRM etkinliklerini hedef takvime yazar/siler. Aynı hesabın eş
 * zamanlı çağrıları aynı turu paylaşır.
 */
export function runCalendarSync(scope: string, options: { force?: boolean } = {}): Promise<SyncResult> {
  if (running) {
    if (running.scope === scope) return running.promise;
    return Promise.reject(new Error('Önceki senkron sürüyor; biraz sonra tekrar deneyin.'));
  }
  const promise = syncOnce(scope, options.force ?? false).finally(() => {
    running = null;
  });
  running = { scope, promise };
  return promise;
}

async function syncOnce(scope: string, force: boolean): Promise<SyncResult> {
  assertScope(scope);
  const settings = await calendarSyncApi.settings();
  const deviceId = calendarDeviceId();
  if (!settings || settings.primaryDeviceId !== deviceId) throw new Error('Bu telefon ana senkron cihazı değil; önce ayarları bu telefondan kaydedin.');
  if (!settings.selectedCalendars.length) throw new Error('Senkronlanacak takvim seçilmemiş.');
  if (!(await ensureCalendarPermission(false))) throw new Error('Takvim izni yok.');

  const observedAt = new Date();
  const { readFrom, readTo } = syncWindow(observedAt, settings.windowPastMonths, settings.windowFutureMonths);
  const deviceList = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const byId = new Map(deviceList.map((calendar) => [calendar.id, calendar]));
  // Seçili takvim telefondan kalktıysa ya da gizlendiyse (Android gizli takvimin
  // etkinliklerini döndürmez) boş gövde sunucuda o takvimin her şeyini sildirir.
  const missing = settings.selectedCalendars.filter((calendar) => !byId.has(calendar.id) || byId.get(calendar.id)?.isVisible === false);
  if (missing.length) {
    throw new Error(`${missing.map((calendar) => calendar.title).join(', ')} takvimi bu telefonda bulunamadı ya da gizli; takvim seçimini güncelleyin.`);
  }
  const calendarIds = settings.selectedCalendars.map((calendar) => calendar.id);
  const writable = (id: string) => byId.get(id)?.allowsModifications === true;

  const events = ((await Calendar.getEventsAsync(calendarIds, readFrom, readTo)) as DeviceEventLike[]).filter((event) => !isRecurring(event));
  if (events.length > MAX_SYNC_EVENTS) {
    throw new Error(`Seçili takvimlerde ${MAX_SYNC_EVENTS}'den fazla etkinlik var; daha az takvim seçin.`);
  }

  const stored = loadState(scope);
  if (stored && !force) {
    const dropped = droppedCalendars(stored, events, calendarIds);
    if (dropped.length) {
      throw new CalendarDropError(dropped.map((id) => settings.selectedCalendars.find((calendar) => calendar.id === id)?.title ?? id));
    }
  }
  let state = stored ?? {};
  const firstRun = !stored;
  if (firstRun) {
    const userId = scope.split(':')[1];
    const crmEvents = await request<CrmEventLike[]>('/calendar/events', {
      query: { from: readFrom.toISOString(), to: readTo.toISOString(), ...(userId ? { ownerUserId: userId } : {}) },
    });
    state = prelinkByContent(events, crmEvents, state);
  }

  const { payload, nextState } = buildDeviceEvents(events, state, observedAt);
  assertScope(scope);
  const response = await request<SyncResponse>('/mobile/calendar/sync', {
    method: 'POST',
    body: { deviceId, platform: syncPlatform(), observedAt: observedAt.toISOString(), events: payload },
  });

  const present = new Map(events.map((event) => [eventKey(event.calendarId, event.id), event]));
  const result: SyncResult = { sent: payload.length, written: 0, deleted: 0, failed: 0 };
  // Yarıda hata olsa bile oluşturulan etkinliklerin eşlemesi saklanmalı; yoksa sonraki tur kopya açar.
  try {
    for (const command of response.upserts) {
      const plan = planUpsert(command, present, nextState, writable);
      if (plan.kind === 'skip') continue;
      // İlk turda cihaza yazılmaz: önce mevcut eşleşmeler sunucuda bağlansın, kopya açılmasın.
      if (firstRun && plan.kind !== 'link') continue;
      // Yazdığımız içerik, bir sonraki turda cihaz değişikliği sayılmasın diye sunucu zamanıyla kaydedilir.
      const entry = { hash: commandHash(command), modifiedAt: command.modifiedAt, crmEventId: command.crmEventId };
      try {
        if (plan.kind === 'link') {
          // 'link' yalnız cihazda bulunan (dolayısıyla gövdeye giren) etkinlik için döner.
          nextState[plan.key] = { ...nextState[plan.key]!, crmEventId: command.crmEventId };
          continue;
        }
        assertScope(scope);
        if (plan.kind === 'update') {
          await Calendar.updateEventAsync(command.externalEventId!, devicePayload(command));
          nextState[plan.key] = entry;
        } else {
          const id = await Calendar.createEventAsync(plan.calendarId, devicePayload(command));
          nextState[eventKey(plan.calendarId, id)] = entry;
        }
        result.written += 1;
      } catch (error) {
        if (activeScope !== scope) throw error;
        result.failed += 1; // tek bozuk komut sonraki işlemleri kilitlemesin
      }
    }
    for (const target of response.deletions) {
      const key = eventKey(target.externalCalendarId, target.externalEventId);
      if (target.occurrenceId || !present.has(key) || !writable(target.externalCalendarId)) continue;
      try {
        assertScope(scope);
        await Calendar.deleteEventAsync(target.externalEventId);
        delete nextState[key];
        result.deleted += 1;
      } catch (error) {
        if (activeScope !== scope) throw error;
        result.failed += 1;
      }
    }
  } finally {
    kv.set(stateKey(scope), JSON.stringify(nextState));
  }
  return result;
}
