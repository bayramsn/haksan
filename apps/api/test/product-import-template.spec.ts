/**
 * Toplu ürün yükleme şablonu, tek ürün formunda doldurulan alanların tamamını
 * içermeli ve seçilen ürün tipinde kayıtlı bir üründen doldurulmuş örnek satır
 * vermeli. Örnek satır ayrı sayfada durur: içe aktarma "Ürünler" sayfasını
 * okuduğu için şablon geri yüklendiğinde örnek kayıt tekrar işlenmez.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import ExcelJS from 'exceljs';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

async function login(server: any, email: string, password: string) {
  const r = await supertest(server).post('/api/v1/auth/login').send({ email, password });
  return r.body.accessToken as string;
}

let app: NestFastifyApplication;
let token: string;
const runId = Date.now().toString(36);
let typeCode = '';
let modelCode = '';

async function loadWorkbook(body: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(body as any);
  return workbook;
}

const headersOf = (worksheet: ExcelJS.Worksheet) =>
  (worksheet.getRow(1).values as unknown[]).slice(1).map((value) => String(value ?? '').trim());

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer();
  token = await login(server, 'superadmin@haksan.local', 'superadmin12345');

  // Şablonun besleneceği ürünü içe aktarma ucundan oluştur: tek ürün formundaki
  // alanların hepsi dolu olsun ki şablon eksiksiz örnek üretebilsin.
  modelCode = `SABLON-${runId}`;
  const rows = [
    {
      rowNumber: 2,
      brandName: `Şablon Marka ${runId}`,
      series: 'ST',
      modelCode,
      modelName: 'ST-500',
      fullName: `Şablon Marka ST-500 CNC Yatay Torna ${runId}`,
      categoryCode: 'TEZGAH',
      subcategoryCode: 'TORNA',
      productTypeCode: 'CNC_YATAY_TORNA_TEZGAHI',
      currencyCode: 'USD',
      listPrice: 125000,
      cashPrice: 118000,
      vatRate: 20,
      originCountry: 'Tayvan',
      productionYear: 2026,
      hsCode: '845811',
      stockCode: `STK-${runId}`,
      description: 'Şablon testi için oluşturulan ürün',
      specs: [
        { specGroupCode: 'GENEL', specKey: 'Ayna Ölçüsü', specValue: '8"', sortOrder: 0 },
        { specGroupCode: 'GENEL', specKey: 'Fener Mili Devri', specValue: '4800', sortOrder: 10 },
        { specGroupCode: 'GENEL', specKey: 'Kontrol Ünitesi', specValue: 'FANUC 0i-TF', sortOrder: 20 },
      ],
      equipment: [
        { equipmentTypeCode: 'standart', title: 'Hidrolik taret', sortOrder: 0, isPromotion: false },
        { equipmentTypeCode: 'opsiyonel', title: 'Çubuk sürücü', sortOrder: 0, isPromotion: false },
      ],
    },
  ];
  const commit = await supertest(server)
    .post('/api/v1/products/import/commit')
    .set('Authorization', `Bearer ${token}`)
    .send({ rows, mode: 'upsert', replaceDetails: true });
  expect(commit.status, JSON.stringify(commit.body)).toBe(201);
  typeCode = 'CNC_YATAY_TORNA_TEZGAHI';
});

afterAll(async () => {
  await app.close();
});

describe('Toplu ürün yükleme şablonu', () => {
  it('şablon seçeneklerinde yalnız ürünü olan tipleri listeler', async () => {
    const response = await supertest(app.getHttpServer())
      .get('/api/v1/products/import/template-options')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const match = response.body.find((row: any) => row.productTypeCode === typeCode);
    expect(match).toBeTruthy();
    expect(match.productCount).toBeGreaterThan(0);
    expect(match.categoryName).toBeTruthy();
    expect(match.subcategoryName).toBeTruthy();
    // Her satır kategori → alt kategori → tip zincirini taşır (kademeli seçim için).
    expect(response.body.every((row: any) => row.productTypeName)).toBe(true);
  });

  it('tek ürün formundaki tüm alanları kolon olarak verir', async () => {
    const response = await supertest(app.getHttpServer())
      .get(`/api/v1/products/import/template?productTypeCode=${typeCode}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    const workbook = await loadWorkbook(response.body as Buffer);
    const sheet = workbook.getWorksheet('Ürünler')!;
    const headers = headersOf(sheet);

    for (const column of [
      'Marka', 'Seri', 'Model', 'Model Adı', 'Ürün Adı', 'Ürün Grubu', 'Kategori', 'Alt Kategori',
      'Ürün Tipi', 'Para Birimi', 'Liste Fiyatı', 'Peşin Fiyat', 'KDV', 'Menşei', 'Üretim Yılı',
      'GTIP', 'Stok Kodu', 'Ürün Fotoğrafı', 'Açıklama', 'Kontrol Ünitesi', 'Standart Donanım', 'Opsiyonel Donanım',
    ]) {
      expect(headers, `${column} kolonu eksik`).toContain(column);
    }
    // Tipin teknik özellik başlıkları da kolon olur.
    expect(headers).toContain('Ayna Ölçüsü');
    expect(headers).toContain('Fener Mili Devri');
    // Kontrol ünitesi kendi kolonunda; teknik kolonlarda ikinci kez çıkmaz.
    expect(headers.filter((header) => header === 'Kontrol Ünitesi')).toHaveLength(1);
    // Doldurulacak sayfa boş gelir.
    expect(sheet.rowCount).toBe(1);
  });

  it('örnek satırı mevcut üründen doldurur ve ayrı sayfada tutar', async () => {
    const response = await supertest(app.getHttpServer())
      .get(`/api/v1/products/import/template?productTypeCode=${typeCode}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    const workbook = await loadWorkbook(response.body as Buffer);
    const example = workbook.getWorksheet('Örnek Kayıt')!;
    expect(example).toBeTruthy();
    const headers = headersOf(example);
    const values = (example.getRow(2).values as unknown[]).slice(1).map((value) => String(value ?? '').trim());
    const cell = (column: string) => values[headers.indexOf(column)];

    expect(cell('Model')).toBe(modelCode);
    expect(cell('Marka')).toContain('Şablon Marka');
    expect(cell('Liste Fiyatı')).toContain('125000');
    expect(cell('Peşin Fiyat')).toContain('118000');
    expect(cell('GTIP')).toBe('845811');
    expect(cell('Üretim Yılı')).toBe('2026');
    expect(cell('Kontrol Ünitesi')).toBe('FANUC 0i-TF');
    expect(cell('Standart Donanım')).toBe('Hidrolik taret');
    expect(cell('Opsiyonel Donanım')).toBe('Çubuk sürücü');
    expect(cell('Ayna Ölçüsü')).toBe('8"');
  });

  it('o tipte ürün yoksa neden söyleyerek reddeder', async () => {
    const response = await supertest(app.getHttpServer())
      .get('/api/v1/products/import/template?productTypeCode=DIVIZOR')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body)).toContain('kayıtlı ürün yok');
  });
});
