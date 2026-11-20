import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { createHash } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { HtmlPdfService } from '../src/shared/pdf/html-pdf.service';
import { MailController } from '../src/modules/mail/mail.controller';
import type { AuthContext } from '../src/shared/security/auth.types';

/** Real database, object storage, guards and Chromium; no document mocks. */
describe.skipIf(process.env.RUN_STORAGE_INTEGRATION !== 'true' || !HtmlPdfService.executablePath())('stored commercial PDF HTTP lifecycle', () => {
  let app: NestFastifyApplication;
  let token: string;
  let divisionId: string;
  let actor: AuthContext;
  const api = () => supertest(app.getHttpServer());
  const digest = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
  const pdf = (collection: string, id: string) => api().get(`/api/v1/${collection}/${id}/pdf`)
    .set('Authorization', `Bearer ${token}`).buffer(true).parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
      res.on('error', callback);
    });
  beforeAll(async () => {
    app = await createTestApp();
    const login = await api().post('/api/v1/auth/login').send({ email: 'superadmin@haksan.local', password: 'superadmin12345' }).expect(201);
    token = login.body.accessToken;
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    divisionId = me.body.user.divisions[0]?.id;
    expect(divisionId).toBeTruthy();
    actor = { userId: me.body.user.id, tenantId: me.body.user.tenantId, email: me.body.user.email,
      roles: ['super_admin'], permissions: new Set(me.body.user.permissions),
      divisionIds: me.body.user.divisions.map((division: { id: string }) => division.id), primaryDivisionId: divisionId,
      departmentIds: [], primaryDepartmentId: null, canViewAllDivisions: true,
      activeDivisionId: null, activeDepartmentId: null, accessScopes: [] };
  });
  afterAll(async () => app?.close());

  it.each(['proformas', 'contracts'])('%s preserves stored bytes, versions and prior artifacts', async (collection) => {
    const timestamp = new Date().toISOString();
    const payload = { divisionId, companyName: 'Şahintek Işık Makina', companyAddress: 'Organize Sanayi Nilüfer Bursa',
      companyTaxOffice: 'Nilüfer', companyTaxNumber: '1234567890', contactPhone: '02240000000',
      currencyCode: 'USD', issueDate: timestamp, signedDate: timestamp,
      items: [{ description: 'MV-850 İşleme Merkezi', quantity: 1, unitPrice: 1000, vatRate: 20, discountAmount: 0 }] };
    const created = await api().post(`/api/v1/${collection}/standalone`).set('Authorization', `Bearer ${token}`).send(payload);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id;
    const status = () => api().get(`/api/v1/${collection}/${id}/pdf/status`).set('Authorization', `Bearer ${token}`);
    const assertSummary = async (expected: string, fileId?: string) => {
      const detail = await api().get(`/api/v1/${collection}/${id}`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(detail.body.pdf.status).toBe(expected);
      if (fileId) expect(detail.body.pdf.fileId).toBe(fileId);
      const list = await api().get(`/api/v1/${collection}`).query({ search: created.body.documentNo ?? created.body.contractNo })
        .set('Authorization', `Bearer ${token}`).expect(200);
      expect(list.body.data.find((row: { id: string }) => row.id === id)?.pdf.status).toBe(expected);
    };
    const prepare = () => api().post(`/api/v1/${collection}/${id}/pdf`).set('Authorization', `Bearer ${token}`).send({});
    expect((await status().expect(200)).body.status).toBe('missing');
    await assertSummary('missing');
    const missing = await api().get(`/api/v1/${collection}/${id}/pdf`).set('Authorization', `Bearer ${token}`).expect(409);
    expect(missing.body.error.code).toBe('PDF_NOT_PREPARED');
    const [first, concurrent] = await Promise.all([prepare(), prepare()]);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(concurrent.status, JSON.stringify(concurrent.body)).toBe(201);
    expect(concurrent.body.fileId).toBe(first.body.fileId);
    expect(first.body.status).toBe('ready');
    await assertSummary('ready', first.body.fileId);
    const firstBytes = await pdf(collection, id).expect(200).expect('Content-Type', /application\/pdf/);
    expect((firstBytes.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const secondBytes = await pdf(collection, id).expect(200);
    expect(digest(secondBytes.body)).toBe(digest(firstBytes.body));
    const mail = app.get(MailController) as unknown as {
      documentAttachment(document: { kind: string; id: string }, actor: AuthContext): Promise<{ content: Buffer }>;
    };
    const attachment = await mail.documentAttachment({ kind: collection === 'contracts' ? 'contract' : 'proforma', id }, actor);
    expect(digest(attachment.content)).toBe(digest(firstBytes.body));
    const duplicate = await prepare().expect(201);
    expect(duplicate.body.fileId).toBe(first.body.fileId);
    const changed = await api().patch(`/api/v1/${collection}/standalone/${id}`).set('Authorization', `Bearer ${token}`)
      .send({ items: [{ ...payload.items[0], unitPrice: 1500 }] });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect((await status().expect(200)).body.status).toBe('outdated');
    await assertSummary('outdated', first.body.fileId);
    const outdated = await api().get(`/api/v1/${collection}/${id}/pdf`).set('Authorization', `Bearer ${token}`).expect(409);
    expect(outdated.body.error.code).toBe('PDF_OUTDATED');
    const refreshed = await prepare().expect(201);
    expect(refreshed.body.fileId).not.toBe(first.body.fileId);
    expect(refreshed.body.documentRevision).not.toBe(first.body.documentRevision);
    // Finalizing is a web action and must lock edits without losing the signed attachment role.
    const finalized = await api().patch(`/api/v1/${collection}/standalone/${id}`).set('Authorization', `Bearer ${token}`)
      .send({ statusCode: collection === 'contracts' ? 'signed' : 'sent' });
    expect(finalized.status, JSON.stringify(finalized.body)).toBe(200);
    expect(finalized.body.fileId ?? null).toBeNull();
    expect(finalized.body.finalizedAt).toBeTruthy();
    await api().patch(`/api/v1/${collection}/standalone/${id}`).set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Must not modify finalized document' }).expect(409);
  }, 60_000);
});
