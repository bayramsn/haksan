import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { SQL } from 'drizzle-orm';
import * as s from '../src/db/schema';
import type { DbClient } from '../src/db/client';
import { readSnapshot } from '../src/db/import-haksanmakina-catalog';
import { backfillCatalogTechnical, rollbackCatalogTechnical } from '../src/db/backfill-catalog-technical';
const socket=process.env.HAKSAN_TAXONOMY_TEST_SOCKET;
describe.skipIf(!socket)('technical backfill isolated PostgreSQL',()=>{
 let pool:Pool;let db:DbClient;
 const tenantId=randomUUID(),userId=randomUUID(),divisionId=randomUUID(),brandId=randomUUID(),typeId=randomUUID(),modelId=randomUUID();
 const enrichedPath='/private/tmp/haksan-technical-backfill-'+randomUUID()+'.json';
 const tables=['product_models','product_specs','product_spec_templates','product_spec_groups','product_option_sets','product_option_values'];
 beforeAll(async()=>{
  if(!socket?.startsWith('/private/tmp/haksan-taxonomy-socket-'))throw new Error('Private socket only');
  const admin=new Pool({host:socket,port:55439,database:'postgres'});
  const database='haksan_technical_backfill_20261014_test';
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

  await db.insert(s.users).values({id:userId,tenantId,email:'technical@example.test',fullName:'Test',status:'active'} as never);
  const [role]=await db.insert(s.roles).values({code:'super_admin',name:'Admin'}).returning();await db.insert(s.userRoles).values({userId,roleId:role.id} as never);
  await db.insert(s.divisions).values({id:divisionId,tenantId,code:'UNIVERSAL',name:'Universal'});
  await db.insert(s.brands).values({id:brandId,tenantId,name:'SourceBrand',divisionId});
  await db.insert(s.productTypes).values({id:typeId,divisionId,code:'UNIVERSAL_TORNA',name:'Torna'});
  const source=(await readSnapshot()).products.find(row=>row.group==='UNIVERSAL')!;
  await writeFile(enrichedPath,JSON.stringify({products:[{sourceId:source.sourceId,sourceUrl:source.sourceUrl,specs:[{key:'Motor Gücü',value:'7',unit:'kW'}],technicalConfigurations:[{sourceModelCode:'TEST-1000',sourceUrl:source.sourceUrl,verificationStatus:'source_verified',specs:[{key:'Puntalar Arası Mesafe',value:'1000',unit:'mm'},{key:'Motor Gücü',value:'7',unit:'kW'}]},{sourceModelCode:'TEST-1500',sourceUrl:source.sourceUrl,verificationStatus:'source_verified',specs:[{key:'Puntalar Arası Mesafe',value:'1500',unit:'mm'},{key:'Motor Gücü',value:'7',unit:'kW'}]}]}]}));
  await db.insert(s.productModels).values({id:modelId,tenantId,brandId,productTypeId:typeId,modelCode:'HM-'+source.sourceId,fullName:'Source model',listPrice:'12345',description:'Manual description',baseModelConfiguration:{kind:'universal',baseModelCode:'TEST',sourceModelCodes:['TEST'],variableSpecKeys:[],sourceRevision:'test',configurations:[{sourceModelCode:'TEST',sourceProductId:modelId,specs:[{key:'Standart Donanım',value:'Manual standard',unit:''}]}]}});
  const [oldSet]=await db.insert(s.productOptionSets).values({tenantId,productModelId:modelId,name:'Makine Konfigürasyonu'}).returning();
  await db.insert(s.productOptionValues).values({tenantId,optionSetId:oldSet.id,sourceModelCode:'TEST',value:'TEST',priceDelta:'321'});
  await db.insert(s.productSpecs).values({tenantId,productModelId:modelId,specKey:'Ana Motor Gücü',specValue:'-',specUnit:'kW'});
  await db.insert(s.productSpecs).values({tenantId,productModelId:modelId,specKey:'Manual field',specValue:'Keep me',specUnit:''});
  await db.insert(s.productSpecTemplates).values({divisionId,productTypeCode:'UNIVERSAL_TORNA',specKey:'Ana Motor Gücü',isDeleted:true,isActive:false});
  const [cncDivision]=await db.insert(s.divisions).values({tenantId,code:'CNC',name:'CNC'}).returning();
  const [cncType]=await db.insert(s.productTypes).values({divisionId:cncDivision.id,code:'CNC_DIK_ISLEME_MERKEZI',name:'CNC'}).returning();
  const cncSource=(await readSnapshot()).products.find(row=>row.group==='CNC')!;
  const [cncModel]=await db.insert(s.productModels).values({tenantId,brandId,productTypeId:cncType.id,modelCode:'HM-'+cncSource.sourceId,fullName:'Protected CNC',listPrice:'54321'}).returning();
  await db.insert(s.productSpecs).values({tenantId,productModelId:cncModel.id,specKey:'Motor Gücü',specValue:'-',specUnit:'kW'});

 });
 afterAll(async()=>{await pool?.end();await unlink(enrichedPath).catch(()=>undefined);});
 it('repairs exact fields/options, preserves manual data, repeats with zero changes and restores exact rows',async()=>{
  const rows=async()=>Promise.all(tables.map(async table=>(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`)).rows));
  const before=await rows();
  const preview=await backfillCatalogTechnical(db,tenantId,userId,false,enrichedPath);expect(preview.filledSpecs).toBe(1);expect(await rows()).toEqual(before);
  const first=await backfillCatalogTechnical(db,tenantId,userId,true,enrichedPath);expect(first).toMatchObject({filledSpecs:1,reactivatedTemplates:1,updatedConfigurations:1,addedOptionValues:2,archivedOptionValues:1,protectedCncSkipped:1});
  const model=(await pool.query('SELECT * FROM product_models WHERE id=$1',[modelId])).rows[0];expect(Number(model.list_price)).toBe(12345);expect(model.description).toBe('Manual description');expect(model.base_model_configuration.variableSpecKeys).toEqual(['Puntalar Arası Mesafe']);
  expect((await pool.query("SELECT * FROM product_specs WHERE spec_key='Puntalar Arası Mesafe'")).rows).toEqual([]);
  expect((await pool.query("SELECT spec_value FROM product_specs JOIN product_models ON product_models.id=product_specs.product_model_id JOIN product_types ON product_types.id=product_models.product_type_id WHERE product_types.code='CNC_DIK_ISLEME_MERKEZI'")).rows).toEqual([{spec_value:'-'}]);
  expect((await pool.query("SELECT * FROM product_spec_templates WHERE product_type_code='CNC_DIK_ISLEME_MERKEZI'")).rows).toEqual([]);
  const obsolete=(await pool.query("SELECT deleted_at,price_delta FROM product_option_values WHERE source_model_code='TEST'")).rows[0];expect(obsolete.deleted_at).not.toBeNull();expect(Number(obsolete.price_delta)).toBe(321);
  const after=await rows();const repeat=await backfillCatalogTechnical(db,tenantId,userId,true,enrichedPath);expect(repeat).toMatchObject({addedSpecs:0,filledSpecs:0,addedTemplates:0,reactivatedTemplates:0,updatedConfigurations:0,addedOptionValues:0,archivedOptionValues:0});expect(await rows()).toEqual(after);
  await rollbackCatalogTechnical(db,tenantId,true);expect(await rows()).toEqual(before);
 });
});
