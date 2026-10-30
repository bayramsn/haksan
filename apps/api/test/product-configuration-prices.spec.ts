import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb, schema } from '../src/db/client';

let app: NestFastifyApplication;
let adminToken: string;
let salesToken: string;
let productId: string;
let originalListPrice: string | null = null;
let originalCurrencyId: string | null = null;
let optionSetId: string | undefined;
const createdConfigurationIds: string[] = [];
const createdCostIds: string[] = [];
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
  const products = await request().get('/api/v1/products?pageSize=50').set('Authorization', `Bearer ${salesToken}`);
  expect(products.status, JSON.stringify(products.body)).toBe(200);
  const db = getDb();
  // Gerçek maliyet satırı olan (ör. aktarılmış aksesuar) kart seçilmez; test yalnız kendi satırlarını siler.
  const priced = new Set((await db.select({ id: schema.productCostPrices.productModelId }).from(schema.productCostPrices)).map((row) => row.id));
  productId = (products.body.data ?? products.body).find((row: { id: string }) => !priced.has(row.id)).id;
  const [usd] = await db.select({ id: schema.currencies.id }).from(schema.currencies).where(eq(schema.currencies.code, 'USD'));
  const inserted = await db.insert(schema.productConfigurationPrices).values([
    { tenantId: admin.user.tenantId, productModelId: productId, sourceModelCode: 'TEST-6020', powerKw: 12, costPrice: '41000', costCurrencyId: usd!.id, salePrice: '52000', saleCurrencyId: usd!.id, container: '40HC', leadTimeDays: 7 },
    { tenantId: admin.user.tenantId, productModelId: productId, sourceModelCode: 'TEST-6020', powerKw: 3, costPrice: '21000', costCurrencyId: usd!.id, leadTimeDays: 7 },
  ]).returning({ id: schema.productConfigurationPrices.id });
  createdConfigurationIds.push(...inserted.map((row) => row.id));
});

afterAll(async () => {
  try {
    if (productId) {
      const db = getDb();
      if (createdConfigurationIds.length) await db.delete(schema.productConfigurationPrices).where(inArray(schema.productConfigurationPrices.id, createdConfigurationIds));
      if (createdCostIds.length) await db.delete(schema.productCostPrices).where(inArray(schema.productCostPrices.id, createdCostIds));
      if (optionSetId) await db.delete(schema.productOptionSets).where(eq(schema.productOptionSets.id, optionSetId));
      await db.update(schema.productModels).set({ listPrice: originalListPrice, currencyId: originalCurrencyId }).where(eq(schema.productModels.id, productId));
    }
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

  it('prices accessories and options from their own cost rows without exposing cost to sales', async () => {
    const db = getDb();
    const [product] = await db.select({ tenantId: schema.productModels.tenantId, listPrice: schema.productModels.listPrice, currencyId: schema.productModels.currencyId }).from(schema.productModels).where(eq(schema.productModels.id, productId));
    originalListPrice = product!.listPrice; originalCurrencyId = product!.currencyId;
    const [usd] = await db.select({ id: schema.currencies.id }).from(schema.currencies).where(eq(schema.currencies.code, 'USD'));
    const [set] = await db.insert(schema.productOptionSets).values({ tenantId: product!.tenantId, productModelId: productId, name: 'Test pah kesim', sortOrder: 99 }).returning();
    optionSetId = set!.id;
    const [value] = await db.insert(schema.productOptionValues).values({ tenantId: product!.tenantId, optionSetId: set!.id, value: 'TEST-6020 · ≤3 kW', priceDelta: null, currencyId: usd!.id }).returning();
    const [productCost] = await db.insert(schema.productCostPrices).values({ tenantId: product!.tenantId, productModelId: productId, costPrice: '3100', costCurrencyId: usd!.id }).returning();
    const [optionCost] = await db.insert(schema.productCostPrices).values({ tenantId: product!.tenantId, optionValueId: value!.id, costPrice: '15000', costCurrencyId: usd!.id }).returning();
    createdCostIds.push(productCost!.id, optionCost!.id);

    const sales = await request().get('/api/v1/product-cost-prices').set('Authorization', `Bearer ${salesToken}`);
    expect(sales.status, JSON.stringify(sales.body)).toBe(200);
    const salesRow = sales.body.rows.find((row: { id: string }) => row.id === optionCost!.id);
    expect(salesRow).toMatchObject({ kind: 'option', name: 'TEST-6020 · ≤3 kW', salePrice: null });
    expect(salesRow).not.toHaveProperty('costPrice');
    const admin = await request().get('/api/v1/product-cost-prices').set('Authorization', `Bearer ${adminToken}`);
    expect(admin.body.rows.find((row: { id: string }) => row.id === productCost!.id)).toMatchObject({ kind: 'product', group: 'Aksesuar', costPrice: 3100, costCurrencyCode: 'USD' });

    const body = { rows: [{ id: productCost!.id, salePrice: 3900, saleCurrencyCode: 'USD' }, { id: optionCost!.id, salePrice: 18750, saleCurrencyCode: 'USD' }] };
    expect((await request().patch('/api/v1/product-cost-prices/sale').set('Authorization', `Bearer ${salesToken}`).send(body)).status).toBe(403);
    const saved = await request().patch('/api/v1/product-cost-prices/sale').set('Authorization', `Bearer ${adminToken}`).send(body);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const [after] = await db.select({ listPrice: schema.productModels.listPrice }).from(schema.productModels).where(eq(schema.productModels.id, productId));
    const [afterValue] = await db.select({ priceDelta: schema.productOptionValues.priceDelta }).from(schema.productOptionValues).where(eq(schema.productOptionValues.id, value!.id));
    expect(Number(after!.listPrice)).toBe(3900);
    expect(Number(afterValue!.priceDelta)).toBe(18750);
  });

  it('requires authentication', async () => {
    expect((await request().get(`/api/v1/products/${productId}/configuration-prices`)).status).toBe(401);
  });
});
