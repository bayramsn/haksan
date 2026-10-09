/**
 * Teklif kalemi teklifin bölümünden olmalı; süper admin her grubun ürününü
 * ekleyebilir (ör. CNC teklifine Aydınlatma aksesuarı). Test kendi grup, marka
 * ve ürününü üretir; seed verisine güvenmez.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb } from '../src/db/client';
import { brands, divisions, productGroups, productModels, users } from '../src/db/schema';

describe('Bölümler arası teklif kalemi', () => {
  let app: NestFastifyApplication;
  let superToken = '';
  let adminToken = '';
  let quoteId = '';
  let productId = '';
  let groupId = '';
  let brandId = '';
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const api = () => request(app.getHttpServer());
  const login = async (email: string, password: string) =>
    (await api().post('/api/v1/auth/login').send({ email, password }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    app = await createTestApp();
    superToken = await login('superadmin@haksan.local', 'superadmin12345');
    adminToken = await login('admin@haksan.local', 'admin12345');
    const db = getDb();
    const [superadmin] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.email, 'superadmin@haksan.local'));
    const tenantDivisions = await db.select({ id: divisions.id }).from(divisions).where(eq(divisions.tenantId, superadmin.tenantId));
    expect(tenantDivisions.length, 'en az iki bölüm gerekli').toBeGreaterThanOrEqual(2);
    const [quoteDivision, otherDivision] = tenantDivisions;

    const [group] = await db.insert(productGroups).values({
      code: `TEST_AYDINLATMA_${runId}`, name: `Test Aydınlatma ${runId}`, divisionId: otherDivision.id,
    }).returning({ id: productGroups.id });
    groupId = group.id;
    const [brand] = await db.insert(brands).values({ tenantId: superadmin.tenantId, name: `Test Lamba ${runId}` }).returning({ id: brands.id });
    brandId = brand.id;
    const [product] = await db.insert(productModels).values({
      tenantId: superadmin.tenantId, brandId, productGroupId: groupId,
      modelCode: `LAMBA-${runId}`, fullName: `Tezgah aydınlatma lambası ${runId}`,
    }).returning({ id: productModels.id });
    productId = product.id;

    const companies = await api().get('/api/v1/companies?pageSize=1').set('Authorization', `Bearer ${superToken}`).expect(200);
    const quote = await api().post('/api/v1/quotes').set('Authorization', `Bearer ${superToken}`)
      .send({ companyId: companies.body.data[0].id, divisionId: quoteDivision.id, quoteDate: new Date().toISOString(), currencyCode: 'USD' });
    expect(quote.status, JSON.stringify(quote.body)).toBe(201);
    quoteId = quote.body.id;
  });

  afterAll(async () => {
    const db = getDb();
    if (quoteId) await api().delete(`/api/v1/quotes/${quoteId}`).set('Authorization', `Bearer ${superToken}`);
    if (productId) await db.update(productModels).set({ deletedAt: new Date() }).where(eq(productModels.id, productId));
    await app.close();
  });

  it('süper admin başka bölümün ürününü teklife ekler', async () => {
    const item = await api().post(`/api/v1/quotes/${quoteId}/items`).set('Authorization', `Bearer ${superToken}`)
      .send({ productModelId: productId, description: 'Aydınlatma lambası', quantity: 1, unitPrice: 2500, vatRate: 20, sortOrder: 0 });
    expect(item.status, JSON.stringify(item.body)).toBe(201);
  });

  it('süper admin olmayan kullanıcı başka bölümün ürününü ekleyemez', async () => {
    const item = await api().post(`/api/v1/quotes/${quoteId}/items`).set('Authorization', `Bearer ${adminToken}`)
      .send({ productModelId: productId, description: 'Aydınlatma lambası', quantity: 1, unitPrice: 2500, vatRate: 20, sortOrder: 1 });
    // Ürün admin'e görünmüyorsa 404, görünüyorsa bölüm kuralı 422 döner; ikisinde de eklenmez.
    expect([404, 422], JSON.stringify(item.body)).toContain(item.status);
  });
});
