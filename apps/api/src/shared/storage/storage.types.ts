export interface SignedUrlOptions {
  bucket: string;
  objectKey: string;
  mimeType?: string;
  expiresInSeconds?: number;
  contentLength?: number;
}

export interface StoredFileMetadata {
  bucket: string;
  objectKey: string;
  sizeBytes: number;
  etag?: string;
  lastModified?: Date;
}

export interface UploadOptions {
  bucket: string;
  objectKey: string;
  body: Buffer;
  mimeType: string;
  contentLength?: number;
}

export interface StorageProvider {
  readonly providerCode: 'minio' | 's3' | 'r2' | 'supabase';

  uploadFile(opts: UploadOptions): Promise<void>;

  /** Fetch the full object body as a Buffer, or null if it does not exist. */
  getObject(bucket: string, objectKey: string): Promise<Buffer | null>;

  getSignedUploadUrl(opts: SignedUrlOptions): Promise<string>;

  getSignedDownloadUrl(opts: SignedUrlOptions): Promise<string>;

  deleteFile(bucket: string, objectKey: string): Promise<void>;

  getFileMetadata(bucket: string, objectKey: string): Promise<StoredFileMetadata | null>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER_TOKEN';
