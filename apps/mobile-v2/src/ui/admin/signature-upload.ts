import * as ImagePicker from 'expo-image-picker';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { SIGNATURE_IMAGE_MAX_BYTES } from '@haksan/shared';
import { accessTokenSnapshot } from '@/src/api/client';
import { apiBaseUrl } from '@/src/api/config';
import { files } from '@/src/api/endpoints';
import { activeScope } from '@/src/auth/scope';
import { normalizeSignatureFile, type SignatureImageMeta } from './signature-meta';

export type PickedSignatureImage = SignatureImageMeta & {
  uri: string;
  filename: string;
  sizeBytes: number;
  /** Yalnız `withBase64` istendiğinde dolu (mail imzası data URL'i). */
  base64?: string;
};

const BRAND_LOGO_MAX_BYTES = 5 * 1024 * 1024;

async function pickImage(options: {
  withBase64?: boolean;
  maxBytes: number;
  fallbackName: string;
  typeError: string;
  emptyError: string;
  sizeError: string;
}): Promise<PickedSignatureImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Görsel seçmek için galeri izni gerekli.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    base64: options.withBase64 === true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const normalized = normalizeSignatureFile(asset.fileName ?? options.fallbackName, asset.mimeType ?? null);
  if (!normalized) throw new Error(options.typeError);
  const { filename, meta } = normalized;
  const sizeBytes = asset.fileSize ?? (await LegacyFileSystem.getInfoAsync(asset.uri).then((info) => (info.exists ? info.size : 0)));
  if (!sizeBytes || sizeBytes <= 0) throw new Error(options.emptyError);
  if (sizeBytes > options.maxBytes) throw new Error(options.sizeError);
  return { ...meta, uri: asset.uri, filename, sizeBytes, base64: asset.base64 ?? undefined };
}

/**
 * Galeriden imza görseli seçer; PNG/JPG/WEBP ve 2 MB sınırı web
 * `validateSignatureImage` ile aynı. Sunucu aynı kontrolü yeniden yapar.
 */
export function pickSignatureImage(options: { withBase64?: boolean } = {}) {
  return pickImage({
    withBase64: options.withBase64,
    maxBytes: SIGNATURE_IMAGE_MAX_BYTES,
    fallbackName: `imza-${Date.now()}.png`,
    typeError: 'Yalnızca PNG, JPG veya WEBP imza görseli yükleyebilirsiniz.',
    emptyError: 'İmza görseli boş olamaz.',
    sizeError: "İmza görseli 2 MB'ı aşamaz.",
  });
}

/** Marka logosu: PNG/JPG/WEBP, en fazla 5 MB (web `validateBrandLogo`). */
export function pickBrandLogo() {
  return pickImage({
    maxBytes: BRAND_LOGO_MAX_BYTES,
    fallbackName: `logo-${Date.now()}.png`,
    typeError: 'Yalnızca PNG, JPG veya WEBP logo yükleyebilirsiniz.',
    emptyError: 'Logo dosyası boş olamaz.',
    sizeError: "Logo dosyası 5 MB'ı aşamaz.",
  });
}

/** Sunucu URL'leri `/api/v1/...` ile gelir; origin-only birleştirme öneki düşürür. */
function absoluteApiUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  const base = new URL(apiBaseUrl());
  const prefix = base.pathname.replace(/\/+$/, '');
  const path = value.startsWith('/') ? value : `/${value}`;
  if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) return `${base.origin}${path}`;
  return `${base.origin}${prefix}${path}`;
}

async function uploadImage(
  target: { bucket: 'erp-signatures' | 'erp-brand-logos'; entityType: 'signature' | 'brand'; entityId: string },
  image: PickedSignatureImage,
  errors: { tooLarge: string; failed: string }
): Promise<string> {
  const upload = await files.signedUpload({
    ...target,
    filename: image.filename,
    mimeType: image.mimeType,
    extension: image.extension,
    sizeBytes: image.sizeBytes,
  });
  const token = accessTokenSnapshot();
  const scope = activeScope();
  const result = await LegacyFileSystem.uploadAsync(absoluteApiUrl(upload.uploadUrl), image.uri, {
    httpMethod: 'PUT',
    uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Accept: 'application/json',
      'Content-Type': image.mimeType,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Active-Division': scope.divisionId ?? 'all',
      'X-Active-Department': scope.departmentId ?? 'all',
    },
    sessionType: LegacyFileSystem.FileSystemSessionType.FOREGROUND,
  });
  if (result.status < 200 || result.status >= 300) {
    void files.remove(upload.fileId).catch(() => {});
    throw new Error(result.status === 413 ? errors.tooLarge : errors.failed);
  }
  return upload.fileId;
}

/** Belge imzası görselini `erp-signatures` bucket'ına yükler, `fileId` döner (web `signatureService.uploadImage`). */
export function uploadSignatureImage(signatureId: string | 'new', image: PickedSignatureImage): Promise<string> {
  return uploadImage({ bucket: 'erp-signatures', entityType: 'signature', entityId: signatureId }, image, {
    tooLarge: "İmza görseli 2 MB'ı aşamaz.",
    failed: 'İmza görseli yüklenemedi.',
  });
}

/** Marka logosunu yükleyip markaya bağlar (web `uploadBrandLogo`), `fileId` döner. */
export async function uploadBrandLogo(brandId: string, image: PickedSignatureImage): Promise<string> {
  const fileId = await uploadImage({ bucket: 'erp-brand-logos', entityType: 'brand', entityId: brandId }, image, {
    tooLarge: "Logo dosyası 5 MB'ı aşamaz.",
    failed: 'Logo yüklenemedi.',
  });
  await files.link({ fileId, entityType: 'brand', entityId: brandId, documentTypeCode: 'brand_logo', description: 'Marka logosu' });
  return fileId;
}
