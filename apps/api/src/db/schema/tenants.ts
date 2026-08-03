import { pgTable, uuid, varchar, text, boolean, integer, bigint, timestamp, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { auditColumns } from './_helpers';
import type { NavigationVisibilityKey } from '@haksan/shared';

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 64 }).notNull(),
    taxNumber: varchar('tax_number', { length: 32 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    hiddenNavigationKeys: jsonb('hidden_navigation_keys').$type<NavigationVisibilityKey[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    ...auditColumns,
  },
  (t) => ({
    slugUnique: uniqueIndex('tenants_slug_unique').on(t.slug),
  })
);

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  ...auditColumns,
});

/**
 * Bölümler (satış grupları): CNC / Üniversal / Sac İşleme.
 * İşlevsel `departments`'tan (Satış/Servis/Finans/Stok) AYRI bir eksendir —
 * ticari verinin departman-bazlı izolasyonu bu eksende yapılır.
 */
export const divisions = pgTable(
  'divisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...auditColumns,
  },
  (t) => ({
    tenantCodeUnique: uniqueIndex('divisions_tenant_code_unique').on(t.tenantId, t.code),
  })
);

/**
 * Bölüm ve belge türü bazında atomik numara sayacı. Teklif/proforma/sözleşme/
 * servis serilerinin birbirine karışmasını ve eşzamanlı kayıtta aynı numaranın
 * üretilmesini önler.
 */
export const documentSequences = pgTable(
  'document_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    businessLine: varchar('business_line', { length: 16 }).notNull(),
    documentType: varchar('document_type', { length: 32 }).notNull(),
    year: integer('year').notNull(),
    lastNumber: integer('last_number').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantSeriesUnique: uniqueIndex('document_sequences_tenant_series_unique').on(
      t.tenantId,
      t.businessLine,
      t.documentType,
      t.year
    ),
    tenantYearIdx: index('document_sequences_tenant_year_idx').on(t.tenantId, t.year),
  })
);

/** Firma ve kontak kayıtları için tenant bazında atomik sıra numarası. */
export const recordSequences = pgTable(
  'record_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    recordType: varchar('record_type', { length: 32 }).notNull(),
    lastNumber: bigint('last_number', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantRecordTypeUnique: uniqueIndex('record_sequences_tenant_record_type_unique').on(
      t.tenantId,
      t.recordType
    ),
  })
);
