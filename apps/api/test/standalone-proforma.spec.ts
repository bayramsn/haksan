import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

/**
 * Tekliften bağımsız ("hızlı") proforma: küçük/ad-hoc işlerde teklif açmadan belge
 * kesilebilmeli. Kalemler bir teklif satırına değil doğrudan belgeye aittir; bu yüzden
 * tutarlar ve firma bilgisi documentSnapshot içinde üretilir.
 */
let app: NestFastifyApplication;
let adminToken: string;
let companyId: string;

const issueDate = () => new Date().toISOString();

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
    .post('/api/v1/proformas/standalone')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);

describe('standalone proforma', () => {
  it('kayıtlı firmayla teklifsiz proforma oluşturur ve toplamları snapshot içinde hesaplar', async () => {
    const res = await post({
      companyId,
      issueDate: issueDate(),
      currencyCode: 'USD',
      items: [
        { description: 'Servo motor değişimi', quantity: 2, unitPrice: 1_500, discountAmount: 200, vatRate: 20 },
        { description: 'Yol ve konaklama', quantity: 1, unitPrice: 400, vatRate: 20 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.quoteId).toBeNull();
    expect(res.body.companyId).toBe(companyId);
    expect(res.body.documentNo).toMatch(/^(CNC|UNI|SACISLE)-PRF-\d{4}\/\d{3,}$/);

    const snapshot = res.body.documentSnapshot;
    expect(snapshot.standalone).toBe(true);
    expect(snapshot.items).toHaveLength(2);
    // 2×1500-200 = 2800, 1×400 = 400 → net 3200; KDV %20 → 640
    expect(snapshot.quote).toMatchObject({
      subtotal: 3_200,
      discountTotal: 200,
      vatAmount: 640,
      customsTotal: 0,
      grandTotal: 3_840,
    });
    // Kayıtlı firmanın unvanı belgeye kopyalanır, serbest metin alanı boş kalır.
    expect(snapshot.company?.id).toBe(companyId);
    expect(snapshot.companyEmails).toBeInstanceOf(Array);
    expect(res.body.companyNameText).toBeNull();
  });

  it('belge geneli iskontoyu net ara toplamdan düşer ve KDV\'yi aynı oranla ölçekler', async () => {
    const amountRes = await post({
      companyId,
      issueDate: issueDate(),
      currencyCode: 'USD',
      headerDiscountAmount: 200,
      items: [{ description: 'Bakım paketi', quantity: 1, unitPrice: 1_000, vatRate: 20 }],
    });
    expect(amountRes.status).toBe(201);
    // 1.000 - 200 = 800 net; KDV 1.000 × 0,8 × %20 = 160.
    expect(amountRes.body.documentSnapshot.quote).toMatchObject({
      subtotal: 800,
      discountTotal: 200,
      headerDiscountAmount: 200,
      vatAmount: 160,
      grandTotal: 960,
    });

    const percentRes = await post({
      companyId,
      issueDate: issueDate(),
      currencyCode: 'USD',
      headerDiscountPercent: 10,
      items: [{ description: 'Bakım paketi', quantity: 2, unitPrice: 1_000, discountAmount: 200, vatRate: 20 }],
    });
    expect(percentRes.status).toBe(201);
    // Net ara toplam 1.800 → %10 = 180; toplam iskonto 380.
    expect(percentRes.body.documentSnapshot.quote).toMatchObject({
      subtotal: 1_620,
      discountTotal: 380,
      headerDiscountAmount: 180,
      headerDiscountPercent: 10,
    });
  });

  it('kayıtlı firma olmadan elle girilen unvanla proforma oluşturur', async () => {
    const res = await post({
      companyName: 'ELLE GİRİLEN MAKİNA LTD. ŞTİ.',
      companyAddress: 'Organize Sanayi Bölgesi, Bursa',
      companyTaxOffice: 'Nilüfer',
      companyTaxNumber: '1234567890',
      contactName: 'Ahmet Yılmaz',
      contactPhone: '0532 000 00 00',
      issueDate: issueDate(),
      items: [{ description: 'Yedek parça', quantity: 1, unitPrice: 1_000, vatRate: 20 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.quoteId).toBeNull();
    expect(res.body.companyId).toBeNull();
    expect(res.body.companyNameText).toBe('ELLE GİRİLEN MAKİNA LTD. ŞTİ.');
    expect(res.body.documentSnapshot.company).toMatchObject({
      id: null,
      legalTitle: 'ELLE GİRİLEN MAKİNA LTD. ŞTİ.',
      taxOffice: 'Nilüfer',
      taxNumber: '1234567890',
    });
    expect(res.body.documentSnapshot.companyAddresses[0].fullAddress).toBe('Organize Sanayi Bölgesi, Bursa');
    expect(res.body.documentSnapshot.contact).toMatchObject({ fullName: 'Ahmet Yılmaz', mobilePhone: '0532 000 00 00' });
  });

  it('firma bilgisi olmayan proformayı reddeder', async () => {
    const res = await post({
      issueDate: issueDate(),
      items: [{ description: 'Yedek parça', quantity: 1, unitPrice: 100, vatRate: 20 }],
    });
    expect(res.status).toBe(422);
  });

  it('brüt tutarını aşan satır iskontosunu reddeder', async () => {
    const res = await post({
      companyId,
      issueDate: issueDate(),
      items: [{ description: 'Yedek parça', quantity: 1, unitPrice: 100, discountAmount: 250, vatRate: 20 }],
    });
    expect(res.status).toBe(422);
  });

  it('kalemsiz proformayı reddeder', async () => {
    const res = await post({ companyId, issueDate: issueDate(), items: [] });
    expect(res.status).toBe(422);
  });

  it('teklifsiz proformayı günceller ve dokunulmayan alanları korur', async () => {
    const created = await post({
      companyName: 'GÜNCELLENECEK MAKİNA A.Ş.',
      companyTaxOffice: 'Bayrampaşa',
      contactName: 'Mehmet Demir',
      issueDate: issueDate(),
      items: [{ description: 'İlk kalem', quantity: 1, unitPrice: 1_000, vatRate: 20 }],
      paymentTerms: '%50 peşin',
    });
    expect(created.status).toBe(201);

    const updated = await supertest(app.getHttpServer())
      .patch(`/api/v1/proformas/standalone/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ description: 'İlk kalem', quantity: 2, unitPrice: 1_200, vatRate: 20 }] });

    expect(updated.status).toBe(200);
    expect(updated.body.documentSnapshot.quote).toMatchObject({ subtotal: 2_400, vatAmount: 480, grandTotal: 2_880 });
    // Gönderilmeyen alanlar mevcut belgeden korunmalı.
    expect(updated.body.companyNameText).toBe('GÜNCELLENECEK MAKİNA A.Ş.');
    expect(updated.body.documentSnapshot.company.taxOffice).toBe('Bayrampaşa');
    expect(updated.body.documentSnapshot.contact.fullName).toBe('Mehmet Demir');
    expect(updated.body.documentSnapshot.terms.paymentTermsText).toBe('%50 peşin');
    expect(updated.body.documentNo).toBe(created.body.documentNo);
  });

  it('teklife bağlı proformayı hızlı proforma ucundan güncellemeyi reddeder', async () => {
    const list = await supertest(app.getHttpServer())
      .get('/api/v1/proformas?pageSize=200')
      .set('Authorization', `Bearer ${adminToken}`);
    const quoteBound = list.body.data.find((row: { quoteId?: string | null }) => row.quoteId);
    if (!quoteBound) return; // Teklife bağlı proforma yoksa doğrulanacak bir şey yok.

    const res = await supertest(app.getHttpServer())
      .patch(`/api/v1/proformas/standalone/${quoteBound.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ description: 'X', quantity: 1, unitPrice: 10, vatRate: 20 }] });
    expect(res.status).toBe(422);
  });
});
