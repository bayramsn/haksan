import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb } from '../src/db/client';
import { divisionTargets, divisions, users, visits } from '../src/db/schema';

describe('division targets', () => {
  let app: NestFastifyApplication;
  let adminToken = '';
  let salesToken = '';
  let tenantId = '';
  let adminId = '';
  let salesId = '';
  let salesDepartmentId = '';
  let targetDivisionId = '';
  let otherDivisionId = '';
  const visitIds: string[] = [];
  const period = '2098-11';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = async (email: string, password: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      date: '2098-11-30',
      rates: { EUR: 0.5, TRY: 20 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    app = await createTestApp();
    adminToken = await login('admin@haksan.local', 'admin12345');
    salesToken = await login('sales@haksan.local', 'sales12345');

    const db = getDb();
    const admin = await db.query.users.findFirst({ where: eq(users.email, 'admin@haksan.local') });
    const sales = await db.query.users.findFirst({ where: eq(users.email, 'sales@haksan.local') });
    if (!admin || !sales || !sales.departmentId) throw new Error('Hedef testi kullanıcıları bulunamadı');
    tenantId = admin.tenantId;
    adminId = admin.id;
    salesId = sales.id;
    salesDepartmentId = sales.departmentId;

    const divisionRows = await db.query.divisions.findMany({
      where: and(eq(divisions.tenantId, tenantId), eq(divisions.isActive, true)),
    });
    if (divisionRows.length < 2) throw new Error('Bölüm hedef testi için en az iki aktif bölüm gerekir');
    targetDivisionId = divisionRows[0].id;
    otherDivisionId = divisionRows[1].id;
  });

  afterAll(async () => {
    const db = getDb();
    for (const id of visitIds) await db.delete(visits).where(eq(visits.id, id));
    if (tenantId) {
      await db.delete(divisionTargets).where(and(
        eq(divisionTargets.tenantId, tenantId),
        eq(divisionTargets.period, period),
      ));
    }
    await app?.close();
    vi.unstubAllGlobals();
  });

  it('admin creates, updates and lists one target per division and period', async () => {
    const server = app.getHttpServer();
    const payload = {
      period,
      currency: 'USD',
      salesAmount: 125000,
      visitTarget: 2,
      targetItems: [],
      note: 'Bölüm hedefi',
    };
    const created = await request(server)
      .post(`/api/v1/divisions/${targetDivisionId}/targets`)
      .set(auth(adminToken))
      .send(payload)
      .expect(201);
    expect(created.body).toMatchObject({
      tenantId,
      divisionId: targetDivisionId,
      period,
      visitTarget: 2,
      note: 'Bölüm hedefi',
    });
    expect(Number(created.body.salesAmount)).toBe(125000);

    const updated = await request(server)
      .post(`/api/v1/divisions/${targetDivisionId}/targets`)
      .set(auth(adminToken))
      .send({ ...payload, visitTarget: 3, note: 'Güncel bölüm hedefi' })
      .expect(201);
    expect(updated.body.id).toBe(created.body.id);
    expect(updated.body).toMatchObject({ visitTarget: 3, note: 'Güncel bölüm hedefi' });

    const listed = await request(server)
      .get(`/api/v1/division-targets?period=${period}`)
      .set(auth(adminToken))
      .expect(200);
    const rows = listed.body.filter((row: any) => row.divisionId === targetDivisionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.body.id);
  });

  it('rejects a division outside the tenant and protects target management from sales users', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/divisions/${randomUUID()}/targets`)
      .set(auth(adminToken))
      .send({ period, currency: 'USD', targetItems: [] })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/division-targets?period=${period}`)
      .set(auth(salesToken))
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/divisions/${targetDivisionId}/targets`)
      .set(auth(salesToken))
      .send({ period, currency: 'USD', targetItems: [] })
      .expect(403);
  });

  it('requires an id for explicit user, department and division scopes', async () => {
    for (const scope of ['user', 'department', 'division']) {
      await request(app.getHttpServer())
        .get(`/api/v1/reports/target-progress?period=${period}&scope=${scope}`)
        .set(auth(adminToken))
        .expect(422);
    }
  });

  it('lets admin inspect user, department and division targets without widening other reports', async () => {
    const userResponse = await request(app.getHttpServer())
      .get(`/api/v1/reports/target-progress?period=${period}&scope=user&id=${salesId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(userResponse.body.subjects).toHaveLength(1);
    expect(userResponse.body.subjects[0].subject.id).toBe(salesId);

    const departmentResponse = await request(app.getHttpServer())
      .get(`/api/v1/reports/target-progress?period=${period}&scope=department&id=${salesDepartmentId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(departmentResponse.body.subjects).toHaveLength(1);
    expect(departmentResponse.body.subjects[0].subject.id).toBe(salesDepartmentId);

    const divisionResponse = await request(app.getHttpServer())
      .get(`/api/v1/reports/target-progress?period=${period}&scope=division&id=${targetDivisionId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(divisionResponse.body.subjects).toHaveLength(1);
    expect(divisionResponse.body.subjects[0].subject.id).toBe(targetDivisionId);

    await request(app.getHttpServer())
      .get(`/api/v1/reports/target-progress?period=${period}&scope=role`)
      .set(auth(adminToken))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/reports/department-performance?period=${period}`)
      .set(auth(adminToken))
      .expect(403);
  });

  it('aggregates only the selected division operations into one subject', async () => {
    const db = getDb();
    const [first, second, outside] = await db.insert(visits).values([
      {
        tenantId,
        divisionId: targetDivisionId,
        visitDate: new Date('2098-11-10T10:00:00.000Z'),
        createdBy: adminId,
      },
      {
        tenantId,
        divisionId: targetDivisionId,
        visitDate: new Date('2098-11-11T10:00:00.000Z'),
        createdBy: salesId,
      },
      {
        tenantId,
        divisionId: otherDivisionId,
        visitDate: new Date('2098-11-12T10:00:00.000Z'),
        createdBy: salesId,
      },
    ]).returning({ id: visits.id });
    visitIds.push(first.id, second.id, outside.id);

    // Önceki test upsert'i 3'e çıkardı; ilerleme hesabında kayıt adedi 2 olmalı.
    const response = await request(app.getHttpServer())
      .get(`/api/v1/reports/target-progress?period=${period}&scope=division&id=${targetDivisionId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(response.body.subjects).toHaveLength(1);
    expect(response.body.subjects[0]).toMatchObject({
      subject: { kind: 'division', id: targetDivisionId },
      hasTarget: true,
      metrics: { visitTarget: { target: 3, actual: 2, pct: 67 } },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/reports/target-progress?period=${period}&scope=division&id=${targetDivisionId}`)
      .set(auth(salesToken))
      .expect(403);
  });
});
