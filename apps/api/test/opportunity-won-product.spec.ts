import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { createTestApp } from './setup';
import type { DbClient } from '../src/db/client';
import { opportunities } from '../src/db/schema/crm';
import { DB } from '../src/shared/database/database.module';

/**
 * Bir fırsatta birden çok teklif yaşayabilir. Satılan (onaylanmış) teklif yoksa
 * kart WIN'e geçemez; biri bile satılmışsa geçer ve satılan makineler WIN anında
 * karta dondurulur.
 *
 * LOST'tan WIN'e geçiş kullanılıyor: readiness kapısını atladığı için kuralın
 * kendi başına tuttuğunu gösterir (A+ kanıt zincirini kurmaya gerek kalmadan).
 */
let app: NestFastifyApplication;
let db: DbClient;
let token = '';
let companyId = '';
let opportunityId = '';
let quoteId = '';
const soldMachine = `TEST-VMC-${Date.now()}`;

beforeAll(async () => {
  app = await createTestApp();
  db = app.get<DbClient>(DB);
  const server = app.getHttpServer();
  const login = await supertest(server)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  token = login.body.accessToken;

  const companies = await supertest(server)
    .get('/api/v1/companies?pageSize=1')
    .set('Authorization', `Bearer ${token}`);
  expect(companies.status, JSON.stringify(companies.body)).toBe(200);
  companyId = companies.body.data[0].id;

  const opportunity = await supertest(server)
    .post('/api/v1/opportunities')
    .set('Authorization', `Bearer ${token}`)
    .send({ companyId, title: `Satılan makine testi ${Date.now()}`, currencyCode: 'USD' });
  expect(opportunity.status, JSON.stringify(opportunity.body)).toBe(201);
  opportunityId = opportunity.body.id;

  const quote = await supertest(server)
    .post('/api/v1/quotes')
    .set('Authorization', `Bearer ${token}`)
    .send({ companyId, opportunityId, quoteDate: new Date().toISOString(), currencyCode: 'USD' });
  expect(quote.status, JSON.stringify(quote.body)).toBe(201);
  quoteId = quote.body.id;

  // Kalem katalog ürününe bağlanmıyor: serbest adlı makine de satılabilir ve
  // makine adı o zaman kalem açıklamasından okunur.
  const item = await supertest(server)
    .post(`/api/v1/quotes/${quoteId}/items`)
    .set('Authorization', `Bearer ${token}`)
    .send({ description: soldMachine, quantity: 1, unitPrice: 100000, vatRate: 20, sortOrder: 0 });
  expect(item.status, JSON.stringify(item.body)).toBe(201);

  // Opsiyon satırı makine değildir; WIN kaydına girmemeli.
  const option = await supertest(server)
    .post(`/api/v1/quotes/${quoteId}/items`)
    .set('Authorization', `Bearer ${token}`)
    .send({ description: '↳ Opsiyon: 4. eksen', quantity: 1, unitPrice: 5000, vatRate: 20, sortOrder: 1 });
  expect(option.status, JSON.stringify(option.body)).toBe(201);
});

afterAll(async () => {
  await app.close();
});

/** Kartı LOST'a çeker: WIN geçişi readiness kapısına takılmadan sınanır. */
const forceLost = () =>
  db.update(opportunities).set({ qualificationStage: 'lost' }).where(eq(opportunities.id, opportunityId));

describe('WIN satılan tekliften türer', () => {
  it('refuses WIN while no quote on the opportunity is sold', async () => {
    await forceLost();
    const move = await supertest(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'win', note: 'Teklif satılmadan WIN denemesi' });
    expect(move.status, JSON.stringify(move.body)).toBe(422);
    expect(JSON.stringify(move.body)).toContain('satılmış');
  });

  it('moves to WIN once a quote is sold and freezes the sold machines on the card', async () => {
    const server = app.getHttpServer();
    const approve = await supertest(server)
      .post(`/api/v1/quotes/${quoteId}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(approve.status, JSON.stringify(approve.body)).toBe(201);

    await forceLost();
    const move = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'win', note: 'Teklif satıldı' });
    expect(move.status, JSON.stringify(move.body)).toBe(200);
    expect(move.body.qualificationStage).toBe('win');
    expect(move.body.wonProductName).toBe(soldMachine);
  });

  it('narrows the quote list to one opportunity', async () => {
    const list = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes?opportunityId=${opportunityId}&pageSize=50`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([quoteId]);
  });

  it('drops the sold machine snapshot when the card leaves WIN', async () => {
    const move = await supertest(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'a_plus', note: 'Kurulum eksik, WIN geri alındı' });
    expect(move.status, JSON.stringify(move.body)).toBe(200);
    expect(move.body.wonProductName).toBeNull();
  });
});
