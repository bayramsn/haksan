import { index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

/**
 * Kullanıcıya ait SMTP parolası burada yalnız AES-256-GCM şifreli zarf olarak
 * tutulur. Anahtar hiçbir zaman veritabanına yazılmaz; deployment secret'ından
 * okunur ve kullanıcı/tenant kimliği authenticated additional data olarak
 * şifreli zarfa bağlanır.
 */
export const userMailAccounts = pgTable(
  'user_mail_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 320 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    encryptedPassword: text('encrypted_password').notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    lastErrorCode: varchar('last_error_code', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    tenantUserUnique: uniqueIndex('user_mail_accounts_tenant_user_unique').on(t.tenantId, t.userId),
    tenantEmailIdx: index('user_mail_accounts_tenant_email_idx').on(t.tenantId, t.email),
  })
);
