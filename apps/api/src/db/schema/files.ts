import { pgTable, uuid, varchar, text, bigint, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditColumns } from './_helpers';
import { tenants } from './tenants';
import { users } from './users';
import { fileDocumentTypes, storageProviders } from './lookup';

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    bucket: varchar('bucket', { length: 128 }).notNull(),
    objectKey: varchar('object_key', { length: 1024 }).notNull(),
    originalFilename: varchar('original_filename', { length: 512 }).notNull(),
    mimeType: varchar('mime_type', { length: 128 }).notNull(),
    extension: varchar('extension', { length: 16 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: varchar('sha256', { length: 64 }),
    storageProviderId: uuid('storage_provider_id').references(() => storageProviders.id),
    visibility: varchar('visibility', { length: 16 }).notNull().default('private'),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    ...auditColumns,
  },
  (t) => ({
    objectKeyUnique: uniqueIndex('files_object_key_unique').on(t.bucket, t.objectKey),
    tenantIdx: index('files_tenant_idx').on(t.tenantId),
  })
);

export const fileLinks = pgTable(
  'file_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    documentTypeId: uuid('document_type_id').references(() => fileDocumentTypes.id),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index('file_links_entity_idx').on(t.entityType, t.entityId),
  })
);
