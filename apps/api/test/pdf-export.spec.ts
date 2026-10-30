import { describe, expect, it } from 'vitest';
import { filterSubtitle, PDF_ROW_LIMIT, pickColumns, rowsToPdfBuffer } from '../src/shared/utils/pdf-export';

describe('PDF exports', () => {
  it('splits very long statement cells across pages instead of clipping them', async () => {
    const tail = 'EKSTRE-ACIKLAMA-SON';
    const buffer = await rowsToPdfBuffer({
      title: 'Cari Ekstre',
      subtitle: 'Uzun açıklama testi',
      rows: [{ Tarih: '14.07.2026', Açıklama: `${'Ayrıntılı hareket açıklaması '.repeat(700)}${tail}`, Tutar: 100 }],
    });
    const source = buffer.toString('latin1');

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect((source.match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain('...');
  });

  it('keeps a short list on one page (footer must not open an empty page)', async () => {
    const buffer = await rowsToPdfBuffer({ title: 'Firmalar', rows: [{ Firma: 'Anadolu Kalıp', İl: 'Bursa' }] });
    const pages = buffer.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? [];
    expect(pages).toHaveLength(1);
  });

  it('picks PDF columns and describes active filters', () => {
    expect(pickColumns([{ Firma: 'A', Not: 'uzun', İl: 'Bursa' }], ['Firma', 'İl'])).toEqual([{ Firma: 'A', İl: 'Bursa' }]);
    expect(filterSubtitle([['İl', 'Bursa'], ['İlçe', undefined], ['Arama', '']], 3)).toBe('İl: Bursa · 3 kayıt');
    // Büyük listede PDF kesilir ve bunu alt başlıkta söyler.
    const many = Array.from({ length: PDF_ROW_LIMIT + 5 }, (_, i) => ({ Firma: `F${i}` }));
    expect(pickColumns(many, ['Firma'])).toHaveLength(PDF_ROW_LIMIT);
    expect(filterSubtitle([], many.length)).toContain('tamamı için Excel');
  });
});
