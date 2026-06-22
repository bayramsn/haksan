import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

describe('Personal calendar and device sync', () => {
  let app: NestFastifyApplication;
  let salesToken: string;
  let adminToken: string;
  let superToken: string;
  let salesUserId: string;
  let companyId: string;
  let eventId: string;
  let deviceEventId: string;

  const request = () => supertest(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    const [salesLogin, adminLogin, superLogin] = await Promise.all([
      request().post('/api/v1/auth/login').send({ email: 'sales@haksan.local', password: 'sales12345' }),
      request().post('/api/v1/auth/login').send({ email: 'admin@haksan.local', password: 'admin12345' }),
      request().post('/api/v1/auth/login').send({ email: 'superadmin@haksan.local', password: 'superadmin12345' }),
    ]);
    salesToken = salesLogin.body.accessToken;
    adminToken = adminLogin.body.accessToken;
    superToken = superLogin.body.accessToken;
    salesUserId = salesLogin.body.user.id;
    const companies = await request().get('/api/v1/companies?pageSize=1').set('Authorization', `Bearer ${salesToken}`);
    companyId = companies.body.data[0].id;
  });

  afterAll(async () => app?.close());

  it('creates a customer visit and linked visit row', async () => {
    const startsAt = new Date(Date.now() + 86_400_000);
    const response = await request()
      .post('/api/v1/calendar/events')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        eventType: 'customer_visit',
        title: 'Takvim API müşteri ziyareti',
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 3_600_000).toISOString(),
        companyId,
        allDay: false,
        timezone: 'Europe/Istanbul',
      });
    expect(response.status).toBe(201);
    expect(response.body.ownerUserId).toBe(salesUserId);
    expect(response.body.visitId).toBeTruthy();
    eventId = response.body.id;
  });

  it('keeps other users private from normal admin', async () => {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const response = await request()
      .get(`/api/v1/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&ownerUserId=${salesUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(403);
  });

  it('lets super admin read another user calendar without edit authority', async () => {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const list = await request()
      .get(`/api/v1/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&ownerUserId=${salesUserId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((event: { id: string }) => event.id === eventId)).toBe(true);

    const update = await request()
      .patch(`/api/v1/calendar/events/${eventId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ title: 'Yetkisiz değişiklik' });
    expect(update.status).toBe(404);
  });

  it('syncs a device event idempotently and applies last-write-wins', async () => {
    const deviceId = 'calendar-test-device';
    const settings = await request()
      .put('/api/v1/calendar/sync-settings')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        deviceId,
        platform: 'android',
        autoSync: true,
        selectedCalendars: [{ id: 'work', title: 'İş', writable: true }],
        destinationCalendarId: 'work',
      });
    expect(settings.status).toBe(200);

    const modifiedAt = new Date();
    const payload = {
      deviceId,
      platform: 'android',
      observedAt: new Date().toISOString(),
      events: [{
        externalCalendarId: 'work',
        externalEventId: 'device-event-1',
        occurrenceId: '',
        title: 'Telefondan toplantı',
        startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString(),
        allDay: false,
        timezone: 'Europe/Istanbul',
        modifiedAt: modifiedAt.toISOString(),
        deleted: false,
      }],
    };
    const first = await request().post('/api/v1/mobile/calendar/sync').set('Authorization', `Bearer ${salesToken}`).send(payload);
    const second = await request().post('/api/v1/mobile/calendar/sync').set('Authorization', `Bearer ${salesToken}`).send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const list = await request().get(`/api/v1/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).set('Authorization', `Bearer ${salesToken}`);
    const deviceEvents = list.body.filter((event: { title: string }) => event.title === 'Telefondan toplantı');
    expect(deviceEvents).toHaveLength(1);
    deviceEventId = deviceEvents[0].id;

    const stale = await request()
      .post('/api/v1/mobile/calendar/sync')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        ...payload,
        observedAt: new Date(modifiedAt.getTime() + 60_000).toISOString(),
        events: [{ ...payload.events[0], title: 'Bayat telefon sürümü', modifiedAt: new Date(modifiedAt.getTime() - 60_000).toISOString() }],
      });
    expect(stale.status).toBe(201);
    const afterStale = await request().get(`/api/v1/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).set('Authorization', `Bearer ${salesToken}`);
    expect(afterStale.body.find((event: { id: string }) => event.id === deviceEventId)?.title).toBe('Telefondan toplantı');
  });

  it('mirrors a missing device event as an archive and allows restore', async () => {
    const missing = await request()
      .post('/api/v1/mobile/calendar/sync')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ deviceId: 'calendar-test-device', platform: 'android', observedAt: new Date(Date.now() + 120_000).toISOString(), events: [] });
    expect(missing.status).toBe(201);

    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const archived = await request()
      .get(`/api/v1/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&includeArchived=true`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(archived.body.find((event: { id: string; deletedAt: string | null }) => event.id === deviceEventId)?.deletedAt).toBeTruthy();

    const restored = await request().post(`/api/v1/calendar/events/${deviceEventId}/restore`).set('Authorization', `Bearer ${salesToken}`).send({});
    expect(restored.status).toBe(201);
    expect(restored.body.deletedAt).toBeNull();
  });

  it('archives and restores an event with its visit', async () => {
    const removed = await request().delete(`/api/v1/calendar/events/${eventId}`).set('Authorization', `Bearer ${salesToken}`);
    expect(removed.status).toBe(200);
    expect(removed.body.deleted).toBe(true);
    const restored = await request().post(`/api/v1/calendar/events/${eventId}/restore`).set('Authorization', `Bearer ${salesToken}`).send({});
    expect(restored.status).toBe(201);
    expect(restored.body.deletedAt).toBeNull();
  });
});
