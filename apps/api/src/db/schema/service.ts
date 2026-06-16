import { pgTable, uuid, varchar, text, timestamp, integer, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import type { DeliveryFormData } from '@haksan/shared';
import { auditColumns, money } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';
import { companies, contacts } from './companies';
import { customerDevices, inventoryItems } from './inventory';
import { opportunities } from './crm';
import { quotes } from './quotes';
import { salesOrders, salesOrderItems } from './orders';
import { productModels } from './products';
import { serviceTicketStatuses, installationStatuses, shipmentStatuses, units } from './lookup';

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
    // Saha ücretlendirme: konum tipi (istanbul_ici | istanbul_disi), gerçekleşen
    // süre (dk) ve hesaplanan ücret. Ücret @haksan/shared computeInstallationFee
    // ile türetilir; saatlik tarife konum tipinden bellidir (70/100 USD).
    locationType: varchar('location_type', { length: 32 }),
    durationMinutes: integer('duration_minutes'),
    feeAmount: money('fee_amount'),
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
    // Sevkiyatı satış siparişine ve müşteriye bağlar; "fulfilled" sipariş bu kolonlardan sevkiyat doğurur.
    salesOrderId: uuid('sales_order_id').references(() => salesOrders.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    shipmentNo: varchar('shipment_no', { length: 64 }),
    carrier: varchar('carrier', { length: 255 }),
    trackingNo: varchar('tracking_no', { length: 128 }),
    statusId: uuid('status_id').references(() => shipmentStatuses.id),
    // Gümrük/lojistik alanları artık gerçek kolonlar (eski JSON-in-notes hack yerine).
    origin: varchar('origin', { length: 255 }),
    destination: varchar('destination', { length: 255 }),
    eta: timestamp('eta', { withTimezone: true }),
    incoterm: varchar('incoterm', { length: 64 }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }),
    customsClearedAt: timestamp('customs_cleared_at', { withTimezone: true }),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('shipments_tenant_idx').on(t.tenantId),
    statusIdx: index('shipments_status_idx').on(t.statusId),
    salesOrderIdx: index('shipments_sales_order_idx').on(t.salesOrderId),
    companyIdx: index('shipments_company_idx').on(t.companyId),
  })
);

/**
 * Sevkiyat satır kalemleri (paketleme listesi). Her satır bir seri-numaralı stok
 * kalemine (inventoryItems) ve opsiyonel olarak satış siparişi kalemine bağlanır.
 * serialNumber, irsaliye basımı için anlık (snapshot) tutulur.
 */
export const shipmentItems = pgTable(
  'shipment_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'cascade' }),
    inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'set null' }),
    salesOrderItemId: uuid('sales_order_item_id').references(() => salesOrderItems.id, { onDelete: 'set null' }),
    productModelId: uuid('product_model_id').references(() => productModels.id),
    description: text('description').notNull(),
    serialNumber: varchar('serial_number', { length: 128 }),
    quantity: money('quantity').notNull().default('1'),
    unitId: uuid('unit_id').references(() => units.id),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditColumns,
  },
  (t) => ({
    shipmentIdx: index('shipment_items_shipment_idx').on(t.shipmentId),
    inventoryIdx: index('shipment_items_inventory_idx').on(t.inventoryItemId),
  })
);

export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    // İrsaliye↔tutanak ve teslimat↔sipariş bağı: tamamlanınca stok/cihaz senkronu için.
    shipmentId: uuid('shipment_id').references(() => shipments.id, { onDelete: 'set null' }),
    salesOrderId: uuid('sales_order_id').references(() => salesOrders.id, { onDelete: 'set null' }),
    deliveryDate: timestamp('delivery_date', { withTimezone: true }).notNull(),
    signedBy: varchar('signed_by', { length: 255 }),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    notes: text('notes'),
    /** Kurulum tutanağı yazdırma alanları (tezgah/CNC, kurulum tarihi vb.). */
    formData: jsonb('form_data').$type<DeliveryFormData>(),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('deliveries_tenant_idx').on(t.tenantId),
    companyIdx: index('deliveries_company_idx').on(t.companyId),
    opportunityIdx: index('deliveries_opportunity_idx').on(t.opportunityId),
    shipmentIdx: index('deliveries_shipment_idx').on(t.shipmentId),
    statusIdx: index('deliveries_status_idx').on(t.status),
  })
);
