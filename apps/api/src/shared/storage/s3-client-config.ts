import type { S3ClientConfig } from '@aws-sdk/client-s3';
import type { AppEnv } from '../../config/env';

type StorageClientEnv = Pick<
  AppEnv,
  'S3_PROVIDER' | 'S3_REGION' | 'S3_ENDPOINT' | 'S3_FORCE_PATH_STYLE' | 'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY'
>;

/**
 * AWS S3 production uses the SDK default credential chain (EC2/ECS role).
 * MinIO/R2 may still provide an explicit access-key pair.
 */
export function buildS3ClientConfig(env: StorageClientEnv): S3ClientConfig {
  const config: S3ClientConfig = {
    region: env.S3_REGION,
    forcePathStyle: env.S3_PROVIDER === 's3' ? false : env.S3_FORCE_PATH_STYLE,
  };

  if (env.S3_PROVIDER !== 's3' && env.S3_ENDPOINT) config.endpoint = env.S3_ENDPOINT;
  if (env.S3_PROVIDER !== 's3' && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    };
  }

  return config;
}

export function resolveStorageTarget(
  provider: AppEnv['S3_PROVIDER'],
  physicalBucket: string | undefined,
  logicalBucket: string,
  objectKey: string,
): { bucket: string; objectKey: string } {
  if (provider !== 's3') return { bucket: logicalBucket, objectKey };
  if (!physicalBucket) throw new Error('S3_BUCKET_NAME is required for AWS S3 storage');

  const bucketPrefix = logicalBucket.replace(/^\/+|\/+$/g, '');
  const normalizedObjectKey = objectKey.replace(/^\/+/, '');
  if (!bucketPrefix || !normalizedObjectKey) throw new Error('Logical bucket and object key must not be empty');

  return {
    bucket: physicalBucket,
    objectKey: `${bucketPrefix}/${normalizedObjectKey}`,
  };
}
