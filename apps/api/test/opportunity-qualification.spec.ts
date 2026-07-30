import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { createTestApp } from './setup';
import type { DbClient } from '../src/db/client';
import { opportunities, opportunityApprovals } from '../src/db/schema/crm';
import { opportunityStatuses, pipelineStages } from '../src/db/schema/lookup';
import { DB } from '../src/shared/database/database.module';

let app: NestFastifyApplication;
let db: DbClient;
let token = '';
let readonlyToken = '';
let companyId = '';
let opportunityId = '';
const suffix = Date.now();

beforeAll(async () => {
  app = await createTestApp();
  db = app.get<DbClient>(DB);
  const server = app.getHttpServer();
  const login = await supertest(server)
    .post('/api/v1/auth/login')
    .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' });
  token = login.body.accessToken;
  const readonlyLogin = await supertest(server)
    .post('/api/v1/auth/login')
    .send({ email: 'readonly@haksan.local', password: 'readonly12345' });
  readonlyToken = readonlyLogin.body.accessToken;

  const companies = await supertest(server)
    .get('/api/v1/companies?pageSize=10')
    .set('Authorization', `Bearer ${token}`);
  companyId = companies.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

describe('Opportunity qualification pipeline', () => {
  it('creates a Lead and exposes it through the lead lifecycle filter', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyId,
        title: `Qualification test ${suffix}`,
        currencyCode: 'EUR',
      });

    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.qualificationStage).toBe('lead');
    expect(created.body.leadFollowUpStatus).toBe('new');
    expect(created.body.nextAction).toBeNull();
    expect(created.body.qualificationReadiness).toMatchObject({
      stage: 'lead',
      nextStage: 'c',
      ready: true,
    });
    opportunityId = created.body.id;

    const leads = await supertest(server)
      .get('/api/v1/opportunities?lifecycle=lead&pageSize=100')
      .set('Authorization', `Bearer ${token}`);
    expect(leads.status).toBe(200);
    expect(leads.body.data.some((row: { id: string }) => row.id === opportunityId)).toBe(true);
  });

  it('stores the Lead follow-up status and shared next action safely', async () => {
    const server = app.getHttpServer();
    const invalid = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadFollowUpStatus: 'not-a-status' });
    expect(invalid.status).toBe(422);

    const nextActionAt = '2030-01-15T09:30:00.000Z';
    const updated = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        leadFollowUpStatus: 'attempting',
        nextAction: 'Teknik ihtiyaç listesini teyit etmek için satın alma müdürünü ara',
        nextActionAt,
      });

    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body).toMatchObject({
      leadFollowUpStatus: 'attempting',
      nextAction: 'Teknik ihtiyaç listesini teyit etmek için satın alma müdürünü ara',
      nextActionAt,
    });

    const dateWithoutAction = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nextAction: null, nextActionAt });
    expect(dateWithoutAction.status).toBe(422);

    // Eleme nedeni zorunludur: nedensiz eleme reddedilir.
    const reasonless = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadFollowUpStatus: 'disqualified' });
    expect(reasonless.status).toBe(422);

    const disqualified = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadFollowUpStatus: 'disqualified', disqualifyReasonCode: 'lead_no_budget' });
    expect(disqualified.status, JSON.stringify(disqualified.body)).toBe(200);
    const blockedConversion = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Uygun değilken çevrilmemeli' });
    expect(blockedConversion.status).toBe(422);

    const restored = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadFollowUpStatus: 'attempting' });
    expect(restored.status).toBe(200);
    // Geri açılan lead'de eleme nedeni temizlenir.
    const restoredRow = await db.query.opportunities.findFirst({ where: eq(opportunities.id, opportunityId) });
    expect(restoredRow?.disqualifyReasonId).toBeNull();
  });

  it('does not let the operation endpoint bypass qualification requirements', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, title: `Hizalama test ${suffix}`, currencyCode: 'EUR' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const alignId = created.body.id;
    expect(created.body.stage.code).toBe('lead');

    // Fırsata çevrilince kart C alanının giriş aşamasına ("Satış") taşınır.
    const converted = await supertest(server)
      .post(`/api/v1/opportunities/${alignId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Hizalama testi' });
    expect(converted.status, JSON.stringify(converted.body)).toBe(201);
    expect(converted.body.qualificationStage).toBe('c');
    expect(converted.body.stage.code).toBe('sales');

    // C gereklilikleri tamamlanmadan operasyon endpoint'i üzerinden B'ye
    // geçilemez. Bu, UI dışında doğrudan API çağrısındaki atlamayı da kapatır.
    const toCall = await supertest(server)
      .patch(`/api/v1/opportunities/${alignId}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'call' });
    expect(toCall.status, JSON.stringify(toCall.body)).toBe(422);
    expect(toCall.body.error?.details?.blockerLabels).toEqual(
      expect.arrayContaining(['Kontak bağlı', 'İl ve ilçe girildi'])
    );
    expect(toCall.body.error?.details?.blockers?.[0]).toMatchObject({
      complete: false,
      actionKey: expect.any(String),
    });

    const unchanged = await supertest(server)
      .get(`/api/v1/opportunities/${alignId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(unchanged.body.stage.code).toBe('sales');
    expect(unchanged.body.qualificationStage).toBe('c');
  });

  it('tracks lead SLA counters and exposes process health', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, title: `SLA test ${suffix}`, currencyCode: 'EUR' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const slaId = created.body.id;

    // Yeni lead: sayaç sıfır, SLA saati işlemeye başlamış olmalı.
    expect(created.body.qualificationReadiness.health).toMatchObject({
      leadStatus: 'new',
      leadSlaHours: 4,
      leadSlaBreached: false,
      contactAttemptCount: 0,
      attemptLimitReached: false,
      actionMissing: true,
      rotting: false,
    });

    // Her "deneniyor" seçimi bir temas denemesi sayılır.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const attempting = await supertest(server)
        .patch(`/api/v1/opportunities/${slaId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ leadFollowUpStatus: 'attempting' });
      expect(attempting.status, JSON.stringify(attempting.body)).toBe(200);
      expect(attempting.body.qualificationReadiness.health.contactAttemptCount).toBe(attempt);

      if (attempt < 3) {
        // Aynı duruma tekrar geçebilmek için araya farklı bir durum konur.
        const waiting = await supertest(server)
          .patch(`/api/v1/opportunities/${slaId}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ leadFollowUpStatus: 'waiting' });
        expect(waiting.status).toBe(200);
      }
    }
    const exhausted = await supertest(server)
      .get(`/api/v1/opportunities/${slaId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(exhausted.body.qualificationReadiness.health.attemptLimitReached).toBe(true);

    // İlk temas anı bir kez yazılır ve sonraki geçişlerde değişmez.
    const contacted = await supertest(server)
      .patch(`/api/v1/opportunities/${slaId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadFollowUpStatus: 'contacted' });
    expect(contacted.status).toBe(200);
    const firstContactAt = contacted.body.qualificationReadiness.health.firstContactAt;
    expect(firstContactAt).toBeTruthy();

    const reContacted = await supertest(server)
      .patch(`/api/v1/opportunities/${slaId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadFollowUpStatus: 'waiting' });
    expect(reContacted.status).toBe(200);
    expect(reContacted.body.qualificationReadiness.health.firstContactAt).toBe(firstContactAt);

    // Fırsata çevrilmiş kartta lead takip durumu dondurulur.
    const converted = await supertest(server)
      .post(`/api/v1/opportunities/${slaId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'SLA testi' });
    expect(converted.status, JSON.stringify(converted.body)).toBe(201);
    const frozen = await supertest(server)
      .patch(`/api/v1/opportunities/${slaId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadFollowUpStatus: 'new' });
    expect(frozen.status).toBe(422);
  });

  it('converts a Lead to C and removes it from the Leadler pool', async () => {
    const server = app.getHttpServer();
    const converted = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Test dönüşümü' });

    expect(converted.status, JSON.stringify(converted.body)).toBe(201);
    expect(converted.body.qualificationStage).toBe('c');
    expect(converted.body.qualificationHistory[0]).toMatchObject({
      fromStage: 'lead',
      toStage: 'c',
    });

    const leads = await supertest(server)
      .get(`/api/v1/opportunities?lifecycle=lead&search=${encodeURIComponent(`Qualification test ${suffix}`)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(leads.status).toBe(200);
    expect(leads.body.data).toHaveLength(0);

    const opportunities = await supertest(server)
      .get(`/api/v1/opportunities?lifecycle=opportunity&search=${encodeURIComponent(`Qualification test ${suffix}`)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(opportunities.status).toBe(200);
    expect(opportunities.body.data.some((row: { id: string }) => row.id === opportunityId)).toBe(true);
  });

  it('returns every intermediate blocker for a distant direct target', async () => {
    const server = app.getHttpServer();
    const skipped = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'a' });
    expect(skipped.status).toBe(422);
    expect(skipped.body.error?.message).toContain('eksik');
    expect(skipped.body.error?.details?.blockerLabels).toEqual(
      expect.arrayContaining([
        'Kontak bağlı',
        'Arama kaydı oluşturuldu',
        'Ziyaret kaydı oluşturuldu',
        'Teklif oluşturuldu',
      ])
    );

    const blocked = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'b' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error?.message).toContain('eksik');
    expect(blocked.body.error?.details?.blockerLabels).toEqual(expect.arrayContaining(['Kontak bağlı']));
  });

  it('protects operational approvals with opportunities.approve', async () => {
    const server = app.getHttpServer();
    const forbidden = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/approvals/payment`)
      .set('Authorization', `Bearer ${readonlyToken}`)
      .send({ decision: 'approved' });
    expect(forbidden.status).toBe(403);

    const wrongStage = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/approvals/payment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'approved' });
    expect(wrongStage.status).toBe(422);
    expect(wrongStage.body.error?.message).toContain('A+');
  });

  it('invalidates payment and WIN approvals when payment evidence changes', async () => {
    const server = app.getHttpServer();
    const opportunity = await db.query.opportunities.findFirst({
      where: eq(opportunities.id, opportunityId),
    });
    expect(opportunity).toBeTruthy();

    await db
      .update(opportunities)
      .set({
        qualificationStage: 'a_plus',
        paymentMethod: 'wire_transfer',
        paymentTerms: '30 gün vadeli',
      })
      .where(eq(opportunities.id, opportunityId));
    await db
      .insert(opportunityApprovals)
      .values([
        {
          tenantId: opportunity!.tenantId,
          opportunityId,
          approvalType: 'payment',
          status: 'approved',
          decidedBy: opportunity!.ownerUserId,
          decidedAt: new Date(),
        },
        {
          tenantId: opportunity!.tenantId,
          opportunityId,
          approvalType: 'win',
          status: 'approved',
          decidedBy: opportunity!.ownerUserId,
          decidedAt: new Date(),
        },
      ])
      .onConflictDoUpdate({
        target: [opportunityApprovals.opportunityId, opportunityApprovals.approvalType],
        set: {
          status: 'approved',
          decidedBy: opportunity!.ownerUserId,
          decidedAt: new Date(),
          deletedAt: null,
        },
      });

    const changed = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentTerms: '60 gün vadeli' });

    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.qualificationReadiness.approvals).toMatchObject({
      payment: 'pending',
      win: 'pending',
    });
  });

  it('allows an active WIN card to move backward with a reason and renews affected approvals', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({ companyId, title: `WIN geri dönüş ${suffix}`, currencyCode: 'EUR' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const deliveredStage = await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.code, 'delivered') });
    const wonStatus = await db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'won') });
    expect(deliveredStage).toBeTruthy();
    await db
      .update(opportunities)
      .set({
        currentStageId: deliveredStage!.id,
        qualificationStage: 'win',
        statusId: wonStatus?.id ?? null,
        closedAt: null,
      })
      .where(eq(opportunities.id, created.body.id));
    await db
      .insert(opportunityApprovals)
      .values(
        ['payment', 'customs', 'invoice', 'installation', 'win'].map((approvalType) => ({
          tenantId: created.body.tenantId,
          opportunityId: created.body.id,
          approvalType,
          status: 'approved',
          decidedAt: new Date(),
        }))
      )
      .onConflictDoNothing();

    const missingReason = await supertest(server)
      .patch(`/api/v1/opportunities/${created.body.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'quote' });
    expect(missingReason.status).toBe(422);
    expect(missingReason.body.error?.details?.field).toBe('changeReason');

    const moved = await supertest(server)
      .patch(`/api/v1/opportunities/${created.body.id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'quote', changeReason: 'Teklif kapsamı yeniden değerlendirilecek' });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.stage.code).toBe('quote');
    expect(moved.body.qualificationStage).toBe('a');
    expect(moved.body.closedAt).toBeNull();
    expect(moved.body.processReadiness.currentOperationStage).toBe('quote');
    expect(moved.body.qualificationReadiness.approvals).toMatchObject({
      payment: 'pending',
      customs: 'pending',
      invoice: 'pending',
      installation: 'pending',
      win: 'pending',
    });
  });

  it('requires a LOST reason, then archives the terminal opportunity without deleting it', async () => {
    const server = app.getHttpServer();
    const missingReason = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'lost' });
    expect(missingReason.status).toBe(422);

    const lost = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        toStage: 'lost',
        cancellationReasonCode: 'qualification_test',
        note: 'Test kayıp gerekçesi',
      });
    expect(lost.status, JSON.stringify(lost.body)).toBe(200);
    expect(lost.body.qualificationStage).toBe('lost');

    const closed = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Qualification testi tamamlandı' });
    expect(closed.status, JSON.stringify(closed.body)).toBe(201);
    expect(closed.body.closedAt).toBeTruthy();

    const archive = await supertest(server)
      .get(`/api/v1/opportunities?view=closed&qualificationStage=lost&search=${encodeURIComponent(`Qualification test ${suffix}`)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(archive.status).toBe(200);
    expect(archive.body.data.some((row: { id: string }) => row.id === opportunityId)).toBe(true);

    const direct = await supertest(server)
      .get(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(direct.status).toBe(200);

    const reopened = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/reopen`)
      .set('Authorization', `Bearer ${token}`);
    expect(reopened.status, JSON.stringify(reopened.body)).toBe(201);
    expect(reopened.body.closedAt).toBeNull();
    expect(reopened.body.qualificationStage).toBe('a_plus');
    expect(reopened.body.qualificationHistory[0]).toMatchObject({
      fromStage: 'lost',
      toStage: 'a_plus',
    });
    const [reopenedRow, openStatus] = await Promise.all([
      db.query.opportunities.findFirst({ where: eq(opportunities.id, opportunityId) }),
      db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'open') }),
    ]);
    expect(reopenedRow?.statusId).toBe(openStatus?.id);
  });
});
