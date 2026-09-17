import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp } from './setup';
import type { DbClient } from '../src/db/client';
import { opportunities } from '../src/db/schema/crm';
import { pipelineStages } from '../src/db/schema/lookup';
import { DB } from '../src/shared/database/database.module';

/**
 * Operasyonel rapor sayfası ve Excel'i aynı motordan beslenir; kazanma/kaybetme
 * nitelendirme aşamasından okunur ve iptal (cancelled + LOST değil) kayıp
 * sayılmaz. Tohum verisine güvenilmez: fark önce/sonra ölçülür.
 */
let app: NestFastifyApplication;
let db: DbClient;
let token = '';
let ownerUserId = '';
const createdIds: string[] = [];

type Row = { bucket: string; quotes: number; won: number; lost: number; service: number; revenueUsd: number };

const year = new Date().getFullYear();
const month = `${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

const fetchMonth = async (query = '') => {
  const r = await supertest(app.getHttpServer())
    .get(`/api/v1/reports/operational?year=${year}&period=monthly${query}`)
    .set('Authorization', `Bearer ${token}`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const rows: Row[] = r.body.rows;
  expect(rows).toHaveLength(12);
  return rows.find((row) => row.bucket === month)!;
};

beforeAll(async () => {
  app = await createTestApp();
  db = app.get<DbClient>(DB);
  const server = app.getHttpServer();
  const login = await supertest(server)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  token = login.body.accessToken;
  ownerUserId = login.body.user.id;

  const companies = await supertest(server)
    .get('/api/v1/companies?pageSize=1')
    .set('Authorization', `Bearer ${token}`);
  expect(companies.status, JSON.stringify(companies.body)).toBe(200);
  const companyId = companies.body.data[0].id;

  for (const title of ['win', 'lost', 'cancelled', 'win-then-cancelled']) {
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, title: `Operasyonel rapor ${title} ${Date.now()}`, currencyCode: 'EUR', estimatedValue: 92, ownerUserId });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    createdIds.push(created.body.id);
  }
});

afterAll(async () => {
  if (createdIds.length) await db.delete(opportunities).where(inArray(opportunities.id, createdIds));
  await app.close();
});

describe('Operational report', () => {
  it('counts WIN and LOST from the qualification stage and ignores plain cancellations', async () => {
    const before = await fetchMonth();

    const cancelled = await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.code, 'cancelled') });
    expect(cancelled).toBeTruthy();
    const [winId, lostId, cancelledId, wonThenCancelledId] = createdIds;
    await db.update(opportunities).set({ qualificationStage: 'win' }).where(eq(opportunities.id, winId));
    await db.update(opportunities).set({ qualificationStage: 'lost', currentStageId: cancelled!.id }).where(eq(opportunities.id, lostId));
    // İptal: aşama cancelled ama derece LOST değil — kayıp analizine girmemeli.
    await db.update(opportunities).set({ qualificationStage: 'a', currentStageId: cancelled!.id }).where(eq(opportunities.id, cancelledId));
    // WIN sonrası iptal: derece win kalır ama kazanılan/ciro sayılmamalı.
    await db.update(opportunities).set({ qualificationStage: 'win', currentStageId: cancelled!.id }).where(eq(opportunities.id, wonThenCancelledId));

    const after = await fetchMonth();
    expect(after.won - before.won).toBe(1);
    expect(after.lost - before.lost).toBe(1);
    // 92 EUR ≈ 100 USD; kur ne olursa olsun ciro sıfırdan büyümeli.
    expect(after.revenueUsd).toBeGreaterThan(before.revenueUsd);
  });

  it('narrows to one owner and rejects a malformed owner id', async () => {
    expect(ownerUserId).toBeTruthy();
    const mine = await fetchMonth(`&ownerUserId=${ownerUserId}`);
    expect(mine.won).toBeGreaterThanOrEqual(1);

    const bad = await supertest(app.getHttpServer())
      .get(`/api/v1/reports/operational?year=${year}&period=monthly&ownerUserId=not-a-uuid`)
      .set('Authorization', `Bearer ${token}`);
    expect(bad.status).toBe(422);
  });

  it('lists whole years without a year bound in yearly mode', async () => {
    const r = await supertest(app.getHttpServer())
      .get(`/api/v1/reports/operational?year=${year}&period=yearly`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    const buckets: string[] = r.body.rows.map((row: Row) => row.bucket);
    expect(buckets).toContain(String(year));
    expect(buckets.every((b) => /^\d{4}$/.test(b))).toBe(true);
  });

  it('returns twelve empty months for a department without members', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `op-rep-${Date.now()}`, name: `Operasyonel rapor ${Date.now()}` });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const empty = await fetchMonth(`&departmentId=${created.body.id}`);
    expect(empty).toMatchObject({ quotes: 0, won: 0, lost: 0, service: 0, revenueUsd: 0 });
  });

  it('lets a sales user see only their own breakdown', async () => {
    const server = app.getHttpServer();
    const login = await supertest(server).post('/api/v1/auth/login').send({ email: 'sales@haksan.local', password: 'sales12345' });
    expect(login.status, JSON.stringify(login.body)).toBe(201);
    const salesToken = login.body.accessToken;
    const own = await supertest(server)
      .get(`/api/v1/reports/operational?year=${year}&period=monthly&ownerUserId=${login.body.user.id}`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    const other = await supertest(server)
      .get(`/api/v1/reports/operational?year=${year}&period=monthly&ownerUserId=${ownerUserId}`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(other.status).toBe(403);
  });

  it('serves the same filters through the Excel export', async () => {
    const r = await supertest(app.getHttpServer())
      .get(`/api/v1/exports/operational?year=${year}&period=monthly&ownerUserId=${ownerUserId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain(`rapor-${year}.xlsx`);
  });
});
