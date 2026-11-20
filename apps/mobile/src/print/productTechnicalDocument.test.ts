import { afterEach, describe, expect, it, vi } from 'vitest';
import { productForPrint, productTechnicalHtml } from './productTechnicalDocumentData';
const native = vi.hoisted(() => ({ get: vi.fn(), specs: vi.fn(), equipment: vi.fn(), compatible: vi.fn(), print: vi.fn(), share: vi.fn() }));
vi.mock('expo-print', () => ({ printToFileAsync: native.print }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: native.share }));
vi.mock('../api/config', () => ({ apiBaseOrigin: () => 'https://crm.example.test' }));
vi.mock('../api/services', () => ({ productService: { get: native.get, specs: native.specs, equipment: native.equipment, compatibleOptionalEquipment: native.compatible } }));
import { shareProductTechnicalDocument } from './productTechnicalDocument';
const raw = { id: 'p1', fullName: 'Örnek CNC', modelCode: 'M100', category: { code: 'TEZGAH' }, brand: { name: 'HAKSAN', logoUrl: '/brands/media/logo' }, imageUrl: '/products/media/photo', currency: { code: 'EUR' }, standardEquipment: [] };
const specs = [{ spec: { specKey: 'X Ekseni', specValue: '812', specUnit: 'mm' }, group: { code: 'EKSENLER', name: 'Eksenler' } }];
const equipment = [{ item: { id: 's1', title: 'Standart takım' }, type: { code: 'standart' } }, { item: { id: 'o1', title: 'Yağ soğutucu' }, type: { code: 'opsiyonel' } }];
afterEach(() => vi.unstubAllGlobals());

describe('CRM product technical PDF', () => {
  it('preserves nested spec categories and API image paths in the product adapter', () => {
    const product = productForPrint(raw, specs, 'https://crm.example.test');
    expect(product.specs[0]).toEqual({ key: 'X Ekseni', value: '812', unit: 'mm', groupCode: 'EKSENLER', groupName: 'Eksenler' });
    expect(product.imageUrl).toBe('https://crm.example.test/api/v1/products/media/photo');
  });
  it('uses web technical categories, standard and optional equipment without price pages', () => {
    const html = productTechnicalHtml(raw, specs, equipment, [{ product: { id: 'o2', fullName: 'Takım ölçme' }, brand: { name: 'HAKSAN' } }], 'https://crm.example.test');
    for (const text of ['X Ekseni', '812', 'EKSENLER', 'Standart takım', 'Yağ soğutucu', 'Takım ölçme', '/print/haksan-letterhead.jpg']) expect(html).toContain(text);
    expect(html).not.toContain('ÖDEME ŞARTLARI');
  });
  it('loads the actual CRM details and shares a PDF containing embedded product imagery', async () => {
    native.get.mockResolvedValue(raw); native.specs.mockResolvedValue(specs); native.equipment.mockResolvedValue(equipment); native.compatible.mockResolvedValue([]);
    native.print.mockResolvedValue({ uri: 'file:///cache/product.pdf' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer }));
    await shareProductTechnicalDocument('p1');
    expect(native.get).toHaveBeenCalledWith('p1');
    expect(native.compatible).toHaveBeenCalledWith('p1');
    expect(native.print.mock.calls[0][0].html).toContain('data:image/png;base64,AQID');
    expect(native.share).toHaveBeenCalledWith('file:///cache/product.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
  });
});
