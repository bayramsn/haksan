import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

let app: NestFastifyApplication;
let superAdminToken = '';
let adminToken = '';
let divisionId = '';
let importedCompanyId = '';
let importedContactId = '';

const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const companyNo = `TEST-F-${suffix}`;
const contactNo = `TEST-K-${suffix}`;

async function workbookFile(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Liste');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileBase64: Buffer.from(buffer).toString('base64'),
  };
}

async function importPayload() {
  return {
    companiesFile: await workbookFile(
      'Firma-Listesi.xlsx',
      ['NO', 'FİRMA ADI', 'TİP', 'DURUM', 'E-POSTA', 'TELEFON', 'ŞEHİR', 'GRUP ADI'],
      [[companyNo, `Excel Akış Test Firması ${suffix}`, 'Müşteri', 'Cari', `teklif-${suffix}@example.test`, '+90 212 000 00 01', 'İstanbul', 'Excel Akış Grubu']]
    ),
    contactsFile: await workbookFile(
      'Kontak-Listesi.xlsx',
      ['NO', 'FİRMA', 'FIRMA NO', 'KONTAK ADI', 'ÜNVAN', 'İŞ E-POSTA'],
      [[contactNo, `Excel Akış Test Firması ${suffix}`, companyNo, `Excel Test Kontağı ${suffix}`, 'Satın Alma', `kontak-${suffix}@example.test`]]
    ),
    divisionId,
  };
}

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer();
  const [superAdminLogin, adminLogin] = await Promise.all([
    request(server).post('/api/v1/auth/login').send({ email: 'superadmin@haksan.local', password: 'superadmin12345' }),
    request(server).post('/api/v1/auth/login').send({ email: 'admin@haksan.local', password: 'admin12345' }),
  ]);
  superAdminToken = superAdminLogin.body.accessToken;
  adminToken = adminLogin.body.accessToken;
  const me = await request(server).get('/api/v1/auth/me').set('Authorization', `Bearer ${superAdminToken}`).expect(200);
  divisionId = me.body.user.divisions[0].id;
});

afterAll(async () => {
  const server = app?.getHttpServer();
  if (server && importedContactId) {
    await request(server).delete(`/api/v1/contacts/${importedContactId}`).set('Authorization', `Bearer ${superAdminToken}`);
  }
  if (server && importedCompanyId) {
    await request(server).delete(`/api/v1/companies/${importedCompanyId}`).set('Authorization', `Bearer ${superAdminToken}`);
  }
  await app?.close();
});

describe('firma/kontak Excel HTTP akışı', () => {
  it('süperadmin önizlemesi yapar, normal admini reddeder ve idempotent upsert uygular', async () => {
    const server = app.getHttpServer();
    const payload = await importPayload();

    const forbidden = await request(server)
      .post('/api/v1/companies/imports/company-contacts/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    expect(forbidden.status).toBe(403);

    const preview = await request(server)
      .post('/api/v1/companies/imports/company-contacts/preview')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send(payload);
    expect(preview.status, JSON.stringify(preview.body)).toBe(201);
    expect(preview.body.summary).toMatchObject({ companyCreates: 1, contactCreates: 1, errors: 0 });

    const firstCommit = await request(server)
      .post('/api/v1/companies/imports/company-contacts/commit')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ ...payload, confirmed: true });
    expect(firstCommit.status, JSON.stringify(firstCommit.body)).toBe(201);
    expect(firstCommit.body).toMatchObject({
      companies: { created: 1, updated: 0, skipped: 0 },
      contacts: { created: 1, updated: 0, skipped: 0 },
    });

    const companyList = await request(server)
      .get('/api/v1/companies')
      .query({ search: companyNo, pageSize: 10 })
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);
    const company = companyList.body.data.find((row: any) => row.externalCompanyNo === companyNo);
    expect(company).toMatchObject({
      externalCompanyNo: companyNo,
      primaryEmail: `teklif-${suffix}@example.test`,
      companyGroups: [expect.objectContaining({ name: 'Excel Akış Grubu' })],
    });
    importedCompanyId = company.id;

    const contactList = await request(server)
      .get('/api/v1/contacts')
      .query({ search: contactNo, pageSize: 10 })
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);
    const contact = contactList.body.data.find((row: any) => row.externalContactNo === contactNo);
    expect(contact).toMatchObject({
      externalContactNo: contactNo,
      company: { id: importedCompanyId, externalCompanyNo: companyNo },
    });
    importedContactId = contact.id;

    const secondCommit = await request(server)
      .post('/api/v1/companies/imports/company-contacts/commit')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ ...payload, confirmed: true });
    expect(secondCommit.status, JSON.stringify(secondCommit.body)).toBe(201);
    expect(secondCommit.body).toMatchObject({
      companies: { created: 0, updated: 1, skipped: 0 },
      contacts: { created: 0, updated: 1, skipped: 0 },
    });
  });
});
