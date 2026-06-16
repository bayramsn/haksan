import { pgTable, uuid, varchar, text, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditColumns, money } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';
import { companies } from './companies';
import { quotes } from './quotes';
import { salesOrders } from './orders';
import { files } from './files';
import { paymentStatuses, currencies, invoiceStatuses } from './lookup';
import { productModels } from './products';
import { inventoryItems } from './inventory';

export const accountingInvoices = pgTable(
  'accounting_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    type: varchar('type', { length: 16 }).notNull(), // sales | purchase
    invoiceNo: varchar('invoice_no', { length: 64 }).notNull(),
    invoiceDate: timestamp('invoice_date', { withTimezone: true }).notNull(),
    amount: money('amount').notNull(),
    vatAmount: money('vat_amount').notNull().default('0'),
    grandTotal: money('grand_total').notNull(),
    currencyId: uuid('currency_id').references(() => currencies.id),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    salesOrderId: uuid('sales_order_id').references(() => salesOrders.id, { onDelete: 'set null' }),
    firstDueDate: timestamp('first_due_date', { withTimezone: true }),
    lastDueDate: timestamp('last_due_date', { withTimezone: true }),
    installmentCount: integer('installment_count').notNull().default(1),
    statusId: uuid('status_id').references(() => invoiceStatuses.id),
    fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('accounting_invoices_tenant_idx').on(t.tenantId),
    companyIdx: index('accounting_invoices_company_idx').on(t.companyId),
    tenantInvoiceNoUnique: uniqueIndex('accounting_invoices_tenant_invoice_no_unique').on(t.tenantId, t.invoiceNo),
  })
);

export const accountingInvoiceLines = pgTable(
  'accounting_invoice_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    accountingInvoiceId: uuid('accounting_invoice_id')
      .notNull()
      .references(() => accountingInvoices.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id').references(() => productModels.id, { onDelete: 'set null' }),
    inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'set null' }),
    categoryCode: varchar('category_code', { length: 64 }),
    description: text('description'),
    quantity: money('quantity').notNull().default('1'),
    ...auditColumns,
  },
  (t) => ({
    invoiceIdx: index('accounting_invoice_lines_invoice_idx').on(t.accountingInvoiceId),
    inventoryIdx: index('accounting_invoice_lines_inventory_idx').on(t.inventoryItemId),
  })
);

export const invoiceInstallments = pgTable(
  'invoice_installments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    accountingInvoiceId: uuid('accounting_invoice_id')
      .notNull()
      .references(() => accountingInvoices.id, { onDelete: 'cascade' }),
    installmentNo: integer('installment_no').notNull(),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    amount: money('amount').notNull(),
    statusId: uuid('status_id').references(() => paymentStatuses.id),
    receivableId: uuid('receivable_id'),
    payableId: uuid('payable_id'),
    ...auditColumns,
  },
  (t) => ({
    invoiceIdx: index('invoice_installments_invoice_idx').on(t.accountingInvoiceId),
    dueDateIdx: index('invoice_installments_due_date_idx').on(t.dueDate),
  })
);

export const receivables = pgTable(
  'receivables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    accountingInvoiceId: uuid('accounting_invoice_id').references(() => accountingInvoices.id, { onDelete: 'set null' }),
    invoiceNo: varchar('invoice_no', { length: 64 }),
    movementType: varchar('movement_type', { length: 32 }).notNull().default('manual'),
    documentRef: varchar('document_ref', { length: 128 }),
    amount: money('amount').notNull(),
    currencyId: uuid('currency_id').references(() => currencies.id),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    statusId: uuid('status_id').references(() => paymentStatuses.id),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('receivables_tenant_idx').on(t.tenantId),
    companyIdx: index('receivables_company_idx').on(t.companyId),
    dueDateIdx: index('receivables_due_date_idx').on(t.dueDate),
  })
);

export const payables = pgTable(
  'payables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    accountingInvoiceId: uuid('accounting_invoice_id').references(() => accountingInvoices.id, { onDelete: 'set null' }),
    invoiceNo: varchar('invoice_no', { length: 64 }),
    movementType: varchar('movement_type', { length: 32 }).notNull().default('manual'),
    documentRef: varchar('document_ref', { length: 128 }),
    amount: money('amount').notNull(),
    currencyId: uuid('currency_id').references(() => currencies.id),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    statusId: uuid('status_id').references(() => paymentStatuses.id),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('payables_tenant_idx').on(t.tenantId),
    companyIdx: index('payables_company_idx').on(t.companyId),
    dueDateIdx: index('payables_due_date_idx').on(t.dueDate),
  })
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    receivableId: uuid('receivable_id').references(() => receivables.id, { onDelete: 'set null' }),
    payableId: uuid('payable_id').references(() => payables.id, { onDelete: 'set null' }),
    accountingInvoiceId: uuid('accounting_invoice_id').references(() => accountingInvoices.id, { onDelete: 'set null' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    invoiceNo: varchar('invoice_no', { length: 64 }),
    // Kasa yönü: 'in' = giren (müşteriden tahsilat), 'out' = çıkan (tedarikçiye/gidere ödeme).
    direction: varchar('direction', { length: 8 }).notNull().default('in'),
    amount: money('amount').notNull(),
    currencyId: uuid('currency_id').references(() => currencies.id),
    paymentDate: timestamp('payment_date', { withTimezone: true }).notNull(),
    paymentMethod: varchar('payment_method', { length: 32 }).notNull().default('bank_transfer'),
    statusId: uuid('status_id').references(() => paymentStatuses.id),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('payments_tenant_idx').on(t.tenantId),
    companyIdx: index('payments_company_idx').on(t.companyId),
    paymentDateIdx: index('payments_payment_date_idx').on(t.paymentDate),
  })
);
