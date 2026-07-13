import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

describe('Company profile', () => {
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

  it('persists multiple groups and addresses while supplier status remains editable', async () => {
    const groupsResponse = await request(app.getHttpServer())
      .get('/api/v1/lookups/company-groups')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const groupCodes = groupsResponse.body
      .slice(0, 2)
      .map((group: { code: string }) => group.code);
    expect(groupCodes).toHaveLength(2);

    const uniqueTitle = `Profil Test ${Date.now()}`;
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
          },
          {
            addressType: 'factory',
            country: 'Türkiye',
            province: 'Kocaeli',
            district: 'Gebze',
            fullAddress: 'Örnek Fabrika Adresi No: 2',
            isDefault: false,
          },
        ],
      })
      .expect(201);

    companyId = created.body.id;

    const findCompany = async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/companies')
        .query({ search: uniqueTitle, divisionId, pageSize: 20 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      return response.body.data.find((company: { id: string }) => company.id === companyId);
    };

    const firstVersion = await findCompany();
    expect(firstVersion.relationType.code).toBe('supplier');
    expect(firstVersion.customerStatus.code).toBe('active');
    expect(firstVersion.companyGroups.map((group: { code: string }) => group.code).sort()).toEqual(
      [...groupCodes].sort(),
    );
    expect(firstVersion.addresses).toHaveLength(2);

    await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
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
          }) => ({
            id: address.id,
            addressType: address.addressType,
            country: address.country || 'Türkiye',
            province: address.province || undefined,
            district: address.district || undefined,
            fullAddress: address.isDefault ? 'Güncellenmiş Ofis Adresi No: 3' : address.fullAddress,
            isDefault: address.isDefault,
          }),
        ),
      })
      .expect(200);

    const updatedVersion = await findCompany();
    expect(updatedVersion.customerStatus.code).toBe('potential');
    expect(updatedVersion.companyGroups.map((group: { code: string }) => group.code)).toEqual([
      groupCodes[0],
    ]);
    expect(updatedVersion.addresses).toHaveLength(2);
    expect(updatedVersion.addresses.find((address: { isDefault: boolean }) => address.isDefault).fullAddress)
      .toBe('Güncellenmiş Ofis Adresi No: 3');
    expect(
      updatedVersion.addresses.every(
        (address: { latitude: number | null; longitude: number | null }) => address.latitude === null && address.longitude === null
      )
    ).toBe(true);
  });
});
