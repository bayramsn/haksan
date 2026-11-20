import { describe, expect, it, vi } from 'vitest';
import { INSTALLATION_FORM_DEFAULT_CHECKS } from '@haksan/shared';
import { ServiceController } from '../src/modules/service/service.controller';
import { installationJobs } from '../src/db/schema/service';
import type { DbClient } from '../src/db/client';
import type { AuthContext } from '../src/shared/security/auth.types';

describe('Installation completion opportunity boundary', () => {
  it.each(['sales', 'super_admin'])('records completion without bypassing opportunity requirements for %s', async (role) => {
    const job = { id: 'installation', opportunityId: 'opportunity', customerDeviceId: null };
    const returning = vi.fn().mockResolvedValue([{ ...job, completedAt: new Date() }]);
    const set = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) });
    const update = vi.fn().mockReturnValue({ set });
    const findOpportunity = vi.fn();
    const db = {
      query: {
        installationJobs: { findFirst: vi.fn().mockResolvedValue(job) },
        opportunities: { findFirst: findOpportunity },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 'completed-status' }]) }) }),
      }),
      update,
    };
    const actor = {
      tenantId: 'tenant', userId: 'user', roles: [role], accessScopes: [],
      canViewAllDivisions: true, activeDivisionId: null, activeDepartmentId: null,
    } as unknown as AuthContext;
    const controller = new ServiceController(db as unknown as DbClient);
    const result = await controller.updateInstallationStatus(job.id, {
      statusCode: 'completed',
      formData: {
        problem: { hasProblem: false },
        checks: INSTALLATION_FORM_DEFAULT_CHECKS.map((check) => ({ ...check, status: 'done' as const })),
      },
    }, actor);

    expect(result.completedAt).toBeInstanceOf(Date);
    expect(result.opportunityStageChanged).toBe(false);
    expect(result.opportunityId).toBe(job.opportunityId);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(installationJobs);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ statusId: 'completed-status', completedAt: expect.any(Date) }));
    expect(findOpportunity).not.toHaveBeenCalled();
  });
});
