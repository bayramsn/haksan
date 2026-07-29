import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { serviceService } from '@/src/api/services';
import { ApiError } from '@/src/api/apiClient';
import { apiBaseOrigin } from '@/src/api/config';

const LEGACY_QUEUE_KEY = 'haksan_offline_mutations';
const INDEX_PREFIX = 'haksan_offline_mutations:index:';
const ITEM_PREFIX = 'haksan_offline_mutations:item:';
const MAX_QUEUE_ITEMS = 20;

export type OfflineMutation =
  | {
      id: string;
      kind: 'service-complete';
      createdAt: string;
      payload: { ticketId: string; notes: string };
    }
  | {
      id: string;
      kind: 'visit';
      createdAt: string;
      payload: Record<string, unknown>;
    };

type QueueScope = { tenantId: string; userId: string; origin: string };
type ScopedOfflineMutation = OfflineMutation & QueueScope;

let activeScope: QueueScope | null = null;
let legacyQueueRemoved = false;

function scopeKey(scope: QueueScope): string {
  return `${scope.origin}:${scope.tenantId}:${scope.userId}`;
}

function indexKey(scope: QueueScope): string {
  return `${INDEX_PREFIX}${scopeKey(scope)}`;
}

function itemKey(scope: QueueScope, id: string): string {
  return `${ITEM_PREFIX}${scopeKey(scope)}:${id}`;
}

async function removeLegacyPlaintextQueue(): Promise<void> {
  if (legacyQueueRemoved) return;
  legacyQueueRemoved = true;
  // Older releases used AsyncStorage. Never deserialize that PII; remove it
  // during the first authenticated session before any secure queue is used.
  await AsyncStorage.removeItem(LEGACY_QUEUE_KEY).catch(() => undefined);
}

function requireScope(): QueueScope {
  if (!activeScope || activeScope.origin !== apiBaseOrigin()) {
    throw new ApiError(401, 'OFFLINE_QUEUE_SCOPE', 'Offline kuyruk için aktif oturum gerekli.');
  }
  return activeScope;
}

async function readIndex(scope: QueueScope): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(indexKey(scope));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    await SecureStore.deleteItemAsync(indexKey(scope));
    return [];
  }
}

async function readQueue(scope = requireScope()): Promise<ScopedOfflineMutation[]> {
  const ids = await readIndex(scope);
  const queue: ScopedOfflineMutation[] = [];
  for (const id of ids) {
    const raw = await SecureStore.getItemAsync(itemKey(scope, id));
    if (!raw) continue;
    try {
      const item = JSON.parse(raw) as ScopedOfflineMutation;
      if (item.id === id && item.userId === scope.userId && item.tenantId === scope.tenantId && item.origin === scope.origin) {
        queue.push(item);
      } else {
        await SecureStore.deleteItemAsync(itemKey(scope, id));
      }
    } catch {
      await SecureStore.deleteItemAsync(itemKey(scope, id));
    }
  }
  return queue;
}

async function writeQueue(scope: QueueScope, items: ScopedOfflineMutation[]): Promise<void> {
  const previousIds = await readIndex(scope);
  const retained = items.slice(-MAX_QUEUE_ITEMS);
  await Promise.all(
    retained.map((item) => SecureStore.setItemAsync(itemKey(scope, item.id), JSON.stringify(item)))
  );
  const retainedIds = new Set(retained.map((item) => item.id));
  await Promise.all(previousIds.filter((id) => !retainedIds.has(id)).map((id) => SecureStore.deleteItemAsync(itemKey(scope, id))));
  if (retained.length) await SecureStore.setItemAsync(indexKey(scope), JSON.stringify(retained.map((item) => item.id)));
  else await SecureStore.deleteItemAsync(indexKey(scope));
}

export async function setOfflineQueueScope(input: { tenantId: string; userId: string }): Promise<void> {
  await removeLegacyPlaintextQueue();
  activeScope = { ...input, origin: apiBaseOrigin() };
}

export async function clearOfflineQueue(): Promise<void> {
  if (!activeScope) return;
  const scope = activeScope;
  const ids = await readIndex(scope);
  await Promise.all([
    SecureStore.deleteItemAsync(indexKey(scope)),
    ...ids.map((id) => SecureStore.deleteItemAsync(itemKey(scope, id))),
  ]);
  activeScope = null;
}

export async function enqueueMutation(item: Omit<OfflineMutation, 'id' | 'createdAt'>): Promise<void> {
  const scope = requireScope();
  const queue = await readQueue(scope);
  const queued: ScopedOfflineMutation = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    tenantId: scope.tenantId,
    userId: scope.userId,
    origin: scope.origin,
  } as ScopedOfflineMutation;
  await writeQueue(scope, [...queue, queued]);
}

export async function getQueueLength(): Promise<number> {
  if (!activeScope || activeScope.origin !== apiBaseOrigin()) return 0;
  return (await readQueue(activeScope)).length;
}

export async function flushOfflineQueue(): Promise<{ ok: number; failed: number }> {
  const scope = requireScope();
  const queue = await readQueue(scope);
  if (!queue.length) return { ok: 0, failed: 0 };

  const remaining: ScopedOfflineMutation[] = [];
  let ok = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      if (item.kind === 'service-complete') {
        const { ticketId, notes } = item.payload;
        await serviceService.update(ticketId, { resolutionNotes: notes });
        await serviceService.updateTicketStatus(ticketId, 'completed', 'closed');
      }
      ok++;
    } catch (error) {
      const retryable = (error instanceof ApiError && (error.status >= 500 || error.status === 0)) || error instanceof TypeError;
      if (retryable) remaining.push(item);
      failed++;
    }
  }

  await writeQueue(scope, remaining);
  return { ok, failed };
}
