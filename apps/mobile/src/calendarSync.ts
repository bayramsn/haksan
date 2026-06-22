import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { calendarService } from './api/services';
import { bootstrapApiClient, getAccessToken } from './lib/apiClient';
import { CalendarNative, type CalendarDeleteCommand, type CalendarUpsertCommand } from './native/CalendarNative';

export const CALENDAR_SYNC_STORAGE_KEYS = {
  lastSyncAt: 'haksan.mobile.calendarLastSyncAt',
  lastSyncError: 'haksan.mobile.calendarLastSyncError',
} as const;

export async function runCalendarSync(force = false) {
  try {
    const settings = await calendarService.syncSettings();
    if (!settings || (!settings.autoSync && !force)) return null;
    if (!(await CalendarNative.requestAccess())) throw new Error('Takvim okuma ve yazma izni gerekli.');
    const deviceId = await CalendarNative.getDeviceId();
    if (deviceId !== settings.primaryDeviceId) throw new Error('Bu telefon ana senkron cihazı değil.');
    const observedAt = new Date();
    const from = new Date(observedAt);
    from.setMonth(from.getMonth() - 6);
    const to = new Date(observedAt);
    to.setMonth(to.getMonth() + 6);
    const platform = Platform.OS as 'android' | 'ios';
    const deviceEvents = await CalendarNative.readEvents(
      from.toISOString(),
      to.toISOString(),
      settings.selectedCalendars.map((calendar) => calendar.id)
    );
    const result = await calendarService.sync({ deviceId, platform, observedAt: observedAt.toISOString(), events: deviceEvents });
    await CalendarNative.deleteEvents(result.deletions as CalendarDeleteCommand[]);
    const commands = (result.upserts as CalendarUpsertCommand[])
      .map((command) => ({ ...command, externalCalendarId: command.externalCalendarId || settings.destinationCalendarId }))
      .filter((command) => !!command.externalCalendarId);
    const written = await CalendarNative.upsertEvents(commands);
    if (written.length) await calendarService.sync({ deviceId, platform, observedAt: new Date().toISOString(), events: written });
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

/** Headless arka plan görevi — App mount olmadığı için önce apiClient state'i yüklenir. */
export async function runBackgroundCalendarSync() {
  await bootstrapApiClient();
  if (getAccessToken()) await runCalendarSync();
}

CalendarNative.onBackgroundSync(() => {
  void runBackgroundCalendarSync().catch(() => {});
});
