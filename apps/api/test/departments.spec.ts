import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let adminToken: string;

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'admin@haksan.local', password: 'admin12345' });
  adminToken = login.body.accessToken;
});

afterAll(async () => {
  await app.close();
});

describe('Departments admin API', () => {
  it('GET /departments returns list for admin', async () => {
    const r = await supertest(app.getHttpServer())
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('creates a department, exposes it to user forms, and safely removes it', async () => {
    const code = `dept_${Date.now()}`;
    const created = await supertest(app.getHttpServer())
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Dept', code, description: 'vitest' });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe(code);

    const listed = await supertest(app.getHttpServer())
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listed.body.some((department: { id: string }) => department.id === created.body.id)).toBe(true);

    const removed = await supertest(app.getHttpServer())
      .delete(`/api/v1/departments/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ ok: true, id: created.body.id });

    const afterRemoval = await supertest(app.getHttpServer())
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(afterRemoval.body.some((department: { id: string }) => department.id === created.body.id)).toBe(false);

    const restored = await supertest(app.getHttpServer())
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Restored Test Dept', code, description: 'vitest restored' });
    expect(restored.status).toBe(201);
    expect(restored.body.id).toBe(created.body.id);
    expect(restored.body.name).toBe('Restored Test Dept');

    const cleanup = await supertest(app.getHttpServer())
      .delete(`/api/v1/departments/${restored.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cleanup.status).toBe(200);
  });

  it('does not remove a department assigned to a user', async () => {
    const users = await supertest(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);
    const assignedDepartmentId = users.body.find((user: { departmentId?: string | null }) => user.departmentId)?.departmentId;
    expect(assignedDepartmentId).toBeTruthy();

    const removed = await supertest(app.getHttpServer())
      .delete(`/api/v1/departments/${assignedDepartmentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(removed.status).toBe(409);
    expect(removed.body.error.message).toContain('kullanıcılara');
  });

  it('GET /department-targets returns array', async () => {
    const period = '2026-06';
    const r = await supertest(app.getHttpServer())
      .get(`/api/v1/department-targets?period=${period}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});
