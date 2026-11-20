import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { CommercialPdfService } from '../src/modules/quotes/commercial-pdf.service';
import type { AuthContext } from '../src/shared/security/auth.types';
import { createTestApp } from './setup';
import { getDb } from '../src/db/client';
import * as schema from '../src/db/schema';

let app: NestFastifyApplication;
let token: string;
let quoteId: string;
let lineId: string;
let companyId: string;
let opportunityId: string;
let contactId: string;
let addressId: string;
let divisionId: string;
let userId: string;
let tenantId: string;
const db = getDb();
const auth = () => ({ Authorization: `Bearer ${token}` });
const line = (description = 'CNC draft integration', unitPrice = 1000) => ({ description, unitPrice, quantity: 2, discountAmount: 0, vatRate: 20, unitCode: 'adet' });
const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'admin@haksan.local', password: 'admin12345' });
  expect(login.status, JSON.stringify(login.body)).toBe(201);
  token = login.body.accessToken;
  userId = login.body.user.id;
  const me = await supertest(app.getHttpServer()).get('/api/v1/auth/me').set(auth());
  tenantId = me.body.tenant.id;
  const division = await db.query.divisions.findFirst({ where: and(eq(schema.divisions.tenantId, tenantId), eq(schema.divisions.code, 'cnc')) });
  if (!division) throw new Error('Seed CNC division is required');
  divisionId = division.id;
  companyId = randomUUID(); contactId = randomUUID(); addressId = randomUUID(); opportunityId = randomUUID();
  await db.insert(schema.companies).values({ id: companyId, tenantId, legalTitle: `Draft integration ${companyId}`, sector: 'Metal', createdBy: userId });
  await db.insert(schema.companyAddresses).values({ id: addressId, tenantId, companyId, province: 'İstanbul', district: 'Tuzla', fullAddress: 'Test Sanayi Caddesi 1', isDefault: true, isBilling: true });
  await db.insert(schema.companyPhones).values({ tenantId, companyId, phone: '+902120000001', isDefault: true });
  await db.insert(schema.companyEmails).values({ tenantId, companyId, email: 'draft@example.test', isDefault: true });
  await db.insert(schema.contacts).values({ id: contactId, tenantId, companyId, fullName: 'Draft Yetkilisi', mobilePhone: '+905550000001', workEmail: 'contact@example.test' });
  const stage = await db.query.pipelineStages.findFirst({ where: eq(schema.pipelineStages.code, 'lead') });
  if (!stage) throw new Error('Seed lead stage is required');
  await db.insert(schema.opportunities).values({ id: opportunityId, tenantId, companyId, divisionId, primaryContactId: contactId, ownerUserId: userId, title: 'CNC purchase draft integration', requestedMachine: 'VM-2', paymentMethod: 'cash', currentStageId: stage.id, qualificationStage: 'lead', createdBy: userId });
  await db.insert(schema.calls).values({ tenantId, companyId, opportunityId, contactId, callDate: new Date(), callResult: 'İhtiyaç görüşüldü', createdBy: userId });
  const readiness = await supertest(app.getHttpServer()).get(`/api/v1/opportunities/${opportunityId}/quote-readiness`).set(auth());
  expect(readiness.status, JSON.stringify(readiness.body)).toBe(200);
  expect(readiness.body.ready, JSON.stringify(readiness.body.blockers)).toBe(true);
});
afterAll(async () => { await app?.close(); });

describe('mobile commercial draft against real Postgres', () => {
  it('creates a complete draft atomically with canonical server totals', async () => {
    const response = await supertest(app.getHttpServer()).post('/api/v1/quotes/draft').set(auth()).send({ opportunityId, companyId, companyAddressId: addressId, contactId, divisionId, quoteDate: '2026-10-22', currencyCode: 'USD', terms: { paymentTermsText: 'Original payment', deliveryTermsText: 'Original delivery', vatIncluded: true, importCostsExcluded: false }, items: [line()] });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    quoteId = response.body.id; lineId = response.body.items[0].id;
    expect(response.body.finalizedAt).toBeNull();
    expect(Number(response.body.grandTotal)).toBe(2400);
  });
  it('updates header and lines together without replacing retained line identity', async () => {
    const response = await supertest(app.getHttpServer()).patch(`/api/v1/quotes/${quoteId}/draft`).set(auth()).send({ notes: 'Updated together', terms: { paymentTermsText: 'Updated payment' }, items: [{ ...line('Edited CNC', 1100), id: lineId }] });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.notes).toBe('Updated together');
    expect(response.body.terms).toMatchObject({ paymentTermsText: 'Updated payment', deliveryTermsText: 'Original delivery', vatIncluded: true, importCostsExcluded: false });
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([lineId]);
    expect(Number(response.body.grandTotal)).toBe(2640);
  });
  it('rolls header and first line back if a later line fails catalog validation', async () => {
    const response = await supertest(app.getHttpServer()).patch(`/api/v1/quotes/${quoteId}/draft`).set(auth()).send({ notes: 'MUST ROLLBACK', items: [{ ...line('MUST ROLLBACK', 1200), id: lineId }, { ...line(), productModelId: randomUUID() }] });
    expect([404, 422]).toContain(response.status);
    const persisted = await supertest(app.getHttpServer()).get(`/api/v1/quotes/${quoteId}`).set(auth());
    expect(persisted.body.notes).toBe('Updated together');
    expect(persisted.body.items).toHaveLength(1);
    expect(persisted.body.items[0].description).toBe('Edited CNC');
    expect(Number(persisted.body.grandTotal)).toBe(2640);
  });
  it('refuses foreign or repeated line identities before changing the draft', async () => {
    for (const items of [[{ ...line(), id: randomUUID() }], [{ ...line(), id: lineId }, { ...line(), id: lineId }]]) {
      const response = await supertest(app.getHttpServer()).patch(`/api/v1/quotes/${quoteId}/draft`).set(auth()).send({ notes: 'BAD IDS', items });
      expect([409, 422]).toContain(response.status);
    }
  });
  it('never generates on GET; web preparation is persistent and repeated GET bytes match', async () => {
    const missing = await supertest(app.getHttpServer()).get(`/api/v1/quotes/${quoteId}/pdf`).set(auth());
    expect(missing.status).toBe(409); expect(missing.body.error.code).toBe('PDF_NOT_PREPARED');
    const prepared = await supertest(app.getHttpServer()).post(`/api/v1/quotes/${quoteId}/pdf`).set(auth()).send({});
    expect(prepared.status, JSON.stringify(prepared.body)).toBe(201);
    const first = await supertest(app.getHttpServer()).get(`/api/v1/quotes/${quoteId}/pdf`).set(auth());
    const second = await supertest(app.getHttpServer()).get(`/api/v1/quotes/${quoteId}/pdf`).set(auth());
    expect(first.status).toBe(200); expect(first.headers['content-type']).toContain('application/pdf');
    expect(hash(first.body)).toBe(hash(second.body));
    const oldStatus = await supertest(app.getHttpServer()).get(`/api/v1/quotes/${quoteId}/pdf/status`).set(auth());
    expect(oldStatus.body.status).toBe('ready');
    const update = await supertest(app.getHttpServer()).patch(`/api/v1/quotes/${quoteId}/draft`).set(auth()).send({ notes: 'PDF changed', items: [{ ...line('Edited CNC', 1300), id: lineId }] });
    expect(update.status).toBe(200);
    const stale = await supertest(app.getHttpServer()).get(`/api/v1/quotes/${quoteId}/pdf/status`).set(auth());
    expect(stale.body.status).toBe('outdated');
    const blocked = await supertest(app.getHttpServer()).get(`/api/v1/quotes/${quoteId}/pdf`).set(auth());
    expect(blocked.status).toBe(409); expect(blocked.body.error.code).toBe('PDF_OUTDATED');
    const next = await supertest(app.getHttpServer()).post(`/api/v1/quotes/${quoteId}/pdf`).set(auth()).send({});
    expect(next.status, JSON.stringify(next.body)).toBe(201);
    const third = await supertest(app.getHttpServer()).get(`/api/v1/quotes/${quoteId}/pdf`).set(auth());
    expect(third.status).toBe(200); expect(hash(third.body)).not.toBe(hash(first.body));
  });
  it('applies the database tenant boundary even for an actor holding quote read permission', async () => {
    const otherTenantActor: AuthContext = { tenantId: randomUUID(), userId, email: 'other@example.test', roles: ['admin'], permissions: new Set(['quotes.read']), divisionIds: [], departmentIds: [], primaryDivisionId: null, primaryDepartmentId: null, activeDivisionId: null, activeDepartmentId: null, canViewAllDivisions: true, accessScopes: [] };
    const service = app.get(CommercialPdfService);
    await expect(service.status('quote', quoteId, otherTenantActor)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.read('quote', quoteId, otherTenantActor)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.prepare('quote', quoteId, { ...otherTenantActor, permissions: new Set(['quotes.read', 'quotes.update']) })).rejects.toMatchObject({ statusCode: 404 });
  });
  it('locks the final document after web send, retaining stored data on mutation failure', async () => {
    const sent = await supertest(app.getHttpServer()).post(`/api/v1/quotes/${quoteId}/send`).set(auth()).send({});
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    const edit = await supertest(app.getHttpServer()).patch(`/api/v1/quotes/${quoteId}/draft`).set(auth()).send({ notes: 'LOCK BYPASS', items: [{ ...line(), id: lineId }] });
    expect(edit.status).toBe(409);
    const persisted = await supertest(app.getHttpServer()).get(`/api/v1/quotes/${quoteId}`).set(auth());
    expect(persisted.body.finalizedAt).toBeTruthy(); expect(persisted.body.notes).toBe('PDF changed');
  });
});
