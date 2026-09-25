import { index, integer, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';

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
  })
);
