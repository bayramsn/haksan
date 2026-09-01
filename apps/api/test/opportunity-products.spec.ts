/**
 * Fırsat takibi firma bazlıdır: tek kartta birden çok makine konuşulabilir.
 * `requested_machine` tek alanı listenin ilk satırıyla eşitlenir — hazırlık
 * kontrolleri, PDF ve raporlar hâlâ o alanı okuyor.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';

async function login(server: any, email: string, password: string) {
  const r = await supertest(server).post('/api/v1/auth/login').send({ email, password });
  return r.body.accessToken as string;
}

let app: NestFastifyApplication;
let token: string;
let companyId: string;
const runId = Date.now().toString(36);

beforeAll(async () => {
  app = await createTestApp();
  const server = app.getHttpServer();
  token = await login(server, 'superadmin@haksan.local', 'superadmin12345');
  const companies = await supertest(server).get('/api/v1/companies').set('Authorization', `Bearer ${token}`);
  companyId = companies.body.data[0].id;
});

afterAll(async () => {
  await app.close();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('Fırsattaki makine listesi', () => {
  it('birden çok makineyi sırasıyla saklar ve ilkini requestedMachine alanına yazar', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set(auth())
      .send({
        companyId,
        title: `Çoklu makine ${runId}`,
        currencyCode: 'USD',
        products: [
          { machineName: 'HAXAN MMT-1170', quantity: 2 },
          { machineName: 'HAXAN VMC-850' },
        ],
      })
      .expect(201);

    expect(created.body.requestedMachine).toBe('HAXAN MMT-1170');

    const detail = await supertest(server)
      .get(`/api/v1/opportunities/${created.body.id}`)
      .set(auth())
      .expect(200);
    expect(detail.body.products).toHaveLength(2);
    expect(detail.body.products[0]).toMatchObject({ machineName: 'HAXAN MMT-1170', quantity: 2, sortOrder: 0 });
    expect(detail.body.products[1]).toMatchObject({ machineName: 'HAXAN VMC-850', quantity: 1, sortOrder: 1 });
  });

  it('liste güncellemesi tümüyle değiştirir ve ilk satırı yeniden eşitler', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set(auth())
      .send({
        companyId,
        title: `Liste değişimi ${runId}`,
        currencyCode: 'USD',
        products: [{ machineName: 'Eski Makine' }],
      })
      .expect(201);

    await supertest(server)
      .patch(`/api/v1/opportunities/${created.body.id}`)
      .set(auth())
      .send({ products: [{ machineName: 'Yeni Makine A', quantity: 3 }, { machineName: 'Yeni Makine B' }] })
      .expect(200);

    const detail = await supertest(server)
      .get(`/api/v1/opportunities/${created.body.id}`)
      .set(auth())
      .expect(200);
    expect(detail.body.products.map((product: { machineName: string }) => product.machineName)).toEqual([
      'Yeni Makine A',
      'Yeni Makine B',
    ]);
    expect(detail.body.requestedMachine).toBe('Yeni Makine A');
  });

  it('boş liste gönderilince makineleri temizler', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set(auth())
      .send({ companyId, title: `Temizlenen liste ${runId}`, currencyCode: 'USD', products: [{ machineName: 'Silinecek' }] })
      .expect(201);

    await supertest(server)
      .patch(`/api/v1/opportunities/${created.body.id}`)
      .set(auth())
      .send({ products: [] })
      .expect(200);

    const detail = await supertest(server).get(`/api/v1/opportunities/${created.body.id}`).set(auth()).expect(200);
    expect(detail.body.products).toEqual([]);
    expect(detail.body.requestedMachine).toBeNull();
  });

  it('liste gönderilmeyen güncellemede makineler korunur', async () => {
    const server = app.getHttpServer();
    const created = await supertest(server)
      .post('/api/v1/opportunities')
      .set(auth())
      .send({ companyId, title: `Dokunulmayan liste ${runId}`, currencyCode: 'USD', products: [{ machineName: 'Kalıcı Makine' }] })
      .expect(201);

    await supertest(server)
      .patch(`/api/v1/opportunities/${created.body.id}`)
      .set(auth())
      .send({ probability: 70 })
      .expect(200);

    const detail = await supertest(server).get(`/api/v1/opportunities/${created.body.id}`).set(auth()).expect(200);
    expect(detail.body.products).toHaveLength(1);
    expect(detail.body.products[0].machineName).toBe('Kalıcı Makine');
  });

  it('adı boş makineyi reddeder', async () => {
    const server = app.getHttpServer();
    const response = await supertest(server)
      .post('/api/v1/opportunities')
      .set(auth())
      .send({ companyId, title: `Boş makine ${runId}`, currencyCode: 'USD', products: [{ machineName: '   ' }] });
    expect(response.status).toBe(422);
  });
});
