import { describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../src/db/client';
import { afterDatabaseCommit, createContextualDatabase, runWithDatabaseTransaction, withDatabaseTransaction } from '../src/db/transaction-context';

function fakeDatabase() {
  const rows: string[] = [];
  let sequence = 0;
  const root = {
    label: 'default',
    read() { return this.label; },
    write(value: string) { rows.push(value); },
    async transaction<T>(work: (tx: unknown) => Promise<T>) {
      const pending: string[] = [];
      const tx = { label: `tx-${++sequence}`, read() { return this.label; }, write(value: string) { pending.push(value); }, transaction: async (nested: (value: unknown) => Promise<T>) => nested(tx) };
      const result = await work(tx); rows.push(...pending); return result;
    },
  };
  return { rows, raw: root as unknown as DbClient, proxy: createContextualDatabase(root as unknown as DbClient) as unknown as typeof root };
}

describe('opt-in injected database transaction context', () => {
  it('preserves ordinary behavior and bound method receivers outside the explicit scope', () => {
    const {raw,proxy,rows}=fakeDatabase(); expect(proxy.read()).toBe('default'); const read=proxy.read; expect(read()).toBe('default');
    proxy.write('ordinary'); expect(rows).toEqual(['ordinary']); expect(createContextualDatabase(raw)).toBe(proxy);
  });
  it('uses the same transaction for separate injected service calls; resets after commit', async () => {
    const {raw,proxy,rows}=fakeDatabase();
    await withDatabaseTransaction(raw,async()=>{expect(proxy.read()).toBe('tx-1');proxy.write('one');await Promise.resolve();proxy.write('two');expect(rows).toEqual([]);});
    expect(rows).toEqual(['one','two']);expect(proxy.read()).toBe('default');
  });
  it('rolls back all participating writes and queued effects on error, then restores default context', async () => {
    const {raw,proxy,rows}=fakeDatabase();const effect=vi.fn();
    await expect(withDatabaseTransaction(raw,async()=>{proxy.write('must roll back');await afterDatabaseCommit(effect);throw Error('reject');})).rejects.toThrow('reject');
    expect(rows).toEqual([]);expect(effect).not.toHaveBeenCalled();expect(proxy.read()).toBe('default');
  });
  it('isolates concurrent transactions and default requests across asynchronous waits', async () => {
    const {raw,proxy,rows}=fakeDatabase();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const first=withDatabaseTransaction(raw,async()=>{expect(proxy.read()).toBe('tx-1');await gate;expect(proxy.read()).toBe('tx-1');proxy.write('first');});
    expect(proxy.read()).toBe('default');await withDatabaseTransaction(raw,async()=>{expect(proxy.read()).toBe('tx-2');proxy.write('second');});
    release();await first;expect(rows).toEqual(['second','first']);expect(proxy.read()).toBe('default');
  });
  it('executes effects only after commit, outside transaction scope, and does not mask a committed result on push failure', async () => {
    const {raw,proxy,rows}=fakeDatabase();const log=vi.spyOn(console,'error').mockImplementation(()=>undefined);
    try {const result=await withDatabaseTransaction(raw,async()=>{proxy.write('committed');await afterDatabaseCommit(()=>{expect(rows).toEqual(['committed']);expect(proxy.read()).toBe('default');});await afterDatabaseCommit(()=>{throw Error('private transport details');});return 'saved';});expect(result).toBe('saved');expect(log).toHaveBeenCalledWith('[database] Deferred post-commit effect failed');}
    finally {log.mockRestore();}
  });
  it('rejects detached work whose transaction scope already closed instead of writing to default DB', async () => {
    const {raw,proxy,rows}=fakeDatabase();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let detached!:Promise<void>;
    await withDatabaseTransaction(raw,async()=>{detached=(async()=>{await gate;proxy.write('late');})();});release();
    await expect(detached).rejects.toThrow('context is closed');expect(rows).toEqual([]);
  });
  it('nested explicit wrappers join the same atomic boundary and immediate ordinary effects stay immediate', async () => {
    const {raw,proxy,rows}=fakeDatabase();let immediate=false;await afterDatabaseCommit(()=>{immediate=true;});expect(immediate).toBe(true);
    await withDatabaseTransaction(raw,async()=>{const label=proxy.read();await withDatabaseTransaction(raw,async()=>{expect(proxy.read()).toBe(label);proxy.write('nested');});expect(rows).toEqual([]);});expect(rows).toEqual(['nested']);
  });
  it('scopes an existing transaction without changing the ordinary DB afterwards', async () => {
    const {raw,proxy}=fakeDatabase();await raw.transaction(async tx=>runWithDatabaseTransaction(tx as unknown as DbClient,async()=>{expect(proxy.read()).toBe('tx-1');}));expect(proxy.read()).toBe('default');
  });
});
