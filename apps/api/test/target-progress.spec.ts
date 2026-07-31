import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb } from '../src/db/client';
import {
  accountingInvoices,
  companies,
  currencies,
  departments,
  opportunities,
  pipelineStages,
  quotes,
  userDepartmentAssignments,
  users,
} from '../src/db/schema';

describe('automatic target progress', () => {
  let app: NestFastifyApplication;
  let token = '';
  let tenantId = '';
  let adminId = '';
  let salesId = '';
  let companyId: string | undefined;
  let opportunityId: string | undefined;
  let quoteId: string | undefined;
  let invoiceId: string | undefined;
  let secondaryDepartmentId: string | undefined;

  const period = new Date().toISOString().slice(0, 7);

  const progress = async (scope = 'all-users', id?: string) => {
    const query = new URLSearchParams({ period, scope });
    if (id) query.set('id', id);
    return request(app.getHttpServer())
      .get(`/api/v1/reports/target-progress?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  };

  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      rates: { EUR: 0.5, TRY: 20 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' })
      .expect(201);
    token = login.body.accessToken;

    const db = getDb();
    const admin = await db.query.users.findFirst({ where: eq(users.email, 'admin@haksan.local') });
    const sales = await db.query.users.findFirst({ where: eq(users.email, 'sales@haksan.local') });
    if (!admin || !sales) throw new Error('Hedef testi kullanıcıları bulunamadı');
    tenantId = admin.tenantId;
    adminId = admin.id;
    salesId = sales.id;
  });

  afterAll(async () => {
    const db = getDb();
    if (invoiceId) await db.delete(accountingInvoices).where(eq(accountingInvoices.id, invoiceId));
    if (quoteId) await db.delete(quotes).where(eq(quotes.id, quoteId));
    if (opportunityId) await db.delete(opportunities).where(eq(opportunities.id, opportunityId));
    if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
    if (secondaryDepartmentId) {
      await db.delete(userDepartmentAssignments).where(and(
        eq(userDepartmentAssignments.userId, adminId),
        eq(userDepartmentAssignments.departmentId, secondaryDepartmentId),
      ));
      await db.delete(departments).where(eq(departments.id, secondaryDepartmentId));
    }
    await app?.close();
    vi.unstubAllGlobals();
  });

  it('normalizes a EUR invoice to USD and credits the project owner', async () => {
    const before = (await progress()).body;
    const beforeSales = before.subjects.find((row: any) => row.subject.id === salesId)?.metrics?.salesAmount?.actual ?? 0;
    const beforeAdmin = before.subjects.find((row: any) => row.subject.id === adminId)?.metrics?.salesAmount?.actual ?? 0;

    const db = getDb();
    const eur = await db.query.currencies.findFirst({ where: eq(currencies.code, 'EUR') });
    const stage = await db.query.pipelineStages.findFirst({ where: eq(pipelineStages.code, 'lead') });
    if (!eur || !stage) throw new Error('Hedef testi lookup kayıtları bulunamadı');
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const [company] = await db.insert(companies).values({
      tenantId,
      legalTitle: `HEDEF TEST ${suffix}`,
      createdBy: adminId,
    }).returning({ id: companies.id });
    companyId = company.id;
    const [opportunity] = await db.insert(opportunities).values({
      tenantId,
      companyId: companyId!,
      currentStageId: stage.id,
      ownerUserId: salesId,
      title: `Hedef Test ${suffix}`,
      createdBy: adminId,
    }).returning({ id: opportunities.id });
    opportunityId = opportunity.id;
    const [quote] = await db.insert(quotes).values({
      tenantId,
      opportunityId,
      companyId: companyId!,
      documentNo: `HT-${suffix}`,
      quoteDate: new Date(),
      projectOwnerUserId: salesId,
      currencyId: eur.id,
      grandTotal: '100',
      createdBy: adminId,
    }).returning({ id: quotes.id });
    quoteId = quote.id;
    const [invoice] = await db.insert(accountingInvoices).values({
      tenantId,
      companyId: companyId!,
      type: 'sales',
      invoiceNo: `HT-F-${suffix}`,
      invoiceDate: new Date(),
      amount: '100',
      vatAmount: '0',
      grandTotal: '100',
      currencyId: eur.id,
      quoteId,
      createdBy: adminId,
    }).returning({ id: accountingInvoices.id });
    invoiceId = invoice.id;

    const after = (await progress()).body;
    const afterSales = after.subjects.find((row: any) => row.subject.id === salesId)?.metrics?.salesAmount?.actual ?? 0;
    const afterAdmin = after.subjects.find((row: any) => row.subject.id === adminId)?.metrics?.salesAmount?.actual ?? 0;

    expect(after.currencyNormalization).toMatchObject({ base: 'USD', source: 'live' });
    expect(afterSales - beforeSales).toBeCloseTo(200, 4);
    expect(afterAdmin - beforeAdmin).toBeCloseTo(0, 4);
  });

  it('includes a user in secondary department totals and user metadata', async () => {
    const db = getDb();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [department] = await db.insert(departments).values({
      tenantId,
      code: `target_secondary_${suffix}`,
      name: `İkincil Hedef ${suffix}`,
    }).returning({ id: departments.id });
    secondaryDepartmentId = department.id;
    await db.insert(userDepartmentAssignments).values({
      userId: adminId,
      departmentId: secondaryDepartmentId!,
      isPrimary: false,
    });

    const departmentResponse = (await progress('department', secondaryDepartmentId)).body;
    expect(departmentResponse.subjects[0]).toMatchObject({
      subject: { id: secondaryDepartmentId, memberCount: 1 },
    });

    const userResponse = (await progress()).body;
    const admin = userResponse.subjects.find((row: any) => row.subject.id === adminId);
    expect(admin.subject.departmentIds).toContain(secondaryDepartmentId);
    expect(admin.subject.departmentNames.some((name: string) => name.includes('İkincil Hedef'))).toBe(true);
  });

  it('exports the period target report as an Excel workbook', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/reports/export/target-progress?period=${period}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect(response.headers['content-disposition']).toContain(`hedef-gerceklesme-${period}.xlsx`);
    expect(Number(response.headers['content-length'] ?? 0)).toBeGreaterThan(100);
  });
});
