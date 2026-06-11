import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditColumns } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';
import { companies, contacts } from './companies';
import { productModels } from './products';
import { inventoryStatuses, stockLocationStatuses, warrantyStatuses } from './lookup';

export const warehouses = pgTable(
  'warehouses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 64 }),
    country: varchar('country', { length: 64 }),
    province: varchar('province', { length: 64 }),
    district: varchar('district', { length: 64 }),
    address: text('address'),
    ...auditColumns,
  },
  (t) => ({
    tenantNameUnique: uniqueIndex('warehouses_tenant_name_unique').on(t.tenantId, t.name),
  })
);

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id')
      .notNull()
      .references(() => productModels.id, { onDelete: 'restrict' }),
    serialNumber: varchar('serial_number', { length: 128 }).notNull(),
    controlUnit: varchar('control_unit', { length: 128 }),
    controlUnitSerialNumber: varchar('control_unit_serial_number', { length: 128 }),
    loadingDate: timestamp('loading_date', { withTimezone: true }),
    arrivalDate: timestamp('arrival_date', { withTimezone: true }),
    locationStatusId: uuid('location_status_id').references(() => stockLocationStatuses.id),
    stockStatusId: uuid('stock_status_id').references(() => inventoryStatuses.id),
    warehouseId: uuid('warehouse_id').references(() => warehouses.id),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    tenantSerialUnique: uniqueIndex('inventory_items_tenant_serial_unique').on(t.tenantId, t.serialNumber),
    tenantIdx: index('inventory_items_tenant_idx').on(t.tenantId),
    productIdx: index('inventory_items_product_idx').on(t.productModelId),
    serialIdx: index('inventory_items_serial_idx').on(t.serialNumber),
    statusIdx: index('inventory_items_status_idx').on(t.stockStatusId),
  })
);

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    inventoryItemId: uuid('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    fromWarehouseId: uuid('from_warehouse_id').references(() => warehouses.id),
    toWarehouseId: uuid('to_warehouse_id').references(() => warehouses.id),
    movementType: varchar('movement_type', { length: 32 }).notNull(),
    movementDate: timestamp('movement_date', { withTimezone: true }).notNull().defaultNow(),
    referenceType: varchar('reference_type', { length: 64 }),
    referenceId: uuid('reference_id'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemIdx: index('inventory_movements_item_idx').on(t.inventoryItemId),
    dateIdx: index('inventory_movements_date_idx').on(t.movementDate),
  })
);

export const customerDevices = pgTable(
  'customer_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => contacts.id),
    inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id),
    opportunityId: uuid('opportunity_id'),
    quoteId: uuid('quote_id'),
    saleDate: timestamp('sale_date', { withTimezone: true }),
    installationDate: timestamp('installation_date', { withTimezone: true }),
    deliveryDate: timestamp('delivery_date', { withTimezone: true }),
    warrantyStartDate: timestamp('warranty_start_date', { withTimezone: true }),
    warrantyEndDate: timestamp('warranty_end_date', { withTimezone: true }),
    statusId: uuid('status_id').references(() => warrantyStatuses.id),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('customer_devices_tenant_idx').on(t.tenantId),
    companyIdx: index('customer_devices_company_idx').on(t.companyId),
    warrantyEndIdx: index('customer_devices_warranty_end_idx').on(t.warrantyEndDate),
  })
);
