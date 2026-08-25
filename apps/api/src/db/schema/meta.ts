import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, ownerColumns } from './_helpers';
import { opportunities } from './crm';
import { tenants, divisions } from './tenants';
import { users } from './users';

export const metaConnections = pgTable('meta_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  pageId: varchar('page_id', { length: 64 }),
  instagramAccountId: varchar('instagram_account_id', { length: 64 }),
  adAccountId: varchar('ad_account_id', { length: 64 }),
  businessId: varchar('business_id', { length: 64 }),
  datasetId: varchar('dataset_id', { length: 64 }),
  whatsappBusinessAccountId: varchar('whatsapp_business_account_id', { length: 64 }),
  phoneNumberId: varchar('phone_number_id', { length: 64 }),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true }),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  ...ownerColumns,
  ...auditColumns,
}, (t) => ({
  tenantIdx: index('meta_connections_tenant_idx').on(t.tenantId),
  pageUnique: uniqueIndex('meta_connections_page_unique').on(t.pageId).where(sql`${t.deletedAt} is null and ${t.pageId} is not null`),
  instagramUnique: uniqueIndex('meta_connections_instagram_unique').on(t.instagramAccountId).where(sql`${t.deletedAt} is null and ${t.instagramAccountId} is not null`),
  phoneUnique: uniqueIndex('meta_connections_phone_unique').on(t.phoneNumberId).where(sql`${t.deletedAt} is null and ${t.phoneNumberId} is not null`),
}));

export const metaFormMappings = pgTable('meta_form_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull().references(() => metaConnections.id, { onDelete: 'cascade' }),
  formId: varchar('form_id', { length: 64 }).notNull(),
  formName: varchar('form_name', { length: 255 }).notNull(),
  fieldMappings: jsonb('field_mappings').$type<Record<string, string>>().notNull(),
  divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').notNull().default(true),
  ...ownerColumns,
  ...auditColumns,
}, (t) => ({
  tenantIdx: index('meta_form_mappings_tenant_idx').on(t.tenantId),
  tenantFormUnique: uniqueIndex('meta_form_mappings_tenant_form_unique').on(t.tenantId, t.formId).where(sql`${t.deletedAt} is null`),
}));

export const metaWebhookEvents = pgTable('meta_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull().references(() => metaConnections.id, { onDelete: 'cascade' }),
  objectType: varchar('object_type', { length: 32 }).notNull(),
  objectId: varchar('object_id', { length: 128 }).notNull(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  externalEventKey: varchar('external_event_key', { length: 128 }).notNull(),
  payloadSha256: varchar('payload_sha256', { length: 64 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  externalUnique: uniqueIndex('meta_webhook_events_external_unique').on(t.connectionId, t.externalEventKey),
  pendingIdx: index('meta_webhook_events_pending_idx').on(t.status, t.nextAttemptAt),
  tenantCreatedIdx: index('meta_webhook_events_tenant_created_idx').on(t.tenantId, t.createdAt),
}));

export const metaDailyInsights = pgTable('meta_daily_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull().references(() => metaConnections.id, { onDelete: 'cascade' }),
  insightDate: timestamp('insight_date', { withTimezone: true }).notNull(),
  campaignId: varchar('campaign_id', { length: 64 }).notNull(),
  campaignName: varchar('campaign_name', { length: 255 }).notNull(),
  spend: numeric('spend', { precision: 18, scale: 4 }).notNull().default('0'),
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  leads: integer('leads').notNull().default(0),
  rawMetrics: jsonb('raw_metrics').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  dayCampaignUnique: uniqueIndex('meta_daily_insights_day_campaign_unique').on(t.connectionId, t.insightDate, t.campaignId),
  tenantDateIdx: index('meta_daily_insights_tenant_date_idx').on(t.tenantId, t.insightDate),
}));

export const metaMessages = pgTable('meta_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull().references(() => metaConnections.id, { onDelete: 'cascade' }),
  channel: varchar('channel', { length: 16 }).notNull(),
  conversationExternalId: varchar('conversation_external_id', { length: 128 }).notNull(),
  remoteId: varchar('remote_id', { length: 128 }).notNull(),
  direction: varchar('direction', { length: 16 }).notNull(),
  senderExternalId: varchar('sender_external_id', { length: 128 }),
  recipientExternalId: varchar('recipient_external_id', { length: 128 }),
  text: text('text'),
  status: varchar('status', { length: 32 }).notNull().default('received'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  rawMetadata: jsonb('raw_metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  remoteUnique: uniqueIndex('meta_messages_remote_unique').on(t.connectionId, t.remoteId),
  conversationIdx: index('meta_messages_conversation_idx').on(t.tenantId, t.conversationExternalId, t.sentAt),
}));

export const metaConversionEvents = pgTable('meta_conversion_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull().references(() => metaConnections.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  eventId: varchar('event_id', { length: 128 }).notNull(),
  eventName: varchar('event_name', { length: 64 }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  lastError: text('last_error'),
  ...ownerColumns,
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantEventUnique: uniqueIndex('meta_conversion_events_tenant_event_unique').on(t.tenantId, t.eventId),
  pendingIdx: index('meta_conversion_events_pending_idx').on(t.status, t.nextAttemptAt),
}));

export const metaAudiences = pgTable('meta_audiences', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull().references(() => metaConnections.id, { onDelete: 'cascade' }),
  remoteId: varchar('remote_id', { length: 64 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  customerFileSource: varchar('customer_file_source', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('ready'),
  ...ownerColumns,
  ...auditColumns,
}, (t) => ({
  tenantIdx: index('meta_audiences_tenant_idx').on(t.tenantId),
  remoteUnique: uniqueIndex('meta_audiences_remote_unique').on(t.connectionId, t.remoteId),
}));

export const metaCatalogs = pgTable('meta_catalogs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull().references(() => metaConnections.id, { onDelete: 'cascade' }),
  remoteId: varchar('remote_id', { length: 64 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  vertical: varchar('vertical', { length: 32 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('ready'),
  ...ownerColumns,
  ...auditColumns,
}, (t) => ({
  tenantIdx: index('meta_catalogs_tenant_idx').on(t.tenantId),
  remoteUnique: uniqueIndex('meta_catalogs_remote_unique').on(t.connectionId, t.remoteId),
}));
