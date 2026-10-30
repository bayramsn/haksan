import { Injectable } from '@nestjs/common';
import { SignatureMediaService } from '../signatures/signature-media.service';
import { ProductMediaService } from '../products/product-media.service';
import { BrandMediaService } from '../products/brand-media.service';

/** Resolve only known public media services; never fetch a URL supplied in a snapshot. */
@Injectable()
export class CommercialPdfMediaService {
  constructor(private readonly signatures: SignatureMediaService, private readonly products: ProductMediaService, private readonly brands: BrandMediaService) {}

  async embed(snapshot: Record<string, any>, tenantId?: string): Promise<Record<string, any>> {
    const cache = new Map<string, Promise<string | undefined>>();
    const productUrls = new Map<string, Promise<string | null>>();
    const uuid = (input: unknown): input is string => typeof input === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
    const mediaId = (input: unknown): string | undefined => {
      if (typeof input !== 'string') return undefined;
      const text = input.trim();
      if (!text.startsWith('/') && !/^https?:\/\//i.test(text)) return undefined;
      if (text.startsWith('//') || /[\\\u0000-\u0020]/.test(text)) return undefined;
      try {
        const parsed = new URL(text, 'https://snapshot.invalid');
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return undefined;
        // URL is parsed only to recover a known file ID: its origin is never fetched.
        return /^\/(?:api\/v1\/)?products\/media\/([0-9a-f-]{36})$/i.exec(parsed.pathname)?.[1];
      } catch { return undefined; }
    };
    const image = (kind: 'signature' | 'product' | 'brand', fileId: unknown): Promise<string | undefined> => {
      if (!uuid(fileId)) return Promise.resolve(undefined);
      const key = `${kind}:${fileId}`;
      if (!cache.has(key)) cache.set(key, (async () => {
        const media = kind === 'signature' ? await this.signatures.resolvePublicSignature(fileId)
          : kind === 'brand' ? await this.brands.resolvePublicLogo(fileId) : await this.products.resolvePublicMedia(fileId);
        if (!media || !['image/png', 'image/jpeg', 'image/webp'].includes(media.mimeType) || media.body.length > 5 * 1024 * 1024) return undefined;
        return `data:${media.mimeType};base64,${media.body.toString('base64')}`;
      })());
      return cache.get(key)!;
    };
    const signature = snapshot.signature ? { ...snapshot.signature, imageDataUrl: await image('signature', snapshot.signature.fileId) } : snapshot.signature;
    const items = await Promise.all((Array.isArray(snapshot.items) ? snapshot.items : []).map(async (item: Record<string, any>) => {
      const product = item.product && typeof item.product === 'object' ? item.product : {};
      let imageUrl = product.imageUrl;
      // Legacy snapshots omitted images. Resolve only missing images, through a
      // tenant-scoped active-product lookup; persisted commercial fields stay frozen.
      const productId = item.productModelId ?? product.id;
      if ((imageUrl == null || imageUrl === '') && tenantId && uuid(productId)) {
        if (!productUrls.has(productId)) productUrls.set(productId, this.products.resolveSnapshotImageUrl(productId, tenantId));
        imageUrl = await productUrls.get(productId);
      }
      if (!item.product && !imageUrl) return { ...item };
      return { ...item, product: { ...product, ...(imageUrl ? { imageUrl } : {}), imageDataUrl: await image('product', mediaId(imageUrl)), brandLogoDataUrl: await image('brand', product.brandLogoFileId) } };
    }));
    return { ...snapshot, signature, items };
  }
}
