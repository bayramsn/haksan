import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let token = '';
let productModelId = '';
let warehouseId = '';
let firstCompanyId = '';
let secondCompanyId = '';

const auth = () => `Bearer ${token}`;

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer();
  const login = await supertest(server)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  token = login.body.accessToken;

  const [products, warehouses, companies] = await Promise.all([
    supertest(server).get('/api/v1/products?pageSize=1&categoryCode=TEZGAH').set('Authorization', auth()),
    supertest(server).get('/api/v1/warehouses').set('Authorization', auth()),
    supertest(server).get('/api/v1/companies?pageSize=2').set('Authorization', auth()),
  ]);

  productModelId = products.body.data[0]?.id;
  warehouseId = warehouses.body[0]?.id;
  firstCompanyId = companies.body.data[0]?.id;
  secondCompanyId = companies.body.data[1]?.id ?? firstCompanyId;
});

afterAll(async () => {
  await app.close();
});

describe('Inventory sales columns', () => {
  it('persists condition, control unit, location and all three logistics dates', async () => {
    const server = app.getHttpServer();
    const serialNumber = `INV-SALES-${Date.now()}`;
    const loadingDate = '2026-07-01T09:00:00.000Z';
    const receivedDate = '2026-07-08T09:00:00.000Z';
    const arrivalDate = '2026-07-15T09:00:00.000Z';

    const created = await supertest(server)
      .post('/api/v1/inventory')
      .set('Authorization', auth())
      .send({
        productModelId,
        warehouseId,
        serialNumber,
        itemCondition: 'used',
        controlUnit: 'FANUC 0i-MF Plus',
        stockStatusCode: 'available',
        loadingDate,
        receivedDate,
        arrivalDate,
      });

    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({
      serialNumber,
      itemCondition: 'used',
      controlUnit: 'FANUC 0i-MF Plus',
      warehouseId,
    });
    expect(new Date(created.body.loadingDate).toISOString()).toBe(loadingDate);
    expect(new Date(created.body.receivedDate).toISOString()).toBe(receivedDate);
    expect(new Date(created.body.arrivalDate).toISOString()).toBe(arrivalDate);

    const listed = await supertest(server)
      .get(`/api/v1/inventory?search=${encodeURIComponent('FANUC 0i-MF Plus')}&pageSize=10`)
      .set('Authorization', auth());

    expect(listed.status).toBe(200);
    const item = listed.body.data.find((row: any) => row.id === created.body.id);
    expect(item).toMatchObject({
      serialNumber,
      itemCondition: 'used',
      controlUnit: 'FANUC 0i-MF Plus',
      warehouse: { id: warehouseId },
    });
    expect(item.product.fullName || item.product.modelCode).toBeTruthy();
  });

  it('allows the reserved company to be changed without falsely rejecting the item', async () => {
    const server = app.getHttpServer();
    const serialNumber = `INV-RESERVE-${Date.now()}`;
    const created = await supertest(server)
      .post('/api/v1/inventory')
      .set('Authorization', auth())
      .send({
        productModelId,
        warehouseId,
        serialNumber,
        stockStatusCode: 'available',
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const firstReservation = await supertest(server)
      .patch(`/api/v1/inventory/${created.body.id}/reserve`)
      .set('Authorization', auth())
      .send({ companyId: firstCompanyId });
    expect(firstReservation.status, JSON.stringify(firstReservation.body)).toBe(200);

    const changedReservation = await supertest(server)
      .patch(`/api/v1/inventory/${created.body.id}/reserve`)
      .set('Authorization', auth())
      .send({ companyId: secondCompanyId });
    expect(changedReservation.status, JSON.stringify(changedReservation.body)).toBe(200);

    const listed = await supertest(server)
      .get(`/api/v1/inventory?search=${encodeURIComponent(serialNumber)}&pageSize=5`)
      .set('Authorization', auth());
    expect(listed.body.data[0]).toMatchObject({
      id: created.body.id,
      status: { code: 'reserved' },
      reservedCompany: { id: secondCompanyId },
    });
  });

  it('does not allow creating an item directly as sold', async () => {
    const response = await supertest(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', auth())
      .send({
        productModelId,
        warehouseId,
        serialNumber: `INV-SOLD-${Date.now()}`,
        stockStatusCode: 'sold',
      });

    expect(response.status).toBe(422);
  });
});
