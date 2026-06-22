import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

export type DeviceCalendar = { id: string; title: string; color?: string | null; writable: boolean };
export type DeviceCalendarEvent = {
  crmEventId?: string | null;
  externalCalendarId: string;
  externalEventId: string;
  occurrenceId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  recurrenceRule?: string | null;
  modifiedAt: string;
  deleted: boolean;
};

export type CalendarUpsertCommand = Omit<DeviceCalendarEvent, 'externalCalendarId' | 'externalEventId' | 'deleted'> & {
  crmEventId: string;
  externalCalendarId?: string | null;
  externalEventId?: string | null;
};
export type CalendarDeleteCommand = Pick<DeviceCalendarEvent, 'crmEventId' | 'externalCalendarId' | 'externalEventId' | 'occurrenceId'>;

type CalendarNativeModule = {
  requestAccess(): Promise<boolean>;
  getDeviceId(): Promise<string>;
  listCalendars(): Promise<DeviceCalendar[]>;
  readEvents(fromIso: string, toIso: string, calendarIds: string[]): Promise<DeviceCalendarEvent[]>;
  upsertEvents(commands: CalendarUpsertCommand[]): Promise<DeviceCalendarEvent[]>;
  deleteEvents(commands: CalendarDeleteCommand[]): Promise<void>;
  setBackgroundSyncEnabled(enabled: boolean): Promise<void>;
};

const moduleRef = NativeModules.HaksanCalendar as CalendarNativeModule | undefined;
const eventEmitter = moduleRef ? new NativeEventEmitter(NativeModules.HaksanCalendar) : null;

export const CalendarNative = {
  isAvailable: !!moduleRef && (Platform.OS === 'android' || Platform.OS === 'ios'),
  async requestAccess() {
    if (!moduleRef) return false;
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_CALENDAR,
        PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR,
      ]);
      if (Object.values(result).some((value) => value !== PermissionsAndroid.RESULTS.GRANTED)) return false;
    }
    return moduleRef.requestAccess();
  },
  getDeviceId: () => moduleRef?.getDeviceId() ?? Promise.resolve('unsupported-device'),
  listCalendars: () => moduleRef?.listCalendars() ?? Promise.resolve([]),
  readEvents: (fromIso: string, toIso: string, calendarIds: string[]) => moduleRef?.readEvents(fromIso, toIso, calendarIds) ?? Promise.resolve([]),
  upsertEvents: (commands: CalendarUpsertCommand[]) => moduleRef?.upsertEvents(commands) ?? Promise.resolve([]),
  deleteEvents: (commands: CalendarDeleteCommand[]) => moduleRef?.deleteEvents(commands) ?? Promise.resolve(),
  setBackgroundSyncEnabled: (enabled: boolean) => moduleRef?.setBackgroundSyncEnabled(enabled) ?? Promise.resolve(),
  onBackgroundSync: (listener: () => void) => eventEmitter?.addListener('calendarBackgroundSync', listener) ?? { remove() {} },
};
