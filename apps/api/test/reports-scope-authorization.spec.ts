/**
 * Rapor kapsamı yetkilendirmesi.
 *
 * Kural: süper admin tüm kullanıcıların verisini görür, diğer herkes yalnız
 * kendi verisini. Bu dosya kuralı uçlarda doğrular; toplama/kur semantiği
 * target-progress.spec.ts'in işi.
 *
 * Bu testlerin çoğu düzeltmeden ÖNCE kırmızıydı: `target-progress` isteği kimin
 * yaptığına bakmadığı için `reports.read` izni olan herkes tüm kullanıcıların
 * cirosunu ve hedef notlarını okuyabiliyordu.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb } from '../src/db/client';
import { users } from '../src/db/schema';

describe('reports scope authorization', () => {
  let app: NestFastifyApplication;
  let superAdminToken = '';
  let salesToken = '';
  let readonlyToken = '';
  let adminId = '';
  let salesId = '';

  const period = new Date().toISOString().slice(0, 7);

  const login = async (email: string, password: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.accessToken as string;
  };

  const targetProgress = (token: string, params: Record<string, string>) =>
    request(app.getHttpServer())
      .get(`/api/v1/reports/target-progress?${new URLSearchParams({ period, ...params })}`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    // FX servisi dış çağrı yapmasın; bu dosya yetkilendirmeyi ölçüyor.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      rates: { EUR: 0.5, TRY: 20 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    app = await createTestApp();
    superAdminToken = await login('superadmin@haksan.local', 'superadmin12345');
    salesToken = await login('sales@haksan.local', 'sales12345');
    readonlyToken = await login('readonly@haksan.local', 'readonly12345');

    const db = getDb();
    const admin = await db.query.users.findFirst({ where: eq(users.email, 'admin@haksan.local') });
    const sales = await db.query.users.findFirst({ where: eq(users.email, 'sales@haksan.local') });
    if (!admin || !sales) throw new Error('Kapsam testi kullanıcıları bulunamadı');
    adminId = admin.id;
    salesId = sales.id;
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllGlobals();
  });

  describe('süper admin', () => {
    it('tüm kullanıcıları görür', async () => {
      const response = await targetProgress(superAdminToken, { scope: 'all-users' }).expect(200);
      expect(response.body.subjects.length).toBeGreaterThan(1);
    });

    it('departman kapsamını alabilir', async () => {
      await targetProgress(superAdminToken, { scope: 'department' }).expect(200);
    });

    it('departman performans raporunu alabilir', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/reports/department-performance?period=${period}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });
  });

  describe('süper admin olmayan kullanıcı', () => {
    it('varsayılan kapsamda yalnız kendi satırını alır', async () => {
      const response = await targetProgress(salesToken, {}).expect(200);
      expect(response.body.subjects).toHaveLength(1);
      expect(response.body.subjects[0].subject.id).toBe(salesId);
    });

    it('all-users istese de yalnız kendini görür', async () => {
      const response = await targetProgress(salesToken, { scope: 'all-users' }).expect(200);
      expect(response.body.subjects).toHaveLength(1);
      expect(response.body.subjects[0].subject.id).toBe(salesId);
    });

    it('kendi id’siyle kullanıcı kapsamını alabilir', async () => {
      const response = await targetProgress(salesToken, { scope: 'user', id: salesId }).expect(200);
      expect(response.body.subjects).toHaveLength(1);
      expect(response.body.subjects[0].subject.id).toBe(salesId);
    });

    // Düzeltmeden önce bu istek 200 + başka kullanıcının ciro/hedef verisini dönüyordu.
    it('başkasının id’siyle kullanıcı kapsamı isterse 403 alır', async () => {
      await targetProgress(salesToken, { scope: 'user', id: adminId }).expect(403);
    });

    it('departman kapsamı isterse 403 alır', async () => {
      await targetProgress(salesToken, { scope: 'department' }).expect(403);
    });

    it('rol kapsamı isterse 403 alır', async () => {
      await targetProgress(salesToken, { scope: 'role' }).expect(403);
    });

    it('departman performans raporunda 403 alır', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/reports/department-performance?period=${period}`)
        .set('Authorization', `Bearer ${salesToken}`)
        .expect(403);
    });

    // reports.export izni olsa bile export tüm kullanıcıları dışarı sızdırmamalı:
    // uç içeride 'all-users' + 'department' çağırıyor, ikincisi kapsam dışı.
    it('hedef raporunu Excel olarak dışarı aktaramaz', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/reports/export/target-progress?period=${period}`)
        .set('Authorization', `Bearer ${salesToken}`)
        .expect(403);
    });

    it('kendi hedefini izin gerektirmeden görebilir', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/reports/my-target-progress?period=${period}`)
        .set('Authorization', `Bearer ${salesToken}`)
        .expect(200);
      expect(response.body.subjects).toHaveLength(1);
      expect(response.body.subjects[0].subject.id).toBe(salesId);
    });

    it('ekip aktivitesinde team istese de kendi verisine düşer', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/team-activity?period=week&scope=team')
        .set('Authorization', `Bearer ${salesToken}`)
        .expect(200);
      expect(response.body.scope).toBe('self');
      expect(response.body.canSeeTeam).toBe(false);
      expect(response.body.users).toHaveLength(1);
      expect(response.body.users[0].userId).toBe(salesId);
    });

    it('ekip aktivitesi detayında başka kullanıcının id’sini sorgulayamaz', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/reports/team-activity/details?period=week&scope=team&metric=all&userId=${adminId}`)
        .set('Authorization', `Bearer ${salesToken}`)
        .expect(403);
    });

    it('ekip kapsamı istese bile aktivite detayları yalnız kendisine daralır', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/reports/team-activity/details?period=week&scope=team&metric=all')
        .set('Authorization', `Bearer ${salesToken}`)
        .expect(200);
      expect(response.body.scope).toBe('self');
      expect(response.body.items.every((item: any) => item.userId === salesId)).toBe(true);
    });
  });

  describe('salt okunur kullanıcı', () => {
    // readonly rolünün '*': ['read'] joker izni reports.read'i de kapsıyor;
    // kapsam kuralı bu jokerin arkasına saklanmamalı.
    it('tüm kullanıcıların verisini okuyamaz', async () => {
      const response = await targetProgress(readonlyToken, { scope: 'all-users' }).expect(200);
      expect(response.body.subjects).toHaveLength(1);
      expect(response.body.subjects[0].subject.id).not.toBe(salesId);
    });

    it('başkasının hedef notunu göremez', async () => {
      await targetProgress(readonlyToken, { scope: 'user', id: adminId }).expect(403);
    });
  });
});
