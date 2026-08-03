import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import type { DbClient } from '../src/db/client';
import { up as createHaxanMmt1170 } from '../src/db/data-migrations/021_create_haxan_mmt_1170';
import { up as normalizeHaxanMmt1170 } from '../src/db/data-migrations/022_normalize_haxan_mmt_1170';
import { DB } from '../src/shared/database/database.module';

let app: NestFastifyApplication;
let token = '';

beforeAll(async () => {
  app = await createTestApp();
  const db = app.get<DbClient>(DB);
  // Bu ürün demo seed'in parçası değil; testi boş bir CI veritabanında da
  // deterministik yapmak için yalnız ilgili üretim data-migration'larını uygula.
  await createHaxanMmt1170(db);
  await normalizeHaxanMmt1170(db);
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' });
  token = login.body.accessToken;
});

afterAll(async () => {
  await app.close();
});

describe('HAXAN MMT-1170 brochure product', () => {
  it('keeps the exact DOCX product image in the deployable API asset', async () => {
    const body = await readFile(join(__dirname, '../src/db/seed/data/haksancnc/images/haksan-cnc-mmt-1170.jpg'));
    expect(createHash('sha256').update(body).digest('hex')).toBe(
      '0211ec1a8c7e2817d0c0be370c956a0430d3338654304597a72cf8f48aea5513',
    );
  });

  it('creates only the requested product fields, technical data and standard equipment', async () => {
    const server = app.getHttpServer();
    const list = await supertest(server)
      .get('/api/v1/products')
      .query({ search: 'MMT-1170', page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`);

    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const product = list.body.data.find((row: { modelCode: string }) => row.modelCode === 'MMT-1170');
    expect(product).toMatchObject({
      modelCode: 'MMT-1170',
      fullName: 'MMT-1170 CNC Dik İşleme Merkezi',
      brand: { name: 'HAXAN' },
    });
    expect(product.specs).toHaveLength(34);
    expect(product.standardEquipment).toHaveLength(29);
    expect(product.optionalEquipment).toEqual([]);
    expect(product.listPrice).toBeNull();
    expect(product.description).toBeNull();
  });
});
