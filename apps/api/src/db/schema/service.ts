import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditColumns } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';
import { companies, contacts } from './companies';
import { customerDevices } from './inventory';
import { opportunities } from './crm';
import { quotes } from './quotes';
import { serviceTicketStatuses, installationStatuses, shipmentStatuses } from './lookup';

export const installationJobs = pgTable(
  'installation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    customerDeviceId: uuid('customer_device_id').references(() => customerDevices.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    scheduledDate: timestamp('scheduled_date', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    statusId: uuid('status_id').references(() => installationStatuses.id),
    location: varchar('location', { length: 255 }),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('installation_jobs_tenant_idx').on(t.tenantId),
    statusIdx: index('installation_jobs_status_idx').on(t.statusId),
  })
);

export const serviceTickets = pgTable(
  'service_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    ticketNo: varchar('ticket_no', { length: 64 }).notNull(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    customerDeviceId: uuid('customer_device_id').references(() => customerDevices.id, { onDelete: 'set null' }),
    subject: varchar('subject', { length: 255 }).notNull(),
    description: text('description'),
    severity: varchar('severity', { length: 32 }).notNull().default('normal'),
    statusId: uuid('status_id').references(() => serviceTicketStatuses.id),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNote: text('resolution_note'),
    ...auditColumns,
  },
  (t) => ({
    tenantTicketNoUnique: uniqueIndex('service_tickets_tenant_ticket_no_unique').on(t.tenantId, t.ticketNo),
    tenantIdx: index('service_tickets_tenant_idx').on(t.tenantId),
    statusIdx: index('service_tickets_status_idx').on(t.statusId),
  })
);

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    shipmentNo: varchar('shipment_no', { length: 64 }),
    carrier: varchar('carrier', { length: 255 }),
    trackingNo: varchar('tracking_no', { length: 128 }),
    statusId: uuid('status_id').references(() => shipmentStatuses.id),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }),
    customsClearedAt: timestamp('customs_cleared_at', { withTimezone: true }),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('shipments_tenant_idx').on(t.tenantId),
    statusIdx: index('shipments_status_idx').on(t.statusId),
  })
);
