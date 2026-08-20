import { pgTable, uuid, varchar, boolean, index } from 'drizzle-orm/pg-core';
import { auditColumns } from './_helpers';
import { tenants, divisions } from './tenants';
import { users } from './users';
import { files } from './files';

/**
 * Belge imzası: teklif/proforma/sözleşme çıktısının altına basılan
 * ad + ünvan + (opsiyonel) imza görseli.
 *
 * Görsel `erp-signatures` bucket'ında `visibility='public'` olarak durur; PDF
 * penceresi auth çerezi taşımadığı için `/signatures/media/:fileId` ucundan
 * auth'suz sunulur (bkz. signature-media.service.ts).
 *
 * Kayıt yumuşak silinir: imza sonradan silinse/değişse bile geçmiş belgeler
 * kendi `document_snapshot`'larındaki imzayı basmaya devam eder.
 */
export const signatures = pgTable(
  'signatures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** NULL = "Tümü" (bölüm ayrımı yok); dolu ise yalnızca o bölümün belgelerinde seçilebilir. */
    divisionId: uuid('division_id').references(() => divisions.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    /** Opsiyonel imza görseli; yoksa çıktıda yalnız ad + ünvan basılır. */
    fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...auditColumns,
  },
  (t) => ({
    tenantIdx: index('signatures_tenant_idx').on(t.tenantId),
    tenantDivisionIdx: index('signatures_tenant_division_idx').on(t.tenantId, t.divisionId),
    fileIdx: index('signatures_file_idx').on(t.fileId),
  })
);
