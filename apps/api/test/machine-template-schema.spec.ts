import { describe, expect, it } from 'vitest';
import { machineTemplateCreateSchema } from '@haksan/shared';

const divisionId = '11111111-1111-4111-8111-111111111111';
const subcategoryId = '22222222-2222-4222-8222-222222222222';

describe('machineTemplateCreateSchema', () => {
  it('boş ve kopyalanmış başlangıç şablonlarını doğrular', () => {
    expect(
      machineTemplateCreateSchema.safeParse({
        name: 'CNC Portal Freze',
        code: 'CNC_PORTAL_FREZE',
        divisionId,
        subcategoryId,
        fields: [],
      }).success,
    ).toBe(true);

    expect(
      machineTemplateCreateSchema.safeParse({
        name: 'CNC Portal Freze',
        code: 'CNC_PORTAL_FREZE',
        divisionId,
        subcategoryId,
        fields: [
          { specKey: 'X Ekseni Hareketi', specGroupCode: 'EKSENLER', specUnit: 'mm' },
        ],
      }).success,
    ).toBe(true);
  });

  it('aynı teknik alanı iki kez kabul etmez', () => {
    const parsed = machineTemplateCreateSchema.safeParse({
      name: 'CNC Portal Freze',
      code: 'CNC_PORTAL_FREZE',
      divisionId,
      subcategoryId,
      fields: [
        { specKey: 'Fener Mili Devri' },
        { specKey: 'fener mili devri' },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('geçersiz bölüm ve alt kategori kimliklerini reddeder', () => {
    expect(
      machineTemplateCreateSchema.safeParse({
        name: 'CNC Portal Freze',
        code: 'CNC_PORTAL_FREZE',
        divisionId: 'not-a-uuid',
        subcategoryId,
      }).success,
    ).toBe(false);
  });
});
