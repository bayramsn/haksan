import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

describe('Company profile', () => {
  let app: NestFastifyApplication;
  let token: string;
  let divisionId: string;
  let companyId: string | undefined;
  let directCompetitorCompanyId: string | undefined;
  let contactId: string | undefined;

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
    if (contactId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/contacts/${contactId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    if (companyId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${companyId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    if (directCompetitorCompanyId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/companies/${directCompetitorCompanyId}`)
        .set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  it('persists tenant-wide hidden navigation pages and exposes them through /auth/me', async () => {
    const updated = await request(app.getHttpServer())
      .patch('/api/v1/tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ hiddenNavigationKeys: ['calendar', 'offers'] })
      .expect(200);
    expect(updated.body.hiddenNavigationKeys).toEqual(['calendar', 'offers']);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.tenant.hiddenNavigationKeys).toEqual(['calendar', 'offers']);

    await request(app.getHttpServer())
      .patch('/api/v1/tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ hiddenNavigationKeys: [] })
      .expect(200);
  });

  it('persists company details, uppercases its name and allows the competitor type', async () => {
    const groupsResponse = await request(app.getHttpServer())
      .get('/api/v1/lookups/company-groups')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const groupCodes = groupsResponse.body
      .slice(0, 2)
      .map((group: { code: string }) => group.code);
    expect(groupCodes).toHaveLength(2);

    const uniqueTitle = `ışık profil test ${Date.now()}`;
    const normalizedTitle = uniqueTitle.toLocaleUpperCase('tr-TR');
    const created = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalTitle: uniqueTitle,
        relationTypeCode: 'supplier',
        customerStatusCode: 'active',
        divisionId,
        companyGroupCodes: groupCodes,
        addresses: [
          {
            addressType: 'office',
            country: 'Türkiye',
            province: 'İstanbul',
            district: 'Ataşehir',
            fullAddress: 'Örnek Ofis Adresi No: 1',
            isDefault: true,
            isShipping: true,
            isBilling: false,
          },
          {
            addressType: 'factory',
            country: 'Türkiye',
            province: 'Kocaeli',
            district: 'Gebze',
            fullAddress: 'Örnek Fabrika Adresi No: 2',
            isDefault: false,
            isShipping: false,
            isBilling: true,
          },
        ],
      })
      .expect(201);

    companyId = created.body.id;

    const findCompany = async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/companies')
        .query({ search: normalizedTitle, divisionId, pageSize: 20 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      return response.body.data.find((company: { id: string }) => company.id === companyId);
    };

    const firstVersion = await findCompany();
    expect(firstVersion.legalTitle).toBe(normalizedTitle);
    expect(firstVersion.relationType.code).toBe('supplier');
    expect(firstVersion.customerStatus.code).toBe('active');
    expect(firstVersion.companyGroups.map((group: { code: string }) => group.code).sort()).toEqual(
      [...groupCodes].sort(),
    );
    expect(firstVersion.addresses).toHaveLength(2);
    expect(firstVersion.addresses.find((address: { isShipping: boolean }) => address.isShipping).district).toBe('Ataşehir');
    expect(firstVersion.addresses.find((address: { isBilling: boolean }) => address.isBilling).district).toBe('Gebze');

    await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        relationTypeCode: 'competitor',
        customerStatusCode: 'potential',
        companyGroupCodes: [groupCodes[0]],
        addresses: firstVersion.addresses.map(
          (address: {
            id: string;
            addressType: string;
            country: string;
            province: string;
            district: string;
            fullAddress: string;
            isDefault: boolean;
            isShipping: boolean;
            isBilling: boolean;
          }) => ({
            id: address.id,
            addressType: address.addressType,
            country: address.country || 'Türkiye',
            province: address.province || undefined,
            district: address.district || undefined,
            fullAddress: address.district === 'Gebze' ? 'Güncellenmiş Fabrika Adresi No: 3' : address.fullAddress,
            isDefault: address.district === 'Gebze',
            isShipping: address.district === 'Gebze',
            isBilling: address.district === 'Ataşehir',
          }),
        ),
      })
      .expect(200);

    const updatedVersion = await findCompany();
    expect(updatedVersion.relationType.code).toBe('competitor');
    expect(updatedVersion.customerStatus.code).toBe('potential');
    expect(updatedVersion.companyGroups.map((group: { code: string }) => group.code)).toEqual([
      groupCodes[0],
    ]);
    expect(updatedVersion.addresses).toHaveLength(2);
    expect(updatedVersion.addresses.find((address: { isDefault: boolean }) => address.isDefault).fullAddress)
      .toBe('Güncellenmiş Fabrika Adresi No: 3');
    expect(updatedVersion.addresses.find((address: { isShipping: boolean }) => address.isShipping).district).toBe('Gebze');
    expect(updatedVersion.addresses.find((address: { isBilling: boolean }) => address.isBilling).district).toBe('Ataşehir');
    expect(
      updatedVersion.addresses.every(
        (address: { latitude: number | null; longitude: number | null }) => address.latitude === null && address.longitude === null
      )
    ).toBe(true);

    const competitors = await request(app.getHttpServer())
      .get('/api/v1/competitors')
      .query({ search: normalizedTitle, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(competitors.body.data).toContainEqual(
      expect.objectContaining({ companyId, name: normalizedTitle }),
    );
  });

  it('adds a newly created competitor company to the LOST competitor catalog', async () => {
    const uniqueTitle = `doğrudan rakip test ${Date.now()}`;
    const normalizedTitle = uniqueTitle.toLocaleUpperCase('tr-TR');
    const created = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalTitle: uniqueTitle,
        relationTypeCode: 'competitor',
        customerStatusCode: 'potential',
        divisionId,
        website: 'https://rakip.example',
      })
      .expect(201);
    directCompetitorCompanyId = created.body.id;

    const catalog = await request(app.getHttpServer())
      .get('/api/v1/competitors')
      .query({ search: normalizedTitle, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const syncedCompetitor = catalog.body.data.find(
      (competitor: { companyId?: string }) => competitor.companyId === directCompetitorCompanyId,
    );
    expect(syncedCompetitor).toMatchObject({
      companyId: directCompetitorCompanyId,
      name: normalizedTitle,
      website: 'https://rakip.example',
    });

    const opportunityCompanyList = await request(app.getHttpServer())
      .get('/api/v1/companies')
      .query({ relationTypeCode: 'customer', divisionId, pageSize: 1 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const opportunityCompanyId = opportunityCompanyList.body.data[0]?.id;
    expect(opportunityCompanyId).toBeTruthy();

    const opportunity = await request(app.getHttpServer())
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyId: opportunityCompanyId,
        title: `Rakip senkron LOST testi ${Date.now()}`,
        currencyCode: 'USD',
      })
      .expect(201);

    const lost = await request(app.getHttpServer())
      .patch(`/api/v1/opportunities/${opportunity.body.id}/qualification-stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        toStage: 'lost',
        cancellationReasonCode: 'competitor',
        lostCompetitorId: syncedCompetitor.id,
        lostProductName: 'Test CNC tezgâhı',
        lostUnmetConditions: 'Rakip teslim süresi tercih edildi',
      })
      .expect(200);
    expect(lost.body.lostCompetitor).toMatchObject({ id: syncedCompetitor.id, name: normalizedTitle });
    expect(lost.body.lostCompetitorName).toBe(normalizedTitle);
  });

  it('updates and clears every optional contact detail', async () => {
    if (!companyId) throw new Error('Kontak testi için firma oluşturulamadı');

    const created = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyId,
        fullName: 'ışık ipek şen',
        title: 'Satın Alma Uzmanı',
        department: 'Satın Alma',
        decisionRoleCode: 'owner',
        workPhone: '+90 212 555 10 10',
        phoneExtension: '112',
        mobilePhone: '+90 532 555 20 20',
        otherPhone: '+90 216 555 30 30',
        workEmail: 'is@example.com',
        personalEmail: 'kisisel@example.com',
        otherEmail: 'diger@example.com',
        gender: 'Kadın',
        birthDate: '1990-05-12',
        hometown: 'Bursa',
        favoriteTeam: 'Bursaspor',
        favoriteColor: 'Yeşil',
        graduatedSchool: 'Uludağ Üniversitesi',
        notes: 'İlk kontak notu',
        isPrimary: true,
        isBlacklisted: false,
      })
      .expect(201);

    contactId = created.body.id;
    expect(created.body.fullName).toBe('IŞIK İPEK ŞEN');

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyId,
        fullName: "şule ışık o'connor",
        title: 'Satın Alma Müdürü',
        department: 'Tedarik Zinciri',
        decisionRoleCode: 'influencer',
        workPhone: '+90 212 555 11 11',
        phoneExtension: '214',
        mobilePhone: '+90 532 555 22 22',
        otherPhone: '+90 216 555 33 33',
        workEmail: 'guncel.is@example.com',
        personalEmail: 'guncel.kisisel@example.com',
        otherEmail: 'guncel.diger@example.com',
        gender: 'Diğer',
        birthDate: '1992-08-20',
        hometown: 'İzmir',
        favoriteTeam: 'Göztepe',
        favoriteColor: 'Kırmızı',
        graduatedSchool: 'Ege Üniversitesi',
        notes: 'Güncellenmiş kontak notu',
        isPrimary: false,
        isBlacklisted: true,
        blacklistReason: 'Test sebebi',
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      companyId,
      fullName: "ŞULE IŞIK O'CONNOR",
      title: 'Satın Alma Müdürü',
      department: 'Tedarik Zinciri',
      workPhone: '+90 212 555 11 11',
      phoneExtension: '214',
      mobilePhone: '+90 532 555 22 22',
      otherPhone: '+90 216 555 33 33',
      workEmail: 'guncel.is@example.com',
      personalEmail: 'guncel.kisisel@example.com',
      otherEmail: 'guncel.diger@example.com',
      gender: 'Diğer',
      hometown: 'İzmir',
      favoriteTeam: 'Göztepe',
      favoriteColor: 'Kırmızı',
      graduatedSchool: 'Ege Üniversitesi',
      notes: 'Güncellenmiş kontak notu',
      isPrimary: false,
      isBlacklisted: true,
      blacklistReason: 'Test sebebi',
    });
    expect(updated.body.decisionRoleId).toBeTruthy();
    expect(String(updated.body.birthDate)).toContain('1992-08-20');

    const cleared = await request(app.getHttpServer())
      .patch(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '',
        department: '',
        decisionRoleCode: '',
        workPhone: '',
        phoneExtension: '',
        mobilePhone: '',
        otherPhone: '',
        workEmail: '',
        personalEmail: '',
        otherEmail: '',
        gender: '',
        birthDate: '',
        hometown: '',
        favoriteTeam: '',
        favoriteColor: '',
        graduatedSchool: '',
        notes: '',
        isBlacklisted: false,
        blacklistReason: '',
      })
      .expect(200);

    expect(cleared.body).toMatchObject({
      title: null,
      department: null,
      decisionRoleId: null,
      workPhone: null,
      phoneExtension: null,
      mobilePhone: null,
      otherPhone: null,
      workEmail: null,
      personalEmail: null,
      otherEmail: null,
      gender: null,
      birthDate: null,
      hometown: null,
      favoriteTeam: null,
      favoriteColor: null,
      graduatedSchool: null,
      notes: null,
      isBlacklisted: false,
      blacklistReason: null,
    });
  });
});
