/**
 * Bildirime tıklayınca ilgili kayda gidilmeli. Hedefi olmayan tür sessizce
 * "açılacak kayıt yok" diyor; bu test kapsamı sabitler.
 */
import { describe, expect, it } from 'vitest';
import { NotificationsController, type NotificationTarget } from '../src/modules/notifications/notifications.controller';

// targetFor private; davranışı üzerinden doğrulamak için erişilir.
const targetFor = (entityType: string | null, entityId: string | null): NotificationTarget | null =>
  (NotificationsController.prototype as unknown as {
    targetFor(row: { entityType: string | null; entityId: string | null }, resolved: Map<string, NotificationTarget>): NotificationTarget | null;
  }).targetFor({ entityType, entityId }, new Map());

describe('notification targets', () => {
  it('görev bildirimi ilgili görevi açar', () => {
    expect(targetFor('task', 'task-1')).toEqual({ kind: 'navigate', nav: 'tasks', query: 'task:task-1' });
  });

  it('servis kaydı bildirimi ilgili kaydı açar', () => {
    expect(targetFor('service_ticket', 't-9')).toEqual({
      kind: 'navigate',
      nav: 'service-requests',
      query: 'ticket:t-9',
    });
  });

  it('takvim ve imza bildirimleri kendi ekranına gider', () => {
    expect(targetFor('calendar_event', 'e-1')).toEqual({ kind: 'navigate', nav: 'calendar' });
    expect(targetFor('signature', 's-1')).toEqual({ kind: 'navigate', nav: 'settings' });
  });

  it('firma ve fırsat hedefleri korunur', () => {
    expect(targetFor('company', 'c-1')).toEqual({ kind: 'company', companyId: 'c-1' });
    expect(targetFor('opportunity', 'o-1')).toEqual({ kind: 'opportunity', opportunityId: 'o-1' });
  });

  it('kimliksiz görev bildirimi yine görev listesine gider', () => {
    expect(targetFor('task', null)).toEqual({ kind: 'navigate', nav: 'tasks' });
  });

  it('tanımsız tür hedefsiz kalır', () => {
    expect(targetFor('bilinmeyen', 'x')).toBeNull();
    expect(targetFor(null, null)).toBeNull();
  });
});
