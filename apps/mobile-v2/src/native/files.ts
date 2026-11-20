import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fetch as expoFetch } from 'expo/fetch';
import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  type FileDocumentTypeCode,
  type FileLinkEntityType,
} from '@haksan/shared';
import { activeScope } from '@/src/auth/scope';
import { accessTokenSnapshot } from '@/src/api/client';
import { apiBaseUrl } from '@/src/api/config';
import { files } from '@/src/api/endpoints';

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export type LocalUpload = {
  uri: string;
  name: string;
  mimeType: (typeof ALLOWED_MIME_TYPES)[number];
  extension: (typeof ALLOWED_FILE_EXTENSIONS)[number];
  sizeBytes: number;
};

export type UploadedAttachment = { fileId: string; fileName: string; sizeBytes: number; mimeType: string };

const allowedMimeTypes = new Set<string>(ALLOWED_MIME_TYPES);
const allowedExtensions = new Set<string>(ALLOWED_FILE_EXTENSIONS);

function safeName(value: string): string {
  const sanitized = value.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim();
  return (sanitized || `dosya-${Date.now()}`).slice(0, 180);
}

function extensionOf(name: string): string {
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
}

function mimeForExtension(extension: string): string | undefined {
  return {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
  }[extension];
}

function normalizeLocalUpload(input: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null }): LocalUpload {
  const name = safeName(input.name ?? `dosya-${Date.now()}`);
  const extension = extensionOf(name);
  const mimeType = input.mimeType || mimeForExtension(extension) || '';
  const sizeBytes = input.size ?? new File(input.uri).size;
  if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(mimeType)) {
    throw new Error('Bu dosya türü desteklenmiyor. PDF, Office, görsel, WebM veya ses dosyası seçin.');
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new Error('Dosya boş veya okunamıyor.');
  if (sizeBytes > MAX_DOCUMENT_BYTES) throw new Error('Dosya 25 MB sınırını aşıyor.');
  return {
    uri: input.uri,
    name,
    mimeType: mimeType as LocalUpload['mimeType'],
    extension: extension as LocalUpload['extension'],
    sizeBytes,
  };
}

export async function pickDocument(types: readonly string[] = ALLOWED_MIME_TYPES): Promise<LocalUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...types],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return normalizeLocalUpload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size });
}

export async function pickImage(source: 'library' | 'camera'): Promise<LocalUpload | null> {
  if (source === 'library') {
    // Android's system photo picker grants access only to the selected file;
    // requesting broad media access is unnecessary for CRM attachments.
    if (Platform.OS !== 'android') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Fotoğraf seçmek için galeri izni gerekli.');
    }
  } else {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Fotoğraf çekmek için kamera izni gerekli.');
  }
  const result = source === 'library'
    ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 })
    : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return normalizeLocalUpload({
    uri: asset.uri,
    name: asset.fileName ?? `foto-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? 'image/jpeg',
    size: asset.fileSize,
  });
}

function absoluteApiUrl(value: string): string {
  const url = new URL(value, new URL(apiBaseUrl()).origin);
  if (url.username || url.password || (url.protocol !== 'https:' && !(__DEV__ && url.protocol === 'http:'))) {
    throw new Error('Dosya bağlantısı güvenli değil.');
  }
  return url.toString();
}

function authenticatedFileUrl(value: string): string {
  const url = new URL(absoluteApiUrl(value));
  if (url.origin !== new URL(apiBaseUrl()).origin) {
    throw new Error('Dosya bağlantısı uygulamanın sunucusuna ait değil.');
  }
  return url.toString();
}

function authHeaders(mimeType?: string): Record<string, string> {
  const token = accessTokenSnapshot();
  const scope = activeScope();
  return {
    Accept: 'application/json',
    ...(mimeType ? { 'Content-Type': mimeType } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-Active-Division': scope.divisionId ?? 'all',
    'X-Active-Department': scope.departmentId ?? 'all',
  };
}

async function putAttachment(uploadUrl: string, local: LocalUpload): Promise<void> {
  const url = authenticatedFileUrl(uploadUrl);
  const file = new File(local.uri);
  if (!file.exists || file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) {
    throw new Error('Dosya boş veya 25 MB sınırını aşıyor.');
  }
  const result = await expoFetch(url, {
    method: 'PUT',
    body: await file.bytes(),
    headers: authHeaders(local.mimeType),
    redirect: 'error',
  });
  if (!result.ok) {
    throw new Error(result.status === 413 ? 'Dosya 25 MB sınırını aşıyor.' : 'Dosya yüklenemedi.');
  }
}

export async function uploadChatAttachment(conversationId: string, local: LocalUpload): Promise<UploadedAttachment> {
  const upload = await files.signedUpload({
    bucket: 'erp-service-documents',
    entityType: 'chat_conversation',
    entityId: conversationId,
    filename: local.name,
    mimeType: local.mimeType,
    extension: local.extension,
    sizeBytes: local.sizeBytes,
  });
  try {
    await putAttachment(upload.uploadUrl, local);
  } catch (error) {
    void files.remove(upload.fileId).catch(() => {});
    throw error;
  }
  return { fileId: upload.fileId, fileName: local.name, sizeBytes: local.sizeBytes, mimeType: local.mimeType };
}

export async function uploadEntityAttachment(input: {
  bucket: 'erp-quote-documents' | 'erp-proforma-documents' | 'erp-contract-documents' | 'erp-invoice-documents' | 'erp-stock-documents' | 'erp-service-documents';
  entityType: FileLinkEntityType;
  entityId: string;
  documentTypeCode: FileDocumentTypeCode;
  description?: string;
  local: LocalUpload;
}): Promise<UploadedAttachment> {
  const upload = await files.signedUpload({
    bucket: input.bucket,
    entityType: input.entityType,
    entityId: input.entityId,
    filename: input.local.name,
    mimeType: input.local.mimeType,
    extension: input.local.extension,
    sizeBytes: input.local.sizeBytes,
  });
  try {
    await putAttachment(upload.uploadUrl, input.local);
    await files.link({
      fileId: upload.fileId,
      entityType: input.entityType,
      entityId: input.entityId,
      documentTypeCode: input.documentTypeCode,
      description: input.description,
    });
    return {
      fileId: upload.fileId,
      fileName: input.local.name,
      sizeBytes: input.local.sizeBytes,
      mimeType: input.local.mimeType,
    };
  } catch (error) {
    void files.remove(upload.fileId).catch(() => {});
    throw error;
  }
}

async function shareLocalFile(file: { uri: string }, mimeType: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda dosya paylaşımı kullanılamıyor.');
  await Sharing.shareAsync(file.uri, {
    mimeType,
    UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
    dialogTitle: title,
  });
}

export async function downloadAndShareFile(fileId: string): Promise<void> {
  const signed = await files.signedDownload(fileId);
  const target = new File(Paths.cache, `${fileId}-${safeName(signed.filename)}`);
  const downloaded = await File.downloadFileAsync(absoluteApiUrl(signed.downloadUrl), target, { idempotent: true });
  if (downloaded.size > MAX_DOCUMENT_BYTES) {
    downloaded.delete();
    throw new Error('Dosya 25 MB güvenli indirme sınırını aşıyor.');
  }
  await shareLocalFile(downloaded, signed.mimeType, signed.filename);
}

/** GET ile sunulan PDF'i (servis formu gibi) indirip paylaşır. */
export async function getPdfAndShare(path: string, filename: string): Promise<void> {
  return pdfAndShare(path, filename, 'GET');
}

async function pdfAndShare(path: string, filename: string, method: 'GET'): Promise<void> {
  const response = await expoFetch(authenticatedFileUrl(path), { method, headers: authHeaders(), redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('PDF alınamadı. Webde hazırlanan güncel belgeyi kontrol edin.');
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/pdf')) {
    throw new Error('Sunucu geçerli bir PDF döndürmedi.');
  }
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_DOCUMENT_BYTES) throw new Error('PDF 25 MB güvenli paylaşım sınırını aşıyor.');
  const target = new File(Paths.cache, safeName(filename));
  target.create({ overwrite: true, intermediates: true });
  try {
    let receivedBytes = 0;
    await response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        receivedBytes += chunk.byteLength;
        if (receivedBytes > MAX_DOCUMENT_BYTES) {
          throw new Error('PDF 25 MB güvenli paylaşım sınırını aşıyor.');
        }
        controller.enqueue(chunk);
      },
    })).pipeTo(target.writableStream());
    if (target.size <= 0 || target.size > MAX_DOCUMENT_BYTES) {
      throw new Error(target.size > MAX_DOCUMENT_BYTES ? 'PDF 25 MB sınırını aşıyor.' : 'PDF boş döndü.');
    }
    await shareLocalFile(target, 'application/pdf', filename);
  } catch (error) {
    if (target.exists) target.delete();
    throw error;
  }
}
