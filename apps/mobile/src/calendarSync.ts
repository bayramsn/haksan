import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { HaksanApi } from './api/client';
import { CalendarNative, type CalendarDeleteCommand, type CalendarUpsertCommand } from './native/CalendarNative';

export const CALENDAR_SYNC_STORAGE_KEYS = {
  lastSyncAt: 'haksan.mobile.calendarLastSyncAt',
  lastSyncError: 'haksan.mobile.calendarLastSyncError',
} as const;

export async function runCalendarSync(api: HaksanApi, force = false) {
  try {
    const settings = await api.calendarSettings();
    if (!settings || (!settings.autoSync && !force)) return null;
    if (!(await CalendarNative.requestAccess())) throw new Error('Takvim okuma ve yazma izni gerekli.');
    const deviceId = await CalendarNative.getDeviceId();
    if (deviceId !== settings.primaryDeviceId) throw new Error('Bu telefon ana senkron cihazı değil.');
    const observedAt = new Date();
    const from = new Date(observedAt); from.setMonth(from.getMonth() - 6);
    const to = new Date(observedAt); to.setMonth(to.getMonth() + 6);
    const deviceEvents = await CalendarNative.readEvents(from.toISOString(), to.toISOString(), settings.selectedCalendars.map((calendar) => calendar.id));
    const platform = Platform.OS as 'android' | 'ios';
    const result = await api.syncCalendar({ deviceId, platform, observedAt: observedAt.toISOString(), events: deviceEvents });
    await CalendarNative.deleteEvents(result.deletions as CalendarDeleteCommand[]);
    const commands = (result.upserts as CalendarUpsertCommand[])
      .map((command) => ({ ...command, externalCalendarId: command.externalCalendarId || settings.destinationCalendarId }))
      .filter((command) => !!command.externalCalendarId);
    const written = await CalendarNative.upsertEvents(commands);
    if (written.length) await api.syncCalendar({ deviceId, platform, observedAt: new Date().toISOString(), events: written });
    await AsyncStorage.multiSet([
      [CALENDAR_SYNC_STORAGE_KEYS.lastSyncAt, result.syncedAt],
      [CALENDAR_SYNC_STORAGE_KEYS.lastSyncError, ''],
    ]);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Beklenmeyen takvim senkron hatası';
    await AsyncStorage.setItem(CALENDAR_SYNC_STORAGE_KEYS.lastSyncError, message);
    throw error;
  }
}

export async function runBackgroundCalendarSync() {
  const [[, apiBaseUrl], [, token]] = await AsyncStorage.multiGet(['haksan.mobile.apiBaseUrl', 'haksan.mobile.accessToken']);
  if (apiBaseUrl && token) await runCalendarSync(new HaksanApi(apiBaseUrl, token));
}

CalendarNative.onBackgroundSync(() => { void runBackgroundCalendarSync().catch(() => {}); });
