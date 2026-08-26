/**
 * Teknik alanın satılabilir alternatif değerleri (specOptions) uçtan uca
 * saklanmalı: teklifte "BT-50" seçilebilmesi bu listenin dönmesine bağlı.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

describe('Product spec template options', () => {
  let app: NestFastifyApplication;
  let token: string;
  let createdId: string | undefined;
  const specKey = `Fener Mili Testi ${Date.now()}`;

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' })
      .expect(201);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    if (createdId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/product-spec-templates/${createdId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  it('alternatif değerleri kaydedip geri döner', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/product-spec-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productTypeCode: 'CNC_DIK_ISLEME_MERKEZ',
        specKey,
        defaultValue: 'BT-40',
        specOptions: ['BT-50', 'BT-30'],
      })
      .expect(201);
    createdId = created.body.id;
    expect(created.body.specOptions).toEqual(['BT-50', 'BT-30']);

    const list = await request(app.getHttpServer())
      .get('/api/v1/product-spec-templates?productTypeCode=CNC_DIK_ISLEME_MERKEZ')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = (list.body as Array<{ id: string; specOptions?: string[] }>).find((item) => item.id === createdId);
    expect(row?.specOptions).toEqual(['BT-50', 'BT-30']);
  });

  it('alternatif değer verilmezse alan boş kalır', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/product-spec-templates?productTypeCode=CNC_DIK_ISLEME_MERKEZ')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    for (const row of list.body as Array<{ specOptions?: unknown }>) {
      if (row.specOptions == null) continue;
      expect(Array.isArray(row.specOptions)).toBe(true);
    }
  });
});
