import { pgTable, uuid, varchar, text, boolean, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditColumns, money, percent } from './_helpers';
import { tenants, divisions } from './tenants';
import { companies } from './companies';
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
    sortOrder: integer('sort_order').notNull().default(0),
    // Haksan'a ait markalar firma tablosunda yapay bir müşteri kaydı
    // oluşturmadan açıkça işaretlenir; dış markalar gerçek firmaya bağlanır.
    isOwned: boolean('is_owned').notNull().default(false),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    logoFileId: uuid('logo_file_id').references(() => files.id, { onDelete: 'set null' }),
    // Bölüm (departman) bazlı marka: NULL → tüm bölümlerde ("Tümü") geçerli.
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    ...auditColumns,
  },
  (t) => ({
    tenantNameUnique: uniqueIndex('brands_tenant_name_unique').on(t.tenantId, t.name),
    tenantIdx: index('brands_tenant_idx').on(t.tenantId),
    divisionIdx: index('brands_division_idx').on(t.divisionId),
    companyIdx: index('brands_company_idx').on(t.companyId),
    logoFileIdx: index('brands_logo_file_idx').on(t.logoFileId),
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
    series: varchar('series', { length: 128 }),
    productGroupId: uuid('product_group_id').references(() => productGroups.id),
    categoryId: uuid('category_id').references(() => productCategories.id),
    subcategoryId: uuid('subcategory_id').references(() => productSubcategories.id),
    productTypeId: uuid('product_type_id').references(() => productTypes.id),
    compatibleMachineTypeId: uuid('compatible_machine_type_id').references(() => productTypes.id),
    supplierCompanyId: uuid('supplier_company_id').references(() => companies.id, { onDelete: 'set null' }),
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
    supplierIdx: index('product_models_supplier_idx').on(t.supplierCompanyId),
    fullNameIdx: index('product_models_full_name_idx').on(t.fullName),
    compatibleMachineTypeIdx: index('product_models_compatible_machine_type_idx').on(t.tenantId, t.categoryId, t.compatibleMachineTypeId),
  })
);

export const productAlternatives = pgTable(
  'product_alternatives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id')
      .notNull()
      .references(() => productModels.id, { onDelete: 'cascade' }),
    alternativeProductModelId: uuid('alternative_product_model_id')
      .notNull()
      .references(() => productModels.id, { onDelete: 'cascade' }),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('product_alternatives_tenant_idx').on(t.tenantId),
    productIdx: index('product_alternatives_product_idx').on(t.productModelId),
    alternativeIdx: index('product_alternatives_alternative_idx').on(t.alternativeProductModelId),
    productAlternativeUnique: uniqueIndex('product_alternatives_product_alternative_unique').on(t.productModelId, t.alternativeProductModelId),
  })
);

export const productOptionalEquipmentCompatibilities = pgTable(
  'product_optional_equipment_compatibilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id')
      .notNull()
      .references(() => productModels.id, { onDelete: 'cascade' }),
    productGroupId: uuid('product_group_id').references(() => productGroups.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => productCategories.id, { onDelete: 'cascade' }),
    subcategoryId: uuid('subcategory_id').references(() => productSubcategories.id, { onDelete: 'cascade' }),
    productTypeId: uuid('product_type_id').references(() => productTypes.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'cascade' }),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('product_optional_equipment_compat_tenant_idx').on(t.tenantId),
    productIdx: index('product_optional_equipment_compat_product_idx').on(t.productModelId),
    groupIdx: index('product_optional_equipment_compat_group_idx').on(t.productGroupId),
    categoryIdx: index('product_optional_equipment_compat_category_idx').on(t.categoryId),
    subcategoryIdx: index('product_optional_equipment_compat_subcategory_idx').on(t.subcategoryId),
    typeIdx: index('product_optional_equipment_compat_type_idx').on(t.productTypeId),
    brandIdx: index('product_optional_equipment_compat_brand_idx').on(t.brandId),
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

export const productSpecTemplates = pgTable(
  'product_spec_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productTypeCode: varchar('product_type_code', { length: 64 }).notNull(),
    specKey: varchar('spec_key', { length: 255 }).notNull(),
    specGroupCode: varchar('spec_group_code', { length: 64 }),
    defaultValue: text('default_value'),
    specUnit: varchar('spec_unit', { length: 64 }),
    // Bölüm (CNC / Üniversal / Sac İşleme). NULL → tüm bölümlerde ("Tümü") geçerli.
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    // Katalogdaki varsayılan alanlar koddan yeniden üretildiği için fiziksel silme
    // yerine tombstone tutulur; böylece yönetici tarafından silinen alan geri gelmez.
    isDeleted: boolean('is_deleted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    productTypeIdx: index('product_spec_templates_product_type_idx').on(t.productTypeCode),
    // Teklik bölüm bazında: aynı (bölüm, tip, alan) tek kayıt. NULL bölümler coalesce ile tekil.
    productTypeKeyUnique: uniqueIndex('product_spec_templates_division_type_key_unique').on(
      sql`coalesce(division_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.productTypeCode,
      t.specKey,
    ),
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
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
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
    campaignPrice: money('campaign_price'),
    campaignValidFrom: timestamp('campaign_valid_from', { withTimezone: true }),
    campaignValidUntil: timestamp('campaign_valid_until', { withTimezone: true }),
    campaignIsActive: boolean('campaign_is_active').notNull().default(false),
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
