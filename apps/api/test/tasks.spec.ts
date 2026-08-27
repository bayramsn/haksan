import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { TaskRemindersService } from '../src/modules/tasks/task-reminders.service';

/**
 * Ana senaryo: yönetici bir müşteriye görev açar → satış personeline atar →
 * personel "Bana Atananlar"da görür → tamamlar → hareket geçmişine işlenir.
 */
describe('Tasks module', () => {
  let app: NestFastifyApplication;
  let salesToken: string;
  let superToken: string;
  let salesUserId: string;
  let companyId: string;
  let assignedTaskId: string;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const request = () => supertest(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    const [salesLogin, superLogin] = await Promise.all([
      request().post('/api/v1/auth/login').send({ email: 'sales@haksan.local', password: 'sales12345' }),
      request().post('/api/v1/auth/login').send({ email: 'superadmin@haksan.local', password: 'superadmin12345' }),
    ]);
    salesToken = salesLogin.body.accessToken;
    superToken = superLogin.body.accessToken;
    salesUserId = salesLogin.body.user.id;

    // Test kendi firmasını üretir: seed verisine dayanan bir arama taze CI
    // veritabanında `data[0]` undefined dönüp tüm süiti düşürüyordu.
    const me = await request().get('/api/v1/auth/me').set('Authorization', `Bearer ${salesToken}`).expect(200);
    const divisionId = me.body.user.divisions[0]?.id;
    const company = await request()
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        companyType: 'company',
        legalTitle: `Görev Testi Makina ${runId}`,
        relationTypeCode: 'customer',
        customerStatusCode: 'potential',
        divisionIds: divisionId ? [divisionId] : undefined,
      })
      .expect(201);
    companyId = company.body.id;
  });

  afterAll(async () => app?.close());

  it('assigns a task to a sales user with the related company', async () => {
    const dueAt = new Date(Date.now() + 2 * 3_600_000);
    const response = await request()
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        title: `Teklif için geri dönüş yap ${runId}`,
        description: 'Müşteri fiyat listesini bekliyor.',
        priority: 'high',
        assignedToUserId: salesUserId,
        companyId,
        dueAt: dueAt.toISOString(),
        remindBeforeMinutes: 30,
      });
    expect(response.status).toBe(201);
    expect(response.body.assignedToUserId).toBe(salesUserId);
    expect(response.body.company?.id).toBe(companyId);
    expect(response.body.status).toBe('todo');
    expect(response.body.overdue).toBe(false);
    // Oluşturma ve atama hareketleri geçmişe düşmeli.
    expect(response.body.events.map((event: { eventType: string }) => event.eventType)).toEqual(
      expect.arrayContaining(['created', 'assigned'])
    );
    assignedTaskId = response.body.id;
  });

  it('lets a plain member open a task for themselves', async () => {
    // Atanan alanı boş bırakılan görev kişinin kendisine düşer; yetki kontrolü
    // bu çözülmüş değere bakmazsa sıradan kullanıcı kendine görev açamaz.
    const response = await request()
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ title: `Fiyat listesini gönder ${runId}` });
    expect(response.status).toBe(201);
    expect(response.body.assignedToUserId).toBe(salesUserId);
  });

  it('shows the task under the assignee "mine" view and counts', async () => {
    const list = await request()
      .get('/api/v1/tasks?view=mine')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((task: { id: string }) => task.id === assignedTaskId)).toBe(true);

    const counts = await request().get('/api/v1/tasks/counts').set('Authorization', `Bearer ${salesToken}`);
    expect(counts.status).toBe(200);
    expect(counts.body.mine).toBeGreaterThan(0);
  });

  it('filters tasks by the related company record', async () => {
    const list = await request()
      .get(`/api/v1/tasks?companyId=${companyId}`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((task: { id: string }) => task.id === assignedTaskId)).toBe(true);
  });

  it('marks an overdue task without storing a separate status', async () => {
    const overdue = await request()
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        title: `Ödeme durumunu kontrol et ${runId}`,
        assignedToUserId: salesUserId,
        dueAt: new Date(Date.now() - 3_600_000).toISOString(),
      });
    expect(overdue.status).toBe(201);
    expect(overdue.body.overdue).toBe(true);

    const list = await request().get('/api/v1/tasks?view=overdue').set('Authorization', `Bearer ${salesToken}`);
    expect(list.body.data.some((task: { id: string }) => task.id === overdue.body.id)).toBe(true);
  });

  it('lets the assignee complete and reopen the task', async () => {
    const done = await request()
      .patch(`/api/v1/tasks/${assignedTaskId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'done' });
    expect(done.status).toBe(200);
    expect(done.body.completedAt).toBeTruthy();
    expect(done.body.overdue).toBe(false);
    expect(done.body.events.some((event: { eventType: string }) => event.eventType === 'completed')).toBe(true);

    const reopened = await request()
      .patch(`/api/v1/tasks/${assignedTaskId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'todo' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.completedAt).toBeNull();
    expect(reopened.body.events.some((event: { eventType: string }) => event.eventType === 'reopened')).toBe(true);
  });

  it('sends a reminder once and never twice', async () => {
    // Son tarih 10 dk sonra, hatırlatma 30 dk önce → hatırlatma anı çoktan geçti.
    const created = await request()
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        title: `Servis ekibiyle görüş ${runId}`,
        assignedToUserId: salesUserId,
        dueAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        remindBeforeMinutes: 30,
      })
      .expect(201);

    const reminders = app.get(TaskRemindersService);
    const first = await reminders.runOnce();
    expect(first.sent).toBeGreaterThan(0);

    const afterFirst = await request()
      .get(`/api/v1/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .expect(200);
    expect(afterFirst.body.events).toBeDefined();

    // İkinci tur aynı görevi tekrar sahiplenmemeli; damga bunu engelliyor.
    const before = first.sent;
    const second = await reminders.runOnce();
    expect(second.sent).toBeLessThan(before + 1);

    const bell = await request()
      .get('/api/v1/notifications?pageSize=50')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);
    const mine = bell.body.data.filter(
      (row: { type: string; entityId: string }) => row.type === 'task_reminder' && row.entityId === created.body.id
    );
    expect(mine).toHaveLength(1);
  });

  it('does not flood reminders that are days late', async () => {
    // Sunucu kapalıyken biriken hatırlatma: damgalanır ama bildirim gitmez.
    const created = await request()
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        title: `Eski hatırlatma ${runId}`,
        assignedToUserId: salesUserId,
        dueAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        remindBeforeMinutes: 60,
      })
      .expect(201);

    const result = await app.get(TaskRemindersService).runOnce();
    expect(result.skippedStale).toBeGreaterThan(0);

    const bell = await request()
      .get('/api/v1/notifications?pageSize=50')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);
    expect(
      bell.body.data.some(
        (row: { type: string; entityId: string }) => row.type === 'task_reminder' && row.entityId === created.body.id
      )
    ).toBe(false);
  });

  it('refuses assigning to another user without the manage permission', async () => {
    const response = await request()
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ title: 'Yetkisiz atama', assignedToUserId: '00000000-0000-4000-8000-000000000001' });
    expect(response.status).toBe(403);
  });

  it('hides another user task from a member without the manage permission', async () => {
    // Süper yöneticinin kendine açtığı görev satış personeline hiç görünmemeli;
    // id'si bilinse bile okunamamalı ve güncellenememeli.
    const foreign = await request()
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ title: `Yöneticinin kendi görevi ${runId}` });
    expect(foreign.status).toBe(201);

    const list = await request().get('/api/v1/tasks?view=all').set('Authorization', `Bearer ${salesToken}`);
    expect(list.body.data.some((task: { id: string }) => task.id === foreign.body.id)).toBe(false);

    const read = await request()
      .get(`/api/v1/tasks/${foreign.body.id}`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(read.status).toBe(404);

    const write = await request()
      .patch(`/api/v1/tasks/${foreign.body.id}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ title: 'Yetkisiz değişiklik' });
    expect(write.status).toBe(404);
  });

  it('keeps an empty patch harmless', async () => {
    // Değişmeyen formu kaydetmek Drizzle `.set({})` üzerinde 500 veriyordu.
    const response = await request()
      .patch(`/api/v1/tasks/${assignedTaskId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({});
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(assignedTaskId);
  });

  it('refuses unassigning without the manage permission', async () => {
    const response = await request()
      .patch(`/api/v1/tasks/${assignedTaskId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ assignedToUserId: null });
    expect(response.status).toBe(403);
  });

  it('refuses deleting a task without the delete permission', async () => {
    const response = await request()
      .delete(`/api/v1/tasks/${assignedTaskId}`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(response.status).toBe(403);

    const asAdmin = await request()
      .delete(`/api/v1/tasks/${assignedTaskId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(asAdmin.status).toBe(200);
  });
});
