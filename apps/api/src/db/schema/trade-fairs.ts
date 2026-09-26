import { index, integer, pgTable, primaryKey, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './_helpers';
import { departments, divisions, tenants } from './tenants';
import { users } from './users';
import { productModels } from './products';
import { companies, contacts } from './companies';

/**
 * Fuarda görüşülen firma/kişi kayıtları. Fuar ayrı tablo değil, `fairName`
 * metni: aynı adı taşıyan kayıtlar aynı fuarın altında listelenir.
 * Bölüm kapsamı bilinçli olarak yok — kiracının bütün departmanları görür.
 */
export const tradeFairContacts = pgTable(
  'trade_fair_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    fairName: varchar('fair_name', { length: 200 }).notNull(),
    companyName: varchar('company_name', { length: 255 }).notNull(),
    contactName: varchar('contact_name', { length: 200 }).notNull(),
    contactTitle: varchar('contact_title', { length: 120 }),
    mobilePhone: varchar('mobile_phone', { length: 32 }),
    email: varchar('email', { length: 254 }),
    country: varchar('country', { length: 64 }).notNull().default('Türkiye'),
    province: varchar('province', { length: 128 }),
    district: varchar('district', { length: 128 }),
    productCategory: varchar('product_category', { length: 128 }),
    productType: varchar('product_type', { length: 255 }),
    /** Eski alan: departman artık sorulmuyor, kolon eski kayıtlar için duruyor. */
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    /** Görüşmenin bölümü (CNC / Üniversal / Sac İşleme); yeni kayıtta zorunlu (şema). */
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    /** Kayıt Firmalar'a eklendiyse bağlandığı firma ve kontak. */
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    notes: text('notes'),
    /** Standda görüşmeyi yapan çalışan. */
    metByUserId: uuid('met_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Ziyaretçi firmadan kaç kişiyle görüşüldü. */
    visitorCount: integer('visitor_count').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    ...auditColumns,
  },
  (t) => ({
    tenantFairIdx: index('trade_fair_contacts_tenant_fair_idx').on(t.tenantId, t.fairName, t.createdAt),
    metByIdx: index('trade_fair_contacts_met_by_idx').on(t.metByUserId),
    companyIdx: index('trade_fair_contacts_company_idx').on(t.companyId),
    departmentIdx: index('trade_fair_contacts_department_idx').on(t.departmentId),
    divisionIdx: index('trade_fair_contacts_division_idx').on(t.divisionId),
  })
);

/** Görüşmede ilgilenilen CRM ürünleri; isteğe bağlı, birden çok olabilir. */
export const tradeFairContactProducts = pgTable(
  'trade_fair_contact_products',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tradeFairContactId: uuid('trade_fair_contact_id')
      .notNull()
      .references(() => tradeFairContacts.id, { onDelete: 'cascade' }),
    productModelId: uuid('product_model_id')
      .notNull()
      .references(() => productModels.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ name: 'trade_fair_contact_products_pk', columns: [t.tradeFairContactId, t.productModelId] }),
    productIdx: index('trade_fair_contact_products_product_idx').on(t.productModelId),
  })
);
