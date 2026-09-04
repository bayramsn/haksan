/**
 * Rapor metnini `weekly-user-report.spec.ts` doğruluyor; burada asıl risk olan
 * veri yolu koşuyor: süper admin alıcı sorgusu, sentetik aktörle ekip aktivitesi
 * çağrısı ve hesap denetimi. Bunlar yalnız cron'da çalıştığı için sessizce boş
 * dönerse (yanlış join, rol tenant'ı, kolon adı) kimse mail alamaz.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import {
  AutomationService,
  formatUserReport,
  userReportMailTargets,
} from '../src/modules/automation/automation.service';

describe('Weekly user report data path', () => {
  let app: NestFastifyApplication;
  let automation: any;
  let tenantId: string;
  let token: string;
  let originalRecipients: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    automation = app.get(AutomationService);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' })
      .expect(201);
    token = login.body.accessToken;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    tenantId = me.body.user.tenantId;
    const tenant = await request(app.getHttpServer())
      .get('/api/v1/tenant')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    originalRecipients = tenant.body.userReportRecipients ?? [];
  });

  afterAll(async () => {
    // Paylaşılan geliştirme veritabanı: ayarı bulduğumuz gibi bırak.
    if (token) {
      await request(app.getHttpServer())
        .patch('/api/v1/tenant')
        .set('Authorization', `Bearer ${token}`)
        .send({ userReportRecipients: originalRecipients });
    }
    await app?.close();
  });

  it('resolves at least one super admin recipient with an address', async () => {
    const admins = await automation.superAdmins(tenantId);
    expect(admins.length).toBeGreaterThan(0);
    for (const admin of admins) {
      expect(admin.email).toMatch(/@/);
      expect(admin.id).toBeTruthy();
    }
  });

  it('builds the report from real rows without throwing', async () => {
    const { rows, range } = await automation.userActivityRows(tenantId, new Date(Date.now() - 24 * 60 * 60 * 1000));
    expect(range.to.getTime() - range.from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(Array.isArray(rows)).toBe(true);

    const audit = await automation.userAccountAudit(tenantId, range.from);
    expect(audit.activeCount).toBeGreaterThan(0);

    const body = formatUserReport(rows, audit, range);
    expect(body).toContain('KULLANICI PERFORMANSI');
    expect(body).toContain('HESAP DENETİMİ');
    expect(body).toContain(`${audit.activeCount} aktif hesap`);
  });

  it('routes the mail to the configured recipients, normalized and deduped', async () => {
    const saved = await request(app.getHttpServer())
      .patch('/api/v1/tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ userReportRecipients: ['  BT@Firma.com ', 'bt@firma.com', 'Mudur@firma.com'] })
      .expect(200);

    expect(saved.body.userReportRecipients).toEqual(['bt@firma.com', 'mudur@firma.com']);

    // Cron alıcıyı tenant satırından okur; kolon oraya kadar taşınmazsa mail
    // sessizce yine süper adminlere giderdi.
    const tenants = await automation.listTenants();
    const row = tenants.find((t: { id: string }) => t.id === tenantId);
    const admins = await automation.superAdmins(tenantId);
    expect(userReportMailTargets(row.userReportRecipients, admins)).toEqual(['bt@firma.com', 'mudur@firma.com']);
  });

  it('rejects more addresses than the cap allows', async () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `alici${i}@firma.com`);
    await request(app.getHttpServer())
      .patch('/api/v1/tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ userReportRecipients: tooMany })
      .expect(422);
  });

  it('rejects an invalid address instead of storing it', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ userReportRecipients: ['not-an-email'] })
      .expect(422);
  });
});
