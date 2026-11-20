import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { INSTALLATION_FORM_DEFAULT_CHECKS } from '@haksan/shared';
import { createTestApp } from './setup';

// Servis ↔ satış bağı: makinenin satışı servis kaydına taşınır, servisten
// satışa lead iletilir, kurulum bitince bakım planı açılır. Kendi verisini üretir.
let app: NestFastifyApplication;
let token: string;
let companyId: string;
let saleId: string;
let deviceId: string;
let divisionId: string;
const api = () => supertest(app.getHttpServer());
const auth = () => `Bearer ${token}`;

beforeAll(async () => {
  app = await createTestApp();
  const login = await api().post('/api/v1/auth/login').send({ email: 'admin@haksan.local', password: 'admin12345' });
  token = login.body.accessToken;
  const me = await api().get('/api/v1/auth/me').set('Authorization', auth());
  divisionId = me.body.user.divisions[0].id;
  const company = await api()
    .post('/api/v1/companies')
    .set('Authorization', auth())
    .send({ legalTitle: `Servis Satış Bağı ${Date.now()}`, divisionId });
  expect(company.status).toBe(201);
  companyId = company.body.id;
  const sale = await api().post('/api/v1/opportunities').set('Authorization', auth()).send({ companyId, title: 'Vitest makine satışı' });
  expect(sale.status).toBe(201);
  saleId = sale.body.id;
  const device = await api()
    .post('/api/v1/customer-devices')
    .set('Authorization', auth())
    .send({ companyId, opportunityId: saleId, notes: 'Vitest satıştan gelen makine' });
  expect(device.status).toBe(201);
  deviceId = device.body.id;
});

afterAll(async () => {
  await app.close();
});

describe('Servis ↔ satış bağı', () => {
  it('cihazdan açılan servis kaydı makinenin satışına bağlanır ve satışa bir kez iletilir', async () => {
    const ticket = await api()
      .post('/api/v1/service-tickets')
      .set('Authorization', auth())
      .send({ companyId, customerDeviceId: deviceId, subject: 'Vitest arıza', severity: 'normal' });
    expect(ticket.status).toBe(201);
    expect(ticket.body.opportunityId).toBe(saleId);

    const tooShort = await api().post(`/api/v1/service-tickets/${ticket.body.id}/sales-lead`).set('Authorization', auth()).send({ need: 'x' });
    expect(tooShort.status).toBe(422);

    const lead = await api()
      .post(`/api/v1/service-tickets/${ticket.body.id}/sales-lead`)
      .set('Authorization', auth())
      .send({ need: 'Müşteri ikinci bir tezgah istiyor' });
    expect(lead.status).toBe(201);
    expect(lead.body.id).toBeTruthy();

    const again = await api()
      .post(`/api/v1/service-tickets/${ticket.body.id}/sales-lead`)
      .set('Authorization', auth())
      .send({ need: 'Müşteri ikinci bir tezgah istiyor' });
    expect(again.status).toBe(409);

    const detail = await api().get(`/api/v1/service-tickets/${ticket.body.id}`).set('Authorization', auth());
    expect(detail.status).toBe(200);
    expect(detail.body.salesOpportunity).toMatchObject({ id: saleId, title: 'Vitest makine satışı' });
    expect(detail.body.forwardedLeadId).toBe(lead.body.id);

    const list = await api().get('/api/v1/service-tickets').query({ search: 'Vitest arıza', pageSize: 10 }).set('Authorization', auth());
    const row = list.body.data.find((item: { id: string }) => item.id === ticket.body.id);
    expect(row?.salesOpportunity?.id).toBe(saleId);
    expect(row?.forwardedLeadId).toBe(lead.body.id);

    // Mobil firma/fırsat ekranları sunucu süzgecini kullanır.
    const byCompany = await api().get('/api/v1/service-tickets').query({ companyId, pageSize: 50 }).set('Authorization', auth());
    expect(byCompany.status).toBe(200);
    expect(byCompany.body.data.every((item: { companyId: string }) => item.companyId === companyId)).toBe(true);
    expect(byCompany.body.data.some((item: { id: string }) => item.id === ticket.body.id)).toBe(true);
    const bySale = await api().get('/api/v1/service-tickets').query({ opportunityId: saleId }).set('Authorization', auth());
    expect(bySale.body.data.every((item: { opportunityId: string }) => item.opportunityId === saleId)).toBe(true);
  });

  it('başka firmanın satışına servis kaydı bağlanamaz', async () => {
    const other = await api().post('/api/v1/companies').set('Authorization', auth()).send({ legalTitle: `Başka Firma ${Date.now()}`, divisionId });
    expect(other.status).toBe(201);
    const r = await api()
      .post('/api/v1/service-tickets')
      .set('Authorization', auth())
      .send({ companyId: other.body.id, opportunityId: saleId, subject: 'Yanlış bağ', severity: 'normal' });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  it('kurulum tamamlanınca cihaz için bakım planını bir kez açar', async () => {
    const formData = {
      formNo: 'KRL-BAG',
      problem: { hasProblem: false },
      checks: INSTALLATION_FORM_DEFAULT_CHECKS.map((check) => ({ id: check.id, label: check.label, status: 'done' })),
    };
    // İlki bir yıl geriye tarihli: ilk bakım geçmişte kalıp hemen servis açtırmamalı.
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    for (const installationDate of [yearAgo, new Date().toISOString()]) {
      const job = await api()
        .post('/api/v1/installations')
        .set('Authorization', auth())
        .send({ companyId, customerDeviceId: deviceId, opportunityId: saleId, scheduledDate: installationDate });
      expect(job.status).toBe(201);
      const done = await api()
        .patch(`/api/v1/installations/${job.body.id}/status`)
        .set('Authorization', auth())
        .send({ statusCode: 'completed', installationDate, formData });
      expect(done.status).toBe(200);
    }
    const plans = await api().get('/api/v1/maintenance-plans').query({ customerDeviceId: deviceId }).set('Authorization', auth());
    expect(plans.status).toBe(200);
    const rows = plans.body.data ?? plans.body;
    expect(rows).toHaveLength(1);
    expect(rows[0].intervalDays).toBe(180);
    expect(new Date(rows[0].nextDueDate).getTime()).toBeGreaterThan(Date.now() + 179 * 24 * 60 * 60 * 1000);
    // Garanti kurulumdan itibaren 2 yıl.
    const device = await api().get(`/api/v1/customer-devices/${deviceId}`).set('Authorization', auth());
    const start = new Date(device.body.warrantyStartDate);
    expect(new Date(device.body.warrantyEndDate).getFullYear()).toBe(start.getFullYear() + 2);
  });

  it('satılıp teslim edilen makine satışıyla parka düşer; şikayetten açılan servis o makineye ve satışa bağlanır', async () => {
    const serialNumber = `VITEST-SATIS-${Date.now()}`;
    const products = await api().get('/api/v1/products?pageSize=1&categoryCode=TEZGAH').set('Authorization', auth());
    const fallback = await api().get('/api/v1/products?pageSize=1').set('Authorization', auth());
    const productModelId = products.body.data[0]?.id ?? fallback.body.data[0].id;
    const warehouses = await api().get('/api/v1/warehouses').set('Authorization', auth());
    const item = await api()
      .post('/api/v1/inventory')
      .set('Authorization', auth())
      .send({ productModelId, serialNumber, stockStatusCode: 'available', warehouseId: warehouses.body[0].id });
    expect(item.status).toBe(201);

    const shipment = await api()
      .post('/api/v1/shipments')
      .set('Authorization', auth())
      .send({
        companyId,
        opportunityId: saleId,
        direction: 'outgoing',
        transportMode: 'road',
        productCategoryCode: 'TEZGAH',
        statusCode: 'preparing',
        items: [{ inventoryItemId: item.body.id, productModelId, description: 'Satılan tezgah', serialNumber, quantity: 1 }],
      });
    expect(shipment.status, JSON.stringify(shipment.body)).toBe(201);
    const started = await api().post(`/api/v1/shipments/${shipment.body.id}/start`).set('Authorization', auth()).send({ loadingDate: new Date().toISOString() });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const delivered = await api()
      .patch(`/api/v1/shipments/${shipment.body.id}/status`)
      .set('Authorization', auth())
      .send({ statusCode: 'delivered', arrivedAt: new Date().toISOString() });
    expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);

    const park = await api().get('/api/v1/customer-devices').query({ search: serialNumber, pageSize: 5 }).set('Authorization', auth());
    expect(park.status).toBe(200);
    const machine = park.body.data.find((row: { inventoryItemId?: string }) => row.inventoryItemId === item.body.id);
    expect(machine, JSON.stringify(park.body.data)).toBeTruthy();
    expect(machine).toMatchObject({ companyId, opportunityId: saleId, serialNumber });

    const complaint = await api()
      .post('/api/v1/service-complaints')
      .set('Authorization', auth())
      .send({ companyId, customerDeviceId: machine.id, source: 'phone', subject: 'Satılan tezgahta alarm', severity: 'normal', ticketType: 'complaint' });
    expect(complaint.status, JSON.stringify(complaint.body)).toBe(201);
    const converted = await api().post(`/api/v1/service-complaints/${complaint.body.id}/convert`).set('Authorization', auth()).send({});
    expect(converted.status, JSON.stringify(converted.body)).toBe(201);
    const ticket = await api().get(`/api/v1/service-tickets/${converted.body.serviceTicketId}`).set('Authorization', auth());
    expect(ticket.body).toMatchObject({ customerDeviceId: machine.id, opportunityId: saleId, salesOpportunity: { id: saleId } });
  });

  it('fırsat izni olmayan servis kullanıcısı satışa iletir; eşzamanlı ikinci istek lead açmaz', async () => {
    const suffix = randomUUID().slice(0, 8);
    const departments = await api().get('/api/v1/departments').set('Authorization', auth());
    const departmentRows = departments.body.data ?? departments.body;
    const department = departmentRows.find((row: { code?: string }) => row.code === 'service') ?? departmentRows[0];
    const password = `servisSatis-${suffix}`;
    const created = await api()
      .post('/api/v1/users')
      .set('Authorization', auth())
      .send({
        fullName: `Servis Satış ${suffix}`,
        email: `servis-satis-${suffix}@haksan.local`,
        username: `servis-satis-${suffix}`,
        password,
        departmentId: department.id,
        roleCodes: ['service'],
        divisionIds: [divisionId],
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const login = await api().post('/api/v1/auth/login').send({ email: `servis-satis-${suffix}@haksan.local`, password });
    const serviceAuth = `Bearer ${login.body.accessToken}`;

    // Servis rolü potansiyel firmayı görmez; cari müşteri yap.
    const company = await api()
      .post('/api/v1/companies')
      .set('Authorization', auth())
      .send({ legalTitle: `Servis Rolü Firması ${suffix}`, divisionId });
    expect(company.status).toBe(201);
    const status = await api()
      .patch(`/api/v1/companies/${company.body.id}/status`)
      .set('Authorization', auth())
      .send({ customerStatusCode: 'active', operationId: randomUUID() });
    expect(status.status, JSON.stringify(status.body)).toBe(200);

    const ticket = await api()
      .post('/api/v1/service-tickets')
      .set('Authorization', serviceAuth)
      .send({ companyId: company.body.id, subject: 'Servisçi iletimi', severity: 'normal' });
    expect(ticket.status, JSON.stringify(ticket.body)).toBe(201);

    const send = () =>
      api().post(`/api/v1/service-tickets/${ticket.body.id}/sales-lead`).set('Authorization', serviceAuth).send({ need: 'Yedek parça teklifi istiyor' });
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);

    const leads = await api()
      .get('/api/v1/opportunities')
      .query({ search: 'Servisten: Servisçi iletimi', pageSize: 10 })
      .set('Authorization', auth());
    const forwarded = (leads.body.data ?? []).filter((row: { sourceServiceTicketId?: string }) => row.sourceServiceTicketId === ticket.body.id);
    expect(forwarded).toHaveLength(1);
  });
});
