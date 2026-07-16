/**
 * Lightweight fetch wrapper. Adds bearer token, parses JSON, throws ApiError
 * on non-2xx so TanStack Query can detect failures cleanly.
 *
 *   const c = createApiClient({ baseUrl, getToken: () => accessToken })
 *   await c.get('/companies')                       // GET
 *   await c.post('/companies', { legalTitle: '…' }) // POST JSON
 */

import type { ZodType } from 'zod';

/**
 * Per-request options. `schema`, when provided, validates the parsed JSON
 * response against a shared zod schema so contract drift surfaces immediately
 * on the client instead of as a downstream `undefined`.
 */
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
  // ES2022 Error.cause; tsconfig lib hedefi daha eski olduğundan açıkça bildirilir.
  cause?: unknown;

  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:3000/api/v1';

export const API_BASE_URL = BASE_URL;

/** API host without `/api/v1` — health checks live at `/health/*` on the root. */
export const API_ORIGIN = BASE_URL.replace(/\/api\/v\d+\/?$/, '');

const VERSIONED_API_PATH_RE = /^\/api\/v\d+(?:\/|$)/i;

/**
 * Resolve a stored media reference into a loadable URL.
 *  - Relative API paths (e.g. "/products/media/<id>") are served by the public
 *    streaming endpoint and need the API origin prefixed.
 *  - Absolute URLs (legacy imageUrl, unsplash, etc.) are returned unchanged.
 */
export function resolveMediaUrlAgainstBase(ref: string | null | undefined, baseUrl: string): string {
  const clean = ref?.trim();
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean) || clean.startsWith('data:') || clean.startsWith('blob:')) return clean;

  const normalizedBase = baseUrl.replace(/\/$/, '');
  const apiOrigin = normalizedBase.replace(/\/api\/v\d+\/?$/i, '');
  if (VERSIONED_API_PATH_RE.test(clean)) return `${apiOrigin}${clean}`;
  if (clean.startsWith('/')) return `${normalizedBase}${clean}`;
  return clean;
}

export function resolveMediaUrl(ref?: string | null): string {
  return resolveMediaUrlAgainstBase(ref, BASE_URL);
}

const ACTIVE_DIVISION_STORAGE_KEY = 'haksan_active_division';
const ACTIVE_DEPARTMENT_STORAGE_KEY = 'haksan_active_department';

// Access token YALNIZCA bellekte tutulur (sessionStorage/localStorage DEĞİL) — XSS ile
// sızdırılmasını önler. Sayfa yenilemede httpOnly refresh cookie'siyle /auth/refresh
// üzerinden sessizce yeniden alınır (bkz. tryRefresh + 401 auto-retry). CLAUDE.md #4/#11.
let accessToken: string | null = null;
let activeDivision: string | null = readStoredActiveDivision();
let activeDepartment: string | null = readStoredActiveDepartment();
let refreshing: Promise<string | null> | null = null;
let onSessionExpired: (() => void) | null = null;

const API_MAX_CONCURRENT_REQUESTS = 4;
const API_REQUEST_SPACING_MS = 120;
const API_RATE_LIMIT_RETRIES = 2;

let activeScheduledRequests = 0;
let nextScheduledRequestAt = 0;
const requestQueue: Array<() => void> = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function drainRequestQueue(): void {
  while (activeScheduledRequests < API_MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
    const run = requestQueue.shift();
    run?.();
  }
}

function scheduleApiRequest<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requestQueue.push(() => {
      activeScheduledRequests += 1;
      const now = Date.now();
      const waitMs = Math.max(0, nextScheduledRequestAt - now);
      nextScheduledRequestAt = Math.max(now, nextScheduledRequestAt) + API_REQUEST_SPACING_MS;

      window.setTimeout(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            activeScheduledRequests -= 1;
            drainRequestQueue();
          });
      }, waitMs);
    });
    drainRequestQueue();
  });
}

function retryAfterMs(res: Response, attempt: number): number {
  const header = res.headers.get('retry-after')?.trim();
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.max(seconds * 1000, 250), 10_000);
    const dateMs = Date.parse(header);
    if (Number.isFinite(dateMs)) return Math.min(Math.max(250, dateMs - Date.now()), 10_000);
  }
  return Math.min(1_000 * 2 ** attempt, 5_000) + Math.floor(Math.random() * 400);
}

// Her deneme kuyruğa ayrı girer: 429 sonrası bekleme slot tutmaz, diğer
// istekler retry beklemesi sırasında akmaya devam eder.
async function fetchWithRateLimitRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await scheduleApiRequest(() => fetch(input, init));
    if (res.status !== 429 || attempt >= API_RATE_LIMIT_RETRIES) return res;
    await sleep(retryAfterMs(res, attempt));
  }
}

function readStoredActiveDivision(): string | null {
  try {
    return localStorage.getItem(ACTIVE_DIVISION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readStoredActiveDepartment(): string | null {
  try {
    return localStorage.getItem(ACTIVE_DEPARTMENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Aktif bölüm (CNC/Üniversal/Sac veya 'all'). Her istekte backend'e
 * X-Active-Division olarak gider; localStorage'da kalıcıdır.
 */
export function setActiveDivision(value: string | null): void {
  activeDivision = value;
  try {
    if (value) localStorage.setItem(ACTIVE_DIVISION_STORAGE_KEY, value);
    else localStorage.removeItem(ACTIVE_DIVISION_STORAGE_KEY);
  } catch {
    // storage unavailable — in-memory value still applies for this tab
  }
}

export function getActiveDivision(): string | null {
  return activeDivision;
}

export function setActiveDepartment(value: string | null): void {
  activeDepartment = value;
  try {
    if (value) localStorage.setItem(ACTIVE_DEPARTMENT_STORAGE_KEY, value);
    else localStorage.removeItem(ACTIVE_DEPARTMENT_STORAGE_KEY);
  } catch {
    // storage unavailable — in-memory value still applies for this tab
  }
}

export function getActiveDepartment(): string | null {
  return activeDepartment;
}

/** AuthProvider registers a handler so a hard 401 clears stale React session state. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
/** Cookie tabanlı oturum yenileme — gövdesiz POST (Fastify boş JSON reddeder). */
export async function refreshSession(): Promise<string | null> {
  return tryRefresh();
}
export function getAccessToken(): string | null {
  return accessToken;
}

async function tryRefresh(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      const json = (await res.json()) as { accessToken?: string | null };
      const t = json.accessToken ?? null;
      // Only adopt a newly minted token — never wipe an in-memory token when refresh
      // fails (e.g. missing cookie) so authed UI doesn't fire unauthenticated API calls.
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
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string>) };
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (activeDivision) {
    headers['X-Active-Division'] = activeDivision;
  }
  if (activeDepartment) {
    headers['X-Active-Department'] = activeDepartment;
  }

  let res: Response;
  try {
    res = await fetchWithRateLimitRetry(url, {
      ...init,
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch (cause) {
    const error = new ApiError(0, 'NETWORK_ERROR', 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.');
    error.cause = cause;
    throw error;
  }

  // Auto-refresh on 401, then retry once. We attempt the refresh even when the
  // in-memory access token is null — after a page reload the token is reset to
  // null but a valid refresh cookie can still mint a new one, so a request that
  // fires before AuthProvider's refresh completes recovers transparently
  // instead of failing with "Token gerekli".
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const newToken = await tryRefresh();
    if (newToken) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
      res = await fetchWithRateLimitRetry(url, {
        ...init,
        method,
        headers: retryHeaders,
        credentials: 'include',
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      });
    } else if (!accessToken) {
      onSessionExpired?.();
    }
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } } | null;
      const code = json?.error?.code ?? `HTTP_${res.status}`;
      const message = json?.error?.message ?? `Hata ${res.status}`;
      const requestId = json?.error?.requestId ?? res.headers.get('x-request-id') ?? undefined;
      throw new ApiError(res.status, code, message, json?.error?.details, requestId);
    }
    throw new ApiError(
      res.status,
      `HTTP_${res.status}`,
      res.statusText || `Hata ${res.status}`,
      undefined,
      res.headers.get('x-request-id') ?? undefined
    );
  }

  if (contentType.includes('application/json')) {
    const json = await res.json();
    if (!schema) return json as T;
    const parsed = schema.safeParse(json);
    if (parsed.success) return parsed.data;
    // Response shape diverged from the shared contract. Surface as an ApiError so
    // callers handle it uniformly; log details for debugging in dev tools.
    console.error(`[apiClient] response contract violation for ${method} ${path}`, parsed.error.issues);
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
