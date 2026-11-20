import { describe, expect, it } from 'vitest';
import { normalizeHiddenNavigationKeys } from '../src/modules/auth/navigation-compat';
import { meResponseSchema } from '@haksan/shared';

describe('authentication navigation compatibility', () => {
  it('keeps valid restrictions, maps aliases, drops retired keys without changing stored data', () => {
    const stored = ['customers', 'bulk-mail', 'kanban', 'sales-cases', 'offers'];
    expect(normalizeHiddenNavigationKeys(stored)).toEqual(['customers', 'sales-cases', 'offers']);
    expect(stored).toEqual(['customers', 'bulk-mail', 'kanban', 'sales-cases', 'offers']);
  });
  it('produces tenant settings accepted by the web authentication contract', () => {
    const tenantSchema = meResponseSchema.shape.tenant;
    expect(tenantSchema.safeParse({ id: 'tenant', name: 'Tenant', slug: 'tenant', hiddenNavigationKeys: normalizeHiddenNavigationKeys(['bulk-mail', 'contracts', 'customers']) }).success).toBe(true);
    expect(normalizeHiddenNavigationKeys(null)).toEqual([]);
  });
});
