/**
 * Import Haksan CNC catalogue (scraped from haksancnc.com.tr) into the DB and
 * object storage.
 *
 *   - Product models + specs land in Postgres (so they show up in the catalogue
 *     exactly like any other product, behind the normal auth/permission layer).
 *   - Photos and brochure PDFs are uploaded to MinIO/S3 as blobs, registered in
 *     `files` (visibility = 'public'), and linked via `product_media` (images)
 *     and `file_links` (brochures). They are served by the public media
 *     endpoint, which only ever streams files flagged public AND product-linked.
 *
 * Security notes:
 *   - Every binary is validated by magic bytes (file-type) before upload and
 *     checked against the shared MIME allow-list. SHA-256 is stored.
 *   - Object keys are tenant-scoped and built from a UUID + sanitized filename,
 *     never from remote/user input.
 *   - Idempotent: re-running skips products/media that already exist.
 *
 * Run: npm --workspace @haksan/api run db:import:haksancnc
 */
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { and, eq, isNull } from 'drizzle-orm';
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
import { ALLOWED_MIME_TYPES, ALLOWED_FILE_EXTENSIONS } from '@haksan/shared';
import { getDb, schema, closeDb } from '../client';
import { S3StorageProvider } from '../../shared/storage/s3-storage.provider';
import { buildObjectKey, sanitizeFilename } from '../../shared/storage/object-key';
import { loadEnv } from '../../config/env';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fileType = require('file-type') as {
  fromBuffer(buf: Buffer): Promise<{ ext: string; mime: string } | undefined>;
};

const dataDir = path.join(path.dirname(__filename), 'data', 'haksancnc');
const IMAGE_BUCKET = 'erp-product-images';
const DOC_BUCKET = 'erp-product-documents';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;

interface ManifestProduct {
  id: string;
  brand: string;
  model: string;
  modelName: string;
  productGroupCode: string;
  categoryCode: string;
  subcategoryCode: string;
  productTypeCode: string;
  currency: string;
  vatRate: number;
  stockCode: string;
  description: string;
  shortDescription: string;
  imageUrl?: string;
  pdfUrl?: string;
  specs: Array<{ key: string; value: string }>;
}

const env = loadEnv();

async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (err: any) {
    const code = err?.name ?? err?.Code;
    if (code === 'BucketAlreadyOwnedByYou' || code === 'BucketAlreadyExists') return;
    throw err;
  }
}

async function validateBlob(
  buf: Buffer,
  expectedKind: 'image' | 'pdf'
): Promise<{ mime: string; ext: string }> {
  const detected = await fileType.fromBuffer(buf);
  if (!detected) throw new Error('magic-byte tespiti başarısız');
  if (!ALLOWED_MIME_TYPES.includes(detected.mime as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw new Error(`izin verilmeyen MIME: ${detected.mime}`);
  }
  const ext = detected.ext === 'jpg' ? 'jpg' : detected.ext;
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext as (typeof ALLOWED_FILE_EXTENSIONS)[number])) {
    throw new Error(`izin verilmeyen uzantı: ${ext}`);
  }
  if (expectedKind === 'image' && !detected.mime.startsWith('image/')) {
    throw new Error(`görsel beklenirken ${detected.mime} bulundu`);
  }
  if (expectedKind === 'pdf' && detected.mime !== 'application/pdf') {
    throw new Error(`pdf beklenirken ${detected.mime} bulundu`);
  }
  return { mime: detected.mime, ext };
}

export async function importHaksanCnc(): Promise<void> {
  const db = getDb();
  const storage = new S3StorageProvider();
  const s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });

  await ensureBucket(s3, IMAGE_BUCKET);
  await ensureBucket(s3, DOC_BUCKET);

  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, 'haksan') });
  if (!tenant) throw new Error('Tenant (slug=haksan) bulunamadı. Önce db:seed çalıştırın.');
  const tenantId = tenant.id;

  const adminUser = await db.query.users.findFirst({
    where: and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, 'admin@haksan.local')),
  });
  const uploadedBy = adminUser?.id ?? null;

  const provider = await db.query.storageProviders.findFirst({ where: eq(schema.storageProviders.code, 'minio') });
  const storageProviderId = provider?.id ?? null;

  // Lookups shared across all rows.
  const [cncGroup, tezgahCat, genelSpecGroup] = await Promise.all([
    db.query.productGroups.findFirst({ where: eq(schema.productGroups.code, 'CNC') }),
    db.query.productCategories.findFirst({ where: eq(schema.productCategories.code, 'TEZGAH') }),
    db.query.productSpecGroups.findFirst({ where: eq(schema.productSpecGroups.code, 'GENEL') }),
  ]);

  // Ensure a document type for product brochures exists (global lookup).
  await db
    .insert(schema.fileDocumentTypes)
    .values({ code: 'product_brochure', name: 'Ürün Broşürü', sortOrder: 15 })
    .onConflictDoNothing({ target: schema.fileDocumentTypes.code });
  const brochureType = await db.query.fileDocumentTypes.findFirst({
    where: eq(schema.fileDocumentTypes.code, 'product_brochure'),
  });

  const manifest: ManifestProduct[] = JSON.parse(await readFile(path.join(dataDir, 'products.json'), 'utf8'));
  const imageFiles = new Set(await readdir(path.join(dataDir, 'images')).catch(() => []));
  const pdfFiles = new Set(await readdir(path.join(dataDir, 'pdfs')).catch(() => []));

  // Equipment lists extracted from the brochures (scripts/extract-haksancnc-equipment.py).
  type EquipmentEntry = { standard?: string[]; optional?: string[] };
  const equipmentByStem: Record<string, EquipmentEntry> = await readFile(
    path.join(dataDir, 'equipment.json'),
    'utf8'
  )
    .then((s) => JSON.parse(s))
    .catch(() => ({}));
  const [standartType, opsiyonelType] = await Promise.all([
    db.query.equipmentTypes.findFirst({ where: eq(schema.equipmentTypes.code, 'standart') }),
    db.query.equipmentTypes.findFirst({ where: eq(schema.equipmentTypes.code, 'opsiyonel') }),
  ]);

  const brandCache = new Map<string, string>();
  const subcatCache = new Map<string, string | null>();
  const typeCache = new Map<string, string | null>();
  const currencyCache = new Map<string, string | null>();

  const resolveSubcat = async (code: string): Promise<string | null> => {
    if (!code) return null;
    if (subcatCache.has(code)) return subcatCache.get(code)!;
    const row = await db.query.productSubcategories.findFirst({ where: eq(schema.productSubcategories.code, code) });
    subcatCache.set(code, row?.id ?? null);
    return row?.id ?? null;
  };
  const resolveType = async (code: string): Promise<string | null> => {
    if (!code) return null;
    if (typeCache.has(code)) return typeCache.get(code)!;
    const row = await db.query.productTypes.findFirst({ where: eq(schema.productTypes.code, code) });
    typeCache.set(code, row?.id ?? null);
    return row?.id ?? null;
  };
  const resolveCurrency = async (code: string): Promise<string | null> => {
    const c = code || 'USD';
    if (currencyCache.has(c)) return currencyCache.get(c)!;
    const row = await db.query.currencies.findFirst({ where: eq(schema.currencies.code, c) });
    currencyCache.set(c, row?.id ?? null);
    return row?.id ?? null;
  };

  const getOrCreateBrand = async (name: string): Promise<string> => {
    const key = name || 'Haksan CNC';
    if (brandCache.has(key)) return brandCache.get(key)!;
    const existing = await db.query.brands.findFirst({
      where: and(eq(schema.brands.tenantId, tenantId), eq(schema.brands.name, key)),
    });
    if (existing) {
      brandCache.set(key, existing.id);
      return existing.id;
    }
    const [created] = await db.insert(schema.brands).values({ tenantId, name: key }).returning();
    brandCache.set(key, created.id);
    return created.id;
  };

  const uploadBlob = async (
    buf: Buffer,
    kind: 'image' | 'pdf',
    productId: string,
    originalFilename: string
  ): Promise<string> => {
    const { mime, ext } = await validateBlob(buf, kind);
    const bucket = kind === 'image' ? IMAGE_BUCKET : DOC_BUCKET;
    const objectKey = buildObjectKey({
      tenantId,
      entityType: 'product',
      entityId: productId,
      filename: sanitizeFilename(originalFilename),
    });
    await storage.uploadFile({ bucket, objectKey, body: buf, mimeType: mime, contentLength: buf.byteLength });
    const [file] = await db
      .insert(schema.files)
      .values({
        tenantId,
        bucket,
        objectKey,
        originalFilename: sanitizeFilename(originalFilename),
        mimeType: mime,
        extension: ext,
        sizeBytes: buf.byteLength,
        sha256: createHash('sha256').update(buf).digest('hex'),
        storageProviderId,
        visibility: 'public',
        uploadedBy,
      })
      .returning();
    return file.id;
  };

  let created = 0;
  let updated = 0;
  let images = 0;
  let pdfs = 0;
  let skippedMedia = 0;
  let equipItems = 0;

  for (const p of manifest) {
    const modelCode = p.model || p.modelName;
    if (!modelCode) continue;

    const [brandId, subId, typeId, currencyId] = await Promise.all([
      getOrCreateBrand(p.brand),
      resolveSubcat(p.subcategoryCode),
      resolveType(p.productTypeCode),
      resolveCurrency(p.currency),
    ]);

    let product = await db.query.productModels.findFirst({
      where: and(eq(schema.productModels.tenantId, tenantId), eq(schema.productModels.modelCode, modelCode)),
    });

    if (!product) {
      const [row] = await db
        .insert(schema.productModels)
        .values({
          tenantId,
          brandId,
          productGroupId: cncGroup?.id,
          categoryId: tezgahCat?.id,
          subcategoryId: subId,
          productTypeId: typeId,
          modelCode,
          modelName: p.modelName,
          fullName: p.modelName || modelCode,
          currencyId,
          vatRate: String(p.vatRate ?? 20),
          stockCode: p.stockCode || null,
          description: p.description || p.shortDescription || null,
        })
        .returning();
      product = row;
      created += 1;

      // Specs only on freshly-created products (idempotent).
      if (p.specs?.length) {
        await db.insert(schema.productSpecs).values(
          p.specs.map((s, i) => ({
            tenantId,
            productModelId: row.id,
            specGroupId: genelSpecGroup?.id,
            specKey: s.key.slice(0, 255),
            specValue: s.value,
            sortOrder: i,
          }))
        );
      }
    } else {
      updated += 1;
    }

    const productId = product.id;

    // ── Image blob ── (match any staged extension: jpg/png/webp)
    const imageName = [...imageFiles].find((f) => f.startsWith(`${p.id}.`));
    if (imageName) {
      const existingMedia = await db.query.productMedia.findFirst({
        where: eq(schema.productMedia.productModelId, productId),
      });
      if (existingMedia) {
        skippedMedia += 1;
      } else {
        try {
          const buf = await readFile(path.join(dataDir, 'images', imageName));
          if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error('görsel çok büyük');
          const fileId = await uploadBlob(buf, 'image', productId, imageName);
          await db.insert(schema.productMedia).values({
            tenantId,
            productModelId: productId,
            fileId,
            mediaType: 'image',
            title: p.modelName,
            sortOrder: 0,
          });
          await db
            .update(schema.productModels)
            .set({ imageUrl: `/products/media/${fileId}` })
            .where(eq(schema.productModels.id, productId));
          images += 1;
        } catch (err: any) {
          console.warn(`[haksancnc] görsel atlandı ${imageName}: ${err?.message ?? err}`);
        }
      }
    }

    // ── Brochure PDF blob ──
    const pdfName = `${p.id}.pdf`;
    if (pdfFiles.has(pdfName)) {
      const existingDoc = await db.query.fileLinks.findFirst({
        where: and(
          eq(schema.fileLinks.entityType, 'product_model'),
          eq(schema.fileLinks.entityId, productId)
        ),
      });
      if (existingDoc) {
        skippedMedia += 1;
      } else {
        try {
          const buf = await readFile(path.join(dataDir, 'pdfs', pdfName));
          if (buf.byteLength > MAX_PDF_BYTES) throw new Error('pdf çok büyük');
          const fileId = await uploadBlob(buf, 'pdf', productId, `${sanitizeFilename(modelCode)}-brosur.pdf`);
          await db.insert(schema.fileLinks).values({
            tenantId,
            fileId,
            entityType: 'product_model',
            entityId: productId,
            documentTypeId: brochureType?.id ?? null,
            description: `${p.modelName} ürün broşürü`,
          });
          pdfs += 1;
        } catch (err: any) {
          console.warn(`[haksancnc] pdf atlandı ${pdfName}: ${err?.message ?? err}`);
        }
      }
    }

    // ── Equipment (from brochures) ──
    // Insert per type only when the product has none of that type yet, so the
    // demo products' hand-seeded (priced) optional equipment is never touched.
    const equip = equipmentByStem[p.id];
    if (equip) {
      const insertEquip = async (titles: string[] | undefined, typeId: string | undefined) => {
        if (!titles?.length || !typeId) return;
        const existing = await db.query.productEquipmentItems.findFirst({
          where: and(
            eq(schema.productEquipmentItems.productModelId, productId),
            eq(schema.productEquipmentItems.equipmentTypeId, typeId)
          ),
        });
        if (existing) return;
        const rows = titles
          .map((t) => t.trim())
          .filter((t) => t.length >= 3 && t.length <= 255)
          .map((title, i) => ({
            tenantId,
            productModelId: productId,
            equipmentTypeId: typeId,
            title,
            isPromotion: false,
            sortOrder: i,
          }));
        if (rows.length) {
          await db.insert(schema.productEquipmentItems).values(rows);
          equipItems += rows.length;
        }
      };
      await insertEquip(equip.standard, standartType?.id);
      await insertEquip(equip.optional, opsiyonelType?.id);
    }
  }

  console.log(
    `[haksancnc] tamamlandı — ürün: ${created} yeni / ${updated} mevcut, görsel: ${images}, pdf: ${pdfs}, donanım kalemi: ${equipItems}, atlanan medya: ${skippedMedia}`
  );
}

const isDirectRun = process.argv[1] && __filename === path.resolve(process.argv[1]);
if (isDirectRun) {
  importHaksanCnc()
    .then(() => closeDb())
    .then(() => {
      console.log('[haksancnc] kapatıldı.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[haksancnc] hata:', err);
      process.exit(1);
    });
}
