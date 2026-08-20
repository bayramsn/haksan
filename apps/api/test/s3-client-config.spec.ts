import { describe, expect, it } from 'vitest';
import { buildS3ClientConfig, resolveStorageTarget } from '../src/shared/storage/s3-client-config';

describe('AWS S3 runtime configuration', () => {
  it('uses the default IAM credential chain when static credentials are absent', () => {
    const config = buildS3ClientConfig({
      S3_PROVIDER: 's3',
      S3_REGION: 'eu-central-1',
      S3_ENDPOINT: 'http://minio:9000',
      S3_FORCE_PATH_STYLE: true,
      S3_ACCESS_KEY_ID: 'minio-fallback-user',
      S3_SECRET_ACCESS_KEY: 'minio-fallback-secret',
    });

    expect(config.region).toBe('eu-central-1');
    expect(config.endpoint).toBeUndefined();
    expect(config.credentials).toBeUndefined();
  });

  it('keeps explicit credentials for MinIO-compatible clients', () => {
    const config = buildS3ClientConfig({
      S3_PROVIDER: 'minio',
      S3_REGION: 'us-east-1',
      S3_ENDPOINT: 'http://minio:9000',
      S3_FORCE_PATH_STYLE: true,
      S3_ACCESS_KEY_ID: 'minio-user',
      S3_SECRET_ACCESS_KEY: 'minio-secret',
    });

    expect(config.endpoint).toBe('http://minio:9000');
    expect(config.credentials).toEqual({ accessKeyId: 'minio-user', secretAccessKey: 'minio-secret' });
  });

  it('maps logical AWS buckets to prefixes under one physical bucket', () => {
    expect(resolveStorageTarget(
      's3',
      'haksan-prod-files-866490183348-eu-central-1',
      'erp-product-images',
      'tenant/product/photo.jpg',
    )).toEqual({
      bucket: 'haksan-prod-files-866490183348-eu-central-1',
      objectKey: 'erp-product-images/tenant/product/photo.jpg',
    });
  });

  it('leaves MinIO bucket and key names unchanged', () => {
    expect(resolveStorageTarget('minio', undefined, 'erp-product-images', 'tenant/product/photo.jpg')).toEqual({
      bucket: 'erp-product-images',
      objectKey: 'tenant/product/photo.jpg',
    });
  });
});
