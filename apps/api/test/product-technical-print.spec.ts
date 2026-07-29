import { describe, expect, it } from 'vitest';
import { productTechnicalDoc } from '../../web/src/app/lib/print/productTechnicalPrint';

describe('product technical print', () => {
  it('contains technical content and never renders commercial prices', () => {
    const doc = productTechnicalDoc({
      product: {
        id: 'product-1',
        brand: 'HAKSAN',
        series: 'VM',
        productGroup: 'Tezgah',
        model: 'VM-2',
        modelName: 'Dik İşleme Merkezi',
        type: 'CNC İşleme Merkezi',
        controlPanel: 'Fanuc',
        category: 'Dik İşleme',
        subcategory: '3 Eksen',
        imageUrl: 'https://example.test/vm-2.png',
        shortDescription: 'HAKSAN VM-2 Dik İşleme Merkezi',
        description: 'Yüksek hassasiyetli üretim için CNC tezgahı.',
        listPrice: 150_000,
        cashPrice: 140_000,
        currency: 'USD',
        specs: [{ key: 'X eksen hareketi', value: '800', unit: 'mm', groupName: 'Kapasite' }],
        standardEquipment: ['Talaş konveyörü'],
        optionalEquipment: ['Takım ölçme probu'],
        status: 'active',
      },
      optionalEquipment: [{ title: 'Takım ölçme probu', description: 'Otomatik takım ölçümü' }],
    }, 'https://example.test/print');

    expect(doc.body).toContain('ÜRÜN TEKNİK BİLGİ FORMU');
    expect(doc.body).toContain('X eksen hareketi');
    expect(doc.body).toContain('Talaş konveyörü');
    expect(doc.body).toContain('Takım ölçme probu');
    expect(doc.body).not.toContain('150000');
    expect(doc.body).not.toContain('140000');
    expect(doc.body).not.toContain('Liste Fiyatı');
    expect(doc.body).not.toContain('Peşin');
    expect(doc.body).not.toContain('USD');
  });
});
