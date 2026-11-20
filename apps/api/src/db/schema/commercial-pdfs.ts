import { pgTable, uuid, varchar, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';
import { files } from './files';

/** Immutable generated artifacts. Uploaded/signed source files retain their own fileId. */
export const commercialPdfs = pgTable('commercial_pdfs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  kind: varchar('kind', { length: 16 }).notNull(),
  documentId: uuid('document_id').notNull(),
  sourceHash: varchar('source_hash', { length: 64 }).notNull(),
  templateVersion: varchar('template_version', { length: 32 }).notNull(),
  fileId: uuid('file_id').notNull().references(() => files.id, { onDelete: 'restrict' }),
  snapshot: jsonb('snapshot').notNull(),
  generatedBy: uuid('generated_by').notNull().references(() => users.id),
  selectedAt: timestamp('selected_at', { withTimezone: true }).notNull().defaultNow(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  versionUnique: uniqueIndex('commercial_pdfs_version_unique').on(t.tenantId, t.kind, t.documentId, t.sourceHash, t.templateVersion),
  documentIdx: index('commercial_pdfs_document_idx').on(t.tenantId, t.kind, t.documentId, t.generatedAt),
}));
