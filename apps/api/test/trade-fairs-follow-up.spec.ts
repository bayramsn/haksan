import { describe, expect, it, vi } from 'vitest';
import { TradeFairsService } from '../src/modules/trade-fairs/trade-fairs.service';
import { tradeFairContactCreateSchema } from '@haksan/shared';

const actor = { tenantId: 'tenant', userId: 'staff', roles: [] } as any;
const meeting = { contacted: true, contactMethod: 'phone', contactDate: '2026-10-08', contactNotes: 'Teklif talep etti', offerSent: false, customerConverted: false };
function setup(before: object = meeting) {
  const returning = vi.fn().mockResolvedValue([{ id: 'record', ...before }]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const db = { update: vi.fn().mockReturnValue({ set }) };
  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  const service = new TradeFairsService(db as any, audit as any);
  vi.spyOn(service as any, 'find').mockResolvedValue({ id: 'record', metByUserId: 'staff', ...before });
  const assertTenantUser = vi.spyOn(service as any, 'assertTenantUser');
  return { service, set, db, assertTenantUser, audit };
}
describe('Fuar görüşme takibi service', () => {
  it('defaults existing-style creates to uncontacted and neutral', () => {
    expect(tradeFairContactCreateSchema.parse({ fairName: 'WIN', companyName: 'Firma', contactName: 'Ali' })).toMatchObject({ contacted: false, offerSent: false, customerConverted: false });
  });
  it('preserves meeting details and staff on a status-only patch and audits the update', async () => {
    const { service, set, assertTenantUser, audit } = setup();
    await service.update(actor, 'record', { offerSent: true });
    expect(set).toHaveBeenCalledWith({ offerSent: true, updatedBy: 'staff' });
    expect(assertTenantUser).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalled();
  });
  it('rejects marking a record contacted without details before writing', async () => {
    const { service, db } = setup({ contacted: false });
    await expect(service.update(actor, 'record', { contacted: true })).rejects.toThrow('Görüşme yolu, tarihi ve notu zorunlu');
    expect(db.update).not.toHaveBeenCalled();
  });
  it('rejects clearing required notes on an existing contacted record', async () => {
    const { service, db } = setup();
    await expect(service.update(actor, 'record', { contactNotes: '  ' })).rejects.toThrow();
    expect(db.update).not.toHaveBeenCalled();
  });
  it('saves all details and allows clearing the contacted flag without losing notes', async () => {
    const { service, set } = setup({ contacted: false });
    await service.update(actor, 'record', { ...meeting, contactMethod: 'phone', contactNotes: '  Teklif talep etti  ' });
    expect(set).toHaveBeenCalledWith({ ...meeting, contactNotes: 'Teklif talep etti', updatedBy: 'staff' });
    await service.update(actor, 'record', { contacted: false });
    expect(set).toHaveBeenLastCalledWith({ contacted: false, updatedBy: 'staff' });
  });
});
