import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { and, eq, inArray } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { LASER_PRICE_LIST_PRESETS } from '@haksan/shared';
import { createTestApp } from './setup';
import { getDb, schema } from '../src/db/client';

let app: NestFastifyApplication;
let adminToken: string;
let salesToken: string;
let tenantId: string;
let productId: string;
const createdConfigurationIds: string[] = [];
const codes = LASER_PRICE_LIST_PRESETS.map((preset) => preset.code);
const [cif, milli] = LASER_PRICE_LIST_PRESETS;
// Liste yeniden hesaplanınca tüm satırları yazılır; testten önceki listeler sonda olduğu gibi geri konur.
let savedLists: Array<typeof schema.priceLists.$inferSelect> = [];
let savedItems: Array<typeof schema.priceListConfigurationItems.$inferSelect> = [];
const request = () => supertest(app.getHttpServer());
const login = async (email: string, password: string) => {
  const response = await request().post('/api/v1/auth/login').send({ email, password });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as { accessToken: string; user: { tenantId: string } };
};
const ownRows = (rows: Array<{ configurationPriceId: string }>) => rows.filter((row) => createdConfigurationIds.includes(row.configurationPriceId));

beforeAll(async () => {
  app = await createTestApp();
  const admin = await login('superadmin@haksan.local', 'superadmin12345');
  adminToken = admin.accessToken;
  tenantId = admin.user.tenantId;
  salesToken = (await login('sales@haksan.local', 'sales12345')).accessToken;
  const products = await request().get('/api/v1/products?pageSize=50').set('Authorization', `Bearer ${adminToken}`);
  expect(products.status, JSON.stringify(products.body)).toBe(200);
  productId = (products.body.data ?? products.body)[0].id;
  const db = getDb();
  savedLists = await db.select().from(schema.priceLists).where(and(eq(schema.priceLists.tenantId, tenantId), inArray(schema.priceLists.code, codes)));
  savedItems = savedLists.length ? await db.select().from(schema.priceListConfigurationItems).where(inArray(schema.priceListConfigurationItems.priceListId, savedLists.map((list) => list.id))) : [];
  const [usd] = await db.select({ id: schema.currencies.id }).from(schema.currencies).where(eq(schema.currencies.code, 'USD'));
  const row = (sourceModelCode: string, powerKw: number, costPrice: string, container: string | null) =>
    ({ tenantId, productModelId: productId, sourceModelCode, powerKw, costPrice, costCurrencyId: usd!.id, container });
  const inserted = await db.insert(schema.productConfigurationPrices).values([
    row('TLZ-3015', 6, '22000', '20GP'),
    row('TLZ-3015', 12, '35000', '40HC+40HC'),
    row('TLZ-3015', 20, '50000', null),
    row('HW-9999W', 1.5, '2800', null),
  ]).returning({ id: schema.productConfigurationPrices.id });
  createdConfigurationIds.push(...inserted.map((entry) => entry.id));
});

afterAll(async () => {
  try {
    const db = getDb();
    await db.delete(schema.priceLists).where(and(eq(schema.priceLists.tenantId, tenantId), inArray(schema.priceLists.code, codes)));
    if (savedLists.length) await db.insert(schema.priceLists).values(savedLists);
    if (savedItems.length) await db.insert(schema.priceListConfigurationItems).values(savedItems);
    if (createdConfigurationIds.length) await db.delete(schema.productConfigurationPrices).where(inArray(schema.productConfigurationPrices.id, createdConfigurationIds));
  } finally {
    await app?.close();
  }
});

describe('laser CIF / nationalised price lists', () => {
  it('hides cost and formula from users without product_costs.view and refuses them recalculation', async () => {
    const sales = await request().get('/api/v1/laser-price-lists').set('Authorization', `Bearer ${salesToken}`);
    expect(sales.status, JSON.stringify(sales.body)).toBe(200);
    expect(sales.body.canViewCost).toBe(false);
    expect(sales.body.lists.map((list: { code: string }) => list.code)).toEqual(codes);
    for (const list of sales.body.lists) {
      expect(list.formula).toBeUndefined();
      for (const row of list.rows) for (const key of ['fob', 'cost', 'container']) expect(row).not.toHaveProperty(key);
    }
    const recalc = await request().post('/api/v1/laser-price-lists/recalculate').set('Authorization', `Bearer ${salesToken}`)
      .send({ code: cif!.code, formula: cif!.formula, apply: true });
    expect(recalc.status).toBe(403);
  });

  it('previews without writing, then applies and serves the prices to quotes and the export', async () => {
    const preview = await request().post('/api/v1/laser-price-lists/recalculate').set('Authorization', `Bearer ${adminToken}`)
      .send({ code: cif!.code, formula: cif!.formula, apply: false });
    expect(preview.status, JSON.stringify(preview.body)).toBe(201);
    expect(preview.body.applied).toBe(false);
    expect(ownRows(preview.body.rows).map((row: { powerKw: number; cost: number; listPrice: number; cashPrice: number }) => [row.powerKw, row.cost, row.listPrice, row.cashPrice]))
      .toEqual([[6, 29600, 38480, 37000], [12, 52600, 68380, 65750]]);
    expect(ownRows(preview.body.skipped)).toEqual([expect.objectContaining({ powerKw: 20, reason: expect.stringContaining('Konteyner') })]);
    expect(JSON.stringify(preview.body)).not.toContain('HW-9999W');
    const before = await request().get('/api/v1/laser-price-lists').set('Authorization', `Bearer ${adminToken}`);
    expect(ownRows(before.body.lists[0].rows).every((row: { listPrice: number | null }) => row.listPrice === null)).toBe(true);

    const applied = await request().post('/api/v1/laser-price-lists/recalculate').set('Authorization', `Bearer ${adminToken}`)
      .send({ code: milli!.code, formula: milli!.formula, apply: true });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    const after = await request().get('/api/v1/laser-price-lists').set('Authorization', `Bearer ${salesToken}`);
    const milliRows = ownRows(after.body.lists.find((list: { code: string }) => list.code === milli!.code).rows);
    // 22000 + 600 + 4000 = 26600 × 1,25 + 4000 = 37250 → liste 48425, son 46563
    expect(milliRows.map((row: { powerKw: number; listPrice: number | null; cashPrice: number | null }) => [row.powerKw, row.listPrice, row.cashPrice]))
      .toEqual([[6, 48425, 46563], [12, 85800, 82500], [20, null, null]]);

    const matrix = await request().get(`/api/v1/products/${productId}/configuration-prices`).set('Authorization', `Bearer ${salesToken}`);
    expect(matrix.status, JSON.stringify(matrix.body)).toBe(200);
    expect(matrix.body.rows.find((row: { sourceModelCode: string; powerKw: number }) => row.sourceModelCode === 'TLZ-3015' && row.powerKw === 6).listPrices)
      .toEqual([{ code: milli!.code, name: milli!.name, listPrice: 48425, cashPrice: 46563 }]);

    // Genel fiyat listesi uçları formülü döndürmez (liste fiyatı + formülden FOB geri hesaplanır).
    const generic = await request().get('/api/v1/price-lists?pageSize=100').set('Authorization', `Bearer ${adminToken}`);
    expect(generic.status, JSON.stringify(generic.body)).toBe(200);
    const genericMilli = generic.body.data.find((list: { code: string }) => list.code === milli!.code);
    expect(genericMilli).toBeDefined();
    expect(genericMilli).not.toHaveProperty('costFormula');
    const renamed = await request().patch(`/api/v1/price-lists/${genericMilli.id}`).set('Authorization', `Bearer ${adminToken}`).send({ code: 'BASKA-KOD' });
    expect(renamed.status).toBe(422);
    const patched = await request().patch(`/api/v1/price-lists/${genericMilli.id}`).set('Authorization', `Bearer ${adminToken}`).send({ description: 'test' });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    expect(patched.body).not.toHaveProperty('costFormula');

    const exported = await request().get(`/api/v1/laser-price-lists/${milli!.code}/export`).set('Authorization', `Bearer ${salesToken}`);
    expect(exported.status).toBe(200);
    expect(exported.headers['content-type']).toContain('spreadsheetml');
  });
});
