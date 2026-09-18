/**
 * Manuel hedeflerin gerçekleşmesi ve şablon ölçüm eşlemesi.
 *
 * Düzeltmeden önce:
 *  - Manuel hedeflere (cari mutabakat, vade takibi, tedarikçi görüşmesi…)
 *    gerçekleşme girilemiyordu; hiçbir zaman tamamlanmış/riskte olamıyorlardı.
 *  - "Satış hedefi" TESLİMAT yerine satış siparişi sayısıyla ölçülüyordu.
 *  - Dijital pazarlama paylaşımları lead sayacına bağlıydı: paylaşım yapılmadan
 *    lead açıldığında hedef ilerliyordu.
 *  - Hedefleri temizleyip kaydetmek satırı bırakıyordu; atama geri alınamıyordu.
 *
 * Geçmiş bir dönem kullanılır (`2019-01`): diğer test dosyalarının okuduğu
 * güncel dönem hedefleri etkilenmesin.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb } from '../src/db/client';
import { userTargets, users } from '../src/db/schema';

const PERIOD = '2019-01';

const item = (patch: Record<string, unknown>) => ({
  targetType: 'sales',
  category: 'SATIŞ',
  activity: 'SATIŞ HEDEFİ',
  description: '',
  unit: 'count',
  target: '',
  manualActual: '',
  ...patch,
});

describe('manual target actuals', () => {
  let app: NestFastifyApplication;
  let token = '';
  let salesId = '';

  const saveTarget = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/users/${salesId}/targets`)
      .set('Authorization', `Bearer ${token}`)
      .send({ period: PERIOD, ...body })
      .expect(201);

  const progress = async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/reports/target-progress?period=${PERIOD}&scope=user&id=${salesId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body.subjects[0];
  };

  const byActivity = (subject: any, activity: string) =>
    subject.targetItems.find((row: any) => row.activity === activity);

  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      date: `${PERIOD}-31`,
      rates: { EUR: 0.5, TRY: 20 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    app = await createTestApp();
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'superadmin@haksan.local', password: 'superadmin12345' })
      .expect(201);
    token = login.body.accessToken;

    const sales = await getDb().query.users.findFirst({ where: eq(users.email, 'sales@haksan.local') });
    if (!sales) throw new Error('Satış kullanıcısı bulunamadı');
    salesId = sales.id;
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(userTargets).where(and(eq(userTargets.userId, salesId), eq(userTargets.period, PERIOD)));
    await app?.close();
    vi.unstubAllGlobals();
  });

  it('manuel hedefin elle girilen gerçekleşmesini yüzdeye çevirir', async () => {
    await saveTarget({
      targetItems: [
        item({ targetType: 'finance', category: 'FİNANS', activity: 'CARİ MUTABAKAT', trackingMode: 'manual', target: '10', manualActual: '4' }),
      ],
    });
    const row = byActivity(await progress(), 'CARİ MUTABAKAT');
    expect(row).toMatchObject({ trackingMode: 'manual', actual: 4, pct: 40 });
  });

  it('gerçekleşme girilmemiş manuel hedefi kanıt bekliyor olarak bırakır', async () => {
    await saveTarget({
      targetItems: [
        item({ targetType: 'finance', category: 'FİNANS', activity: 'VADE TAKİBİ', trackingMode: 'manual', target: '30' }),
      ],
    });
    const row = byActivity(await progress(), 'VADE TAKİBİ');
    expect(row.trackingMode).toBe('manual');
    expect(row.actual).toBeNull();
    expect(row.pct).toBeNull();
  });

  it('satış hedefini teslim edilen tezgah sayacına bağlar', async () => {
    await saveTarget({ targetItems: [item({ target: '3' })] });
    const row = byActivity(await progress(), 'SATIŞ HEDEFİ');
    expect(row.metricKey).toBe('machineDeliveredCount');
    expect(row.trackingMode).toBe('automatic');
  });

  it('dijital pazarlama kalemini lead sayacına bağlamaz', async () => {
    await saveTarget({
      targetItems: [
        // Eski kayıtlardaki yanlış metricKey bilerek gönderilir: okuma tarafı elemeli.
        item({ category: 'DİJİTAL PAZARLAMA', activity: 'LINKEDIN PAYLAŞIMI', metricKey: 'digitalLeadTarget', target: '10' }),
      ],
    });
    const row = byActivity(await progress(), 'LINKEDIN PAYLAŞIMI');
    expect(row.metricKey).toBeNull();
    expect(row.trackingMode).toBe('manual');
    expect(row.actual).toBeNull();
  });

  it('tamamen boş gövde hedef atamasını siler', async () => {
    await saveTarget({ targetItems: [item({ target: '3' })] });
    expect((await progress()).hasTarget).toBe(true);

    await saveTarget({ targetItems: [item({ target: '' })] });
    const cleared = await progress();
    expect(cleared.hasTarget).toBe(false);
    expect(cleared.targetItems).toHaveLength(0);
  });
});
