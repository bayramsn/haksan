import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb, schema } from '../src/db/client';

let app: NestFastifyApplication;
let adminToken: string;
let salesToken: string;
let productId: string;
const request = () => supertest(app.getHttpServer());
const login = async (email: string, password: string) => {
  const response = await request().post('/api/v1/auth/login').send({ email, password });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as { accessToken: string; user: { tenantId: string } };
};

beforeAll(async () => {
  app = await createTestApp();
  const admin = await login('superadmin@haksan.local', 'superadmin12345');
  adminToken = admin.accessToken;
  salesToken = (await login('sales@haksan.local', 'sales12345')).accessToken;
  // Satış kullanıcısının bölümünde görünen bir ürün; satırlar bu teste aittir ve sonda silinir.
  const products = await request().get('/api/v1/products?pageSize=1').set('Authorization', `Bearer ${salesToken}`);
  expect(products.status, JSON.stringify(products.body)).toBe(200);
  productId = (products.body.data ?? products.body)[0].id;
  const db = getDb();
  const [usd] = await db.select({ id: schema.currencies.id }).from(schema.currencies).where(eq(schema.currencies.code, 'USD'));
  await db.insert(schema.productConfigurationPrices).values([
    { tenantId: admin.user.tenantId, productModelId: productId, sourceModelCode: 'TEST-6020', powerKw: 12, costPrice: '41000', costCurrencyId: usd!.id, salePrice: '52000', saleCurrencyId: usd!.id, container: '40HC', leadTimeDays: 7 },
    { tenantId: admin.user.tenantId, productModelId: productId, sourceModelCode: 'TEST-6020', powerKw: 3, costPrice: '21000', costCurrencyId: usd!.id, leadTimeDays: 7 },
  ]);
});

afterAll(async () => {
  try {
    if (productId) await getDb().delete(schema.productConfigurationPrices).where(eq(schema.productConfigurationPrices.productModelId, productId));
  } finally {
    await app?.close();
  }
});

describe('base card model × power prices', () => {
  it('returns the purchase cost only to roles with product_costs.view', async () => {
    const admin = await request().get(`/api/v1/products/${productId}/configuration-prices`).set('Authorization', `Bearer ${adminToken}`);
    expect(admin.status, JSON.stringify(admin.body)).toBe(200);
    expect(admin.body.canViewCost).toBe(true);
    expect(admin.body.rows.map((row: { powerKw: number }) => row.powerKw)).toEqual([3, 12]);
    expect(admin.body.rows[1]).toMatchObject({ sourceModelCode: 'TEST-6020', costPrice: 41000, costCurrencyCode: 'USD', salePrice: 52000, saleCurrencyCode: 'USD', container: '40HC', leadTimeDays: 7 });
    expect(admin.body.rows[0]).toMatchObject({ costPrice: 21000, salePrice: null });

    const sales = await request().get(`/api/v1/products/${productId}/configuration-prices`).set('Authorization', `Bearer ${salesToken}`);
    expect(sales.status, JSON.stringify(sales.body)).toBe(200);
    expect(sales.body.canViewCost).toBe(false);
    expect(sales.body.rows[1]).toMatchObject({ salePrice: 52000, leadTimeDays: 7 });
    for (const row of sales.body.rows) {
      expect(row).not.toHaveProperty('costPrice');
      expect(row).not.toHaveProperty('costCurrencyCode');
    }
  });

  it('lists every base row and lets only price editors set sale prices', async () => {
    const list = await request().get('/api/v1/product-configuration-prices').set('Authorization', `Bearer ${salesToken}`);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const row = list.body.rows.find((entry: { sourceModelCode: string; powerKw: number }) => entry.sourceModelCode === 'TEST-6020' && entry.powerKw === 3);
    expect(row).toBeTruthy();
    expect(row).not.toHaveProperty('costPrice');

    const body = { rows: [{ id: row.id, salePrice: 26500, saleCurrencyCode: 'USD' }] };
    expect((await request().patch('/api/v1/product-configuration-prices').set('Authorization', `Bearer ${salesToken}`).send(body)).status).toBe(403);
    const saved = await request().patch('/api/v1/product-configuration-prices').set('Authorization', `Bearer ${adminToken}`).send(body);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toEqual({ updated: 1 });
    const reread = await request().get(`/api/v1/products/${productId}/configuration-prices`).set('Authorization', `Bearer ${adminToken}`);
    expect(reread.body.rows.find((entry: { powerKw: number }) => entry.powerKw === 3)).toMatchObject({ salePrice: 26500, saleCurrencyCode: 'USD', costPrice: 21000 });

    const cleared = await request().patch('/api/v1/product-configuration-prices').set('Authorization', `Bearer ${adminToken}`).send({ rows: [{ id: row.id, salePrice: null, saleCurrencyCode: 'USD' }] });
    expect(cleared.status).toBe(200);
    expect((await request().patch('/api/v1/product-configuration-prices').set('Authorization', `Bearer ${adminToken}`).send({ rows: [{ id: row.id, salePrice: -1, saleCurrencyCode: 'USD' }] })).status).toBe(422);
    expect((await request().patch('/api/v1/product-configuration-prices').set('Authorization', `Bearer ${adminToken}`).send({ rows: [{ id: '00000000-0000-4000-8000-000000000000', salePrice: 1, saleCurrencyCode: 'USD' }] })).status).toBe(404);
  });

  it('requires authentication', async () => {
    expect((await request().get(`/api/v1/products/${productId}/configuration-prices`)).status).toBe(401);
  });
});
