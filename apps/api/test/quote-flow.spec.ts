import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken: string;
let adminUserId: string;
let companyId: string;
let companyAddressId: string;
let opportunityId: string;
let quoteId: string;
let quoteBusinessLine: string;
let proformaId: string;
let contractId: string;
let quoteItemId: string;
let productModelId: string;
let productFullName: string;
let productBasePrice: number;

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  adminToken = login.body.accessToken;
  adminUserId = login.body.user.id;
  const r = await supertest(app.getHttpServer()).get('/api/v1/companies?pageSize=100').set('Authorization', `Bearer ${adminToken}`);
  const company = r.body.data.find((item: { addresses?: unknown[] }) => (item.addresses?.length ?? 0) > 0);
  if (!company) throw new Error('PDF adresi testi için adresi olan firma bulunamadı');
  companyId = company.id;
  companyAddressId = company.addresses.find((address: { isBilling?: boolean }) => address.isBilling)?.id
    ?? company.addresses[0].id;
  const productList = await supertest(app.getHttpServer())
    .get('/api/v1/products?pageSize=100')
    .set('Authorization', `Bearer ${adminToken}`);
  const pricedProduct = productList.body.data.find((product: { cashPrice?: unknown; listPrice?: unknown }) =>
    Number(product.cashPrice ?? product.listPrice ?? 0) > 0
  );
  if (!pricedProduct) throw new Error('Fiyat onayı testi için fiyatlı ürün bulunamadı');
  productModelId = pricedProduct.id;
  productFullName = pricedProduct.fullName;
  productBasePrice = Number(pricedProduct.cashPrice ?? pricedProduct.listPrice);
});

afterAll(async () => {
  await app.close();
});

describe('ERP flow', () => {
  it('creates an opportunity in the lead stage, the first step of the flow', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyId,
        title: 'Test opp',
        ownerUserId: adminUserId,
        estimatedValue: 100000,
        currencyCode: 'USD',
        probability: 50,
        paymentMethod: 'leasing',
      });
    expect(r.status).toBe(201);
    expect(r.body.stage?.code).toBe('lead');
    expect(r.body.qualificationStage).toBe('lead');
    expect(r.body.paymentMethod).toBe('leasing');
    opportunityId = r.body.id;
  });

  it('moves the new opportunity on to the C field', async () => {
    const move = await supertest(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/qualification-stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStage: 'c' });
    expect(move.status).toBe(200);

    const r = await supertest(app.getHttpServer())
      .get(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.stage?.code).toBe('sales');
    expect(r.body.qualificationStage).toBe('c');
  });

  it('refuses to go directly from sales → contract (skipping quote)', async () => {
    const r = await supertest(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStage: 'contract' });
    expect([422, 400]).toContain(r.status);
  });

  it('creates a quote on the opportunity and recalculates totals', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyId, companyAddressId, opportunityId, quoteDate: new Date().toISOString(), currencyCode: 'USD' });
    expect(r.status).toBe(201);
    quoteId = r.body.id;
    quoteBusinessLine = r.body.businessLine;
    expect(['CNC', 'UNI', 'SACISLE']).toContain(quoteBusinessLine);
    expect(r.body.companyAddressId).toBe(companyAddressId);
    expect(r.body.documentNo).toMatch(new RegExp(`^${quoteBusinessLine}-\\d{4}/\\d{3}$`));

    const item = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${quoteId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productModelId,
        description: `CNC-${'UZUNOZELLIK'.repeat(175)}`,
        quantity: 1,
        unitPrice: 100000,
        discountAmount: 5000,
        vatRate: 20,
        sortOrder: 0,
    });
    expect(item.status).toBe(201);
    quoteItemId = item.body.id;

    const got = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(got.status).toBe(200);
    // subtotal = 100000 - 5000 = 95000; vat = 19000; grand = 114000
    expect(Number(got.body.subtotal)).toBe(95000);
    expect(Number(got.body.vatAmount)).toBe(19000);
    expect(Number(got.body.grandTotal)).toBe(114000);
  });

  it('creates proforma, contract and commercial invoice in the quote business line series', async () => {
    const [proforma, contract, invoice] = await Promise.all([
      supertest(app.getHttpServer())
        .post('/api/v1/proformas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          quoteId,
          issueDate: new Date().toISOString(),
          statusCode: 'draft',
          items: [{ quoteItemId, unitPrice: 90_000, discountAmount: 7_000 }],
        }),
      supertest(app.getHttpServer())
        .post('/api/v1/contracts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          quoteId,
          signedDate: new Date().toISOString(),
          statusCode: 'draft',
          items: [{ quoteItemId, unitPrice: 90_000, discountAmount: 6_000 }],
        }),
      supertest(app.getHttpServer())
        .post('/api/v1/commercial-invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quoteId, invoiceDate: new Date().toISOString(), statusCode: 'draft' }),
    ]);

    expect(proforma.status).toBe(201);
    proformaId = proforma.body.id;
    expect(proforma.body.documentNo).toMatch(new RegExp(`^${quoteBusinessLine}-PRF-\\d{4}/\\d{3}$`));
    expect(proforma.body.documentSnapshot?.schemaVersion).toBe(4);
    expect(proforma.body.documentSnapshot?.items[0]).toMatchObject({
      id: quoteItemId,
      unitPrice: 90_000,
      discountAmount: 7_000,
      lineTotal: 83_000,
      vatAmount: 16_600,
    });
    expect(proforma.body.documentSnapshot?.quote).toMatchObject({
      discountTotal: 7_000,
      subtotal: 83_000,
      vatAmount: 16_600,
      grandTotal: 99_600,
    });
    expect(contract.status).toBe(201);
    contractId = contract.body.id;
    expect(contract.body.contractNo).toMatch(new RegExp(`^${quoteBusinessLine}-SOZ-\\d{4}/\\d{3}$`));
    expect(contract.body.documentSnapshot?.items[0]).toMatchObject({
      id: quoteItemId,
      unitPrice: 90_000,
      discountAmount: 6_000,
      lineTotal: 84_000,
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.invoiceNo).toMatch(new RegExp(`^${quoteBusinessLine}-FAT-\\d{4}/\\d{3}$`));
  });

  it('reprices a draft contract without nesting the previous snapshot', async () => {
    const first = await supertest(app.getHttpServer())
      .patch(`/api/v1/contracts/${contractId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ quoteItemId, unitPrice: 89_000 }] });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.documentSnapshot?.items[0]).toMatchObject({
      id: quoteItemId,
      unitPrice: 89_000,
      discountAmount: 6_000,
      lineTotal: 83_000,
    });
    expect(first.body.documentSnapshot).not.toHaveProperty('documentSnapshot');

    const second = await supertest(app.getHttpServer())
      .patch(`/api/v1/contracts/${contractId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ quoteItemId, unitPrice: 88_000 }] });
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(second.body.documentSnapshot?.items[0]).toMatchObject({
      id: quoteItemId,
      unitPrice: 88_000,
      discountAmount: 6_000,
      lineTotal: 82_000,
    });
    expect(second.body.documentSnapshot).not.toHaveProperty('documentSnapshot');

    // Yalnız sözleşme şartını değiştirmek, daha önce pazarlık edilen fiyatı
    // teklif fiyatına geri döndürmemeli.
    const termsOnly = await supertest(app.getHttpServer())
      .patch(`/api/v1/contracts/${contractId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ terms: { paymentTermsText: 'VADELI-ODEME' } });
    expect(termsOnly.status, JSON.stringify(termsOnly.body)).toBe(200);
    expect(termsOnly.body.documentSnapshot?.items[0]).toMatchObject({
      id: quoteItemId,
      unitPrice: 88_000,
      discountAmount: 6_000,
      lineTotal: 82_000,
    });
    expect(termsOnly.body.documentSnapshot?.terms).toMatchObject({
      paymentTermsText: 'VADELI-ODEME',
    });
  });

  it('keeps contract terms on the contract and leaves the quote terms untouched', async () => {
    // İmza masasında yazılan bir teslim şartı, eskiden bağlı teklifin
    // `quote_terms` kaydını yeniden yazıyor ve onaylı teklifin çıktısını da
    // geriye dönük değiştiriyordu. Şart artık belgenin kendi sütununda durur.
    const quoteTerms = await supertest(app.getHttpServer())
      .put(`/api/v1/quotes/${quoteId}/terms`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paymentTermsText: 'TEKLIF-ODEME',
        deliveryTermsText: 'TEKLIF-TESLIM',
        warrantyTermsText: 'TEKLIF-GARANTI',
        importCostsExcluded: true,
      });
    expect(quoteTerms.status).toBe(200);

    const contract = await supertest(app.getHttpServer())
      .post('/api/v1/contracts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        quoteId,
        signedDate: new Date().toISOString(),
        statusCode: 'draft',
        terms: { deliveryTermsText: 'SOZLESME-TESLIM', importCostsExcluded: false },
      });
    expect(contract.status).toBe(201);
    expect(contract.body.terms).toMatchObject({ deliveryTermsText: 'SOZLESME-TESLIM' });
    // Çıktı anlık görüntüden basılır; belgeye özel şart oraya da geçmeli.
    expect(contract.body.documentSnapshot?.terms).toMatchObject({
      deliveryTermsText: 'SOZLESME-TESLIM',
      importCostsExcluded: false,
    });

    const quoteAfter = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(quoteAfter.status).toBe(200);
    expect(quoteAfter.body.terms).toMatchObject({
      paymentTermsText: 'TEKLIF-ODEME',
      deliveryTermsText: 'TEKLIF-TESLIM',
      warrantyTermsText: 'TEKLIF-GARANTI',
    });

    // Şart gönderilmeyen sözleşme eskisi gibi teklifin şartlarıyla basılır.
    const plain = await supertest(app.getHttpServer())
      .post('/api/v1/contracts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quoteId, signedDate: new Date().toISOString(), statusCode: 'draft' });
    expect(plain.status).toBe(201);
    expect(plain.body.terms ?? null).toBeNull();
  });

  it('shows the product name and restores the quote to draft after price approval', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyId, companyAddressId, quoteDate: new Date().toISOString(), currencyCode: 'USD' });
    expect(created.status).toBe(201);

    const item = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${created.body.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productModelId,
        stockCode: 'LISTEDE-GORUNMEMELI',
        description: 'Eski stok kodu yerine ürün adı kullanılmalı',
        quantity: 1,
        unitPrice: Math.max(0.01, productBasePrice / 2),
        discountAmount: 0,
        vatRate: 20,
        sortOrder: 0,
      });
    expect(item.status).toBe(201);

    const pendingList = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes?search=${encodeURIComponent(created.body.documentNo)}&pageSize=10`)
      .set('Authorization', `Bearer ${adminToken}`);
    const pendingQuote = pendingList.body.data.find((quote: { id: string }) => quote.id === created.body.id);
    expect(pendingQuote?.status?.code).toBe('pending_super_admin_approval');
    expect(pendingQuote?.priceApprovalStatus).toBe('pending');
    expect(pendingQuote?.productName).toBe(productFullName);
    expect(pendingQuote?.productName).not.toBe('LISTEDE-GORUNMEMELI');

    const approved = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${created.body.id}/price-approval/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Test fiyat onayı' });
    expect(approved.status).toBe(201);
    expect(approved.body.priceApprovalStatus).toBe('approved');

    const approvedList = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes?search=${encodeURIComponent(created.body.documentNo)}&pageSize=10`)
      .set('Authorization', `Bearer ${adminToken}`);
    const approvedQuote = approvedList.body.data.find((quote: { id: string }) => quote.id === created.body.id);
    expect(approvedQuote?.status?.code).toBe('draft');
    expect(approvedQuote?.priceApprovalStatus).toBe('approved');
  });

  it('automatically routes only discounts above 10 percent to approval', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyId, companyAddressId, quoteDate: new Date().toISOString(), currencyCode: 'USD' });
    expect(created.status).toBe(201);

    const item = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${created.body.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'İndirim eşiği kontrol kalemi',
        quantity: 1,
        unitPrice: 1_000,
        discountAmount: 100,
        vatRate: 0,
        sortOrder: 0,
      });
    expect(item.status).toBe(201);

    const exactThreshold = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(exactThreshold.body.priceApprovalStatus).toBe('not_required');

    const aboveThreshold = await supertest(app.getHttpServer())
      .patch(`/api/v1/quotes/${created.body.id}/items/${item.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ discountAmount: 100.01 });
    expect(aboveThreshold.status).toBe(200);

    const pending = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(pending.body.priceApprovalStatus).toBe('pending');

    const restored = await supertest(app.getHttpServer())
      .patch(`/api/v1/quotes/${created.body.id}/items/${item.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ discountAmount: 100 });
    expect(restored.status).toBe(200);

    const noLongerPending = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(noLongerPending.body.priceApprovalStatus).toBe('not_required');
  });

  it('keeps multiple products in print order and rejects an excessive product discount', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyId, companyAddressId, quoteDate: new Date().toISOString(), currencyCode: 'USD' });
    expect(created.status).toBe(201);

    const excessiveDiscount = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${created.body.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productModelId,
        description: 'İskontosu geçersiz ürün',
        quantity: 1,
        unitPrice: 1_000,
        discountAmount: 1_001,
        vatRate: 0,
        sortOrder: 0,
      });
    expect([400, 422]).toContain(excessiveDiscount.status);

    const second = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${created.body.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'İkinci makine',
        quantity: 1,
        unitPrice: productBasePrice,
        discountAmount: 100,
        vatRate: 0,
        sortOrder: 10,
        compatibility: { lineGroupKey: 'machine-b' },
      });
    expect(second.status).toBe(201);

    const first = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${created.body.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productModelId,
        description: 'Birinci makine',
        quantity: 2,
        unitPrice: productBasePrice,
        discountAmount: 200,
        vatRate: 0,
        sortOrder: 0,
        compatibility: { lineGroupKey: 'machine-a' },
      });
    expect(first.status).toBe(201);

    const got = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(got.status).toBe(200);
    expect(got.body.items.map((item: { description: string }) => item.description)).toEqual([
      'Birinci makine',
      'İkinci makine',
    ]);
    expect(got.body.items.map((item: { compatibility?: { lineGroupKey?: string } }) => item.compatibility?.lineGroupKey)).toEqual([
      'machine-a',
      'machine-b',
    ]);
    const listed = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes?search=${encodeURIComponent(created.body.documentNo)}&pageSize=10`)
      .set('Authorization', `Bearer ${adminToken}`);
    const listedQuote = listed.body.data.find((quote: { id: string }) => quote.id === created.body.id);
    expect(listedQuote?.productName).toContain(productFullName);
    expect(listedQuote?.productName).toContain('İkinci makine');
  });

  it('refuses to send an itemless quote', async () => {
    const draft = await supertest(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyId, quoteDate: new Date().toISOString(), currencyCode: 'USD' });
    expect(draft.status).toBe(201);

    const sent = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${draft.body.id}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect([400, 422]).toContain(sent.status);
  });

  it('stores quote waiting status and its follow-up reminder', async () => {
    const draft = await supertest(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyId, quoteDate: new Date().toISOString(), currencyCode: 'USD' });
    expect(draft.status).toBe(201);

    const missingReminder = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${draft.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusCode: 'budget_waiting' });
    expect([400, 422]).toContain(missingReminder.status);

    const followUpAt = new Date(Date.now() + 86_400_000).toISOString();
    const waiting = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${draft.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusCode: 'budget_waiting', followUpAt, note: 'Müşteri bütçe onayı verecek' });
    expect(waiting.status).toBe(201);
    expect(new Date(waiting.body.followUpAt).toISOString()).toBe(followUpAt);
    expect(waiting.body.statusNote).toBe('Müşteri bütçe onayı verecek');

    const listed = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes?search=${encodeURIComponent(draft.body.documentNo)}&pageSize=10`)
      .set('Authorization', `Bearer ${adminToken}`);
    const listedQuote = listed.body.data.find((quote: { id: string }) => quote.id === draft.body.id);
    expect(listedQuote?.status?.code).toBe('budget_waiting');

    const activities = await supertest(app.getHttpServer())
      .get(`/api/v1/activities?companyId=${companyId}&pageSize=100`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activities.status, JSON.stringify(activities.body)).toBe(200);
    expect(
      activities.body.data.find((activity: { subject: string }) =>
        activity.subject.startsWith(`${draft.body.documentNo} teklif takibi —`),
      ),
    ).toMatchObject({ origin: 'system' });
  });

  it('snapshots sent commercial documents and prevents later mutation or deletion', async () => {
    const repriced = await supertest(app.getHttpServer())
      .patch(`/api/v1/proformas/${proformaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: [{ quoteItemId, unitPrice: 88_000 }] });
    expect(repriced.status).toBe(200);
    expect(repriced.body.documentSnapshot?.items[0]).toMatchObject({
      unitPrice: 88_000,
      discountAmount: 7_000,
      lineTotal: 81_000,
    });

    const termsOnly = await supertest(app.getHttpServer())
      .patch(`/api/v1/proformas/${proformaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ terms: { deliveryTermsText: 'PROFORMA-TESLIM' } });
    expect(termsOnly.status, JSON.stringify(termsOnly.body)).toBe(200);
    expect(termsOnly.body.documentSnapshot?.items[0]).toMatchObject({
      unitPrice: 88_000,
      discountAmount: 7_000,
      lineTotal: 81_000,
    });

    const finalized = await supertest(app.getHttpServer())
      .patch(`/api/v1/proformas/${proformaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ statusCode: 'sent' });
    expect(finalized.status).toBe(200);
    expect(finalized.body.finalizedAt).toBeTruthy();
    expect(finalized.body.documentSnapshot?.company).toBeTruthy();
    expect(finalized.body.documentSnapshot?.companyAddresses?.[0]?.id).toBe(companyAddressId);
    expect(finalized.body.documentSnapshot?.items).toHaveLength(1);
    expect(finalized.body.documentSnapshot?.schemaVersion).toBe(4);
    expect(finalized.body.documentSnapshot?.items[0]?.unitCode).toBe('adet');
    expect(finalized.body.documentSnapshot?.items[0]?.product?.id).toBe(productModelId);
    expect(finalized.body.documentSnapshot?.items[0]?.product?.brandName).toBeTruthy();

    const changed = await supertest(app.getHttpServer())
      .patch(`/api/v1/proformas/${proformaId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ issueDate: new Date(Date.now() + 86_400_000).toISOString() });
    expect(changed.status).toBe(409);

    const removed = await supertest(app.getHttpServer())
      .delete(`/api/v1/proformas/${proformaId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(removed.status).toBe(409);
  });

  it('snapshots sent quotes and requires a new revision for changes', async () => {
    const sent = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${quoteId}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sent.status).toBe(201);

    const got = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(got.status).toBe(200);
    expect(got.body.finalizedAt).toBeTruthy();
    expect(got.body.documentSnapshot?.items).toHaveLength(1);
    expect(got.body.documentSnapshot?.companyAddresses?.[0]?.id).toBe(companyAddressId);

    const pdf = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${quoteId}/generate-pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(201);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    expect((pdf.body.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);

    const changed = await supertest(app.getHttpServer())
      .patch(`/api/v1/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Bu değişiklik kesinleşmiş teklife uygulanmamalı' });
    expect(changed.status).toBe(409);

    const approved = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${quoteId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(approved.status).toBe(201);

    const approvedAgain = await supertest(app.getHttpServer())
      .post(`/api/v1/quotes/${quoteId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(approvedAgain.status).toBe(201);

    const listed = await supertest(app.getHttpServer())
      .get(`/api/v1/quotes?search=${encodeURIComponent(got.body.documentNo)}&pageSize=10`)
      .set('Authorization', `Bearer ${adminToken}`);
    const listedQuote = listed.body.data.find((quote: { id: string }) => quote.id === quoteId);
    expect(listedQuote?.status?.code).toBe('approved');
  });

  it('does not soft-delete a company that has historical documents', async () => {
    const removed = await supertest(app.getHttpServer())
      .delete(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(removed.status).toBe(409);
    const companies = await supertest(app.getHttpServer())
      .get('/api/v1/companies?pageSize=100')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(companies.body.data.some((company: { id: string }) => company.id === companyId)).toBe(true);
  });

  it('keeps sales → quote gated when discovery evidence is still missing', async () => {
    const r = await supertest(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStage: 'quote' });
    expect(r.status).toBe(422);
    const unchanged = await supertest(app.getHttpServer())
      .get(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.stage?.code).toBe('sales');
  });

  it('cancels opportunity with required reason', async () => {
    const r = await supertest(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunityId}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStage: 'cancelled', cancellationReasonCode: 'budget' });
    expect(r.status).toBe(200);
    expect(r.body.stage?.code).toBe('cancelled');
  });

  it('rejects cancelled stage without reason', async () => {
    // new opportunity for this test
    const create = await supertest(app.getHttpServer())
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ companyId, title: 'Test opp 2', currencyCode: 'USD', probability: 50 });
    const id = create.body.id;
    const r = await supertest(app.getHttpServer())
      .patch(`/api/v1/opportunities/${id}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStage: 'cancelled' });
    expect([422, 400]).toContain(r.status);
  });
});
