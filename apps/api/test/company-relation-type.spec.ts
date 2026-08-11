import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

describe('Company relation type stability', () => {
  let app: NestFastifyApplication;
  let token: string;
  let divisionId: string;
  let competitorLookupId: string;
  let companyId: string | undefined;

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' })
      .expect(201);
    token = login.body.accessToken;

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    divisionId = me.body.user.divisions[0].id;

    const relationTypes = await request(app.getHttpServer())
      .get('/api/v1/admin/lookups/company-relation-types')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    competitorLookupId = relationTypes.body.find(
      (row: { code: string }) => row.code === 'competitor',
    )?.id;
    expect(competitorLookupId).toEqual(expect.any(String));
  });

  afterAll(async () => {
    if (companyId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${companyId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    if (competitorLookupId) {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/lookups/company-relation-types/${competitorLookupId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'competitor', name: 'Rakip', isActive: true });
    }
    await app.close();
  });

  it('keeps the canonical code when the visible lookup name is edited', async () => {
    const renamed = await request(app.getHttpServer())
      .patch(`/api/v1/admin/lookups/company-relation-types/${competitorLookupId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rakip', isActive: true })
      .expect(200);
    expect(renamed.body.code).toBe('competitor');

    const created = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalTitle: `Rakibe taşınacak müşteri ${Date.now()}`,
        relationTypeCode: 'customer',
        customerStatusCode: 'potential',
        divisionId,
      })
      .expect(201);
    companyId = created.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ relationTypeCode: 'competitor' })
      .expect(200);

    const competitors = await request(app.getHttpServer())
      .get('/api/v1/companies')
      .query({ relationTypeCode: 'competitor', divisionId, pageSize: 100 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(competitors.body.data).toContainEqual(
      expect.objectContaining({
        id: companyId,
        relationType: expect.objectContaining({ code: 'competitor' }),
      }),
    );
  });

  it('rejects the update when the canonical lookup is missing instead of clearing the relation', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/lookups/company-relation-types/${competitorLookupId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'rakip', name: 'Rakip', isActive: true })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ relationTypeCode: 'competitor' })
      .expect(422);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/lookups/company-relation-types/${competitorLookupId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'competitor', name: 'Rakip', isActive: true })
      .expect(200);

    const competitors = await request(app.getHttpServer())
      .get('/api/v1/companies')
      .query({ relationTypeCode: 'competitor', divisionId, pageSize: 100 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(competitors.body.data).toContainEqual(
      expect.objectContaining({
        id: companyId,
        relationType: expect.objectContaining({ code: 'competitor' }),
      }),
    );
  });
});
