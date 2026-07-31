import { describe, expect, it } from 'vitest';
import { cargoLabelDoc } from '../../web/src/app/lib/print/templates';

describe('cargo label template', () => {
  it('prints a compact recipient block, an editable phone and no duplicate slogan', () => {
    const document = cargoLabelDoc({
      firma: 'Örnek Makina Sanayi A.Ş.',
      adres: 'Organize Sanayi Bölgesi 10. Cadde No:4',
      ilce: 'Nilüfer',
      sehir: 'Bursa',
      tel: '0 (224) 000 00 00',
    }, 'https://crm.example.test/print');

    expect(document.body).toContain('Organize Sanayi Bölgesi 10. Cadde No:4<br>Nilüfer / Bursa');
    expect(document.body).toContain('Tel: 0 (224) 000 00 00');
    expect(document.body).not.toContain('Makina Marketiniz');
    expect(document.css).toContain('gap: 1.5mm');
    expect(document.css).not.toContain('white-space: pre-wrap');
  });
});
