import { describe, expect, it } from 'vitest';
import { normalizeCompanyName, normalizePersonName } from '../src/shared/utils/text-normalization';

describe('Turkish text normalization', () => {
  it('stores company names in uppercase with Turkish casing', () => {
    expect(normalizeCompanyName('  ışık   iş makineleri  ')).toBe('IŞIK İŞ MAKİNELERİ');
  });

  it('stores contact names in uppercase with Turkish casing', () => {
    expect(normalizePersonName("  şule ışık o'connor demir-çelik  ")).toBe("ŞULE IŞIK O'CONNOR DEMİR-ÇELİK");
  });
});
