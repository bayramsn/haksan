import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { createTestApp } from './setup';
import type { DbClient } from '../src/db/client';
import { opportunities } from '../src/db/schema/crm';
import { opportunityStatuses, pipelineStages } from '../src/db/schema/lookup';
import { DB } from '../src/shared/database/database.module';

let app: NestFastifyApplication;
let db: DbClient;
let token = '';
let adminToken = '';
let companyId = '';

async function login(server: any, email: string, password: string) {
  const r = await supertest(server).post('/api/v1/auth/login').send({ email, password });
  return r.body.accessToken as string;
}

beforeAll(async () => {
  app = await createTestApp();
  db = app.get<DbClient>(DB);
  const server = app.getHttpServer();
  token = await login(server, 'superadmin@haksan.local', 'superadmin12345');
  adminToken = await login(server, 'admin@haksan.local', 'admin12345');
  const companies = await supertest(server).get('/api/v1/companies').set('Authorization', `Bearer ${token}`);
  companyId = companies.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

async function createOpp(server: any, title: string) {
  const r = await supertest(server)
    .post('/api/v1/opportunities')
    .set('Authorization', `Bearer ${token}`)
    .send({ companyId, title, currencyCode: 'USD' });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
}

describe('Opportunity logical closure (Bitir / Arşiv / Geri Aç)', () => {
  it('keeps a delayed purchase open and creates a dated follow-up task', async () => {
    const server = app.getHttpServer();
    const id = await createOpp(server, `deferred-purchase-${Date.now()}`);
    const followUpAt = new Date(Date.now() + 60 * 86_400_000);
    const deferred = await supertest(server)
      .post(`/api/v1/opportunities/${id}/defer`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        reason: 'Müşteri yatırımı iki ay sonra yapacağını bildirdi',
        nextAction: 'Bütçe onayından sonra müşteriyi tekrar ara',
        followUpAt: followUpAt.toISOString(),
      });
    expect(deferred.status, JSON.stringify(deferred.body)).toBe(201);
    expect(deferred.body.closedAt).toBeNull();
    expect(deferred.body.qualificationStage).not.toBe('lost');
    expect(deferred.body.nextAction).toBe('Bütçe onayından sonra müşteriyi tekrar ara');

    const followUps = await supertest(server)
      .get('/api/v1/opportunities?followUp=true')
      .set('Authorization', `Bearer ${token}`);
    expect(followUps.status).toBe(200);
    expect(followUps.body.data.some((row: { id: string }) => row.id === id)).toBe(true);

    const tasks = await supertest(server)
      .get(`/api/v1/tasks?opportunityId=${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(tasks.status).toBe(200);
    expect(tasks.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          opportunityId: id,
          title: 'Bütçe onayından sonra müşteriyi tekrar ara',
          status: 'todo',
        }),
      ])
    );
  });

  it('separates a cancelled deal from a lost one', async () => {
    const server = app.getHttpServer();
    const id = await createOpp(server, `cancelled-not-lost-${Date.now()}`);

    const cancelled = await supertest(server)
      .patch(`/api/v1/opportunities/${id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        toStage: 'cancelled',
        outcome: 'cancelled',
        cancellationReasonCode: 'cancel_second_hand',
        cancellationReasonName: '2. El Makine Aldı',
        changeReason: 'Müşteri ikinci el tezgah aldı',
      });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    // İptal, kayıp analizine girmemeli: nitelendirme aşaması 'lost' olmaz.
    expect(cancelled.body.qualificationStage).not.toBe('lost');
    expect(cancelled.body.stage?.code).toBe('cancelled');
    expect(cancelled.body.lostReason?.name ?? cancelled.body.lostReason).toBe('2. El Makine Aldı');
    expect(cancelled.body.lostCompetitor ?? cancelled.body.lostCompetitorId ?? null).toBeNull();

    const lostId = await createOpp(server, `lost-stays-lost-${Date.now()}`);
    const lost = await supertest(server)
      .patch(`/api/v1/opportunities/${lostId}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'cancelled', cancellationReasonCode: 'competitor' });
    expect(lost.status, JSON.stringify(lost.body)).toBe(200);
    // Alan gönderilmeyen eski istemciler kayıp davranışını korur.
    expect(lost.body.qualificationStage).toBe('lost');
  });

  it('refuses to close a non-terminal opportunity (422)', async () => {
    const id = await createOpp(app.getHttpServer(), `closure-nonterminal-${Date.now()}`);
    const r = await supertest(app.getHttpServer())
      .post(`/api/v1/opportunities/${id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(r.status).toBe(422);
  });

  it('persists a WIN closure reason and filters archived opportunities by it', async () => {
    const server = app.getHttpServer();
    const id = await createOpp(server, `closure-won-reason-${Date.now()}`);
    const deliveredStage = await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.code, 'delivered') });
    const wonStatus = await db.query.opportunityStatuses.findFirst({ where: eq(opportunityStatuses.code, 'won') });
    expect(deliveredStage).toBeTruthy();
    expect(wonStatus).toBeTruthy();
    await db
      .update(opportunities)
      .set({
        currentStageId: deliveredStage!.id,
        qualificationStage: 'win',
        statusId: wonStatus!.id,
        closedAt: null,
      })
      .where(eq(opportunities.id, id));

    const closeReason = 'Teknik çözüm ve teslim süresi tercih edildi';
    const closed = await supertest(server)
      .post(`/api/v1/opportunities/${id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: closeReason });
    expect(closed.status, JSON.stringify(closed.body)).toBe(201);
    expect(closed.body.wonReason).toBe(closeReason);

    const filteredArchive = await supertest(server)
      .get('/api/v1/opportunities')
      .query({ companyId, view: 'closed', wonReason: 'teslim süresi' })
      .set('Authorization', `Bearer ${token}`);
    expect(filteredArchive.status).toBe(200);
    expect(filteredArchive.body.data.some((row: { id: string }) => row.id === id)).toBe(true);
  });

  it('moves a cancelled/LOST deal directly to history and reopen restores it', async () => {
    const server = app.getHttpServer();
    const id = await createOpp(server, `closure-cancelled-${Date.now()}`);

    // lead -> cancelled (terminal "lost"); cancellation reason auto-created if missing
    const cancel = await supertest(server)
      .patch(`/api/v1/opportunities/${id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'cancelled', cancellationReasonCode: 'test_price' });
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);
    expect(cancel.body.closedAt).toBeTruthy();

    // gone from active pipeline list
    const active = await supertest(server)
      .get(`/api/v1/opportunities?companyId=${companyId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(active.body.data.some((o: any) => o.id === id)).toBe(false);

    // present in archive/history (view=closed)
    const archive = await supertest(server)
      .get(`/api/v1/opportunities?companyId=${companyId}&view=closed&lostReasonCode=test_price`)
      .set('Authorization', `Bearer ${token}`);
    expect(archive.body.data.some((o: any) => o.id === id)).toBe(true);

    // still retrievable directly (not deleted)
    const direct = await supertest(server)
      .get(`/api/v1/opportunities/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(direct.status).toBe(200);

    // reopen (Geri Aç) restores it to the active board
    const reopen = await supertest(server)
      .post(`/api/v1/opportunities/${id}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(reopen.status).toBe(201);
    expect(reopen.body.closedAt).toBeNull();
    expect(reopen.body.qualificationStage).toBe('c');
    expect(reopen.body.stage.code).toBe('sales');
    expect(reopen.body.lostReason).toMatchObject({ code: 'test_price' });

    const active2 = await supertest(server)
      .get(`/api/v1/opportunities?companyId=${companyId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(active2.body.data.some((o: any) => o.id === id)).toBe(true);
  });

  it('cannot close a LOST deal that was already moved to history', async () => {
    const server = app.getHttpServer();
    const id = await createOpp(server, `closure-double-${Date.now()}`);
    await supertest(server)
      .patch(`/api/v1/opportunities/${id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toStage: 'cancelled', cancellationReasonCode: 'test_price' });
    const close = await supertest(server)
      .post(`/api/v1/opportunities/${id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(close.status).toBe(422);
  });

  it('returns an open LOST card to its previous opportunity grade without clearing loss details', async () => {
    const server = app.getHttpServer();
    const id = await createOpp(server, `lost-direct-reopen-${Date.now()}`);
    const lost = await supertest(server)
      .patch(`/api/v1/opportunities/${id}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        toStage: 'lost',
        cancellationReasonCode: 'test_timing',
        lostProductName: 'Test tezgahı',
        lostUnmetConditions: 'Termin uygun değildi',
      });
    expect(lost.status, JSON.stringify(lost.body)).toBe(200);

    const forbidden = await supertest(server)
      .post(`/api/v1/opportunities/${id}/reopen`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(forbidden.status).toBe(403);

    const reopened = await supertest(server)
      .post(`/api/v1/opportunities/${id}/reopen`)
      .set('Authorization', `Bearer ${token}`);
    expect(reopened.status, JSON.stringify(reopened.body)).toBe(201);
    expect(reopened.body).toMatchObject({
      qualificationStage: 'c',
      closedAt: null,
      lostProductName: 'Test tezgahı',
      lostUnmetConditions: 'Termin uygun değildi',
    });
    expect(reopened.body.lostReason).toMatchObject({ code: 'test_timing' });
    expect(reopened.body.stage.code).toBe('sales');
  });

  it('requires the reopen action before a LOST card can return to the active board', async () => {
    const server = app.getHttpServer();
    const id = await createOpp(server, `lost-direct-target-${Date.now()}`);
    const lost = await supertest(server)
      .patch(`/api/v1/opportunities/${id}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        toStage: 'lost',
        cancellationReasonCode: 'test_competitor',
        note: 'Rakip ürün tercih edildi',
        lostProductName: 'Korunacak CNC tezgahı',
        lostUnmetConditions: 'Fiyat ve termin beklentisi karşılanmadı',
      });
    expect(lost.status, JSON.stringify(lost.body)).toBe(200);

    const moved = await supertest(server)
      .patch(`/api/v1/opportunities/${id}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        toStage: 'b',
        note: 'Müşteri yeniden değerlendirme istedi',
      });
    expect(moved.status).toBe(422);

    const reopened = await supertest(server)
      .post(`/api/v1/opportunities/${id}/reopen`)
      .set('Authorization', `Bearer ${token}`);
    expect(reopened.status, JSON.stringify(reopened.body)).toBe(201);
    expect(reopened.body).toMatchObject({
      qualificationStage: 'c',
      closedAt: null,
      qualificationNote: 'Rakip ürün tercih edildi',
      lostProductName: 'Korunacak CNC tezgahı',
      lostUnmetConditions: 'Fiyat ve termin beklentisi karşılanmadı',
    });
    expect(reopened.body.lostReason).toMatchObject({ code: 'test_competitor' });
  });
});
