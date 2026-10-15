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
describe.skipIf(!socket)('Universal isolated PostgreSQL bases',()=>{
 let pool:Pool;let db:DbClient;
 const tenantId=randomUUID(),userId=randomUUID(),divisionId=randomUUID(),brandId=randomUUID(),typeId=randomUUID(),baseId=randomUUID();
 beforeAll(async()=>{
  if(!socket?.startsWith('/private/tmp/haksan-taxonomy-socket-'))throw new Error('Isolated private socket only');
  const admin=new Pool({host:socket,port:55439,database:'postgres'});
  const database='haksan_universal_bases_20261013_test';
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
 it('keeps CNC byte-for-byte; converts Universal bases; is idempotent and restores exact data',async()=>{
  const {importUniversalBases,rollbackUniversalBases}=await import('../src/db/import-universal-bases');
  const [division]=await db.insert(s.divisions).values({tenantId,code:'UNIVERSAL',name:'Universal'}).returning();
  const [group]=await db.insert(s.productGroups).values({divisionId:division.id,code:'UNIVERSAL',name:'Universal'}).returning();
  const [category]=await db.insert(s.productCategories).values({divisionId:division.id,code:'TEZGAH',name:'Universal',productGroupId:group.id}).returning();
  const [sub]=await db.insert(s.productSubcategories).values({divisionId:division.id,code:'TORNA',name:'Torna',categoryId:category.id}).returning();
  const [type]=await db.insert(s.productTypes).values({divisionId:division.id,code:'HM_UNIVERSAL_TORNA',name:'Torna',subcategoryId:sub.id}).returning();
  const [brand]=await db.insert(s.brands).values({tenantId,name:'VOUGA',divisionId:division.id}).returning();
  const [currency]=await db.select().from(s.currencies);
  const [standardType]=await db.insert(s.equipmentTypes).values({code:'standart',name:'Standart'}).returning();
  for(const [id,model,length,price]of [['600','CD 6241/1000','1000 mm','12345'],['1122','CD 6241/1500','1500 mm','23456']]){
   const [card]=await db.insert(s.productModels).values({tenantId,brandId:brand.id,productGroupId:group.id,categoryId:category.id,subcategoryId:sub.id,productTypeId:type.id,modelCode:`HM-${id}`,modelName:model,fullName:model,listPrice:price,currencyId:currency.id}).returning();
   await db.insert(s.productEquipmentItems).values({tenantId,productModelId:card.id,equipmentTypeId:standardType.id,title:'Aydınlatma Sistemi',description:null,unitPrice:null});
   await db.insert(s.productSpecs).values([{tenantId,productModelId:card.id,specKey:'Puntalar Arası Mesafe',specValue:length},{tenantId,productModelId:card.id,specKey:'Motor Gücü',specValue:'3.3 kW'}]);
  }
  const [standalone]=await db.insert(s.productModels).values({tenantId,brandId:brand.id,productGroupId:group.id,categoryId:category.id,subcategoryId:sub.id,productTypeId:type.id,modelCode:'MYA-6025',fullName:'Distinct machine',listPrice:'34567'}).returning();
  const [cncDivision]=await db.insert(s.divisions).values({tenantId,code:'CNC',name:'CNC'}).returning();
  const [cncGroup]=await db.insert(s.productGroups).values({divisionId:cncDivision.id,code:'CNC',name:'CNC'}).returning();
  const [cncCard]=await db.insert(s.productModels).values({tenantId,brandId:brand.id,productGroupId:cncGroup.id,modelCode:'AWS-CNC-KEEP',fullName:'Existing CNC',listPrice:'99999'}).returning();
  const [accessoryCategory]=await db.insert(s.productCategories).values({divisionId:division.id,code:'AKSESUAR',name:'Accessory',productGroupId:group.id}).returning();
  const [accessory]=await db.insert(s.productModels).values({tenantId,brandId:brand.id,productGroupId:group.id,categoryId:accessoryCategory.id,modelCode:'ACCESSORY-KEEP',fullName:'Existing accessory'}).returning();
  const otherTenant=randomUUID();
  const [otherCard]=await db.insert(s.productModels).values({tenantId:otherTenant,brandId:brand.id,productGroupId:group.id,categoryId:category.id,modelCode:'OTHER-TENANT',fullName:'Other tenant'}).returning();
  const cncBefore=(await pool.query('SELECT to_jsonb(t) row FROM product_models t WHERE id=$1',[cncCard.id])).rows;
  const before=(await pool.query('SELECT to_jsonb(t) row FROM product_models t ORDER BY id')).rows;
  const equipmentBefore=(await pool.query('SELECT to_jsonb(t) row FROM product_equipment_items t ORDER BY id')).rows;
  const specsBefore=(await pool.query('SELECT to_jsonb(t) row FROM product_specs t ORDER BY id')).rows;
  expect(await importUniversalBases(db,tenantId,userId,false)).toMatchObject({mode:'preview',mergedBase:1,independentBases:1,sharedStandardEquipment:1});
  expect((await pool.query('SELECT to_jsonb(t) row FROM product_models t ORDER BY id')).rows).toEqual(before);
  expect(await importUniversalBases(db,tenantId,userId,true)).toMatchObject({created:1,hidden:2,updated:1});
  expect((await pool.query('SELECT base_model_configuration FROM product_models WHERE id=ANY($1::uuid[])',[[accessory.id,otherCard.id]])).rows.every(row=>row.base_model_configuration===null)).toBe(true);
  const bases=await pool.query('SELECT id,base_model_configuration FROM product_models WHERE model_code=$1',['UNIV-VOUGA-CD6241']);
  const cloned=(await pool.query('SELECT id,title,unit_price FROM product_equipment_items WHERE product_model_id=$1',[bases.rows[0].id])).rows;
  expect(cloned).toHaveLength(1);expect(cloned[0].title).toBe('Aydınlatma Sistemi');expect(cloned[0].unit_price).toBeNull();
  expect(equipmentBefore.some(row=>row.row.id===cloned[0].id)).toBe(false);
  expect((await pool.query('SELECT to_jsonb(t) row FROM product_equipment_items t WHERE product_model_id<>$1 ORDER BY id',[bases.rows[0].id])).rows).toEqual(equipmentBefore);
  expect(bases.rows[0].base_model_configuration.variableSpecKeys).toEqual(['Puntalar Arası Mesafe']);
  expect((await pool.query('SELECT spec_key FROM product_specs WHERE product_model_id=$1',[bases.rows[0].id])).rows.map(r=>r.spec_key)).toEqual(['Motor Gücü','Standart Donanım']);
  expect((await pool.query('SELECT list_price FROM product_models WHERE id=$1',[standalone.id])).rows[0].list_price).toBe('34567.0000');
  expect((await pool.query('SELECT count(*)::int n FROM product_option_values WHERE price_delta IS NOT NULL')).rows[0].n).toBe(0);
  expect(await importUniversalBases(db,tenantId,userId,true)).toMatchObject({created:0,hidden:0,updated:0});
  expect((await pool.query('SELECT to_jsonb(t) row FROM product_models t WHERE id=$1',[cncCard.id])).rows).toEqual(cncBefore);
  await pool.query('CREATE TABLE new_quote_ref (id uuid PRIMARY KEY, product_model_id uuid REFERENCES product_models(id) ON DELETE SET NULL)');
  const ref=randomUUID();await pool.query('INSERT INTO new_quote_ref VALUES ($1,$2)',[ref,bases.rows[0].id]);
  await expect(rollbackUniversalBases(db,tenantId,true)).rejects.toThrow('Rollback blocked by new reference');
  await pool.query('DELETE FROM new_quote_ref WHERE id=$1',[ref]);
  await rollbackUniversalBases(db,tenantId,true);
  expect((await pool.query('SELECT to_jsonb(t) row FROM product_models t ORDER BY id')).rows).toEqual(before);
  expect((await pool.query('SELECT to_jsonb(t) row FROM product_specs t ORDER BY id')).rows).toEqual(specsBefore);
  expect((await pool.query('SELECT to_jsonb(t) row FROM product_equipment_items t ORDER BY id')).rows).toEqual(equipmentBefore);
 });
 it('retains distinct variants when custom optional equipment exists and refuses rollback edits',async()=>{
  const {importUniversalBases,rollbackUniversalBases}=await import('../src/db/import-universal-bases');
  const row=(await pool.query("SELECT id FROM product_models WHERE model_code='HM-600'")).rows[0];
  await db.insert(s.productEquipmentItems).values({tenantId,productModelId:row.id,title:'Existing optional equipment',unitPrice:'500'});
  const before=(await pool.query('SELECT to_jsonb(t) row FROM product_models t ORDER BY id')).rows;
  const preview=await importUniversalBases(db,tenantId,userId,false);
  expect(preview).toMatchObject({mergedBase:0,archivedVariants:0});
  expect(preview.review).toContain('CD6241: custom equipment/options exist; retained independent bases');
  expect(preview.remainingVariantReview.map(row=>row.sourceModel)).toContain('CD 6241/1000');
  expect(await importUniversalBases(db,tenantId,userId,true)).toMatchObject({created:0,hidden:0,updated:3});
  const after=(await pool.query('SELECT to_jsonb(t) row FROM product_models t WHERE id=$1',[row.id])).rows[0].row;
  await pool.query('UPDATE product_models SET description=$2 WHERE id=$1',[row.id,'User edit']);
  await expect(rollbackUniversalBases(db,tenantId,true)).rejects.toThrow('subsequent edit');
  await pool.query('UPDATE product_models SET description=$2 WHERE id=$1',[row.id,after.description]);
  await rollbackUniversalBases(db,tenantId,true);
  expect((await pool.query('SELECT to_jsonb(t) row FROM product_models t ORDER BY id')).rows).toEqual(before);
 });

 it('blocks unequal standards and incoming alternative references',async()=>{
  const {importUniversalBases}=await import('../src/db/import-universal-bases');
  await pool.query("DELETE FROM product_equipment_items WHERE unit_price > 0");
  const rows=(await pool.query("SELECT id FROM product_models WHERE model_code IN ('HM-600','HM-1122') ORDER BY model_code")).rows;
  const standard=(await pool.query("SELECT id FROM equipment_types WHERE code='standart'")).rows[0];
  const [different]=await db.insert(s.productEquipmentItems).values({tenantId,productModelId:rows[0].id,equipmentTypeId:standard.id,title:'Different standard'}).returning();
  const mismatch=await importUniversalBases(db,tenantId,userId,false);
  expect(mismatch.review).toContain('CD6241: standard equipment is not documented by source; retained independent bases');
  await pool.query('DELETE FROM product_equipment_items WHERE id=$1',[different.id]);
  await db.insert(s.productAlternatives).values({tenantId,productModelId:baseId,alternativeProductModelId:rows[0].id});
  expect((await importUniversalBases(db,tenantId,userId,false)).review).toContain('CD6241: custom equipment/options exist; retained independent bases');
 });

 it('preserves source-verified asymmetric standards per selected configuration without widening the base',async()=>{
  const {importUniversalBases,rollbackUniversalBases}=await import('../src/db/import-universal-bases');
  await pool.query('DELETE FROM product_alternatives');
  const cards=(await pool.query("SELECT id,model_code FROM product_models WHERE model_code IN ('HM-600','HM-1122') ORDER BY model_code")).rows;
  const ids=cards.map(row=>row.id);await pool.query('DELETE FROM product_equipment_items WHERE product_model_id=ANY($1::uuid[])',[ids]);
  const type=(await pool.query("SELECT id FROM equipment_types WHERE code='standart'")).rows[0];
  const card1500=cards.find(row=>row.model_code==='HM-1122');
  const [existing]=await db.insert(s.productEquipmentItems).values({tenantId,productModelId:card1500.id,equipmentTypeId:type.id,title:'3 Ayaklı Üniversal Ayna'}).returning();
  const before=(await pool.query('SELECT to_jsonb(t) row FROM product_equipment_items t ORDER BY id')).rows;
  expect(await importUniversalBases(db,tenantId,userId,true)).toMatchObject({created:1,hidden:2,sharedStandardEquipment:0});
  const base=(await pool.query("SELECT id,base_model_configuration config FROM product_models WHERE model_code='UNIV-VOUGA-CD6241'")).rows[0];
  expect((await pool.query('SELECT id FROM product_equipment_items WHERE product_model_id=$1',[base.id])).rows).toHaveLength(0);
  expect(base.config.variableSpecKeys).toContain('Standart Donanım');
  expect(base.config.configurations.find(c=>c.sourceModelCode==='CD 6241/1000').specs.find(s=>s.key==='Standart Donanım').value).toBe('');
  expect(base.config.configurations.find(c=>c.sourceModelCode==='CD 6241/1500').specs.find(s=>s.key==='Standart Donanım').value).toBe('3 Ayaklı Üniversal Ayna');
  expect((await pool.query('SELECT id FROM product_equipment_items WHERE id=$1',[existing.id])).rows).toHaveLength(1);
  await rollbackUniversalBases(db,tenantId,true);
  expect((await pool.query('SELECT to_jsonb(t) row FROM product_equipment_items t ORDER BY id')).rows).toEqual(before);
 });

});
