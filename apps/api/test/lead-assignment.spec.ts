import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let token = '';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = await createTestApp();
  const login = await supertest(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' });
  token = login.body.accessToken;
});

afterAll(async () => {
  await app.close();
});

describe('Lead assignment rules', () => {
  it('round-robins concurrent leads, skips passive users, isolates divisions and keeps unmatched leads unassigned', async () => {
    const server = app.getHttpServer();
    const [divisionResponse, departmentResponse] = await Promise.all([
      supertest(server).get('/api/v1/divisions').set(auth()),
      supertest(server).get('/api/v1/departments').set(auth()),
    ]);
    expect(divisionResponse.status).toBe(200);
    expect(departmentResponse.status).toBe(200);
    const divisions = divisionResponse.body.data ?? divisionResponse.body;
    const departments = departmentResponse.body.data ?? departmentResponse.body;
    expect(divisions.length).toBeGreaterThanOrEqual(2);
    const primaryDivision = divisions[0];
    const otherDivision = divisions[1];
    const salesDepartment = departments.find((row: { code?: string }) => row.code === 'sales') ?? departments[0];

    const createSalesUser = async (label: string) => {
      const response = await supertest(server)
        .post('/api/v1/users')
        .set(auth())
        .send({
          fullName: `Lead Assignment ${label} ${suffix}`,
          email: `lead-assignment-${label}-${suffix}@haksan.local`,
          password: 'leadAssignment12345',
          departmentId: salesDepartment.id,
          roleCodes: ['sales'],
          divisionIds: [primaryDivision.id],
        });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      return response.body.id as string;
    };

    const [firstUserId, secondUserId] = await Promise.all([
      createSalesUser('a'),
      createSalesUser('b'),
    ]);
    const city = `RoundRobin-${suffix}`;
    const productTerm = `Router-${suffix}`;
    const ruleResponse = await supertest(server)
      .post('/api/v1/lead-assignment-rules')
      .set(auth())
      .send({
        name: `Concurrent round-robin ${suffix}`,
        priority: 0,
        divisionId: primaryDivision.id,
        criteria: { cities: [city], productTerms: [productTerm], sourceCodes: [] },
        assigneeUserIds: [firstUserId, secondUserId],
      });
    expect(ruleResponse.status, JSON.stringify(ruleResponse.body)).toBe(201);
    const ruleId = ruleResponse.body.id as string;

    const createLead = (index: number, divisionId = primaryDivision.id, cityValue = city) =>
      supertest(server)
        .post('/api/v1/opportunities')
        .set(auth())
        .send({
          divisionId,
          leadContactName: `Atama Kontağı ${index}`,
          leadPhone: `0532555${String(index).padStart(4, '0')}`,
          leadCity: cityValue,
          title: `${productTerm} ${index}`,
          currencyCode: 'EUR',
        });

    const first = await createLead(1);
    const second = await createLead(2);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect([first.body.ownerUserId, second.body.ownerUserId]).toEqual([firstUserId, secondUserId]);

    const concurrent = await Promise.all(
      Array.from({ length: 6 }, (_, index) => createLead(index + 10)),
    );
    expect(concurrent.every((response) => response.status === 201)).toBe(true);
    const ownerCounts = concurrent.reduce<Record<string, number>>((counts, response) => {
      counts[response.body.ownerUserId] = (counts[response.body.ownerUserId] ?? 0) + 1;
      return counts;
    }, {});
    expect(ownerCounts).toEqual({ [firstUserId]: 3, [secondUserId]: 3 });

    const passivated = await supertest(server)
      .patch(`/api/v1/users/${secondUserId}`)
      .set(auth())
      .send({ status: 'passive' });
    expect(passivated.status, JSON.stringify(passivated.body)).toBe(200);
    const afterPassivation = await createLead(30);
    expect(afterPassivation.status).toBe(201);
    expect(afterPassivation.body.ownerUserId).toBe(firstUserId);

    const divisionIsolated = await createLead(31, otherDivision.id);
    expect(divisionIsolated.status).toBe(201);
    expect(divisionIsolated.body.ownerUserId).toBeNull();

    const unmatched = await createLead(32, primaryDivision.id, `NoMatch-${suffix}`);
    expect(unmatched.status).toBe(201);
    expect(unmatched.body.ownerUserId).toBeNull();

    const removed = await supertest(server)
      .delete(`/api/v1/lead-assignment-rules/${ruleId}`)
      .set(auth());
    expect(removed.status).toBe(200);
  });
});
