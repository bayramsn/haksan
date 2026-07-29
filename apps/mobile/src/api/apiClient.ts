import * as SecureStore from 'expo-secure-store';
import type { ZodType } from 'zod';
import { apiBaseOrigin, getApiBaseUrl, setApiOriginChangedHandler } from './config';

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

const ACCESS_KEY = 'haksan_access_token';
const REFRESH_COOKIE_KEY = 'haksan_refresh_cookie';
const DIVISION_KEY = 'haksan_active_division';
const DEPARTMENT_KEY = 'haksan_active_department';
const SESSION_ORIGIN_KEY = 'haksan_session_origin';

let accessToken: string | null = null;
let refreshCookie: string | null = null;
let activeDivision: string | null = null;
let activeDepartment: string | null = null;
let sessionOrigin: string | null = null;
let refreshing: Promise<string | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export async function hydrateApiClient(): Promise<void> {
  const storedAccessToken = await SecureStore.getItemAsync(ACCESS_KEY);
  const storedRefreshCookie = await SecureStore.getItemAsync(REFRESH_COOKIE_KEY);
  const storedOrigin = await SecureStore.getItemAsync(SESSION_ORIGIN_KEY);
  if ((storedAccessToken || storedRefreshCookie) && storedOrigin !== apiBaseOrigin()) {
    await clearApiSession();
    return;
  }
  accessToken = storedAccessToken ?? null;
  refreshCookie = storedRefreshCookie ?? null;
  sessionOrigin = storedOrigin ?? null;
  activeDivision = (await SecureStore.getItemAsync(DIVISION_KEY)) ?? null;
  activeDepartment = (await SecureStore.getItemAsync(DEPARTMENT_KEY)) ?? null;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export async function setAccessToken(token: string | null): Promise<void> {
  accessToken = token;
  if (token) {
    sessionOrigin = apiBaseOrigin();
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY, token),
      SecureStore.setItemAsync(SESSION_ORIGIN_KEY, sessionOrigin),
    ]);
  } else {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    if (!refreshCookie) {
      sessionOrigin = null;
      await SecureStore.deleteItemAsync(SESSION_ORIGIN_KEY);
    }
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function setRefreshCookie(cookie: string | null): Promise<void> {
  refreshCookie = cookie;
  if (cookie) {
    sessionOrigin = apiBaseOrigin();
    await Promise.all([
      SecureStore.setItemAsync(REFRESH_COOKIE_KEY, cookie),
      SecureStore.setItemAsync(SESSION_ORIGIN_KEY, sessionOrigin),
    ]);
  } else {
    await SecureStore.deleteItemAsync(REFRESH_COOKIE_KEY);
    if (!accessToken) {
      sessionOrigin = null;
      await SecureStore.deleteItemAsync(SESSION_ORIGIN_KEY);
    }
  }
}

export async function setActiveDivision(value: string | null): Promise<void> {
  activeDivision = value;
  if (value) await SecureStore.setItemAsync(DIVISION_KEY, value);
  else await SecureStore.deleteItemAsync(DIVISION_KEY);
}

export function getActiveDivision(): string | null {
  return activeDivision;
}

export async function setActiveDepartment(value: string | null): Promise<void> {
  activeDepartment = value;
  if (value) await SecureStore.setItemAsync(DEPARTMENT_KEY, value);
  else await SecureStore.deleteItemAsync(DEPARTMENT_KEY);
}

export function getActiveDepartment(): string | null {
  return activeDepartment;
}

export async function clearApiSession(): Promise<void> {
  accessToken = null;
  refreshCookie = null;
  sessionOrigin = null;
  activeDivision = null;
  activeDepartment = null;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_COOKIE_KEY),
    SecureStore.deleteItemAsync(SESSION_ORIGIN_KEY),
    SecureStore.deleteItemAsync(DIVISION_KEY),
    SecureStore.deleteItemAsync(DEPARTMENT_KEY),
  ]);
}

async function ensureSessionOrigin(): Promise<boolean> {
  if (!accessToken && !refreshCookie) return true;
  if (sessionOrigin === apiBaseOrigin()) return true;
  await clearApiSession();
  onSessionExpired?.();
  return false;
}

function extractRefreshCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(/haksan_rt=([^;]+)/);
  return match ? `haksan_rt=${match[1]}` : null;
}

function mergeSetCookieHeaders(headers: Headers): string | null {
  const raw = headers.get('set-cookie');
  if (raw) return extractRefreshCookie(raw);
  // React Native may expose multiple Set-Cookie via getSetCookie (undici)
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const list = anyHeaders.getSetCookie?.();
  if (list?.length) {
    for (const line of list) {
      const c = extractRefreshCookie(line);
      if (c) return c;
    }
  }
  return null;
}

export async function refreshSession(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      if (!(await ensureSessionOrigin())) return null;
      const baseUrl = getApiBaseUrl();
      const origin = apiBaseOrigin(baseUrl);
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (refreshCookie) headers.Cookie = refreshCookie;
      const res = await fetch(`${baseUrl}/auth/refresh`, { method: 'POST', headers });
      if (apiBaseOrigin() !== origin) return null;
      const cookie = mergeSetCookieHeaders(res.headers);
      if (cookie) await setRefreshCookie(cookie);
      if (!res.ok) return null;
      const json = (await res.json()) as { accessToken?: string | null };
      const t = json.accessToken ?? null;
      if (t) await setAccessToken(t);
      return t;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface RequestOpts<T = unknown> extends RequestInit {
  schema?: ZodType<T>;
  /** İstek zaman aşımı (ms). Varsayılan 30sn — mobil ağlarda sonsuz bekleme olmaz. */
  timeoutMs?: number;
}

/** Varsayılan istek zaman aşımı — flaky mobil ağlarda asılı kalmayı önler. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** AbortController ile zaman aşımlı fetch. Çağıran kendi signal'ını verdiyse ona saygı duyar. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  if (init.signal) return fetch(url, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Ağ/timeout istisnalarını tek tip ApiError'a çevirir (status 0). UI ve offline kuyruk bunu yeniden-denenebilir sayar. */
function toNetworkError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const isAbort = err instanceof Error && err.name === 'AbortError';
  return isAbort
    ? new ApiError(0, 'TIMEOUT', 'İstek zaman aşımına uğradı. Bağlantınızı kontrol edin.')
    : new ApiError(0, 'NETWORK', 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
}

async function request<T>(method: string, path: string, body?: unknown, opts: RequestOpts<T> = {}): Promise<T> {
  const { schema, timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = opts;
  const baseUrl = getApiBaseUrl();
  const baseOrigin = apiBaseOrigin(baseUrl);
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  if (new URL(url).origin !== baseOrigin) {
    throw new ApiError(0, 'UNTRUSTED_API_ORIGIN', 'Kimlik bilgileri farklı bir API adresine gönderilemez.');
  }
  await ensureSessionOrigin();
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string>) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (refreshCookie) headers.Cookie = refreshCookie;
  if (activeDivision) {
    headers['X-Active-Division'] = activeDivision;
  }
  if (activeDepartment) {
    headers['X-Active-Department'] = activeDepartment;
  }

  const serializedBody = body === undefined ? undefined : JSON.stringify(body);

  let res: Response;
  try {
    res = await fetchWithTimeout(url, { ...init, method, headers, body: serializedBody }, timeoutMs);
  } catch (err) {
    throw toNetworkError(err);
  }

  if (apiBaseOrigin() !== baseOrigin) {
    throw new ApiError(0, 'API_ORIGIN_CHANGED', 'API adresi değişti; oturum sonlandırıldı.');
  }

  let cookie = mergeSetCookieHeaders(res.headers);
  if (cookie) await setRefreshCookie(cookie);

  if (res.status === 401 && !path.startsWith('/auth/')) {
    const newToken = await refreshSession();
    if (newToken) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
      try {
        res = await fetchWithTimeout(url, { ...init, method, headers: retryHeaders, body: serializedBody }, timeoutMs);
      } catch (err) {
        throw toNetworkError(err);
      }
      if (apiBaseOrigin() !== baseOrigin) {
        throw new ApiError(0, 'API_ORIGIN_CHANGED', 'API adresi değişti; oturum sonlandırıldı.');
      }
      cookie = mergeSetCookieHeaders(res.headers);
      if (cookie) await setRefreshCookie(cookie);
    } else {
      // Yenileme başarısız: bayat token ile sonsuz 401 döngüsüne girmemek için
      // oturumu temizle ve uygulamayı login'e yönlendir. (Eski kod yalnızca
      // accessToken zaten null ise tetikliyordu; bayat token varsa kullanıcı asılı kalıyordu.)
      await setAccessToken(null);
      await setRefreshCookie(null);
      onSessionExpired?.();
    }
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const json = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string; details?: unknown };
      } | null;
      throw new ApiError(res.status, json?.error?.code ?? `HTTP_${res.status}`, json?.error?.message ?? `Hata ${res.status}`, json?.error?.details);
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

// Changing a runtime API host must never carry a bearer token or refresh
// cookie to that host. AuthProvider receives the expiry signal and clears UI
// and offline state as well.
setApiOriginChangedHandler(async () => {
  await clearApiSession();
  onSessionExpired?.();
});

export const api = {
  get: <T = unknown>(p: string, o?: RequestOpts<T>) => request<T>('GET', p, undefined, o),
  post: <T = unknown>(p: string, b?: unknown, o?: RequestOpts<T>) => request<T>('POST', p, b, o),
  patch: <T = unknown>(p: string, b?: unknown, o?: RequestOpts<T>) => request<T>('PATCH', p, b, o),
  put: <T = unknown>(p: string, b?: unknown, o?: RequestOpts<T>) => request<T>('PUT', p, b, o),
  delete: <T = unknown>(p: string, o?: RequestOpts<T>) => request<T>('DELETE', p, undefined, o),
};
