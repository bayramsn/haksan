import { randomUUID, randomInt } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { ProductsService } from '../src/modules/products/products.service';
import { createContextualDatabase } from '../src/db/transaction-context';
import type { DbClient } from '../src/db/client';
import type { AuthContext } from '../src/shared/security/auth.types';
import type { ProductCreateInput } from '@haksan/shared';
import { ForbiddenError, NotFoundError, ConflictError } from '../src/shared/utils/errors';

// Explicit opt-in; never reads app credentials, DATABASE_URL, or existing services.
const enabled = process.env.HAKSAN_RUN_ISOLATED_PRODUCT_PG === '1';
const migration = readFileSync(new URL('../src/db/migrations/0164_product_create_operations.sql', import.meta.url), 'utf8');
describe.skipIf(!enabled)('Product create actual PostgreSQL recovery and idempotency', () => {
  let root: string, data: string, pool: Pool, db: DbClient, service: ProductsService, started = false;
  let visible = true;
  const port = randomInt(49152,65535), tenantId = randomUUID(), userId = randomUUID();
  const actor = { tenantId,userId,activeDivisionId:randomUUID(),activeDepartmentId:randomUUID(),permissions:new Set(['products.create']) } as unknown as AuthContext;
  const input = { modelCode:'SAC-TEST',fullName:'Sac işleme fixture' } as ProductCreateInput;
  const create = vi.fn(async (body: ProductCreateInput, owner: AuthContext) => db.transaction(async (tx) => {
    const result = await tx.execute(sql`insert into product_models (id,tenant_id,model_code,full_name) values (${randomUUID()},${owner.tenantId},${body.modelCode},${body.fullName}) returning id`);
    if (body.fullName === 'fail-insert') throw new Error('test insert failed');
    return result.rows[0] as {id:string};
  }));
  beforeAll(async () => {
    root=mkdtempSync(join(tmpdir(),'haksan-product-pg-')); data=join(root,'data'); const socket=join(root,'socket'); mkdirSync(socket,{mode:0o700});
    execFileSync('/opt/homebrew/bin/initdb',['-D',data,'-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
    execFileSync('/opt/homebrew/bin/pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-o',`-k ${socket} -p ${port} -c listen_addresses='' -c fsync=off -c statement_timeout=10000 -c lock_timeout=5000`,'-w','start'],{stdio:'pipe'}); started=true;
    pool=new Pool({host:socket,port,database:'postgres',max:8});
    await pool.query('CREATE TABLE tenants (id uuid PRIMARY KEY); CREATE TABLE users (id uuid PRIMARY KEY); CREATE TABLE product_models (id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES tenants(id),model_code text NOT NULL,full_name text NOT NULL)');
    await pool.query(migration); // actual production owner unique index and FK behavior
    await pool.query('INSERT INTO tenants(id) VALUES ($1)',[tenantId]); await pool.query('INSERT INTO users(id) VALUES ($1)',[userId]);
    await pool.query(`CREATE FUNCTION product_test_reject_finalize() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.product_id IS NOT NULL AND EXISTS(SELECT 1 FROM product_models WHERE id=NEW.product_id AND full_name='fail-finalize') THEN RAISE EXCEPTION 'test finalize rejected'; END IF; RETURN NEW; END $$`);
    await pool.query('CREATE TRIGGER reject_finalize BEFORE UPDATE ON product_create_operations FOR EACH ROW EXECUTE FUNCTION product_test_reject_finalize()');
    db=createContextualDatabase(drizzle(pool) as unknown as DbClient);
    service=new ProductsService(db,{} as never,{} as never);
    // The recovery/idempotency methods and DB are real. Full catalog taxonomy,
    // media and audit fixtures are outside this atomic-boundary test.
    vi.spyOn(service,'create').mockImplementation(create as never);
    vi.spyOn(service,'get').mockImplementation(async (id, owner) => {
      if (!visible) throw new NotFoundError('Ürün');
      const result=await db.execute(sql`select id,tenant_id,model_code,full_name from product_models where id=${id} and tenant_id=${owner.tenantId}`);
      if(!result.rows[0]) throw new NotFoundError('Ürün');
      return result.rows[0] as never;
    });
  },60000);
  afterAll(async()=>{
    if(pool) await pool.end();
    if(started) execFileSync('/opt/homebrew/bin/pg_ctl',['-D',data,'-m','fast','-w','stop'],{stdio:'pipe'});
    if(root?.startsWith(join(tmpdir(),'haksan-product-pg-'))) rmSync(root,{recursive:true,force:true});
  });
  beforeEach(async()=>{ visible=true; create.mockClear(); await pool.query('TRUNCATE product_create_operations,product_models'); });
  async function counts(){return (await pool.query('SELECT (SELECT count(*)::int FROM product_models) AS products,(SELECT count(*)::int FROM product_create_operations) AS operations')).rows[0];}
  it('uses migration unique index to serialize eight identical concurrent creates into one product',async()=>{
    const operationId=randomUUID();
    const results=await Promise.all(Array.from({length:8},()=>service.createOnce(input,actor,operationId)));
    expect(new Set(results.map(row=>row.id)).size).toBe(1); expect(create).toHaveBeenCalledTimes(1);
    expect(await counts()).toEqual({products:1,operations:1});
    expect(await service.recoverCreate(operationId,actor)).toEqual(results[0]);
    const indexes=(await pool.query("SELECT indexdef FROM pg_indexes WHERE indexname='product_create_operations_owner_unique'")).rows;
    expect(indexes[0].indexdef).toContain('UNIQUE INDEX');
  });
  it('rejects changed payload, division or department for the same operation with 409',async()=>{
    const operationId=randomUUID();await service.createOnce(input,actor,operationId);
    for(const [body,owner] of [[{...input,fullName:'changed'},actor],[input,{...actor,activeDivisionId:randomUUID()}],[input,{...actor,activeDepartmentId:randomUUID()}]] as const){
      await expect(service.createOnce(body,owner,operationId)).rejects.toBeInstanceOf(ConflictError);
    }
    expect(await counts()).toEqual({products:1,operations:1});expect(create).toHaveBeenCalledTimes(1);
  });
  it.each(['fail-insert','fail-finalize'])('rolls back product and operation after %s then permits safe retry',async(title)=>{
    const operationId=randomUUID();await expect(service.createOnce({...input,fullName:title},actor,operationId)).rejects.toThrow();
    expect(await counts()).toEqual({products:0,operations:0});
    const result=await service.createOnce(input,actor,operationId);expect(result.id).toBeTruthy();
    expect(await counts()).toEqual({products:1,operations:1});
  });
  it('guards recovery by owner, tenant, current scope and create permission',async()=>{
    const operationId=randomUUID();await service.createOnce(input,actor,operationId);
    for(const owner of [{...actor,userId:randomUUID()},{...actor,tenantId:randomUUID()},{...actor,activeDivisionId:randomUUID()},{...actor,activeDepartmentId:randomUUID()}]){
      await expect(service.recoverCreate(operationId,owner)).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(service.recoverCreate(operationId,{...actor,permissions:new Set()})).rejects.toBeInstanceOf(ForbiddenError);
    expect(await counts()).toEqual({products:1,operations:1});
  });
  it('rechecks live product visibility for recovery and idempotent replay',async()=>{
    const operationId=randomUUID();await service.createOnce(input,actor,operationId);visible=false;
    await expect(service.recoverCreate(operationId,actor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.createOnce(input,actor,operationId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await counts()).toEqual({products:1,operations:1});expect(create).toHaveBeenCalledTimes(1);
  });
  it('rolls back newly created product if final visibility read fails, permitting later retry',async()=>{
    const operationId=randomUUID();visible=false;await expect(service.createOnce(input,actor,operationId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await counts()).toEqual({products:0,operations:0});visible=true;
    await service.createOnce(input,actor,operationId);expect(await counts()).toEqual({products:1,operations:1});
  });
});
