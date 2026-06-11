import { Injectable } from '@nestjs/common';
import type { StorageProvider, SignedUrlOptions, StoredFileMetadata, UploadOptions } from './storage.types';
import { loadEnv } from '../../config/env';

/**
 * Thin wrapper around Supabase Storage REST API. Requires
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 *
 * Bucket creation is expected to be done out-of-band via Supabase Studio or
 * a one-off migration script — we only read/write objects here.
 */
@Injectable()
export class SupabaseStorageProvider implements StorageProvider {
  readonly providerCode = 'supabase' as const;
  private env = loadEnv();

  private get baseUrl(): string {
    return `${this.env.SUPABASE_URL?.replace(/\/$/, '')}/storage/v1`;
  }

  private get serviceKey(): string {
    const k = this.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    return k;
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.serviceKey,
      Authorization: `Bearer ${this.serviceKey}`,
    };
  }

  async uploadFile(opts: UploadOptions): Promise<void> {
    const url = `${this.baseUrl}/object/${opts.bucket}/${opts.objectKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': opts.mimeType, 'x-upsert': 'true' },
      body: opts.body,
    });
    if (!res.ok) throw new Error(`Supabase upload failed: ${res.status} ${await res.text()}`);
  }

  async getObject(bucket: string, objectKey: string): Promise<Buffer | null> {
    const url = `${this.baseUrl}/object/${bucket}/${objectKey}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }

  async getSignedUploadUrl(opts: SignedUrlOptions): Promise<string> {
    const url = `${this.baseUrl}/object/upload/sign/${opts.bucket}/${opts.objectKey}`;
    const res = await fetch(url, { method: 'POST', headers: this.headers() });
    if (!res.ok) throw new Error(`Supabase signed upload URL failed: ${res.status}`);
    const json = (await res.json()) as { url: string };
    return `${this.env.SUPABASE_URL?.replace(/\/$/, '')}/storage/v1${json.url}`;
  }

  async getSignedDownloadUrl(opts: SignedUrlOptions): Promise<string> {
    const url = `${this.baseUrl}/object/sign/${opts.bucket}/${opts.objectKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: opts.expiresInSeconds ?? this.env.SIGNED_URL_EXPIRE_SECONDS }),
    });
    if (!res.ok) throw new Error(`Supabase signed download URL failed: ${res.status}`);
    const json = (await res.json()) as { signedURL: string };
    return `${this.env.SUPABASE_URL?.replace(/\/$/, '')}/storage/v1${json.signedURL}`;
  }

  async deleteFile(bucket: string, objectKey: string): Promise<void> {
    const url = `${this.baseUrl}/object/${bucket}/${objectKey}`;
    const res = await fetch(url, { method: 'DELETE', headers: this.headers() });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Supabase delete failed: ${res.status}`);
    }
  }

  async getFileMetadata(bucket: string, objectKey: string): Promise<StoredFileMetadata | null> {
    const url = `${this.baseUrl}/object/info/${bucket}/${objectKey}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) return null;
    const json = (await res.json()) as { size?: number; updated_at?: string };
    return { bucket, objectKey, sizeBytes: json.size ?? 0, lastModified: json.updated_at ? new Date(json.updated_at) : undefined };
  }
}
