
/**
 * Uygulama içi rota yolu. expo-router `Href` yerine düz string: paylaşılan sekme
 * grupları tipli rota birleşimini o kadar büyütüyor ki `Href | null` TS2590 veriyor.
 * Router'a verilirken çağıran yerde `as Href` ile daraltılır.
 */
export type AppRoute = string;

/** Oturum gerektiren uygulama ağacının (`app/(tabs)`) URL kökleri; `/` Bugün sekmesidir. */
export const PROTECTED_ROOTS = new Set(['modules', 'chat', 'notifications', 'more', 'work', 'calendar']);

/** Auth sonrasına taşınabilecek rotalar yalnız korumalı uygulama ağacındadır. */
export function canonicalPendingRoute(route: string | null | undefined): AppRoute | null {
  if (typeof route !== 'string') return null;
  const raw = route.trim();
  if (!raw || raw.length > 1024 || raw.includes('://')) return null;

  // Serbest query/hash kalıcı hedefe yazılmaz. Özellikle reset tokenı ve filtre
  // değerleri SecureStore kaydının parçası olamaz.
  const pathname = raw.split(/[?#]/, 1)[0] ?? '';
  // Sekme grupları URL'de görünmez; korumalı ağaç kök bölümüyle tanınır.
  const root = pathname.split('/')[1] ?? '';
  if (pathname !== '/' && !PROTECTED_ROOTS.has(root)) return null;

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

  // Sohbet bildirimi için yalnız doğrulanmış mesaj kimliğini koru.
  if (/^\/chat\/[^/]+$/.test(pathname)) {
    const focus = raw.slice(pathname.length).match(/^\?messageId=([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i);
    if (focus) return `${pathname}?messageId=${focus[1]}`;
  }
  return pathname;
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

  function queue(route: string | null | undefined): Promise<boolean> {
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

  function consume(): Promise<AppRoute | null> {
    return locked(async () => {
      let record = memoryRecord;
      if (!record) {
        try {
          record = parseRecord(await storage.get());
        } catch {
          return null;
        }
      }

      let route: AppRoute | null = null;
      if (record) route = canonicalPendingRoute(record.route);
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
