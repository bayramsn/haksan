import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const uploads: Array<{ bucket: string; objectKey: string }> = [];
vi.mock('../src/shared/storage/s3-storage.provider', () => ({
  S3StorageProvider: class { providerCode = 'test'; async getFileMetadata() { return null; } async uploadFile(input: { bucket: string; objectKey: string }) { uploads.push(input); } },
}));
const { storeSeriesImage } = await import('../src/db/import-hexlaser-2026');

function fakeDb() {
  const inserted: Array<Record<string, unknown>> = [];
  const db = {
    query: { storageProviders: { findFirst: async () => ({ id: 'provider' }) } },
    insert: () => ({ values: (row: Record<string, unknown>) => ({ returning: async () => { const saved = { id: `row-${inserted.length}`, ...row }; inserted.push(saved); return [saved]; } }) }),
  };
  return { db: db as never, inserted };
}
const manifest = JSON.parse(readFileSync(path.join(__dirname, '../src/db/seed/data/hexlaser-2026/images.json'), 'utf8'));
const image = manifest.images.find((row: { series: string }) => row.series === 'F');

describe('HEX series image storage', () => {
  it('uploads the bundled image to the product bucket and links it as public product media', async () => {
    const { db, inserted } = fakeDb(); const captured: string[] = [];
    const fileId = await storeSeriesImage(db, 'tenant', 'user', 'product', 'F', image, (table) => captured.push(table));
    expect(uploads.at(-1)).toMatchObject({ bucket: 'erp-product-images', objectKey: 'tenant/product/product/hex2026-F.webp' });
    expect(inserted[0]).toMatchObject({ bucket: 'erp-product-images', visibility: 'public', uploadStatus: 'linked', mimeType: 'image/webp', sha256: image.sha256 });
    expect(inserted[1]).toMatchObject({ productModelId: 'product', fileId, mediaType: 'image' });
    expect(captured).toEqual(['files', 'media']);
  });
  it('refuses a bundled image whose checksum changed', async () => {
    await expect(storeSeriesImage(fakeDb().db, 't', 'u', 'p', 'F', { ...image, sha256: '0'.repeat(64) }, () => undefined)).rejects.toThrow('bütünlük');
  });
});
