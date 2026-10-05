import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { closeDb, getDb } from '../../db/client';
import { files, fileLinks, tradeFairContacts } from '../../db/schema';
import { loadEnv } from '../../config/env';
import { S3StorageProvider } from './s3-storage.provider';
import { SupabaseStorageProvider } from './supabase-storage.provider';

async function verify() {
  const env = loadEnv();
  const provider = env.S3_PROVIDER === 'supabase' ? new SupabaseStorageProvider() : new S3StorageProvider();
  const photos = await getDb().select({ bucket: files.bucket, objectKey: files.objectKey })
    .from(files).innerJoin(fileLinks, eq(fileLinks.fileId, files.id))
    .innerJoin(tradeFairContacts, eq(tradeFairContacts.id, fileLinks.entityId))
    .where(and(eq(fileLinks.entityType, 'trade_fair_contact'), eq(files.tenantId, fileLinks.tenantId),
      eq(files.tenantId, tradeFairContacts.tenantId), eq(files.uploadStatus, 'linked'),
      isNull(files.deletedAt), isNull(tradeFairContacts.deletedAt), inArray(files.mimeType, ['image/jpeg', 'image/png', 'image/webp'])))
    .orderBy(desc(files.createdAt)).limit(3);
  for (const photo of photos) {
    const content = await provider.getObject(photo.bucket, photo.objectKey);
    if (!content?.length) throw new Error('Fuar photo storage read failed');
  }
  const signedOrigin = photos.length ? new URL(await provider.getSignedDownloadUrl(photos[0])).origin : 'none';
  console.log(`FAIR_PHOTO_STORAGE_VERIFIED count=${photos.length} provider=${env.S3_PROVIDER} signed_origin=${signedOrigin}`);
}

verify().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeDb);
