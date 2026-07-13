import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
const tokens: Record<string, string> = {};

async function login(server: any, email: string, password: string) {
  const r = await supertest(server).post('/api/v1/auth/login').send({ email, password });
  return r.body.accessToken as string;
}

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer();
  tokens.sales = await login(server, 'sales@haksan.local', 'sales12345');
  tokens.service = await login(server, 'service@haksan.local', 'service12345');
});

afterAll(async () => {
  await app.close();
});

describe('Note templates', () => {
  it('lets service users manage service quote templates without changing sales quote templates', async () => {
    const server = app.getHttpServer();
    const stamp = Date.now();

    const serviceTemplate = await supertest(server)
      .post('/api/v1/note-templates')
      .set('Authorization', `Bearer ${tokens.service}`)
      .send({
        title: `Servis teklif notu ${stamp}`,
        body: 'Servis kullanıcısı düzenleyebilir.',
        scope: 'service_quote',
      });
    expect(serviceTemplate.status).toBe(201);

    const updatedServiceTemplate = await supertest(server)
      .patch(`/api/v1/note-templates/${serviceTemplate.body.id}`)
      .set('Authorization', `Bearer ${tokens.service}`)
      .send({ body: 'Servis kullanıcısı güncelledi.', scope: 'service_quote' });
    expect(updatedServiceTemplate.status).toBe(200);
    expect(updatedServiceTemplate.body.body).toBe('Servis kullanıcısı güncelledi.');

    const forbiddenQuoteCreate = await supertest(server)
      .post('/api/v1/note-templates')
      .set('Authorization', `Bearer ${tokens.service}`)
      .send({
        title: `Satış teklif notu ${stamp}`,
        body: 'Servis bunu genel teklif şablonu yapamaz.',
        scope: 'quote',
      });
    expect(forbiddenQuoteCreate.status).toBe(403);

    const salesTemplate = await supertest(server)
      .post('/api/v1/note-templates')
      .set('Authorization', `Bearer ${tokens.sales}`)
      .send({
        title: `Satış teklif notu ${stamp}`,
        body: 'Satış notu.',
        scope: 'quote',
      });
    expect(salesTemplate.status).toBe(201);

    const forbiddenQuoteUpdate = await supertest(server)
      .patch(`/api/v1/note-templates/${salesTemplate.body.id}`)
      .set('Authorization', `Bearer ${tokens.service}`)
      .send({ body: 'Servis değiştirmemeli.' });
    expect(forbiddenQuoteUpdate.status).toBe(403);

    const serviceList = await supertest(server)
      .get('/api/v1/note-templates')
      .set('Authorization', `Bearer ${tokens.service}`);
    expect(serviceList.status).toBe(200);
    expect(serviceList.body.every((row: any) => ['quote', 'service_quote'].includes(row.scope))).toBe(true);

    const deleteServiceTemplate = await supertest(server)
      .delete(`/api/v1/note-templates/${serviceTemplate.body.id}`)
      .set('Authorization', `Bearer ${tokens.service}`);
    expect(deleteServiceTemplate.status).toBe(200);

    const deleteSalesTemplate = await supertest(server)
      .delete(`/api/v1/note-templates/${salesTemplate.body.id}`)
      .set('Authorization', `Bearer ${tokens.sales}`);
    expect(deleteSalesTemplate.status).toBe(200);
  });
});
