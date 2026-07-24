import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import type { GetObjectCommandOutput, HeadObjectCommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider, SignedUrlOptions, StoredFileMetadata, UploadOptions } from './storage.types';
import { loadEnv } from '../../config/env';
import { logger } from '../utils/logger';
import { buildS3ClientConfig, resolveStorageTarget } from './s3-client-config';

/**
 * Unified S3-compatible provider. Used for:
 *   - MinIO (S3_PROVIDER=minio)         — local dev
 *   - AWS S3 (S3_PROVIDER=s3)           — prod
 *   - Cloudflare R2 (S3_PROVIDER=r2)    — prod
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  readonly providerCode: 'minio' | 's3' | 'r2';
  private client: S3Client;
  private env = loadEnv();

  constructor() {
    this.providerCode = this.env.S3_PROVIDER === 'supabase' ? 's3' : (this.env.S3_PROVIDER as 'minio' | 's3' | 'r2');
    this.client = new S3Client(buildS3ClientConfig(this.env));
    logger.info(
      { provider: this.env.S3_PROVIDER, endpoint: this.env.S3_ENDPOINT, bucket: this.env.S3_BUCKET_NAME },
      '[storage] initialized'
    );
  }

  private target(bucket: string, objectKey: string) {
    return resolveStorageTarget(this.env.S3_PROVIDER, this.env.S3_BUCKET_NAME, bucket, objectKey);
  }

  async uploadFile(opts: UploadOptions): Promise<void> {
    const target = this.target(opts.bucket, opts.objectKey);
    await this.client.send(
      new PutObjectCommand({
        Bucket: target.bucket,
        Key: target.objectKey,
        Body: opts.body,
        ContentType: opts.mimeType,
        ContentLength: opts.contentLength,
        IfNoneMatch: '*',
      })
    );
  }

  async getObject(bucket: string, objectKey: string): Promise<Buffer | null> {
    try {
      const target = this.target(bucket, objectKey);
      const res = await this.client.send(new GetObjectCommand({ Bucket: target.bucket, Key: target.objectKey })) as GetObjectCommandOutput;
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  async getSignedUploadUrl(opts: SignedUrlOptions): Promise<string> {
    const target = this.target(opts.bucket, opts.objectKey);
    const cmd = new PutObjectCommand({
      Bucket: target.bucket,
      Key: target.objectKey,
      ContentType: opts.mimeType,
      ContentLength: opts.contentLength,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: opts.expiresInSeconds ?? this.env.SIGNED_URL_EXPIRE_SECONDS });
  }

  async getSignedDownloadUrl(opts: SignedUrlOptions): Promise<string> {
    const target = this.target(opts.bucket, opts.objectKey);
    const cmd = new GetObjectCommand({
      Bucket: target.bucket,
      Key: target.objectKey,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: opts.expiresInSeconds ?? this.env.SIGNED_URL_EXPIRE_SECONDS });
  }

  async deleteFile(bucket: string, objectKey: string): Promise<void> {
    const target = this.target(bucket, objectKey);
    await this.client.send(new DeleteObjectCommand({ Bucket: target.bucket, Key: target.objectKey }));
  }

  async getFileMetadata(bucket: string, objectKey: string): Promise<StoredFileMetadata | null> {
    try {
      const target = this.target(bucket, objectKey);
      const head = await this.client.send(new HeadObjectCommand({ Bucket: target.bucket, Key: target.objectKey })) as HeadObjectCommandOutput;
      return {
        bucket,
        objectKey,
        sizeBytes: head.ContentLength ?? 0,
        etag: head.ETag,
        lastModified: head.LastModified,
      };
    } catch {
      return null;
    }
  }
}
