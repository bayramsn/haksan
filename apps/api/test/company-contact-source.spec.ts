import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

describe('Company contact source', () => {
  let app: NestFastifyApplication;
  let token: string;
  let divisionId: string;
  let companyId: string | undefined;

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' })
      .expect(201);
    token = login.body.accessToken;

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    divisionId = me.body.user.divisions[0].id;
  });

  afterAll(async () => {
    if (companyId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${companyId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  it('rejects ambiguous or unknown sources', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalTitle: `Çift kaynak testi ${Date.now()}`,
        divisionId,
        contactSourceCode: 'phone',
        contactSourceText: 'Elle yazılan kaynak',
      })
      .expect(422);

    const unknown = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalTitle: `Bilinmeyen kaynak testi ${Date.now()}`,
        divisionId,
        contactSourceCode: 'not-a-real-contact-source',
      })
      .expect(422);
    expect(unknown.body.error.details).toMatchObject({ field: 'contactSourceCode' });
  });

  it('persists, switches, and clears a custom source without stale values', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalTitle: `Elle kaynak testi ${Date.now()}`,
        divisionId,
        contactSourceText: '  Bölge bayi yönlendirmesi  ',
      })
      .expect(201);
    companyId = created.body.id;
    expect(created.body).toMatchObject({
      contactSourceId: null,
      contactSourceText: 'Bölge bayi yönlendirmesi',
    });

    const exported = await request(app.getHttpServer())
      .get('/api/v1/exports/companies')
      .query({ search: created.body.legalTitle })
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.body);
    const worksheet = workbook.getWorksheet('Firmalar');
    expect(worksheet).toBeDefined();
    const headers = (worksheet!.getRow(1).values as unknown[]).map(String);
    const contactSourceColumn = headers.indexOf('İrtibat Şekli / Kaynak');
    expect(contactSourceColumn).toBeGreaterThan(0);
    expect(worksheet!.getRow(2).getCell(contactSourceColumn).text).toBe('Bölge bayi yönlendirmesi');

    const coded = await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contactSourceCode: 'phone' })
      .expect(200);
    expect(coded.body.contactSourceId).toEqual(expect.any(String));
    expect(coded.body.contactSourceText).toBeNull();

    const custom = await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contactSourceText: '  Satış ekibi notu  ' })
      .expect(200);
    expect(custom.body).toMatchObject({
      contactSourceId: null,
      contactSourceText: 'Satış ekibi notu',
    });

    const cleared = await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contactSourceCode: null, contactSourceText: null })
      .expect(200);
    expect(cleared.body).toMatchObject({ contactSourceId: null, contactSourceText: null });
  });
});
