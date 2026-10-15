/** Operator-only, reversible Universal bases. Never guesses families from numbers in model names. */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { isMainMachineCategory, type BaseModelConfiguration } from '@haksan/shared';
import type { DbClient } from './client';
import * as s from './schema';
import { guardCatalogReferences } from './catalog-reference-guard';
import { readSnapshot } from './import-haksanmakina-catalog';
const REVISION = 'universal-bases-20261013-v1';
const TABLES = ['product_models', 'product_specs', 'product_equipment_items', 'product_option_sets', 'product_option_values'] as const;
type Change = { table: string; id: string; before: Record<string, unknown> | null; after: Record<string, unknown> };
type Model = typeof s.productModels.$inferSelect;
type Spec = { key: string; value: string; unit: string };
export function variableUniversalSpecs(rows: Spec[][]): string[] {
 const keys = new Set(rows.flatMap(row => row.map(value => value.key)));
 return [...keys].filter(key => new Set(rows.map(row => JSON.stringify(row.find(value => value.key === key) ?? null))).size > 1);
}
export function commonUniversalSpecs(rows: Spec[][]): Spec[] {
 const variable = new Set(variableUniversalSpecs(rows));
 return (rows[0] ?? []).filter(spec => !variable.has(spec.key));
}
async function raw(db: DbClient, table: string, id: string) {
 return (await db.execute(sql`SELECT to_jsonb(t) AS row FROM ${sql.identifier(table)} t WHERE id=${id}::uuid`)).rows[0]?.row as Record<string, unknown> | undefined;
}
async function universalModels(db: DbClient, tenantId: string) {
 const rows = await db.select({ model: s.productModels, categoryCode: s.productCategories.code }).from(s.productModels)
  .innerJoin(s.productGroups, eq(s.productModels.productGroupId, s.productGroups.id))
  .innerJoin(s.productCategories, eq(s.productModels.categoryId, s.productCategories.id))
  .innerJoin(s.divisions, eq(s.productGroups.divisionId, s.divisions.id))
  .where(and(eq(s.productModels.tenantId, tenantId),eq(s.divisions.tenantId,tenantId),sql`upper(${s.divisions.code})='UNIVERSAL'`,sql`upper(${s.productGroups.code})='UNIVERSAL'`,eq(s.productModels.isActive,true),isNull(s.productModels.deletedAt)));
 return rows.filter(row=>isMainMachineCategory(row.categoryCode));
}
async function assertOperator(db: DbClient, tenantId: string, userId: string) {
 const rows = await db.select({ id: s.users.id }).from(s.users).innerJoin(s.userRoles,eq(s.userRoles.userId,s.users.id)).innerJoin(s.roles,eq(s.roles.id,s.userRoles.roleId))
  .where(and(eq(s.users.id,userId),eq(s.users.tenantId,tenantId),eq(s.users.status,'active'),isNull(s.users.deletedAt),eq(s.roles.code,'super_admin'))).limit(1);
 if(!rows.length)throw new Error('Active tenant super administrator required');
}
async function hasCustomRules(db: DbClient, model: Model) {
 for(const table of ['product_optional_equipment_compatibilities','product_option_sets']){
  const result=await db.execute(sql`SELECT 1 FROM ${sql.identifier(table)} WHERE product_model_id=${model.id}::uuid AND deleted_at IS NULL LIMIT 1`);
  if(result.rows.length)return true;
 }
 const alternatives=await db.select({id:s.productAlternatives.id}).from(s.productAlternatives).where(and(isNull(s.productAlternatives.deletedAt),sql`(${s.productAlternatives.productModelId}=${model.id}::uuid OR ${s.productAlternatives.alternativeProductModelId}=${model.id}::uuid)`)).limit(1);
 return alternatives.length>0;
}
async function standardEquipment(db: DbClient, model: Model) {
 const rows=await db.select({item:s.productEquipmentItems,typeCode:s.equipmentTypes.code}).from(s.productEquipmentItems)
  .leftJoin(s.equipmentTypes,eq(s.productEquipmentItems.equipmentTypeId,s.equipmentTypes.id))
  .where(and(eq(s.productEquipmentItems.tenantId,model.tenantId),eq(s.productEquipmentItems.productModelId,model.id),isNull(s.productEquipmentItems.deletedAt)));
 if(rows.some(row=>row.typeCode?.toLowerCase()!=='standart'||row.item.isPromotion||(row.item.unitPrice!==null&&Number(row.item.unitPrice)!==0)))return null;
 return rows.map(row=>row.item);
}
type Equipment = typeof s.productEquipmentItems.$inferSelect;
const equipmentKey=(row:Equipment)=>JSON.stringify({equipmentTypeId:row.equipmentTypeId,title:row.title,description:row.description,isPromotion:row.isPromotion,unitPrice:row.unitPrice,currencyId:row.currencyId});
function documentedStandard(items:Equipment[],technicalText:string) {
 const normalize=(text:string)=>text.toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşü0-9]/g,'');
 const standardText=technicalText.split(/STANDART DONANIM/i)[1]??'';
 const normalized=normalize(standardText);
 return items.every(item=>normalize(item.title).length>0&&normalized.includes(normalize(item.title))&&(!item.description?.trim()||normalize(item.description)===normalize(item.title)));
}
async function prepare(db: DbClient, tenantId: string) {
 const snapshot=await readSnapshot(); const sources=snapshot.products.filter(row=>row.group==='UNIVERSAL');
 const models=(await universalModels(db,tenantId)).map(row=>row.model);
 const sourceFor=(model:Model)=>sources.find(source=>model.modelCode===`HM-${source.sourceId}`||model.catalogSources.some(ref=>ref.sourceId===source.sourceId&&ref.group==='UNIVERSAL'));
 const candidates=['600','1122'].map(id=>models.filter(model=>sourceFor(model)?.sourceId===id));
 if(candidates.some(rows=>rows.length>1))throw new Error('Ambiguous CD6241 source match');
 const pair=candidates.flat();const errors:string[]=[];
 let merge:Model[]=[];let sharedStandards:Equipment[]=[];let variantStandards:Equipment[][]=[];
 if(pair.length===2){
  const brands=await db.select().from(s.brands).where(eq(s.brands.id,pair[0].brandId));
  if(pair[0].brandId!==pair[1].brandId||pair[0].productTypeId!==pair[1].productTypeId||brands[0]?.name.trim().toUpperCase()!=='VOUGA')errors.push('CD6241: brand/type mismatch; retained independent bases');
  else if((await Promise.all(pair.map(model=>hasCustomRules(db,model)))).some(Boolean))errors.push('CD6241: custom equipment/options exist; retained independent bases');
  else {
   const equipment=await Promise.all(pair.map(model=>standardEquipment(db,model)));
   if(equipment.some(rows=>rows===null))errors.push('CD6241: custom equipment/options exist; retained independent bases');
   else if(!equipment.every((rows,index)=>documentedStandard(rows!,sourceFor(pair[index])!.technicalText)))errors.push('CD6241: standard equipment is not documented by source; retained independent bases');
   else {merge=pair;variantStandards=equipment as Equipment[][];const second=new Set(variantStandards[1].map(equipmentKey));sharedStandards=variantStandards[0].filter(item=>second.has(equipmentKey(item)));}
  }
 }
 const alreadyMerged=models.find(model=>model.baseModelConfiguration?.baseModelCode==='CD 6241'&&model.modelCode==='UNIV-VOUGA-CD6241');
 const specRows=await db.select().from(s.productSpecs).where(eq(s.productSpecs.tenantId,tenantId));
 const specsFor=(model:Model)=>specRows.filter(row=>row.productModelId===model.id&&!row.deletedAt).map(row=>({key:row.specKey,value:row.specValue,unit:row.specUnit??''}));
 const configsFor=(rows:Model[])=>rows.map(model=>({sourceModelCode:sourceFor(model)?.model??model.modelName??model.modelCode,sourceProductId:model.id,...(sourceFor(model)?{sourceUrl:sourceFor(model)!.sourceUrl}:{}),specs:specsFor(model)}));
 const mergedConfigs=()=>configsFor(merge).map((config,index)=>({...config,specs:[...config.specs.filter(spec=>spec.key!=='Standart Donanım'),{key:'Standart Donanım',value:variantStandards[index].map(item=>item.title).join('\n'),unit:''}]}));
 const independent=models.filter(model=>!model.catalogHidden&&!merge.some(row=>row.id===model.id)&&model.id!==alreadyMerged?.id);
 return {models,merge,sharedStandards,mergedConfigs,alreadyMerged,independent,errors,sourceFor,configsFor,sourceRevision:`${REVISION}:${snapshot.capturedOn}`};
}
export async function importUniversalBases(db: DbClient, tenantId:string,userId:string,apply=false) {
 await assertOperator(db,tenantId,userId);
 const initial=await prepare(db,tenantId);
 const remainingVariantReview=initial.independent.map(model=>({id:model.id,modelCode:model.modelCode,sourceModel:initial.sourceFor(model)?.model??model.modelName??model.modelCode})).filter(row=>/[\/]|\bSerisi\b/i.test(row.sourceModel));
 const summary={sharedStandardEquipment:initial.sharedStandards.length,remainingVariantReview,sourceRevision:initial.sourceRevision,independentBases:initial.independent.length,mergedBase:initial.merge.length?1:0,archivedVariants:initial.merge.length,review:initial.errors};
 if(!apply)return{mode:'preview',...summary};
 return db.transaction(async tx=>{
  const client=tx as unknown as DbClient;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId+':universal-bases'},0))`);
  for(const table of TABLES)await tx.execute(sql`LOCK TABLE ${sql.identifier(table)} IN SHARE ROW EXCLUSIVE MODE`);
  const plan=await prepare(client,tenantId);
  await tx.execute(sql`CREATE TABLE IF NOT EXISTS public.__universal_base_journal (tenant_id uuid PRIMARY KEY,changes jsonb NOT NULL,rolled_back_at timestamptz)`);
  const previous=(await tx.execute(sql`SELECT changes FROM public.__universal_base_journal WHERE tenant_id=${tenantId}::uuid AND rolled_back_at IS NULL FOR UPDATE`)).rows[0]?.changes;
  const changes=(previous??[]) as Change[];
  const capture=async(table:string,id:string,before:Record<string,unknown>|null)=>{const after=await raw(client,table,id);if(!after)throw new Error('Missing journal row');if(JSON.stringify(before)===JSON.stringify(after))return;const known=changes.find(c=>c.table===table&&c.id===id);if(known)known.after=after;else changes.push({table,id,before,after});};
  let updated=0,created=0,hidden=0;
  for(const model of plan.independent){
   if(model.baseModelConfiguration)continue;
   const source=plan.sourceFor(model);
   const config:BaseModelConfiguration={kind:'universal',baseModelCode:source?.model??model.modelName??model.modelCode,sourceModelCodes:[source?.model??model.modelName??model.modelCode],variableSpecKeys:[],sourceRevision:plan.sourceRevision,configurations:plan.configsFor([model])};
   const before=(await raw(client,'product_models',model.id))!;
   await tx.update(s.productModels).set({baseModelConfiguration:config,updatedAt:sql`${s.productModels.updatedAt}`}).where(eq(s.productModels.id,model.id));await capture('product_models',model.id,before);updated++;
  }
  if(plan.merge.length&&!plan.alreadyMerged){
   const source=plan.merge[0],configurations=plan.mergedConfigs(),specSets=configurations.map(c=>c.specs);
   const config:BaseModelConfiguration={kind:'universal',baseModelCode:'CD 6241',sourceModelCodes:configurations.map(c=>c.sourceModelCode),variableSpecKeys:variableUniversalSpecs(specSets),configurations,sourceRevision:plan.sourceRevision};
   const code='UNIV-VOUGA-CD6241';
   if((await tx.select({id:s.productModels.id}).from(s.productModels).where(and(eq(s.productModels.tenantId,tenantId),eq(s.productModels.modelCode,code)))).length)throw new Error('Universal base code collision');
   const [base]=await tx.insert(s.productModels).values({tenantId,brandId:source.brandId,productGroupId:source.productGroupId,categoryId:source.categoryId,subcategoryId:source.subcategoryId,productTypeId:source.productTypeId,series:'CD 6241',modelCode:code,modelName:'CD 6241',fullName:'VOUGA CD 6241 Üniversal Torna',currencyId:source.currencyId,vatRate:source.vatRate,imageUrl:source.imageUrl,listPrice:null,cashPrice:null,baseModelConfiguration:config,catalogSources:[],description:'Puntalar arası mesafe seçenekleri ayrı fiyatlandırılır. Mevcut varyant fiyatları geçmiş kayıtlarda korunmuştur.'}).returning();
   await capture('product_models',base.id,null);created++;
   // Only identical technical values are copied to the base, never variant measurements.
   for(const spec of commonUniversalSpecs(specSets)){const [row]=await tx.insert(s.productSpecs).values({tenantId,productModelId:base.id,specKey:spec.key,specValue:spec.value,specUnit:spec.unit}).returning();await capture('product_specs',row.id,null);}
   // Clone only the common documented STANDARD intersection; source IDs and historical links remain untouched.
   for(const item of plan.sharedStandards){
    const [row]=await tx.insert(s.productEquipmentItems).values({tenantId,productModelId:base.id,equipmentTypeId:item.equipmentTypeId,title:item.title,description:item.description,isPromotion:item.isPromotion,unitPrice:item.unitPrice,currencyId:item.currencyId,sortOrder:item.sortOrder}).returning();
    await capture('product_equipment_items',row.id,null);
   }
   const [set]=await tx.insert(s.productOptionSets).values({tenantId,productModelId:base.id,name:'Puntalar Arası Mesafe',configurationKind:null}).returning();await capture('product_option_sets',set.id,null);
   for(const [index,configuration]of configurations.entries()){
    const [value]=await tx.insert(s.productOptionValues).values({tenantId,optionSetId:set.id,value:configuration.sourceModelCode,sourceModelCode:configuration.sourceModelCode,currencyId:source.currencyId,priceDelta:null,sortOrder:index}).returning();await capture('product_option_values',value.id,null);
   }
   for(const model of plan.merge){const before=(await raw(client,'product_models',model.id))!;await tx.update(s.productModels).set({catalogHidden:true,updatedAt:sql`${s.productModels.updatedAt}`}).where(eq(s.productModels.id,model.id));await capture('product_models',model.id,before);hidden++;}
  }
  await tx.execute(sql`INSERT INTO public.__universal_base_journal (tenant_id,changes) VALUES (${tenantId}::uuid,${JSON.stringify(changes)}::jsonb) ON CONFLICT (tenant_id) DO UPDATE SET changes=excluded.changes,rolled_back_at=NULL`);
  return{mode:'applied',...summary,updated,created,hidden};
 });
}
export async function rollbackUniversalBases(db:DbClient,tenantId:string,apply=false){
 if(!(await db.execute(sql`SELECT to_regclass('public.__universal_base_journal') AS relation`)).rows[0]?.relation)return{mode:'preview',changes:0};
 const result=await db.execute(sql`SELECT changes FROM public.__universal_base_journal WHERE tenant_id=${tenantId}::uuid AND rolled_back_at IS NULL`);const changes=(result.rows[0]?.changes??[])as Change[];
 if(!apply)return{mode:'preview',changes:changes.length};
 return db.transaction(async tx=>{const client=tx as unknown as DbClient;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId+':universal-bases'},0))`);
  for(const table of TABLES)await tx.execute(sql`LOCK TABLE ${sql.identifier(table)} IN SHARE ROW EXCLUSIVE MODE`);
  const fresh=await tx.execute(sql`SELECT changes FROM public.__universal_base_journal WHERE tenant_id=${tenantId}::uuid AND rolled_back_at IS NULL FOR UPDATE`);
  const changes=(fresh.rows[0]?.changes??[])as Change[];
  for(const change of changes){if(!TABLES.includes(change.table as typeof TABLES[number]))throw new Error('Invalid rollback table');if(JSON.stringify(await raw(client,change.table,change.id))!==JSON.stringify(change.after))throw new Error('Universal rollback blocked by subsequent edit');}
  for(const change of changes.filter(c=>!c.before))await guardCatalogReferences(client,change.table,change.id,changes);
  for(const change of changes.filter(c=>c.before)){const keys=Object.keys(change.before!).filter(k=>k!=='id');const assignments=sql.join(keys.map(k=>sql`${sql.identifier(k)}=restored.${sql.identifier(k)}`),sql`, `);await tx.execute(sql`UPDATE ${sql.identifier(change.table)} t SET ${assignments} FROM jsonb_populate_record(NULL::${sql.identifier(change.table)},${JSON.stringify(change.before)}::jsonb) restored WHERE t.id=${change.id}::uuid`);}
  for(const table of [...TABLES].reverse())for(const change of changes.filter(c=>c.table===table&&!c.before))await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE id=${change.id}::uuid`);
  await tx.execute(sql`UPDATE public.__universal_base_journal SET rolled_back_at=now() WHERE tenant_id=${tenantId}::uuid`);return{mode:'rolled_back',changes:changes.length};
 });
}
