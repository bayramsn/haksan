import { randomUUID, randomInt } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { CallAssistantService } from '../src/modules/call-assistant/call-assistant.service';
import { createContextualDatabase } from '../src/db/transaction-context';
import { callAssistantDrafts, callAssistantSuggestions } from '../src/db/schema/call-assistant';
import type { DbClient } from '../src/db/client';
import type { AuthContext } from '../src/shared/security/auth.types';

// Opt in explicitly: never reads DATABASE_URL, app .env, or existing PG services.
const enabled = process.env.HAKSAN_RUN_ISOLATED_CALL_PG === '1';
describe.skipIf(!enabled)('Call assistant actual PostgreSQL atomic commits', () => {
  let root: string, data: string, pool: Pool, db: DbClient, started = false;
  const port = randomInt(49152, 65535);
  const tenantId = randomUUID(), userId = randomUUID(), companyId = randomUUID();
  const actor = { tenantId, userId, permissions: new Set(['tasks.create', 'companies.read']), accessScopes: [] } as unknown as AuthContext;
  let service: CallAssistantService;
  let allowCompany = true;
  const businessCreate = vi.fn(async (_actor: unknown, input: { title: string }) => db.transaction(async (tx) => {
    const result = await tx.execute(sql`insert into assistant_test_business (id, title) values (${randomUUID()}, ${input.title}) returning id`);
    return result.rows[0] as { id: string };
  }));
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'haksan-call-pg-'));
    data = join(root, 'data'); const socket = join(root, 'socket'); mkdirSync(socket, { mode: 0o700 });
    execFileSync('/opt/homebrew/bin/initdb', ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
    // Private UNIX directory and disabled TCP isolate this disposable cluster.
    execFileSync('/opt/homebrew/bin/pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-k ${socket} -p ${port} -c listen_addresses='' -c fsync=off -c statement_timeout=10000 -c lock_timeout=5000`, '-w', 'start'], { stdio: 'pipe' });
    started = true;
    pool = new Pool({ host: socket, port, database: 'postgres', max: 8 });
    await pool.query('SET statement_timeout = 10000');
    // Build only the production columns needed by the actual Drizzle service;
    // external FKs are fixture substitutes, not a migration-schema test.
    for (const table of [callAssistantSuggestions, callAssistantDrafts]) {
      const config = getTableConfig(table);
      const columns = config.columns.map((column) => `"${column.name}" ${column.getSQLType()}`);
      await pool.query(`CREATE TABLE "${config.name}" (${columns.join(', ')}, PRIMARY KEY (id))`);
    }
    await pool.query('CREATE TABLE assistant_test_business (id uuid PRIMARY KEY, title text NOT NULL)');
    await pool.query(`CREATE FUNCTION assistant_test_reject_finalize() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'committed' AND EXISTS (SELECT 1 FROM assistant_test_business WHERE title = 'fail-finalize') THEN RAISE EXCEPTION 'test finalize rejected'; END IF; RETURN NEW; END $$`);
    await pool.query('CREATE TRIGGER reject_finalize BEFORE UPDATE ON call_assistant_drafts FOR EACH ROW EXECUTE FUNCTION assistant_test_reject_finalize()');
    db = createContextualDatabase(drizzle(pool, { schema: { callAssistantDrafts, callAssistantSuggestions } }) as unknown as DbClient);
    service = new CallAssistantService(db, { get: async () => { if (!allowCompany) throw new Error('access revoked'); return { legalTitle: 'Fixture company' }; } } as never, {} as never,
      { list: async () => ({ data: [] }) } as never, { create: businessCreate } as never, {} as never, {} as never);
    // Feature config is irrelevant to the transaction under test. Everything
    // else including draft(), suggestion(), owner checks and row locks is real.
    vi.spyOn(service, 'assertEnabled').mockImplementation(() => {});
  }, 60_000);
  afterAll(async () => {
    if (pool) await pool.end();
    if (started) execFileSync('/opt/homebrew/bin/pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
    if (root && root.startsWith(join(tmpdir(), 'haksan-call-pg-'))) rmSync(root, { recursive: true, force: true });
  });
  beforeEach(async () => {
    businessCreate.mockClear(); allowCompany = true;
    await pool.query('TRUNCATE call_assistant_drafts, call_assistant_suggestions, assistant_test_business');
  });
  async function fixture(suggestionId = randomUUID()) {
    const id = randomUUID();
    await pool.query(`INSERT INTO call_assistant_suggestions (id,tenant_id,user_id,company_id,status,title,created_at) VALUES ($1,$2,$3,$4,'pending','Fixture',now()) ON CONFLICT DO NOTHING`, [suggestionId,tenantId,userId,companyId]);
    await pool.query(`INSERT INTO call_assistant_drafts (id,tenant_id,user_id,suggestion_id,kind,status,created_at) VALUES ($1,$2,$3,$4,'task','pending',now())`,[id,tenantId,userId,suggestionId]);
    return { id, suggestionId, input: { operationId: randomUUID(), kind: 'task' as const, payload: { title: 'Follow up', companyId } } };
  }
  async function counts() { return (await pool.query('SELECT count(*)::int AS count FROM assistant_test_business')).rows[0].count; }
  it('serializes concurrent identical saves into one committed business row', async () => {
    const f = await fixture();
    const results = await Promise.all(Array.from({ length: 8 }, () => service.commit(actor, f.id, f.input)));
    expect(new Set(results.map((result) => result.resourceId)).size).toBe(1);
    expect(await counts()).toBe(1); expect(businessCreate).toHaveBeenCalledTimes(1);
    const row = (await pool.query('SELECT status,commit_operation_id,resource_id FROM call_assistant_drafts WHERE id=$1',[f.id])).rows[0];
    expect(row).toMatchObject({ status: 'committed', commit_operation_id: f.input.operationId, resource_id: results[0].resourceId });
  });
  it('serializes different drafts sharing a suggestion and consumes it only once', async () => {
    const a = await fixture(), b = await fixture(a.suggestionId);
    const results = await Promise.allSettled([service.commit(actor,a.id,a.input),service.commit(actor,b.id,b.input)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await counts()).toBe(1); expect(businessCreate).toHaveBeenCalledTimes(1);
    expect((await pool.query('SELECT status FROM call_assistant_suggestions')).rows[0].status).toBe('actioned');
  });
  it('rolls back downstream business write and both state transitions if finalization fails', async () => {
    const f = await fixture(); f.input.payload.title = 'fail-finalize';
    await expect(service.commit(actor,f.id,f.input)).rejects.toThrow();
    expect(businessCreate).toHaveBeenCalledTimes(1); expect(await counts()).toBe(0);
    expect((await pool.query('SELECT status FROM call_assistant_drafts')).rows[0].status).toBe('pending');
    expect((await pool.query('SELECT status FROM call_assistant_suggestions')).rows[0].status).toBe('pending');
  });
  it('rejects cross-user/cross-tenant access and changed idempotent replays before writing', async () => {
    const f = await fixture();
    await expect(service.commit({...actor,userId:randomUUID()},f.id,f.input)).rejects.toThrow();
    await expect(service.commit({...actor,tenantId:randomUUID()},f.id,f.input)).rejects.toThrow();
    expect(await counts()).toBe(0);
    await service.commit(actor,f.id,f.input);
    await expect(service.commit(actor,f.id,{...f.input,payload:{...f.input.payload,title:'changed'}})).rejects.toThrow('başka içerikle');
    expect(await counts()).toBe(1);
  });
  it('rechecks current CRM visibility before saving and rejects expired drafts', async () => {
    const f = await fixture(); allowCompany = false;
    await expect(service.commit(actor,f.id,f.input)).rejects.toThrow('access revoked');
    allowCompany = true;
    await pool.query("UPDATE call_assistant_drafts SET created_at=now()-interval '31 minutes' WHERE id=$1",[f.id]);
    await expect(service.commit(actor,f.id,f.input)).rejects.toThrow();
    expect(await counts()).toBe(0); expect(businessCreate).not.toHaveBeenCalled();
  });
});
