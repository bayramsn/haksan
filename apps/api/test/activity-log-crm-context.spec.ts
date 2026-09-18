/**
 * Haftalık aktivite raporunun CRM zenginleştirmesi: kayıt satırında firma ve
 * fırsat bağlamı, kişi bandında haftanın hareketi + kaçırılan takip, sonda
 * önümüzdeki haftanın planı (takip / fırsat adımı / görev) ve cron'un eklediği PDF.
 * Veri testin kendisince üretilir; CI veritabanı sıfırdan kurulur.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb } from '../src/db/client';
import { companies, customerDevices, opportunities, pipelineStages, salesActivities, tasks } from '../src/db/schema';
import { AutomationService } from '../src/modules/automation/automation.service';
import { HtmlPdfService } from '../src/shared/pdf/html-pdf.service';

const DAY = 24 * 60 * 60 * 1000;
const day = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

describe('activity log CRM context', () => {
  let app: NestFastifyApplication;
  let token = '';
  let tenantId = '';
  let userId = '';
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const COMPANY = `CRM BAĞLAM ${suffix}`;
  const MISSED_COMPANY = `KAÇAN TAKİP ${suffix}`;
  const DONE_COMPANY = `YAPILAN TAKİP ${suffix}`;
  const companyIds: string[] = [];
  const activityIds: string[] = [];
  let opportunityId = '';
  let taskId = '';
  let deviceId = '';

  const now = new Date();
  const at = (offsetDays: number, hour = 10) => {
    const d = new Date(now.getTime() + offsetDays * DAY);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' })
      .expect(201);
    token = login.body.accessToken;
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    tenantId = me.body.user.tenantId;
    userId = me.body.user.id;

    const db = getDb();
    const type = await db.query.activityTypes.findFirst();
    // Açık bir aşama: iptal/teslim aşamasındaki fırsatın sonraki adımı plana girmez.
    const stage = await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.code, 'lead') });
    if (!type || !stage) throw new Error('Aktivite türü / pipeline aşaması bulunamadı');

    const [company, missedCompany, doneCompany] = await db
      .insert(companies)
      .values([
        { tenantId, legalTitle: COMPANY, sector: 'Otomotiv', createdBy: userId },
        { tenantId, legalTitle: MISSED_COMPANY, createdBy: userId },
        { tenantId, legalTitle: DONE_COMPANY, createdBy: userId },
      ])
      .returning({ id: companies.id });
    companyIds.push(company.id, missedCompany.id, doneCompany.id);
    // Makine parkı: stok kaydı olmayan cihaz "Makine (yıl)" olarak etiketlenir.
    const [device] = await db
      .insert(customerDevices)
      .values({ tenantId, companyId: company.id, deliveryDate: new Date('2023-05-10T00:00:00Z') })
      .returning({ id: customerDevices.id });
    deviceId = device.id;

    const [opportunity] = await db
      .insert(opportunities)
      .values({
        tenantId,
        companyId: company.id,
        ownerUserId: userId,
        createdBy: userId,
        title: `Kalıp CNC ${suffix}`,
        currentStageId: stage.id,
        estimatedValue: '120000',
        probability: 60,
        requestedMachine: 'MMT-1170',
        nextAction: 'Numune parça işle',
        nextActionAt: at(3),
      })
      .returning({ id: opportunities.id });
    opportunityId = opportunity.id;

    const activities = await db
      .insert(salesActivities)
      .values([
        // Bu haftanın kaydı: fırsat bağlı, takibi önümüzdeki haftaya düşüyor.
        {
          tenantId,
          activityTypeId: type.id,
          companyId: company.id,
          opportunityId,
          subject: `Teknik görüşme ${suffix}`,
          activityDate: at(0, 8),
          nextFollowUpAt: at(2),
          createdBy: userId,
        },
        // Üç gün önce girilmiş, takibi dün vadeliydi; o firmaya sonra kayıt yok → kaçırılan.
        {
          tenantId,
          activityTypeId: type.id,
          companyId: missedCompany.id,
          subject: `Fiyat sorusu ${suffix}`,
          activityDate: at(-3),
          nextFollowUpAt: at(-1),
          createdBy: userId,
        },
        // Aynı vade ama firmaya sonradan (erken, vadeden önce) kayıt girilmiş → yapılmış.
        {
          tenantId,
          activityTypeId: type.id,
          companyId: doneCompany.id,
          subject: `Numune ${suffix}`,
          activityDate: at(-4),
          nextFollowUpAt: at(-1),
          createdBy: userId,
        },
        { tenantId, activityTypeId: type.id, companyId: doneCompany.id, subject: `Numune teslim ${suffix}`, activityDate: at(-2), createdBy: userId },
      ])
      .returning({ id: salesActivities.id });
    activityIds.push(...activities.map((a) => a.id));

    // İstanbul günü UTC'den ileride: `to` en geç yarın 21:00Z olur, plan penceresi at(2) ile garanti.
    const [task] = await db
      .insert(tasks)
      .values({ tenantId, title: `Teklif hazırla ${suffix}`, assignedToUserId: userId, createdBy: userId, dueAt: at(2), companyId: company.id })
      .returning({ id: tasks.id });
    taskId = task.id;
  });

  afterAll(async () => {
    const db = getDb();
    if (taskId) await db.delete(tasks).where(eq(tasks.id, taskId));
    if (deviceId) await db.delete(customerDevices).where(eq(customerDevices.id, deviceId));
    if (activityIds.length) await db.delete(salesActivities).where(inArray(salesActivities.id, activityIds));
    if (opportunityId) await db.delete(opportunities).where(eq(opportunities.id, opportunityId));
    if (companyIds.length) await db.delete(companies).where(inArray(companies.id, companyIds));
    await app?.close();
  });

  const fetchReport = async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/reports/activity-log?from=${day(at(-7))}&to=${day(now)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const me = res.body.users.find((u: any) => u.userId === userId);
    expect(me).toBeTruthy();
    return { body: res.body, me };
  };

  it('kayıt satırına firma ve fırsat bağlamını, kişi bandına haftanın hareketini yazar', async () => {
    const { body, me } = await fetchReport();
    expect(body.nextRange.from).toBe(body.range.to);

    const entry = me.groups.flatMap((g: any) => g.entries).find((e: any) => e.id === activityIds[0]);
    expect(entry).toBeTruthy();
    expect(entry.companyName).toBe(COMPANY);
    expect(entry.company).toMatchObject({ sector: 'Otomotiv', machines: 'Makine (2023)' });
    expect(entry.origin).toBe('manual');
    expect(entry.opportunity).toMatchObject({
      estimatedValue: 120000,
      probability: 60,
      requestedMachine: 'MMT-1170',
      nextAction: 'Numune parça işle',
    });
    expect(entry.opportunity.stage).toBeTruthy();

    expect(me.week.newOpportunities).toBeGreaterThanOrEqual(1);
    const missed = me.week.missedFollowUps.find((m: any) => m.companyName === MISSED_COMPANY);
    expect(missed).toBeTruthy();
    expect(missed.subject).toBe(`Fiyat sorusu ${suffix}`);
    // Planlayan kayıttan sonra (vadeden önce bile) aktivite girilmiş firma kaçırılan sayılmaz.
    expect(me.week.missedFollowUps.some((m: any) => m.companyName === DONE_COMPANY)).toBe(false);
  });

  it('önümüzdeki haftanın planını takip + fırsat adımı + görevden derler', async () => {
    const { me } = await fetchReport();
    const kinds = me.plan.map((p: any) => `${p.kind}:${p.companyName}`);
    expect(kinds).toContain(`followUp:${COMPANY}`);
    expect(kinds).toContain(`opportunityAction:${COMPANY}`);
    expect(kinds).toContain(`task:${COMPANY}`);
    const action = me.plan.find((p: any) => p.kind === 'opportunityAction' && p.companyName === COMPANY);
    expect(action.title).toContain('Numune parça işle');
    // Plan tarihe göre sıralı
    const dues = me.plan.map((p: any) => p.dueAt);
    expect([...dues].sort()).toEqual(dues);
  });

  it('haftalık cron için aynı raporu PDF eki olarak üretir', async () => {
    const automation = app.get(AutomationService);
    const attachments = await automation.weeklyActivityPdf(tenantId, { from: at(-7, 0), to: at(1, 0) });
    if (!HtmlPdfService.executablePath()) {
      // Chromium yoksa (CI runner) ek atlanır; mail yine çıkar.
      expect(attachments).toEqual([]);
      return;
    }
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toMatch(/^haftalik-aktivite-raporu-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(attachments[0].contentType).toBe('application/pdf');
    expect(attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
  }, 120_000);
});
