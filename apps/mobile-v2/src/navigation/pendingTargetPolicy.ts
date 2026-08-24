import type { Href } from 'expo-router';

/** Auth sonrasına taşınabilecek rotalar yalnız korumalı uygulama ağacındadır. */
export function canonicalPendingRoute(route: Href | string | null | undefined): Href | null {
  if (typeof route !== 'string') return null;
  const raw = route.trim();
  if (!raw || raw.length > 1024 || raw.includes('://')) return null;

  // Query/hash kalıcı hedefe asla yazılmaz. Özellikle reset tokenı ve filtre
  // değerleri SecureStore kaydının parçası olamaz.
  const pathname = raw.split(/[?#]/, 1)[0] ?? '';
  if (pathname !== '/(tabs)' && !pathname.startsWith('/(tabs)/')) return null;

  const segments = pathname.split('/').filter(Boolean);
  for (const segment of segments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      /[\u0000-\u001f\u007f]/.test(decoded)
    ) {
      return null;
    }
  }

  return pathname as Href;
}

const MAX_AGE_MS = 30 * 60 * 1000;

type PendingRecord = {
  version: 1;
  route: string;
  createdAt: number;
};

export type PendingTargetStorage = {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  delete(): Promise<void>;
};

/** IO bağımsız çekirdek; native SecureStore adaptörü pendingTarget.ts içindedir. */
export function createPendingTargetQueue(storage: PendingTargetStorage, now: () => number = Date.now) {
  let memoryRecord: PendingRecord | null = null;
  let operation: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  function locked<T>(work: () => Promise<T>): Promise<T> {
    const result = operation.then(work, work);
    operation = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  function parseRecord(raw: string | null): PendingRecord | null {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<PendingRecord>;
      const route = canonicalPendingRoute(value.route);
      if (
        value.version !== 1 ||
        !route ||
        typeof value.createdAt !== 'number' ||
        !Number.isFinite(value.createdAt) ||
        value.createdAt > now() + 60_000 ||
        now() - value.createdAt > MAX_AGE_MS
      ) {
        return null;
      }
      return { version: 1, route: route as string, createdAt: value.createdAt };
    } catch {
      return null;
    }
  }

  function queue(route: Href | string | null | undefined): Promise<boolean> {
    const canonical = canonicalPendingRoute(route);
    if (!canonical) return Promise.resolve(false);

    return locked(async () => {
      const record: PendingRecord = { version: 1, route: canonical as string, createdAt: now() };
      memoryRecord = record;
      try {
        await storage.set(JSON.stringify(record));
      } catch {
        // Aynı uygulama yaşam döngüsünde bellek kaydı korunur.
      }
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          // Bir UI listener'ı kuyruk yazımını veya diğer listener'ları bozamaz.
        }
      }
      return true;
    });
  }

  function consume(): Promise<Href | null> {
    return locked(async () => {
      let record = memoryRecord;
      if (!record) {
        try {
          record = parseRecord(await storage.get());
        } catch {
          return null;
        }
      }

      const route = record ? canonicalPendingRoute(record.route) : null;
      const fresh = Boolean(record && now() - record.createdAt <= MAX_AGE_MS);
      try {
        // At-most-once: kalıcı kayıt başarıyla silinmeden navigation yapılmaz.
        await storage.delete();
      } catch {
        return null;
      }
      memoryRecord = null;
      return fresh ? route : null;
    });
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { queue, consume, subscribe };
}
