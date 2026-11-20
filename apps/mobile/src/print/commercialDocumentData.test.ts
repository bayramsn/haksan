import { describe, expect, it } from 'vitest';
import { commercialDocumentHtml } from './commercialDocumentData';

const snapshot = {
  capturedAt: '2026-10-22',
  document: { finalizedAt: '2026-10-22' },
  company: { legalTitle: 'Ankara Makine A.Ş.', taxOffice: 'Çankaya', taxNumber: '1234567890' },
  companyAddresses: [{ fullAddress: 'Örnek Cad. No: 1', district: 'Çankaya', province: 'Ankara' }],
  companyPhones: [{ phone: '05321234567' }],
  companyEmails: [{ email: 'alici@example.test', emailType: 'main' }],
  currency: { code: 'EUR' },
  quote: { subtotal: 1000, customsTotal: 0, vatAmount: 200 },
  signature: { name: 'Hazırlayan', imageUrl: '/signatures/media/example' },
  terms: { paymentTermsText: 'Peşin ödeme', deliveryTermsText: 'Ankara teslim' },
  items: [{ description: 'CNC Makinesi', quantity: 1, unitPrice: 1000, lineTotal: 1000, vatRate: 20,
    product: { fullName: 'CNC Makinesi', modelName: 'M100', standardEquipment: ['Standart takım'] },
    compatibility: { technicalSpecs: [{ key: 'X Ekseni', value: '800', unit: 'mm', groupCode: 'EKSENLER' }] },
  }],
};

describe('commercial documents use the web print templates', () => {
  it('renders CRM proforma number, customer, terms and currency', async () => {
    const html = await commercialDocumentHtml('proforma', { documentNo: 'PF-100', issueDate: '2026-10-22' }, snapshot, 'https://crm.example.test');
    for (const value of ['PF-100', 'Ankara Makine', 'Peşin ödeme', 'EUR', '/api/v1/signatures/media/example', 'https://crm.example.test/print/haksan-letterhead.png', 'https://crm.example.test/print/haksan-stamp.png']) expect(html).toContain(value);
  });
  it('renders the contract technical details, standard equipment and its own number', async () => {
    const html = await commercialDocumentHtml('contract', { contractNo: 'SOZ-200', signedDate: '2026-10-22' }, snapshot, 'https://crm.example.test');
    for (const value of ['SOZ-200', 'X Ekseni', '800 mm', 'Standart takım', 'Ankara teslim']) expect(html).toContain(value);
    expect(html).not.toContain('PF-100');
  });
  it('rejects missing commercial data instead of producing a misleading PDF', async () => {
    await expect(commercialDocumentHtml('proforma', { documentNo: 'PF-100', issueDate: '2026-10-22' }, { ...snapshot, currency: {} }, 'https://crm.example.test')).rejects.toThrow('para birimi');
    await expect(commercialDocumentHtml('contract', { contractNo: 'SOZ-200', signedDate: '2026-10-22' }, { ...snapshot, company: {} }, 'https://crm.example.test')).rejects.toThrow('firma unvanı');
  });
});
