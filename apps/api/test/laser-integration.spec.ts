import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { LaserTechnicalConfiguration } from '@haksan/shared';
import { createTestApp } from './setup';
import { getDb, schema } from '../src/db/client';
import { AORE_WORKBOOK_SHEETS } from '../../../packages/shared/src/laser-source-data';

let app: NestFastifyApplication;
let token: string;
let salesToken: string;
let tenantId: string;
let divisionId: string;
let groupId: string | undefined;
let createdProductTypeId: string | undefined;
let brandId: string;
let productId: string;
let quoteId: string;
let quoteItemId: string;
let groupCode: string;
let preview: { importToken: string; laserProfiles: LaserTechnicalConfiguration[] };
let original: LaserTechnicalConfiguration;
const selection = { productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', sourceModelCode: 'F3015', cabinType: 'open', powerKw: 6 } as const;
const request = () => supertest(app.getHttpServer());
const details = (configuration: LaserTechnicalConfiguration) => ({
  technicalConfiguration: configuration, equipment: [],
  specs: configuration.specs.map((spec, sortOrder) => ({ specKey: spec.key, specValue: spec.value, specUnit: spec.unit, specGroupCode: spec.groupCode ?? 'GENEL', sortOrder })),
});

beforeAll(async () => {
  app = await createTestApp();
  const login = await request().post('/api/v1/auth/login').send({ email: 'superadmin@haksan.local', password: 'superadmin12345' });
  expect(login.status, JSON.stringify(login.body)).toBe(201);
  token = login.body.accessToken;
  tenantId = login.body.user.tenantId;
  const sales = await request().post('/api/v1/auth/login').send({ email: 'sales@haksan.local', password: 'sales12345' });
  salesToken = sales.body.accessToken;
  const db = getDb();
  const division = await db.query.divisions.findFirst({ where: and(eq(schema.divisions.tenantId, tenantId), eq(schema.divisions.code, 'sac_isleme')) });
  expect(division).toBeTruthy();
  divisionId = division!.id;
  groupCode = `LASER_TEST_${randomUUID().slice(0, 8)}`;
  const [group] = await db.insert(schema.productGroups).values({ code: groupCode, name: 'Lazer test grubu', divisionId }).returning({ id: schema.productGroups.id });
  groupId = group.id;
  const [createdProductType] = await db.insert(schema.productTypes).values({ code: 'FIBER_LAZER_KESIM', name: 'Sac Lazer Kesim', divisionId }).onConflictDoNothing().returning({ id: schema.productTypes.id });
  createdProductTypeId = createdProductType?.id;
  const brand = await request().post('/api/v1/brands').set('Authorization', `Bearer ${token}`).send({ name: `AORE test ${randomUUID().slice(0, 8)}`, divisionId, isOwned: true });
  expect(brand.status, JSON.stringify(brand.body)).toBe(201);
  brandId = brand.body.id;
});

afterAll(async () => {
  try {
    if (!tenantId) return;
    const db = getDb();
    await db.transaction(async (tx) => {
      // Delete only this suite's fixtures, in foreign-key order. In particular,
      // leaving the newest priced Sac product would change other suites' picks.
      if (quoteId) await tx.delete(schema.quotes).where(and(eq(schema.quotes.id, quoteId), eq(schema.quotes.tenantId, tenantId)));
      if (productId) await tx.delete(schema.productModels).where(and(eq(schema.productModels.id, productId), eq(schema.productModels.tenantId, tenantId)));
      if (brandId) {
        await tx.delete(schema.laserTechnicalProfiles).where(and(eq(schema.laserTechnicalProfiles.brandId, brandId), eq(schema.laserTechnicalProfiles.tenantId, tenantId)));
        await tx.delete(schema.brands).where(and(eq(schema.brands.id, brandId), eq(schema.brands.tenantId, tenantId)));
      }
      if (groupId) await tx.delete(schema.productGroups).where(eq(schema.productGroups.id, groupId));
      // A seeded/preexisting type is shared data and must never be deleted.
      if (createdProductTypeId) await tx.delete(schema.productTypes).where(eq(schema.productTypes.id, createdProductTypeId));
    });
  } finally {
    await app?.close();
  }
});

describe('laser API database roundtrip', () => {
  it('scopes read endpoints, validates selections and exposes all source models', async () => {
    expect((await request().get('/api/v1/laser-profiles/options').query({ divisionId, brandId })).status).toBe(401);
    const options = await request().get('/api/v1/laser-profiles/options').query({ divisionId, brandId }).set('Authorization', `Bearer ${token}`);
    expect(options.status, JSON.stringify(options.body)).toBe(200);
    expect(options.body.models).toHaveLength(114);
    expect(options.body.powerOptions).toEqual([1.5, 2, 3, 6, 12, 20, 30]);
    expect((await request().get('/api/v1/laser-profiles/resolve').query({ divisionId, brandId, ...selection, powerKw: 40 }).set('Authorization', `Bearer ${token}`)).status).toBe(422);
    expect((await request().get('/api/v1/laser-profiles/options').query({ divisionId: randomUUID(), brandId }).set('Authorization', `Bearer ${token}`)).status).toBe(422);
    const resolved = await request().get('/api/v1/laser-profiles/resolve').query({ divisionId, brandId, ...selection }).set('Authorization', `Bearer ${token}`);
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(200);
    original = resolved.body;
  });

  it('parses real horizontal source layout and saves a profile without overwriting manual values', async () => {
    const workbook = new ExcelJS.Workbook();
    for (const source of AORE_WORKBOOK_SHEETS) {
      const sheet = workbook.addWorksheet(source.name); sheet.addRows(source.rows);
      for (const m of source.merges) sheet.mergeCells(m.startRow, m.startColumn, m.endRow, m.endColumn);
    }
    const response = await request().post('/api/v1/admin/technical-import/preview').set('Authorization', `Bearer ${token}`).send({
      divisionId, brandId, mode: 'laser_profiles', productTypeCode: selection.productTypeCode, availableFields: [],
      fileName: 'AORE Technical Parameters.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileBase64: Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64'),
    });
    expect(response.status, JSON.stringify(response.body).slice(0, 1000)).toBe(201);
    preview = response.body;
    expect(preview.laserProfiles).toHaveLength(1232);
    const imported = preview.laserProfiles.find((p) => p.selection.sourceModelCode === 'F3015' && p.selection.powerKw === 6 && p.selection.cabinType === 'open')!;
    const decimal = preview.laserProfiles.find((p) => p.selection.sourceModelCode === 'PG3015' && p.selection.powerKw === 1.5 && p.selection.cabinType === 'closed')!;
    const commitBody = { divisionId, brandId, mode: 'laser_profiles', productTypeCode: selection.productTypeCode, importToken: preview.importToken, laserProfiles: [imported, decimal], rows: [] };
    const commit = await request().post('/api/v1/admin/technical-import/commit').set('Authorization', `Bearer ${token}`).send(commitBody);
    expect(commit.status, JSON.stringify(commit.body)).toBe(201);
    expect(commit.body).toMatchObject({ created: 2, imported: 2 });
    const decimalRead = await request().get('/api/v1/laser-profiles/resolve').query({ divisionId, brandId, ...decimal.selection }).set('Authorization', `Bearer ${token}`);
    expect(decimalRead.status, JSON.stringify(decimalRead.body)).toBe(200);
    expect(decimalRead.body).toMatchObject({
      selection: { series: 'PG', sourceModelCode: 'PG3015', cabinType: 'closed', powerKw: 1.5 },
      sizeLabel: '3050 × 1530 mm',
      specs: expect.arrayContaining([
        expect.objectContaining({ key: 'Toplam Güç Gereksinimi', value: '17.5', unit: 'kW' }),
        expect.objectContaining({ key: 'Trafo Kapasitesi', value: '30', unit: 'kVA' }),
      ]),
    });
    const specs = imported.specs.map((spec) => spec.key === 'Makine Ağırlığı' ? { ...spec, value: '2222', source: { document: 'forged.pdf' } } : spec);
    const edit = await request().put('/api/v1/admin/laser-profiles').set('Authorization', `Bearer ${token}`).send({ divisionId, brandId, selection, specs });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    expect(edit.body.specs.find((s: { key: string }) => s.key === 'Makine Ağırlığı')).toMatchObject({ value: '2222', sourceValue: '2150', isManual: true, source: { document: 'AORE Technical Parameters.xlsx' } });
    const again = await request().post('/api/v1/admin/technical-import/commit').set('Authorization', `Bearer ${token}`).send(commitBody);
    expect(again.body).toMatchObject({ created: 0, updated: 2 });
    const reread = await request().get('/api/v1/laser-profiles/resolve').query({ divisionId, brandId, ...selection }).set('Authorization', `Bearer ${token}`);
    expect(reread.body.specs.find((s: { key: string }) => s.key === 'Makine Ağırlığı').value).toBe('2222');
    expect((await request().put('/api/v1/admin/laser-profiles').set('Authorization', `Bearer ${salesToken}`).send({ divisionId, brandId, selection, specs })).status).toBe(403);
  });

  it('saves and reopens product selection, blank values and unchanged commercial code', async () => {
    const product = await request().post('/api/v1/products').set('Authorization', `Bearer ${token}`).send({ brandId, productGroupCode: groupCode, categoryCode: 'TEZGAH', productTypeCode: selection.productTypeCode, modelCode: `COMMERCIAL-${randomUUID().slice(0, 8)}`, fullName: 'AORE F3015 test', listPrice: 1000 });
    expect(product.status, JSON.stringify(product.body)).toBe(201);
    productId = product.body.id;
    const saved = await request().put(`/api/v1/products/${productId}/details`).set('Authorization', `Bearer ${token}`).send(details(original));
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const reread = await request().get(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${token}`);
    expect(reread.body.modelCode).toBe(product.body.modelCode);
    expect(reread.body.technicalConfiguration.selection).toEqual(selection);
    expect(reread.body.technicalConfiguration.specs.find((s: { key: string }) => s.key === 'Rezonatör Markası').value).toBe('');
    expect(reread.body.specs.find((s: { key: string }) => s.key === 'Makine Ağırlığı').value).toBe('2150');
  });

  it('snapshots configured product on quote creation and keeps it after product updates', async () => {
    const companies = await request().get('/api/v1/companies?pageSize=100').set('Authorization', `Bearer ${token}`);
    const company = companies.body.data.find((row: { addresses?: unknown[] }) => row.addresses?.length);
    const quote = await request().post('/api/v1/quotes').set('Authorization', `Bearer ${token}`).send({ divisionId, companyId: company.id, companyAddressId: company.addresses[0].id, quoteDate: new Date().toISOString(), currencyCode: 'USD' });
    expect(quote.status, JSON.stringify(quote.body)).toBe(201);
    quoteId = quote.body.id;
    const item = await request().post(`/api/v1/quotes/${quoteId}/items`).set('Authorization', `Bearer ${token}`).send({ productModelId: productId, description: 'AORE F3015', quantity: 1, unitPrice: 1000 });
    expect(item.status, JSON.stringify(item.body)).toBe(201);
    quoteItemId = item.body.id;
    expect(item.body.compatibility.technicalConfiguration.selection).toEqual(selection);
    const profile = await request().get('/api/v1/laser-profiles/resolve').query({ divisionId, brandId, ...selection }).set('Authorization', `Bearer ${token}`);
    const profileSave = await request().put('/api/v1/admin/laser-profiles').set('Authorization', `Bearer ${token}`).send({
      divisionId,
      brandId,
      selection,
      specs: profile.body.specs,
    });
    expect(profileSave.status, JSON.stringify(profileSave.body)).toBe(200);
    expect(profileSave.body.syncedProductCount).toBe(1);
    const syncedProduct = await request().get(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${token}`);
    expect(syncedProduct.body.technicalConfiguration.specs.find((s: { key: string }) => s.key === 'Makine Ağırlığı').value).toBe('2222');
    const next = structuredClone(original); next.specs.find((s) => s.key === 'Makine Ağırlığı')!.value = '9999';
    expect((await request().put(`/api/v1/products/${productId}/details`).set('Authorization', `Bearer ${token}`).send(details(next))).status).toBe(200);
    const readQuote = await request().get(`/api/v1/quotes/${quoteId}`).set('Authorization', `Bearer ${token}`);
    const savedItem = readQuote.body.items.find((row: { id: string }) => row.id === quoteItemId);
    expect(savedItem.compatibility.technicalConfiguration.specs.find((s: { key: string }) => s.key === 'Makine Ağırlığı').value).toBe('2150');
    expect(savedItem.compatibility.technicalSpecs.find((s: { key: string }) => s.key === 'Rezonatör Markası').value).toBe('');
  });

  it('generates a PDF from the saved quote after the product changed', async () => {
    const pdf = await request().post(`/api/v1/quotes/${quoteId}/generate-pdf`).set('Authorization', `Bearer ${token}`).buffer(true).parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(201);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.LASER_TEST_PDF_OUTPUT) writeFileSync(process.env.LASER_TEST_PDF_OUTPUT, pdf.body);
  });
});
