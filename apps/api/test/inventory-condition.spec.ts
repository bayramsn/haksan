/**
 * Stok kondisyonu: yeni / kullanılmış / demo. Demo, kontrol kısıtına da
 * eklenmeden yazılamaz — bu test şema, kısıt ve uçları birlikte doğrular.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { STOCK_CONDITION_CODES, inventoryItemCreateSchema } from '@haksan/shared';
import { createTestApp } from './setup';

describe('Inventory item condition', () => {
  let app: NestFastifyApplication;
  let token: string;
  let productModelId: string | undefined;
  const serial = `DEMO-COND-${Date.now()}`;

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' })
      .expect(201);
    token = login.body.accessToken;
    const products = await request(app.getHttpServer())
      .get('/api/v1/products?page=1&pageSize=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    productModelId = products.body.data[0]?.id;
    expect(productModelId, 'katalogda ürün yok').toBeTruthy();
  });

  afterAll(async () => {
    await app.close();
  });

  it('şema üç kondisyonu da kabul eder', () => {
    expect([...STOCK_CONDITION_CODES]).toEqual(['new', 'used', 'demo']);
    for (const itemCondition of STOCK_CONDITION_CODES) {
      const parsed = inventoryItemCreateSchema.safeParse({ productModelId: 'x', serialNumber: 'y', itemCondition });
      expect(parsed.success, itemCondition).toBe(true);
    }
    expect(inventoryItemCreateSchema.safeParse({ productModelId: 'x', serialNumber: 'y', itemCondition: 'broken' }).success).toBe(false);
  });

  it('demo stok kalemi oluşturulup güncellenebiliyor', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ productModelId, serialNumber: serial, itemCondition: 'demo' })
      .expect(201);
    expect(created.body.itemCondition).toBe('demo');

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ itemCondition: 'used' })
      .expect(200);
    expect(updated.body.itemCondition).toBe('used');

    const back = await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ itemCondition: 'demo' })
      .expect(200);
    expect(back.body.itemCondition).toBe('demo');
  });
});
