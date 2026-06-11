import { pgTable, uuid, varchar, text, boolean, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditColumns, money, percent } from './_helpers';
import { tenants } from './tenants';
import {
  productGroups,
  productCategories,
  productSubcategories,
  productTypes,
  productSpecGroups,
  equipmentTypes,
  currencies,
} from './lookup';
import { files } from './files';

export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    country: varchar('country', { length: 64 }),
    website: varchar('website', { length: 512 }),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    tenantNameUnique: uniqueIndex('brands_tenant_name_unique').on(t.tenantId, t.name),
    tenantIdx: index('brands_tenant_idx').on(t.tenantId),
  })
);

export const productModels = pgTable(
  'product_models',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    productGroupId: uuid('product_group_id').references(() => productGroups.id),
    categoryId: uuid('category_id').references(() => productCategories.id),
    subcategoryId: uuid('subcategory_id').references(() => productSubcategories.id),
    productTypeId: uuid('product_type_id').references(() => productTypes.id),
    modelCode: varchar('model_code', { length: 128 }).notNull(),
    modelName: varchar('model_name', { length: 255 }),
    fullName: varchar('full_name', { length: 512 }).notNull(),
    currencyId: uuid('currency_id').references(() => currencies.id),
    listPrice: money('list_price'),
    cashPrice: money('cash_price'),
    vatRate: percent('vat_rate'),
    originCountry: varchar('origin_country', { length: 64 }),
    hsCode: varchar('hs_code', { length: 32 }),
    stockCode: varchar('stock_code', { length: 64 }),
    imageUrl: varchar('image_url', { length: 512 }),
    description: text('description'),
    // Bu ürünün muadili (eşdeğer) olarak gösterilecek başka bir ürün modeli (self-FK).
    muadilProductId: uuid('muadil_product_id'),
    isActive: boolean('is_active').notNull().default(true),
    ...auditColumns,
  },
  (t) => ({
    tenantModelCodeUnique: uniqueIndex('product_models_tenant_model_code_unique').on(t.tenantId, t.modelCode),
    tenantIdx: index('product_models_tenant_idx').on(t.tenantId),
    brandIdx: index('product_models_brand_idx').on(t.brandId),
    fullNameIdx: index('product_models_full_name_idx').on(t.fullName),
  })
);

export const productSpecs = pgTable(
  'product_specs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id')
      .notNull()
      .references(() => productModels.id, { onDelete: 'cascade' }),
    specGroupId: uuid('spec_group_id').references(() => productSpecGroups.id),
    specKey: varchar('spec_key', { length: 255 }).notNull(),
    specValue: text('spec_value').notNull(),
    specUnit: varchar('spec_unit', { length: 64 }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditColumns,
  },
  (t) => ({
    productIdx: index('product_specs_product_idx').on(t.productModelId),
    groupIdx: index('product_specs_group_idx').on(t.specGroupId),
  })
);

export const productEquipmentItems = pgTable(
  'product_equipment_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id')
      .notNull()
      .references(() => productModels.id, { onDelete: 'cascade' }),
    equipmentTypeId: uuid('equipment_type_id').references(() => equipmentTypes.id),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    isPromotion: boolean('is_promotion').notNull().default(false),
    // Price for optional/promotional equipment shown in the sales price list.
    unitPrice: money('unit_price'),
    currencyId: uuid('currency_id').references(() => currencies.id),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditColumns,
  },
  (t) => ({
    productIdx: index('product_equipment_items_product_idx').on(t.productModelId),
  })
);

export const productMedia = pgTable('product_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  productModelId: uuid('product_model_id')
    .notNull()
    .references(() => productModels.id, { onDelete: 'cascade' }),
  fileId: uuid('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'restrict' }),
  mediaType: varchar('media_type', { length: 32 }).notNull().default('image'),
  title: varchar('title', { length: 255 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const priceLists = pgTable(
  'price_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    currencyId: uuid('currency_id').references(() => currencies.id),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    ...auditColumns,
  },
  (t) => ({
    tenantCodeUnique: uniqueIndex('price_lists_tenant_code_unique').on(t.tenantId, t.code),
  })
);

export const priceListItems = pgTable(
  'price_list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    priceListId: uuid('price_list_id')
      .notNull()
      .references(() => priceLists.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id')
      .notNull()
      .references(() => productModels.id, { onDelete: 'cascade' }),
    listPrice: money('list_price'),
    cashPrice: money('cash_price'),
    vatRate: percent('vat_rate'),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    listProductUnique: uniqueIndex('price_list_items_list_product_unique').on(t.priceListId, t.productModelId),
  })
);

export const productOptionSets = pgTable(
  'product_option_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id')
      .notNull()
      .references(() => productModels.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditColumns,
  },
  (t) => ({
    productIdx: index('product_option_sets_product_idx').on(t.productModelId),
  })
);

export const productOptionValues = pgTable(
  'product_option_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    optionSetId: uuid('option_set_id')
      .notNull()
      .references(() => productOptionSets.id, { onDelete: 'cascade' }),
    value: varchar('value', { length: 255 }).notNull(),
    priceDelta: money('price_delta'),
    currencyId: uuid('currency_id').references(() => currencies.id),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditColumns,
  },
  (t) => ({
    optionSetIdx: index('product_option_values_set_idx').on(t.optionSetId),
  })
);
