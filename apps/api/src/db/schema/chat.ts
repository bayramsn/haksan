import { pgTable, uuid, varchar, text, boolean, timestamp, index, uniqueIndex, primaryKey, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { auditColumns } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';
import { files } from './files';

/**
 * Kurum içi sohbet (WhatsApp benzeri). İki konuşma türü:
 *  - 'dm'    : iki çalışan arası özel mesaj. `dmKey` ile tekilleştirilir.
 *  - 'group' : süper admin tarafından kurulan grup. `onlyAdminsCanPost` ile
 *              "yalnız yöneticiler yazabilir" (duyuru) modu açılır.
 * Hepsi tenant-scoped.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 16 }).notNull(), // 'dm' | 'group'
    title: varchar('title', { length: 255 }),
    description: text('description'),
    avatarFileId: uuid('avatar_file_id').references(() => files.id, { onDelete: 'set null' }),
    onlyAdminsCanPost: boolean('only_admins_can_post').notNull().default(true),
    // İki kullanıcının sıralı id'lerinden üretilen anahtar (örn "uuidA:uuidB").
    // Grup konuşmalarında NULL — Postgres unique index'te NULL'lar ayrı sayıldığı
    // için aynı index hem "çift başına tek DM" hem "sınırsız grup" sağlar.
    dmKey: varchar('dm_key', { length: 73 }),
    // Bir CRM kaydına bağlı grup (örn. servis talebi/satış kartı sohbeti). Opsiyonel.
    refType: varchar('ref_type', { length: 32 }),
    refId: uuid('ref_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('conversations_tenant_idx').on(t.tenantId),
    dmUnique: uniqueIndex('conversations_tenant_dm_unique').on(t.tenantId, t.dmKey),
  })
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull().default('member'), // 'admin' | 'member'
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.conversationId, t.userId] }),
    userIdx: index('conversation_members_user_idx').on(t.userId),
  })
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body'), // yalnız-ek mesajda null olabilir
    // 'text' | 'system' | 'voice' — system mesajları otomatik bildirimler içindir.
    kind: varchar('kind', { length: 16 }).notNull().default('text'),
    // Yanıtlanan mesaj (alıntı). Mesaj silinirse alıntı bağı kopar.
    replyToId: uuid('reply_to_id').references((): AnyPgColumn => chatMessages.id, { onDelete: 'set null' }),
    // Mesaja iliştirilen CRM kaydı kartı (teklif/firma/servis talebi/fırsat).
    refType: varchar('ref_type', { length: 32 }),
    refId: uuid('ref_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    convCreatedIdx: index('chat_messages_conv_created_idx').on(t.conversationId, t.createdAt),
  })
);

/** Mesaj başına emoji tepkileri (her kullanıcı bir emojiyi bir kez). */
export const chatMessageReactions = pgTable(
  'chat_message_reactions',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.messageId, t.userId, t.emoji] }),
    messageIdx: index('chat_message_reactions_message_idx').on(t.messageId),
  })
);
