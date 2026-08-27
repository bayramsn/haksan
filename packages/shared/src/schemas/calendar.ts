import { z } from 'zod';

export const CALENDAR_EVENT_TYPES = ['customer_visit', 'meeting', 'call', 'task', 'other'] as const;
export const CALENDAR_EVENT_SOURCES = ['manual', 'device', 'import'] as const;
export const CALENDAR_PLATFORMS = ['android', 'ios'] as const;
// Event types selectable as a default when importing an .ics file (customer_visit excluded: it requires a company).
export const CALENDAR_IMPORT_EVENT_TYPES = ['other', 'meeting', 'call', 'task'] as const;

export const calendarEventTypeSchema = z.enum(CALENDAR_EVENT_TYPES);
export const calendarEventSourceSchema = z.enum(CALENDAR_EVENT_SOURCES);

const optionalId = z.string().uuid().nullable().optional();

const calendarEventFields = z.object({
    eventType: calendarEventTypeSchema.default('other'),
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4000).nullable().optional(),
    location: z.string().trim().max(512).nullable().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    allDay: z.boolean().default(false),
    timezone: z.string().trim().min(1).max(64).default('Europe/Istanbul'),
    recurrenceRule: z.string().trim().max(2000).nullable().optional(),
    companyId: optionalId,
    contactId: optionalId,
    opportunityId: optionalId,
  });

export const calendarEventCreateSchema = calendarEventFields
  // Süper yönetici etkinliği başkasının takvimine yazabilir; boş bırakılırsa
  // kayıt her zamanki gibi oluşturanın kendi takvimine düşer.
  .extend({ ownerUserId: z.string().uuid().optional() })
  .superRefine((value, ctx) => {
    if (value.endsAt < value.startsAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'Bitiş başlangıçtan önce olamaz' });
    }
    if (value.eventType === 'customer_visit' && !value.companyId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['companyId'], message: 'Müşteri ziyareti için firma zorunlu' });
    }
  });

// completedAt yalnız güncellemede: yeni açılan bir görev tamamlanmış olamaz.
export const calendarEventUpdateSchema = calendarEventFields
  .partial()
  .extend({ completedAt: z.coerce.date().nullable().optional() });

export const calendarSyncSettingsSchema = z.object({
  deviceId: z.string().trim().min(1).max(128),
  platform: z.enum(CALENDAR_PLATFORMS),
  autoSync: z.boolean().default(false),
  selectedCalendars: z
    .array(
      z.object({
        id: z.string().min(1).max(512),
        title: z.string().min(1).max(255),
        color: z.string().max(32).nullable().optional(),
        writable: z.boolean().default(false),
      })
    )
    .max(100)
    .default([]),
  destinationCalendarId: z.string().max(512).nullable().optional(),
});

export const calendarDeviceEventSchema = z.object({
  crmEventId: z.string().uuid().nullable().optional(),
  externalCalendarId: z.string().min(1).max(512),
  externalEventId: z.string().min(1).max(512),
  occurrenceId: z.string().max(512).default(''),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(4000).nullable().optional(),
  location: z.string().max(512).nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  allDay: z.boolean().default(false),
  timezone: z.string().max(64).default('Europe/Istanbul'),
  recurrenceRule: z.string().max(2000).nullable().optional(),
  modifiedAt: z.coerce.date(),
  deleted: z.boolean().default(false),
});

export const calendarSyncSchema = z.object({
  deviceId: z.string().trim().min(1).max(128),
  platform: z.enum(CALENDAR_PLATFORMS),
  observedAt: z.coerce.date(),
  events: z.array(calendarDeviceEventSchema).max(2000),
});

export const calendarImportPreviewRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileBase64: z.string().min(1),
});

export const calendarImportEventSchema = z.object({
  uid: z.string().trim().min(1).max(512),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(4000).nullable().optional(),
  location: z.string().max(512).nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  allDay: z.boolean().default(false),
  timezone: z.string().trim().min(1).max(64).default('Europe/Istanbul'),
  recurrenceRule: z.string().max(2000).nullable().optional(),
});

export const calendarImportCommitSchema = z.object({
  defaultEventType: z.enum(CALENDAR_IMPORT_EVENT_TYPES).default('other'),
  events: z.array(calendarImportEventSchema).min(1).max(5000),
});

export type CalendarEventCreateInput = z.infer<typeof calendarEventCreateSchema>;
export type CalendarEventUpdateInput = z.infer<typeof calendarEventUpdateSchema>;
export type CalendarSyncSettingsInput = z.infer<typeof calendarSyncSettingsSchema>;
export type CalendarDeviceEventInput = z.infer<typeof calendarDeviceEventSchema>;
export type CalendarSyncInput = z.infer<typeof calendarSyncSchema>;
export type CalendarImportPreviewRequest = z.infer<typeof calendarImportPreviewRequestSchema>;
export type CalendarImportEventInput = z.infer<typeof calendarImportEventSchema>;
export type CalendarImportCommitInput = z.infer<typeof calendarImportCommitSchema>;
