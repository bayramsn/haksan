import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let token = '';
let adminToken = '';
let companyId = '';

async function login(server: any, email: string, password: string) {
  const r = await supertest(server).post('/api/v1/auth/login').send({ email, password });
  return r.body.accessToken as string;
}

beforeAll(async () => {
  app = await createTestApp();
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
  it('refuses to close a non-terminal opportunity (422)', async () => {
    const id = await createOpp(app.getHttpServer(), `closure-nonterminal-${Date.now()}`);
    const r = await supertest(app.getHttpServer())
      .post(`/api/v1/opportunities/${id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(r.status).toBe(422);
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
      .get(`/api/v1/opportunities?companyId=${companyId}&view=closed`)
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
