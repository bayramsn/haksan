import { describe, expect, it, vi } from 'vitest';
import { customerDeviceCreateSchema, customerDeviceUpdateSchema } from '@haksan/shared';
import { assertDeviceCompanyContact, upsertInventoryCustomerDevice, type DeviceTransaction } from '../src/shared/utils/customer-device-upsert';
import type { AuthContext } from '../src/shared/security/auth.types';

const actor = { tenantId: 'tenant', userId: 'user', roles: ['super_admin'], permissions: new Set(), activeDivisionId: 'all', accessScopes: [], divisionIds: [] } as unknown as AuthContext;
const values = { tenantId: 'tenant', companyId: 'company', inventoryItemId: 'stock', divisionId: 'division' };
function fixture(existing: unknown[] = []) {
  const insertValues = vi.fn().mockImplementation((row) => ({ returning: async () => [{ id: 'created', ...row }] }));
  const set = vi.fn().mockImplementation((patch) => ({ where: () => ({ returning: async () => [{ ...existing[0] as object, ...patch }] }) }));
  const tx = {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    query: {
      companies: { findFirst: vi.fn().mockResolvedValue({ id: 'company' }) },
      contacts: { findFirst: vi.fn().mockResolvedValue({ id: 'contact', companyId: 'company' }) },
      contactCompanies: { findFirst: vi.fn().mockResolvedValue(undefined) },
      inventoryItems: { findFirst: vi.fn().mockResolvedValue({ id: 'stock', divisionId: 'division' }) },
      customerDevices: { findMany: vi.fn().mockResolvedValue(existing) },
    },
    insert: vi.fn().mockReturnValue({ values: insertValues }), update: vi.fn().mockReturnValue({ set }),
  };
  return { tx: tx as unknown as DeviceTransaction, raw: tx, insertValues, set };
}

describe('Inventory customer-device identity', () => {
  it('reuses an invoice device during opportunity delivery and preserves sale history', async () => {
    const existing = { id: 'old-id', ...values, saleDate: new Date('2020-01-01'), contactId: null, opportunityId: null };
    const { tx, raw, set } = fixture([existing]);
    const result = await upsertInventoryCustomerDevice(tx, actor, { ...values, opportunityId: 'opportunity', saleDate: new Date(), contactId: 'contact' });
    expect(result.id).toBe('old-id');
    expect(result.saleDate).toEqual(existing.saleDate);
    expect(set).toHaveBeenCalledWith({ opportunityId: 'opportunity', contactId: 'contact' });
    expect(raw.insert).not.toHaveBeenCalled();
    expect(raw.execute).toHaveBeenCalledTimes(1);
  });
  it('does not transfer a physical machine to another company silently', async () => {
    const { tx, raw } = fixture([{ id: 'old', ...values, companyId: 'other' }]);
    await expect(upsertInventoryCustomerDevice(tx, actor, values)).rejects.toThrow('başka bir müşteri');
    expect(raw.insert).not.toHaveBeenCalled();
    expect(raw.update).not.toHaveBeenCalled();
  });
  it('blocks inconsistent existing duplicates rather than selecting one', async () => {
    const { tx } = fixture([{ id: 'a', ...values }, { id: 'b', ...values }]);
    await expect(upsertInventoryCustomerDevice(tx, actor, values)).rejects.toThrow('birden fazla');
  });
  it('rejects missing/out-of-scope stock and contact not belonging to the company', async () => {
    const { tx, raw } = fixture();
    raw.query.inventoryItems.findFirst.mockResolvedValueOnce(undefined);
    await expect(upsertInventoryCustomerDevice(tx, actor, values)).rejects.toThrow('Stok');
    raw.query.contacts.findFirst.mockResolvedValueOnce({ id: 'contact', companyId: 'other' });
    await expect(assertDeviceCompanyContact(tx, actor, 'company', 'contact')).rejects.toThrow('firmaya ait değil');
  });
  it('accepts a verified additional company link for a contact', async () => {
    const { tx, raw } = fixture();
    raw.query.contacts.findFirst.mockResolvedValueOnce({ id: 'contact', companyId: 'other' });
    raw.query.contactCompanies.findFirst.mockResolvedValueOnce({ contactId: 'contact' });
    await expect(assertDeviceCompanyContact(tx, actor, 'company', 'contact')).resolves.toBeUndefined();
  });
  it('creates one inventory-linked identity and keeps stock-derived division', async () => {
    const { tx, insertValues } = fixture();
    const created = await upsertInventoryCustomerDevice(tx, actor, { ...values, divisionId: null });
    expect(created.divisionId).toBe('division');
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ initialCompanyId: 'company', inventoryItemId: 'stock' }));
  });
  it('allows explicitly clearing a contact and rejects malformed identifiers', () => {
    expect(customerDeviceUpdateSchema.parse({ contactId: null })).toEqual({ contactId: null });
    expect(customerDeviceCreateSchema.safeParse({ companyId: 'company', contactId: 'invalid' }).success).toBe(false);
  });
});
