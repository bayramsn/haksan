import {
  CreateBucketCommand,
  DeleteBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { S3StorageProvider } from '../src/shared/storage/s3-storage.provider';

const integrationEnabled = process.env.RUN_STORAGE_INTEGRATION === 'true';
const describeIntegration = integrationEnabled ? describe : describe.skip;
const bucket = `haksan-integration-${randomUUID()}`;
const objectKey = 'roundtrip/payload.txt';
const payload = Buffer.from('haksan-minio-roundtrip', 'utf8');

describeIntegration('MinIO storage integration', () => {
  let client: S3Client;
  let provider: S3StorageProvider;

  beforeAll(async () => {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('MinIO integration requires S3_ENDPOINT and S3 credentials');
    }

    client = new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    provider = new S3StorageProvider();
  });

  afterAll(async () => {
    if (provider) await provider.deleteFile(bucket, objectKey).catch(() => undefined);
    if (client) await client.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
    client?.destroy();
  });

  it('uploads, reads, signs, inspects, and deletes a real object', async () => {
    await provider.uploadFile({
      bucket,
      objectKey,
      body: payload,
      mimeType: 'text/plain',
      contentLength: payload.length,
    });

    const stored = await provider.getObject(bucket, objectKey);
    expect(stored).toEqual(payload);

    const metadata = await provider.getFileMetadata(bucket, objectKey);
    expect(metadata).toMatchObject({ bucket, objectKey, sizeBytes: payload.length });

    const signedUrl = await provider.getSignedDownloadUrl({ bucket, objectKey, expiresInSeconds: 60 });
    const signedResponse = await fetch(signedUrl);
    expect(signedResponse.status).toBe(200);
    expect(Buffer.from(await signedResponse.arrayBuffer())).toEqual(payload);

    await provider.deleteFile(bucket, objectKey);
    await expect(provider.getObject(bucket, objectKey)).resolves.toBeNull();
    await expect(provider.getFileMetadata(bucket, objectKey)).resolves.toBeNull();
  });
});
