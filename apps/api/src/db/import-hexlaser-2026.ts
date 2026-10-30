/** Operator-run 2026 import. Preview is strictly read-only; source values never replace manual specs/prices. */
import { guardCatalogReferences } from './catalog-reference-guard';
import { getTableName } from 'drizzle-orm';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import { HEX2026_SERIES, HEX2026_REVISION, hex2026CapacityLabel, hex2026ProductType, isMainMachineCategory, type LaserBaseConfiguration } from '@haksan/shared';
import type { DbClient } from './client';
import * as s from './schema';
import { AuditService } from '../shared/database/audit.service';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { S3StorageProvider } from '../shared/storage/s3-storage.provider';
import { loadEnv } from '../config/env';
import path from 'node:path';
// tr.aorelaser.com snapshot (scripts/extract-aore-catalog.py): text only; its tables are evidence, never values.
type SeriesImage = { file: string; mimeType: string; sizeBytes: number; sha256: string };
type AoreSite = { series: string; url: string; title: string; highlights: string[]; features: string[] };
// Series photos cut from the HEX PDF itself (scripts/extract-hexlaser-2026-images.py): HEX LASER branded.
const pdfImages = (): Map<string, SeriesImage> => {
 const manifest = JSON.parse(readFileSync(path.join(__dirname, 'seed', 'data', 'hexlaser-2026', 'images.json'), 'utf8')) as { revision: string; images: Array<SeriesImage & { series: string }> };
 if (manifest.revision !== HEX2026_REVISION) throw new Error('HEX image manifest belongs to another PDF revision');
 return new Map(manifest.images.map(image => [image.series, image]));
};
const IMAGE_BUCKET = 'erp-product-images';
const aoreSite = (): Map<string, AoreSite> => {
 const file = path.join(__dirname, 'seed', 'data', 'aore-site', 'series.json');
 const snapshot = JSON.parse(readFileSync(file, 'utf8')) as { errors: unknown[]; series: AoreSite[] };
 if (snapshot.errors.length) throw new Error('AORE site snapshot is incomplete');
 return new Map(snapshot.series.map(row => [row.series, row]));
};
const aoreText = (row?: AoreSite) => row ? [row.title, row.highlights.join(' · '), ...row.features.map(f => `• ${f}`)].filter(Boolean).join('\n') : '';
const ID = 'hexlaser-2026-v1';
const tables = { models: s.productModels, sets: s.productOptionSets, values: s.productOptionValues, specs: s.productSpecs, files: s.files, media: s.productMedia, types: s.productTypes };
type Change = { table: keyof typeof tables; id: string; before: any; after: any };
const json = (row: unknown) => JSON.parse(JSON.stringify(row));
const ddl = sql`CREATE TABLE IF NOT EXISTS public.__hex2026_import_snapshots (tenant_id uuid PRIMARY KEY, revision text NOT NULL, changes jsonb NOT NULL, source jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), rolled_back_at timestamptz)`;
export async function importHexlaser2026(db: DbClient, tenantId: string, userId: string, apply = false, hideSuperseded = true, includeImages = true) {
 const [operator] = await db.select({ id: s.users.id }).from(s.users).innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id)).innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId)).where(and(eq(s.users.id, userId), eq(s.users.tenantId, tenantId), eq(s.users.status, 'active'), isNull(s.users.deletedAt), eq(s.roles.code, 'super_admin'))).limit(1);
 if (!operator) throw new Error('An active tenant super administrator is required');
 const [division] = await db.select().from(s.divisions).where(and(eq(s.divisions.tenantId, tenantId), sql`lower(${s.divisions.code}) = 'sac_isleme'`, eq(s.divisions.isActive, true), isNull(s.divisions.deletedAt)));
 if (!division) throw new Error('Sac İşleme division is missing');
 const brands = await db.select().from(s.brands).where(and(eq(s.brands.tenantId, tenantId), sql`upper(replace(${s.brands.name}, ' ', '')) = 'HEXLASER'`, isNull(s.brands.deletedAt)));
 if (brands.length > 1 && brands.filter(row=>row.isOwned).length!==1) throw new Error('Ambiguous HEX brand');
 const ownedBrands=brands.filter(row=>row.isOwned);
 const brand = ownedBrands.length===1?ownedBrands[0]:brands[0];
 if (brand?.divisionId && brand.divisionId !== division.id) throw new Error('HEX brand division conflicts');
 const existing = brand ? await db.select().from(s.productModels).where(and(eq(s.productModels.tenantId, tenantId), eq(s.productModels.brandId, brand.id), isNull(s.productModels.deletedAt))) : [];
 const matches = HEX2026_SERIES.map(source => ({ source, matches: existing.filter(row => row.laserBaseConfiguration?.familyCode === source.series || row.modelCode === `HEX2026-${source.series}`) }));
 if (matches.some(row => row.matches.length > 1)) throw new Error('Ambiguous existing HEX series base; no data was written');
 const siteSeries = aoreSite();
 const plan = { sourceRevision: HEX2026_REVISION, series: HEX2026_SERIES.length, aoreSiteSeries: HEX2026_SERIES.filter(row => siteSeries.has(row.series)).length, missingOnAoreSite: HEX2026_SERIES.filter(row => !siteSeries.has(row.series)).map(row => row.series), configurations: HEX2026_SERIES.reduce((n,row)=>n+row.configurations.length,0), createProducts: matches.filter(row=>!row.matches.length).length, preserveProducts: matches.filter(row=>row.matches.length).length, inferredPowers: 0, reviewFields: HEX2026_SERIES.flatMap(row=>row.configurations.flatMap(c=>c.fields.filter(f=>f.verification !== 'verified'))).length };
 const superseded = await supersededLaserCards(db, tenantId);
 if (!apply) return { mode: 'preview', ...plan, superseded: summarizeSuperseded(superseded), hideSuperseded };
 return db.transaction(async tx => {
  const client = tx as unknown as DbClient;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${tenantId+':hex2026'},0))`);
  await tx.execute(ddl);
  await tx.execute(sql`LOCK TABLE product_models,product_option_sets,product_option_values IN SHARE ROW EXCLUSIVE MODE`);
  const freshExisting=brand?await tx.select().from(s.productModels).where(and(eq(s.productModels.tenantId,tenantId),eq(s.productModels.brandId,brand.id),isNull(s.productModels.deletedAt))):[];
  const lockedMatches=HEX2026_SERIES.map(source=>({source,matches:freshExisting.filter(row=>row.laserBaseConfiguration?.familyCode===source.series||row.modelCode===`HEX2026-${source.series}`)}));
  if(lockedMatches.some(row=>row.matches.length>1))throw new Error('Ambiguous current HEX series base');
  const prior = await tx.execute(sql`SELECT changes FROM public.__hex2026_import_snapshots WHERE tenant_id = ${tenantId} AND rolled_back_at IS NULL FOR UPDATE`);
  const changes: Change[] = prior.rows.length ? prior.rows[0]!.changes as Change[] : [];
  const capture = (table: Change['table'], before: any, after: any) => { const known=changes.find(c=>c.table===table&&c.id===after.id); if(known) known.after=json(after); else changes.push({table,id:after.id,before:before?json(before):null,after:json(after)}); };
  let actualBrand=brand;
  if(!actualBrand) [actualBrand]=await tx.insert(s.brands).values({tenantId,name:'HEX LASER',isOwned:true,divisionId:division.id,technicalCatalogCode:'AORE_LASER'}).returning();
  if(!actualBrand) throw new Error('HEX brand setup failed');
  const ensure=async(table:any, code:string,name:string,parent:Record<string,string>={})=> {
   const rows=await tx.select().from(table).where(and(eq(table.code,code),eq(table.divisionId,division.id)));
   if(rows.length>1)throw new Error(`Ambiguous taxonomy ${code}`);
   const known=rows[0]; if(known){if(known.isActive===false||Object.entries(parent).some(([key,val])=>known[key]!==val))throw new Error(`Taxonomy ${code} requires review`);return known;}
   const created=(await tx.insert(table).values({code,name,divisionId:division.id,...parent}).returning() as any[])[0]; return created;
  };
  const group=await ensure(s.productGroups,'SAC_ISLEME','Sac İşleme');
  const categoryCandidates=(await tx.select().from(s.productCategories).where(and(eq(s.productCategories.divisionId,division.id),eq(s.productCategories.productGroupId,group.id),eq(s.productCategories.isActive,true)))).filter(row=>isMainMachineCategory(row.code));
  if(categoryCandidates.length>1)throw new Error('Ambiguous existing machine category');
  const category=categoryCandidates[0]??await ensure(s.productCategories,'TEZGAH','Sac İşleme Tezgahları',{productGroupId:group.id});
  const [currency]=await tx.select().from(s.currencies).where(eq(s.currencies.code,'USD')); if(!currency)throw new Error('USD currency missing');
  let createdProducts=0,updatedProducts=0,enrichedProducts=0;
  const site=aoreSite(); const images=pdfImages();
  for(const {source,matches:found} of lockedMatches){
   const typeCode=hex2026ProductType(source);
   // Haksan site import keeps welding under its own KAYNAK group; reuse it rather than demand a second taxonomy.
   const weldingGroup=source.kind==='welding'?(await tx.select().from(s.productGroups).where(and(eq(s.productGroups.code,'KAYNAK'),eq(s.productGroups.divisionId,division.id),eq(s.productGroups.isActive,true))))[0]:undefined;
   const sourceGroup=weldingGroup??group;
   const sourceCategory=source.kind==='welding'?await ensure(s.productCategories,'HM_KAYNAK_KAYNAK','Kaynak Teknolojileri',{productGroupId:sourceGroup.id}):category;
   const sub=await ensure(s.productSubcategories,source.kind==='welding'?'HM_KAYNAK_HEX_LAZER_KAYNAK':'SAC_LAZER_KESIM',source.kind==='welding'?'Lazer Kaynak':'Lazer Kesim',{categoryId:sourceCategory.id});
   const typeRows=await tx.select().from(s.productTypes).where(and(sql`upper(${s.productTypes.code}) = ${typeCode.toUpperCase()}`,eq(s.productTypes.divisionId,division.id),eq(s.productTypes.isActive,true)));const exactTypes=typeRows.filter(row=>row.code===typeCode);const preferredTypes=exactTypes.length?exactTypes:typeRows;if(preferredTypes.length>1)throw new Error(`Ambiguous product type ${typeCode}`);const existingType=preferredTypes[0]; // DB keeps legacy lower-case codes (fiber_lazer_kesim)
   // Existing IDs and auxiliary family parents stay intact. New cutting types share the machine family.
   const type=existingType??await ensure(s.productTypes,typeCode,source.kind==='tube'?'Boru/Profil Fiber Lazer':source.kind==='3d'?'3D 5 Eksen Lazer':source.kind==='welding'?'Fiber Lazer Kaynak':'Sac Fiber Lazer',{subcategoryId:sub.id});
   if(source.kind==='welding' && type.subcategoryId!==sub.id){
    const [updatedType]=await tx.update(s.productTypes).set({subcategoryId:sub.id}).where(eq(s.productTypes.id,type.id)).returning();capture('types',type,updatedType);
    const sourceCards=await tx.select().from(s.productModels).where(and(eq(s.productModels.tenantId,tenantId),eq(s.productModels.productTypeId,type.id)));
    for(const card of sourceCards){const [updated]=await tx.update(s.productModels).set({productGroupId:sourceGroup.id,categoryId:sourceCategory.id,subcategoryId:sub.id,updatedAt:sql`${s.productModels.updatedAt}`}).where(eq(s.productModels.id,card.id)).returning();capture('models',card,updated);}
    type.subcategoryId=sub.id;
   }
   const baseConfig={familyCode:source.series,series:source.series,productTypeCode:typeCode,sourceModelCodes:source.configurations.map(c=>c.sourceModelCode),sourceRevision:HEX2026_REVISION} as LaserBaseConfiguration;
   let base=found[0];
   if(base){
    if(base.productTypeId!==type.id)throw new Error(`Existing ${source.series} product type requires review`);
    // Fill only empty text/image; manual edits always win.
    const fill={...(!base.description?.trim()&&site.has(source.series)?{description:aoreText(site.get(source.series))}:{})};
    if(Object.keys(fill).length){const before=base;[base]=await tx.update(s.productModels).set({...fill,updatedAt:sql`${s.productModels.updatedAt}`}).where(eq(s.productModels.id,base.id)).returning();capture('models',before,base);enrichedProducts++;}
    if((base.laserBaseConfiguration as (LaserBaseConfiguration & { sourceRevision?: string }) | null)?.sourceRevision!==HEX2026_REVISION||!isDeepStrictEqual((base.laserBaseConfiguration as LaserBaseConfiguration | null)?.sourceModelCodes,baseConfig.sourceModelCodes)){const before=base;[base]=await tx.update(s.productModels).set({laserBaseConfiguration:baseConfig,updatedAt:sql`${s.productModels.updatedAt}`}).where(eq(s.productModels.id,base.id)).returning();capture('models',before,base);updatedProducts++;}
   }else{
    [base]=await tx.insert(s.productModels).values({tenantId,brandId:actualBrand.id,series:source.series,productGroupId:sourceGroup.id,categoryId:sourceCategory.id,subcategoryId:type.subcategoryId,productTypeId:type.id,modelCode:`HEX2026-${source.series}`,modelName:`${source.series} Serisi`,fullName:`${source.series} Serisi`,currencyId:currency.id,vatRate:'20',listPrice:null,cashPrice:null,technicalConfiguration:null,laserBaseConfiguration:baseConfig,description:`${aoreText(site.get(source.series))}${site.has(source.series)?'\n\n':''}HEX 2026 PDF, sayfa ${source.page}. Ölçü/güç seçenekleri ayrı fiyatlandırılır. Güç aralıklarından seçenek üretilmez; doğrulanmış seçenekler kullanıcı tarafından eklenmelidir. Kaynak revizyonu: ${HEX2026_REVISION}.`}).returning();capture('models',null,base);createdProducts++;
   }
   // Image is served from our own storage (no hotlinking); filled only when the card has none.
   const image=images.get(source.series);
   if(includeImages&&image&&!base.imageUrl){const fileId=await storeSeriesImage(client,tenantId,userId,base.id,source.series,image,capture);if(fileId){const before=base;[base]=await tx.update(s.productModels).set({imageUrl:`/products/media/${fileId}`,updatedAt:sql`${s.productModels.updatedAt}`}).where(eq(s.productModels.id,base.id)).returning();capture('models',before,base);enrichedProducts++;}}
   const required=[{kind:'table' as const,name:source.kind==='tube'?'Boru kapasitesi / uzunluk':source.kind==='welding'?'Kaynak modeli / ekipman boyutu':'Tabla Boyutu'},{kind:'power' as const,name:'Rezonatör Gücü'},...(source.standardCabin?[{kind:'cabin' as const,name:'Kabin'}]:[])];
   for(const [sortOrder,definition]of required.entries()){
    const sets=await tx.select().from(s.productOptionSets).where(and(eq(s.productOptionSets.tenantId,tenantId),eq(s.productOptionSets.productModelId,base.id),eq(s.productOptionSets.configurationKind,definition.kind),isNull(s.productOptionSets.deletedAt)));
    if(sets.length>1)throw new Error('Ambiguous option group');let set=sets[0];if(!set){[set]=await tx.insert(s.productOptionSets).values({tenantId,productModelId:base.id,name:definition.name,configurationKind:definition.kind,sortOrder}).returning();capture('sets',null,set);}
    const choices=definition.kind==='table'?source.configurations.map(c=>({value:`${c.sourceModelCode} · ${hex2026CapacityLabel(c)}`.slice(0,255),sourceModelCode:c.sourceModelCode})):definition.kind==='power'?source.powerOptions.map(powerKw=>({value:`${powerKw} kW`,powerKw})):source.standardCabin?[{value:source.standardCabin==='open'?'Açık Kabin':'Kapalı Kabin',cabinType:source.standardCabin}]:[];
    const values=await tx.select().from(s.productOptionValues).where(and(eq(s.productOptionValues.tenantId,tenantId),eq(s.productOptionValues.optionSetId,set.id)));
    for(const [index,choice] of choices.entries()){if(values.some(value=>value.value===choice.value))continue;const [value]=await tx.insert(s.productOptionValues).values({tenantId,optionSetId:set.id,...choice,currencyId:base.currencyId,priceDelta:null,sortOrder:index}).returning();capture('values',null,value);}
   }
  }
  // Unconfirmed AORE-only sources remain hidden drafts under their actual manufacturer.
  const supplemental=JSON.parse(readFileSync(path.join(__dirname,'seed','data','hexlaser-2026','aore-supplement.json'),'utf8')) as {products:Array<{series:string;url:string;capturedAt:string;tables:unknown[]}>;errors?:unknown[]};
  if(supplemental.errors?.length)throw new Error('Incomplete AORE supplemental source');
  const covered=new Set(HEX2026_SERIES.map(row=>row.series));
  const drafts=supplemental.products.filter(row=>!covered.has(row.series));
  let draftProducts=0;
  if(drafts.length){
   const aoreBrands=await tx.select().from(s.brands).where(and(eq(s.brands.tenantId,tenantId),sql`upper(replace(${s.brands.name},' ','')) = 'AORE'`,isNull(s.brands.deletedAt)));
   if(aoreBrands.length>1)throw new Error('Ambiguous AORE draft brand');
   const aoreBrand=aoreBrands[0]??(await tx.insert(s.brands).values({tenantId,name:'AORE',divisionId:division.id}).returning())[0]!;
   for(const row of drafts){
    const modelCode=`AORE-DRAFT-${row.series}`;
    const known=await tx.select().from(s.productModels).where(and(eq(s.productModels.tenantId,tenantId),eq(s.productModels.modelCode,modelCode)));
    if(known.length){if(known[0].brandId!==aoreBrand.id)throw new Error('AORE draft source code collision');continue;}
    const [draft]=await tx.insert(s.productModels).values({tenantId,brandId:aoreBrand.id,series:row.series,modelCode,modelName:`${row.series} Serisi`,fullName:`AORE ${row.series} Serisi`,catalogHidden:true,isActive:false,listPrice:null,cashPrice:null,description:`Taslak: HEX eşdeğerliği ve teknik konfigürasyon doğrulanmamıştır. Kaynak: ${row.url} (${row.capturedAt})`,catalogSources:[{sourceId:`aore:${row.series}`,url:row.url,capturedOn:row.capturedAt,group:'AORE_DRAFT',typeCode:'UNVERIFIED'}]}).returning();
    capture('models',null,draft);draftProducts++;
   }
  }
  // Old AORE/HEX cards of a series that now has a HEX LASER base leave the pickers; history keeps pointing at them.
  let hiddenProducts=0;
  if(hideSuperseded){for(const card of await supersededLaserCards(client,tenantId)){const [before]=await tx.select().from(s.productModels).where(eq(s.productModels.id,card.id));const [after]=await tx.update(s.productModels).set({catalogHidden:true,updatedAt:sql`${s.productModels.updatedAt}`}).where(eq(s.productModels.id,card.id)).returning();capture('models',before,after);hiddenProducts++;}}
  await tx.execute(sql`INSERT INTO public.__hex2026_import_snapshots (tenant_id,revision,changes,source) VALUES (${tenantId},${ID},${JSON.stringify(changes)}::jsonb,${JSON.stringify(HEX2026_SERIES)}::jsonb) ON CONFLICT (tenant_id) DO UPDATE SET changes=excluded.changes,source=excluded.source,applied_at=now(),rolled_back_at=NULL`);
  await new AuditService(client).write({tenantId,actorUserId:userId,action:'catalog.hex2026_imported',resourceType:'brand',resourceId:actualBrand.id,newValues:{...plan,createdProducts,updatedProducts,enrichedProducts,hiddenProducts}});
  return {mode:'applied',...plan,createdProducts,updatedProducts,enrichedProducts,hiddenProducts,draftProducts};
 });
}
export async function rollbackHexlaser2026(db:DbClient,tenantId:string,apply=false){
 const exists=await db.execute(sql`SELECT to_regclass('public.__hex2026_import_snapshots') AS relation`);if(!exists.rows[0]?.relation)return {mode:'preview',changes:0};
 const result=await db.execute(sql`SELECT changes FROM public.__hex2026_import_snapshots WHERE tenant_id=${tenantId} AND rolled_back_at IS NULL`);const changes=(result.rows[0]?.changes??[]) as Change[];if(!apply)return{mode:'preview',changes:changes.length};
 return db.transaction(async tx=>{
  await tx.execute(sql`LOCK TABLE product_models,product_option_sets,product_option_values,quote_items IN SHARE ROW EXCLUSIVE MODE`);
  for(const change of changes){const [current]=await tx.select().from(tables[change.table]).where(eq(tables[change.table].id,change.id));if(!isDeepStrictEqual(json(current),change.after))throw new Error(`Rollback blocked by edit: ${change.id}`);
   if(change.table==='models'&&!change.before){const references=await tx.execute(sql`SELECT 1 FROM quote_items WHERE product_model_id=${change.id} UNION ALL SELECT 1 FROM inventory_items WHERE product_model_id=${change.id} UNION ALL SELECT 1 FROM opportunity_products WHERE product_model_id=${change.id} LIMIT 1`);if(references.rows.length)throw new Error('Rollback blocked by commercial reference');}
  }
  const referenceJournal=changes.map(change=>({table:getTableName(tables[change.table]),id:change.id}));
  for(const change of changes.filter(change=>!change.before))await guardCatalogReferences(tx as unknown as DbClient,getTableName(tables[change.table]),change.id,referenceJournal);
  for(const change of [...changes].reverse()){if(change.before){const before=change.before;if(change.table==='types'){await tx.update(s.productTypes).set({subcategoryId:before.subcategoryId}).where(eq(s.productTypes.id,change.id));continue;}await tx.update(s.productModels).set({productGroupId:before.productGroupId,categoryId:before.categoryId,subcategoryId:before.subcategoryId,laserBaseConfiguration:before.laserBaseConfiguration,description:before.description,imageUrl:before.imageUrl,catalogHidden:before.catalogHidden,updatedAt:sql`${s.productModels.updatedAt}`}).where(eq(s.productModels.id,change.id));}else await tx.delete(tables[change.table]).where(eq(tables[change.table].id,change.id));}
  await tx.execute(sql`UPDATE public.__hex2026_import_snapshots SET rolled_back_at=now() WHERE tenant_id=${tenantId}`);return{mode:'rolled_back',changes:changes.length};
 });
}

/** Copies the bundled HEX PDF series image into the product-image bucket and links it (same path as migration 021). */
export async function storeSeriesImage(db: DbClient, tenantId: string, userId: string, productId: string, series: string, image: SeriesImage,
  capture: (table: Change['table'], before: unknown, after: any) => void): Promise<string | null> {
  const body = readFileSync(path.join(__dirname, 'seed', 'data', 'hexlaser-2026', 'images', image.file));
  if (createHash('sha256').update(body).digest('hex') !== image.sha256) throw new Error(`${series} görseli bütünlük kontrolünden geçemedi`);
  const storage = new S3StorageProvider();
  const objectKey = `${tenantId}/product/${productId}/hex2026-${image.file}`;
  try {
    const remote = await storage.getFileMetadata(IMAGE_BUCKET, objectKey);
    if (remote && remote.sizeBytes !== body.byteLength) throw new Error(`${series} görseli depoda farklı boyutta`);
    if (!remote) await storage.uploadFile({ bucket: IMAGE_BUCKET, objectKey, body, mimeType: image.mimeType, contentLength: body.byteLength });
  } catch (error) {
    if (loadEnv().NODE_ENV === 'production') throw error;
    console.warn(`[hex2026] ${series} görseli yüklenemedi, kart görselsiz kaldı: ${(error as Error).message}`);
    return null;
  }
  const provider = await db.query.storageProviders.findFirst({ where: eq(s.storageProviders.code, storage.providerCode) });
  const [file] = await db.insert(s.files).values({ tenantId, bucket: IMAGE_BUCKET, objectKey, originalFilename: `${series}.${image.file.split('.').pop()}`,
    mimeType: image.mimeType, extension: image.file.split('.').pop()!, sizeBytes: body.byteLength, sha256: image.sha256,
    storageProviderId: provider?.id ?? null, visibility: 'public', uploadedBy: userId, uploadStatus: 'linked', uploadedAt: new Date() }).returning();
  capture('files', null, file!);
  const [media] = await db.insert(s.productMedia).values({ tenantId, productModelId: productId, fileId: file!.id, mediaType: 'image', title: `${series} Serisi`, sortOrder: 0 }).returning();
  capture('media', null, media!);
  return file!.id;
}

type SupersededCard = { id: string; modelCode: string; brand: string; series: string; references: Record<string, number> };
const referenceTables = ['quote_items', 'opportunity_products', 'inventory_items', 'sales_order_items', 'accounting_invoice_lines'] as const;
/** Visible AORE / HEX LASER laser cards whose series now has a HEX 2026 base (the bases themselves excluded). */
export async function supersededLaserCards(db: DbClient, tenantId: string): Promise<SupersededCard[]> {
  // Canonical 2026 bases alone stay in the sales picker; all source series remain in history.
  const rows = await db.select({ id: s.productModels.id, modelCode: s.productModels.modelCode, modelName: s.productModels.modelName, fullName: s.productModels.fullName,
    series: s.productModels.series, groupCode: s.productGroups.code, baseConfiguration: s.productModels.laserBaseConfiguration, brand: s.brands.name, typeCode: s.productTypes.code }).from(s.productModels)
    .innerJoin(s.brands, eq(s.brands.id, s.productModels.brandId)).leftJoin(s.productTypes, eq(s.productTypes.id, s.productModels.productTypeId)).leftJoin(s.productGroups,eq(s.productGroups.id,s.productModels.productGroupId))
    .where(and(eq(s.productModels.tenantId, tenantId), isNull(s.productModels.deletedAt), eq(s.productModels.catalogHidden, false),
      sql`upper(replace(${s.brands.name}, ' ', '')) IN ('AORE', 'AORELASER', 'HEXLASER')`, sql`${s.productModels.modelCode} NOT LIKE 'HEX2026-%'`));
  const cards: SupersededCard[] = [];
  for (const row of rows) {
    if (row.groupCode?.toUpperCase()==='CNC' || !['FIBER_LAZER_KESIM','FIBER_LAZER','BORU_LAZER_KESIM','FIBER_LAZER_BORU_KESIM','SAC_BORU_LAZER_KESIM','FIBER_LAZER_3D_KESIM','FIBER_LAZER_KAYNAK','LAZER_TEMIZLEME','SAC_LAZER_KESIM','LAZER_KESIM'].includes((row.typeCode??'').toUpperCase()) || row.baseConfiguration?.sourceRevision === HEX2026_REVISION) continue;
    // Model cards carry `series`; site cards only say "PG Serisi" in their name.
    const series = row.series?.trim().toUpperCase() || (`${row.modelName ?? ''} ${row.fullName}`.match(/\b([A-Z]{1,4}) Serisi\b/)?.[1] ?? '');
    // Non-PDF legacy series are retained for history as well, but do not remain separate sale cards.
    // Unclassified legacy source cards also stay only in history; do not guess their series.
    const references: Record<string, number> = {};
    for (const table of referenceTables) {
      const result = await db.execute(sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)} WHERE product_model_id = ${row.id}`);
      const n = Number((result.rows[0] as { n: number }).n);
      if (n) references[table] = n;
    }
    cards.push({ id: row.id, modelCode: row.modelCode, brand: row.brand, series, references });
  }
  return cards;
}
function summarizeSuperseded(cards: SupersededCard[]) {
  const bySeries: Record<string, number> = {};
  for (const card of cards) bySeries[card.series] = (bySeries[card.series] ?? 0) + 1;
  return { count: cards.length, bySeries, withReferences: cards.filter(card => Object.keys(card.references).length)
    .map(card => ({ modelCode: card.modelCode, brand: card.brand, series: card.series, references: card.references })) };
}

