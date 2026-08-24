import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
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

export async function pickDocument(): Promise<LocalUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...ALLOWED_MIME_TYPES],
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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Fotoğraf seçmek için galeri izni gerekli.');
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
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value, new URL(apiBaseUrl()).origin).toString();
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
  const result = await LegacyFileSystem.uploadAsync(absoluteApiUrl(upload.uploadUrl), local.uri, {
    httpMethod: 'PUT',
    uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: authHeaders(local.mimeType),
    sessionType: LegacyFileSystem.FileSystemSessionType.FOREGROUND,
  });
  if (result.status < 200 || result.status >= 300) {
    void files.remove(upload.fileId).catch(() => {});
    throw new Error(result.status === 413 ? 'Dosya 25 MB sınırını aşıyor.' : 'Dosya yüklenemedi.');
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
    const result = await LegacyFileSystem.uploadAsync(absoluteApiUrl(upload.uploadUrl), input.local.uri, {
      httpMethod: 'PUT',
      uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: authHeaders(input.local.mimeType),
      sessionType: LegacyFileSystem.FileSystemSessionType.FOREGROUND,
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(result.status === 413 ? 'Dosya 25 MB sınırını aşıyor.' : 'Dosya yüklenemedi.');
    }
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

/** POST ile üretilen PDF'i base64'e çevirmeden cache dosyasına stream eder. */
export async function postPdfAndShare(path: string, filename: string): Promise<void> {
  const response = await expoFetch(absoluteApiUrl(path), { method: 'POST', headers: authHeaders() });
  if (!response.ok || !response.body) throw new Error('PDF oluşturulamadı.');
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_DOCUMENT_BYTES) throw new Error('PDF 25 MB güvenli paylaşım sınırını aşıyor.');
  const target = new File(Paths.cache, safeName(filename));
  target.create({ overwrite: true, intermediates: true });
  try {
    await response.body.pipeTo(target.writableStream());
    if (target.size <= 0 || target.size > MAX_DOCUMENT_BYTES) {
      throw new Error(target.size > MAX_DOCUMENT_BYTES ? 'PDF 25 MB sınırını aşıyor.' : 'PDF boş döndü.');
    }
    await shareLocalFile(target, 'application/pdf', filename);
  } catch (error) {
    if (target.exists) target.delete();
    throw error;
  }
}
