import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { INSTALLATION_FORM_DEFAULT_CHECKS } from '@haksan/shared';

let app: NestFastifyApplication;
let adminToken: string;
let salesToken: string;
let companyId: string;
let adminUserId: string;
let customerDeviceId: string;
let productModelId: string;
let warehouseId: string;
const auth = () => `Bearer ${adminToken}`;
const now = () => new Date().toISOString();

async function createInventoryItem(serialNumber: string, parentInventoryItemId?: string) {
  const created = await supertest(app.getHttpServer())
    .post('/api/v1/inventory')
    .set('Authorization', auth())
    .send({
      productModelId,
      parentInventoryItemId,
      serialNumber,
      stockStatusCode: 'available',
      warehouseId,
    });
  expect(created.status).toBe(201);
  return created.body;
}

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  adminToken = login.body.accessToken;
  const salesLogin = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'sales@haksan.local', password: 'sales12345' });
  salesToken = salesLogin.body.accessToken;
  const me = await supertest(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', auth());
  adminUserId = me.body.user.id;
  const r = await supertest(app.getHttpServer()).get('/api/v1/companies').set('Authorization', auth());
  companyId = r.body.data[0].id;
  const productList = await supertest(app.getHttpServer())
    .get('/api/v1/products?pageSize=10&categoryCode=TEZGAH')
    .set('Authorization', auth());
  productModelId = productList.body.data[0]?.id;
  if (!productModelId) {
    const fallbackProducts = await supertest(app.getHttpServer()).get('/api/v1/products?pageSize=1').set('Authorization', auth());
    productModelId = fallbackProducts.body.data[0].id;
  }
  const warehouses = await supertest(app.getHttpServer()).get('/api/v1/warehouses').set('Authorization', auth());
  warehouseId = warehouses.body[0].id;
  const device = await supertest(app.getHttpServer())
    .post('/api/v1/customer-devices')
    .set('Authorization', auth())
    .send({
      companyId,
      installationDate: now(),
      warrantyStartDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      warrantyEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      notes: 'Vitest garanti cihazı',
    });
  customerDeviceId = device.body.id;
});

afterAll(async () => {
  await app.close();
});

describe('Service — kurulum / sevkiyat / teslimat', () => {
  it('servis talebi oluşturur ve atama/metadata alanlarını kaydeder', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/service-tickets')
      .set('Authorization', auth())
      .send({
        companyId,
        subject: 'Test servis talebi',
        description: 'Test arıza açıklaması',
        severity: 'normal',
        assignedToUserId: adminUserId,
        metadata: { quoteRequired: true },
      });
    expect(r.status).toBe(201);
    expect(r.body.companyId).toBe(companyId);
    expect(r.body.subject).toBe('Test servis talebi');
    expect(r.body.ticketNo).toMatch(/^(CNC|UNI|SACISLE)-SRV-\d{4}\/\d{4}$/);
    expect(r.body.assignedToUserId).toBe(adminUserId);
    expect(r.body.metadata.quoteRequired).toBe(true);
  });

  it('servis talebini arşivler ve listeden düşürür', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/service-tickets')
      .set('Authorization', auth())
      .send({
        companyId,
        subject: 'Silinecek servis talebi',
        description: 'Soft delete regresyon testi',
        severity: 'normal',
      });
    expect(created.status).toBe(201);

    const deleted = await supertest(app.getHttpServer())
      .delete(`/api/v1/service-tickets/${created.body.id}`)
      .set('Authorization', auth());
    expect(deleted.status).toBe(200);
    expect(deleted.body.ok).toBe(true);

    const list = await supertest(app.getHttpServer())
      .get('/api/v1/service-tickets?pageSize=100')
      .set('Authorization', auth());
    expect(list.status).toBe(200);
    expect(list.body.data.some((row: any) => row.id === created.body.id)).toBe(false);
  });

  it('tamamlanan servis verilerini Doktor Makina servis formu PDF çıktısına dönüştürür', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/service-tickets')
      .set('Authorization', auth())
      .send({
        companyId,
        customerDeviceId,
        subject: 'Spindle alarmı',
        description: 'Makine çalışırken spindle alarmı veriyor.',
        severity: 'high',
        assignedToUserId: adminUserId,
        metadata: {
          serviceStage: 'Service Completed',
          timerElapsedSeconds: 7200,
          serviceHourlyRate: 150,
          serviceCurrency: 'EUR',
        },
      });
    expect(created.status).toBe(201);

    const completionForm = {
      formNo: created.body.ticketNo,
      kurulumTarihi: '2026-07-10',
      kullanici: { firma: 'PDF Test Firması', ilgili: 'Test Yetkilisi' },
      musteriSikayeti: 'Spindle alarmı nedeniyle tezgah duruyor.',
      serviceType: 'ariza',
      responsibility: 'ucretli',
      yapilanIsler: Array.from({ length: 13 }, (_, index) => `Servis işlemi ${index + 1}`).join('\n'),
      degisenParcalar: Array.from({ length: 13 }, (_, index) => ({
        id: `part-${index + 1}`,
        description: `Servis parçası ${index + 1}`,
        quantity: 1,
        unitPrice: 75,
      })),
      servisUcreti: 300,
      ulasimUcreti: 40,
      currency: 'EUR',
      kurulumuYapan: 'Servis Teknisyeni',
      teslimAlan: 'Test Yetkilisi',
      checks: [],
    };
    const saved = await supertest(app.getHttpServer())
      .patch(`/api/v1/service-tickets/${created.body.id}`)
      .set('Authorization', auth())
      .send({ metadata: { completionForm } });
    expect(saved.status).toBe(200);
    expect(saved.body.metadata.completionForm.degisenParcalar).toHaveLength(13);

    const pdf = await supertest(app.getHttpServer())
      .get(`/api/v1/service-tickets/${created.body.id}/service-form.pdf`)
      .set('Authorization', auth())
      .buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('inline');
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.body.toString('latin1')).toMatch(/\/Count\s+3\b/);
  });

  it('servis teklif formu olmadan bakım/onarım aşamasına geçişi reddeder', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/service-tickets')
      .set('Authorization', auth())
      .send({
        companyId,
        subject: 'Servis teklif zorunluluğu testi',
        severity: 'normal',
        metadata: { quoteRequired: true, serviceStage: 'Quote Sent' },
      });
    expect(created.status).toBe(201);

    const denied = await supertest(app.getHttpServer())
      .patch(`/api/v1/service-tickets/${created.body.id}/status`)
      .set('Authorization', auth())
      .send({ statusCode: 'in_progress', serviceStage: 'Scheduled' });
    expect(denied.status).toBe(422);

    const quote = {
      quoteNo: 'SRV-2026/TEST',
      date: '2026-06-23',
      validity: '5 İş Günü',
      writerName: 'Test Kullanıcı',
      company: 'Test Firma',
      subject: 'Test servis teklifi kapsamı',
      currency: 'USD',
      vatRate: 20,
      vatAmount: 0,
      noteVariantKey: 'teknik-servis',
      notes: ['Test notu'],
      items: [{ id: 'line-1', description: 'ATC Tool Gripper', quantity: 1, unit: 'Ad.', unitPrice: 150 }],
    };
    const saved = await supertest(app.getHttpServer())
      .patch(`/api/v1/service-tickets/${created.body.id}`)
      .set('Authorization', auth())
      .send({ metadata: { serviceQuote: quote } });
    expect(saved.status).toBe(200);
    expect(saved.body.metadata.serviceQuote.quoteNo).toMatch(new RegExp(`^${created.body.businessLine}-`));

    const moved = await supertest(app.getHttpServer())
      .patch(`/api/v1/service-tickets/${created.body.id}/status`)
      .set('Authorization', auth())
      .send({ statusCode: 'in_progress', serviceStage: 'Scheduled' });
    expect(moved.status).toBe(200);
  });

  it('garanti servis talebi oluşturunca garanti/RMA dosyası taslağı açar', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/service-tickets')
      .set('Authorization', auth())
      .send({
        companyId,
        customerDeviceId,
        subject: 'Garanti test talebi',
        description: 'Garanti kapsamında değerlendirme',
        severity: 'normal',
        ticketType: 'warranty_claim',
      });
    expect(created.status).toBe(201);
    expect(created.body.ticketType).toBe('warranty_claim');

    const warranty = await supertest(app.getHttpServer())
      .get(`/api/v1/service-tickets/${created.body.id}/warranty`)
      .set('Authorization', auth());
    expect(warranty.status).toBe(200);
    expect(warranty.body.serviceTicketId).toBe(created.body.id);
    expect(warranty.body.status).toBe('draft');
    expect(warranty.body.coverageSuggestion).toBe('in_warranty');
    expect(warranty.body.parts).toEqual([]);
  });

  it('makinesiz garanti dosyasını onaya göndermeyi reddeder', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/service-tickets')
      .set('Authorization', auth())
      .send({
        companyId,
        subject: 'Makinesiz garanti talebi',
        description: 'Cihaz eşleşmesi yok',
        ticketType: 'warranty_claim',
      });
    expect(created.status).toBe(201);

    const submit = await supertest(app.getHttpServer())
      .post(`/api/v1/service-tickets/${created.body.id}/warranty/submit`)
      .set('Authorization', auth())
      .send({});
    expect(submit.status).toBe(422);
  });

  it('garanti kararlarını approve/reject yetkisiyle sınırlar', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/service-tickets')
      .set('Authorization', auth())
      .send({
        companyId,
        customerDeviceId,
        subject: 'Garanti onay testi',
        ticketType: 'warranty_claim',
      });
    expect(created.status).toBe(201);

    const denied = await supertest(app.getHttpServer())
      .post(`/api/v1/service-tickets/${created.body.id}/warranty/approve`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ decisionNote: 'Yetkisiz deneme' });
    expect(denied.status).toBe(403);

    const approved = await supertest(app.getHttpServer())
      .post(`/api/v1/service-tickets/${created.body.id}/warranty/approve`)
      .set('Authorization', auth())
      .send({ decisionNote: 'Kapsam içi onaylandı' });
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.coverageDecision).toBe('approved');
    expect(approved.body.managerDecisionNote).toBe('Kapsam içi onaylandı');
  });

  it('public şikayet linkinden intake oluşturur, servis talebini otomatik açmaz', async () => {
    const link = await supertest(app.getHttpServer())
      .post('/api/v1/service-complaint-links')
      .set('Authorization', auth())
      .send({ companyId, customerDeviceId, title: 'Vitest Şikayet Formu' });
    expect(link.status).toBe(201);
    expect(link.body.publicPath).toContain('/public/service-complaints/');
    expect(link.body.token).toBeTruthy();

    const form = await supertest(app.getHttpServer()).get(`/api/v1${link.body.publicPath}`);
    expect(form.status).toBe(200);
    expect(form.body.company.id).toBe(companyId);

    const created = await supertest(app.getHttpServer())
      .post(`/api/v1${link.body.publicPath}`)
      .send({
        source: 'qr',
        subject: 'QR public şikayet',
        description: 'Makinede alarm var',
        severity: 'high',
        ticketType: 'complaint',
        contactName: 'Public Müşteri',
        contactPhone: '+905551112233',
        contactEmail: 'public@example.com',
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('new');

    const list = await supertest(app.getHttpServer())
      .get('/api/v1/service-complaints?source=qr&pageSize=50')
      .set('Authorization', auth());
    expect(list.status).toBe(200);
    const intake = list.body.data.find((row: any) => row.id === created.body.id);
    expect(intake).toBeTruthy();
    expect(intake.serviceTicketId).toBeNull();
    expect(intake.serviceTicket).toBeNull();
  });

  it('iç personel şikayet kaydı açar, incelemeye alır ve servis talebine çevirir', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/service-complaints')
      .set('Authorization', auth())
      .send({
        companyId,
        customerDeviceId,
        source: 'phone',
        subject: 'Telefonla gelen şikayet',
        description: 'Operatör duruş bildirdi',
        severity: 'critical',
        ticketType: 'request',
        contactName: 'Test Operatör',
        contactPhone: '+905550000000',
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('new');
    expect(created.body.source).toBe('phone');

    const reviewing = await supertest(app.getHttpServer())
      .patch(`/api/v1/service-complaints/${created.body.id}`)
      .set('Authorization', auth())
      .send({ status: 'reviewing' });
    expect(reviewing.status).toBe(200);
    expect(reviewing.body.status).toBe('reviewing');

    const converted = await supertest(app.getHttpServer())
      .post(`/api/v1/service-complaints/${created.body.id}/convert`)
      .set('Authorization', auth())
      .send({ assignedToUserId: adminUserId });
    expect(converted.status).toBe(201);
    expect(converted.body.status).toBe('converted');
    expect(converted.body.serviceTicketId).toBeTruthy();
    expect(converted.body.serviceTicket.ticketNo).toMatch(/^[A-Z]+-SRV-\d{4}\/\d{4}$/);

    const duplicate = await supertest(app.getHttpServer())
      .post(`/api/v1/service-complaints/${created.body.id}/convert`)
      .set('Authorization', auth())
      .send({});
    expect(duplicate.status).toBe(422);
  });

  it('firma eşleşmeyen intake convert edilemez ve şikayet reddedilebilir', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/service-complaints')
      .set('Authorization', auth())
      .send({
        source: 'whatsapp',
        subject: 'Eşleşmemiş WhatsApp şikayeti',
        description: 'Firma sonradan eşlenecek',
        severity: 'normal',
      });
    expect(created.status).toBe(201);

    const denied = await supertest(app.getHttpServer())
      .post(`/api/v1/service-complaints/${created.body.id}/convert`)
      .set('Authorization', auth())
      .send({});
    expect(denied.status).toBe(422);

    const rejected = await supertest(app.getHttpServer())
      .post(`/api/v1/service-complaints/${created.body.id}/reject`)
      .set('Authorization', auth())
      .send({ rejectionNote: 'Firma ve makine bilgisi doğrulanamadı' });
    expect(rejected.status).toBe(201);
    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.rejectionNote).toBe('Firma ve makine bilgisi doğrulanamadı');
  });

  it('garanti tipindeki intake convert edilince garanti/RMA taslağı oluşturur', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/service-complaints')
      .set('Authorization', auth())
      .send({
        companyId,
        customerDeviceId,
        source: 'email',
        subject: 'Garanti kapsamında şikayet',
        description: 'Parça değişimi talebi',
        severity: 'high',
        ticketType: 'warranty_claim',
      });
    expect(created.status).toBe(201);

    const converted = await supertest(app.getHttpServer())
      .post(`/api/v1/service-complaints/${created.body.id}/convert`)
      .set('Authorization', auth())
      .send({});
    expect(converted.status).toBe(201);
    expect(converted.body.serviceTicketId).toBeTruthy();

    const warranty = await supertest(app.getHttpServer())
      .get(`/api/v1/service-tickets/${converted.body.serviceTicketId}/warranty`)
      .set('Authorization', auth());
    expect(warranty.status).toBe(200);
    expect(warranty.body.status).toBe('draft');
    expect(warranty.body.coverageSuggestion).toBe('in_warranty');
  });

  it('kurulum oluşturur ve ücret yazmaz', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/installations')
      .set('Authorization', auth())
      .send({ companyId, locationType: 'istanbul_ici', durationMinutes: 90, scheduledDate: now() });
    expect(r.status).toBe(201);
    expect(r.body.feeAmount).toBeNull();
  });

  it('kurulum tamamlamadan önce tutanak kontrol ve problem alanlarını zorunlu tutar', async () => {
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/installations')
      .set('Authorization', auth())
      .send({ companyId, locationType: 'istanbul_ici', durationMinutes: 90, scheduledDate: now() });
    expect(created.status).toBe(201);

    const denied = await supertest(app.getHttpServer())
      .patch(`/api/v1/installations/${created.body.id}/status`)
      .set('Authorization', auth())
      .send({ statusCode: 'completed', installationDate: now() });
    expect(denied.status).toBe(422);

    const formData = {
      formNo: 'KRL-TEST',
      problem: { hasProblem: false },
      checks: INSTALLATION_FORM_DEFAULT_CHECKS.map((check) => ({
        id: check.id,
        label: check.label,
        status: 'done',
      })),
    };
    const completed = await supertest(app.getHttpServer())
      .patch(`/api/v1/installations/${created.body.id}/status`)
      .set('Authorization', auth())
      .send({ statusCode: 'completed', installationDate: now(), formData });
    expect(completed.status).toBe(200);
    expect(completed.body.completedAt).toBeTruthy();
  });

  it('var olmayan companyId ile kurulum reddedilir (tenant izolasyonu)', async () => {
    const r = await supertest(app.getHttpServer())
      .post('/api/v1/installations')
      .set('Authorization', auth())
      .send({ companyId: '00000000-0000-0000-0000-000000000000', locationType: 'istanbul_ici', durationMinutes: 60 });
    expect([403, 404]).toContain(r.status);
  });

  it('opsiyonel donanımı bağımsız ve tezgaha bağlı stoklar', async () => {
    const machine = await createInventoryItem(`VITEST-MACHINE-${Date.now()}`);
    const standaloneOption = await createInventoryItem(`VITEST-OPT-FREE-${Date.now()}`);
    expect(standaloneOption.parentInventoryItemId).toBeNull();

    const linkedOption = await createInventoryItem(`VITEST-OPT-LINK-${Date.now()}`, machine.id);
    expect(linkedOption.parentInventoryItemId).toBe(machine.id);
  });

  it('seri no çözülmeden sevkiyat başlatmayı reddeder', async () => {
    const c = await supertest(app.getHttpServer())
      .post('/api/v1/shipments')
      .set('Authorization', auth())
      .send({
        carrier: 'DHL',
        trackingNo: `TRK-NOSERIAL-${Date.now()}`,
        origin: 'Hamburg',
        destinationWarehouseId: warehouseId,
        statusCode: 'preparing',
        items: [{ productModelId, description: 'Seri no bekleyen ürün', quantity: 1 }],
      });
    expect(c.status).toBe(201);

    const start = await supertest(app.getHttpServer())
      .post(`/api/v1/shipments/${c.body.id}/start`)
      .set('Authorization', auth())
      .send({ loadingDate: now() });
    expect(start.status).toBe(422);
  });

  it('sevkiyat başlatınca stokları yolda/on_road yapar ve tamamlayınca seçilen depoya alır', async () => {
    const serialNumber = `VITEST-SHIP-${Date.now()}`;
    const item = await createInventoryItem(serialNumber);
    const c = await supertest(app.getHttpServer())
      .post('/api/v1/shipments')
      .set('Authorization', auth())
      .send({
        companyId,
        direction: 'incoming',
        carrier: 'DHL',
        trackingNo: `TRK-TEST-${Date.now()}`,
        origin: 'Hamburg',
        destinationWarehouseId: warehouseId,
        transportMode: 'road',
        productCategoryCode: 'TEZGAH',
        statusCode: 'preparing',
        items: [
          {
            inventoryItemId: item.id,
            productModelId,
            description: 'CNC Torna Tezgahı',
            serialNumber,
            quantity: 1,
            packageCount: 1,
            palletCount: 1,
            packageLengthCm: 120,
            packageWidthCm: 80,
            packageHeightCm: 160,
            grossWeightKg: 900,
          },
        ],
      });
    expect(c.status).toBe(201);

    const started = await supertest(app.getHttpServer())
      .post(`/api/v1/shipments/${c.body.id}/start`)
      .set('Authorization', auth())
      .send({ loadingDate: now() });
    expect(started.status).toBe(201);
    expect(started.body.status.code).toBe('in_transit');

    const inTransit = await supertest(app.getHttpServer())
      .get(`/api/v1/inventory?search=${encodeURIComponent(serialNumber)}&pageSize=5`)
      .set('Authorization', auth());
    expect(inTransit.status).toBe(200);
    expect(inTransit.body.data[0].status.code).toBe('in_transit');
    expect(inTransit.body.data[0].locationStatus.code).toBe('on_road');

    const delivered = await supertest(app.getHttpServer())
      .patch(`/api/v1/shipments/${c.body.id}/status`)
      .set('Authorization', auth())
      .send({ statusCode: 'delivered', destinationWarehouseId: warehouseId, arrivedAt: now() });
    expect(delivered.status).toBe(200);

    const received = await supertest(app.getHttpServer())
      .get(`/api/v1/inventory?search=${encodeURIComponent(serialNumber)}&pageSize=5`)
      .set('Authorization', auth());
    expect(received.body.data[0].status.code).toBe('available');
    expect(received.body.data[0].locationStatus.code).toBe('at_warehouse');
    expect(received.body.data[0].warehouse.id).toBe(warehouseId);
  });

  it('teslimat oluşturur ve durumunu günceller', async () => {
    const c = await supertest(app.getHttpServer())
      .post('/api/v1/deliveries')
      .set('Authorization', auth())
      .send({ companyId, deliveryDate: now(), signedBy: 'Test Kişi', status: 'pending' });
    expect(c.status).toBe(201);
    const u = await supertest(app.getHttpServer())
      .patch(`/api/v1/deliveries/${c.body.id}/status`)
      .set('Authorization', auth())
      .send({ status: 'completed' });
    expect(u.status).toBe(200);
  });

  it('sevkiyatı satır kalemleri (paketleme listesi) ile oluşturur ve detayda döndürür', async () => {
    const itemA = await createInventoryItem(`VITEST-ITEM-A-${Date.now()}`);
    const itemB = await createInventoryItem(`VITEST-ITEM-B-${Date.now()}`);
    const c = await supertest(app.getHttpServer())
      .post('/api/v1/shipments')
      .set('Authorization', auth())
      .send({
        companyId,
        carrier: 'UPS',
        trackingNo: 'TRK-ITEMS-1',
        origin: 'Rotterdam',
        destination: 'Adana',
        incoterm: 'CIF',
        statusCode: 'preparing',
        items: [
          { inventoryItemId: itemA.id, productModelId, description: 'CNC Torna Tezgahı', serialNumber: itemA.serialNumber, quantity: 1, packageCount: 1 },
          { inventoryItemId: itemB.id, productModelId, description: 'Kontrol Ünitesi', serialNumber: itemB.serialNumber, quantity: 1, packageCount: 1 },
        ],
      });
    expect(c.status).toBe(201);
    expect(c.body.companyId).toBe(companyId);
    expect(c.body.incoterm).toBe('CIF');

    const detail = await supertest(app.getHttpServer())
      .get(`/api/v1/shipments/${c.body.id}`)
      .set('Authorization', auth());
    expect(detail.status).toBe(200);
    expect(detail.body.items).toHaveLength(2);
    expect(detail.body.items.map((i: { serialNumber: string }) => i.serialNumber)).toContain(itemA.serialNumber);
    expect(detail.body.items[0].packageCount).toBe(1);
  });
});
