import { pgTable, uuid, varchar, text, integer, timestamp, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditColumns, money, percent } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';
import { companies, contacts } from './companies';
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
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    documentNo: varchar('document_no', { length: 64 }).notNull(),
    quoteDate: timestamp('quote_date', { withTimezone: true }).notNull(),
    validityDays: integer('validity_days').notNull().default(30),
    projectOwnerUserId: uuid('project_owner_user_id').references(() => users.id),
    currencyId: uuid('currency_id').references(() => currencies.id),
    subtotal: money('subtotal').notNull().default('0'),
    discountTotal: money('discount_total').notNull().default('0'),
    vatRate: percent('vat_rate').notNull().default('20'),
    vatAmount: money('vat_amount').notNull().default('0'),
    grandTotal: money('grand_total').notNull().default('0'),
    paymentTerms: text('payment_terms'),
    deliveryTerms: text('delivery_terms'),
    warrantyTerms: text('warranty_terms'),
    notes: text('notes'),
    statusId: uuid('status_id').references(() => quoteStatuses.id),
    createdBy: uuid('created_by').references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => ({
    tenantDocumentNoUnique: uniqueIndex('quotes_tenant_document_no_unique').on(t.tenantId, t.documentNo),
    tenantIdx: index('quotes_tenant_idx').on(t.tenantId),
    companyIdx: index('quotes_company_idx').on(t.companyId),
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
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id').references(() => productModels.id),
    inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id),
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
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'restrict' }),
    documentNo: varchar('document_no', { length: 64 }).notNull(),
    issueDate: timestamp('issue_date', { withTimezone: true }).notNull(),
    statusId: uuid('status_id').references(() => proformaStatuses.id),
    fileId: uuid('file_id').references(() => files.id),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantDocumentNoUnique: uniqueIndex('proformas_tenant_document_no_unique').on(t.tenantId, t.documentNo),
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
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'restrict' }),
    contractNo: varchar('contract_no', { length: 64 }).notNull(),
    signedDate: timestamp('signed_date', { withTimezone: true }),
    statusId: uuid('status_id').references(() => contractStatuses.id),
    fileId: uuid('file_id').references(() => files.id),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantContractNoUnique: uniqueIndex('contracts_tenant_contract_no_unique').on(t.tenantId, t.contractNo),
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
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'restrict' }),
    invoiceNo: varchar('invoice_no', { length: 64 }).notNull(),
    invoiceDate: timestamp('invoice_date', { withTimezone: true }).notNull(),
    statusId: uuid('status_id').references(() => invoiceStatuses.id),
    fileId: uuid('file_id').references(() => files.id),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantInvoiceNoUnique: uniqueIndex('commercial_invoices_tenant_invoice_no_unique').on(t.tenantId, t.invoiceNo),
    quoteIdx: index('commercial_invoices_quote_idx').on(t.quoteId),
  })
);
