import { describe, it, expect, vi } from 'vitest';
import { persistQuoteItems } from './quoteItemEditing';
describe('teklif kalem kimliklerini koruma', () => {
  it('geçmiş makine ve fiyat satırını günceller; yalnız eklenen ve kaldırılan kalemleri oluşturur veya siler', async () => {
    const service = { get: vi.fn().mockResolvedValue({ items: [{ id: 'machine' }, { id: 'power' }, { id: 'removed' }] }), updateItem: vi.fn().mockResolvedValue({}), addItem: vi.fn().mockResolvedValue({}), deleteItem: vi.fn().mockResolvedValue({}) };
    await persistQuoteItems('quote', [{ itemId: 'machine', productModelId: 'archived-product', compatibility: { technicalSpecs: [{ key: 'Tabla', value: '3000 × 1500' }] } }, { itemId: 'power', description: 'Eski güç bedeli', unitPrice: 500 }, { description: 'Yeni donanım', unitPrice: 100 }], service);
    expect(service.updateItem).toHaveBeenCalledWith('quote', 'machine', expect.objectContaining({ productModelId: 'archived-product', sortOrder: 0 }));
    expect(service.updateItem).toHaveBeenCalledWith('quote', 'power', expect.objectContaining({ unitPrice: 500, sortOrder: 1 }));
    expect(service.addItem).toHaveBeenCalledTimes(1);
    expect(service.deleteItem).toHaveBeenCalledExactlyOnceWith('quote', 'removed');
  });
  it('güncelleme başarısızsa kayıtlı kalemleri silmez', async () => {
    const service = { get: vi.fn().mockResolvedValue({ items: [{ id: 'old' }] }), updateItem: vi.fn().mockRejectedValue(new Error('update failed')), addItem: vi.fn(), deleteItem: vi.fn() };
    await expect(persistQuoteItems('quote', [{ itemId: 'old', description: 'Eski makine' }], service)).rejects.toThrow('update failed');
    expect(service.deleteItem).not.toHaveBeenCalled();
  });
});
