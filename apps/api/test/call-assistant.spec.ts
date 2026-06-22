import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { normalizePhoneNumber } from '@haksan/shared';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken: string;
let serviceToken: string;
let tenantId: string;
let divisionId: string;
let companyId: string;
let nationalPhone: string;
let e164Phone: string;
const secret = 'dev-call-secret';
const server = () => app.getHttpServer();
const auth = (token = adminToken) => `Bearer ${token}`;

beforeAll(async () => {
  app = await createTestApp();
  const adminLogin = await supertest(server()).post('/api/v1/auth/login').send({ email: 'admin@haksan.local', password: 'admin12345' });
  adminToken = adminLogin.body.accessToken;
  const serviceLogin = await supertest(server()).post('/api/v1/auth/login').send({ email: 'service@haksan.local', password: 'service12345' });
  serviceToken = serviceLogin.body.accessToken;

  const me = await supertest(server()).get('/api/v1/auth/me').set('Authorization', auth());
  tenantId = me.body.tenant.id;
  divisionId = me.body.user.divisions[0].id;
  const phoneTail = String(Date.now()).slice(-7).padStart(7, '0');
  const phoneDigits = `532${phoneTail}`;
  nationalPhone = `0${phoneDigits}`;
  e164Phone = `+90${phoneDigits}`;

  const createdCompany = await supertest(server())
    .post('/api/v1/companies')
    .set('Authorization', auth())
    .send({
      divisionId,
      legalTitle: `Call Assistant Test ${Date.now()}`,
      shortName: 'Call Assistant Test',
      primaryPhone: nationalPhone,
    });
  expect(createdCompany.status).toBe(201);
  companyId = createdCompany.body.id;
});

afterAll(async () => {
  await app.close();
});

describe('Call assistant', () => {
  it('normalizes Turkish phone formats to the same lookup key', () => {
    expect(normalizePhoneNumber('+90 532 111 22 33')).toBe('+905321112233');
    expect(normalizePhoneNumber('0 (532) 111-22-33')).toBe('+905321112233');
    expect(normalizePhoneNumber('5321112233')).toBe('+905321112233');
    expect(normalizePhoneNumber('0090 532 111 22 33 dahili 12')).toBe('+905321112233');
  });

  it('ingests santral webhook once and creates one pending suggestion', async () => {
    const eventId = `pbx-${Date.now()}`;
    const payload = {
      eventId,
      direction: 'inbound',
      status: 'completed',
      callerNumber: e164Phone,
      calleeNumber: '0212 000 00 00',
      endedAt: new Date().toISOString(),
      durationSeconds: 44,
    };
    const first = await supertest(server())
      .post('/api/v1/integrations/calls/webhook/generic')
      .set('x-call-webhook-secret', secret)
      .set('x-haksan-tenant-id', tenantId)
      .send(payload);
    expect(first.status).toBe(201);
    expect(first.body.event.matchStatus).toBe('matched');
    expect(first.body.event.companyId).toBe(companyId);
    expect(first.body.suggestions).toHaveLength(1);

    const duplicate = await supertest(server())
      .post('/api/v1/integrations/calls/webhook/generic')
      .set('x-call-webhook-secret', secret)
      .set('x-haksan-tenant-id', tenantId)
      .send(payload);
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.idempotent).toBe(true);
    expect(duplicate.body.suggestions).toHaveLength(1);

    const list = await supertest(server())
      .get('/api/v1/call-assistant/suggestions?status=pending')
      .set('Authorization', auth());
    expect(list.status).toBe(200);
    const suggestion = list.body.data.find((row: any) => row.callEventId === first.body.event.id);
    expect(suggestion.company.id).toBe(companyId);
    expect(suggestion.availableActions.createQuote).toBe(true);
  });

  it('creates a user-specific suggestion from a manual santral entry', async () => {
    const manual = await supertest(server())
      .post('/api/v1/call-assistant/manual-events')
      .set('Authorization', auth())
      .send({
        phoneNumber: nationalPhone,
        eventType: 'completed',
      });
    expect(manual.status).toBe(201);
    expect(manual.body.event.source).toBe('manual_pbx');
    expect(manual.body.event.matchStatus).toBe('matched');
    expect(manual.body.suggestions).toHaveLength(1);

    const list = await supertest(server())
      .get('/api/v1/call-assistant/suggestions?status=pending')
      .set('Authorization', auth());
    expect(list.status).toBe(200);
    expect(list.body.data.some((row: any) => row.callEventId === manual.body.event.id)).toBe(true);
  });

  it('creates quote, complaint intake and call log from suggestions', async () => {
    const createSuggestion = async (suffix: string) => {
      const event = await supertest(server())
        .post('/api/v1/integrations/calls/webhook/generic')
        .set('x-call-webhook-secret', secret)
        .set('x-haksan-tenant-id', tenantId)
        .send({
          eventId: `pbx-action-${suffix}-${Date.now()}`,
          direction: 'inbound',
          status: 'missed',
          callerNumber: nationalPhone,
          endedAt: new Date().toISOString(),
        });
      expect(event.status).toBe(201);
      return event.body.suggestions[0].id as string;
    };

    const quoteSuggestionId = await createSuggestion('quote');
    const quote = await supertest(server())
      .post(`/api/v1/call-assistant/suggestions/${quoteSuggestionId}/actions`)
      .set('Authorization', auth())
      .send({ action: 'create_quote' });
    expect(quote.status).toBe(201);
    expect(quote.body.quote.companyId).toBe(companyId);

    const serviceSuggestionId = await createSuggestion('service');
    const complaint = await supertest(server())
      .post(`/api/v1/call-assistant/suggestions/${serviceSuggestionId}/actions`)
      .set('Authorization', auth())
      .send({ action: 'create_service_ticket', subject: 'Aramadan servis talebi' });
    expect(complaint.status).toBe(201);
    expect(complaint.body.complaint.companyId).toBe(companyId);
    expect(complaint.body.complaint.source).toBe('phone');
    expect(complaint.body.complaint.status).toBe('reviewing');

    const callSuggestionId = await createSuggestion('call');
    const call = await supertest(server())
      .post(`/api/v1/call-assistant/suggestions/${callSuggestionId}/actions`)
      .set('Authorization', auth())
      .send({ action: 'log_call', description: 'Müşteri geri dönüş istedi' });
    expect(call.status).toBe(201);
    expect(call.body.call.companyId).toBe(companyId);
    expect(call.body.call.callResult).toBe('Müşteri geri dönüş istedi');
  });

  it('keeps Android user-specific suggestions private and enforces action permissions', async () => {
    const adminMobile = await supertest(server())
      .post('/api/v1/mobile/calls/events')
      .set('Authorization', auth())
      .send({
        eventId: `android-admin-${Date.now()}`,
        direction: 'inbound',
        status: 'completed',
        phoneNumber: e164Phone,
        endedAt: new Date().toISOString(),
      });
    expect(adminMobile.status).toBe(201);

    const serviceList = await supertest(server())
      .get('/api/v1/call-assistant/suggestions?status=pending')
      .set('Authorization', auth(serviceToken));
    expect(serviceList.status).toBe(200);
    expect(serviceList.body.data.some((row: any) => row.callEventId === adminMobile.body.event.id)).toBe(false);

    const serviceMobile = await supertest(server())
      .post('/api/v1/mobile/calls/events')
      .set('Authorization', auth(serviceToken))
      .send({
        eventId: `android-service-${Date.now()}`,
        direction: 'inbound',
        status: 'missed',
        phoneNumber: nationalPhone,
        endedAt: new Date().toISOString(),
      });
    expect(serviceMobile.status).toBe(201);
    const serviceSuggestionId = serviceMobile.body.suggestions[0].id;
    const forbiddenQuote = await supertest(server())
      .post(`/api/v1/call-assistant/suggestions/${serviceSuggestionId}/actions`)
      .set('Authorization', auth(serviceToken))
      .send({ action: 'create_quote' });
    expect(forbiddenQuote.status).toBe(403);
  });
});
