import { pgTable, uuid, varchar, text, timestamp, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditColumns, money } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';
import { files } from './files';
import { customerDevices, inventoryItems } from './inventory';
import { productModels, productOptionValues } from './products';
import { quotes } from './quotes';
import { serviceTickets } from './service';

export const machinePassports = pgTable(
  'machine_passports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerDeviceId: uuid('customer_device_id')
      .notNull()
      .references(() => customerDevices.id, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 160 }).notNull(),
    accessTokenHash: varchar('access_token_hash', { length: 128 }).notNull(),
    publicTitle: varchar('public_title', { length: 255 }),
    publicNotes: text('public_notes'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    tokenRotatedAt: timestamp('token_rotated_at', { withTimezone: true }),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('machine_passports_tenant_idx').on(t.tenantId),
    deviceUnique: uniqueIndex('machine_passports_customer_device_unique').on(t.customerDeviceId),
    tenantSlugUnique: uniqueIndex('machine_passports_tenant_slug_unique').on(t.tenantId, t.slug),
    tenantTokenUnique: uniqueIndex('machine_passports_tenant_token_unique').on(t.tenantId, t.accessTokenHash),
  })
);

export const machinePassportDocuments = pgTable(
  'machine_passport_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    passportId: uuid('passport_id')
      .notNull()
      .references(() => machinePassports.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 255 }).notNull(),
    documentType: varchar('document_type', { length: 64 }).notNull().default('document'),
    visibility: varchar('visibility', { length: 32 }).notNull().default('public'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('machine_passport_documents_tenant_idx').on(t.tenantId),
    passportIdx: index('machine_passport_documents_passport_idx').on(t.passportId),
  })
);

export const machineMaintenanceEvents = pgTable(
  'machine_maintenance_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerDeviceId: uuid('customer_device_id')
      .notNull()
      .references(() => customerDevices.id, { onDelete: 'cascade' }),
    serviceTicketId: uuid('service_ticket_id').references(() => serviceTickets.id, { onDelete: 'set null' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    eventDate: timestamp('event_date', { withTimezone: true }).notNull().defaultNow(),
    title: varchar('title', { length: 255 }).notNull(),
    notes: text('notes'),
    performedByUserId: uuid('performed_by_user_id').references(() => users.id),
    nextDueDate: timestamp('next_due_date', { withTimezone: true }),
    laborMinutes: integer('labor_minutes'),
    travelCost: money('travel_cost').notNull().default('0'),
    laborCost: money('labor_cost').notNull().default('0'),
    partsCost: money('parts_cost').notNull().default('0'),
    serviceRevenue: money('service_revenue').notNull().default('0'),
    currencyCode: varchar('currency_code', { length: 8 }).notNull().default('USD'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('machine_maintenance_events_tenant_idx').on(t.tenantId),
    deviceIdx: index('machine_maintenance_events_device_idx').on(t.customerDeviceId),
    nextDueIdx: index('machine_maintenance_events_next_due_idx').on(t.nextDueDate),
  })
);

export const productConfigurationRules = pgTable(
  'product_configuration_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id')
      .notNull()
      .references(() => productModels.id, { onDelete: 'cascade' }),
    ruleType: varchar('rule_type', { length: 32 }).notNull(),
    sourceOptionValueId: uuid('source_option_value_id').references(() => productOptionValues.id, { onDelete: 'cascade' }),
    targetOptionValueId: uuid('target_option_value_id').references(() => productOptionValues.id, { onDelete: 'cascade' }),
    targetProductModelId: uuid('target_product_model_id').references(() => productModels.id, { onDelete: 'cascade' }),
    message: text('message'),
    severity: varchar('severity', { length: 32 }).notNull().default('info'),
    isActive: boolean('is_active').notNull().default(true),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('product_configuration_rules_tenant_idx').on(t.tenantId),
    productIdx: index('product_configuration_rules_product_idx').on(t.productModelId),
    sourceOptionIdx: index('product_configuration_rules_source_option_idx').on(t.sourceOptionValueId),
  })
);

export const quoteConfigurationSnapshots = pgTable(
  'quote_configuration_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id').references(() => productModels.id, { onDelete: 'set null' }),
    inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'set null' }),
    snapshot: jsonb('snapshot').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index('quote_configuration_snapshots_tenant_idx').on(t.tenantId),
    quoteUnique: uniqueIndex('quote_configuration_snapshots_quote_unique').on(t.quoteId),
  })
);
