import { pgTable, uuid, varchar, text, timestamp, integer, boolean, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { auditColumns } from './_helpers';
import { tenants, divisions } from './tenants';
import { users } from './users';
import { companies, contacts } from './companies';

export const phoneNumberIndex = pgTable(
  'phone_number_index',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    entityType: varchar('entity_type', { length: 32 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    phoneSource: varchar('phone_source', { length: 64 }).notNull(),
    originalPhone: varchar('original_phone', { length: 64 }).notNull(),
    normalizedPhone: varchar('normalized_phone', { length: 32 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    priority: integer('priority').notNull().default(100),
    ...auditColumns,
  },
  (t) => ({
    tenantPhoneIdx: index('phone_number_index_tenant_phone_idx').on(t.tenantId, t.normalizedPhone),
    companyIdx: index('phone_number_index_company_idx').on(t.companyId),
    contactIdx: index('phone_number_index_contact_idx').on(t.contactId),
    sourceUnique: uniqueIndex('phone_number_index_source_unique').on(
      t.tenantId,
      t.entityType,
      t.entityId,
      t.phoneSource,
      t.normalizedPhone
    ),
  })
);

export const callEvents = pgTable(
  'call_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 64 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 128 }).notNull(),
    source: varchar('source', { length: 32 }).notNull().default('pbx'),
    direction: varchar('direction', { length: 16 }).notNull().default('inbound'),
    eventType: varchar('event_type', { length: 32 }).notNull(),
    callerNumber: varchar('caller_number', { length: 64 }),
    calleeNumber: varchar('callee_number', { length: 64 }),
    matchedNumber: varchar('matched_number', { length: 64 }),
    normalizedPhone: varchar('normalized_phone', { length: 32 }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    matchStatus: varchar('match_status', { length: 32 }).notNull().default('unmatched'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    ...auditColumns,
  },
  (t) => ({
    providerUnique: uniqueIndex('call_events_provider_unique').on(t.tenantId, t.provider, t.providerEventId),
    tenantIdx: index('call_events_tenant_idx').on(t.tenantId),
    companyIdx: index('call_events_company_idx').on(t.companyId),
    contactIdx: index('call_events_contact_idx').on(t.contactId),
    userIdx: index('call_events_user_idx').on(t.userId),
    normalizedPhoneIdx: index('call_events_normalized_phone_idx').on(t.tenantId, t.normalizedPhone),
  })
);

export const callAssistantSuggestions = pgTable(
  'call_assistant_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    callEventId: uuid('call_event_id')
      .notNull()
      .references(() => callEvents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    actionTaken: varchar('action_taken', { length: 64 }),
    actionEntityType: varchar('action_entity_type', { length: 64 }),
    actionEntityId: uuid('action_entity_id'),
    actionedAt: timestamp('actioned_at', { withTimezone: true }),
    deepLink: varchar('deep_link', { length: 512 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ...auditColumns,
  },
  (t) => ({
    tenantStatusIdx: index('call_assistant_suggestions_tenant_status_idx').on(t.tenantId, t.status),
    userStatusIdx: index('call_assistant_suggestions_user_status_idx').on(t.userId, t.status),
    divisionStatusIdx: index('call_assistant_suggestions_division_status_idx').on(t.divisionId, t.status),
    callEventIdx: index('call_assistant_suggestions_call_event_idx').on(t.callEventId),
  })
);
