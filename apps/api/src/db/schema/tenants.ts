import { pgTable, uuid, varchar, text, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditColumns } from './_helpers';

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 64 }).notNull(),
    taxNumber: varchar('tax_number', { length: 32 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
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
