import { and, eq, ilike, isNull, ne, or } from 'drizzle-orm';
import type { DbClient } from '../client';
import { schema } from '../client';

const MODEL_CODE = 'MMT-1170';
const PRODUCT_NAME = 'MMT-1170 CNC Dik İşleme Merkezi';

export async function up(db: DbClient): Promise<void> {
  const tenant = await db.query.tenants.findFirst({
    where: and(
      eq(schema.tenants.slug, 'haksan'),
      eq(schema.tenants.isActive, true),
      isNull(schema.tenants.deletedAt),
    ),
  });
  if (!tenant) {
    console.log('[data-migrate] 022_normalize_haxan_mmt_1170: haksan tenant bulunamadı; atlandı.');
    return;
  }

  const brand = await db.query.brands.findFirst({
    where: and(
      eq(schema.brands.tenantId, tenant.id),
      eq(schema.brands.name, 'HAXAN'),
      isNull(schema.brands.deletedAt),
    ),
  });
  if (!brand) {
    console.log('[data-migrate] 022_normalize_haxan_mmt_1170: HAXAN markası bulunamadı; atlandı.');
    return;
  }

  const candidates = await db.query.productModels.findMany({
    where: and(
      eq(schema.productModels.tenantId, tenant.id),
      eq(schema.productModels.brandId, brand.id),
      isNull(schema.productModels.deletedAt),
      or(
        ilike(schema.productModels.modelCode, '%MMT-1170%'),
        ilike(schema.productModels.modelName, '%MMT-1170%'),
        ilike(schema.productModels.fullName, '%MMT-1170%'),
        ilike(schema.productModels.stockCode, '%MMT-1170%'),
      ),
    ),
  });
  if (candidates.length === 0) {
    console.log('[data-migrate] 022_normalize_haxan_mmt_1170: ürün bulunamadı; atlandı.');
    return;
  }
  if (candidates.length > 1) {
    throw new Error('Birden fazla etkin HAXAN MMT-1170 ürünü bulundu; otomatik normalizasyon güvenli değil.');
  }

  const product = candidates[0];
  const collision = await db.query.productModels.findFirst({
    where: and(
      eq(schema.productModels.tenantId, tenant.id),
      eq(schema.productModels.modelCode, MODEL_CODE),
      ne(schema.productModels.id, product.id),
    ),
  });
  if (collision) {
    throw new Error('MMT-1170 model kodu başka bir ürün tarafından kullanılıyor; otomatik normalizasyon güvenli değil.');
  }

  await db
    .update(schema.productModels)
    .set({
      modelCode: MODEL_CODE,
      modelName: PRODUCT_NAME,
      fullName: PRODUCT_NAME,
      stockCode: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.productModels.id, product.id));
  console.log(`[data-migrate] 022_normalize_haxan_mmt_1170: ${product.id} güncellendi.`);
}
