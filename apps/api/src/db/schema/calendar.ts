import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';
import { companies, contacts } from './companies';
import { opportunities, visits } from './crm';

export type CalendarSelection = { id: string; title: string; color?: string | null; writable: boolean };

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 32 }).notNull().default('other'),
    source: varchar('source', { length: 32 }).notNull().default('manual'),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    location: varchar('location', { length: 512 }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    allDay: boolean('all_day').notNull().default(false),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Europe/Istanbul'),
    recurrenceRule: text('recurrence_rule'),
    importUid: varchar('import_uid', { length: 512 }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    visitId: uuid('visit_id').references(() => visits.id, { onDelete: 'set null' }),
    sourceModifiedAt: timestamp('source_modified_at', { withTimezone: true }).notNull().defaultNow(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    /** Görev tipi etkinliklerin kapanışı. Dolu ise iş yapılmıştır. */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...auditColumns,
  },
  (table) => ({
    tenantOwnerTimeIdx: index('calendar_events_tenant_owner_time_idx').on(table.tenantId, table.ownerUserId, table.startsAt),
    tenantTimeIdx: index('calendar_events_tenant_time_idx').on(table.tenantId, table.startsAt),
    companyIdx: index('calendar_events_company_idx').on(table.companyId),
    visitIdx: index('calendar_events_visit_idx').on(table.visitId),
    importUidUnique: uniqueIndex('calendar_events_import_uid_unique').on(table.tenantId, table.ownerUserId, table.importUid),
  })
);

export const calendarDeviceLinks = pgTable(
  'calendar_device_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    calendarEventId: uuid('calendar_event_id').notNull().references(() => calendarEvents.id, { onDelete: 'cascade' }),
    deviceId: varchar('device_id', { length: 128 }).notNull(),
    platform: varchar('platform', { length: 16 }).notNull(),
    externalCalendarId: varchar('external_calendar_id', { length: 512 }).notNull(),
    externalEventId: varchar('external_event_id', { length: 512 }).notNull(),
    occurrenceId: varchar('occurrence_id', { length: 512 }).notNull().default(''),
    providerModifiedAt: timestamp('provider_modified_at', { withTimezone: true }).notNull(),
    lastSyncedHash: varchar('last_synced_hash', { length: 128 }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    externalUnique: uniqueIndex('calendar_device_links_external_unique').on(
      table.tenantId,
      table.ownerUserId,
      table.deviceId,
      table.externalCalendarId,
      table.externalEventId,
      table.occurrenceId
    ),
    eventIdx: index('calendar_device_links_event_idx').on(table.calendarEventId),
    ownerDeviceIdx: index('calendar_device_links_owner_device_idx').on(table.ownerUserId, table.deviceId),
  })
);

export const calendarSyncSettings = pgTable(
  'calendar_sync_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    primaryDeviceId: varchar('primary_device_id', { length: 128 }).notNull(),
    platform: varchar('platform', { length: 16 }).notNull(),
    autoSync: boolean('auto_sync').notNull().default(false),
    selectedCalendars: jsonb('selected_calendars').$type<CalendarSelection[]>().notNull().default([]),
    destinationCalendarId: varchar('destination_calendar_id', { length: 512 }),
    windowPastMonths: integer('window_past_months').notNull().default(6),
    windowFutureMonths: integer('window_future_months').notNull().default(6),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastSyncError: text('last_sync_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    tenantOwnerUnique: uniqueIndex('calendar_sync_settings_tenant_owner_unique').on(table.tenantId, table.ownerUserId),
    primaryDeviceIdx: index('calendar_sync_settings_primary_device_idx').on(table.primaryDeviceId),
  })
);

