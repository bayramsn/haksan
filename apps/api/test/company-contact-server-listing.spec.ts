import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { eq, inArray } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { getDb, schema } from '../src/db/client';
import { createTestApp } from './setup';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const tag = Date.now().toString(36);
const companyName = `PAGINATION TIE ${tag}`;
const contactName = `PAGINATION CONTACT ${tag}`;
const allowedCity = `PARITY CITY ${tag}`;
const allowedSector = `PARITY SECTOR ${tag}`;
const allowedDepartment = `PARITY DEPT ${tag}`;
const deniedCity = `DENIED CITY ${tag}`;
const deniedSector = `DENIED SECTOR ${tag}`;
const deniedDepartment = `DENIED DEPT ${tag}`;
const crossTenantCompanyName = `CROSS TENANT COMPANY ${tag}`;
const crossTenantContactName = `CROSS TENANT CONTACT ${tag}`;
const tiedAt = new Date('2026-01-15T12:00:00.000Z');

type Summary = {
  total: number;
  byRelation: Record<string, number>;
  byStatus: Record<string, number>;
  cities: string[];
  sectors: string[];
};

type ContactSummary = {
  total: number;
  primary: number;
  blacklisted: number;
  firmCount: number;
  departments: string[];
};

const binaryParser = (response: NodeJS.ReadableStream, callback: (error: Error | null, body?: Buffer) => void) => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

async function worksheetRows(buffer: Buffer, sheetName: string): Promise<Array<Record<string, string>>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) throw new Error(`${sheetName} çalışma sayfası bulunamadı`);
  const headers = (worksheet.getRow(1).values as unknown[]).slice(1).map((value) => String(value ?? ''));
  const rows: Array<Record<string, string>> = [];
  for (let rowNo = 2; rowNo <= worksheet.rowCount; rowNo += 1) {
    const row = worksheet.getRow(rowNo);
    if (!row.hasValues) continue;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, row.getCell(index + 1).text])));
  }
  return rows;
}

describe('firma ve kontak server-side listeleme', () => {
  let app: NestFastifyApplication | undefined;
  let adminToken = '';
  let scopedToken = '';
  let noScopeToken = '';
  let tenantId = '';
  let allowedDivisionId = '';
  let deniedDivisionId = '';
  let baselineCompanies: Summary;
  let baselineContacts: ContactSummary;
  let otherTenantId: string | undefined;
  const testUserIds: string[] = [];
  const companyIds: string[] = [];
  const contactIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    const server = app.getHttpServer();
    const adminLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@haksan.local', password: 'admin12345' })
      .expect(201);
    adminToken = adminLogin.body.accessToken;

    const me = await request(server)
      .get('/api/v1/auth/me')
      .set(auth(adminToken))
      .expect(200);
    tenantId = me.body.user.tenantId;
    const divisions = await request(server)
      .get('/api/v1/divisions')
      .set(auth(adminToken))
      .expect(200);
    expect(divisions.body.length).toBeGreaterThanOrEqual(2);
    allowedDivisionId = divisions.body[0].id;
    deniedDivisionId = divisions.body[1].id;

    const scopedEmail = `page-scope-${tag}@haksan.local`;
    const noScopeEmail = `page-empty-${tag}@haksan.local`;
    const scopedUser = await request(server)
      .post('/api/v1/users')
      .set(auth(adminToken))
      .send({
        fullName: `Pagination Scoped ${tag}`,
        email: scopedEmail,
        username: `page-scope-${tag}`.slice(0, 32),
        password: 'pagination12345',
        roleCodes: ['sales'],
        divisionIds: [allowedDivisionId],
      })
      .expect(201);
    const noScopeUser = await request(server)
      .post('/api/v1/users')
      .set(auth(adminToken))
      .send({
        fullName: `Pagination Empty ${tag}`,
        email: noScopeEmail,
        username: `page-empty-${tag}`.slice(0, 32),
        password: 'pagination12345',
        roleCodes: ['sales'],
        divisionIds: [],
      })
      .expect(201);
    testUserIds.push(scopedUser.body.id, noScopeUser.body.id);

    const [scopedLogin, noScopeLogin] = await Promise.all([
      request(server).post('/api/v1/auth/login').send({ email: scopedEmail, password: 'pagination12345' }),
      request(server).post('/api/v1/auth/login').send({ email: noScopeEmail, password: 'pagination12345' }),
    ]);
    expect(scopedLogin.status).toBe(201);
    expect(noScopeLogin.status).toBe(201);
    scopedToken = scopedLogin.body.accessToken;
    noScopeToken = noScopeLogin.body.accessToken;

    const [companySummary, contactSummary] = await Promise.all([
      request(server).get('/api/v1/companies/summary').set(auth(scopedToken)),
      request(server).get('/api/v1/contacts/summary').set(auth(scopedToken)),
    ]);
    expect(companySummary.status).toBe(200);
    expect(contactSummary.status).toBe(200);
    baselineCompanies = companySummary.body;
    baselineContacts = contactSummary.body;

    const db = getDb();
    const relation = await db.query.companyRelationTypes.findFirst({
      where: eq(schema.companyRelationTypes.code, 'customer'),
    });
    const status = await db.query.companyStatuses.findFirst({
      where: eq(schema.companyStatuses.code, 'potential'),
    });
    if (!relation || !status) throw new Error('Firma lookup seed kayıtları bulunamadı');

    const allowedCompanies = await db
      .insert(schema.companies)
      .values(Array.from({ length: 14 }, (_, index) => ({
        tenantId,
        relationTypeId: relation.id,
        customerStatusId: status.id,
        externalCompanyNo: `PG-${tag}-${index}`,
        legalTitle: companyName,
        sector: allowedSector,
        supplierCategoryCode: 'logistics',
        createdAt: tiedAt,
        updatedAt: tiedAt,
      })))
      .returning({ id: schema.companies.id });
    companyIds.push(...allowedCompanies.map((company) => company.id));
    await db.insert(schema.companyDivisions).values(allowedCompanies.map((company) => ({
      tenantId,
      companyId: company.id,
      divisionId: allowedDivisionId,
    })));
    await db.insert(schema.companyAddresses).values(allowedCompanies.map((company) => ({
      tenantId,
      companyId: company.id,
      addressType: 'office',
      province: allowedCity,
      isDefault: true,
    })));

    const allowedContacts = await db
      .insert(schema.contacts)
      .values(allowedCompanies.map((company, index) => ({
        tenantId,
        companyId: company.id,
        externalContactNo: `PC-${tag}-${index}`,
        fullName: contactName,
        department: allowedDepartment,
        workEmail: `page-${tag}-${index}@example.test`,
        isPrimary: true,
        createdAt: tiedAt,
        updatedAt: tiedAt,
      })))
      .returning({ id: schema.contacts.id, companyId: schema.contacts.companyId });
    contactIds.push(...allowedContacts.map((contact) => contact.id));
    await db.insert(schema.contactCompanies).values(allowedContacts.map((contact) => ({
      tenantId,
      contactId: contact.id,
      companyId: contact.companyId,
      isPrimary: true,
    })));

    const [deniedCompany] = await db
      .insert(schema.companies)
      .values({
        tenantId,
        relationTypeId: relation.id,
        customerStatusId: status.id,
        externalCompanyNo: `DENIED-${tag}`,
        legalTitle: `DENIED DIVISION COMPANY ${tag}`,
        sector: deniedSector,
      })
      .returning({ id: schema.companies.id });
    companyIds.push(deniedCompany.id);
    await db.insert(schema.companyDivisions).values({
      tenantId,
      companyId: deniedCompany.id,
      divisionId: deniedDivisionId,
    });
    await db.insert(schema.companyAddresses).values({
      tenantId,
      companyId: deniedCompany.id,
      addressType: 'office',
      province: deniedCity,
      isDefault: true,
    });
    const [deniedContact] = await db
      .insert(schema.contacts)
      .values({
        tenantId,
        companyId: deniedCompany.id,
        externalContactNo: `DENIED-C-${tag}`,
        fullName: `DENIED DIVISION CONTACT ${tag}`,
        department: deniedDepartment,
        isPrimary: true,
      })
      .returning({ id: schema.contacts.id });
    contactIds.push(deniedContact.id);
    await db.insert(schema.contactCompanies).values({
      tenantId,
      contactId: deniedContact.id,
      companyId: deniedCompany.id,
      isPrimary: true,
    });

    const [otherTenant] = await db
      .insert(schema.tenants)
      .values({ name: `Cross Tenant ${tag}`, slug: `cross-tenant-${tag}` })
      .returning({ id: schema.tenants.id });
    otherTenantId = otherTenant.id;
    const [crossCompany] = await db
      .insert(schema.companies)
      .values({
        tenantId: otherTenant.id,
        relationTypeId: relation.id,
        customerStatusId: status.id,
        legalTitle: crossTenantCompanyName,
        sector: `CROSS SECTOR ${tag}`,
      })
      .returning({ id: schema.companies.id });
    const [crossContact] = await db
      .insert(schema.contacts)
      .values({
        tenantId: otherTenant.id,
        companyId: crossCompany.id,
        fullName: crossTenantContactName,
        department: `CROSS DEPT ${tag}`,
      })
      .returning({ id: schema.contacts.id });
    await db.insert(schema.contactCompanies).values({
      tenantId: otherTenant.id,
      contactId: crossContact.id,
      companyId: crossCompany.id,
      isPrimary: true,
    });
  });

  afterAll(async () => {
    const db = getDb();
    if (contactIds.length) {
      await db.delete(schema.contactCompanies).where(inArray(schema.contactCompanies.contactId, contactIds));
      await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
    }
    if (companyIds.length) {
      await db.delete(schema.companyAddresses).where(inArray(schema.companyAddresses.companyId, companyIds));
      await db.delete(schema.companyDivisions).where(inArray(schema.companyDivisions.companyId, companyIds));
      await db.delete(schema.companies).where(inArray(schema.companies.id, companyIds));
    }
    if (testUserIds.length) await db.delete(schema.users).where(inArray(schema.users.id, testUserIds));
    if (otherTenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
    if (app) await app.close();
  });

  it('14 eşit firma ve kontak sıralama değerini sayfalarda overlap olmadan id tie-break ile döndürür', async () => {
    const server = app!.getHttpServer();
    const companyQuery = { search: companyName, divisionId: allowedDivisionId, sortBy: 'name', sortDir: 'asc', pageSize: 12 };
    const [companyPage1, companyPage2] = await Promise.all([
      request(server).get('/api/v1/companies').query({ ...companyQuery, page: 1 }).set(auth(scopedToken)),
      request(server).get('/api/v1/companies').query({ ...companyQuery, page: 2 }).set(auth(scopedToken)),
    ]);
    expect(companyPage1.status).toBe(200);
    expect(companyPage2.status).toBe(200);
    expect(companyPage1.body.meta.total).toBe(14);
    expect(companyPage1.body.data).toHaveLength(12);
    expect(companyPage2.body.data).toHaveLength(2);
    const companyPage1Ids = companyPage1.body.data.map((row: { id: string }) => row.id);
    const companyPage2Ids = companyPage2.body.data.map((row: { id: string }) => row.id);
    expect(companyPage1Ids.filter((id: string) => companyPage2Ids.includes(id))).toEqual([]);
    expect([...companyPage1Ids, ...companyPage2Ids]).toEqual([...companyIds.slice(0, 14)].sort());

    const contactQuery = { search: contactName, divisionId: allowedDivisionId, sortBy: 'name', sortDir: 'asc', pageSize: 12 };
    const [contactPage1, contactPage2] = await Promise.all([
      request(server).get('/api/v1/contacts').query({ ...contactQuery, page: 1 }).set(auth(scopedToken)),
      request(server).get('/api/v1/contacts').query({ ...contactQuery, page: 2 }).set(auth(scopedToken)),
    ]);
    expect(contactPage1.status).toBe(200);
    expect(contactPage2.status).toBe(200);
    expect(contactPage1.body.meta.total).toBe(14);
    expect(contactPage1.body.data).toHaveLength(12);
    expect(contactPage2.body.data).toHaveLength(2);
    const contactPage1Ids = contactPage1.body.data.map((row: { id: string }) => row.id);
    const contactPage2Ids = contactPage2.body.data.map((row: { id: string }) => row.id);
    expect(contactPage1Ids.filter((id: string) => contactPage2Ids.includes(id))).toEqual([]);
    expect([...contactPage1Ids, ...contactPage2Ids]).toEqual([...contactIds.slice(0, 14)].sort());
  });

  it('summary yalnız tenant + izinli portfolio kapsamını toplar', async () => {
    const server = app!.getHttpServer();
    const [companySummary, contactSummary] = await Promise.all([
      request(server).get('/api/v1/companies/summary').set(auth(scopedToken)),
      request(server).get('/api/v1/contacts/summary').set(auth(scopedToken)),
    ]);
    expect(companySummary.status).toBe(200);
    expect(contactSummary.status).toBe(200);
    expect(companySummary.body.total).toBe(baselineCompanies.total + 14);
    expect(companySummary.body.byRelation.customer).toBe(baselineCompanies.byRelation.customer + 14);
    expect(companySummary.body.byStatus.potential).toBe(baselineCompanies.byStatus.potential + 14);
    expect(companySummary.body.cities).toContain(allowedCity);
    expect(companySummary.body.cities).not.toContain(deniedCity);
    expect(companySummary.body.sectors).toContain(allowedSector);
    expect(companySummary.body.sectors).not.toContain(deniedSector);

    expect(contactSummary.body.total).toBe(baselineContacts.total + 14);
    expect(contactSummary.body.primary).toBe(baselineContacts.primary + 14);
    expect(contactSummary.body.firmCount).toBe(baselineContacts.firmCount + 14);
    expect(contactSummary.body.departments).toContain(allowedDepartment);
    expect(contactSummary.body.departments).not.toContain(deniedDepartment);
  });

  it('gerçek fakat yetkisiz divisionId için mevcut sözleşme gereği güvenli scope\'a düşer', async () => {
    const server = app!.getHttpServer();
    const [companies, companiesRequested, companySummary, companySummaryRequested] = await Promise.all([
      request(server).get('/api/v1/companies').query({ search: companyName, pageSize: 200 }).set(auth(scopedToken)),
      request(server).get('/api/v1/companies').query({ search: companyName, divisionId: deniedDivisionId, pageSize: 200 }).set(auth(scopedToken)),
      request(server).get('/api/v1/companies/summary').set(auth(scopedToken)),
      request(server).get('/api/v1/companies/summary').query({ divisionId: deniedDivisionId }).set(auth(scopedToken)),
    ]);
    expect(companiesRequested.status).toBe(200);
    expect(companiesRequested.body).toEqual(companies.body);
    expect(companySummaryRequested.status).toBe(200);
    expect(companySummaryRequested.body).toEqual(companySummary.body);

    const [contacts, contactsRequested, contactSummary, contactSummaryRequested] = await Promise.all([
      request(server).get('/api/v1/contacts').query({ search: contactName, pageSize: 200 }).set(auth(scopedToken)),
      request(server).get('/api/v1/contacts').query({ search: contactName, divisionId: deniedDivisionId, pageSize: 200 }).set(auth(scopedToken)),
      request(server).get('/api/v1/contacts/summary').set(auth(scopedToken)),
      request(server).get('/api/v1/contacts/summary').query({ divisionId: deniedDivisionId }).set(auth(scopedToken)),
    ]);
    expect(contactsRequested.status).toBe(200);
    expect(contactsRequested.body).toEqual(contacts.body);
    expect(contactSummaryRequested.status).toBe(200);
    expect(contactSummaryRequested.body).toEqual(contactSummary.body);
  });

  it('farklı tenant kayıtlarını liste, arama ve export yolunda sızdırmaz', async () => {
    const server = app!.getHttpServer();
    const [companies, contacts, companyExport, contactExport] = await Promise.all([
      request(server).get('/api/v1/companies').query({ search: crossTenantCompanyName }).set(auth(scopedToken)),
      request(server).get('/api/v1/contacts').query({ search: crossTenantContactName }).set(auth(scopedToken)),
      request(server).get('/api/v1/exports/companies').query({ search: crossTenantCompanyName }).set(auth(scopedToken)).buffer(true).parse(binaryParser),
      request(server).get('/api/v1/exports/contacts').query({ search: crossTenantContactName }).set(auth(scopedToken)).buffer(true).parse(binaryParser),
    ]);
    expect(companies.status).toBe(200);
    expect(companies.body.meta.total).toBe(0);
    expect(contacts.status).toBe(200);
    expect(contacts.body.meta.total).toBe(0);
    expect(companyExport.status).toBe(200);
    expect(contactExport.status).toBe(200);
    expect(await worksheetRows(companyExport.body, 'Firmalar')).toEqual([]);
    expect(await worksheetRows(contactExport.body, 'Kontaklar')).toEqual([]);
  });

  it('kapsamsız kullanıcı için liste, summary ve export fail-closed davranır', async () => {
    const server = app!.getHttpServer();
    const [companies, contacts, companySummary, contactSummary, companyExport, contactExport] = await Promise.all([
      request(server).get('/api/v1/companies?pageSize=200').set(auth(noScopeToken)),
      request(server).get('/api/v1/contacts?pageSize=200').set(auth(noScopeToken)),
      request(server).get('/api/v1/companies/summary').set(auth(noScopeToken)),
      request(server).get('/api/v1/contacts/summary').set(auth(noScopeToken)),
      request(server).get('/api/v1/exports/companies').set(auth(noScopeToken)).buffer(true).parse(binaryParser),
      request(server).get('/api/v1/exports/contacts').set(auth(noScopeToken)).buffer(true).parse(binaryParser),
    ]);
    for (const response of [companies, contacts, companySummary, contactSummary, companyExport, contactExport]) {
      expect(response.status).toBe(200);
    }
    expect(companies.body.meta.total).toBe(0);
    expect(contacts.body.meta.total).toBe(0);
    expect(companySummary.body.total).toBe(0);
    expect(companySummary.body.cities).toEqual([]);
    expect(contactSummary.body.total).toBe(0);
    expect(contactSummary.body.firmCount).toBe(0);
    expect(contactSummary.body.departments).toEqual([]);
    expect(await worksheetRows(companyExport.body, 'Firmalar')).toEqual([]);
    expect(await worksheetRows(contactExport.body, 'Kontaklar')).toEqual([]);
  });

  it('firma ve kontak Excel export filtrelerini listeyle birebir uygular', async () => {
    const server = app!.getHttpServer();
    const companyFilters = {
      search: companyName,
      relationTypeCode: 'customer',
      customerStatusCode: 'potential',
      divisionId: allowedDivisionId,
      city: allowedCity,
      sector: allowedSector,
      supplierCategoryCode: 'logistics',
      pageSize: 200,
    };
    const [companyList, companyExport] = await Promise.all([
      request(server).get('/api/v1/companies').query(companyFilters).set(auth(scopedToken)),
      request(server).get('/api/v1/exports/companies').query(companyFilters).set(auth(scopedToken)).buffer(true).parse(binaryParser),
    ]);
    expect(companyList.status).toBe(200);
    expect(companyList.body.meta.total).toBe(14);
    expect(companyExport.status).toBe(200);
    const companyRows = await worksheetRows(companyExport.body, 'Firmalar');
    expect(companyRows).toHaveLength(14);
    expect(new Set(companyRows.map((row) => row.Firma))).toEqual(new Set([companyName]));
    expect(new Set(companyRows.map((row) => row.Şehir))).toEqual(new Set([allowedCity]));
    expect(new Set(companyRows.map((row) => row.Sektör))).toEqual(new Set([allowedSector]));
    expect(new Set(companyRows.map((row) => row['Tedarikçi Türü']))).toEqual(new Set(['Lojistik']));

    const contactFilters = {
      search: contactName,
      divisionId: allowedDivisionId,
      department: allowedDepartment,
      isPrimary: true,
      pageSize: 200,
    };
    const [contactList, contactExport] = await Promise.all([
      request(server).get('/api/v1/contacts').query(contactFilters).set(auth(scopedToken)),
      request(server).get('/api/v1/exports/contacts').query(contactFilters).set(auth(scopedToken)).buffer(true).parse(binaryParser),
    ]);
    expect(contactList.status).toBe(200);
    expect(contactList.body.meta.total).toBe(14);
    expect(contactExport.status).toBe(200);
    const contactRows = await worksheetRows(contactExport.body, 'Kontaklar');
    expect(contactRows).toHaveLength(14);
    expect(new Set(contactRows.map((row) => row['Ad Soyad']))).toEqual(new Set([contactName]));
    expect(new Set(contactRows.map((row) => row.Departman))).toEqual(new Set([allowedDepartment]));
    expect(new Set(contactRows.map((row) => row.Birincil))).toEqual(new Set(['Evet']));

    const companyId = companyIds[0];
    const [companyContacts, companyContactExport] = await Promise.all([
      request(server).get('/api/v1/contacts').query({ companyId, pageSize: 200 }).set(auth(scopedToken)),
      request(server).get('/api/v1/exports/contacts').query({ companyId }).set(auth(scopedToken)).buffer(true).parse(binaryParser),
    ]);
    expect(companyContacts.status).toBe(200);
    expect(companyContacts.body.meta.total).toBe(1);
    expect(await worksheetRows(companyContactExport.body, 'Kontaklar')).toHaveLength(1);
  });

  it('export query allowlist dışı değerleri 422 ile reddeder', async () => {
    const server = app!.getHttpServer();
    await request(server)
      .get('/api/v1/exports/companies?supplierCategoryCode=carrier')
      .set(auth(scopedToken))
      .expect(422);
    await request(server)
      .get('/api/v1/exports/contacts?isPrimary=yes')
      .set(auth(scopedToken))
      .expect(422);
    await request(server)
      .get('/api/v1/exports/contacts?divisionId=not-a-uuid')
      .set(auth(scopedToken))
      .expect(422);
  });

  it('yetkisiz divisionId export sorgusunda da güvenli mevcut scope\'u korur', async () => {
    const server = app!.getHttpServer();
    const [companyExport, contactExport] = await Promise.all([
      request(server).get('/api/v1/exports/companies').query({ search: companyName, divisionId: deniedDivisionId }).set(auth(scopedToken)).buffer(true).parse(binaryParser),
      request(server).get('/api/v1/exports/contacts').query({ search: contactName, divisionId: deniedDivisionId }).set(auth(scopedToken)).buffer(true).parse(binaryParser),
    ]);
    expect(companyExport.status).toBe(200);
    expect(contactExport.status).toBe(200);
    expect(await worksheetRows(companyExport.body, 'Firmalar')).toHaveLength(14);
    expect(await worksheetRows(contactExport.body, 'Kontaklar')).toHaveLength(14);
  });
});
