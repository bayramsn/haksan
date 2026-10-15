import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const region = process.env.AWS_REGION ?? 'eu-central-1';
const bucket = process.env.S3_BUCKET_NAME;
if (!bucket) throw new Error('S3_BUCKET_NAME is required');

const client = new S3Client({ region });
const key = `erp-import-raw/_role-probe/${Date.now()}-${crypto.randomUUID()}.txt`;
const expected = 'haksan-s3-role-probe';

try {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: expected,
    ContentType: 'text/plain',
  }));
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const actual = await response.Body?.transformToString();
  if (actual !== expected) throw new Error('S3 role probe content mismatch');
  console.log(`[s3-role-probe] verified bucket=${bucket} prefix=erp-import-raw/ encryption=${response.ServerSideEncryption ?? 'bucket-default'}`);
} finally {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
}
