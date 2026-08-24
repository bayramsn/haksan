import * as SecureStore from 'expo-secure-store';
import { ApiError, OfflineError } from '@/src/api/client';
import { companies } from '@/src/api/endpoints';
import { classifyFailure } from './failure';

const INDEX_KEY = 'haksan.offline.index.v3';
const RECORD_PREFIX = 'haksan.offline.record.v3.';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_CODES = new Set(['potential', 'active', 'passive', 'blacklist']);
const MAX_ITEMS = 100;
const MAX_RETRIES = 5;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type QueueScope = {
  apiOrigin: string;
  tenantId: string;
  userId: string;
  divisionId: string | null;
  departmentId: string | null;
};

export type CompanyStatusQueuePayload = {
  id: string;
  customerStatusCode: 'potential' | 'active' | 'passive' | 'blacklist';
  operationId: string;
};

export type MutationKind = 'company.status';
export type QueuedMutation = {
  id: string;
  kind: MutationKind;
  payload: CompanyStatusQueuePayload;
  scope: QueueScope;
  createdAt: string;
  retryCount: number;
  nextAttemptAt: number;
  state: 'pending' | 'failed';
  failure?: 'conflict' | 'rejected' | 'retry_exhausted';
  lastStatus?: number;
};

const records = new Map<string, QueuedMutation>();
const listeners = new Set<(pending: number) => void>();
let currentScope: QueueScope | null = null;
let hydrated = false;
let flushing: Promise<FlushResult> | null = null;

function secureOptions(): SecureStore.SecureStoreOptions {
  return { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
}

function isScope(value: unknown): value is QueueScope {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.apiOrigin === 'string'
    && row.apiOrigin.length <= 512
    && typeof row.tenantId === 'string'
    && typeof row.userId === 'string'
    && (row.divisionId === null || typeof row.divisionId === 'string')
    && (row.departmentId === null || typeof row.departmentId === 'string');
}

function isQueuedMutation(value: unknown): value is QueuedMutation {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const payload = row.payload as Record<string, unknown> | undefined;
  return typeof row.id === 'string'
    && UUID_PATTERN.test(row.id)
    && row.kind === 'company.status'
    && isScope(row.scope)
    && typeof row.createdAt === 'string'
    && Number.isFinite(Date.parse(row.createdAt))
    && typeof row.retryCount === 'number'
    && Number.isInteger(row.retryCount)
    && row.retryCount >= 0
    && typeof row.nextAttemptAt === 'number'
    && (row.state === 'pending' || row.state === 'failed')
    && Boolean(payload)
    && typeof payload!.id === 'string'
    && UUID_PATTERN.test(payload!.id)
    && typeof payload!.operationId === 'string'
    && payload!.operationId === row.id
    && typeof payload!.customerStatusCode === 'string'
    && STATUS_CODES.has(payload!.customerStatusCode);
}

function recordKey(id: string): string {
  return `${RECORD_PREFIX}${id}`;
}

async function persistIndex(): Promise<void> {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify([...records.keys()]), secureOptions());
}

async function persistRecord(item: QueuedMutation): Promise<void> {
  await SecureStore.setItemAsync(recordKey(item.id), JSON.stringify(item), secureOptions());
}

async function removeRecord(id: string): Promise<void> {
  records.delete(id);
  await SecureStore.deleteItemAsync(recordKey(id));
  await persistIndex();
}

function sameOwner(left: QueueScope, right: QueueScope): boolean {
  return left.apiOrigin === right.apiOrigin && left.tenantId === right.tenantId && left.userId === right.userId;
}

function visibleRecords(): QueuedMutation[] {
  if (!currentScope) return [];
  return [...records.values()].filter((item) => sameOwner(item.scope, currentScope!));
}

function notify(): void {
  const count = visibleRecords().length;
  for (const listener of listeners) listener(count);
}

/** SecureStore kuyruğunu uygulama render edilmeden önce belleğe alır. */
export async function hydrateQueue(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await SecureStore.getItemAsync(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const ids = Array.isArray(parsed)
      ? [...new Set(parsed.filter((id): id is string => typeof id === 'string' && UUID_PATTERN.test(id)))].slice(0, MAX_ITEMS)
      : [];
    const expiredBefore = Date.now() - MAX_AGE_MS;
    for (const id of ids) {
      const stored = await SecureStore.getItemAsync(recordKey(id));
      if (!stored) continue;
      try {
        const item: unknown = JSON.parse(stored);
        if (isQueuedMutation(item) && Date.parse(item.createdAt) >= expiredBefore) records.set(id, item);
        else await SecureStore.deleteItemAsync(recordKey(id));
      } catch {
        await SecureStore.deleteItemAsync(recordKey(id));
      }
    }
    await persistIndex();
  } finally {
    hydrated = true;
    notify();
  }
}

export function setQueueScope(scope: QueueScope | null): void {
  currentScope = scope;
  notify();
}

export function subscribeQueue(listener: (pending: number) => void): () => void {
  listeners.add(listener);
  listener(visibleRecords().length);
  return () => listeners.delete(listener);
}

export function pendingCount(): number {
  return visibleRecords().length;
}

export function failedCount(): number {
  return visibleRecords().filter((item) => item.state === 'failed').length;
}

export async function enqueue(kind: MutationKind, payload: CompanyStatusQueuePayload): Promise<QueuedMutation> {
  await hydrateQueue();
  if (!currentScope) throw new Error('Çevrimdışı işlem için güvenli kullanıcı kapsamı bulunamadı.');
  if (kind !== 'company.status' || !UUID_PATTERN.test(payload.id) || !UUID_PATTERN.test(payload.operationId) || !STATUS_CODES.has(payload.customerStatusCode)) {
    throw new Error('Çevrimdışı işlem güvenli biçimde doğrulanamadı.');
  }
  const existing = records.get(payload.operationId);
  if (existing) return existing;
  if (records.size >= MAX_ITEMS) throw new Error('Güvenli çevrimdışı işlem kuyruğu dolu; önce bekleyen işlemleri eşitleyin.');

  const item: QueuedMutation = {
    id: payload.operationId,
    kind,
    payload,
    scope: { ...currentScope },
    createdAt: new Date().toISOString(),
    retryCount: 0,
    nextAttemptAt: Date.now(),
    state: 'pending',
  };
  // Önce şifreli record, sonra yalnız UUID içeren index yazılır. Index yazımı
  // yarıda kalırsa record silinir; kullanıcıya kaydedildi yalanı söylenmez.
  await persistRecord(item);
  records.set(item.id, item);
  try {
    await persistIndex();
  } catch (error) {
    records.delete(item.id);
    await SecureStore.deleteItemAsync(recordKey(item.id)).catch(() => undefined);
    throw error;
  }
  notify();
  return item;
}

export type FlushResult = { sent: number; failed: number; remaining: number };

async function replay(item: QueuedMutation): Promise<void> {
  await companies.updateStatus(
    item.payload.id,
    {
      customerStatusCode: item.payload.customerStatusCode,
      operationId: item.payload.operationId,
    },
    {
      divisionId: item.scope.divisionId,
      departmentId: item.scope.departmentId,
    },
  );
}

async function performFlush(): Promise<FlushResult> {
  await hydrateQueue();
  if (!currentScope) return { sent: 0, failed: 0, remaining: 0 };
  let sent = 0;
  let failed = 0;
  const candidates = visibleRecords()
    .filter((item) => item.state === 'pending')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  for (const item of candidates) {
    if (item.nextAttemptAt > Date.now()) continue;
    try {
      await replay(item);
      await removeRecord(item.id);
      sent += 1;
    } catch (error) {
      const action = classifyFailure({
        offline: error instanceof OfflineError,
        status: error instanceof ApiError ? error.status : undefined,
        retryCount: item.retryCount,
        maxRetries: MAX_RETRIES,
      });
      if (action === 'offline') break;
      if (action === 'retry') {
        const updated: QueuedMutation = {
          ...item,
          retryCount: item.retryCount + 1,
          nextAttemptAt: Date.now() + Math.min(60_000, 1_000 * 2 ** item.retryCount),
          lastStatus: error instanceof ApiError ? error.status : undefined,
        };
        records.set(item.id, updated);
        await persistRecord(updated);
        break;
      }
      const updated: QueuedMutation = {
        ...item,
        state: 'failed',
        failure: action === 'conflict'
          ? 'conflict'
          : item.retryCount + 1 >= MAX_RETRIES ? 'retry_exhausted' : 'rejected',
        lastStatus: error instanceof ApiError ? error.status : undefined,
      };
      records.set(item.id, updated);
      await persistRecord(updated);
      failed += 1;
    }
  }
  notify();
  return { sent, failed, remaining: visibleRecords().length };
}

export function flushQueue(): Promise<FlushResult> {
  flushing ??= performFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Yalnız kullanıcı açıkça isterse, sadece aktif hesaba ait kayıtları siler. */
export async function clearQueue(): Promise<void> {
  if (!currentScope) return;
  const ids = visibleRecords().map((item) => item.id);
  for (const id of ids) {
    records.delete(id);
    await SecureStore.deleteItemAsync(recordKey(id));
  }
  await persistIndex();
  notify();
}

/** Kullanıcının açık onayıyla yalnız başarısız/dead-letter kayıtlarını siler. */
export async function clearFailedQueue(): Promise<void> {
  if (!currentScope) return;
  const ids = visibleRecords().filter((item) => item.state === 'failed').map((item) => item.id);
  for (const id of ids) {
    records.delete(id);
    await SecureStore.deleteItemAsync(recordKey(id));
  }
  await persistIndex();
  notify();
}
