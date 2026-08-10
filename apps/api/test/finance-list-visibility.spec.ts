import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AuthContext } from '../src/shared/security/auth.types';
import { getDb, schema } from '../src/db/client';
import { FinanceController } from '../src/modules/finance/finance.controller';
import { createTestApp } from './setup';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const tag = Date.now().toString(36);
const password = 'finance-scope-12345';

describe('finance liste görünürlüğü', () => {
  let app: NestFastifyApplication | undefined;
  let adminToken = '';
  let scopedToken = '';
  let noScopeToken = '';
  let tenantId = '';
  let adminUserId = '';
  let allowedDivisionId = '';
  let deniedDivisionId = '';
  let allowedCompanyId = '';
  let supplierCompanyId = '';
  let deniedCompanyId = '';
  let crossTenantCompanyId = '';
  let otherTenantId: string | undefined;
  const userIds: string[] = [];
  const companyIds: string[] = [];
  const receivableIds: string[] = [];
  const paymentIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' })
      .expect(201);
    adminToken = login.body.accessToken;

    const me = await request(server).get('/api/v1/auth/me').set(auth(adminToken)).expect(200);
    tenantId = me.body.user.tenantId;
    adminUserId = me.body.user.id;
    const divisions = await request(server).get('/api/v1/divisions').set(auth(adminToken)).expect(200);
    expect(divisions.body.length).toBeGreaterThanOrEqual(2);
    allowedDivisionId = divisions.body[0].id;
    deniedDivisionId = divisions.body[1].id;

    const scopedEmail = `finance-scope-${tag}@haksan.local`;
    const noScopeEmail = `finance-empty-${tag}@haksan.local`;
    const scopedUser = await request(server)
      .post('/api/v1/users')
      .set(auth(adminToken))
      .send({
        fullName: `Finance Scoped ${tag}`,
        email: scopedEmail,
        username: `finance-scope-${tag}`.slice(0, 32),
        password,
        roleCodes: ['finance'],
        divisionIds: [allowedDivisionId],
      })
      .expect(201);
    const noScopeUser = await request(server)
      .post('/api/v1/users')
      .set(auth(adminToken))
      .send({
        fullName: `Finance Empty ${tag}`,
        email: noScopeEmail,
        username: `finance-empty-${tag}`.slice(0, 32),
        password,
        roleCodes: ['finance'],
        divisionIds: [],
      })
      .expect(201);
    userIds.push(scopedUser.body.id, noScopeUser.body.id);

    const [scopedLogin, noScopeLogin] = await Promise.all([
      request(server).post('/api/v1/auth/login').send({ email: scopedEmail, password }),
      request(server).post('/api/v1/auth/login').send({ email: noScopeEmail, password }),
    ]);
    expect(scopedLogin.status).toBe(201);
    expect(noScopeLogin.status).toBe(201);
    scopedToken = scopedLogin.body.accessToken;
    noScopeToken = noScopeLogin.body.accessToken;

    const db = getDb();
    const [customerRelation, supplierRelation, visibleStatus] = await Promise.all([
      db.query.companyRelationTypes.findFirst({ where: eq(schema.companyRelationTypes.code, 'customer') }),
      db.query.companyRelationTypes.findFirst({ where: eq(schema.companyRelationTypes.code, 'supplier') }),
      db.query.companyStatuses.findFirst({ where: eq(schema.companyStatuses.code, 'potential') }),
    ]);
    if (!customerRelation || !supplierRelation || !visibleStatus) {
      throw new Error('Firma görünürlük lookup seed kayıtları bulunamadı');
    }

    const insertedCompanies = await db
      .insert(schema.companies)
      .values([
        {
          tenantId,
          relationTypeId: customerRelation.id,
          customerStatusId: visibleStatus.id,
          externalCompanyNo: `FIN-ALLOWED-${tag}`,
          legalTitle: `FINANCE ALLOWED ${tag}`,
        },
        {
          tenantId,
          relationTypeId: supplierRelation.id,
          customerStatusId: visibleStatus.id,
          externalCompanyNo: `FIN-SUPPLIER-${tag}`,
          legalTitle: `FINANCE SUPPLIER ${tag}`,
        },
        {
          tenantId,
          relationTypeId: customerRelation.id,
          customerStatusId: visibleStatus.id,
          externalCompanyNo: `FIN-DENIED-${tag}`,
          legalTitle: `FINANCE DENIED ${tag}`,
        },
      ])
      .returning({ id: schema.companies.id, externalCompanyNo: schema.companies.externalCompanyNo });
    allowedCompanyId = insertedCompanies.find((row) => row.externalCompanyNo === `FIN-ALLOWED-${tag}`)!.id;
    supplierCompanyId = insertedCompanies.find((row) => row.externalCompanyNo === `FIN-SUPPLIER-${tag}`)!.id;
    deniedCompanyId = insertedCompanies.find((row) => row.externalCompanyNo === `FIN-DENIED-${tag}`)!.id;
    companyIds.push(...insertedCompanies.map((row) => row.id));
    await db.insert(schema.companyDivisions).values([
      { tenantId, companyId: allowedCompanyId, divisionId: allowedDivisionId },
      { tenantId, companyId: supplierCompanyId, divisionId: allowedDivisionId },
      { tenantId, companyId: deniedCompanyId, divisionId: deniedDivisionId },
    ]);

    const [otherTenant] = await db
      .insert(schema.tenants)
      .values({ name: `Finance Cross Tenant ${tag}`, slug: `finance-cross-${tag}` })
      .returning({ id: schema.tenants.id });
    otherTenantId = otherTenant.id;
    const [otherDivision] = await db
      .insert(schema.divisions)
      .values({ tenantId: otherTenant.id, code: `finance-${tag}`, name: `Finance Cross ${tag}` })
      .returning({ id: schema.divisions.id });
    const [crossCompany] = await db
      .insert(schema.companies)
      .values({
        tenantId: otherTenant.id,
        relationTypeId: customerRelation.id,
        customerStatusId: visibleStatus.id,
        externalCompanyNo: `FIN-CROSS-${tag}`,
        legalTitle: `FINANCE CROSS TENANT ${tag}`,
      })
      .returning({ id: schema.companies.id });
    crossTenantCompanyId = crossCompany.id;
    companyIds.push(crossCompany.id);

    const now = new Date('2026-04-05T12:00:00.000Z');
    const receivableRows = await db
      .insert(schema.receivables)
      .values([
        { tenantId, divisionId: allowedDivisionId, companyId: allowedCompanyId, amount: '101', dueDate: now, invoiceNo: `REC-ALLOWED-${tag}` },
        { tenantId, divisionId: allowedDivisionId, companyId: supplierCompanyId, amount: '102', dueDate: now, invoiceNo: `REC-SUPPLIER-${tag}` },
        { tenantId, divisionId: deniedDivisionId, companyId: deniedCompanyId, amount: '103', dueDate: now, invoiceNo: `REC-DENIED-${tag}` },
        { tenantId: otherTenant.id, divisionId: otherDivision.id, companyId: crossCompany.id, amount: '104', dueDate: now, invoiceNo: `REC-CROSS-${tag}` },
      ])
      .returning({ id: schema.receivables.id });
    receivableIds.push(...receivableRows.map((row) => row.id));

    const paymentRows = await db
      .insert(schema.payments)
      .values([
        { tenantId, divisionId: allowedDivisionId, companyId: allowedCompanyId, direction: 'in', amount: '201', paymentDate: now, createdBy: adminUserId },
        { tenantId, divisionId: allowedDivisionId, companyId: supplierCompanyId, direction: 'out', amount: '202', paymentDate: now, createdBy: adminUserId },
        { tenantId, divisionId: deniedDivisionId, companyId: deniedCompanyId, direction: 'in', amount: '203', paymentDate: now, createdBy: adminUserId },
        { tenantId: otherTenant.id, divisionId: otherDivision.id, companyId: crossCompany.id, direction: 'in', amount: '204', paymentDate: now },
      ])
      .returning({ id: schema.payments.id });
    paymentIds.push(...paymentRows.map((row) => row.id));
  });

  afterAll(async () => {
    const db = getDb();
    if (paymentIds.length) await db.delete(schema.payments).where(inArray(schema.payments.id, paymentIds));
    if (receivableIds.length) await db.delete(schema.receivables).where(inArray(schema.receivables.id, receivableIds));
    if (companyIds.length) {
      await db.delete(schema.companyDivisions).where(inArray(schema.companyDivisions.companyId, companyIds));
      await db.delete(schema.companies).where(inArray(schema.companies.id, companyIds));
    }
    if (userIds.length) await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    if (otherTenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
    if (app) await app.close();
  });

  it('yalnız izinli resource division kayıtlarını güvenli embedded firma DTO ile listeler', async () => {
    const server = app!.getHttpServer();
    const [receivables, supplierReceivables, payments, supplierPayments] = await Promise.all([
      request(server).get('/api/v1/receivables').query({ companyId: allowedCompanyId }).set(auth(scopedToken)),
      request(server).get('/api/v1/receivables').query({ companyId: supplierCompanyId }).set(auth(scopedToken)),
      request(server).get('/api/v1/payments').query({ companyId: allowedCompanyId }).set(auth(scopedToken)),
      request(server).get('/api/v1/payments').query({ companyId: supplierCompanyId }).set(auth(scopedToken)),
    ]);
    expect(receivables.status).toBe(200);
    expect(supplierReceivables.status).toBe(200);
    expect(payments.status).toBe(200);
    expect(supplierPayments.status).toBe(200);
    expect(receivables.body.meta.total).toBe(1);
    expect(supplierReceivables.body.meta.total).toBe(1);
    expect(payments.body.meta.total).toBe(1);
    expect(supplierPayments.body.meta.total).toBe(1);

    const allowedReceivable = receivables.body.data[0];
    const allowedPayment = payments.body.data[0];
    expect(allowedReceivable.company).toEqual({
      id: allowedCompanyId,
      externalCompanyNo: `FIN-ALLOWED-${tag}`,
      legalTitle: `FINANCE ALLOWED ${tag}`,
      shortName: null,
    });
    expect(allowedPayment.company).toEqual(allowedReceivable.company);
  });

  it('yetkisiz aktif division başlığında ve boş kapsamda fail-closed davranır', async () => {
    const server = app!.getHttpServer();
    for (const path of ['/api/v1/receivables', '/api/v1/payments']) {
      const unauthorizedDivision = await request(server)
        .get(path)
        .query({ page: 1, pageSize: 200 })
        .set(auth(scopedToken))
        .set('x-active-division', deniedDivisionId);
      expect(unauthorizedDivision.status, path).toBe(200);
      expect(unauthorizedDivision.body.meta.total, path).toBe(0);
      expect(unauthorizedDivision.body.data, path).toEqual([]);

      const noScope = await request(server)
        .get(path)
        .query({ page: 1, pageSize: 200 })
        .set(auth(noScopeToken));
      expect(noScope.status, path).toBe(200);
      expect(noScope.body.meta.total, path).toBe(0);
      expect(noScope.body.data, path).toEqual([]);
    }
  });

  it('companyId filtresi farklı tenant veya yetkisiz division kaydını açığa çıkarmaz', async () => {
    const server = app!.getHttpServer();
    for (const path of ['/api/v1/receivables', '/api/v1/payments']) {
      const denied = await request(server).get(path).query({ companyId: deniedCompanyId }).set(auth(scopedToken));
      expect(denied.status, path).toBe(200);
      expect(denied.body.meta.total, path).toBe(0);

      const crossTenant = await request(server).get(path).query({ companyId: crossTenantCompanyId }).set(auth(adminToken));
      expect(crossTenant.status, path).toBe(200);
      expect(crossTenant.body.meta.total, path).toBe(0);
    }
  });

  it('rol bazlı firma görünürlüğü linked finance kayıtlarına da uygulanır', async () => {
    const controller = app!.get(FinanceController);
    const actor: AuthContext = {
      userId: adminUserId,
      tenantId,
      email: `visibility-${tag}@example.test`,
      roles: ['sales'],
      permissions: new Set(['receivables.read', 'payments.read']),
      divisionIds: [allowedDivisionId],
      primaryDivisionId: allowedDivisionId,
      departmentIds: [],
      primaryDepartmentId: null,
      canViewAllDivisions: false,
      activeDivisionId: null,
      activeDepartmentId: null,
      accessScopes: [
        { resource: 'receivables', departmentId: null, divisionId: allowedDivisionId, isPrimary: true },
        { resource: 'payments', departmentId: null, divisionId: allowedDivisionId, isPrimary: true },
      ],
    };
    const baseQuery = { page: 1, pageSize: 200, sortDir: 'desc' as const };
    const [visibleReceivables, hiddenReceivables, visiblePayments, hiddenPayments] = await Promise.all([
      controller.listReceivables({ ...baseQuery, companyId: allowedCompanyId }, actor),
      controller.listReceivables({ ...baseQuery, companyId: supplierCompanyId }, actor),
      controller.listPayments({ ...baseQuery, companyId: allowedCompanyId }, actor),
      controller.listPayments({ ...baseQuery, companyId: supplierCompanyId }, actor),
    ]);
    expect(visibleReceivables.meta.total).toBe(1);
    expect(visiblePayments.meta.total).toBe(1);
    expect(hiddenReceivables.meta.total).toBe(0);
    expect(hiddenPayments.meta.total).toBe(0);
  });
});
