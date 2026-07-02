import { pgTable, uuid, varchar, text, timestamp, integer, boolean, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import type { DeliveryFormData, InstallationFormData } from '@haksan/shared';
import { auditColumns, money } from './_helpers';
import { tenants, divisions } from './tenants';
import { users } from './users';
import { companies, contacts } from './companies';
import { customerDevices, inventoryItems, warehouses } from './inventory';
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
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
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
    // Saha planlama: konum tipi ve gerçekleşen süre.
    locationType: varchar('location_type', { length: 32 }),
    durationMinutes: integer('duration_minutes'),
    // Eski kayıtlarla şema uyumluluğu için tutulur; yeni kurulumlarda daima null.
    feeAmount: money('fee_amount'),
    notes: text('notes'),
    /** Kurulum tutanağı alanları (kontrol çizelgesi, problem ve imza bilgileri). */
    formData: jsonb('form_data').$type<InstallationFormData>(),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('installation_jobs_tenant_idx').on(t.tenantId),
    tenantDivisionIdx: index('installation_jobs_tenant_division_idx').on(t.tenantId, t.divisionId),
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
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    customerDeviceId: uuid('customer_device_id').references(() => customerDevices.id, { onDelete: 'set null' }),
    subject: varchar('subject', { length: 255 }).notNull(),
    description: text('description'),
    severity: varchar('severity', { length: 32 }).notNull().default('normal'),
    // Kayıt tipi: complaint (şikayet) | request (talep) | warranty_claim (garanti) | question (soru).
    ticketType: varchar('ticket_type', { length: 32 }).notNull().default('complaint'),
    // Geliş kanalı: manual (elle) | phone | email | whatsapp | portal | web | qr.
    // `passport` yalnız eski kayıtları okuyabilmek için korunur; yeni public akış şikayet linkidir.
    source: varchar('source', { length: 32 }).notNull().default('manual'),
    statusId: uuid('status_id').references(() => serviceTicketStatuses.id),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNote: text('resolution_note'),
    /** Timer, operations, activity history — UI session fields persisted as JSON. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ...auditColumns,
  },
  (t) => ({
    tenantTicketNoUnique: uniqueIndex('service_tickets_tenant_ticket_no_unique').on(t.tenantId, t.ticketNo),
    tenantIdx: index('service_tickets_tenant_idx').on(t.tenantId),
    tenantDivisionIdx: index('service_tickets_tenant_division_idx').on(t.tenantId, t.divisionId),
    statusIdx: index('service_tickets_status_idx').on(t.statusId),
  })
);

export const serviceComplaintLinks = pgTable(
  'service_complaint_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    customerDeviceId: uuid('customer_device_id').references(() => customerDevices.id, { onDelete: 'set null' }),
    slug: varchar('slug', { length: 160 }).notNull(),
    accessTokenHash: varchar('access_token_hash', { length: 128 }).notNull(),
    title: varchar('title', { length: 255 }),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('service_complaint_links_tenant_idx').on(t.tenantId),
    tenantDivisionIdx: index('service_complaint_links_tenant_division_idx').on(t.tenantId, t.divisionId),
    tenantSlugUnique: uniqueIndex('service_complaint_links_tenant_slug_unique').on(t.tenantId, t.slug),
    tenantTokenUnique: uniqueIndex('service_complaint_links_tenant_token_unique').on(t.tenantId, t.accessTokenHash),
    companyIdx: index('service_complaint_links_company_idx').on(t.companyId),
    deviceIdx: index('service_complaint_links_device_idx').on(t.customerDeviceId),
  })
);

export const serviceComplaintIntakes = pgTable(
  'service_complaint_intakes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    complaintNo: varchar('complaint_no', { length: 64 }).notNull(),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    complaintLinkId: uuid('complaint_link_id').references(() => serviceComplaintLinks.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    customerDeviceId: uuid('customer_device_id').references(() => customerDevices.id, { onDelete: 'set null' }),
    serviceTicketId: uuid('service_ticket_id').references(() => serviceTickets.id, { onDelete: 'set null' }),
    source: varchar('source', { length: 32 }).notNull().default('manual'),
    status: varchar('status', { length: 32 }).notNull().default('new'),
    subject: varchar('subject', { length: 255 }).notNull(),
    description: text('description'),
    severity: varchar('severity', { length: 32 }).notNull().default('normal'),
    ticketType: varchar('ticket_type', { length: 32 }).notNull().default('complaint'),
    contactName: varchar('contact_name', { length: 255 }),
    contactPhone: varchar('contact_phone', { length: 64 }),
    contactEmail: varchar('contact_email', { length: 255 }),
    rejectionNote: text('rejection_note'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...auditColumns,
  },
  (t) => ({
    tenantComplaintNoUnique: uniqueIndex('service_complaint_intakes_tenant_complaint_no_unique').on(t.tenantId, t.complaintNo),
    tenantIdx: index('service_complaint_intakes_tenant_idx').on(t.tenantId),
    tenantDivisionIdx: index('service_complaint_intakes_tenant_division_idx').on(t.tenantId, t.divisionId),
    statusIdx: index('service_complaint_intakes_status_idx').on(t.status),
    sourceIdx: index('service_complaint_intakes_source_idx').on(t.source),
    companyIdx: index('service_complaint_intakes_company_idx').on(t.companyId),
    deviceIdx: index('service_complaint_intakes_device_idx').on(t.customerDeviceId),
    ticketIdx: index('service_complaint_intakes_ticket_idx').on(t.serviceTicketId),
    linkIdx: index('service_complaint_intakes_link_idx').on(t.complaintLinkId),
  })
);

export const serviceWarrantyClaims = pgTable(
  'service_warranty_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    serviceTicketId: uuid('service_ticket_id')
      .notNull()
      .references(() => serviceTickets.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    customerDeviceId: uuid('customer_device_id').references(() => customerDevices.id, { onDelete: 'set null' }),
    warrantyStartSnapshot: timestamp('warranty_start_snapshot', { withTimezone: true }),
    warrantyEndSnapshot: timestamp('warranty_end_snapshot', { withTimezone: true }),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    coverageSuggestion: varchar('coverage_suggestion', { length: 32 }).notNull().default('unknown'),
    coverageDecision: varchar('coverage_decision', { length: 32 }).notNull().default('pending'),
    failureCategory: varchar('failure_category', { length: 128 }),
    technicianAssessment: text('technician_assessment'),
    managerDecisionNote: text('manager_decision_note'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    rmaNo: varchar('rma_no', { length: 128 }),
    supplierName: varchar('supplier_name', { length: 255 }),
    supplierRmaStatus: varchar('supplier_rma_status', { length: 64 }),
    costAmount: money('cost_amount'),
    costCurrency: varchar('cost_currency', { length: 8 }).notNull().default('USD'),
    customerChargeAmount: money('customer_charge_amount'),
    customerChargeCurrency: varchar('customer_charge_currency', { length: 8 }).notNull().default('USD'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('service_warranty_claims_tenant_idx').on(t.tenantId),
    tenantDivisionIdx: index('service_warranty_claims_tenant_division_idx').on(t.tenantId, t.divisionId),
    serviceTicketUnique: uniqueIndex('service_warranty_claims_service_ticket_unique').on(t.serviceTicketId),
    companyIdx: index('service_warranty_claims_company_idx').on(t.companyId),
    deviceIdx: index('service_warranty_claims_device_idx').on(t.customerDeviceId),
    statusIdx: index('service_warranty_claims_status_idx').on(t.status),
  })
);

export const serviceWarrantyParts = pgTable(
  'service_warranty_parts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    warrantyClaimId: uuid('warranty_claim_id')
      .notNull()
      .references(() => serviceWarrantyClaims.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id').references(() => productModels.id, { onDelete: 'set null' }),
    inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    actionType: varchar('action_type', { length: 32 }).notNull().default('replace'),
    source: varchar('source', { length: 32 }).notNull().default('stock'),
    supplierRmaStatus: varchar('supplier_rma_status', { length: 64 }),
    chargeToCustomer: boolean('charge_to_customer').notNull().default(false),
    unitCost: money('unit_cost'),
    currency: varchar('currency', { length: 8 }).notNull().default('USD'),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('service_warranty_parts_tenant_idx').on(t.tenantId),
    claimIdx: index('service_warranty_parts_claim_idx').on(t.warrantyClaimId),
    productIdx: index('service_warranty_parts_product_idx').on(t.productModelId),
    inventoryIdx: index('service_warranty_parts_inventory_idx').on(t.inventoryItemId),
  })
);

export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    // Sevkiyatı satış siparişine ve müşteriye bağlar; "fulfilled" sipariş bu kolonlardan sevkiyat doğurur.
    salesOrderId: uuid('sales_order_id').references(() => salesOrders.id, { onDelete: 'set null' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    senderCompanyId: uuid('sender_company_id').references(() => companies.id, { onDelete: 'set null' }),
    // Kayıtlı olmayan gönderici için serbest-metin adı (senderCompanyId FK yerine elle giriş).
    senderName: varchar('sender_name', { length: 255 }),
    carrierCompanyId: uuid('carrier_company_id').references(() => companies.id, { onDelete: 'set null' }),
    transportMode: varchar('transport_mode', { length: 32 }),
    productCategoryCode: varchar('product_category_code', { length: 64 }),
    destinationWarehouseId: uuid('destination_warehouse_id').references(() => warehouses.id, { onDelete: 'set null' }),
    loadingDate: timestamp('loading_date', { withTimezone: true }),
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
    tenantDivisionIdx: index('shipments_tenant_division_idx').on(t.tenantId, t.divisionId),
    statusIdx: index('shipments_status_idx').on(t.statusId),
    salesOrderIdx: index('shipments_sales_order_idx').on(t.salesOrderId),
    companyIdx: index('shipments_company_idx').on(t.companyId),
    senderCompanyIdx: index('shipments_sender_company_idx').on(t.senderCompanyId),
    carrierCompanyIdx: index('shipments_carrier_company_idx').on(t.carrierCompanyId),
    destinationWarehouseIdx: index('shipments_destination_warehouse_idx').on(t.destinationWarehouseId),
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
    packageCount: integer('package_count'),
    palletCount: integer('pallet_count'),
    packageLengthCm: money('package_length_cm'),
    packageWidthCm: money('package_width_cm'),
    packageHeightCm: money('package_height_cm'),
    grossWeightKg: money('gross_weight_kg'),
    packageNotes: text('package_notes'),
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
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
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
    tenantDivisionIdx: index('deliveries_tenant_division_idx').on(t.tenantId, t.divisionId),
    companyIdx: index('deliveries_company_idx').on(t.companyId),
    opportunityIdx: index('deliveries_opportunity_idx').on(t.opportunityId),
    shipmentIdx: index('deliveries_shipment_idx').on(t.shipmentId),
    statusIdx: index('deliveries_status_idx').on(t.status),
  })
);
