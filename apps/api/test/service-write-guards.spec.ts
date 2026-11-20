import { describe, expect, it, vi } from 'vitest';
import { ServiceController } from '../src/modules/service/service.controller';
import type { DbClient } from '../src/db/client';
import type { AuthContext } from '../src/shared/security/auth.types';

vi.mock('../src/shared/utils/company-visibility', () => ({
  companyVisibilityExistsFilter: vi.fn().mockResolvedValue(undefined),
  companyVisibilityFilter: vi.fn().mockResolvedValue(undefined),
}));
const user = { tenantId: 'tenant', userId: 'actor', roles: ['super_admin'], accessScopes: [], canViewAllDivisions: true } as unknown as AuthContext;
const ticket = { id: 'ticket', tenantId: 'tenant', businessLine: 'CNC', metadata: { serviceStage: 'Diagnosis' } };
function fixture() {
  const returning = vi.fn().mockResolvedValue([ticket]);
  const update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) }) });
  const db = { query: { serviceTickets: { findFirst: vi.fn().mockResolvedValue(ticket) }, users: { findFirst: vi.fn().mockResolvedValue(undefined) } }, update };
  const controller = new ServiceController(db as unknown as DbClient);
  return { controller, db, update };
}
describe('Service write boundaries', () => {
  it.each(['Closed', 'Signed Form', 'Scheduled'])('blocks general metadata stage change to %s', async (serviceStage) => {
    const { controller, update } = fixture();
    await expect(controller.updateTicket('ticket', { metadata: { serviceStage } }, user)).rejects.toThrow('durum güncelleme');
    expect(update).not.toHaveBeenCalled();
  });
  it('accepts unchanged stage alongside ordinary metadata edits', async () => {
    const { controller, update } = fixture();
    await controller.updateTicket('ticket', { metadata: { serviceStage: 'Diagnosis', serviceHourlyRate: 100 } }, user);
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('validates the replacement technician in the current tenant', async () => {
    const { controller, update, db } = fixture();
    await expect(controller.updateTicket('ticket', { assignedToUserId: 'foreign-user' }, user)).rejects.toThrow('Kullanıcı');
    expect(db.query.users.findFirst).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it('blocks creation directly in a closed stage', async () => {
    const { controller, update } = fixture();
    await expect(controller.createTicket({ companyId: 'company', subject: 'subject', severity: 'normal', ticketType: 'request', source: 'manual', metadata: { serviceStage: 'Closed' } }, user)).rejects.toThrow('Talep Açıldı');
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['approved', 'rejected', 'rma_in_progress', 'closed'] as const)('blocks warranty decision bypass via %s', async (status) => {
    const { controller, update } = fixture();
    vi.spyOn(controller as any, 'getScopedTicket').mockResolvedValue({ ...ticket, ticketType: 'warranty_claim' });
    vi.spyOn(controller as any, 'ensureWarrantyClaim').mockResolvedValue({ id: 'claim', status: 'draft', coverageDecision: 'pending' });
    await expect(controller.upsertWarranty('ticket', { status }, user)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['draft', 'submitted'] as const)('does not reset a decided warranty to %s', async (status) => {
    const { controller, update } = fixture();
    vi.spyOn(controller as any, 'getScopedTicket').mockResolvedValue({ ...ticket, ticketType: 'warranty_claim' });
    vi.spyOn(controller as any, 'ensureWarrantyClaim').mockResolvedValue({ id: 'claim', status: 'approved', coverageDecision: 'approved' });
    await expect(controller.upsertWarranty('ticket', { status }, user)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
  it('does not resubmit a warranty after a manager decision', async () => {
    const { controller, update } = fixture();
    vi.spyOn(controller as any, 'getScopedTicket').mockResolvedValue({ ...ticket, ticketType: 'warranty_claim', customerDeviceId: 'device' });
    vi.spyOn(controller as any, 'ensureWarrantyClaim').mockResolvedValue({ id: 'claim', status: 'approved', coverageDecision: 'approved' });
    await expect(controller.submitWarranty('ticket', {}, user)).rejects.toThrow('yeniden onaya');
    expect(update).not.toHaveBeenCalled();
  });
  it('accepts unchanged inferred stage on legacy tickets without stage metadata', async () => {
    const { controller, db, update } = fixture();
    db.query.serviceTickets.findFirst.mockResolvedValue({ ...ticket, metadata: {}, statusId: 'resolved-status' } as any);
    (db.query as any).serviceTicketStatuses = { findFirst: vi.fn().mockResolvedValue({ code: 'resolved' }) };
    await controller.updateTicket('ticket', { metadata: { serviceStage: 'Service Completed', serviceHourlyRate: 100 } }, user);
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('locks and replaces warranty parts inside one transaction; insertion failure propagates', async () => {
    const { controller, db } = fixture();
    vi.spyOn(controller as any, 'getScopedTicket').mockResolvedValue({ ...ticket, ticketType: 'warranty_claim' });
    vi.spyOn(controller as any, 'ensureWarrantyClaim').mockResolvedValue({ id: 'claim' });
    const events: string[] = [];
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: async () => { events.push('lock'); } }) }) }),
      update: () => ({ set: () => ({ where: async () => { events.push('delete'); } }) }),
      insert: () => ({ values: async () => { events.push('insert'); throw new Error('insert failed'); } }),
    };
    (db as any).transaction = vi.fn(async (callback: any) => callback(tx));
    await expect(controller.replaceWarrantyParts('ticket', { parts: [{ description: 'Part', quantity: 1, actionType: 'replace', source: 'stock', chargeToCustomer: false, currency: 'USD' }] }, user)).rejects.toThrow('insert failed');
    expect(events).toEqual(['lock', 'delete', 'insert']);
    expect(db.update).not.toHaveBeenCalled();
  });
});
