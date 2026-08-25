/**
 * Bildirim listesi tüm kolonları seçtiği için, şemaya eklenen bir kolonun
 * migration'ı unutulursa bu uç 500 döner ve otomasyonun ürettiği bildirimler
 * sessizce kaybolur. Test o tuzağı yakalar.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

describe('Notifications list', () => {
  let app: NestFastifyApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' })
      .expect(201);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('şemadaki tüm kolonlarla listelenebiliyor', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/notifications?page=1&pageSize=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    for (const row of response.body.data) {
      // Özet bildirimlerin tıklanabilir satırları: dolu ya da null olmalı, eksik değil.
      expect(row).toHaveProperty('items');
      if (row.items !== null) {
        expect(Array.isArray(row.items)).toBe(true);
        for (const item of row.items) expect(typeof item.nav).toBe('string');
      }
    }
  });
});
