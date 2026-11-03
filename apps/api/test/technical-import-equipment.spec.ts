import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb, schema } from '../src/db/client';

let app: NestFastifyApplication;
let token: string;
let tenantId: string;
let divisionId: string;
let groupId: string | undefined;
let createdProductTypeId: string | undefined;
let brandId: string | undefined;
let productId: string | undefined;
const request = () => supertest(app.getHttpServer());
const row = (rowNumber: number, section: string, key: string, value: string, targetGroupCode: string) => ({
  rowNumber, sheetName: 'Teknik Bilgiler', section, sourceKey: key, sourceValue: value, sourceUnit: '',
  targetKey: key, targetGroupCode, targetUnit: '', matchStatus: 'exact', include: true,
});

beforeAll(async () => {
  app = await createTestApp();
  const login = await request().post('/api/v1/auth/login').send({ email: 'superadmin@haksan.local', password: 'superadmin12345' });
  expect(login.status, JSON.stringify(login.body)).toBe(201);
  token = login.body.accessToken;
  tenantId = login.body.user.tenantId;
  const db = getDb();
  const division = await db.query.divisions.findFirst({ where: and(eq(schema.divisions.tenantId, tenantId), eq(schema.divisions.code, 'sac_isleme')) });
  divisionId = division!.id;
  const groupCode = `DONANIM_TEST_${randomUUID().slice(0, 8)}`;
  const [group] = await db.insert(schema.productGroups).values({ code: groupCode, name: 'Donanım test grubu', divisionId }).returning({ id: schema.productGroups.id });
  groupId = group.id;
  const [type] = await db.insert(schema.productTypes).values({ code: 'FIBER_LAZER_KESIM', name: 'Sac Lazer Kesim', divisionId }).onConflictDoNothing().returning({ id: schema.productTypes.id });
  createdProductTypeId = type?.id;
  const brand = await request().post('/api/v1/brands').set('Authorization', `Bearer ${token}`).send({ name: `HEX test ${randomUUID().slice(0, 8)}`, divisionId, isOwned: true });
  expect(brand.status, JSON.stringify(brand.body)).toBe(201);
  brandId = brand.body.id;
  const product = await request().post('/api/v1/products').set('Authorization', `Bearer ${token}`).send({ brandId, productGroupCode: groupCode, categoryCode: 'TEZGAH', productTypeCode: 'FIBER_LAZER_KESIM', modelCode: `F-TEST-${randomUUID().slice(0, 8)}`, fullName: 'F Serisi test', listPrice: 1000 });
  expect(product.status, JSON.stringify(product.body)).toBe(201);
  productId = product.body.id;
});

afterAll(async () => {
  try {
    if (!tenantId) return;
    const db = getDb();
    await db.transaction(async (tx) => {
      if (productId) await tx.delete(schema.productModels).where(and(eq(schema.productModels.id, productId), eq(schema.productModels.tenantId, tenantId)));
      if (brandId) await tx.delete(schema.brands).where(and(eq(schema.brands.id, brandId), eq(schema.brands.tenantId, tenantId)));
      if (groupId) await tx.delete(schema.productGroups).where(eq(schema.productGroups.id, groupId));
      if (createdProductTypeId) await tx.delete(schema.productTypes).where(eq(schema.productTypes.id, createdProductTypeId));
    });
  } finally {
    await app?.close();
  }
});

describe('technical import DONANIM rows', () => {
  it('writes DONANIM rows as standard equipment and updates them on re-import', async () => {
    const commit = (value: string) => request().post('/api/v1/admin/technical-import/commit').set('Authorization', `Bearer ${token}`).send({
      mode: 'machine_data', productTypeCode: 'FIBER_LAZER_KESIM', divisionId, targetProductId: productId, confirmedTarget: true,
      rows: [row(2, 'KABİN', 'Kabin Tipi', 'Açık Kabin', 'KABIN'), row(3, 'DONANIM', 'Lineer Kızak Markası', value, 'DONANIM')],
    });
    const first = await commit('HIWIN *Tayvan');
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toMatchObject({ created: 2, updated: 0 });
    const again = await commit('THK *Japon');
    expect(again.body).toMatchObject({ created: 0, updated: 2 });

    const db = getDb();
    const equipment = await db.select({ title: schema.productEquipmentItems.title, type: schema.equipmentTypes.code })
      .from(schema.productEquipmentItems)
      .leftJoin(schema.equipmentTypes, eq(schema.productEquipmentItems.equipmentTypeId, schema.equipmentTypes.id))
      .where(and(eq(schema.productEquipmentItems.productModelId, productId!), isNull(schema.productEquipmentItems.deletedAt)));
    expect(equipment).toEqual([{ title: 'Lineer Kızak Markası: THK *Japon', type: 'standart' }]);
    const specs = await db.select({ key: schema.productSpecs.specKey }).from(schema.productSpecs)
      .where(and(eq(schema.productSpecs.productModelId, productId!), isNull(schema.productSpecs.deletedAt)));
    expect(specs.map((spec) => spec.key)).toEqual(['Kabin Tipi']);
  });
});
