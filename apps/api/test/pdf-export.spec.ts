import { describe, expect, it } from 'vitest';
import { rowsToPdfBuffer } from '../src/shared/utils/pdf-export';

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
});
