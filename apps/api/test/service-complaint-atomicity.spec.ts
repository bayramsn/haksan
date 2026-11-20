import { describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../src/db/client';
import type { AuthContext } from '../src/shared/security/auth.types';
vi.mock('../src/config/env', () => ({ loadEnv: () => ({ RATE_LIMIT_UPLOAD: 5 }) }));
vi.mock('../src/shared/utils/document-series', () => ({
  resolveBusinessLine: vi.fn().mockResolvedValue('CNC'),
  nextSeriesDocumentNo: vi.fn().mockResolvedValue('CNC-SRV-1'),
}));
import { ServiceComplaintsController } from '../src/modules/service/service-complaints.controller';

const user = { tenantId: 'tenant' } as AuthContext;
function fixture(failFiles = false) {
  const intake = { id: 'complaint', companyId: 'company', divisionId: 'division', status: 'new', ticketType: 'warranty_claim' };
  const lock = vi.fn().mockResolvedValue([]);
  let staged: string[] = [];
  let committed: string[] = [];
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: lock }) }) }),
    query: { serviceTicketStatuses: { findFirst: vi.fn().mockResolvedValue({ id: 'open' }) } },
    insert: () => ({ values: () => ({ returning: async () => { staged.push('ticket'); return [{ id: 'ticket', ticketType: 'warranty_claim' }]; } }) }),
    update: () => ({ set: () => ({ where: async () => { staged.push('converted'); } }) }),
  };
  const db = { transaction: vi.fn(async (run: (db: unknown) => Promise<void>) => {
    staged = [];
    try { await run(tx); committed = [...staged]; } catch (error) { staged = []; throw error; }
  }) };
  const controller = new ServiceComplaintsController(db as unknown as DbClient);
  const scoped = vi.spyOn(controller as any, 'scopedIntake').mockResolvedValue(intake);
  const warranty = vi.spyOn(controller as any, 'ensureWarrantyClaim').mockImplementation(async () => { staged.push('claim'); });
  const files = vi.spyOn(controller as any, 'copyComplaintFilesToTicket').mockImplementation(async () => {
    if (failFiles) throw new Error('file-link insert failed');
    staged.push('files');
  });
  vi.spyOn(controller as any, 'complaintView').mockResolvedValue({ status: 'converted' });
  return { controller, tx, scoped, lock, warranty, files, committed: () => committed };
}

describe('Complaint conversion atomicity', () => {
  it('locks and rereads the intake before creating ticket, warranty and file links in the same transaction', async () => {
    const f = fixture();
    await f.controller.convertComplaint('complaint', {}, user);
    expect(f.lock).toHaveBeenCalledWith('update');
    expect(f.scoped).toHaveBeenLastCalledWith('complaint', user, f.tx);
    expect(f.lock.mock.invocationCallOrder[0]).toBeLessThan(f.scoped.mock.invocationCallOrder[1]);
    expect(f.warranty).toHaveBeenCalledWith(expect.objectContaining({ id: 'ticket' }), f.tx);
    expect(f.files).toHaveBeenCalledWith('complaint', 'ticket', 'tenant', f.tx);
    expect(f.committed()).toEqual(['ticket', 'claim', 'files', 'converted']);
  });
  it('does not commit a ticket or warranty when file-link copying fails', async () => {
    const f = fixture(true);
    await expect(f.controller.convertComplaint('complaint', {}, user)).rejects.toThrow('file-link insert failed');
    expect(f.committed()).toEqual([]);
  });
  it('rejects an intake converted by another request while waiting for its row lock', async () => {
    const f = fixture();
    f.scoped.mockResolvedValueOnce({ status: 'new' }).mockResolvedValueOnce({ status: 'converted' });
    await expect(f.controller.convertComplaint('complaint', {}, user)).rejects.toThrow('zaten servis');
    expect(f.warranty).not.toHaveBeenCalled();
    expect(f.files).not.toHaveBeenCalled();
    expect(f.committed()).toEqual([]);
  });
});
