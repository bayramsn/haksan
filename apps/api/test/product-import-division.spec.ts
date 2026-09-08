import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { getDb, schema } from '../src/db/client';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let token: string;
let tenantId: string;
let brandId: string;
let supplierId: string;
const suffix = randomUUID().slice(0, 8);
const brandName = `Division import ${suffix}`;
const groupCode = `IMPORT_G_${suffix}`;
const categoryCode = `IMPORT_C_${suffix}`;
const subcategoryCode = `IMPORT_S_${suffix}`;
const typeCode = `IMPORT_T_${suffix}`;
const extraProductIds: string[] = [];
const fixtures: Array<{ divisionId: string; code: string; groupId: string; categoryId: string; subcategoryId: string; typeId: string; specId: string; productId?: string; modelCode: string }> = [];
const api = () => supertest(app.getHttpServer());

beforeAll(async () => {
  app = await createTestApp();
  const login = await api().post('/api/v1/auth/login').send({ email: 'superadmin@haksan.local', password: 'superadmin12345' });
  expect(login.status).toBe(201); token = login.body.accessToken; tenantId = login.body.user.tenantId;
  const db = getDb();
  const [supplier] = await db.select({ id: schema.companies.id }).from(schema.companies)
    .innerJoin(schema.companyRelationTypes, eq(schema.companies.relationTypeId, schema.companyRelationTypes.id))
    .where(and(eq(schema.companies.tenantId, tenantId), inArray(schema.companyRelationTypes.code, ['supplier', 'supplier_customer']))).limit(1);
  expect(supplier).toBeTruthy(); supplierId = supplier.id;
  const brand = await api().post('/api/v1/brands').set('Authorization', `Bearer ${token}`).send({ name: brandName, isOwned: true, supplierCompanyId: supplierId, technicalCatalogCode: 'AORE_LASER' });
  expect(brand.status, JSON.stringify(brand.body)).toBe(201); brandId = brand.body.id;
  for (const code of ['cnc', 'sac_isleme', 'universal']) {
    const division = await db.query.divisions.findFirst({ where: and(eq(schema.divisions.tenantId, tenantId), eq(schema.divisions.code, code)) });
    expect(division).toBeTruthy();
    const [group] = await db.insert(schema.productGroups).values({ code: groupCode, name: groupCode, divisionId: division!.id }).returning();
    const [category] = await db.insert(schema.productCategories).values({ code: categoryCode, name: categoryCode, divisionId: division!.id, productGroupId: group.id }).returning();
    const [subcategory] = await db.insert(schema.productSubcategories).values({ code: subcategoryCode, name: subcategoryCode, divisionId: division!.id, categoryId: category.id }).returning();
    const [type] = await db.insert(schema.productTypes).values({ code: typeCode, name: typeCode, divisionId: division!.id, subcategoryId: subcategory.id }).returning();
    const [spec] = await db.insert(schema.productSpecTemplates).values({ divisionId: division!.id, productTypeCode: typeCode, specKey: `${code} teknik alanı` }).returning();
    fixtures.push({ divisionId: division!.id, code, groupId: group.id, categoryId: category.id, subcategoryId: subcategory.id, typeId: type.id, specId: spec.id, modelCode: `${suffix}-${code}` });
  }
});

afterAll(async () => {
  try {
    const db = getDb();
    await db.transaction(async (tx) => {
      if (extraProductIds.length) await tx.delete(schema.productModels).where(and(inArray(schema.productModels.id, extraProductIds), eq(schema.productModels.tenantId, tenantId)));
      for (const fixture of fixtures) {
        if (fixture.productId) await tx.delete(schema.productModels).where(and(eq(schema.productModels.id, fixture.productId), eq(schema.productModels.tenantId, tenantId)));
        await tx.delete(schema.productSpecTemplates).where(eq(schema.productSpecTemplates.id, fixture.specId));
        await tx.delete(schema.productTypes).where(eq(schema.productTypes.id, fixture.typeId));
        await tx.delete(schema.productSubcategories).where(eq(schema.productSubcategories.id, fixture.subcategoryId));
        await tx.delete(schema.productCategories).where(eq(schema.productCategories.id, fixture.categoryId));
        await tx.delete(schema.productGroups).where(eq(schema.productGroups.id, fixture.groupId));
      }
      if (brandId) await tx.delete(schema.brands).where(and(eq(schema.brands.id, brandId), eq(schema.brands.tenantId, tenantId)));
    });
  } finally { await app?.close(); }
});

const importRow = (fixture: typeof fixtures[number]) => ({ rowNumber: 2, brandName, modelCode: fixture.modelCode, fullName: fixture.modelCode, productGroupCode: groupCode, categoryCode, subcategoryCode, productTypeCode: typeCode, listPrice: 100 });

describe('product import division context and brand supplier', () => {
  it('keeps brand ownership separate from default supplier and source catalog', async () => {
    const result = await api().get('/api/v1/admin/lookups/brands').set('Authorization', `Bearer ${token}`);
    expect(result.status).toBe(200);
    expect(result.body.find((row: { id: string }) => row.id === brandId)).toMatchObject({ companyId: null, isOwned: true, supplierCompanyId: supplierId, technicalCatalogCode: 'AORE_LASER' });
    const invalid = await api().patch(`/api/v1/admin/lookups/brands/${brandId}`).set('Authorization', `Bearer ${token}`).send({ supplierCompanyId: randomUUID() });
    expect(invalid.status).toBe(422);
  });

  it('lists empty types and produces their own saved technical columns for all three divisions', async () => {
    for (const fixture of fixtures) {
      const options = await api().get('/api/v1/products/import/template-options').query({ divisionId: fixture.divisionId }).set('Authorization', `Bearer ${token}`);
      expect(options.status, JSON.stringify(options.body)).toBe(200);
      expect(options.body.find((row: { productTypeCode: string }) => row.productTypeCode === typeCode)).toMatchObject({ divisionId: fixture.divisionId, productCount: 0 });
      const response = await api().get('/api/v1/products/import/template').query({ divisionId: fixture.divisionId, productTypeCode: typeCode }).set('Authorization', `Bearer ${token}`).buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = []; res.on('data', (chunk) => chunks.push(Buffer.from(chunk))); res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
      expect(response.status).toBe(200);
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(response.body);
      const sheet = workbook.getWorksheet('Ürünler')!;
      const headers = (sheet.getRow(1).values as unknown[]).map(String);
      expect(headers).toContain(`${fixture.code} teknik alanı`);
      for (const other of fixtures.filter((row) => row !== fixture)) expect(headers).not.toContain(`${other.code} teknik alanı`);
      expect(sheet.rowCount).toBe(1);
    }
  });

  it('resolves identical taxonomy codes into each selected division and inherits the brand supplier', async () => {
    for (const fixture of fixtures) {
      const result = await api().post('/api/v1/products/import/commit').set('Authorization', `Bearer ${token}`).send({ divisionId: fixture.divisionId, rows: [importRow(fixture)] });
      expect(result.status, JSON.stringify(result.body)).toBe(201);
      fixture.productId = result.body.rows[0].productId;
      expect(result.body.rows[0], JSON.stringify(result.body)).toMatchObject({ status: 'create' });
      const product = await getDb().query.productModels.findFirst({ where: eq(schema.productModels.id, fixture.productId!) });
      expect(product).toMatchObject({ productGroupId: fixture.groupId, categoryId: fixture.categoryId, subcategoryId: fixture.subcategoryId, productTypeId: fixture.typeId, supplierCompanyId: supplierId });
    }
  });

  it('rejects updating another division product even for super admin', async () => {
    const result = await api().post('/api/v1/products/import/commit').set('Authorization', `Bearer ${token}`).send({ divisionId: fixtures[1].divisionId, rows: [{ ...importRow(fixtures[0]), fullName: 'Wrong division mutation' }] });
    expect(result.body.rows[0], JSON.stringify(result.body)).toMatchObject({ status: 'error' });
    const product = await getDb().query.productModels.findFirst({ where: eq(schema.productModels.id, fixtures[0].productId!) });
    expect(product?.fullName).toBe(fixtures[0].modelCode);
  });

  it('uses the same scoped taxonomy and supplier default in ordinary product create/update', async () => {
    const fixture = fixtures[1];
    const productInput = { divisionId: fixture.divisionId, brandId, productGroupCode: groupCode, categoryCode, subcategoryCode, productTypeCode: typeCode, fullName: 'Normal Sac product', modelCode: `NORMAL-${suffix}` };
    const created = await api().post('/api/v1/products').set('Authorization', `Bearer ${token}`).send(productInput);
    if (created.body.id) extraProductIds.push(created.body.id);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ productGroupId: fixture.groupId, productTypeId: fixture.typeId, supplierCompanyId: supplierId });
    const noSupplier = await api().post('/api/v1/products').set('Authorization', `Bearer ${token}`).send({ ...productInput, modelCode: `NONE-${suffix}`, supplierCompanyId: null });
    if (noSupplier.body.id) extraProductIds.push(noSupplier.body.id);
    expect(noSupplier.status, JSON.stringify(noSupplier.body)).toBe(201);
    expect(noSupplier.body.supplierCompanyId).toBeNull();
    const updated = await api().patch(`/api/v1/products/${created.body.id}`).set('Authorization', `Bearer ${token}`).send({ divisionId: fixture.divisionId, productTypeCode: typeCode, fullName: 'Normal updated' });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body).toMatchObject({ productTypeId: fixture.typeId, supplierCompanyId: supplierId });
    const mismatched = await api().patch(`/api/v1/products/${created.body.id}`).set('Authorization', `Bearer ${token}`).send({ divisionId: fixture.divisionId, categoryCode: 'TEZGAH' });
    expect(mismatched.status).toBe(422);
  });

  it('applies the same scope during CSV preview and validates an explicit division', async () => {
    const csv = ['Marka,Model,Ürün Grubu,Kategori,Alt Kategori,Ürün Tipi', `${brandName},PREVIEW-${suffix},${groupCode},${categoryCode},${subcategoryCode},CNC_YATAY_TORNA_TEZGAHI`].join('\n');
    const result = await api().post('/api/v1/products/import/preview').set('Authorization', `Bearer ${token}`).send({ divisionId: fixtures[1].divisionId, fileName: 'sac.csv', fileBase64: Buffer.from(csv).toString('base64') });
    expect(result.status).toBe(201);
    expect(result.body.rows[0].status).toBe('error');
    const missingDivision = await api().get('/api/v1/products/import/template-options').query({ divisionId: randomUUID() }).set('Authorization', `Bearer ${token}`);
    expect(missingDivision.status).toBe(422);
  });
});
