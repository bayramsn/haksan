/**
 * Fırsat süreç listesi adres alanlarını ayrı ayrı gönderiyor. Sunucu tek adres
 * güncellemesinde satırın tüm kolonlarını yazdığı için kısmi gönderim diğer
 * alanları siliyordu. Bu test hem hatayı hem beklenen davranışı sabitler.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

describe('Company partial address update', () => {
  let app: NestFastifyApplication;
  let token: string;
  let divisionId: string;
  let companyId = '';

  const readAddress = async () => {
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const address = (detail.body.addresses ?? [])[0] ?? detail.body.primaryAddress;
    return { province: address?.province ?? null, district: address?.district ?? null, fullAddress: address?.fullAddress ?? null };
  };

  beforeAll(async () => {
    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' })
      .expect(201);
    token = login.body.accessToken;
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    divisionId = me.body.user.divisions[0].id;

    const created = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyType: 'company',
        legalTitle: `Adres Testi ${Date.now()}`,
        relationTypeCode: 'customer',
        customerStatusCode: 'potential',
        divisionIds: [divisionId],
        address: { province: 'Bursa', district: 'Nilüfer', fullAddress: 'OSB 10. Cad. No:4' },
      })
      .expect(201);
    companyId = created.body.id;
  });

  afterAll(async () => {
    if (companyId) {
      await request(app.getHttpServer()).delete(`/api/v1/companies/${companyId}`).set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  it('yalnız açık adres gönderilince il ve ilçe korunur', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ address: { fullAddress: 'Yeni Mah. 5. Sok.' } })
      .expect(200);
    expect(await readAddress()).toEqual({
      province: 'Bursa',
      district: 'Nilüfer',
      fullAddress: 'Yeni Mah. 5. Sok.',
    });
  });

  it('yalnız il/ilçe gönderilince açık adres korunur', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ address: { province: 'İstanbul', district: 'Beylikdüzü' } })
      .expect(200);
    expect(await readAddress()).toEqual({
      province: 'İstanbul',
      district: 'Beylikdüzü',
      fullAddress: 'Yeni Mah. 5. Sok.',
    });
  });

  it('alanların tamamı gönderilince hepsi korunur', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ address: { province: 'Bursa', district: 'Nilüfer', fullAddress: 'OSB 10. Cad. No:4' } })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ address: { province: 'İstanbul', district: 'Beylikdüzü', fullAddress: 'OSB 10. Cad. No:4' } })
      .expect(200);
    const after = await readAddress();
    expect(after).toEqual({ province: 'İstanbul', district: 'Beylikdüzü', fullAddress: 'OSB 10. Cad. No:4' });
  });
});
