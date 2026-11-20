import { describe, expect, it, vi } from 'vitest';
import { tenantUpdateSchema } from '@haksan/shared';
import { AdminController } from '../src/modules/admin/admin.controller';
import type { DbClient } from '../src/db/client';
import type { AuthContext } from '../src/shared/security/auth.types';
import type { AuditService } from '../src/shared/database/audit.service';

describe('tenant settings navigation compatibility', () => {
  it('allows saving settings loaded from legacy tenant data and normalizes update responses', async () => {
    const stored = {
      id: 'tenant',
      name: 'Tenant',
      slug: 'tenant',
      hiddenNavigationKeys: ['customers', 'bulk-mail', 'kanban', 'sales-cases', 'contracts'],
      userReportRecipients: [],
    };
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const values = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: { tenants: { findFirst: vi.fn().mockResolvedValue(stored) } },
      update: vi.fn().mockReturnValue({ set }),
      insert: vi.fn().mockReturnValue({ values }),
    };
    const controller = new AdminController(db as unknown as DbClient, {} as AuditService);
    const user = { tenantId: 'tenant', userId: 'admin', permissions: new Set(['tenants.update']) } as AuthContext;

    const loaded = await controller.getTenant(user);
    expect(loaded.hiddenNavigationKeys).toEqual(['customers', 'sales-cases', 'documents']);
    const body = tenantUpdateSchema.parse({ hiddenNavigationKeys: loaded.hiddenNavigationKeys });
    await controller.updateTenant(body, user);
    expect(set).toHaveBeenCalledWith({ hiddenNavigationKeys: ['customers', 'sales-cases', 'documents'] });

    // Updating another field must also return supported keys, even if legacy
    // navigation settings have not yet been saved back to the database.
    const updated = await controller.updateTenant({ phone: '123' }, user);
    expect(updated.hiddenNavigationKeys).toEqual(loaded.hiddenNavigationKeys);
    expect(stored.hiddenNavigationKeys).toContain('bulk-mail');
    expect(tenantUpdateSchema.safeParse({ hiddenNavigationKeys: ['bulk-mail'] }).success).toBe(false);
  });
});
