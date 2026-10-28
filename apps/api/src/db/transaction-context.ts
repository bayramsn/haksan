import { AsyncLocalStorage } from 'node:async_hooks';
import type { DbClient } from './client';

type DeferredEffect = () => unknown | Promise<unknown>;
type Context = { database: DbClient; active: boolean; afterCommit: DeferredEffect[] };
const context = new AsyncLocalStorage<Context | undefined>();
const proxies = new WeakMap<object, DbClient>();

/** Existing injected services join only an explicitly opened transaction scope. */
export function createContextualDatabase(database: DbClient): DbClient {
  const existing = proxies.get(database);
  if (existing) return existing;
  const proxy = new Proxy(database, {
    get(fallback, property) {
      const current = context.getStore();
      // Unawaited work must never fall back to a nontransactional write after commit.
      if (current && !current.active) throw new Error('Database transaction context is closed');
      const target = current?.database ?? fallback;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  proxies.set(database, proxy);
  proxies.set(proxy, proxy);
  return proxy;
}

/** Scope an already-open transaction; callers remain responsible for its commit boundary. */
export async function runWithDatabaseTransaction<T>(transaction: DbClient, callback: () => Promise<T>): Promise<T> {
  const parent = context.getStore();
  if (parent && !parent.active) throw new Error('Database transaction context is closed');
  const current: Context = { database: transaction, active: true, afterCommit: [] };
  try {
    const result = await context.run(current, callback);
    if (parent) parent.afterCommit.push(...current.afterCommit);
    else if (current.afterCommit.length) throw new Error('Deferred effects require withDatabaseTransaction');
    return result;
  } finally { current.active = false; }
}

/** Atomic boundary for an assistant commit plus all existing DB-injected CRM services. */
export async function withDatabaseTransaction<T>(database: DbClient, callback: () => Promise<T>): Promise<T> {
  const parent = context.getStore();
  if (parent) {
    if (!parent.active) throw new Error('Database transaction context is closed');
    return callback(); // Explicit nested wrappers join the outer atomic operation.
  }
  let current: Context | undefined;
  try {
    const result = await database.transaction(async (transaction) => {
      current = { database: transaction as unknown as DbClient, active: true, afterCommit: [] };
      try { return await context.run(current, callback); }
      finally { current.active = false; }
    });
    // transaction() resolves only after COMMIT. Deferred pushes run outside the DB scope.
    if (current) {
      current.active = false;
      for (const effect of current.afterCommit) {
        try { await context.run(undefined, async () => effect()); }
        catch { console.error('[database] Deferred post-commit effect failed'); }
      }
    }
    return result;
  } finally {
    if (current) { current.active = false; current.afterCommit.length = 0; }
  }
}

/** Defer non-DB side effects in the opt-in scope; ordinary callers keep immediate behavior. */
export async function afterDatabaseCommit(effect: DeferredEffect): Promise<void> {
  const current = context.getStore();
  if (!current) { await effect(); return; }
  if (!current.active) throw new Error('Database transaction context is closed');
  current.afterCommit.push(effect);
}
