import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dataDir = path.join(process.cwd(), 'src', 'db', 'seed', 'data', 'haksancnc');

describe('HAXAN MMT-1170 catalogue source', () => {
  const products = JSON.parse(readFileSync(path.join(dataDir, 'products.json'), 'utf8')) as Array<Record<string, unknown>>;
  const equipment = JSON.parse(readFileSync(path.join(dataDir, 'equipment.json'), 'utf8')) as Record<
    string,
    { standard?: string[]; optional?: string[] }
  >;
  const product = products.find((item) => item.id === 'haksan-cnc-mmt-1170');

  it('contains only the requested document content plus catalogue classification', () => {
    expect(product).toBeTruthy();
    expect(product).toMatchObject({
      brand: 'HAXAN',
      model: 'MMT-1170',
      modelName: 'MMT-1170 CNC Dik İşleme Merkezi',
      imageUrl: 'images/haksan-cnc-mmt-1170.jpg',
    });
    expect(product).not.toHaveProperty('listPrice');
    expect(product).not.toHaveProperty('cashPrice');
    expect(product).not.toHaveProperty('description');
    expect(product).not.toHaveProperty('optionalEquipment');
    expect(product).not.toHaveProperty('pdfUrl');
  });

  it('keeps every technical row and standard-equipment item from the document', () => {
    expect(product?.specs).toHaveLength(34);
    expect(equipment['haksan-cnc-mmt-1170']?.standard).toHaveLength(29);
    expect(equipment['haksan-cnc-mmt-1170']?.optional).toEqual([]);
  });

  it('includes the extracted primary product photograph', () => {
    expect(existsSync(path.join(dataDir, 'images', 'haksan-cnc-mmt-1170.jpg'))).toBe(true);
  });

  it('keeps the production normalization migration registered after the original product seed', () => {
    const registry = readFileSync(path.join(process.cwd(), 'src', 'db', 'data-migrations', 'index.ts'), 'utf8');
    const migration = readFileSync(
      path.join(process.cwd(), 'src', 'db', 'data-migrations', '022_normalize_haxan_mmt_1170.ts'),
      'utf8',
    );

    expect(registry.indexOf('021_create_haxan_mmt_1170')).toBeLessThan(
      registry.indexOf('022_normalize_haxan_mmt_1170'),
    );
    expect(migration).toContain("const MODEL_CODE = 'MMT-1170'");
    expect(migration).toContain('stockCode: null');
  });
});
