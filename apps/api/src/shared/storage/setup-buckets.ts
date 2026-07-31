/**
 * Storage bootstrap for S3-compatible providers (MinIO / AWS S3 / Cloudflare R2).
 *
 * Browser-direct presigned PUT uploads only work if the target bucket:
 *   1. exists, and
 *   2. has a CORS policy that allows PUT/GET/HEAD from the web origin.
 *
 * Locally MinIO gets its buckets from docker-compose (minio-init) and is CORS-open
 * by default. For S3/R2 there is no such bootstrap — without CORS the browser
 * fetch() PUT fails with a CORS error even though the signed URL is valid.
 *
 * Run after configuring real S3_* credentials:
 *   npm --workspace apps/api run storage:setup
 *
 * Idempotent: existing buckets are left in place; the CORS policy is (re)applied
 * to every bucket every run.
 */
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { loadEnv } from '../../config/env';
import { logger } from '../utils/logger';
import { buildS3ClientConfig } from './s3-client-config';

/** Canonical bucket set used across the app (mirrors docker-compose minio-init). */
const BUCKETS = [
  'erp-product-images',
  'erp-company-logos',
  'erp-brand-logos',
  'erp-product-documents',
  'erp-quote-documents',
  'erp-proforma-documents',
  'erp-contract-documents',
  'erp-invoice-documents',
  'erp-stock-documents',
  'erp-service-documents',
  'erp-import-raw',
];

async function setup(): Promise<void> {
  const env = loadEnv();

  if (env.S3_PROVIDER === 'supabase') {
    logger.warn('[storage:setup] S3_PROVIDER=supabase — bucket/CORS yönetimi Supabase panelinden yapılır, atlanıyor.');
    return;
  }

  const client = new S3Client(buildS3ClientConfig(env));
  const targetBuckets = env.S3_PROVIDER === 's3' ? [env.S3_BUCKET_NAME!] : BUCKETS;

  // Browser-direct upload needs PUT; downloads/thumbnails need GET/HEAD.
  const corsRules = [
    {
      AllowedOrigins: env.CORS_ORIGINS,
      AllowedMethods: ['GET', 'PUT', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    },
  ];

  logger.info(
    { provider: env.S3_PROVIDER, endpoint: env.S3_ENDPOINT, origins: env.CORS_ORIGINS, buckets: targetBuckets.length },
    '[storage:setup] başlıyor'
  );

  let created = 0;
  let verified = 0;
  let corsApplied = 0;
  const failures: string[] = [];

  for (const Bucket of targetBuckets) {
    // AWS production bucket security/CORS is infrastructure configuration and
    // must not require bucket-admin permissions on the application role.
    if (env.S3_PROVIDER === 's3') {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
        verified += 1;
        logger.info({ Bucket }, '[storage:setup] AWS bucket doğrulandı; yönetim ayarları değiştirilmedi');
      } catch (err: any) {
        failures.push(`${Bucket}: ${err?.message ?? 'bucket erişim hatası'}`);
        logger.error({ Bucket, err: err?.message }, '[storage:setup] AWS bucket doğrulanamadı');
      }
      continue;
    }

    // 1) Ensure the bucket exists.
    let exists = false;
    try {
      await client.send(new HeadBucketCommand({ Bucket }));
      exists = true;
    } catch {
      exists = false;
    }
    if (!exists) {
      try {
        await client.send(new CreateBucketCommand({ Bucket }));
        created += 1;
        logger.info({ Bucket }, '[storage:setup] bucket oluşturuldu');
      } catch (err: any) {
        // R2/S3 may require bucket creation via dashboard/wrangler; CORS still
        // applies if it already exists, so don't abort the whole run.
        logger.warn({ Bucket, err: err?.message }, '[storage:setup] bucket oluşturulamadı (zaten var olabilir)');
      }
    }

    // 2) (Re)apply the CORS policy.
    try {
      await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: corsRules } }));
      corsApplied += 1;
      logger.info({ Bucket }, '[storage:setup] CORS uygulandı');
    } catch (err: any) {
      failures.push(`${Bucket}: ${err?.message ?? 'CORS hatası'}`);
      logger.error({ Bucket, err: err?.message }, '[storage:setup] CORS uygulanamadı');
    }
  }

  logger.info({ created, verified, corsApplied, total: targetBuckets.length }, '[storage:setup] tamamlandı');
  if (failures.length) {
    logger.error({ failures }, '[storage:setup] bazı bucket’larda CORS uygulanamadı');
    process.exitCode = 1;
  }
}

setup().catch((err) => {
  logger.error({ err: err?.message ?? err }, '[storage:setup] beklenmeyen hata');
  process.exit(1);
});
