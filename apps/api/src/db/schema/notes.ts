import { pgTable, uuid, varchar, text, index } from 'drizzle-orm/pg-core';
import { auditColumns, ownerColumns } from './_helpers';
import { tenants } from './tenants';

/**
 * Reusable note/snippet templates (e.g. for quotes). Tenant-scoped.
 */
export const noteTemplates = pgTable(
  'note_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    scope: varchar('scope', { length: 32 }).notNull().default('quote'),
    ...ownerColumns,
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('note_templates_tenant_idx').on(t.tenantId),
    scopeIdx: index('note_templates_scope_idx').on(t.scope),
  })
);
