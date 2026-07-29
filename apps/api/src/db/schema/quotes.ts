import { pgTable, uuid, varchar, text, integer, timestamp, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditColumns, money, percent } from './_helpers';
import { tenants, divisions } from './tenants';
import { users } from './users';
import { companies, companyAddresses, contacts } from './companies';
import { opportunities } from './crm';
import { productModels } from './products';
import { inventoryItems } from './inventory';
import { quoteStatuses, currencies, units, proformaStatuses, contractStatuses, invoiceStatuses } from './lookup';
import { files } from './files';

export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    businessLine: varchar('business_line', { length: 16 }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    companyAddressId: uuid('company_address_id').references(() => companyAddresses.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    documentNo: varchar('document_no', { length: 64 }).notNull(),
    revisionNo: integer('revision_no').notNull().default(1),
    quoteDate: timestamp('quote_date', { withTimezone: true }).notNull(),
    validityDays: integer('validity_days').notNull().default(30),
    projectOwnerUserId: uuid('project_owner_user_id').references(() => users.id),
    currencyId: uuid('currency_id').references(() => currencies.id),
    subtotal: money('subtotal').notNull().default('0'),
    discountTotal: money('discount_total').notNull().default('0'),
    headerDiscountAmount: money('header_discount_amount').notNull().default('0'),
    headerDiscountPercent: percent('header_discount_percent').notNull().default('0'),
    vatRate: percent('vat_rate').notNull().default('20'),
    vatAmount: money('vat_amount').notNull().default('0'),
    customsTotal: money('customs_total').notNull().default('0'),
    grandTotal: money('grand_total').notNull().default('0'),
    paymentTerms: text('payment_terms'),
    deliveryTerms: text('delivery_terms'),
    warrantyTerms: text('warranty_terms'),
    notes: text('notes'),
    statusId: uuid('status_id').references(() => quoteStatuses.id),
    priceApprovalStatus: varchar('price_approval_status', { length: 32 }).notNull().default('not_required'),
    priceApprovalRequestedBy: uuid('price_approval_requested_by').references(() => users.id),
    priceApprovalRequestedAt: timestamp('price_approval_requested_at', { withTimezone: true }),
    priceApprovedBy: uuid('price_approved_by').references(() => users.id),
    priceApprovedAt: timestamp('price_approved_at', { withTimezone: true }),
    priceRejectedBy: uuid('price_rejected_by').references(() => users.id),
    priceRejectedAt: timestamp('price_rejected_at', { withTimezone: true }),
    priceApprovalNote: text('price_approval_note'),
    createdBy: uuid('created_by').references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    followUpAt: timestamp('follow_up_at', { withTimezone: true }),
    statusNote: text('status_note'),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    statusChangedBy: uuid('status_changed_by').references(() => users.id, { onDelete: 'set null' }),
    documentSnapshot: jsonb('document_snapshot'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => ({
    tenantDocumentNoUnique: uniqueIndex('quotes_tenant_document_no_unique').on(t.tenantId, t.documentNo),
    tenantIdx: index('quotes_tenant_idx').on(t.tenantId),
    tenantDivisionIdx: index('quotes_tenant_division_idx').on(t.tenantId, t.divisionId),
    tenantBusinessLineIdx: index('quotes_tenant_business_line_idx').on(t.tenantId, t.businessLine),
    companyIdx: index('quotes_company_idx').on(t.companyId),
    companyAddressIdx: index('quotes_company_address_idx').on(t.companyAddressId),
    opportunityIdx: index('quotes_opportunity_idx').on(t.opportunityId),
    quoteDateIdx: index('quotes_quote_date_idx').on(t.quoteDate),
    statusIdx: index('quotes_status_idx').on(t.statusId),
  })
);

export const quoteItems = pgTable(
  'quote_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id').references(() => productModels.id),
    inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id),
    stockCode: varchar('stock_code', { length: 64 }),
    description: text('description').notNull(),
    quantity: money('quantity').notNull(),
    unitId: uuid('unit_id').references(() => units.id),
    unitPrice: money('unit_price').notNull(),
    discountAmount: money('discount_amount').notNull().default('0'),
    vatRate: percent('vat_rate').notNull().default('20'),
    vatAmount: money('vat_amount').notNull().default('0'),
    lineTotal: money('line_total').notNull().default('0'),
    sortOrder: integer('sort_order').notNull().default(0),
    // Opsiyonel donanım / yedek parça için uyumluluk seçimleri.
    compatibility: jsonb('compatibility'),
    // Millileştirilmiş ithal işleme merkezi — otomatik gümrük/vergi tetikler.
    nationalized: boolean('nationalized').notNull().default(false),
    ...auditColumns,
  },
  (t) => ({
    quoteIdx: index('quote_items_quote_idx').on(t.quoteId),
  })
);

export const quoteTerms = pgTable('quote_terms', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  paymentTermsText: text('payment_terms_text'),
  deliveryTermsText: text('delivery_terms_text'),
  warrantyTermsText: text('warranty_terms_text'),
  importCostsExcluded: boolean('import_costs_excluded').notNull().default(true),
  deliveryLocation: varchar('delivery_location', { length: 255 }),
  estimatedDeliveryDaysMin: integer('estimated_delivery_days_min'),
  estimatedDeliveryDaysMax: integer('estimated_delivery_days_max'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const quoteFiles = pgTable('quote_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'restrict' }),
  fileRole: varchar('file_role', { length: 32 }).notNull().default('quote_pdf'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const proformas = pgTable(
  'proformas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    businessLine: varchar('business_line', { length: 16 }),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'restrict' }),
    documentNo: varchar('document_no', { length: 64 }).notNull(),
    issueDate: timestamp('issue_date', { withTimezone: true }).notNull(),
    statusId: uuid('status_id').references(() => proformaStatuses.id),
    fileId: uuid('file_id').references(() => files.id),
    documentSnapshot: jsonb('document_snapshot'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantDocumentNoUnique: uniqueIndex('proformas_tenant_document_no_unique').on(t.tenantId, t.documentNo),
    tenantDivisionIdx: index('proformas_tenant_division_idx').on(t.tenantId, t.divisionId),
    tenantBusinessLineIdx: index('proformas_tenant_business_line_idx').on(t.tenantId, t.businessLine),
    quoteIdx: index('proformas_quote_idx').on(t.quoteId),
  })
);

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    businessLine: varchar('business_line', { length: 16 }),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'restrict' }),
    contractNo: varchar('contract_no', { length: 64 }).notNull(),
    signedDate: timestamp('signed_date', { withTimezone: true }),
    paymentTermDays: integer('payment_term_days'),
    statusId: uuid('status_id').references(() => contractStatuses.id),
    fileId: uuid('file_id').references(() => files.id),
    documentSnapshot: jsonb('document_snapshot'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantContractNoUnique: uniqueIndex('contracts_tenant_contract_no_unique').on(t.tenantId, t.contractNo),
    tenantDivisionIdx: index('contracts_tenant_division_idx').on(t.tenantId, t.divisionId),
    tenantBusinessLineIdx: index('contracts_tenant_business_line_idx').on(t.tenantId, t.businessLine),
    quoteIdx: index('contracts_quote_idx').on(t.quoteId),
  })
);

export const commercialInvoices = pgTable(
  'commercial_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    businessLine: varchar('business_line', { length: 16 }),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'restrict' }),
    invoiceNo: varchar('invoice_no', { length: 64 }).notNull(),
    invoiceDate: timestamp('invoice_date', { withTimezone: true }).notNull(),
    statusId: uuid('status_id').references(() => invoiceStatuses.id),
    fileId: uuid('file_id').references(() => files.id),
    documentSnapshot: jsonb('document_snapshot'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantInvoiceNoUnique: uniqueIndex('commercial_invoices_tenant_invoice_no_unique').on(t.tenantId, t.invoiceNo),
    tenantDivisionIdx: index('commercial_invoices_tenant_division_idx').on(t.tenantId, t.divisionId),
    tenantBusinessLineIdx: index('commercial_invoices_tenant_business_line_idx').on(t.tenantId, t.businessLine),
    quoteIdx: index('commercial_invoices_quote_idx').on(t.quoteId),
  })
);
