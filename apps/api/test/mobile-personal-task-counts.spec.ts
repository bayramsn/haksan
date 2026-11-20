import { expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { TasksService } from '../src/modules/tasks/tasks.service';
import type { DbClient } from '../src/db/client';
import type { PushService } from '../src/shared/push/push.service';
import type { AuthContext } from '../src/shared/security/auth.types';

it('personal counters stay assigned to the actor even when a manager can see the whole team', async () => {
  let selection: Record<string, SQL> = {};
  let predicate: SQL | undefined;
  const db = { select: vi.fn((fields) => {
    selection = fields;
    return { from: () => ({ where: (where: SQL) => { predicate = where; return [{ mine: 2, mineToday: 1, mineOverdue: 1 }]; } }) };
  }) };
  const actor = { userId: 'actor-id', tenantId: 'tenant-id', permissions: new Set(['tasks.read', 'tasks.manage']),
    roles: [], canViewAllDivisions: true, activeDivisionId: null, divisionIds: [], accessScopes: [], departmentIds: [] } as unknown as AuthContext;
  const service = new TasksService(db as unknown as DbClient, {} as PushService);
  const result = await service.counts(actor);
  const dialect = new PgDialect();
  for (const key of ['mine', 'mineToday', 'mineOverdue']) {
    const compiled = dialect.sqlToQuery(selection[key]);
    expect(compiled.sql).toContain('"tasks"."assigned_to_user_id"');
    expect(compiled.sql).toContain("'todo', 'in_progress'");
    expect(compiled.params).toContain(actor.userId);
  }
  const where = dialect.sqlToQuery(predicate!);
  expect(where.sql).toContain('"tasks"."tenant_id"');
  expect(where.sql).toContain('"tasks"."deleted_at" is null');
  expect(where.params).toContain(actor.tenantId);
  expect(result).toEqual({ mine: 2, mineToday: 1, mineOverdue: 1 });
});
