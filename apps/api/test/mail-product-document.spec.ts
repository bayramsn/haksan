import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { mailSendSchema, MAIL_MAX_ATTACHMENT_BYTES } from '../../../packages/shared/src/schemas/mail';
import { MailController } from '../src/modules/mail/mail.controller';
import type { AuthContext } from '../src/shared/security/auth.types';

const id = '00000000-0000-4000-8000-000000000001';
const tenant = '00000000-0000-4000-8000-000000000002';
const division = '00000000-0000-4000-8000-000000000003';
const base = { to: 'customer@example.com', subject: 'Teknik föy', body: 'Ekte bulabilirsiniz.' };
const productDocument = { id, pdf: { html: '<main>Teknik bilgiler</main>', filename: 'teknik-foy.pdf' } };
const actor = { tenantId: tenant, userId: id, permissions: new Set(['products.read']), roles: [], divisionIds: [division], activeDivisionId: division, canViewAllDivisions: false, activeDepartmentId: null, accessScopes: [] } as unknown as AuthContext;

function fixture(rows: unknown[] = [{ id }]) {
  const where = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) });
  const db = { select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ leftJoin: vi.fn().mockReturnValue({ where }) }) }) };
  const send = vi.fn().mockResolvedValue({ sentAt: new Date('2026-10-15T09:00:00Z'), messageId: 'sent' });
  const render = vi.fn().mockResolvedValue(Buffer.from('%PDF-test'));
  const isAvailable = vi.fn().mockReturnValue(true);
  const readForAttachment = vi.fn().mockResolvedValue({ filename: 'katalog.pdf', mimeType: 'application/pdf', content: Buffer.from('catalog') });
  const controller = new MailController(db as never, { send } as never, {} as never, {} as never, { render, isAvailable } as never, { readForAttachment } as never);
  return { controller, db, where, send, render, isAvailable, readForAttachment };
}

describe('Product technical document mail', () => {
  it('accepts a product PDF with normal uploaded file attachments and rejects malformed identifiers/filenames', () => {
    expect(mailSendSchema.safeParse({ ...base, productDocument, fileIds: [id] }).success).toBe(true);
    expect(mailSendSchema.safeParse({ ...base, productDocument: { ...productDocument, id: 'bad' } }).success).toBe(false);
    expect(mailSendSchema.safeParse({ ...base, productDocument: { id, pdf: { ...productDocument.pdf, filename: '../x.pdf' } } }).success).toBe(false);
  });
  it('rejects every competing generated attachment and orphan quote HTML', () => {
    for (const extra of [{ quoteId: id }, { reportDocument: productDocument.pdf }, { document: { id, kind: 'contract', pdf: productDocument.pdf } }]) {
      expect(mailSendSchema.safeParse({ ...base, productDocument, ...extra }).success).toBe(false);
    }
    expect(mailSendSchema.safeParse({ ...base, productDocument, quoteDocument: productDocument.pdf }).success).toBe(false);
  });
  it('requires product read permission before database access, PDF rendering or mail sending', async () => {
    const f = fixture();
    await expect(f.controller.send({ ...base, productDocument }, { ...actor, permissions: new Set() })).rejects.toThrow('products.read');
    expect(f.db.select).not.toHaveBeenCalled();
    expect(f.render).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });
  it('filters the product by tenant, deleted status and authorized product division before rendering', async () => {
    const f = fixture();
    await f.controller.send({ ...base, productDocument }, actor);
    const query = new PgDialect().sqlToQuery(f.where.mock.calls[0][0]);
    expect(query.params).toEqual([id, tenant, division]);
    expect(query.sql).toContain('"product_models"."deleted_at" is null');
    expect(query.sql).toContain('"product_groups"."division_id" in');
    expect(f.render).toHaveBeenCalledWith(productDocument.pdf.html);
    expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ attachments: [expect.objectContaining({ filename: 'teknik-foy.pdf', contentType: 'application/pdf' })] }), actor);
  });
  it('rejects missing, deleted or inaccessible products before rendering/sending', async () => {
    const f = fixture([]);
    await expect(f.controller.send({ ...base, productDocument }, actor)).rejects.toThrow('Ürün');
    expect(f.render).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });
  it('returns unavailable when the PDF runtime is missing without sending mail', async () => {
    const f = fixture();
    f.isAvailable.mockReturnValue(false);
    await expect(f.controller.send({ ...base, productDocument }, actor)).rejects.toThrow('Chromium');
    expect(f.send).not.toHaveBeenCalled();
  });
  it('applies the shared aggregate attachment size cap to generated PDF plus uploaded catalog', async () => {
    const f = fixture();
    f.readForAttachment.mockResolvedValue({ filename: 'katalog.pdf', mimeType: 'application/pdf', content: Buffer.alloc(MAIL_MAX_ATTACHMENT_BYTES) });
    await expect(f.controller.send({ ...base, productDocument, fileIds: [id] }, actor)).rejects.toThrow('sınırını');
    expect(f.send).not.toHaveBeenCalled();
  });
});
