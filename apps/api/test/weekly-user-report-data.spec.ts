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
import { AutomationService, formatUserReport } from '../src/modules/automation/automation.service';

describe('Weekly user report data path', () => {
  let app: NestFastifyApplication;
  let automation: any;
  let tenantId: string;

  beforeAll(async () => {
    app = await createTestApp();
    automation = app.get(AutomationService);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' })
      .expect(201);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    tenantId = me.body.user.tenantId;
  });

  afterAll(async () => {
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
});
