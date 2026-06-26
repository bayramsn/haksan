import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken: string;
let companyId: string;
const auth = () => `Bearer ${adminToken}`;
const now = () => new Date().toISOString();
const uniqueNo = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  adminToken = login.body.accessToken;
  const r = await supertest(app.getHttpServer()).get('/api/v1/companies').set('Authorization', auth());
  companyId = r.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

describe('Finance — kasa hareketleri (alınan/ödenen)', () => {
  it('giren (alınan) ödeme oluşturur', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', auth())
      .send({ direction: 'in', companyId, amount: 5000, currencyCode: 'USD', paymentDate: now(), paymentMethod: 'cash' });
    expect(r.status).toBe(201);
    expect(r.body.direction).toBe('in');
  });

  it('çıkan (ödenen) ödeme oluşturur', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', auth())
      .send({ direction: 'out', companyId, amount: 1250, currencyCode: 'EUR', paymentDate: now(), paymentMethod: 'bank_transfer' });
    expect(r.status).toBe(201);
    expect(r.body.direction).toBe('out');
  });

  it('receivableId ve companyId ikisi de yoksa reddedilir', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', auth())
      .send({ direction: 'in', amount: 100, currencyCode: 'USD', paymentDate: now(), paymentMethod: 'cash' });
    expect([400, 422]).toContain(r.status);
  });

  it('başka tenant/var olmayan companyId reddedilir (tenant izolasyonu)', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', auth())
      .send({ direction: 'in', companyId: '00000000-0000-0000-0000-000000000000', amount: 100, currencyCode: 'USD', paymentDate: now(), paymentMethod: 'cash' });
    expect([403, 404]).toContain(r.status);
  });

  it('ödeme listesi direction alanını taşır', async () => {
    const r = await supertest(app.getHttpServer()).get('/api/v1/payments').set('Authorization', auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
    expect(r.body.data[0]).toHaveProperty('direction');
  });

  it('ödeme oluştururken invoiceNo kaydedilir', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', auth())
      .send({
        direction: 'in',
        companyId,
        amount: 250,
        currencyCode: 'USD',
        paymentDate: now(),
        paymentMethod: 'cash',
        invoiceNo: 'FTR-TEST-001',
      });
    expect(r.status).toBe(201);
    expect(r.body.invoiceNo).toBe('FTR-TEST-001');
  });
});

describe('Finance — cari özet ve raporlar', () => {
  it('firma finance-summary döner', async () => {
    const r = await supertest(app.getHttpServer())
      .get(`/api/v1/companies/${companyId}/finance-summary`)
      .set('Authorization', auth());
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('byCurrency');
    expect(Array.isArray(r.body.byCurrency)).toBe(true);
  });

  it('customer-balances listesi döner', async () => {
    const r = await supertest(app.getHttpServer()).get('/api/v1/reports/customer-balances').set('Authorization', auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    if (r.body.length) {
      expect(r.body[0]).toHaveProperty('companyId');
      expect(r.body[0]).toHaveProperty('borc');
      expect(r.body[0]).toHaveProperty('salesTotal');
    }
  });

  it('satış/alış muhasebe faturasında KDV oranından toplam hesaplar', async () => {
    const invoiceNo = uniqueNo('KDV');
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/accounting-invoices')
      .set('Authorization', auth())
      .send({
        companyId,
        type: 'sales',
        invoiceNo,
        invoiceDate: now(),
        amount: 1000,
        vatRate: 20,
        vatAmount: 0,
        grandTotal: 1000,
        currencyCode: 'USD',
        firstDueDate: now(),
        installmentCount: 1,
      });

    expect(created.status).toBe(201);
    expect(Number(created.body.vatAmount)).toBeCloseTo(200, 2);
    expect(Number(created.body.grandTotal)).toBeCloseTo(1200, 2);
  });

  it('satış muhasebe faturası 3 taksit → 3 alacak kaydı üretir', async () => {
    const invoiceNo = uniqueNo('SAT-3T');
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/accounting-invoices')
      .set('Authorization', auth())
      .send({
        companyId,
        type: 'sales',
        invoiceNo,
        invoiceDate: now(),
        amount: 3000,
        grandTotal: 3000,
        currencyCode: 'USD',
        firstDueDate: now(),
        installmentCount: 3,
      });
    expect(created.status).toBe(201);
    expect(created.body.installmentCount).toBe(3);

    const detail = await supertest(app.getHttpServer())
      .get(`/api/v1/accounting-invoices/${created.body.id}`)
      .set('Authorization', auth());
    expect(detail.status).toBe(200);
    expect(detail.body.installments).toHaveLength(3);

    const recv = await supertest(app.getHttpServer())
      .get(`/api/v1/receivables?companyId=${companyId}&pageSize=100`)
      .set('Authorization', auth());
    expect(recv.status).toBe(200);
    const matched = recv.body.data.filter((row: any) => row.invoiceNo === invoiceNo);
    expect(matched).toHaveLength(3);
  });

  it('alış muhasebe faturası → payable; admin özette alacak görünür', async () => {
    const invoiceNo = uniqueNo('ALIS');
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/accounting-invoices')
      .set('Authorization', auth())
      .send({
        companyId,
        type: 'purchase',
        invoiceNo,
        invoiceDate: now(),
        amount: 1500,
        grandTotal: 1500,
        currencyCode: 'USD',
        firstDueDate: now(),
        installmentCount: 1,
      });
    expect(created.status).toBe(201);

    const detail = await supertest(app.getHttpServer())
      .get(`/api/v1/accounting-invoices/${created.body.id}`)
      .set('Authorization', auth());
    expect(detail.body.installments[0].payableId).toBeTruthy();

    const summary = await supertest(app.getHttpServer())
      .get(`/api/v1/companies/${companyId}/finance-summary`)
      .set('Authorization', auth());
    expect(summary.status).toBe(200);
    const usd = summary.body.byCurrency.find((c: any) => c.currencyCode === 'USD');
    expect(usd).toBeTruthy();
    expect(Number(usd.alacak ?? 0)).toBeGreaterThanOrEqual(1500);
  });

  it('kısmi ödeme → alacak partial durumuna geçer', async () => {
    const invoiceNo = uniqueNo('PART');
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/accounting-invoices')
      .set('Authorization', auth())
      .send({
        companyId,
        type: 'sales',
        invoiceNo,
        invoiceDate: now(),
        amount: 1000,
        grandTotal: 1000,
        currencyCode: 'USD',
        firstDueDate: now(),
        installmentCount: 1,
      });
    expect(created.status).toBe(201);

    const detail = await supertest(app.getHttpServer())
      .get(`/api/v1/accounting-invoices/${created.body.id}`)
      .set('Authorization', auth());
    const receivableId = detail.body.installments[0].receivableId;
    expect(receivableId).toBeTruthy();

    const pay = await supertest(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', auth())
      .send({
        direction: 'in',
        receivableId,
        amount: 400,
        currencyCode: 'USD',
        paymentDate: now(),
        paymentMethod: 'bank_transfer',
        invoiceNo: 'PART-PAY-001',
      });
    expect(pay.status).toBe(201);
    expect(pay.body.invoiceNo).toBe('PART-PAY-001');

    const recv = await supertest(app.getHttpServer())
      .get(`/api/v1/receivables?companyId=${companyId}&pageSize=100`)
      .set('Authorization', auth());
    const row = recv.body.data.find((r: any) => r.id === receivableId);
    expect(row?.status?.code).toBe('partial');
  });

  it('ekstre kümülatif bakiye tarih sırasıyla artar', async () => {
    const invoiceNo = uniqueNo('STMT');
    await supertest(app.getHttpServer())
      .post('/api/v1/accounting-invoices')
      .set('Authorization', auth())
      .send({
        companyId,
        type: 'sales',
        invoiceNo,
        invoiceDate: now(),
        amount: 600,
        grandTotal: 600,
        currencyCode: 'USD',
        firstDueDate: now(),
        installmentCount: 2,
      });

    const stmt = await supertest(app.getHttpServer())
      .get(`/api/v1/companies/${companyId}/statement`)
      .set('Authorization', auth());
    expect(stmt.status).toBe(200);
    expect(Array.isArray(stmt.body)).toBe(true);

    const invoiceLines = stmt.body.filter((l: any) => l.invoiceNo === invoiceNo);
    expect(invoiceLines.length).toBeGreaterThanOrEqual(2);

    for (let i = 1; i < stmt.body.length; i++) {
      const prev = stmt.body[i - 1];
      const cur = stmt.body[i];
      if (prev.currencyCode !== cur.currencyCode) continue;
      expect(new Date(prev.date).getTime()).toBeLessThanOrEqual(new Date(cur.date).getTime());
    }

    const usdLines = stmt.body.filter((l: any) => l.currencyCode === 'USD');
    for (let i = 1; i < usdLines.length; i++) {
      const prevBal = Number(usdLines[i - 1].balance);
      const delta = Number(usdLines[i].debit) - Number(usdLines[i].credit);
      expect(Number(usdLines[i].balance)).toBeCloseTo(prevBal + delta, 2);
    }
  });

  it('cari ekstre Excel ve PDF export döner', async () => {
    const xlsx = await supertest(app.getHttpServer())
      .get(`/api/v1/exports/customer-statement/${companyId}`)
      .set('Authorization', auth());
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);

    const pdf = await supertest(app.getHttpServer())
      .get(`/api/v1/exports/customer-statement/${companyId}?format=pdf`)
      .set('Authorization', auth());
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.length).toBeGreaterThan(100);
  });

  it('customer-balances Excel export döner', async () => {
    const r = await supertest(app.getHttpServer())
      .get('/api/v1/exports/customer-balances')
      .set('Authorization', auth());
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/spreadsheetml/);
  });
});
