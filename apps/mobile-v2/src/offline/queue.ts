import * as SecureStore from '@/src/security/secure-store';
import { ApiError, OfflineError } from '@/src/api/client';
import { companies, inventoryApi } from '@/src/api/endpoints';
import { quoteOpportunityApi, quotesApi, type QuoteCreateInput, type QuoteItemInput, type QuoteTermsInput } from '@/src/api/quotes.api';
import { itemsNetTotal } from '@/src/ui/documents/quote-logic';
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

/** Web `createQuoteFull` ile aynı iş; mobil saha formu offline kuyruğa yazılır. */
export type QuoteCreateQueuePayload = {
  operationId: string;
  quote: QuoteCreateInput;
  items: QuoteItemInput[];
  terms: QuoteTermsInput;
};

export type InventoryReserveQueuePayload = {
  operationId: string;
  id: string;
  companyId: string;
  opportunityId?: string;
  quoteId?: string;
  notes?: string;
};

export type MutationKind = 'company.status' | 'quote.create' | 'inventory.reserve';

export type QueuePayload =
  | CompanyStatusQueuePayload
  | QuoteCreateQueuePayload
  | InventoryReserveQueuePayload;

export type QueuedMutation = {
  id: string;
  kind: MutationKind;
  payload: QueuePayload;
  scope: QueueScope;
  createdAt: string;
  retryCount: number;
  nextAttemptAt: number;
  state: 'pending' | 'failed';
  failure?: 'conflict' | 'rejected' | 'retry_exhausted';
  lastStatus?: number;
};

export const MUTATION_KIND_LABELS: Record<MutationKind, string> = {
  'company.status': 'Firma durumu',
  'quote.create': 'Teklif oluşturma',
  'inventory.reserve': 'Stok rezervasyonu',
};

const records = new Map<string, QueuedMutation>();
const listeners = new Set<(pending: number) => void>();
let currentScope: QueueScope | null = null;
let scopeGeneration = 0;
export function queueScopeSnapshot(): QueueScope | null { return currentScope ? { ...currentScope } : null; }
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

function isCompanyStatusPayload(payload: Record<string, unknown>, operationId: string): boolean {
  return typeof payload.id === 'string'
    && UUID_PATTERN.test(payload.id)
    && typeof payload.operationId === 'string'
    && payload.operationId === operationId
    && typeof payload.customerStatusCode === 'string'
    && STATUS_CODES.has(payload.customerStatusCode);
}

function isQuoteCreatePayload(payload: Record<string, unknown>, operationId: string): boolean {
  const quote = payload.quote as QuoteCreateInput | undefined;
  const items = payload.items;
  const terms = payload.terms;
  return typeof payload.operationId === 'string'
    && payload.operationId === operationId
    && Boolean(quote)
    && typeof quote === 'object'
    && typeof quote.companyId === 'string'
    && UUID_PATTERN.test(quote.companyId)
    && Array.isArray(items)
    && items.length > 0
    && items.length <= 80
    && Boolean(terms)
    && typeof terms === 'object';
}

function isInventoryReservePayload(payload: Record<string, unknown>, operationId: string): boolean {
  return typeof payload.operationId === 'string'
    && payload.operationId === operationId
    && typeof payload.id === 'string'
    && UUID_PATTERN.test(payload.id)
    && typeof payload.companyId === 'string'
    && UUID_PATTERN.test(payload.companyId)
    && (payload.opportunityId === undefined || (typeof payload.opportunityId === 'string' && UUID_PATTERN.test(payload.opportunityId)))
    && (payload.quoteId === undefined || (typeof payload.quoteId === 'string' && UUID_PATTERN.test(payload.quoteId)))
    && (payload.notes === undefined || (typeof payload.notes === 'string' && payload.notes.length <= 2000));
}

function isQueuedMutation(value: unknown): value is QueuedMutation {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const payload = row.payload as Record<string, unknown> | undefined;
  if (typeof row.id !== 'string' || !UUID_PATTERN.test(row.id) || !isScope(row.scope)) return false;
  if (typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) return false;
  if (typeof row.retryCount !== 'number' || !Number.isInteger(row.retryCount) || row.retryCount < 0) return false;
  if (typeof row.nextAttemptAt !== 'number') return false;
  if (row.state !== 'pending' && row.state !== 'failed') return false;
  if (!payload) return false;
  if (row.kind === 'company.status') return isCompanyStatusPayload(payload, row.id);
  if (row.kind === 'quote.create') return isQuoteCreatePayload(payload, row.id);
  if (row.kind === 'inventory.reserve') return isInventoryReservePayload(payload, row.id);
  return false;
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
    hydrated = true;
  } finally {
    notify();
  }
}

export function setQueueScope(scope: QueueScope | null): void {
  if (JSON.stringify(currentScope) !== JSON.stringify(scope)) scopeGeneration += 1;
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

/** Ayarlar ekranı için görünür kuyruk kopyası (yeniden eskiye). */
export function listQueuedMutations(): QueuedMutation[] {
  return visibleRecords().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function operationIdOf(payload: QueuePayload): string {
  return payload.operationId;
}

function validatePayload(kind: MutationKind, payload: QueuePayload): boolean {
  const asRecord = payload as unknown as Record<string, unknown>;
  if (kind === 'company.status') return isCompanyStatusPayload(asRecord, payload.operationId);
  if (kind === 'quote.create') return isQuoteCreatePayload(asRecord, payload.operationId);
  if (kind === 'inventory.reserve') return isInventoryReservePayload(asRecord, payload.operationId);
  return false;
}

export async function enqueue(kind: MutationKind, payload: QueuePayload, expectedScope = queueScopeSnapshot()): Promise<QueuedMutation> {
  const generation = scopeGeneration;
  const assertScope = () => {
    if (generation !== scopeGeneration || !expectedScope || !currentScope || JSON.stringify(expectedScope) !== JSON.stringify(currentScope)) throw new Error('Çalışma alanı değişti; işlem kuyruğa alınmadı.');
  };
  await hydrateQueue();
  assertScope();
  if (!currentScope) throw new Error('Çevrimdışı işlem için güvenli kullanıcı kapsamı bulunamadı.');
  if (!validatePayload(kind, payload)) throw new Error('Çevrimdışı işlem güvenli biçimde doğrulanamadı.');
  const operationId = operationIdOf(payload);
  if (!UUID_PATTERN.test(operationId)) throw new Error('Çevrimdışı işlem güvenli biçimde doğrulanamadı.');
  const existing = records.get(operationId);
  if (existing) {
    if (!sameOwner(existing.scope, currentScope)) throw new Error('İşlem farklı hesaba ait.');
    return existing;
  }
  if (records.size >= MAX_ITEMS) throw new Error('Güvenli çevrimdışı işlem kuyruğu dolu; önce bekleyen işlemleri eşitleyin.');

  const item: QueuedMutation = {
    id: operationId,
    kind,
    payload,
    scope: { ...expectedScope! },
    createdAt: new Date().toISOString(),
    retryCount: 0,
    nextAttemptAt: Date.now(),
    state: 'pending',
  };
  // Önce şifreli record, sonra yalnız UUID içeren index yazılır. Index yazımı
  // yarıda kalırsa record silinir; kullanıcıya kaydedildi yalanı söylenmez.
  await persistRecord(item);
  try { assertScope(); } catch (error) { await SecureStore.deleteItemAsync(recordKey(item.id)); throw error; }
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

async function replayQuoteCreate(payload: QuoteCreateQueuePayload): Promise<void> {
  let opportunityId = payload.quote.opportunityId ?? undefined;
  let createdNewCase = false;
  if (!opportunityId) {
    const opportunity = await quoteOpportunityApi.create({
      companyId: payload.quote.companyId,
      title: payload.items[0]?.description.slice(0, 255) || 'Yeni Teklif',
      estimatedValue: itemsNetTotal(payload.items.map((row) => ({ ...row, itemId: undefined }))),
      currencyCode: payload.quote.currencyCode,
      probability: 50,
      ...(payload.quote.divisionId ? { divisionId: payload.quote.divisionId } : {}),
    });
    opportunityId = opportunity.id;
    createdNewCase = true;
  }
  const created = await quotesApi.create({ ...payload.quote, opportunityId });
  for (const row of payload.items) {
    await quotesApi.addItem(created.id, row);
  }
  await quotesApi.terms(created.id, payload.terms);
  if (createdNewCase && opportunityId) {
    await quoteOpportunityApi.changeStage(opportunityId, { toStage: 'quote' }).catch(() => undefined);
  }
}

async function replay(item: QueuedMutation): Promise<void> {
  if (item.kind === 'company.status') {
    const payload = item.payload as CompanyStatusQueuePayload;
    await companies.updateStatus(
      payload.id,
      {
        customerStatusCode: payload.customerStatusCode,
        operationId: payload.operationId,
      },
      {
        divisionId: item.scope.divisionId,
        departmentId: item.scope.departmentId,
      },
    );
    return;
  }
  if (item.kind === 'quote.create') {
    await replayQuoteCreate(item.payload as QuoteCreateQueuePayload);
    return;
  }
  if (item.kind === 'inventory.reserve') {
    const payload = item.payload as InventoryReserveQueuePayload;
    await inventoryApi.reserve(payload.id, {
      companyId: payload.companyId,
      ...(payload.opportunityId ? { opportunityId: payload.opportunityId } : {}),
      ...(payload.quoteId ? { quoteId: payload.quoteId } : {}),
      ...(payload.notes ? { notes: payload.notes } : {}),
    });
  }
}

async function performFlush(): Promise<FlushResult> {
  await hydrateQueue();
  if (!currentScope) return { sent: 0, failed: 0, remaining: 0 };
  const generation = scopeGeneration;
  const owner = { ...currentScope };
  let sent = 0;
  let failed = 0;
  const candidates = visibleRecords()
    .filter((item) => item.state === 'pending')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  for (const item of candidates) {
    if (generation !== scopeGeneration || !currentScope || !sameOwner(owner, currentScope)) break;
    if (item.nextAttemptAt > Date.now()) continue;
    try {
      await replay(item);
      await removeRecord(item.id);
      sent += 1;
    } catch (error) {
      if (generation !== scopeGeneration) break;
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
