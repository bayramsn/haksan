import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, apiBinaryRequest } from './apiClient';
import { apiBaseOrigin, getApiBaseUrl } from './config';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

type FileOptions = {
  method?: 'GET' | 'POST';
  filename?: string;
  body?: unknown;
};

function safeFilename(value: string): string {
  return value.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 160) || 'crm-belgesi.pdf';
}

function responseFilename(response: Response, fallback?: string): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="([^"]+)"|filename=([^;]+)/i);
  let name = plain?.[1] ?? plain?.[2];
  if (encoded) {
    try { name = decodeURIComponent(encoded); } catch { /* Sunucunun güvenli varsayılan adı kullanılır. */ }
  }
  const type = response.headers.get('content-type') ?? '';
  return safeFilename(name ?? fallback ?? (type.includes('pdf') ? 'crm-belgesi.pdf' : 'crm-raporu.xlsx'));
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  // React Native Blob, tarayıcı Blob'unun arrayBuffer metodunu sağlamayabilir.
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('İndirilen dosya okunamadı.'));
    reader.readAsArrayBuffer(blob);
  });
}

async function shareResponse(response: Response, filename?: string): Promise<void> {
  if (!response.ok) throw new Error(`Dosya indirilemedi (HTTP ${response.status}).`);
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_FILE_BYTES) throw new Error('Dosya 25 MB indirme sınırını aşıyor.');
  const blob = await response.blob();
  if (!blob.size) throw new Error('Sunucu boş dosya döndürdü.');
  if (blob.size > MAX_FILE_BYTES) throw new Error('Dosya 25 MB indirme sınırını aşıyor.');
  const mimeType = (response.headers.get('content-type') ?? blob.type).split(';')[0].trim();
  if (/^(text\/html|application\/json)$/i.test(mimeType)) throw new Error('Sunucu dosya yerine beklenmeyen bir yanıt döndürdü.');
  const name = responseFilename(response, filename);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda dosya paylaşımı kullanılamıyor.');
  const file = new File(Paths.cache, `${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
  try {
    file.create({ intermediates: true });
    file.write(await blobBytes(blob));
    await Sharing.shareAsync(file.uri, {
      mimeType: mimeType || undefined,
      UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
      dialogTitle: name,
    });
  } finally {
    // CRM eklerini paylaşımdan sonra cihazın geçici önbelleğinde bırakma.
    if (file.exists) file.delete();
  }
}

/** CRM oturumu, bölüm yetkisi ve token yenileme denetimleriyle dosya indirir. */
export async function openFileUrl(path: string, options: FileOptions = {}): Promise<void> {
  const response = await apiBinaryRequest(path, options.method ?? 'GET', options.body);
  await shareResponse(response, options.filename);
}

export function openPdfUrl(path: string, label?: string, method: 'GET' | 'POST' = 'POST'): Promise<void> {
  return openFileUrl(path, { method, filename: label });
}

/** Body verildiğinde seçili kayıtların POST Excel dışa aktarımını kullanır. */
export function openExportUrl(path: string, body?: unknown): Promise<void> {
  return openFileUrl(path, { method: body === undefined ? 'GET' : 'POST', body });
}

/** CRM'nin yetkilendirdiği ek dosyayı açar; dış depolamaya oturum bilgisi göndermez. */
export async function openStoredFile(fileId: string): Promise<void> {
  const signed = await api.post<{ downloadUrl: string; filename: string; mimeType: string }>('/files/signed-download-url', { fileId });
  const url = new URL(signed.downloadUrl, apiBaseOrigin());
  if (url.origin === apiBaseOrigin()) {
    const base = getApiBaseUrl().replace(/\/$/, '');
    const path = url.href.startsWith(`${base}/`) ? url.href.slice(base.length) : url.href;
    return openFileUrl(path, { filename: signed.filename });
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Güvenli bir dosya adresi alınamadı.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url.href, { credentials: 'omit', signal: controller.signal });
    await shareResponse(response, signed.filename);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Dosya indirme zaman aşımına uğradı. Tekrar deneyin.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
