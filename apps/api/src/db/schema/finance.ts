import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { auditColumns, money } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';
import { companies } from './companies';
import { quotes } from './quotes';
import { paymentStatuses, currencies } from './lookup';

export const receivables = pgTable(
  'receivables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    amount: money('amount').notNull(),
    currencyId: uuid('currency_id').references(() => currencies.id),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    statusId: uuid('status_id').references(() => paymentStatuses.id),
    notes: text('notes'),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('receivables_tenant_idx').on(t.tenantId),
    companyIdx: index('receivables_company_idx').on(t.companyId),
    dueDateIdx: index('receivables_due_date_idx').on(t.dueDate),
  })
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    receivableId: uuid('receivable_id').references(() => receivables.id, { onDelete: 'set null' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    amount: money('amount').notNull(),
    currencyId: uuid('currency_id').references(() => currencies.id),
    paymentDate: timestamp('payment_date', { withTimezone: true }).notNull(),
    paymentMethod: varchar('payment_method', { length: 32 }).notNull().default('bank_transfer'),
    statusId: uuid('status_id').references(() => paymentStatuses.id),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('payments_tenant_idx').on(t.tenantId),
    companyIdx: index('payments_company_idx').on(t.companyId),
    paymentDateIdx: index('payments_payment_date_idx').on(t.paymentDate),
  })
);
