import type { ZodType } from 'zod';
import { activeScope } from '@/src/auth/scope';
import { serverMessage } from '@/src/lib/serverMessage';
import { authRefreshResponseSchema } from './auth-schemas';
import { apiBaseUrl } from './config';

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_CONCURRENT_REQUESTS = 8;
const MAX_RATE_LIMIT_RETRIES = 2;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
    readonly code?: string,
    readonly requestId?: string,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 409 = başkası aynı kaydı güncellemiş (optimistic locking, bkz. §3.2). */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

/** Ağ yok / sunucuya ulaşılamıyor. Kuyruğa alma kararı buna bakar. */
export class OfflineError extends Error {
  constructor() {
    super('Cihaz çevrimdışı');
    this.name = 'OfflineError';
  }
}

export class RequestTimeoutError extends Error {
  constructor() {
    super('İstek zaman aşımına uğradı. Lütfen tekrar deneyin.');
    this.name = 'RequestTimeoutError';
  }
}

let accessToken: string | null = null;
const accessTokenListeners = new Set<(token: string | null) => void>();

export async function loadAccessToken(): Promise<string | null> {
  return accessToken;
}

/** Socket.IO gibi senkron kimlik doğrulama isteyen native istemciler için salt-okunur bellek görünümü. */
export function accessTokenSnapshot(): string | null {
  return accessToken;
}

export function subscribeAccessToken(listener: (token: string | null) => void): () => void {
  accessTokenListeners.add(listener);
  listener(accessToken);
  return () => accessTokenListeners.delete(listener);
}

export async function setAccessToken(token: string | null): Promise<void> {
  if (accessToken === token) return;
  accessToken = token;
  for (const listener of accessTokenListeners) listener(token);
}

/** 401 sonrası oturumu düşürmek için AuthProvider tarafından bağlanır. */
let onSessionLost: (() => void) | null = null;
export function setSessionLostHandler(fn: (() => void) | null): void {
  onSessionLost = fn;
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(apiBaseUrl() + (path.startsWith('/') ? path : `/${path}`));
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
    else url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export type RequestOptions<T = unknown> = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  schema?: ZodType<T>;
  headers?: Record<string, string>;
  /** İç kullanım: yenileme döngüsünü kırmak için. */
  skipRefresh?: boolean;
};

let activeRequests = 0;
const requestWaiters: Array<() => void> = [];

async function acquireRequestSlot(): Promise<() => void> {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>((resolve) => requestWaiters.push(resolve));
  }
  activeRequests += 1;
  return () => {
    activeRequests -= 1;
    requestWaiters.shift()?.();
  };
}

function retryAfterMs(response: Response): number | undefined {
  const raw = response.headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rawRequest(path: string, opts: RequestOptions): Promise<Response> {
  const token = await loadAccessToken();
  const scope = activeScope();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  opts.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const release = await acquireRequestSlot();
  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // `all` ile başlığın hiç olmaması okumalarda benzer görünse de create
        // atama mantığında farklıdır; seçim yoksa niyeti açıkça gönder.
        'X-Active-Division': scope.divisionId ?? 'all',
        'X-Active-Department': scope.departmentId ?? 'all',
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    if (controller.signal.aborted) throw new RequestTimeoutError();
    // fetch yalnızca ağ katmanı hatasında throw eder; HTTP hataları throw etmez.
    throw new OfflineError();
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', abortFromCaller);
    release();
  }
}

/**
 * Yenileme token'ı sunucuda httpOnly çerezde tutuluyor (auth.controller.ts).
 * React Native'in fetch'i platformun çerez kavanozunu kullandığı için gövdesiz
 * bir POST yeterli; ayrıca token saklamıyoruz.
 */
let refreshPromise: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  try {
    const res = await rawRequest('/auth/refresh', { method: 'POST', skipRefresh: true });
    if (!res.ok) return false;
    const parsed = authRefreshResponseSchema.safeParse(await res.json());
    // Cookie yokluğu (`accessToken: null`) normal bir unauthenticated yanıttır.
    // Bunun dışındaki wire drift'i fail-closed ele alınır; bilinmeyen veriden
    // oturum üretmeyiz ve credential içeriğini loglamayız.
    if (!parsed.success || !parsed.data.accessToken) return false;
    await setAccessToken(parsed.data.accessToken);
    return true;
  } catch (error) {
    if (error instanceof OfflineError || error instanceof RequestTimeoutError) throw error;
    return false;
  }
}

export async function refreshSession(): Promise<boolean> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function requestWithRateLimit(path: string, opts: RequestOptions): Promise<Response> {
  let response = await rawRequest(path, opts);
  const retryable = (opts.method ?? 'GET') === 'GET';
  for (let attempt = 0; retryable && response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const delay = retryAfterMs(response) ?? Math.min(4_000, 500 * 2 ** attempt + Math.random() * 250);
    await wait(delay);
    response = await rawRequest(path, opts);
  }
  return response;
}

export async function request<T>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
  let res = await requestWithRateLimit(path, opts);

  if (res.status === 401 && !opts.skipRefresh) {
    if (await refreshSession()) {
      res = await requestWithRateLimit(path, { ...opts, skipRefresh: true });
    } else {
      await setAccessToken(null);
      onSessionLost?.();
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed = text ? safeJson(text) : undefined;

  if (!res.ok) {
    // Sunucu hata gövdesini asla ham göstermiyoruz; kullanıcıya dönecek mesaj burada seçilir.
    const envelope = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
    const nested = envelope?.error && typeof envelope.error === 'object' ? (envelope.error as Record<string, unknown>) : undefined;
    throw new ApiError(
      res.status,
      messageFor(res.status, parsed),
      parsed,
      typeof nested?.code === 'string' ? nested.code : undefined,
      res.headers.get('x-request-id') ?? (typeof nested?.requestId === 'string' ? nested.requestId : undefined),
      retryAfterMs(res)
    );
  }
  if (opts.schema) {
    const validated = opts.schema.safeParse(parsed);
    if (!validated.success) {
      throw new ApiError(502, 'Sunucu yanıtı beklenen biçimde değil.', undefined, 'CONTRACT_MISMATCH');
    }
    return validated.data;
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function messageFor(status: number, body: unknown): string {
  const fromBody = serverMessage(body);
  if (fromBody) return fromBody;
  if (status === 401) return 'Oturumunuz sona erdi, lütfen yeniden giriş yapın.';
  if (status === 403) return 'Bu işlem için yetkiniz yok.';
  if (status === 404) return 'Kayıt bulunamadı.';
  if (status === 409) return 'Bu kayıt başkası tarafından güncellenmiş.';
  if (status === 422 || status === 400) return 'Gönderilen bilgiler geçersiz.';
  if (status === 429) return 'Çok fazla istek gönderildi, biraz sonra tekrar deneyin.';
  return 'Bir şeyler ters gitti.';
}

/** Sunucunun sayfalı liste zarfı: buildPaginated (apps/api/src/shared). */
export type Paginated<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};
