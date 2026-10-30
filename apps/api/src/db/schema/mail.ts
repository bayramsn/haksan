import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { companies, contacts } from './companies';
import { tenants } from './tenants';
import { users } from './users';

/** Independent of SMTP credentials: admins can prepare signatures before users connect. */
export const userMailSignatures = pgTable('user_mail_signatures', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  image: text('image'),
  filename: varchar('filename', { length: 200 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ tenantUserUnique: uniqueIndex('user_mail_signatures_tenant_user_unique').on(t.tenantId, t.userId) }));

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
    /** Giden maile eklenen düz metin imza; NULL = profilden üretilen varsayılan, '' = imzasız. */
    signature: text('signature'),
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

/**
 * Toplu mail gönderimi. Gönderim arka planda, oluşturan kullanıcının webmail
 * hesabından ve oluşturma anındaki yetkileriyle (`actor` anlık görüntüsü) yürür.
 */
export const mailCampaigns = pgTable('mail_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subject: varchar('subject', { length: 255 }).notNull(),
  body: text('body').notNull(),
  fileIds: jsonb('file_ids').$type<string[]>().notNull().default([]),
  actor: jsonb('actor').$type<Record<string, unknown>>().notNull(),
  status: varchar('status', { length: 16 }).notNull().default('sending'),
  error: varchar('error', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => ({ tenantCreatedIdx: index('mail_campaigns_tenant_created_idx').on(t.tenantId, t.createdAt) }));

export const mailCampaignRecipients = pgTable('mail_campaign_recipients', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => mailCampaigns.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 320 }).notNull(),
  name: varchar('name', { length: 255 }),
  companyName: varchar('company_name', { length: 255 }),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  error: varchar('error', { length: 255 }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  /** Mailin altındaki "abonelikten çık" bağlantısının tahmin edilemez anahtarı. */
  unsubscribeToken: uuid('unsubscribe_token').notNull().defaultRandom(),
}, (t) => ({
  campaignStatusIdx: index('mail_campaign_recipients_campaign_status_idx').on(t.campaignId, t.status),
  campaignEmailUnique: uniqueIndex('mail_campaign_recipients_campaign_email_unique').on(t.campaignId, t.email),
  unsubscribeTokenUnique: uniqueIndex('mail_campaign_recipients_unsubscribe_token_unique').on(t.unsubscribeToken),
}));

export const mailSuppressions = pgTable('mail_suppressions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 320 }).notNull(),
  reason: varchar('reason', { length: 255 }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ tenantEmailUnique: uniqueIndex('mail_suppressions_tenant_email_unique').on(t.tenantId, t.email) }));
