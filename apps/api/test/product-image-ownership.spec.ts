import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq, isNull, ne } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './setup';
import { getDb } from '../src/db/client';
import { files, productModels, users } from '../src/db/schema';

/**
 * Görseli başka kullanıcının yüklediği üründe, görsel değişmeden diğer alanlar
 * kaydedilebilmeli; başkasının dosyasını yeni görsel olarak bağlamak ise reddedilmeli.
 */
describe('Product image ownership on update', () => {
  let app: NestFastifyApplication;
  let token = '';
  let productId = '';
  let originalImageUrl: string | null = null;
  const fileIds: string[] = [];
  const api = () => request(app.getHttpServer());

  const insertForeignImage = async (tenantId: string, uploaderId: string) => {
    const [file] = await getDb().insert(files).values({
      tenantId,
      bucket: 'erp-product-images',
      objectKey: `test/product-image-ownership/${Date.now()}-${fileIds.length}.png`,
      originalFilename: 'urun.png',
      mimeType: 'image/png',
      extension: 'png',
      sizeBytes: 68,
      visibility: 'public',
      uploadedBy: uploaderId,
      uploadStatus: 'uploaded',
      uploadedAt: new Date(),
    }).returning({ id: files.id });
    fileIds.push(file.id);
    return `/api/v1/products/media/${file.id}`;
  };

  beforeAll(async () => {
    app = await createTestApp();
    token = (await api().post('/api/v1/auth/login').send({ email: 'superadmin@haksan.local', password: 'superadmin12345' }).expect(201)).body.accessToken;
  });

  afterAll(async () => {
    const db = getDb();
    if (productId) await db.update(productModels).set({ imageUrl: originalImageUrl }).where(eq(productModels.id, productId));
    for (const id of fileIds) await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, id));
    await app.close();
  });

  it('saves other fields when the image is unchanged, rejects a new foreign image', async () => {
    const db = getDb();
    const superadmin = await db.query.users.findFirst({ where: eq(users.email, 'superadmin@haksan.local') });
    const uploader = await db.query.users.findFirst({ where: and(eq(users.tenantId, superadmin!.tenantId), ne(users.id, superadmin!.id)) });
    const product = await db.query.productModels.findFirst({ where: and(eq(productModels.tenantId, superadmin!.tenantId), isNull(productModels.deletedAt)) });
    expect(uploader && product).toBeTruthy();
    productId = product!.id;
    originalImageUrl = product!.imageUrl;

    const existingImage = await insertForeignImage(superadmin!.tenantId, uploader!.id);
    await db.update(productModels).set({ imageUrl: existingImage }).where(eq(productModels.id, productId));

    await api().patch(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${token}`)
      .send({ imageUrl: existingImage, description: 'görsel değişmeden güncellendi' })
      .expect(200);

    const newImage = await insertForeignImage(superadmin!.tenantId, uploader!.id);
    const rejected = await api().patch(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${token}`)
      .send({ imageUrl: newImage });
    expect(rejected.status).toBe(422);
  });
});
