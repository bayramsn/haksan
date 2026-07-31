import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, desc, eq } from 'drizzle-orm';
import { createTestApp } from './setup';
import { getDb, schema } from '../src/db/client';

describe('Trello company resolution flow', () => {
  let app: NestFastifyApplication;
  let token = '';
  let divisionId = '';
  let existingCompanyId = '';
  const opportunityIds: string[] = [];
  const companyIds: string[] = [];
  const contactIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const exactEmail = `trello-eslesme-${suffix}@example.com`;
  const trelloPhone = `0532 ${String(Date.now()).slice(-7, -4)} ${String(Date.now()).slice(-4, -2)} ${String(Date.now()).slice(-2)}`;

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' })
      .expect(201);
    token = login.body.accessToken;

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    divisionId = me.body.user.divisions[0].id;

    const company = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalTitle: `Trello Eşleşme Testi ${suffix}`,
        shortName: `Trello Eşleşme ${suffix}`,
        relationTypeCode: 'customer',
        customerStatusCode: 'active',
        divisionId,
        primaryPhone: '+90 212 555 10 10',
        primaryEmail: exactEmail,
        address: { country: 'Türkiye', province: 'İstanbul', district: 'Ataşehir' },
      })
      .expect(201);
    existingCompanyId = company.body.id;
    companyIds.push(existingCompanyId);
  });

  afterAll(async () => {
    for (const opportunityId of opportunityIds) {
      await request(app.getHttpServer())
        .delete(`/api/v1/opportunities/${opportunityId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    for (const contactId of contactIds) {
      await request(app.getHttpServer())
        .delete(`/api/v1/contacts/${contactId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    for (const companyId of companyIds) {
      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${companyId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  it('suggests but never auto-selects the strong CRM match, then records rejected differences', async () => {
    const cardId = `existing-${suffix}`;
    const title = `Trello Eşleşme ${suffix} / Ankara`;
    const csv = [
      'Card ID,Card Name,Card Description,Board Name,List Name,Card URL',
      `${cardId},"${title}","Ayşe Test ${trelloPhone} ${exactEmail}",Satış,Aranacak,https://trello.com/c/${cardId}`,
    ].join('\n');
    const preview = await request(app.getHttpServer())
      .post('/api/v1/opportunities/imports/trello/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fileName: 'trello-company-resolution.csv',
        fileBase64: Buffer.from(csv, 'utf8').toString('base64'),
      })
      .expect(201);

    const previewRow = preview.body.rows[0];
    expect(previewRow.status).toBe('create');
    expect(previewRow.matches[0]).toMatchObject({
      id: existingCompanyId,
      confidence: 'strong',
    });
    expect(previewRow.resolution).toBeUndefined();

    const {
      status: _status,
      errors: _errors,
      warnings: _warnings,
      matches: _matches,
      ...row
    } = previewRow;
    const committed = await request(app.getHttpServer())
      .post('/api/v1/opportunities/imports/trello/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        divisionId,
        currencyCode: 'EUR',
        rows: [{
          ...row,
          resolution: {
            action: 'existing',
            companyId: existingCompanyId,
            createContact: false,
            addSecondaryPhone: false,
            addSecondaryEmail: false,
          },
        }],
      })
      .expect(201);
    expect(committed.body.summary).toEqual({ total: 1, create: 1, skip: 0, error: 0 });
    const opportunityId = committed.body.rows[0].opportunityId;
    opportunityIds.push(opportunityId);

    const opportunity = await request(app.getHttpServer())
      .get(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(opportunity.body).toMatchObject({
      companyId: existingCompanyId,
      externalSource: 'trello',
      externalKey: `trello:${cardId}`,
      externalUrl: `https://trello.com/c/${cardId}`,
    });
    expect(opportunity.body.externalMetadata.boardName).toBe('Satış');

    const [audit] = await getDb()
      .select({ newValues: schema.auditLogs.newValues })
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.action, 'company.trello_differences_resolved'),
          eq(schema.auditLogs.resourceId, existingCompanyId)
        )
      )
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);
    expect((audit.newValues as any).differences.phone.decision).toBe('rejected');
    expect((audit.newValues as any).differences.location.decision).toBe('crm_preserved');

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/opportunities/imports/trello/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        divisionId,
        currencyCode: 'EUR',
        rows: [{
          ...row,
          resolution: { action: 'existing', companyId: existingCompanyId },
        }],
      })
      .expect(201);
    expect(duplicate.body.summary).toEqual({ total: 1, create: 0, skip: 1, error: 0 });
  });

  it('creates a potential company and audits an explicit skipped card in the same commit', async () => {
    const createCardId = `create-${suffix}`;
    const skipCardId = `skip-${suffix}`;
    const committed = await request(app.getHttpServer())
      .post('/api/v1/opportunities/imports/trello/commit')
      .set('Authorization', `Bearer ${token}`)
      .send({
        divisionId,
        currencyCode: 'EUR',
        rows: [
          {
            rowNumber: 2,
            trelloCardId: createCardId,
            externalReference: `trello:${createCardId}`,
            title: `Yeni Potansiyel ${suffix} / Bursa`,
            cardUrl: `https://trello.com/c/${createCardId}`,
            archived: false,
            stageCode: 'lead',
            candidate: {
              companyTitle: `Yeni Potansiyel ${suffix}`,
              province: 'Bursa',
              contactName: 'Yeni Kontak',
              email: `yeni-${suffix}@example.com`,
            },
            resolution: { action: 'create', createContact: true },
          },
          {
            rowNumber: 3,
            trelloCardId: skipCardId,
            externalReference: `trello:${skipCardId}`,
            title: `Atlanan Kart ${suffix}`,
            cardUrl: `https://trello.com/c/${skipCardId}`,
            archived: false,
            stageCode: 'lead',
            candidate: { companyTitle: `Atlanan Firma ${suffix}` },
            resolution: { action: 'skip' },
          },
        ],
      })
      .expect(201);
    expect(committed.body.summary).toEqual({ total: 2, create: 1, skip: 1, error: 0 });
    const opportunityId = committed.body.rows.find((row: any) => row.status === 'create').opportunityId;
    opportunityIds.push(opportunityId);

    const opportunity = await request(app.getHttpServer())
      .get(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    companyIds.push(opportunity.body.companyId);
    if (opportunity.body.primaryContactId) contactIds.push(opportunity.body.primaryContactId);

    const companies = await request(app.getHttpServer())
      .get('/api/v1/companies')
      .query({ search: `Yeni Potansiyel ${suffix}`, divisionId, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const company = companies.body.data.find((item: { id: string }) => item.id === opportunity.body.companyId);
    expect(company.customerStatus.code).toBe('potential');

    const [skipAudit] = await getDb()
      .select({ newValues: schema.auditLogs.newValues })
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, 'opportunity.trello_import_skipped'))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);
    expect(skipAudit.newValues).toMatchObject({
      externalKey: `trello:${skipCardId}`,
      decision: 'skip',
    });
  });
});
