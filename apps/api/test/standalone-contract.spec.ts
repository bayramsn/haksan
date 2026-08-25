import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

/**
 * Tekliften bağımsız ("hızlı") sözleşme: küçük/ad-hoc işlerde teklif açmadan
 * sözleşme kesilebilmeli. Kalemler, şartlar ve ödeme planı bir teklife değil
 * doğrudan belgeye aittir; hepsi documentSnapshot içinde üretilir.
 */
let app: NestFastifyApplication;
let adminToken: string;
let companyId: string;

const signedDate = () => new Date().toISOString();

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
    .post('/api/v1/contracts/standalone')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);

describe('standalone contract', () => {
  it('kayıtlı firmayla teklifsiz sözleşme oluşturur ve toplamları snapshot içinde hesaplar', async () => {
    const res = await post({
      companyId,
      signedDate: signedDate(),
      currencyCode: 'USD',
      items: [
        { description: 'CNC dik işleme merkezi', quantity: 1, unitPrice: 50_000, discountAmount: 5_000, vatRate: 20 },
        { description: 'Nakliye ve devreye alma', quantity: 1, unitPrice: 2_000, vatRate: 20 },
      ],
      paymentTerms: '%50 peşin, %50 teslimde',
      deliveryLocation: 'Bursa',
      estimatedDeliveryDaysMin: 60,
      estimatedDeliveryDaysMax: 90,
      vatIncluded: true,
      freightPaidBySeller: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.quoteId).toBeNull();
    expect(res.body.companyId).toBe(companyId);
    expect(res.body.contractNo).toMatch(/^(CNC|UNI|SACISLE)-SOZ-\d{4}\/\d{3,}$/);

    const snapshot = res.body.documentSnapshot;
    expect(snapshot.standalone).toBe(true);
    expect(snapshot.items).toHaveLength(2);
    // 1×50000-5000 = 45000, 1×2000 = 2000 → net 47000; KDV %20 → 9400
    expect(snapshot.quote).toMatchObject({
      subtotal: 47_000,
      discountTotal: 5_000,
      vatAmount: 9_400,
      customsTotal: 0,
      grandTotal: 56_400,
    });
    // Sözleşme 3.3 / 2.6 maddelerinin yönü. Şemada bildirilmezse zod bunları sessizce
    // düşürüyordu: kullanıcı anahtarı açıyor, PDF eski metni basmaya devam ediyordu.
    expect(snapshot.terms).toMatchObject({
      paymentTermsText: '%50 peşin, %50 teslimde',
      deliveryLocation: 'Bursa',
      estimatedDeliveryDaysMin: 60,
      estimatedDeliveryDaysMax: 90,
      vatIncluded: true,
      freightPaidBySeller: true,
    });
    // Kayıtlı firmanın unvanı belgeye kopyalanır, serbest metin alanı boş kalır.
    expect(snapshot.company?.id).toBe(companyId);
    expect(res.body.companyNameText).toBeNull();
  });

  it('kayıtlı firma olmadan elle girilen unvanla sözleşme oluşturur', async () => {
    const res = await post({
      companyName: 'ELLE GİRİLEN SÖZLEŞME LTD. ŞTİ.',
      companyAddress: 'Organize Sanayi Bölgesi, Bursa',
      companyTaxOffice: 'Nilüfer',
      companyTaxNumber: '1234567890',
      contactName: 'Ahmet Yılmaz',
      contactPhone: '0532 000 00 00',
      signedDate: signedDate(),
      items: [{ description: 'Torna tezgahı', quantity: 1, unitPrice: 30_000, vatRate: 20 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.quoteId).toBeNull();
    expect(res.body.companyId).toBeNull();
    expect(res.body.companyNameText).toBe('ELLE GİRİLEN SÖZLEŞME LTD. ŞTİ.');
    expect(res.body.documentSnapshot.company).toMatchObject({
      id: null,
      legalTitle: 'ELLE GİRİLEN SÖZLEŞME LTD. ŞTİ.',
      taxOffice: 'Nilüfer',
      taxNumber: '1234567890',
    });
    expect(res.body.documentSnapshot.companyAddresses[0].fullAddress).toBe('Organize Sanayi Bölgesi, Bursa');
    expect(res.body.documentSnapshot.contact).toMatchObject({ fullName: 'Ahmet Yılmaz', mobilePhone: '0532 000 00 00' });
  });

  it('ödeme planını sözleşme çıktısının okuduğu alana yazar', async () => {
    const res = await post({
      companyId,
      signedDate: signedDate(),
      items: [{ description: 'Freze tezgahı', quantity: 1, unitPrice: 10_000, vatRate: 20 }],
      installments: [
        { label: 'Peşinat', amount: 4_000 },
        { label: 'Senetli vade', amount: 6_000, promissoryNote: true },
      ],
    });

    expect(res.status).toBe(201);
    const receivables = res.body.documentSnapshot.receivables;
    expect(receivables).toHaveLength(2);
    expect(receivables[0]).toMatchObject({ notes: 'Peşinat', amount: 4_000 });
    expect(receivables[1]).toMatchObject({ notes: 'Senetli vade', amount: 6_000 });
  });

  it('firma bilgisi olmayan sözleşmeyi reddeder', async () => {
    const res = await post({
      signedDate: signedDate(),
      items: [{ description: 'Yedek parça', quantity: 1, unitPrice: 100, vatRate: 20 }],
    });
    expect(res.status).toBe(422);
  });

  it('brüt tutarını aşan satır iskontosunu reddeder', async () => {
    const res = await post({
      companyId,
      signedDate: signedDate(),
      items: [{ description: 'Yedek parça', quantity: 1, unitPrice: 100, discountAmount: 250, vatRate: 20 }],
    });
    expect(res.status).toBe(422);
  });

  it('kalemsiz sözleşmeyi reddeder', async () => {
    const res = await post({ companyId, signedDate: signedDate(), items: [] });
    expect(res.status).toBe(422);
  });

  it('teslim gün aralığı ters verilirse reddeder', async () => {
    const res = await post({
      companyId,
      signedDate: signedDate(),
      items: [{ description: 'Tezgah', quantity: 1, unitPrice: 100, vatRate: 20 }],
      estimatedDeliveryDaysMin: 120,
      estimatedDeliveryDaysMax: 30,
    });
    expect(res.status).toBe(422);
  });

  it('teklifsiz sözleşmeyi günceller ve dokunulmayan alanları korur', async () => {
    const created = await post({
      companyName: 'GÜNCELLENECEK SÖZLEŞME A.Ş.',
      companyTaxOffice: 'Bayrampaşa',
      contactName: 'Mehmet Demir',
      signedDate: signedDate(),
      items: [{ description: 'İlk kalem', quantity: 1, unitPrice: 1_000, vatRate: 20 }],
      paymentTerms: '%50 peşin',
      deliveryLocation: 'İstanbul',
      paymentTermDays: 60,
    });
    expect(created.status).toBe(201);

    const updated = await supertest(app.getHttpServer())
      .patch(`/api/v1/contracts/standalone/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ description: 'İlk kalem', quantity: 2, unitPrice: 1_200, vatRate: 20 }] });

    expect(updated.status).toBe(200);
    expect(updated.body.documentSnapshot.quote).toMatchObject({ subtotal: 2_400, vatAmount: 480, grandTotal: 2_880 });
    // Gönderilmeyen alanlar mevcut belgeden korunmalı.
    expect(updated.body.companyNameText).toBe('GÜNCELLENECEK SÖZLEŞME A.Ş.');
    expect(updated.body.documentSnapshot.company.taxOffice).toBe('Bayrampaşa');
    expect(updated.body.documentSnapshot.contact.fullName).toBe('Mehmet Demir');
    expect(updated.body.documentSnapshot.terms.paymentTermsText).toBe('%50 peşin');
    expect(updated.body.documentSnapshot.terms.deliveryLocation).toBe('İstanbul');
    expect(updated.body.documentSnapshot.terms.vatIncluded).toBe(false);
    expect(updated.body.paymentTermDays).toBe(60);
    expect(updated.body.contractNo).toBe(created.body.contractNo);
  });

  it('teklifsiz sözleşmeyi teklif sözleşmesi ucundan güncellemeyi reddeder', async () => {
    const created = await post({
      companyId,
      signedDate: signedDate(),
      items: [{ description: 'Kalem', quantity: 1, unitPrice: 500, vatRate: 20 }],
    });
    expect(created.status).toBe(201);

    const res = await supertest(app.getHttpServer())
      .patch(`/api/v1/contracts/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ signedDate: signedDate() });
    expect(res.status).toBe(422);
  });

  it('teklife bağlı sözleşmeyi hızlı sözleşme ucundan güncellemeyi reddeder', async () => {
    const list = await supertest(app.getHttpServer())
      .get('/api/v1/contracts?pageSize=200')
      .set('Authorization', `Bearer ${adminToken}`);
    const quoteBound = list.body.data.find((row: { quoteId?: string | null }) => row.quoteId);
    if (!quoteBound) return; // Teklife bağlı sözleşme yoksa doğrulanacak bir şey yok.

    const res = await supertest(app.getHttpServer())
      .patch(`/api/v1/contracts/standalone/${quoteBound.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ description: 'X', quantity: 1, unitPrice: 10, vatRate: 20 }] });
    expect(res.status).toBe(422);
  });

  it('listede teklifsiz sözleşmenin firmasını belgenin kendi sütunundan çözer', async () => {
    const created = await post({
      companyId,
      signedDate: signedDate(),
      currencyCode: 'EUR',
      items: [{ description: 'Liste kalemi', quantity: 1, unitPrice: 750, vatRate: 20 }],
    });
    expect(created.status).toBe(201);

    const list = await supertest(app.getHttpServer())
      .get('/api/v1/contracts?pageSize=200')
      .set('Authorization', `Bearer ${adminToken}`);
    const row = list.body.data.find((item: { id: string }) => item.id === created.body.id);
    expect(row).toBeTruthy();
    expect(row.company?.id).toBe(companyId);
    expect(row.currency?.code).toBe('EUR');
  });
});
