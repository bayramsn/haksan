import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

export const assistantLogs = pgTable(
  'assistant_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: varchar('event_type', { length: 32 }).notNull(),
    sourceType: varchar('source_type', { length: 64 }),
    sourceId: varchar('source_id', { length: 160 }),
    action: varchar('action', { length: 64 }),
    status: varchar('status', { length: 32 }).notNull().default('ok'),
    message: text('message'),
    response: text('response'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCreatedIdx: index('assistant_logs_tenant_created_idx').on(t.tenantId, t.createdAt),
    userCreatedIdx: index('assistant_logs_user_created_idx').on(t.userId, t.createdAt),
    sourceIdx: index('assistant_logs_source_idx').on(t.tenantId, t.sourceType, t.sourceId),
    eventIdx: index('assistant_logs_event_idx').on(t.tenantId, t.eventType),
  })
);
