import { describe, expect, it } from 'vitest';
import { companyCreateSchema, companyUpdateSchema } from '@haksan/shared';

describe('company contact source contracts', () => {
  it('trims a selected source code or a custom source text', () => {
    expect(companyCreateSchema.parse({
      legalTitle: 'Test firması',
      contactSourceCode: '  phone  ',
    }).contactSourceCode).toBe('phone');

    expect(companyCreateSchema.parse({
      legalTitle: 'Test firması',
      contactSourceText: '  Bölge bayi yönlendirmesi  ',
    }).contactSourceText).toBe('Bölge bayi yönlendirmesi');
  });

  it('rejects simultaneous coded and custom contact sources', () => {
    const result = companyCreateSchema.safeParse({
      legalTitle: 'Test firması',
      contactSourceCode: 'phone',
      contactSourceText: 'Bayi',
    });

    expect(result.success).toBe(false);
  });

  it('supports explicitly clearing both source fields on update', () => {
    expect(companyUpdateSchema.parse({
      contactSourceCode: '   ',
      contactSourceText: null,
    })).toEqual({
      contactSourceCode: null,
      contactSourceText: null,
    });
  });

  it('enforces the custom source text length limit', () => {
    expect(companyUpdateSchema.safeParse({ contactSourceText: 'x'.repeat(256) }).success).toBe(false);
  });
});
