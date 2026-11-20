import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { haksanTypeCode } from '../src/db/haksan-catalog-classification';
import { importHaksanmakinaCatalog, readSnapshot } from '../src/db/import-haksanmakina-catalog';
import { guardCatalogReferences } from '../src/db/catalog-reference-guard';
import { rollbackCatalogImport } from '../src/db/catalog-import-journal';
import { SQL } from 'drizzle-orm';
import * as s from '../src/db/schema';
import type { DbClient } from '../src/db/client';
vi.mock('../src/shared/storage/s3-storage.provider',()=>({S3StorageProvider:class{providerCode='test';async getFileMetadata(){return null;}async uploadFile(){return {};}}}));
const {importHexlaser2026,rollbackHexlaser2026}=await import('../src/db/import-hexlaser-2026');
const socket=process.env.HAKSAN_TAXONOMY_TEST_SOCKET;
describe.skipIf(!socket)('catalog isolated PostgreSQL import',()=>{
 let pool:Pool;let db:DbClient;
 const tenantId=randomUUID(),userId=randomUUID(),divisionId=randomUUID(),brandId=randomUUID(),typeId=randomUUID(),baseId=randomUUID();
 beforeAll(async()=>{
  if(!socket?.startsWith('/private/tmp/haksan-taxonomy-socket-'))throw new Error('Isolated private socket only');
  const admin=new Pool({host:socket,port:55439,database:'postgres'});
  const database='haksan_catalog_20261013_test';
  if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rows.length)await admin.query(`CREATE DATABASE ${database}`);
  await admin.end();pool=new Pool({host:socket,port:55439,database});db=drizzle(pool,{schema:s});
  await pool.query('DROP SCHEMA public CASCADE');await pool.query('CREATE SCHEMA public');
  const created=new Set<string>();
  for(const table of Object.values(s)){
   let config;try{config=getTableConfig(table as never);}catch{continue;}
   if(created.has(config.name))continue;created.add(config.name);
   const columns=config.columns.map(c=>{let d='';if(c.default instanceof SQL)d=new PgDialect().sqlToQuery(c.default).sql;else if(c.default!==undefined)d=typeof c.default==='boolean'||typeof c.default==='number'?String(c.default):`'${(typeof c.default==='object'?JSON.stringify(c.default):String(c.default)).replace(/'/g,"''")}'`;
    return `"${c.name}" ${c.getSQLType()}${c.name==='id'?' PRIMARY KEY':''}${d?` DEFAULT ${d}`:''}`;});
   await pool.query(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
  }
  await db.insert(s.users).values({id:userId,tenantId,email:'isolated@example.test',fullName:'Test',status:'active'} as never);
  const [role]=await db.insert(s.roles).values({code:'super_admin',name:'Admin'}).returning();await db.insert(s.userRoles).values({userId,roleId:role.id} as never);
  await db.insert(s.divisions).values({id:divisionId,tenantId,code:'SAC_ISLEME',name:'Sac İşleme'});
  await db.insert(s.brands).values({id:brandId,tenantId,name:'HEX LASER',divisionId});
  const [group]=await db.insert(s.productGroups).values({divisionId,code:'SAC_ISLEME',name:'Sac'}).returning();
  const [category]=await db.insert(s.productCategories).values({divisionId,code:'TEZGAH',name:'Tezgah',productGroupId:group.id}).returning();
  const [sub]=await db.insert(s.productSubcategories).values({divisionId,code:'SAC_LAZER_KESIM',name:'Lazer',categoryId:category.id}).returning();
  await db.insert(s.productTypes).values({id:typeId,divisionId,code:'fiber_lazer_kesim',name:'Lazer',subcategoryId:sub.id});
  await db.insert(s.currencies).values({code:'USD',name:'USD'} as never);
  await db.insert(s.productModels).values({id:baseId,tenantId,brandId,productTypeId:typeId,productGroupId:group.id,categoryId:category.id,subcategoryId:sub.id,modelCode:'existing-F',fullName:'F Serisi',modelName:'F Serisi',series:'F',listPrice:'12345',description:'Manual description',imageUrl:'/manual.png',laserBaseConfiguration:{familyCode:'F',series:'F',productTypeCode:'FIBER_LAZER_KESIM',sourceModelCodes:['F3015']}});
 });
 afterAll(async()=>{await pool?.end();});
 it('preserves existing IDs/prices/manual text, repeats without duplicates and restores exact rows',async()=>{
  const before=(await pool.query('SELECT to_jsonb(t) row FROM product_models t ORDER BY id')).rows;
  expect((await importHexlaser2026(db,tenantId,userId,false)).mode).toBe('preview');
  const first=await importHexlaser2026(db,tenantId,userId,true);
  expect(first).toMatchObject({createdProducts:16,updatedProducts:1});
  const [base]=await db.select().from(s.productModels).where((await import('drizzle-orm')).eq(s.productModels.id,baseId));
  expect(Number(base.listPrice)).toBe(12345);expect(base.description).toBe('Manual description');expect(base.catalogHidden).toBe(false);
  const counts=async()=>Promise.all(['product_models','product_option_sets','product_option_values'].map(async table=>(await pool.query(`SELECT count(*) FROM ${table}`)).rows));
  const original=await counts();await importHexlaser2026(db,tenantId,userId,true);expect(await counts()).toEqual(original);
  await rollbackHexlaser2026(db,tenantId,true);
  expect((await pool.query('SELECT to_jsonb(t) row FROM product_models t ORDER BY id')).rows).toEqual(before);
 });
 it('imports every mapped Haksan source once and rolls back links and created rows',async()=>{
  await db.insert(s.tenants).values({id:tenantId,slug:'isolated',name:'Test'} as never);
  const snapshot=await readSnapshot();
  for(const code of ['CNC','UNIVERSAL']){
   const [division]=await db.insert(s.divisions).values({tenantId,code,name:code}).returning();
   if(code==='CNC'){
    const [group]=await db.insert(s.productGroups).values({divisionId:division.id,code,name:code}).returning();
    const [category]=await db.insert(s.productCategories).values({divisionId:division.id,code:'TEZGAH',name:code,productGroupId:group.id}).returning();
    const [sub]=await db.insert(s.productSubcategories).values({divisionId:division.id,code:'ISLEME_MERKEZI',name:'İşleme Merkezi',categoryId:category.id}).returning();
    for(const type of new Set(snapshot.products.filter(p=>p.group==='CNC').map(haksanTypeCode)))await db.insert(s.productTypes).values({divisionId:division.id,code:type,name:type,subcategoryId:sub.id});
   }
  }
  const before=(await pool.query('SELECT to_jsonb(t) row FROM product_models t ORDER BY id')).rows;
  const first=await importHaksanmakinaCatalog(db,tenantId,userId,true,false,false,{});
  expect(first.created).toBe(593);
  const second=await importHaksanmakinaCatalog(db,tenantId,userId,true,false,false,{});expect(second.created).toBe(0);
  expect((await rollbackCatalogImport(db,tenantId,false)).changes).toBeGreaterThan(0);
  await rollbackCatalogImport(db,tenantId,true);
  expect((await pool.query('SELECT to_jsonb(t) row FROM product_models t ORDER BY id')).rows).toEqual(before);
 });

 it('refuses rollback references even when PostgreSQL would SET NULL or CASCADE',async()=>{
  await pool.query('CREATE TABLE rollback_invoice_ref (id uuid PRIMARY KEY, product_model_id uuid REFERENCES product_models(id) ON DELETE SET NULL)');
  await pool.query('CREATE TABLE rollback_equipment_ref (id uuid PRIMARY KEY, product_model_id uuid REFERENCES product_models(id) ON DELETE CASCADE)');
  const invoiceId=randomUUID(),equipmentId=randomUUID();
  await pool.query('INSERT INTO rollback_invoice_ref VALUES ($1,$2)',[invoiceId,baseId]);
  await pool.query('INSERT INTO rollback_equipment_ref VALUES ($1,$2)',[equipmentId,baseId]);
  await expect(guardCatalogReferences(db,'product_models',baseId,[])).rejects.toThrow('Rollback blocked by new reference');
  await guardCatalogReferences(db,'product_models',baseId,[{table:'rollback_invoice_ref',id:invoiceId},{table:'rollback_equipment_ref',id:equipmentId}]);
  expect((await pool.query('SELECT product_model_id FROM rollback_invoice_ref')).rows[0].product_model_id).toBe(baseId);
 });

});
