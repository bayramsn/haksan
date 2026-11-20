import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { ServiceController } from '../src/modules/service/service.controller';
import type { DbClient } from '../src/db/client';
import type { AuthContext } from '../src/shared/security/auth.types';

const actor = {
  tenantId: 'tenant-a', userId: 'user-a', roles: ['admin'], permissions: new Set(['service_tickets.read']),
  accessScopes: [], divisionIds: [], departmentIds: [], canViewAllDivisions: true,
  activeDivisionId: null, activeDepartmentId: null,
} as unknown as AuthContext;
const dialect = new PgDialect();

describe('Mobile field list scope boundaries', () => {
  it('assigned ticket filter remains ANDed to tenant and soft-delete predicates', async () => {
    const controller = new ServiceController({} as DbClient);
    const where = await (controller as unknown as {
      ticketListWhere(user: AuthContext, query: { assignedToUserId: string }): Promise<SQL>;
    }).ticketListWhere(actor, { assignedToUserId: 'user-b' });
    const compiled = dialect.sqlToQuery(where);
    expect(compiled.sql).toContain('"service_tickets"."tenant_id"');
    expect(compiled.sql).toContain('"service_tickets"."deleted_at" is null');
    expect(compiled.sql).toContain('"service_tickets"."assigned_to_user_id"');
    expect(compiled.params).toContain('tenant-a');
    expect(compiled.params).toContain('user-b');
    expect(compiled.sql).toContain(' and ');
  });

  it('assignment does not widen the selected division', async () => {
    const controller = new ServiceController({} as DbClient);
    const restricted = { ...actor, canViewAllDivisions: false, divisionIds: ['division-a'], activeDivisionId: null };
    const where = await (controller as unknown as {
      ticketListWhere(user: AuthContext, query: { assignedToUserId: string }): Promise<SQL>;
    }).ticketListWhere(restricted, { assignedToUserId: 'user-b' });
    const compiled = dialect.sqlToQuery(where);
    expect(compiled.sql).toContain('"service_tickets"."division_id"');
    expect(compiled.params).toContain('division-a');
    expect(compiled.params).toContain('user-b');
  });

  it('shipment opportunity filter is applied before count and row pagination', async () => {
    const predicates: SQL[] = [];
    let selects = 0;
    const db = { select: vi.fn(() => {
      const countQuery = selects++ === 0;
      return { from: () => ({ where: (where: SQL) => {
        predicates.push(where);
        return countQuery ? Promise.resolve([{ count: 0 }]) : {
          orderBy: () => ({ limit: () => ({ offset: () => Promise.resolve([]) }) }),
        };
      } }) };
    }) };
    const controller = new ServiceController(db as unknown as DbClient);
    const result = await controller.listShipments({ page: 1, pageSize: 20, opportunityId: 'opportunity-a' }, actor);
    expect(result.meta.total).toBe(0);
    expect(predicates).toHaveLength(2);
    for (const predicate of predicates) {
      const compiled = dialect.sqlToQuery(predicate);
      expect(compiled.sql).toContain('"shipments"."opportunity_id"');
      expect(compiled.sql).toContain('"shipments"."tenant_id"');
      expect(compiled.sql).toContain('"shipments"."deleted_at" is null');
      expect(compiled.params).toContain('tenant-a');
      expect(compiled.params).toContain('opportunity-a');
    }
  });
});
