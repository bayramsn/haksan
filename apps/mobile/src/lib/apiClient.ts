/**
 * Mobil API istemcisi — web'deki `apps/web/src/lib/apiClient.ts` sözleşmesinin
 * React Native port'u:
 *  - Bearer access token (AsyncStorage'da kalıcı)
 *  - Aktif bölüm `X-Active-Division` / `X-Active-Department` başlıkları
 *  - 401'de cookie tabanlı `/auth/refresh` ile tek seferlik retry
 *  - `{ error: { code, message, details } }` hata şekli → ApiError
 *  - Opsiyonel zod `schema` doğrulaması (sözleşme sapmasını erken yakalar)
 *
 * localStorage/sessionStorage yerine AsyncStorage kullanıldığı için state
 * bellekte tutulur; `bootstrapApiClient()` açılışta kalıcı değerleri yükler.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ZodType } from 'zod';
import { DEFAULT_API_BASE_URL, STORAGE_KEYS } from './config';

export interface RequestOpts<T = unknown> extends RequestInit {
  schema?: ZodType<T>;
}

export interface ApiClient {
  get<T = any>(path: string, opts?: RequestOpts<T>): Promise<T>;
  post<T = any>(path: string, body?: unknown, opts?: RequestOpts<T>): Promise<T>;
  patch<T = any>(path: string, body?: unknown, opts?: RequestOpts<T>): Promise<T>;
  put<T = any>(path: string, body?: unknown, opts?: RequestOpts<T>): Promise<T>;
  delete<T = any>(path: string, opts?: RequestOpts<T>): Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let baseUrl = DEFAULT_API_BASE_URL;
let accessToken: string | null = null;
let activeDivision: string | null = null;
let refreshing: Promise<string | null> | null = null;
let onSessionExpired: (() => void) | null = null;
let onTokenChange: ((token: string | null) => void) | null = null;

/** Açılışta AsyncStorage'daki kalıcı değerleri belleğe yükler. */
export async function bootstrapApiClient(): Promise<void> {
  const [[, url], [, token], [, division]] = await AsyncStorage.multiGet([
    STORAGE_KEYS.apiBaseUrl,
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.activeDivision,
  ]);
  if (url) baseUrl = url;
  accessToken = token || null;
  activeDivision = division || null;
}

export function getBaseUrl(): string {
  return baseUrl;
}

export function setBaseUrl(url: string): void {
  baseUrl = url.trim().replace(/\/$/, '');
  void AsyncStorage.setItem(STORAGE_KEYS.apiBaseUrl, baseUrl);
}

/** API kökü (`/api/v1` olmadan) — sağlık uçları için. */
export function getApiOrigin(): string {
  return baseUrl.replace(/\/api\/v\d+\/?$/, '');
}

/**
 * Saklı medya referansını yüklenebilir URL'e çevirir (ürün görselleri vb.).
 * Mutlak URL'ler değişmeden döner; göreli API yolları base ile öne eklenir.
 */
export function resolveMediaUrl(ref?: string | null): string {
  if (!ref) return '';
  if (/^https?:\/\//i.test(ref) || ref.startsWith('data:')) return ref;
  if (ref.startsWith('/')) return `${baseUrl}${ref}`;
  return ref;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) void AsyncStorage.setItem(STORAGE_KEYS.accessToken, token);
  else void AsyncStorage.removeItem(STORAGE_KEYS.accessToken);
  onTokenChange?.(token);
}

export function getActiveDivision(): string | null {
  return activeDivision;
}

export function setActiveDivision(value: string | null): void {
  activeDivision = value;
  if (value) void AsyncStorage.setItem(STORAGE_KEYS.activeDivision, value);
  else void AsyncStorage.removeItem(STORAGE_KEYS.activeDivision);
}

/** AuthProvider, 401 sonrası React oturum state'ini temizlemek için kaydolur. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/** Token değişince native arama istemcisini yeniden yapılandırmak için kaydolur. */
export function setTokenChangeHandler(handler: ((token: string | null) => void) | null): void {
  onTokenChange = handler;
}

/** Cookie tabanlı oturum yenileme — gövdesiz POST. */
export async function refreshSession(): Promise<string | null> {
  return tryRefresh();
}

async function tryRefresh(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${baseUrl}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      const json = (await res.json()) as { accessToken?: string | null };
      const t = json.accessToken ?? null;
      if (t) setAccessToken(t);
      return t;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, opts: RequestOpts<T> = {}): Promise<T> {
  const { schema, ...init } = opts;
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string>) };
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (activeDivision) {
    headers['X-Active-Division'] = activeDivision;
    headers['X-Active-Department'] = activeDivision;
  }

  const send = (h: Record<string, string>) =>
    fetch(url, {
      ...init,
      method,
      headers: h,
      credentials: 'include',
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });

  let res = await send(headers);

  // 401'de cookie ile yenile ve bir kez tekrar dene.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await send({ ...headers, Authorization: `Bearer ${newToken}` });
    } else {
      onSessionExpired?.();
    }
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const json = (await res.json().catch(() => null)) as
        | { error?: { code?: string; message?: string; details?: unknown } }
        | null;
      const code = json?.error?.code ?? `HTTP_${res.status}`;
      const message = json?.error?.message ?? `Hata ${res.status}`;
      throw new ApiError(res.status, code, message, json?.error?.details);
    }
    throw new ApiError(res.status, `HTTP_${res.status}`, res.statusText || `Hata ${res.status}`);
  }

  if (contentType.includes('application/json')) {
    const json = await res.json();
    if (!schema) return json as T;
    const parsed = schema.safeParse(json);
    if (parsed.success) return parsed.data;
    throw new ApiError(res.status, 'CONTRACT_VIOLATION', 'Sunucu yanıtı beklenen biçimde değil', parsed.error.issues);
  }
  return (await res.text()) as T;
}

export const api: ApiClient = {
  get: (p, o) => request('GET', p, undefined, o),
  post: (p, b, o) => request('POST', p, b, o),
  patch: (p, b, o) => request('PATCH', p, b, o),
  put: (p, b, o) => request('PUT', p, b, o),
  delete: (p, o) => request('DELETE', p, undefined, o),
};

export { request as rawRequest };
