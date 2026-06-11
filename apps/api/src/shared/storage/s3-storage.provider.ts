import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider, SignedUrlOptions, StoredFileMetadata, UploadOptions } from './storage.types';
import { loadEnv } from '../../config/env';
import { logger } from '../utils/logger';

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
    this.client = new S3Client({
      region: this.env.S3_REGION,
      endpoint: this.env.S3_ENDPOINT,
      forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: this.env.S3_ACCESS_KEY_ID,
        secretAccessKey: this.env.S3_SECRET_ACCESS_KEY,
      },
    });
    logger.info({ provider: this.env.S3_PROVIDER, endpoint: this.env.S3_ENDPOINT }, '[storage] initialized');
  }

  async uploadFile(opts: UploadOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: opts.objectKey,
        Body: opts.body,
        ContentType: opts.mimeType,
        ContentLength: opts.contentLength,
      })
    );
  }

  async getObject(bucket: string, objectKey: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  async getSignedUploadUrl(opts: SignedUrlOptions): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: opts.bucket,
      Key: opts.objectKey,
      ContentType: opts.mimeType,
      ContentLength: opts.contentLength,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: opts.expiresInSeconds ?? this.env.SIGNED_URL_EXPIRE_SECONDS });
  }

  async getSignedDownloadUrl(opts: SignedUrlOptions): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: opts.bucket,
      Key: opts.objectKey,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: opts.expiresInSeconds ?? this.env.SIGNED_URL_EXPIRE_SECONDS });
  }

  async deleteFile(bucket: string, objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
  }

  async getFileMetadata(bucket: string, objectKey: string): Promise<StoredFileMetadata | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
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
