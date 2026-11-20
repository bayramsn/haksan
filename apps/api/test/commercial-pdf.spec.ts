import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/modules/quotes/commercial-pdf-render', () => ({ renderCommercialHtml: vi.fn(async () => '<html>canonical</html>') }));
import { CommercialPdfService, commercialSourceHash } from '../src/modules/quotes/commercial-pdf.service';
import { renderCommercialHtml } from '../src/modules/quotes/commercial-pdf-render';
import type { AuthContext } from '../src/shared/security/auth.types';

const actor = { tenantId: 'tenant-a', userId: 'user-a', roles: [], permissions: new Set(['proformas.read', 'proformas.update']) } as unknown as AuthContext;
const snapshot = { quote: { subtotal: '120' }, company: { legalTitle: 'Şahintek' }, items: [{ quantity: 1 }], capturedAt: '2026-01-01' };
const document = { id: 'document-a', documentNo: 'PF-1', documentSnapshot: snapshot, updatedAt: '2026-01-01' };
function setup() {
  const artifact = { id: 'artifact-a', tenantId: actor.tenantId, sourceHash: commercialSourceHash({ ...snapshot, sourceHeader: { id: document.id, documentNo: document.documentNo, updatedAt: document.updatedAt } }), templateVersion: 'web-2026-10-v1:default', fileId: 'file-a', generatedAt: new Date('2026-10-22') };
  const artifactQuery = vi.fn(async () => artifact as any);
  const fileQuery = vi.fn(async () => ({ id: 'file-a', bucket: 'private', objectKey: 'key-a', originalFilename: 'PF-1.pdf' }));
  const txQuery = vi.fn(async () => null as any);
  const fileInsert = vi.fn(async () => [{ id: 'new-file' }]);
  const artifactInsert = vi.fn(async () => undefined);
  let insertCount = 0;
  const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) }));
  const tx = { execute: vi.fn(async () => undefined), query: { commercialPdfs: { findFirst: txQuery } }, update, insert: vi.fn(() => ({ values: vi.fn(() => ++insertCount === 1 ? { returning: fileInsert } : artifactInsert()) })) };
  const db = { query: { commercialPdfs: { findFirst: artifactQuery }, files: { findFirst: fileQuery } }, transaction: vi.fn(async (fn) => fn(tx)) };
  const quotes = { getProforma: vi.fn(async () => document), get: vi.fn(), getContract: vi.fn() };
  const storage = { getObject: vi.fn(async () => Buffer.from('%PDF-saved')), uploadFile: vi.fn(async () => undefined), deleteFile: vi.fn(async () => undefined), buildKey: vi.fn(() => 'unique-key'), calculateChecksum: vi.fn(() => 'checksum') };
  const renderer = { isAvailable: vi.fn(() => true), render: vi.fn(async () => Buffer.from('%PDF-new')) };
  const audit = { write: vi.fn(async () => undefined) };
  const service = new CommercialPdfService(db as any, quotes as any, storage as any, renderer as any, audit as any);
  return { service, artifact, artifactQuery, txQuery, fileInsert, artifactInsert, tx, db, quotes, storage, renderer };
}
beforeEach(() => vi.clearAllMocks());
describe('persistent commercial PDF', () => {
  it('hash ignores capture clock and object key order, but detects changed amounts', () => {
    expect(commercialSourceHash({ capturedAt: 'a', z: 1, a: { x: 2 } })).toBe(commercialSourceHash({ a: { x: 2 }, z: 1, capturedAt: 'b' }));
    expect(commercialSourceHash({ total: 1 })).not.toBe(commercialSourceHash({ total: 2 }));
  });
  it('GET returns exact saved bytes without rendering, uploading or mutating', async () => {
    const x = setup();
    expect(await x.service.status('proforma', 'document-a', actor)).toMatchObject({ revision: x.artifact.sourceHash, documentRevision: x.artifact.sourceHash });
    expect(await x.service.read('proforma', 'document-a', { ...actor, permissions: new Set(['proformas.read']) })).toEqual({ buffer: Buffer.from('%PDF-saved'), filename: 'PF-1.pdf' });
    expect(x.renderer.render).not.toHaveBeenCalled(); expect(x.db.transaction).not.toHaveBeenCalled();
  });
  it('missing and outdated GETs never generate files', async () => {
    const x = setup(); x.artifactQuery.mockResolvedValueOnce(undefined);
    await expect(x.service.read('proforma', 'document-a', actor)).rejects.toMatchObject({ code: 'PDF_NOT_PREPARED', statusCode: 409 });
    x.artifact.sourceHash = 'old';
    await expect(x.service.read('proforma', 'document-a', actor)).rejects.toMatchObject({ code: 'PDF_OUTDATED' });
    expect(x.renderer.render).not.toHaveBeenCalled();
  });
  it('read permission alone cannot prepare; other tenants cannot bypass document lookup', async () => {
    const x = setup();
    await expect(x.service.prepare('proforma', 'document-a', { ...actor, permissions: new Set(['proformas.read']) })).rejects.toMatchObject({ statusCode: 403 });
    x.quotes.getProforma.mockRejectedValueOnce(Object.assign(new Error('not found'), { statusCode: 404 }));
    await expect(x.service.read('proforma', 'document-a', { ...actor, tenantId: 'tenant-b' })).rejects.toMatchObject({ statusCode: 404 });
    expect(x.storage.getObject).not.toHaveBeenCalled();
  });
  it('idempotent preparation takes a database lock and reuses stored artifact', async () => {
    const x = setup(); x.txQuery.mockResolvedValueOnce(x.artifact);
    await x.service.prepare('proforma', 'document-a', actor);
    expect(x.tx.execute).toHaveBeenCalledTimes(1); expect(x.tx.update).toHaveBeenCalledTimes(1);
    expect(x.renderer.render).not.toHaveBeenCalled(); expect(x.storage.uploadFile).not.toHaveBeenCalled();
  });
  it('failed rendering leaves prior artifact and signed upload metadata untouched', async () => {
    const x = setup(); x.renderer.render.mockRejectedValueOnce(new Error('Chromium failed'));
    await expect(x.service.prepare('proforma', 'document-a', actor)).rejects.toThrow('Chromium failed');
    expect(x.tx.insert).not.toHaveBeenCalled(); expect(x.tx.update).not.toHaveBeenCalled(); expect(x.storage.uploadFile).not.toHaveBeenCalled();
    expect(x.quotes.getProforma).toHaveBeenCalled();
  });
  it('stores a new immutable file only after canonical rendering and rechecks source', async () => {
    const x = setup(); await x.service.prepare('proforma', 'document-a', actor);
    expect(renderCommercialHtml).toHaveBeenCalledWith('proforma', document, snapshot, undefined);
    expect(x.quotes.getProforma.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(x.storage.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ body: Buffer.from('%PDF-new'), mimeType: 'application/pdf' }));
    expect(x.tx.insert).toHaveBeenCalledTimes(2);
  });
  it('storage cleanup occurs when metadata persistence fails', async () => {
    const x = setup(); x.fileInsert.mockRejectedValueOnce(new Error('db failure'));
    await expect(x.service.prepare('proforma', 'document-a', actor)).rejects.toThrow('db failure');
    expect(x.storage.deleteFile).toHaveBeenCalledWith('erp-quote-documents', 'unique-key');
  });
});
