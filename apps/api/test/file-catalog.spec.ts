import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { signedUploadUrlSchema } from '../../../packages/shared/src/schemas/file';
import { MAIL_MAX_ATTACHMENT_BYTES } from '../../../packages/shared/src/schemas/mail';
import { FilesService } from '../src/modules/files/files.service';
import type { AuthContext } from '../src/shared/security/auth.types';

vi.mock('../src/config/env', () => ({ loadEnv: () => ({ S3_PROVIDER: 's3', API_PREFIX: '/api/v1', SIGNED_URL_EXPIRE_SECONDS: 300 }) }));
const tenant = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
const fileId = '00000000-0000-4000-8000-000000000003';
const foreignTenant = '00000000-0000-4000-8000-000000000004';
// Katalog yalnız mail eki olarak gider; sınırı mailin toplam ek sınırıdır.
const maxBytes = MAIL_MAX_ATTACHMENT_BYTES;
const upload = { entityType: 'catalog' as const, entityId: tenant, bucket: 'erp-quote-documents' as const, filename: 'Genel Katalog.pdf', mimeType: 'application/pdf' as const, extension: 'pdf' as const, sizeBytes: maxBytes };
const actor = { tenantId: tenant, userId: user, roles: [], permissions: new Set(['products.read', 'products.update']) } as unknown as AuthContext;
const catalogFile = { id: fileId, tenantId: tenant, uploadedBy: user, deletedAt: null, uploadStatus: 'uploaded', visibility: 'private', bucket: upload.bucket, originalFilename: upload.filename, objectKey: 'private/catalog.pdf', mimeType: upload.mimeType, extension: upload.extension, sizeBytes: 1000 };
function fixture(file: object = catalogFile, linkTenant = tenant) {
  const findFile = vi.fn().mockResolvedValue(file);
  const values = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: fileId }]) });
  const where = vi.fn().mockResolvedValue([{ entityType: 'catalog', entityId: linkTenant }]);
  const db = { query: { files: { findFirst: findFile }, storageProviders: { findFirst: vi.fn().mockResolvedValue({ id: fileId }) } }, insert: vi.fn().mockReturnValue({ values }), transaction: vi.fn(), select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where }) }) };
  const storage = { validateUploadIntent: vi.fn(), buildKey: vi.fn().mockReturnValue('private/catalog.pdf'), getObject: vi.fn().mockResolvedValue(Buffer.from('%PDF-test')) };
  const service = new FilesService(db as never, storage as never, { write: vi.fn().mockResolvedValue(undefined) } as never);
  return { service, db, storage, findFile, values };
}

describe('General catalog file boundary', () => {
  it('accepts PDF at the mail attachment boundary', () => {
    expect(signedUploadUrlSchema.safeParse(upload).success).toBe(true);
  });
  it.each([
    { sizeBytes: maxBytes + 1 }, { mimeType: 'image/png' }, { extension: 'docx' }, { bucket: 'erp-product-images' }, { entityId: 'new' },
  ])('rejects invalid catalog upload intent %j', (change) => {
    expect(signedUploadUrlSchema.safeParse({ ...upload, ...change }).success).toBe(false);
  });
  it('requires update permission to upload even when read permission is granted', async () => {
    const f = fixture();
    await expect(f.service.createSignedUploadUrl(upload, { ...actor, permissions: new Set(['products.read']) })).rejects.toThrow('düzenleme');
    expect(f.db.insert).not.toHaveBeenCalled();
    expect(f.storage.buildKey).not.toHaveBeenCalled();
  });
  it('denies other tenant catalog targets even to super admins before registering a file', async () => {
    const f = fixture();
    await expect(f.service.createSignedUploadUrl({ ...upload, entityId: foreignTenant }, { ...actor, roles: ['super_admin'] })).rejects.toThrow('erişim');
    expect(f.db.insert).not.toHaveBeenCalled();
  });
  it('registers an authorized tenant catalog as a private file without writing product records', async () => {
    const f = fixture();
    await expect(f.service.createSignedUploadUrl(upload, actor)).resolves.toMatchObject({ fileId });
    expect(f.values).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant, visibility: 'private', uploadedBy: user }));
    expect(f.storage.buildKey).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant, entityType: 'catalog', entityId: tenant }));
  });
  it.each([{ sizeBytes: maxBytes + 1 }, { mimeType: 'image/png' }, { extension: 'docx' }, { bucket: 'erp-product-images' }])('revalidates stored file metadata before catalog linking %j', async (change) => {
    const f = fixture({ ...catalogFile, ...change });
    await expect(f.service.linkFile({ fileId, entityType: 'catalog', entityId: tenant, documentTypeCode: 'other' }, actor)).rejects.toThrow('PDF');
    expect(f.db.transaction).not.toHaveBeenCalled();
  });
  it('blocks linking a catalog without write permission and blocks moving it to a foreign tenant', async () => {
    for (const [target, identity] of [[tenant, { ...actor, permissions: new Set(['products.read']) }], [foreignTenant, actor]] as const) {
      const f = fixture();
      await expect(f.service.linkFile({ fileId, entityType: 'catalog', entityId: target, documentTypeCode: 'other' }, identity)).rejects.toThrow();
      expect(f.db.transaction).not.toHaveBeenCalled();
    }
  });
  it('allows product readers to read the catalog for mail, while checking file tenant SQL scope', async () => {
    const f = fixture({ ...catalogFile, uploadStatus: 'linked', uploadedBy: 'other-user' });
    await expect(f.service.readForAttachment(fileId, { ...actor, permissions: new Set(['products.read']) })).resolves.toMatchObject({ filename: upload.filename });
    const query = new PgDialect().sqlToQuery(f.findFile.mock.calls[0][0].where);
    expect(query.params).toEqual([fileId, tenant]);
    expect(f.storage.getObject).toHaveBeenCalledTimes(1);
  });
  it('blocks catalog mail attachments for users without read permission, including the uploader', async () => {
    const f = fixture({ ...catalogFile, uploadStatus: 'linked' });
    await expect(f.service.readForAttachment(fileId, { ...actor, permissions: new Set() })).rejects.toThrow('erişim');
    expect(f.storage.getObject).not.toHaveBeenCalled();
  });
  it('blocks mail reads of a catalog linked to a different tenant', async () => {
    const f = fixture({ ...catalogFile, uploadStatus: 'linked' }, foreignTenant);
    await expect(f.service.readForAttachment(fileId, actor)).rejects.toThrow('erişim');
    expect(f.storage.getObject).not.toHaveBeenCalled();
  });
});
