import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let token = '';
let companyId = '';
let opportunityId = '';
const suffix = Date.now();
const contactName = `Hızlı Lead Kontak ${suffix}`;
const phoneSuffix = String(suffix).slice(-7);
const contactPhone = `0532 ${phoneSuffix.slice(0, 3)} ${phoneSuffix.slice(3, 5)} ${phoneSuffix.slice(5, 7)}`;

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer();
  const login = await supertest(server)
    .post('/api/v1/auth/login')
    .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' });
  token = login.body.accessToken;
  const companies = await supertest(server)
    .get('/api/v1/companies?pageSize=10')
    .set('Authorization', `Bearer ${token}`);
  companyId = companies.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

describe('Companyless quick lead flow', () => {
  it('creates a lead without creating a company record', async () => {
    const server = app.getHttpServer();
    const before = await supertest(server)
      .get('/api/v1/companies?pageSize=1')
      .set('Authorization', `Bearer ${token}`);

    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        leadContactName: contactName,
        leadCompanyTitle: `Opsiyonel Ünvan ${suffix}`,
        leadContactValue: contactPhone,
        sourceCode: 'phone',
        title: `Hızlı lead ürün ${suffix}`,
        currencyCode: 'USD',
      });

    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.companyId).toBeNull();
    expect(created.body.primaryContactId).toBeNull();
    expect(created.body.leadContactName).toBe(contactName);
    expect(created.body.leadCompanyTitle).toBe(`Opsiyonel Ünvan ${suffix}`);
    expect(created.body.source?.code).toBe('phone');
    expect(created.body.stage?.code).toBe('lead');
    opportunityId = created.body.id;

    const after = await supertest(server)
      .get('/api/v1/companies?pageSize=1')
      .set('Authorization', `Bearer ${token}`);
    expect(after.body.meta.total).toBe(before.body.meta.total);
  });

  it('requires a contact name when no company is selected', async () => {
    const response = await supertest(app.getHttpServer())
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Eksik hızlı lead', currencyCode: 'USD' });
    expect([400, 422]).toContain(response.status);
  });

  it('keeps the lead searchable by contact and blocks quote stage until a company is linked', async () => {
    const server = app.getHttpServer();
    const listed = await supertest(server)
      .get(`/api/v1/opportunities?search=${encodeURIComponent(contactName)}&pageSize=10`)
      .set('Authorization', `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((row: { id: string }) => row.id === opportunityId)).toBe(true);

    const blocked = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'quote' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error?.message).toContain('firma');
  });

  it('links a company and converts the lead contact into a real contact', async () => {
    const server = app.getHttpServer();
    const linked = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/company`)
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, createContact: true });

    expect(linked.status, JSON.stringify(linked.body)).toBe(201);
    expect(linked.body.companyId).toBe(companyId);
    expect(linked.body.primaryContactId).toBeTruthy();
    expect(linked.body.leadContactName).toBe(contactName);

    const contact = await supertest(server)
      .get(`/api/v1/contacts/${linked.body.primaryContactId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(contact.status).toBe(200);
    expect(contact.body.fullName).toBe(contactName.toLocaleUpperCase('tr-TR'));
    expect(contact.body.mobilePhone).toBe(contactPhone);
  });
});
