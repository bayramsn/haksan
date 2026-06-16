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
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:3000/api/v1';

export const API_BASE_URL = BASE_URL;

/** API host without `/api/v1` — health checks live at `/health/*` on the root. */
export const API_ORIGIN = BASE_URL.replace(/\/api\/v\d+\/?$/, '');

/**
 * Resolve a stored media reference into a loadable URL.
 *  - Relative API paths (e.g. "/products/media/<id>") are served by the public
 *    streaming endpoint and need the API origin prefixed.
 *  - Absolute URLs (legacy imageUrl, unsplash, etc.) are returned unchanged.
 */
export function resolveMediaUrl(ref?: string | null): string {
  if (!ref) return '';
  if (/^https?:\/\//i.test(ref) || ref.startsWith('data:')) return ref;
  if (ref.startsWith('/')) return `${BASE_URL}${ref}`;
  return ref;
}

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
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
      accessToken = t;
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

  let res = await fetch(url, {
    ...init,
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });

  // Auto-refresh on 401, then retry once. We attempt the refresh even when the
  // in-memory access token is null — after a page reload the token is reset to
  // null but a valid refresh cookie can still mint a new one, so a request that
  // fires before AuthProvider's refresh completes recovers transparently
  // instead of failing with "Token gerekli".
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const newToken = await tryRefresh();
    if (newToken) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
      res = await fetch(url, {
        ...init,
        method,
        headers: retryHeaders,
        credentials: 'include',
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      });
    }
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: unknown } } | null;
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
