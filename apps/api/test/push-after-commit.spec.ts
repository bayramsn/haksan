import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/shared/utils/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('../src/db/client', () => ({ getDb: vi.fn() }));
import type { DbClient } from '../src/db/client';
import { withDatabaseTransaction } from '../src/db/transaction-context';
import { PushService } from '../src/shared/push/push.service';

function setup() {
  let committed = false;
  const db = { transaction: async (work: (tx: unknown) => Promise<unknown>) => { const result=await work({});committed=true;return result; } } as unknown as DbClient;
  const service = new PushService(db);
  const sends = vi.spyOn(service as unknown as { sendCommitted(userId: string, message: unknown): Promise<void> },'sendCommitted').mockImplementation(async()=>{ expect(committed).toBe(true); });
  return {db,service,sends};
}
describe('push delivery follows the database commit boundary',()=>{
  it('does not dispatch before commit and dispatches once afterwards',async()=>{
    const {db,service,sends}=setup();await withDatabaseTransaction(db,async()=>{await service.sendToUser('user',{title:'Title',body:'Body'});expect(sends).not.toHaveBeenCalled();});expect(sends).toHaveBeenCalledTimes(1);
  });
  it('does not dispatch notifications for rolled-back operations',async()=>{
    const {db,service,sends}=setup();await expect(withDatabaseTransaction(db,async()=>{await service.sendToUser('user',{title:'Title',body:'Body'});throw Error('CRM failed');})).rejects.toThrow('CRM failed');expect(sends).not.toHaveBeenCalled();
  });
  it('keeps existing immediate send semantics outside an opt-in transaction',async()=>{
    const service=new PushService({} as DbClient);const sends=vi.spyOn(service as unknown as {sendCommitted(userId:string,message:unknown):Promise<void>},'sendCommitted').mockResolvedValue();await service.sendToUser('user',{title:'Title',body:'Body'});expect(sends).toHaveBeenCalledTimes(1);
  });
});
