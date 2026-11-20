import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let token = '';
const auth = () => `Bearer ${token}`;

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  token = login.body.accessToken;
});

afterAll(async () => {
  await app.close();
});

describe('GET /inventory?opportunityId', () => {
  it('lists only items reserved for that opportunity', async () => {
    const server = app.getHttpServer();
    const me = await supertest(server).get('/api/v1/auth/me').set('Authorization', auth()).expect(200);
    const divisionId = me.body.user.divisions[0].id;
    const [products, warehouses] = await Promise.all([
      supertest(server).get('/api/v1/products?pageSize=1&categoryCode=TEZGAH').set('Authorization', auth()),
      supertest(server).get('/api/v1/warehouses').set('Authorization', auth()),
    ]);
    const stamp = Date.now();
    const company = await supertest(server).post('/api/v1/companies').set('Authorization', auth())
      .send({ legalTitle: `Stok fırsat filtresi ${stamp}`, divisionId });
    expect(company.status, JSON.stringify(company.body)).toBe(201);
    const opportunity = async (title: string) => {
      const created = await supertest(server).post('/api/v1/opportunities').set('Authorization', auth())
        .send({ companyId: company.body.id, title, currencyCode: 'EUR' });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      return created.body.id as string;
    };
    const [reservedFor, other] = [await opportunity(`Rezerve ${stamp}`), await opportunity(`Başka ${stamp}`)];

    const item = await supertest(server).post('/api/v1/inventory').set('Authorization', auth())
      .send({ productModelId: products.body.data[0]?.id, warehouseId: warehouses.body[0]?.id, serialNumber: `OPP-FILTER-${stamp}`, stockStatusCode: 'available' });
    expect(item.status, JSON.stringify(item.body)).toBe(201);
    const reserved = await supertest(server).patch(`/api/v1/inventory/${item.body.id}/reserve`).set('Authorization', auth())
      .send({ companyId: company.body.id, opportunityId: reservedFor });
    expect(reserved.status, JSON.stringify(reserved.body)).toBe(200);

    const mine = await supertest(server).get(`/api/v1/inventory?opportunityId=${reservedFor}&pageSize=50`).set('Authorization', auth()).expect(200);
    expect(mine.body.data.map((row: { id: string }) => row.id)).toEqual([item.body.id]);

    const others = await supertest(server).get(`/api/v1/inventory?opportunityId=${other}&pageSize=50`).set('Authorization', auth()).expect(200);
    expect(others.body.data).toEqual([]);

    // Başka fırsata yeniden ayrılan kalem eski fırsatın listesinden çıkar.
    await supertest(server).patch(`/api/v1/inventory/${item.body.id}/reserve`).set('Authorization', auth())
      .send({ companyId: company.body.id, opportunityId: other }).expect(200);
    const afterMove = await supertest(server).get(`/api/v1/inventory?opportunityId=${reservedFor}&pageSize=50`).set('Authorization', auth()).expect(200);
    expect(afterMove.body.data).toEqual([]);
    const moved = await supertest(server).get(`/api/v1/inventory?opportunityId=${other}&pageSize=50`).set('Authorization', auth()).expect(200);
    expect(moved.body.data.map((row: { id: string }) => row.id)).toEqual([item.body.id]);

    // Serbest bırakılan kalem hiçbir fırsatta görünmez.
    const released = await supertest(server).patch(`/api/v1/inventory/${item.body.id}`).set('Authorization', auth())
      .send({ stockStatusCode: 'available' });
    expect(released.status, JSON.stringify(released.body)).toBe(200);
    const afterRelease = await supertest(server).get(`/api/v1/inventory?opportunityId=${other}&pageSize=50`).set('Authorization', auth()).expect(200);
    expect(afterRelease.body.data).toEqual([]);

    await supertest(server).get('/api/v1/inventory?opportunityId=not-a-uuid').set('Authorization', auth()).expect(422);
  });
});
