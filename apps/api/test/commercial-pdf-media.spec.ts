import { describe, expect, it, vi } from 'vitest';
import { CommercialPdfMediaService } from '../src/modules/quotes/commercial-pdf-media.service';

const productId = '11111111-1111-4111-8111-111111111111';
const fileId = '22222222-2222-4222-8222-222222222222';
const tenantId = '33333333-3333-4333-8333-333333333333';
function setup() {
  const image = { body: Buffer.from('photo'), mimeType: 'image/jpeg' };
  const products = { resolveSnapshotImageUrl: vi.fn().mockResolvedValue(`/products/media/${fileId}`), resolvePublicMedia: vi.fn().mockResolvedValue(image) };
  const signatures = { resolvePublicSignature: vi.fn().mockResolvedValue(null) };
  const brands = { resolvePublicLogo: vi.fn().mockResolvedValue(null) };
  return { service: new CommercialPdfMediaService(signatures as never, products as never, brands as never), products };
}

describe('commercial PDF photo resolution', () => {
  it('recovers missing legacy images through the tenant-scoped product lookup without mutating snapshots', async () => {
    const { service, products } = setup();
    const snapshot = { items: [{ productModelId: productId, quantity: 2, product: { fullName: 'Frozen name' } }] };
    const result = await service.embed(snapshot, tenantId);
    expect(products.resolveSnapshotImageUrl).toHaveBeenCalledWith(productId, tenantId);
    expect(result.items[0]).toMatchObject({ quantity: 2, product: { fullName: 'Frozen name', imageUrl: `/products/media/${fileId}`, imageDataUrl: 'data:image/jpeg;base64,cGhvdG8=' } });
    expect(snapshot.items[0].product).toEqual({ fullName: 'Frozen name' });
    expect(result.items[0]).not.toBe(snapshot.items[0]);
  });

  it('supports a missing product object and the product.id fallback', async () => {
    const { service, products } = setup();
    const result = await service.embed({ items: [{ productModelId: productId, description: 'Machine' }, { product: { id: productId } }] }, tenantId);
    expect(result.items[0].product.imageDataUrl).toBe('data:image/jpeg;base64,cGhvdG8=');
    expect(result.items[0].description).toBe('Machine');
    expect(products.resolveSnapshotImageUrl).toHaveBeenCalledTimes(1);
    expect(products.resolvePublicMedia).toHaveBeenCalledTimes(1);
  });

  it('never looks up a missing image without a tenant or with an invalid product ID', async () => {
    const { service, products } = setup();
    await service.embed({ items: [{ productModelId: productId }] });
    await service.embed({ items: [{ productModelId: '../private' }, { product: {} }] }, tenantId);
    expect(products.resolveSnapshotImageUrl).not.toHaveBeenCalled();
    expect(products.resolvePublicMedia).not.toHaveBeenCalled();
  });

  it('preserves a stored image instead of replacing it with the current catalog image', async () => {
    const { service, products } = setup();
    const imageUrl = `/api/v1/products/media/${fileId}?download=1#photo`;
    const result = await service.embed({ items: [{ productModelId: productId, product: { imageUrl } }] }, tenantId);
    expect(products.resolveSnapshotImageUrl).not.toHaveBeenCalled();
    expect(products.resolvePublicMedia).toHaveBeenCalledWith(fileId);
    expect(result.items[0].product.imageUrl).toBe(imageUrl);
  });

  it('extracts only file IDs from HTTP(S) media URLs and never fetches their origins', async () => {
    const { service, products } = setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    try {
      const result = await service.embed({ items: [{ product: { imageUrl: `https://crm.example/api/v1/products/media/${fileId}?x=1` } }, { product: { imageUrl: `http://127.0.0.1/products/media/${fileId}` } }] });
      expect(result.items[0].product.imageDataUrl).toBe('data:image/jpeg;base64,cGhvdG8=');
      expect(products.resolvePublicMedia).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });

  it.each(['file:///etc/passwd', 'http://169.254.169.254/latest/meta-data/', `//evil.test/products/media/${fileId}`, `https://user:pass@evil.test/products/media/${fileId}`, `/files/${fileId}`, `/products/media/not-a-uuid`, `javascript:/products/media/${fileId}`])('rejects unsupported image reference %s', async (imageUrl) => {
    const { service, products } = setup();
    const result = await service.embed({ items: [{ product: { imageUrl } }] }, tenantId);
    expect(result.items[0].product.imageDataUrl).toBeUndefined();
    expect(products.resolvePublicMedia).not.toHaveBeenCalled();
  });

  it('leaves unavailable photos blank and propagates storage failures', async () => {
    const { service, products } = setup();
    products.resolveSnapshotImageUrl.mockResolvedValueOnce(null);
    expect((await service.embed({ items: [{ productModelId: productId }] }, tenantId)).items[0].product).toBeUndefined();
    products.resolvePublicMedia.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(service.embed({ items: [{ product: { imageUrl: `/products/media/${fileId}` } }] })).rejects.toThrow('Storage unavailable');
  });
});
