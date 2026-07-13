/**
 * Bölüm (CNC / Üniversal / Sac İşleme) izolasyonu + departman yetkileri.
 *
 * İki ekseni birlikte doğrular:
 *  1) Bölüm izolasyonu — tek bölüme atanmış satışçılar yalnızca kendi
 *     bölümlerinin firma/fırsat/tekliflerini görür; `view_all` (admin) hepsini
 *     görür ve `X-Active-Division` başlığıyla tek bölüme daralabilir.
 *  2) Departman yetkileri — sales / service / finance / stock / readonly / admin
 *     rollerinin izin matrisine göre okuma/yazma hakları (özellikle var olan
 *     permissions.spec'in atladığı stock & readonly ve yazma reddi senaryoları).
 *
 * Tests assume `npm run db:migrate && npm run db:seed:demo` has been run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let server: any;

const tokens: Record<string, string> = {};
const divisionIdByCode: Record<string, string> = {};
const departmentIdByCode: Record<string, string> = {};
const companyIdByShort: Record<string, string> = {};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(email: string, password: string): Promise<string> {
  const r = await supertest(server).post('/api/v1/auth/login').send({ email, password });
  if (!r.body?.accessToken) {
    throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body.accessToken as string;
}

/** Tek bölüme atanmış kullanıcılar (her testte benzersiz e-posta — yeniden çalıştırılabilir). */
const tag = Date.now();
const scoped = {
  cnc: { key: 'salesCnc', email: `sales-cnc-${tag}@haksan.local`, division: 'cnc' },
  universal: { key: 'salesUni', email: `sales-uni-${tag}@haksan.local`, division: 'universal' },
  sac_isleme: { key: 'salesSac', email: `sales-sac-${tag}@haksan.local`, division: 'sac_isleme' },
} as const;
const SCOPED_PWD = 'scoped12345';

async function listData(token: string, path: string): Promise<any[]> {
  const r = await supertest(server).get(path).set(auth(token));
  expect(r.status, `${path} should be 200`).toBe(200);
  return r.body.data ?? r.body;
}

beforeAll(async () => {
  app = await createTestApp();
  server = app.getHttpServer();

  const { getDb } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  await getDb().execute(
    sql`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email LIKE '%@haksan.local'`
  );

  // Demo rol kullanıcıları
  tokens.superAdmin = await login('superadmin@haksan.local', 'superadmin12345');
  tokens.admin = await login('admin@haksan.local', 'admin12345');
  tokens.sales = await login('sales@haksan.local', 'sales12345');
  tokens.service = await login('service@haksan.local', 'service12345');
  tokens.finance = await login('finance@haksan.local', 'finance12345');
  tokens.stock = await login('stock@haksan.local', 'stock12345');
  tokens.readonly = await login('readonly@haksan.local', 'readonly12345');

  // Bölümler / departmanlar
  for (const d of await listData(tokens.superAdmin, '/api/v1/divisions')) divisionIdByCode[d.code] = d.id;
  for (const d of await listData(tokens.superAdmin, '/api/v1/departments')) departmentIdByCode[d.code] = d.id;

  // Demo firmalar — bölüm bazlı temsilciler
  const companies = await listData(tokens.superAdmin, '/api/v1/companies?page=1&pageSize=200');
  for (const c of companies) companyIdByShort[c.shortName] = c.id;

  // Tek bölüme atanmış satışçılar
  for (const def of Object.values(scoped)) {
    const created = await supertest(server)
      .post('/api/v1/users')
      .set(auth(tokens.superAdmin))
      .send({
        fullName: `Scoped ${def.division}`,
        email: def.email,
        password: SCOPED_PWD,
        roleCodes: ['sales'],
        departmentId: departmentIdByCode.sales,
        divisionIds: [divisionIdByCode[def.division]],
      });
    expect(created.status, `create ${def.email}: ${JSON.stringify(created.body)}`).toBe(201);
    tokens[def.key] = await login(def.email, SCOPED_PWD);
  }
});

afterAll(async () => {
  await app.close();
});

describe('Bölüm izolasyonu — firmalar', () => {
  it('seed temsilci firmaları üç ayrı bölümde bulundu', () => {
    expect(companyIdByShort['KİLİTSAN']).toBeTruthy(); // cnc
    expect(companyIdByShort['UNIMAK']).toBeTruthy(); // universal
    expect(companyIdByShort['SACTECH']).toBeTruthy(); // sac_isleme
  });

  it('CNC satışçısı yalnızca CNC firmalarını görür', async () => {
    const rows = await listData(tokens.salesCnc, '/api/v1/companies?page=1&pageSize=200');
    const ids = rows.map((c) => c.id);
    expect(ids).toContain(companyIdByShort['KİLİTSAN']);
    expect(ids).not.toContain(companyIdByShort['UNIMAK']);
    expect(ids).not.toContain(companyIdByShort['SACTECH']);
  });

  it('Üniversal satışçısı yalnızca Üniversal firmalarını görür', async () => {
    const rows = await listData(tokens.salesUni, '/api/v1/companies?page=1&pageSize=200');
    const ids = rows.map((c) => c.id);
    expect(ids).toContain(companyIdByShort['UNIMAK']);
    expect(ids).not.toContain(companyIdByShort['KİLİTSAN']);
    expect(ids).not.toContain(companyIdByShort['SACTECH']);
  });

  it('Sac İşleme satışçısı yalnızca Sac firmalarını görür', async () => {
    const rows = await listData(tokens.salesSac, '/api/v1/companies?page=1&pageSize=200');
    const ids = rows.map((c) => c.id);
    expect(ids).toContain(companyIdByShort['SACTECH']);
    expect(ids).not.toContain(companyIdByShort['KİLİTSAN']);
    expect(ids).not.toContain(companyIdByShort['UNIMAK']);
  });

  it('tüm bölümlere atanmış demo satışçısı üç firmayı da görür', async () => {
    const rows = await listData(tokens.sales, '/api/v1/companies?page=1&pageSize=200');
    const ids = rows.map((c) => c.id);
    expect(ids).toContain(companyIdByShort['KİLİTSAN']);
    expect(ids).toContain(companyIdByShort['UNIMAK']);
    expect(ids).toContain(companyIdByShort['SACTECH']);
  });

  it('bölüm dışı firmaya id ile erişim 404 döner', async () => {
    const r1 = await supertest(server)
      .get(`/api/v1/companies/${companyIdByShort['UNIMAK']}`)
      .set(auth(tokens.salesCnc));
    expect(r1.status).toBe(404);
    const r2 = await supertest(server)
      .get(`/api/v1/companies/${companyIdByShort['KİLİTSAN']}`)
      .set(auth(tokens.salesUni));
    expect(r2.status).toBe(404);
  });
});

/**
 * Rol bazlı firma görünürlüğü (bölüm izolasyonunun üstüne biner):
 *  - sales  : saf tedarikçiyi HİÇ görmez; müşteri + müşteri/tedarikçinin hem
 *             cari hem potansiyelini görür.
 *  - service: saf tedarikçiyi HİÇ görmez; saf müşteriden YALNIZCA cari görür
 *             (potansiyel müşteri gizli); müşteri/tedarikçinin cari+potansiyelini görür.
 *  - admin / diğer roller: kısıt yok (her firmayı görür).
 *
 * Demo verisi: "Taiwan Machine Supply" = saf tedarikçi (active);
 * potansiyel müşteriler = KİLİTSAN, SACTECH, BAYPA TEST KOCATEPE;
 * cari müşteriler = Contra Makine, ALİŞLER, UNIMAK, BAYPA TEST İSMETPAŞA.
 */
describe('Rol bazlı firma görünürlüğü — sales/service', () => {
  it('satışçı saf tedarikçiyi (Taiwan Machine Supply) listede görmez', async () => {
    const rows = await listData(tokens.sales, '/api/v1/companies?page=1&pageSize=200');
    const ids = rows.map((c) => c.id);
    expect(companyIdByShort['Taiwan Machine Supply']).toBeTruthy();
    expect(ids).not.toContain(companyIdByShort['Taiwan Machine Supply']);
  });

  it('satışçı müşterilerin hem cari hem potansiyelini görür', async () => {
    const rows = await listData(tokens.sales, '/api/v1/companies?page=1&pageSize=200');
    const ids = rows.map((c) => c.id);
    expect(ids).toContain(companyIdByShort['KİLİTSAN']); // potansiyel müşteri
    expect(ids).toContain(companyIdByShort['Contra Makine']); // cari müşteri
  });

  it('satışçı tedarikçiye id ile erişemez (404)', async () => {
    const r = await supertest(server)
      .get(`/api/v1/companies/${companyIdByShort['Taiwan Machine Supply']}`)
      .set(auth(tokens.sales));
    expect(r.status).toBe(404);
  });

  it('servis saf tedarikçiyi görmez ve potansiyel müşteriyi görmez, yalnızca cari müşteriyi görür', async () => {
    const rows = await listData(tokens.service, '/api/v1/companies?page=1&pageSize=200');
    const ids = rows.map((c) => c.id);
    // Tedarikçi gizli
    expect(ids).not.toContain(companyIdByShort['Taiwan Machine Supply']);
    // Potansiyel müşteriler gizli
    expect(ids).not.toContain(companyIdByShort['KİLİTSAN']);
    expect(ids).not.toContain(companyIdByShort['SACTECH']);
    expect(ids).not.toContain(companyIdByShort['BAYPA TEST KOCATEPE']);
    // Cari müşteriler görünür
    expect(ids).toContain(companyIdByShort['Contra Makine']);
    expect(ids).toContain(companyIdByShort['UNIMAK']);
  });

  it('servis potansiyel müşteriye id ile erişemez (404), cari müşteriye erişebilir', async () => {
    const denied = await supertest(server)
      .get(`/api/v1/companies/${companyIdByShort['KİLİTSAN']}`)
      .set(auth(tokens.service));
    expect(denied.status).toBe(404);
    const ok = await supertest(server)
      .get(`/api/v1/companies/${companyIdByShort['Contra Makine']}`)
      .set(auth(tokens.service));
    expect(ok.status).toBe(200);
  });

  it('admin (kısıtsız) saf tedarikçiyi de görür', async () => {
    const rows = await listData(tokens.admin, '/api/v1/companies?page=1&pageSize=200');
    const ids = rows.map((c) => c.id);
    expect(ids).toContain(companyIdByShort['Taiwan Machine Supply']);
  });
});

describe('Bölüm izolasyonu — teklifler', () => {
  it('CNC satışçısının tüm teklifleri CNC bölümünde', async () => {
    const rows = await listData(tokens.salesCnc, '/api/v1/quotes?page=1&pageSize=200');
    expect(rows.length).toBeGreaterThan(0);
    for (const q of rows) expect(q.divisionId).toBe(divisionIdByCode.cnc);
  });

  it('Üniversal satışçısının teklifleri yalnızca Üniversal bölümünde', async () => {
    const rows = await listData(tokens.salesUni, '/api/v1/quotes?page=1&pageSize=200');
    expect(rows.length).toBeGreaterThan(0);
    for (const q of rows) expect(q.divisionId).toBe(divisionIdByCode.universal);
    // CNC bölümünün firmaları bu listede olmamalı
    const companyIds = rows.map((q) => q.companyId);
    expect(companyIds).not.toContain(companyIdByShort['KİLİTSAN']);
  });
});

describe('Bölüm izolasyonu — view_all + X-Active-Division', () => {
  it('admin (view_all) başlıksız tüm firmaları görür', async () => {
    const rows = await listData(tokens.admin, '/api/v1/companies?page=1&pageSize=200');
    const ids = rows.map((c) => c.id);
    expect(ids).toContain(companyIdByShort['KİLİTSAN']);
    expect(ids).toContain(companyIdByShort['UNIMAK']);
    expect(ids).toContain(companyIdByShort['SACTECH']);
  });

  it('admin X-Active-Division=cnc ile yalnızca CNC firmalarına daralır', async () => {
    const r = await supertest(server)
      .get('/api/v1/companies?page=1&pageSize=200')
      .set(auth(tokens.admin))
      .set('X-Active-Division', divisionIdByCode.cnc);
    expect(r.status).toBe(200);
    const ids = r.body.data.map((c: any) => c.id);
    expect(ids).toContain(companyIdByShort['KİLİTSAN']);
    expect(ids).not.toContain(companyIdByShort['UNIMAK']);
    expect(ids).not.toContain(companyIdByShort['SACTECH']);
  });
});

describe('Bölüm izolasyonu — yazma yolunda otomatik atama', () => {
  let oppId: string;

  it('CNC satışçısının oluşturduğu fırsat CNC bölümüne atanır', async () => {
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set(auth(tokens.salesCnc))
      .send({
        companyId: companyIdByShort['KİLİTSAN'],
        title: `İzolasyon testi fırsatı ${tag}`,
        currencyCode: 'USD',
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    oppId = created.body.id;

    const rows = await listData(tokens.salesCnc, '/api/v1/opportunities?page=1&pageSize=200');
    const mine = rows.find((o) => o.id === oppId);
    expect(mine).toBeTruthy();
    expect(mine.divisionId).toBe(divisionIdByCode.cnc);
  });

  it('başka bölüm satışçısı bu fırsatı göremez (404)', async () => {
    const r = await supertest(server).get(`/api/v1/opportunities/${oppId}`).set(auth(tokens.salesUni));
    expect(r.status).toBe(404);
  });

  it('sahibi (CNC) fırsatı görebilir', async () => {
    const r = await supertest(server).get(`/api/v1/opportunities/${oppId}`).set(auth(tokens.salesCnc));
    expect(r.status).toBe(200);
    expect(r.body.divisionId).toBe(divisionIdByCode.cnc);
  });
});

/**
 * Departman yetkileri — izin matrisinin (rolePermissionMatrix) okuma izni 200,
 * izin yoksa 403; oluşturma izni yoksa POST 403 (guard pipe'tan önce çalışır).
 */
describe('Departman yetkileri — sales', () => {
  it('okuyabildikleri: companies, quotes, sales-orders, inventory, customer-devices', async () => {
    for (const p of [
      '/api/v1/companies',
      '/api/v1/quotes',
      '/api/v1/sales-orders',
      '/api/v1/inventory',
      '/api/v1/customer-devices',
    ]) {
      const r = await supertest(server).get(p).set(auth(tokens.sales));
      expect(r.status, `sales GET ${p}`).toBe(200);
    }
  });
  it('okuyamadıkları: users, roles, payments, receivables, warehouses, service-tickets', async () => {
    for (const p of [
      '/api/v1/users',
      '/api/v1/roles',
      '/api/v1/payments',
      '/api/v1/receivables',
      '/api/v1/warehouses',
      '/api/v1/service-tickets',
    ]) {
      const r = await supertest(server).get(p).set(auth(tokens.sales));
      expect(r.status, `sales GET ${p}`).toBe(403);
    }
  });
});

describe('Departman yetkileri — service', () => {
  it('okuyabildikleri: service-tickets, installations, shipments, customer-devices, companies', async () => {
    for (const p of [
      '/api/v1/service-tickets',
      '/api/v1/installations',
      '/api/v1/shipments',
      '/api/v1/customer-devices',
      '/api/v1/companies',
    ]) {
      const r = await supertest(server).get(p).set(auth(tokens.service));
      expect(r.status, `service GET ${p}`).toBe(200);
    }
  });
  it('okuyamadıkları: quotes, payments, warehouses, users', async () => {
    for (const p of ['/api/v1/quotes', '/api/v1/payments', '/api/v1/warehouses', '/api/v1/users']) {
      const r = await supertest(server).get(p).set(auth(tokens.service));
      expect(r.status, `service GET ${p}`).toBe(403);
    }
  });
  it('teklif veya firma oluşturamaz', async () => {
    const q = await supertest(server).post('/api/v1/quotes').set(auth(tokens.service)).send({});
    expect(q.status).toBe(403);
    const c = await supertest(server).post('/api/v1/companies').set(auth(tokens.service)).send({});
    expect(c.status).toBe(403);
  });
});

describe('Departman yetkileri — finance', () => {
  it('okuyabildikleri: finans akışları ile inventory, customer-devices ve products', async () => {
    for (const p of [
      '/api/v1/receivables',
      '/api/v1/payments',
      '/api/v1/accounting-invoices',
      '/api/v1/quotes',
      '/api/v1/purchase-orders',
      '/api/v1/companies',
      '/api/v1/inventory',
      '/api/v1/customer-devices',
      '/api/v1/products',
    ]) {
      const r = await supertest(server).get(p).set(auth(tokens.finance));
      expect(r.status, `finance GET ${p}`).toBe(200);
    }
  });
  it('okuyamadıkları: warehouses, service-tickets, users', async () => {
    for (const p of ['/api/v1/warehouses', '/api/v1/service-tickets', '/api/v1/users']) {
      const r = await supertest(server).get(p).set(auth(tokens.finance));
      expect(r.status, `finance GET ${p}`).toBe(403);
    }
  });
  it('teklif oluşturamaz ama okuyabilir (approve/reject kapsamı)', async () => {
    const q = await supertest(server).post('/api/v1/quotes').set(auth(tokens.finance)).send({});
    expect(q.status).toBe(403);
  });
});

describe('Departman yetkileri — stock', () => {
  it('okuyabildikleri: warehouses, inventory, purchase-orders, products, sales-orders, shipments', async () => {
    for (const p of [
      '/api/v1/companies',
      '/api/v1/warehouses',
      '/api/v1/inventory',
      '/api/v1/purchase-orders',
      '/api/v1/products',
      '/api/v1/sales-orders',
      '/api/v1/shipments',
    ]) {
      const r = await supertest(server).get(p).set(auth(tokens.stock));
      expect(r.status, `stock GET ${p}`).toBe(200);
    }
  });
  it('okuyamadıkları: quotes, payments, receivables, service-tickets, users', async () => {
    for (const p of [
      '/api/v1/quotes',
      '/api/v1/payments',
      '/api/v1/receivables',
      '/api/v1/service-tickets',
      '/api/v1/users',
    ]) {
      const r = await supertest(server).get(p).set(auth(tokens.stock));
      expect(r.status, `stock GET ${p}`).toBe(403);
    }
  });
  it('teklif oluşturamaz', async () => {
    const q = await supertest(server).post('/api/v1/quotes').set(auth(tokens.stock)).send({});
    expect(q.status).toBe(403);
  });
});

describe('Departman yetkileri — readonly', () => {
  it("salt-okunur rol her kaynağı okuyabilir (matrix '*': ['read'])", async () => {
    for (const p of ['/api/v1/companies', '/api/v1/quotes', '/api/v1/payments', '/api/v1/inventory', '/api/v1/users']) {
      const r = await supertest(server).get(p).set(auth(tokens.readonly));
      expect(r.status, `readonly GET ${p}`).toBe(200);
    }
  });
  it('hiçbir şey oluşturamaz', async () => {
    const c = await supertest(server).post('/api/v1/companies').set(auth(tokens.readonly)).send({});
    expect(c.status).toBe(403);
    const q = await supertest(server).post('/api/v1/quotes').set(auth(tokens.readonly)).send({});
    expect(q.status).toBe(403);
  });
});

describe('Departman yetkileri — admin', () => {
  it('kullanıcıları yönetebilir ama rolleri yalnızca süper admin oluşturur', async () => {
    const users = await supertest(server).get('/api/v1/users').set(auth(tokens.admin));
    expect(users.status).toBe(200);
    const role = await supertest(server)
      .post('/api/v1/roles')
      .set(auth(tokens.admin))
      .send({ code: `admin_denied_${tag}`, name: 'x', permissionCodes: [] });
    expect(role.status).toBe(403);
  });
});
