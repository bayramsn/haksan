import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

/**
 * Fırsattan bağımsız ("hızlı") teklif: küçük/ad-hoc işlerde satış kartı açmadan
 * teklif kesilebilmeli. Normal akışta istemci önce fırsat açtığı için her teklif
 * bir satış kartı üretiyordu; bu uçta başlık, kalemler ve şartlar tek istekte gelir.
 */
let app: NestFastifyApplication;
let adminToken: string;
let companyId: string;

const quoteDate = () => new Date().toISOString();

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  adminToken = login.body.accessToken;
  const companies = await supertest(app.getHttpServer())
    .get('/api/v1/companies?pageSize=50')
    .set('Authorization', `Bearer ${adminToken}`);
  companyId = companies.body.data[0].id;
});

afterAll(async () => {
  await app?.close();
});

const post = (body: Record<string, unknown>) =>
  supertest(app.getHttpServer())
    .post('/api/v1/quotes/standalone')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);

describe('standalone quote', () => {
  it('fırsat açmadan teklifi kalemleriyle birlikte oluşturur', async () => {
    const res = await post({
      companyId,
      quoteDate: quoteDate(),
      validityDays: 30,
      currencyCode: 'USD',
      items: [
        { description: 'Servo motor', quantity: 2, unitPrice: 1_500, discountAmount: 200, vatRate: 20 },
        { description: 'Montaj işçiliği', quantity: 1, unitPrice: 400, vatRate: 20 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.opportunityId).toBeNull();
    expect(res.body.companyId).toBe(companyId);
    expect(res.body.documentNo).toMatch(/^(CNC|UNI|SACISLE)-\d{4}\/\d+$/);
    // Fırsatı olmayan teklif her zaman ilk revizyondur.
    expect(Number(res.body.revisionNo)).toBe(1);
    expect(res.body.items).toHaveLength(2);
    // 2×1500-200 = 2800, 1×400 = 400 → net 3200; KDV %20 → 640
    expect(Number(res.body.subtotal)).toBe(3_200);
    expect(Number(res.body.discountTotal)).toBe(200);
    expect(Number(res.body.vatAmount)).toBe(640);
    expect(Number(res.body.grandTotal)).toBe(3_840);
  });

  it('şartları aynı istekte teklife yazar', async () => {
    const res = await post({
      companyId,
      quoteDate: quoteDate(),
      currencyCode: 'EUR',
      items: [{ description: 'Yedek parça', quantity: 1, unitPrice: 900, vatRate: 20 }],
      terms: {
        paymentTermsText: '%50 peşin',
        deliveryTermsText: 'İşletme teslim',
        warrantyTermsText: '24 ay',
        deliveryLocation: 'Bursa',
        importCostsExcluded: false,
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.terms).toMatchObject({
      paymentTermsText: '%50 peşin',
      deliveryTermsText: 'İşletme teslim',
      warrantyTermsText: '24 ay',
      deliveryLocation: 'Bursa',
      importCostsExcluded: false,
    });
  });

  it('kalem sırasını gönderilen diziye göre korur', async () => {
    const res = await post({
      companyId,
      quoteDate: quoteDate(),
      items: [
        { description: 'Birinci', quantity: 1, unitPrice: 100, vatRate: 20 },
        { description: 'İkinci', quantity: 1, unitPrice: 200, vatRate: 20 },
        { description: 'Üçüncü', quantity: 1, unitPrice: 300, vatRate: 20 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.items.map((item: { description: string }) => item.description)).toEqual([
      'Birinci',
      'İkinci',
      'Üçüncü',
    ]);
  });

  it('fırsat kimliği gönderilse bile yok sayar (uç bilerek fırsatsızdır)', async () => {
    const res = await post({
      companyId,
      opportunityId: '00000000-0000-0000-0000-000000000000',
      quoteDate: quoteDate(),
      items: [{ description: 'Kalem', quantity: 1, unitPrice: 100, vatRate: 20 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.opportunityId).toBeNull();
  });

  it('kalemsiz teklifi reddeder', async () => {
    const res = await post({ companyId, quoteDate: quoteDate(), items: [] });
    expect(res.status).toBe(422);
  });

  it('firmasız teklifi reddeder', async () => {
    const res = await post({
      quoteDate: quoteDate(),
      items: [{ description: 'Kalem', quantity: 1, unitPrice: 100, vatRate: 20 }],
    });
    expect(res.status).toBe(422);
  });

  it('brüt tutarını aşan satır iskontosunda yarım teklif bırakmaz', async () => {
    const before = await supertest(app.getHttpServer())
      .get('/api/v1/quotes?pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`);

    const res = await post({
      companyId,
      quoteDate: quoteDate(),
      items: [{ description: 'Geçerli kalem', quantity: 1, unitPrice: 100, vatRate: 20 }, { description: 'Bozuk kalem', quantity: 1, unitPrice: 100, discountAmount: 500, vatRate: 20 }],
    });
    expect(res.status).toBe(422);

    const after = await supertest(app.getHttpServer())
      .get('/api/v1/quotes?pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(after.body.total).toBe(before.body.total);
  });

  it('oluşturulan teklif normal teklif listesinde görünür', async () => {
    const created = await post({
      companyId,
      quoteDate: quoteDate(),
      items: [{ description: 'Listede görünsün', quantity: 1, unitPrice: 1_234, vatRate: 20 }],
    });
    expect(created.status).toBe(201);

    const list = await supertest(app.getHttpServer())
      .get('/api/v1/quotes?pageSize=200')
      .set('Authorization', `Bearer ${adminToken}`);
    const row = list.body.data.find((item: { id: string }) => item.id === created.body.id);
    expect(row).toBeTruthy();
    expect(row.opportunityId).toBeNull();
  });
});
