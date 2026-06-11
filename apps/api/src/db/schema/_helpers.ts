import { pgTable, varchar, text, integer, boolean, timestamp, numeric, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Audit columns that appear on every "main" table (companies, opportunities, quotes, etc.)
 * Soft-delete via `deletedAt` rather than DELETE statements.
 */
export const auditColumns = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

/** Owner / updater audit FK columns (set by service layer). */
export const ownerColumns = {
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
};

/** Standard lookup table columns (code/name/sortOrder/isActive + audit) */
export const lookupColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Money: numeric(18,4) for currency-agnostic precision */
export const money = (name: string) => numeric(name, { precision: 18, scale: 4 });
/** Percent: numeric(5,2) — e.g. 20.00, 8.50 */
export const percent = (name: string) => numeric(name, { precision: 5, scale: 2 });

/** Re-export for convenience */
export { sql };
