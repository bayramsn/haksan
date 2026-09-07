import { describe, expect, it, vi } from 'vitest';
import { taskCreateSchema, taskUpdateSchema, TASK_COMPLETION_NOTE_MAX_LENGTH } from '@haksan/shared';
import { TasksService } from '../src/modules/tasks/tasks.service';
import type { DbClient } from '../src/db/client';
import type { AuthContext } from '../src/shared/security/auth.types';
import type { PushService } from '../src/shared/push/push.service';
import { tasks, taskEvents } from '../src/db/schema';

vi.mock('../src/shared/push/push.service', () => ({ PushService: class {} }));

describe('Task completion validation', () => {
  it.each([undefined, null, '', ' \n\t ', 42, 'x'.repeat(481)])('rejects missing or invalid completion notes on create and update (%s)', (completionNote) => {
    expect(taskCreateSchema.safeParse({ title: 'Ara', status: 'done', completionNote }).success).toBe(false);
    expect(taskUpdateSchema.safeParse({ status: 'done', completionNote }).success).toBe(false);
  });

  it('accepts and trims notes up to the full supported length', () => {
    const note = 'x'.repeat(TASK_COMPLETION_NOTE_MAX_LENGTH);
    expect(taskUpdateSchema.parse({ status: 'done', completionNote: ` ${note} ` }).completionNote).toBe(note);
    expect(taskCreateSchema.parse({ title: 'Ara', status: 'done', completionNote: ' Görüşüldü ' }).completionNote).toBe('Görüşüldü');
  });

  it('allows ordinary edits, reopening and cancellation without a completion note', () => {
    for (const patch of [{ title: 'Yeni başlık' }, { status: 'todo' }, { status: 'in_progress' }, { status: 'cancelled' }]) {
      expect(taskUpdateSchema.safeParse(patch).success).toBe(true);
    }
  });

  it.each([undefined, 'todo', 'in_progress', 'cancelled'] as const)('rejects completion notes without a completion transition (%s)', (status) => {
    expect(taskCreateSchema.safeParse({ title: 'Ara', status, completionNote: 'Sonuç' }).success).toBe(false);
    expect(taskUpdateSchema.safeParse({ status, completionNote: 'Sonuç' }).success).toBe(false);
  });

  const actor = { userId: 'actor', tenantId: 'tenant', roles: [], permissions: new Set(['tasks.update']), divisionIds: [] } as unknown as AuthContext;

  function fixture() {
    const current = { id: 'task', tenantId: 'tenant', status: 'todo', completedAt: null };
    const writes: Array<{ table: unknown; value: any }> = [];
    const tx = {
      update: (table: unknown) => ({ set: (value: any) => {
        writes.push({ table, value });
        return { where: () => ({ returning: async () => [{ ...current, ...value }] }) };
      } }),
      insert: (table: unknown) => ({ values: async (value: unknown) => { writes.push({ table, value }); } }),
    };
    const db = { transaction: vi.fn(async (callback) => callback(tx)) };
    const service = new TasksService(db as unknown as DbClient, {} as PushService);
    vi.spyOn(service as any, 'findEditable').mockResolvedValue(current);
    vi.spyOn(service as any, 'assertReferences').mockResolvedValue(undefined);
    vi.spyOn(service, 'get').mockResolvedValue({ ...current, events: [] } as any);
    return { service, db, writes, current };
  }

  it('also rejects a service call that bypasses the request validation pipe', async () => {
    const { service, db } = fixture();
    await expect(service.update(actor, 'task', { status: 'done' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.create(actor, { title: 'Ara', status: 'done', priority: 'normal' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('writes completion status and the full attributed note in the same transaction', async () => {
    const { service, db, writes } = fixture();
    const note = 'x'.repeat(TASK_COMPLETION_NOTE_MAX_LENGTH);
    await service.update(actor, 'task', { status: 'done', completionNote: ` ${note} ` });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([
      { table: tasks, value: expect.objectContaining({ status: 'done', completedAt: expect.any(Date) }) },
      { table: taskEvents, value: expect.objectContaining({ taskId: 'task', eventType: 'completed', summary: `Görev tamamlandı: ${note}`, actorUserId: 'actor' }) },
    ]);
  });

  it('rejects service calls that would silently discard a completion note', async () => {
    const { service, db } = fixture();
    await expect(service.update(actor, 'task', { completionNote: 'Sonuç' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.create(actor, { title: 'Ara', status: 'todo', priority: 'normal', completionNote: 'Sonuç' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects a repeated completion instead of silently dropping the submitted note', async () => {
    const { service, db, current } = fixture();
    current.status = 'done';
    await expect(service.update(actor, 'task', { status: 'done', completionNote: 'Yeni sonuç' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
