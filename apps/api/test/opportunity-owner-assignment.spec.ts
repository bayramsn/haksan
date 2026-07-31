import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq } from 'drizzle-orm';
import { opportunityUpdateSchema } from '@haksan/shared';
import { createTestApp } from './setup';
import type { DbClient } from '../src/db/client';
import { auditLogs } from '../src/db/schema/audit';
import { notifications } from '../src/db/schema/companies';
import { DB } from '../src/shared/database/database.module';

let app: NestFastifyApplication;
let db: DbClient;
let superAdminToken = '';
let superAdminUserId = '';
let salesToken = '';
let salesUserId = '';
let adminToken = '';
let companyId = '';
const suffix = Date.now();

beforeAll(async () => {
  app = await createTestApp();
  db = app.get<DbClient>(DB);
  const server = app.getHttpServer();
  const [superAdminLogin, salesLogin, adminLogin] = await Promise.all([
    supertest(server)
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' }),
    supertest(server)
      .post('/api/v1/auth/login')
      .send({ email: 'sales@haksan.local', password: 'sales12345' }),
    supertest(server)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' }),
  ]);
  superAdminToken = superAdminLogin.body.accessToken;
  superAdminUserId = superAdminLogin.body.user.id;
  salesToken = salesLogin.body.accessToken;
  salesUserId = salesLogin.body.user.id;
  adminToken = adminLogin.body.accessToken;

  const companies = await supertest(server)
    .get('/api/v1/companies?pageSize=1')
    .set('Authorization', `Bearer ${superAdminToken}`);
  companyId = companies.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

describe('Lead ve fırsat sorumlu değişikliği', () => {
  it('null ile sahipsiz havuzu destekler ve geçersiz kullanıcı kimliğini reddeder', () => {
    expect(opportunityUpdateSchema.safeParse({ ownerUserId: null }).success).toBe(true);
    expect(opportunityUpdateSchema.safeParse({ ownerUserId: 'not-a-uuid' }).success).toBe(false);
  });

  it('yetkili devri geçmişe yazar, yeni sorumluyu bilgilendirir ve fırsatta da çalışır', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        companyId,
        ownerUserId: superAdminUserId,
        title: `Sorumlu değişikliği ${suffix}`,
        currencyCode: 'EUR',
        nextAction: 'Teknik ihtiyaç görüşmesini planla',
        nextActionAt: '2030-02-01T09:30:00.000Z',
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const opportunityId = created.body.id as string;

    const assignedToSales = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ ownerUserId: salesUserId });
    expect(assignedToSales.status, JSON.stringify(assignedToSales.body)).toBe(200);
    expect(assignedToSales.body.ownerUserId).toBe(salesUserId);

    const leadNotification = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.entityId, opportunityId),
          eq(notifications.userId, salesUserId),
          eq(notifications.type, 'lead_assigned'),
        ),
      );
    expect(leadNotification).toHaveLength(1);

    const ownerAudit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceId, opportunityId),
          eq(auditLogs.action, 'opportunity.owner_changed'),
        ),
      );
    expect(ownerAudit.at(-1)).toMatchObject({
      oldValues: { ownerUserId: superAdminUserId },
      newValues: { ownerUserId: salesUserId },
    });

    const forbidden = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ownerUserId: superAdminUserId });
    expect(forbidden.status).toBe(403);

    const unassigned = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ ownerUserId: null });
    expect(unassigned.status, JSON.stringify(unassigned.body)).toBe(200);
    expect(unassigned.body.ownerUserId).toBeNull();

    const restored = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ ownerUserId: superAdminUserId });
    expect(restored.status).toBe(200);

    const converted = await supertest(server)
      .post(`/api/v1/opportunities/${opportunityId}/convert`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ overrideReason: 'Sorumlu değişikliği fırsat görünümünde de doğrulanacak' });
    expect(converted.status, JSON.stringify(converted.body)).toBe(201);
    expect(converted.body.qualificationStage).toBe('c');

    const opportunityAssigned = await supertest(server)
      .patch(`/api/v1/opportunities/${opportunityId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ ownerUserId: salesUserId });
    expect(opportunityAssigned.status, JSON.stringify(opportunityAssigned.body)).toBe(200);
    expect(opportunityAssigned.body.qualificationStage).toBe('c');
    expect(opportunityAssigned.body.ownerUserId).toBe(salesUserId);

    const opportunityNotification = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.entityId, opportunityId),
          eq(notifications.userId, salesUserId),
          eq(notifications.type, 'opportunity_assigned'),
        ),
      );
    expect(opportunityNotification).toHaveLength(1);
  });
});
