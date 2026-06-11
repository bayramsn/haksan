import { pgTable, uuid, varchar, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditColumns, money, percent } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';
import { companies, contacts } from './companies';
import { opportunities } from './crm';
import { productModels } from './products';
import { inventoryItems } from './inventory';
import { quotes, quoteItems } from './quotes';
import { currencies, purchaseOrderStatuses, salesOrderStatuses, units } from './lookup';

export const salesOrders = pgTable(
  'sales_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    orderNo: varchar('order_no', { length: 64 }).notNull(),
    orderDate: timestamp('order_date', { withTimezone: true }).notNull(),
    statusId: uuid('status_id').references(() => salesOrderStatuses.id),
    currencyId: uuid('currency_id').references(() => currencies.id),
    subtotal: money('subtotal').notNull().default('0'),
    discountTotal: money('discount_total').notNull().default('0'),
    vatAmount: money('vat_amount').notNull().default('0'),
    grandTotal: money('grand_total').notNull().default('0'),
    notes: text('notes'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    reservedAt: timestamp('reserved_at', { withTimezone: true }),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantOrderNoUnique: uniqueIndex('sales_orders_tenant_order_no_unique').on(t.tenantId, t.orderNo),
    tenantQuoteUnique: uniqueIndex('sales_orders_tenant_quote_unique').on(t.tenantId, t.quoteId),
    tenantIdx: index('sales_orders_tenant_idx').on(t.tenantId),
    companyIdx: index('sales_orders_company_idx').on(t.companyId),
    quoteIdx: index('sales_orders_quote_idx').on(t.quoteId),
    statusIdx: index('sales_orders_status_idx').on(t.statusId),
  })
);

export const salesOrderItems = pgTable(
  'sales_order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'cascade' }),
    quoteItemId: uuid('quote_item_id').references(() => quoteItems.id, { onDelete: 'set null' }),
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
    ...auditColumns,
  },
  (t) => ({
    orderIdx: index('sales_order_items_order_idx').on(t.salesOrderId),
    inventoryIdx: index('sales_order_items_inventory_idx').on(t.inventoryItemId),
  })
);

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // İdari satın almalarda firma seçimi opsiyonel olabilir (NOT NULL kaldırıldı).
    supplierCompanyId: uuid('supplier_company_id').references(() => companies.id, { onDelete: 'restrict' }),
    purchaseType: varchar('purchase_type', { length: 32 }).notNull().default('commercial'),
    invoiceNo: varchar('invoice_no', { length: 128 }),
    orderNo: varchar('order_no', { length: 64 }).notNull(),
    orderDate: timestamp('order_date', { withTimezone: true }).notNull(),
    expectedDate: timestamp('expected_date', { withTimezone: true }),
    statusId: uuid('status_id').references(() => purchaseOrderStatuses.id),
    currencyId: uuid('currency_id').references(() => currencies.id),
    subtotal: money('subtotal').notNull().default('0'),
    discountTotal: money('discount_total').notNull().default('0'),
    vatAmount: money('vat_amount').notNull().default('0'),
    grandTotal: money('grand_total').notNull().default('0'),
    incoterm: varchar('incoterm', { length: 64 }),
    shipmentReference: varchar('shipment_reference', { length: 128 }),
    notes: text('notes'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantOrderNoUnique: uniqueIndex('purchase_orders_tenant_order_no_unique').on(t.tenantId, t.orderNo),
    tenantIdx: index('purchase_orders_tenant_idx').on(t.tenantId),
    supplierIdx: index('purchase_orders_supplier_idx').on(t.supplierCompanyId),
    statusIdx: index('purchase_orders_status_idx').on(t.statusId),
    expectedDateIdx: index('purchase_orders_expected_date_idx').on(t.expectedDate),
  })
);

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id').references(() => productModels.id),
    description: text('description').notNull(),
    quantity: money('quantity').notNull(),
    unitId: uuid('unit_id').references(() => units.id),
    unitPrice: money('unit_price').notNull(),
    discountAmount: money('discount_amount').notNull().default('0'),
    vatRate: percent('vat_rate').notNull().default('20'),
    vatAmount: money('vat_amount').notNull().default('0'),
    lineTotal: money('line_total').notNull().default('0'),
    expectedDate: timestamp('expected_date', { withTimezone: true }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditColumns,
  },
  (t) => ({
    orderIdx: index('purchase_order_items_order_idx').on(t.purchaseOrderId),
    productIdx: index('purchase_order_items_product_idx').on(t.productModelId),
  })
);
