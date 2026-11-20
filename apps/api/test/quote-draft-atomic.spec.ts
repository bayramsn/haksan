import { afterEach, describe, expect, it, vi } from 'vitest';
import { quoteDraftUpdateSchema } from '@haksan/shared';
import { QuotesService } from '../src/modules/quotes/quotes.service';
const itemId = '00000000-0000-4000-8000-000000000001';
const body = quoteDraftUpdateSchema.parse({ notes: 'Taslak', items: [{ id: itemId, description: 'Makine', quantity: 1, unitPrice: 100 }] });
const actor = { tenantId: 'tenant', userId: 'user' } as never;
afterEach(() => vi.restoreAllMocks());
function setup(locked = false) {
  const row = { id: 'quote', approvedAt: locked ? new Date() : null, finalizedAt: null, items: [{ id: itemId }] };
  const tx = { select: () => ({ from: () => ({ where: () => ({ for: vi.fn().mockResolvedValue([]) }) }) }) };
  const db = { transaction: vi.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(tx)) };
  vi.spyOn(QuotesService.prototype, 'get').mockResolvedValue(row as never);
  const update = vi.spyOn(QuotesService.prototype, 'update').mockResolvedValue(row as never);
  const updateItem = vi.spyOn(QuotesService.prototype, 'updateItem').mockResolvedValue({ ok: true });
  const add = vi.spyOn(QuotesService.prototype, 'addItem');
  const remove = vi.spyOn(QuotesService.prototype, 'deleteItem');
  const service = new QuotesService(db as never, {} as never, {} as never, {} as never);
  return { service, db, tx, update, updateItem, add, remove };
}
describe('atomic quote draft edit', () => {
  it('keeps existing line identity and updates inside the transaction', async () => {
    const ctx = setup();
    await ctx.service.updateDraft('quote', body, actor);
    expect(ctx.db.transaction).toHaveBeenCalledOnce();
    expect(ctx.updateItem).toHaveBeenCalledWith('quote', itemId, expect.objectContaining({ unitPrice: 100 }), actor);
    expect(ctx.add).not.toHaveBeenCalled();
    expect(ctx.remove).not.toHaveBeenCalled();
    expect(ctx.update.mock.instances[0]).not.toBe(ctx.service);
  });
  it('rejects finalized records before any write', async () => {
    const ctx = setup(true);
    await expect(ctx.service.updateDraft('quote', body, actor)).rejects.toThrow('Kesinleşmiş');
    expect(ctx.update).not.toHaveBeenCalled();
  });
  it('rejects duplicated or foreign line IDs before changing the header', async () => {
    const ctx = setup();
    await expect(ctx.service.updateDraft('quote', { ...body, items: [body.items[0]!, body.items[0]!] }, actor)).rejects.toThrow('yinelenmiş');
    expect(ctx.update).not.toHaveBeenCalled();
  });
  it('propagates a line failure out of the transaction for rollback', async () => {
    const ctx = setup(); ctx.updateItem.mockRejectedValue(new Error('line failure'));
    await expect(ctx.service.updateDraft('quote', body, actor)).rejects.toThrow('line failure');
  });
  it('rejects empty lines, negative prices and zero quantities at the shared boundary', () => {
    expect(quoteDraftUpdateSchema.safeParse({ items: [] }).success).toBe(false);
    expect(quoteDraftUpdateSchema.safeParse({ items: [{ description: 'Makine', quantity: 0, unitPrice: -1 }] }).success).toBe(false);
  });
});
