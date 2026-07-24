import { bigint, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { companies, contacts } from './companies';
import { divisions, tenants } from './tenants';
import { users } from './users';

export const assistantLogs = pgTable(
  'assistant_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: varchar('event_type', { length: 32 }).notNull(),
    sourceType: varchar('source_type', { length: 64 }),
    sourceId: varchar('source_id', { length: 160 }),
    action: varchar('action', { length: 64 }),
    status: varchar('status', { length: 32 }).notNull().default('ok'),
    message: text('message'),
    response: text('response'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCreatedIdx: index('assistant_logs_tenant_created_idx').on(t.tenantId, t.createdAt),
    userCreatedIdx: index('assistant_logs_user_created_idx').on(t.userId, t.createdAt),
    sourceIdx: index('assistant_logs_source_idx').on(t.tenantId, t.sourceType, t.sourceId),
    eventIdx: index('assistant_logs_event_idx').on(t.tenantId, t.eventType),
  })
);

// LLM çağrısı başlamadan önce maksimum maliyet bu sayaçta rezerve edilir.
// Eşzamanlı istekler aynı tenant/kullanıcı/gün satırını atomik günceller.
export const assistantDailyTokenBudgets = pgTable(
  'assistant_daily_token_budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    usageDate: date('usage_date').notNull(),
    reservedTokens: integer('reserved_tokens').notNull().default(0),
    // Mikro-dolar (1 USD = 1.000.000). Token fiyatlarındaki alt-cent hassasiyetini korur.
    reservedCostMicros: bigint('reserved_cost_micros', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    tenantUserDateUnique: uniqueIndex('assistant_daily_token_budgets_tenant_user_date_unique').on(t.tenantId, t.userId, t.usageDate),
    tenantDateIdx: index('assistant_daily_token_budgets_tenant_date_idx').on(t.tenantId, t.usageDate),
  })
);

/**
 * E-posta, WhatsApp, web formu, telefon notu ve CRM bildirimlerini aynı iş
 * kuyruğunda tutar. Sağlayıcı payload'ı yalnız gerekli, temizlenmiş metadata
 * olarak saklanır; secret/header değerleri bu tabloya yazılmaz.
 */
export const assistantInboxItems = pgTable(
  'assistant_inbox_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    channel: varchar('channel', { length: 24 }).notNull(),
    provider: varchar('provider', { length: 64 }).notNull().default('manual'),
    providerMessageId: varchar('provider_message_id', { length: 160 }),
    direction: varchar('direction', { length: 16 }).notNull().default('inbound'),
    senderName: varchar('sender_name', { length: 255 }),
    senderEmail: varchar('sender_email', { length: 320 }),
    senderPhone: varchar('sender_phone', { length: 64 }),
    subject: varchar('subject', { length: 255 }),
    body: text('body').notNull(),
    category: varchar('category', { length: 24 }).notNull().default('general'),
    priority: varchar('priority', { length: 16 }).notNull().default('normal'),
    status: varchar('status', { length: 24 }).notNull().default('new'),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    lastFollowUpAt: timestamp('last_follow_up_at', { withTimezone: true }),
    followUpCount: integer('follow_up_count').notNull().default(0),
    draftReply: text('draft_reply'),
    classificationConfidence: integer('classification_confidence').notNull().default(50),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    providerMessageUnique: uniqueIndex('assistant_inbox_provider_message_unique').on(
      t.tenantId,
      t.provider,
      t.providerMessageId
    ),
    tenantStatusIdx: index('assistant_inbox_tenant_status_idx').on(t.tenantId, t.status, t.receivedAt),
    assignedStatusIdx: index('assistant_inbox_assigned_status_idx').on(t.assignedToUserId, t.status, t.dueAt),
    companyIdx: index('assistant_inbox_company_idx').on(t.companyId, t.receivedAt),
    divisionIdx: index('assistant_inbox_division_idx').on(t.divisionId, t.status),
    followUpIdx: index('assistant_inbox_follow_up_idx').on(t.tenantId, t.nextFollowUpAt),
  })
);
