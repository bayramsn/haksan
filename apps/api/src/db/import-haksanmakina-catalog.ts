/** Operator-run import of the public Haksan Makina product snapshots. */
import 'reflect-metadata';
import { beginCatalogJournal, finishCatalogJournal } from './catalog-import-journal';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { closeDb, getDb, type DbClient } from './client';
import * as s from './schema';
import { isMainMachineCategory, machineCategoryLabel, machineFamilyForType, machineGroupCode } from '@haksan/shared';

const source = 'https://www.haksanmakina.com.tr/';
import { SPEC_GROUP_NAMES, canonicalSpecs, specTemplateFor, type SpecField } from './haksan-spec-templates';
import { matchSourceCard, resolveMatch, type ExistingProduct, type MatchDecision } from './catalog-matching';
import { haksanGroups as groups, haksanNormal as normal, haksanTypeCode as typeCode, haksanSubcategoryCode as subcategoryCode, haksanDivision as divisionOf, haksanExclusion, isCanonicalLaserSource } from './haksan-catalog-classification';

const productSchema = z.object({
  sourceId: z.string().regex(/^\d+$/),
  sourceUrl: z.string().url().startsWith(source),
  group: z.enum(['CNC', 'UNIVERSAL', 'SAC_ISLEME', 'KAYNAK', 'HAVA', 'TASIMA', 'AYDINLATMA', 'HIRDAVAT', 'YEDEK_PARCA']),
  sourceCategory: z.string().trim().min(2).max(255),
  title: z.string().trim().min(2).max(512),
  model: z.string().trim().max(128).default(''),
  brand: z.string().trim().min(1).max(128),
  summary: z.string().default(''),
  technicalText: z.string().default(''),
  imageUrl: z.string().url().startsWith(source).or(z.literal('')).default(''),
  specs: z.array(z.object({ key: z.string().trim().min(1).max(255), value: z.string().trim().min(1).max(2000), unit: z.string().trim().max(64).default('') })).max(100),
  fieldHints: z.array(z.object({ key: z.string().trim().min(1).max(255), unit: z.string().trim().max(64) })).max(100).default([]),
});
const snapshotSchema = z.object({
  source: z.literal(source), capturedOn: z.string(), errors: z.array(z.unknown()),
  products: z.array(productSchema).min(1),
});
type Product = z.infer<typeof productSchema>;

const productCode = (product: Product) => `HM-${product.sourceId}`;
const specGroupCode = (key: string) => {
  const text = normal(key);
  if (/BUKME|SILINDIR|TOP_CAP|BOGAZ/.test(text)) return 'BUKME';
  if (/KESME|MAKAS|BI[CÇ]AK/.test(text)) return 'KESME';
  if (/MOTOR|GUC|KW/.test(text)) return 'MOTORLAR';
  if (/TABLA/.test(text)) return 'TABLA';
  if (/KAPASITE|TONAJ|BASINC/.test(text)) return 'KAPASITE';
  return 'GENEL';
};
// Blank fields are editing prompts, not inferred product values. Actual values
// come only from the product page snapshot.
const familyFields: Record<string, Array<[string, string]>> = {
  fiber_lazer_boru_kesim: [['Lazer Gücü', 'kW'], ['Boru Kesim Çapı', 'mm'], ['Boru Kesim Uzunluğu', 'mm'], ['Konumlama Hassasiyeti', 'mm'], ['Maksimum Hareket Hızı', 'm/dk']],
  ABKANT_PRES: [['Bükme Kuvveti', 'ton'], ['Bükme Boyu', 'mm'], ['Bükme Kalınlığı', 'mm'], ['Ayaklar Arası Mesafe', 'mm'], ['Strok', 'mm'], ['Motor Gücü', 'kW'], ['Makine Ağırlığı', 'kg']],
  GIYOTIN_MAKAS: [['Kesme Boyu', 'mm'], ['Kesme Kalınlığı', 'mm'], ['Arka Dayama', 'mm'], ['Motor Gücü', 'kW'], ['Makine Ağırlığı', 'kg']],
  SILINDIR_MAKINESI: [['Sac Bükme Kapasitesi', 'mm'], ['Silindir Boyu', 'mm'], ['Üst Top Çapı', 'mm'], ['Motor Gücü', 'kW'], ['Makine Ağırlığı', 'kg']],
  HM_SAC_ISLEME_BORU_PROFIL_BUKME_MAKINALARI: [['Boru Bükme Kapasitesi', 'mm'], ['Profil Bükme Kapasitesi', 'mm'], ['Çalışma Hızı', 'm/dk'], ['Motor Gücü', 'kW'], ['Makine Ağırlığı', 'kg']],
  HM_SAC_ISLEME_EKSANTRIK_PRESLER: [['Pres Tonajı', 'ton'], ['Strok', 'mm'], ['Vuruş Sayısı', 'vuruş/dk'], ['Motor Gücü', 'kW'], ['Makine Ağırlığı', 'kg']],
  HM_SAC_ISLEME_DAIRE_KESME_MAKINALARI: [['Kesme Çapı', 'mm'], ['Kesme Kalınlığı', 'mm'], ['Motor Gücü', 'kW'], ['Makine Ağırlığı', 'kg']],
  HM_SAC_ISLEME_KOMBINE_MAKASLAR: [['Kesme Kapasitesi', 'mm'], ['Delme Kapasitesi', 'mm'], ['Delme Çapı', 'mm'], ['Motor Gücü', 'kW']],
  HM_SAC_ISLEME_KURTAGZI_ACMA_MAKINALARI: [['Boru Çapı', 'mm'], ['Açma Açısı', 'derece'], ['Motor Gücü', 'kW']],
  HM_KAYNAK_ARGON_KAYNAK_MAKINALARI_TIG: [['Kaynak Akımı', 'A'], ['Giriş Gerilimi', 'V'], ['Güç', 'kVA']],
  HM_HAVA_PISTONLU_HAVA_KOMPRESORLERI: [['Depo Hacmi', 'L'], ['Hava Debisi', 'L/dk'], ['Çalışma Basıncı', 'bar'], ['Motor Gücü', 'kW']],
  HM_TASIMA_TRANSPALETLER: [['Taşıma Kapasitesi', 'kg'], ['Çatal Uzunluğu', 'mm'], ['Kaldırma Yüksekliği', 'mm']],
  HM_UNIVERSAL_ELEKTRO_EREZYON_TEZGAHLARI: [['İşleme Kapasitesi', 'mm'], ['Tabla Ölçüsü', 'mm'], ['Jeneratör Gücü', 'A']],
  HM_UNIVERSAL_SERIT_TESTERE_TEZGAHLARI_SUTUNLU: [['Kesme Kapasitesi', 'mm'], ['Testere Ölçüsü', 'mm'], ['Kesme Hızı', 'm/dk'], ['Motor Gücü', 'kW']],
};
// Laser templates come from the laser catalog; CNC templates are never written here.
const laserType = /^(FIBER_LAZER_KESIM|FIBER_LAZER_BORU_KESIM|SAC_BORU_LAZER_KESIM)$/i;
export const templateFieldsFor = (type: string): SpecField[] => laserType.test(type) ? []
  : specTemplateFor(type) ?? (familyFields[type] ?? []).map(([key, unit]) => ({ group: specGroupCode(key), key, unit }));
const snapshotPath = path.join(__dirname, 'seed', 'data', 'haksanmakina', 'products.json');
const decisionsPath = path.join(__dirname, 'seed', 'data', 'haksanmakina', 'match-decisions.json');
const decisionSchema = z.record(z.string().regex(/^\d+$/), z.union([z.enum(['new', 'skip']), z.object({ modelCode: z.string().min(1).max(64) })]));
/** Operator answers for near matches the report could not settle; absent file = no decisions. */
export async function readMatchDecisions(): Promise<Record<string, MatchDecision>> {
  try { return decisionSchema.parse(JSON.parse(await readFile(decisionsPath, 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
}
export async function loadExistingProducts(db: DbClient, tenantId: string): Promise<ExistingProduct[]> {
  const rows = await db.select({ id: s.productModels.id, modelCode: s.productModels.modelCode, modelName: s.productModels.modelName,
    catalogSources: s.productModels.catalogSources, brand: s.brands.name, division: s.divisions.code, typeCode: s.productTypes.code }).from(s.productModels)
    .leftJoin(s.brands, eq(s.brands.id, s.productModels.brandId))
    .leftJoin(s.productTypes, eq(s.productTypes.id, s.productModels.productTypeId))
    .leftJoin(s.divisions, eq(s.divisions.id, sql`coalesce(${s.productTypes.divisionId}, ${s.brands.divisionId})`))
    .where(and(eq(s.productModels.tenantId, tenantId), isNull(s.productModels.deletedAt)));
  return rows.map(row => ({ ...row, division: row.division ? normal(row.division) : null }));
}
const fiberSnapshotPath = path.join(__dirname, 'seed', 'data', 'haksanmakina', 'fiber-laser-products.json');

export async function readSnapshot(fiberOnly = false) {
  const snapshot = snapshotSchema.parse(JSON.parse(await readFile(fiberOnly ? fiberSnapshotPath : snapshotPath, 'utf8')));
  if (snapshot.errors.length) throw new Error(`Kaynak taramasında ${snapshot.errors.length} hata var; eksik katalog aktarılmadı`);
  const ids = new Set<string>();
  for (const product of snapshot.products) {
    if (!isCanonicalLaserSource(product) && !haksanExclusion(product)) subcategoryCode(product); // Validate before writes.
    if (ids.has(product.sourceId)) throw new Error(`Yinelenen kaynak kimliği: ${product.sourceId}`);
    ids.add(product.sourceId);
    if (fiberOnly) {
      if (product.group !== 'SAC_ISLEME' || !/fiber/i.test(product.title)) throw new Error(`Fiber lazer kesim dışında ürün: ${product.sourceUrl}`);
    }
  }
  return { ...snapshot, deferredLasers: snapshot.products.filter(isCanonicalLaserSource),
    excluded: snapshot.products.flatMap(p => { const reason = haksanExclusion(p); return reason ? [{ sourceId: p.sourceId, sourceUrl: p.sourceUrl, reason }] : []; }),
    products: snapshot.products.filter(product => !isCanonicalLaserSource(product) && !haksanExclusion(product)) };
}

export async function previewHaksanmakinaCatalog(fiberOnly = false) {
  const snapshot = await readSnapshot(fiberOnly);
  const byGroup = Object.fromEntries(Object.keys(groups).map((code) => [code, snapshot.products.filter((p) => p.group === code).length]));
  const plannedFields = new Set(snapshot.products.flatMap((product) => {
    const type = typeCode(product);
    const division = divisionOf(product);
    return (division === 'CNC' && !type.startsWith('HM_') ? [] : templateFieldsFor(type)).map(({ key }) => `${division}:${type}:${key.toLocaleLowerCase('tr-TR')}`);
  }));
  return { mode: 'preview', capturedOn: snapshot.capturedOn, products: snapshot.products.length, byGroup,
    technicalValues: snapshot.products.reduce((total, product) => total + canonicalSpecs(typeCode(product), product.specs).filter(spec => !spec.layout).length, 0),
    deferredLasers: snapshot.deferredLasers.map(p => ({ sourceId: p.sourceId, sourceUrl: p.sourceUrl, reason: 'canonical_hex_aore_pipeline' })),
    excluded: snapshot.excluded,
    byDivision: snapshot.products.reduce<Record<string, number>>((acc, p) => ({ ...acc, [divisionOf(p)]: (acc[divisionOf(p)] ?? 0) + 1 }), {}),
    technicalFields: plannedFields.size, productTypes: new Set(snapshot.products.map(typeCode)).size };
}

export async function importHaksanmakinaCatalog(db: DbClient, tenantId: string, userId: string, apply = false, fiberOnly = false, refreshTemplates = false, matchDecisions?: Record<string, MatchDecision>) {
  if (!apply) return previewHaksanmakinaCatalog(fiberOnly);
  const snapshot = await readSnapshot(fiberOnly);
  const byGroup = Object.fromEntries(Object.keys(groups).map((code) => [code, snapshot.products.filter((p) => p.group === code).length]));
  const brandDivisions = new Map<string, Set<string>>();
  for (const product of snapshot.products) {
    const key = product.brand.toLocaleLowerCase('tr-TR');
    const used = brandDivisions.get(key) ?? new Set<string>();
    used.add(divisionOf(product));
    brandDivisions.set(key, used);
  }

  const [tenant] = await db.select({ id: s.tenants.id }).from(s.tenants).where(eq(s.tenants.id, tenantId));
  if (!tenant) throw new Error('Belirtilen tenant bulunamadı');
  const [operator] = await db.select({ id: s.users.id }).from(s.users)
    .innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id))
    .innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId))
    .where(and(eq(s.users.id, userId), eq(s.users.tenantId, tenantId), eq(s.users.status, 'active'), isNull(s.users.deletedAt), eq(s.roles.code, 'super_admin'))).limit(1);
  if (!operator) throw new Error('Aktarım için etkin bir süper yönetici gerekli');
  const divisions = await db.select().from(s.divisions).where(and(eq(s.divisions.tenantId, tenantId), eq(s.divisions.isActive, true), isNull(s.divisions.deletedAt)));
  const divisionByCode = new Map(divisions.map((row) => [normal(row.code), row]));
  for (const code of [...new Set(snapshot.products.map(divisionOf))]) if (!divisionByCode.has(code)) throw new Error(`${code} bölümü bulunamadı`);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${tenantId}:haksanmakina-catalog-import`}, 0))`);
    const beforeCatalog = await beginCatalogJournal(tx as unknown as DbClient);
    // Existing fiber models use a legacy product-group/category branch. Reuse
    // that branch so imported source series appear alongside those models.
    const [modelFiberHierarchy] = fiberOnly ? await tx.select({
      groupId: s.productModels.productGroupId,
      categoryId: s.productModels.categoryId,
      subcategoryId: s.productModels.subcategoryId,
    }).from(s.productModels)
      .innerJoin(s.productTypes, eq(s.productTypes.id, s.productModels.productTypeId))
      .where(and(eq(s.productModels.tenantId, tenantId), eq(s.productTypes.code, 'fiber_lazer_kesim'),
        eq(s.productTypes.divisionId, divisionByCode.get('SAC_ISLEME')!.id), isNull(s.productModels.deletedAt)))
      .limit(1) : [];
    // A fresh production tenant can have no fiber models yet. Reuse the
    // existing type or subcategory chain; create a new chain only if absent.
    const [typeFiberHierarchy] = fiberOnly && !modelFiberHierarchy?.subcategoryId ? await tx.select({
      groupId: s.productCategories.productGroupId,
      categoryId: s.productSubcategories.categoryId,
      subcategoryId: s.productTypes.subcategoryId,
    }).from(s.productTypes)
      .innerJoin(s.productSubcategories, eq(s.productSubcategories.id, s.productTypes.subcategoryId))
      .innerJoin(s.productCategories, eq(s.productCategories.id, s.productSubcategories.categoryId))
      .where(and(eq(s.productTypes.code, 'fiber_lazer_kesim'),
        eq(s.productTypes.divisionId, divisionByCode.get('SAC_ISLEME')!.id), eq(s.productTypes.isActive, true)))
      .limit(1) : [];
    // Reuse an established laser category branch, preserving its UUID/code.
    const [subcategoryFiberHierarchy] = fiberOnly ? await tx.select({
      groupId: s.productCategories.productGroupId,
      categoryId: s.productSubcategories.categoryId,
      subcategoryId: s.productSubcategories.id,
    }).from(s.productSubcategories)
      .innerJoin(s.productCategories, eq(s.productCategories.id, s.productSubcategories.categoryId))
      .where(and(sql`upper(${s.productSubcategories.code}) = 'SAC_LAZER_KESIM'`,
        eq(s.productSubcategories.divisionId, divisionByCode.get('SAC_ISLEME')!.id),
        eq(s.productSubcategories.isActive, true)))
      .limit(1) : [];
    const fiberHierarchy = [modelFiberHierarchy, typeFiberHierarchy, subcategoryFiberHierarchy].find(
      (row) => row?.categoryId && row.subcategoryId,
    );
    // The consolidation preserves legacy category codes/UUIDs. Re-import into
    // that established branch instead of creating a competing TEZGAH parent.
    const machineCategories = await tx.select({
      categoryId: s.productCategories.id, categoryCode: s.productCategories.code,
      divisionId: s.productCategories.divisionId, groupId: s.productCategories.productGroupId,
      groupCode: s.productGroups.code, isActive: s.productCategories.isActive,
    }).from(s.productCategories).leftJoin(s.productGroups, eq(s.productCategories.productGroupId, s.productGroups.id));
    const establishedBranches = new Map<string, { categoryId: string; groupId: string | null }>();
    for (const group of ['CNC', 'UNIVERSAL', 'SAC_ISLEME'] as const) {
      const divisionId = divisionByCode.get(group)?.id;
      if (!divisionId) continue;
      const candidates = machineCategories.filter(row => row.isActive && isMainMachineCategory(row.categoryCode)
        && (!row.divisionId || row.divisionId === divisionId) && (!row.groupCode || normal(row.groupCode) === group));
      const scoped = candidates.filter(row => row.divisionId === divisionId);
      const preferred = scoped.length ? scoped : candidates;
      if (preferred.length > 1) throw new Error(`${group} için birden fazla ana makine kategorisi var; aktarım durduruldu`);
      if (preferred[0]) establishedBranches.set(group, preferred[0]);
    }
    const hierarchyMoves: Array<Record<string, unknown>> = [];
    const lookupByKey = new Map<string, { id: string }>();
    const ensureGroup = async (code: string, name: string, divisionId: string) => {
      const key = `group:${divisionId}:${code}`;
      if (lookupByKey.has(key)) return lookupByKey.get(key)!.id;
      let [row] = await tx.select().from(s.productGroups).where(and(eq(s.productGroups.code, code), eq(s.productGroups.divisionId, divisionId)));
      if (!row) [row] = await tx.insert(s.productGroups).values({ code, name, divisionId }).returning();
      if (!row.isActive) throw new Error(`Pasif ürün grubu: ${code}`);
      lookupByKey.set(key, row);
      return row.id;
    };
    const ensureCategory = async (code: string, name: string, divisionId: string, groupId: string) => {
      const key = `category:${divisionId}:${code}:${groupId}`;
      if (lookupByKey.has(key)) return lookupByKey.get(key)!.id;
      let [row] = await tx.select().from(s.productCategories).where(and(eq(s.productCategories.code, code), eq(s.productCategories.divisionId, divisionId)));
      if (!row) [row] = await tx.insert(s.productCategories).values({ code, name, divisionId, productGroupId: groupId }).returning();
      else if (row.productGroupId && row.productGroupId !== groupId) throw new Error(`${code} kategorisi başka gruba bağlı`);
      if (!row.isActive) throw new Error(`Pasif ürün kategorisi: ${code}`);
      lookupByKey.set(key, row);
      return row.id;
    };
    // Accessories and spares go under the division's existing "Aksesuar" / "Yedek Parça" category
    // (or the shared one) as subcategories, never under an import-made copy.
    const ensureStandardCategory = async (code: 'AKSESUAR' | 'YEDEK_PARCA', divisionId: string) => {
      const key = `standard:${divisionId}:${code}`;
      if (lookupByKey.has(key)) return lookupByKey.get(key)!.id;
      const rows = await tx.select().from(s.productCategories).where(and(sql`upper(${s.productCategories.code}) = ${code}`,
        eq(s.productCategories.isActive, true), or(eq(s.productCategories.divisionId, divisionId), isNull(s.productCategories.divisionId))));
      const row = rows.find(r => r.divisionId === divisionId) ?? rows.find(r => !r.divisionId)
        ?? (await tx.insert(s.productCategories).values({ code, name: code === 'AKSESUAR' ? 'Aksesuar' : 'Yedek Parça', divisionId }).returning())[0]!;
      lookupByKey.set(key, row);
      return row.id;
    };
    const ensureSubcategory = async (code: string, name: string, divisionId: string, categoryId: string) => {
      const key = `subcategory:${divisionId}:${code}`;
      if (lookupByKey.has(key)) return lookupByKey.get(key)!.id;
      let [row] = await tx.select().from(s.productSubcategories).where(and(sql`upper(${s.productSubcategories.code}) = ${code.toUpperCase()}`, eq(s.productSubcategories.divisionId, divisionId), eq(s.productSubcategories.isActive, true)));
      if (!row) [row] = await tx.insert(s.productSubcategories).values({ code, name, divisionId, categoryId }).returning();
      else if (row.categoryId && row.categoryId !== categoryId) {
        if (!code.startsWith('HM_')) throw new Error(`${code} alt kategorisi başka kategoriye bağlı`);
        hierarchyMoves.push({ kind: 'subcategory', id: row.id, before: row.categoryId, after: categoryId });
        [row] = await tx.update(s.productSubcategories).set({ categoryId }).where(eq(s.productSubcategories.id, row.id)).returning();
      }
      if (!row.isActive) throw new Error(`Pasif ürün alt kategorisi: ${code}`);
      lookupByKey.set(key, row);
      return row.id;
    };
    const ensureType = async (code: string, name: string, divisionId: string, subcategoryId: string) => {
      const key = `type:${divisionId}:${code}`;
      if (lookupByKey.has(key)) return lookupByKey.get(key)!.id;
      let [row] = await tx.select().from(s.productTypes).where(and(sql`upper(${s.productTypes.code}) = ${code.toUpperCase()}`, eq(s.productTypes.divisionId, divisionId)));
      if (!row) [row] = await tx.insert(s.productTypes).values({ code, name, divisionId, subcategoryId }).returning();
      else if (row.subcategoryId && row.subcategoryId !== subcategoryId) {
        if (!code.startsWith('HM_')) throw new Error(`${code} tipi başka alt kategoriye bağlı`);
        hierarchyMoves.push({ kind: 'type', id: row.id, before: row.subcategoryId, after: subcategoryId });
        [row] = await tx.update(s.productTypes).set({ subcategoryId }).where(eq(s.productTypes.id, row.id)).returning();
      }
      if (!row.isActive) throw new Error(`Pasif ürün tipi: ${code}`);
      lookupByKey.set(key, row);
      return row.id;
    };
    const specGroupIds = new Map<string, string>();
    for (const division of divisions) {
      for (const [code, name] of Object.entries(SPEC_GROUP_NAMES)) {
        // CNC gets no new rows: it reads the shared (division-less) groups.
        const cnc = normal(division.code) === 'CNC';
        let [row] = await tx.select().from(s.productSpecGroups).where(and(eq(s.productSpecGroups.code, code),
          cnc ? isNull(s.productSpecGroups.divisionId) : eq(s.productSpecGroups.divisionId, division.id)));
        if (!row && !cnc) [row] = await tx.insert(s.productSpecGroups).values({ code, name, divisionId: division.id }).returning();
        if (row) specGroupIds.set(`${division.id}:${code}`, row.id);
      }
    }
    const refreshedTypes = new Map<string, { divisionId: string; type: string }>();
    const existing = await tx.select({ id: s.productModels.id, modelCode: s.productModels.modelCode, stockCode: s.productModels.stockCode,
      description: s.productModels.description, productGroupId: s.productModels.productGroupId, categoryId: s.productModels.categoryId, subcategoryId: s.productModels.subcategoryId, productTypeId: s.productModels.productTypeId, deletedAt: s.productModels.deletedAt }).from(s.productModels).where(eq(s.productModels.tenantId, tenantId));
    const existingByCode = new Map(existing.map((row) => [row.modelCode, row]));
    const brandIds = new Map<string, string>();
    const templateKeys = new Set((await tx.select({ type: s.productSpecTemplates.productTypeCode, key: s.productSpecTemplates.specKey, divisionId: s.productSpecTemplates.divisionId }).from(s.productSpecTemplates))
      .map((row) => `${row.divisionId}:${row.type}:${row.key.toLocaleLowerCase('tr-TR')}`));
    let created = 0; let skipped = 0; const moved: Array<Record<string, unknown>> = []; let templates = 0; let specValues = 0;
    const existingProducts = await loadExistingProducts(tx as unknown as DbClient, tenantId);
    const decisions = matchDecisions ?? await readMatchDecisions();
    const plans = new Map(snapshot.products.map(product => [product.sourceId,
      resolveMatch(matchSourceCard(product, existingProducts), divisionOf(product), decisions[product.sourceId], existingProducts)]));
    const blocked = [...plans].filter(([, plan]) => plan.action === 'blocked');
    if (blocked.length) throw new Error(`${blocked.length} ürün belirsiz eşleşti; önce raporu çözün (match-decisions.json): ${blocked.slice(0, 5).map(([id, plan]) => `${id} ${(plan as { reason: string }).reason}`).join('; ')}`);
    const matched: Array<{ sourceId: string; modelCode: string }> = []; const protectedSkips: string[] = [];
    // Existing CNC types keep their current hierarchy and templates untouched.
    // Lookup rows can hang off another tenant's CNC division (shared lookups); prefer this tenant's.
    const ownCnc = divisionByCode.get('CNC')?.id;
    const cncTypeRows = await tx.select({ code: s.productTypes.code, typeId: s.productTypes.id, subId: s.productTypes.subcategoryId,
      divisionId: s.productTypes.divisionId, categoryId: s.productSubcategories.categoryId, groupId: s.productCategories.productGroupId }).from(s.productTypes)
      .innerJoin(s.divisions, eq(s.divisions.id, s.productTypes.divisionId))
      .leftJoin(s.productSubcategories, eq(s.productSubcategories.id, s.productTypes.subcategoryId))
      .leftJoin(s.productCategories, eq(s.productCategories.id, s.productSubcategories.categoryId))
      .where(and(sql`upper(${s.divisions.code}) = 'CNC'`, eq(s.productTypes.isActive, true)));
    const existingCncTypes = new Map<string, (typeof cncTypeRows)[number]>();
    for (const row of [...cncTypeRows].sort((a, b) => Number(b.divisionId === ownCnc) - Number(a.divisionId === ownCnc))) {
      if (!existingCncTypes.has(row.code.toUpperCase())) existingCncTypes.set(row.code.toUpperCase(), row);
    }
    for (const product of snapshot.products) {
      const plan = plans.get(product.sourceId)!;
      if (plan.action === 'skip') { protectedSkips.push(product.sourceId); skipped++; continue; }
      if (plan.action === 'link' && !plan.existing.modelCode.startsWith('HM-')) {
        const [owned] = await tx.select().from(s.productModels).where(eq(s.productModels.id, plan.existing.id));
        if (!owned.catalogSources.some(row => row.sourceId === product.sourceId)) await tx.update(s.productModels).set({ catalogSources: [...owned.catalogSources, { sourceId: product.sourceId, url: product.sourceUrl, capturedOn: snapshot.capturedOn, group: product.group, typeCode: typeCode(product) }], updatedAt: sql`${s.productModels.updatedAt}` }).where(eq(s.productModels.id, owned.id));
        matched.push({ sourceId: product.sourceId, modelCode: plan.existing.modelCode }); skipped++; continue; }
      const definition = groups[product.group];
      const division = divisionByCode.get(divisionOf(product))!;
      const branch = establishedBranches.get(product.group);
      const type = typeCode(product);
      const cncChain = product.group === 'CNC' ? existingCncTypes.get(type.toUpperCase()) : undefined;
      if (product.group === 'CNC' && !cncChain) throw new Error(`${type} CNC tipi bulunamadı; CNC'de yeni makine tipi açılmaz`);
      if (cncChain && (!cncChain.subId || !cncChain.categoryId)) throw new Error(`${type} CNC tipinin hiyerarşisi eksik; CNC'ye dokunulmadı`);
      // CNC machines reuse the existing chain; nothing is ensured (created) on the CNC side for them.
      const groupId = cncChain ? (cncChain.groupId ?? branch?.groupId ?? null) : fiberHierarchy?.groupId ?? branch?.groupId ?? await ensureGroup(machineGroupCode(product.group) ? product.group : definition.division, machineGroupCode(product.group) ? definition.name : groups[definition.division].name, division.id);
      const categoryCode = machineGroupCode(product.group)
        ? definition.category : `HM_${product.group}_${definition.category}`;
      const standardCategory = definition.category === 'AKSESUAR' || definition.category === 'YEDEK_PARCA' ? definition.category : null;
      const categoryId = cncChain ? cncChain.categoryId! : fiberHierarchy?.categoryId ?? branch?.categoryId
        ?? (standardCategory ? await ensureStandardCategory(standardCategory, division.id) : undefined) ?? await ensureCategory(categoryCode, definition.category === 'TEZGAH' ? machineCategoryLabel(product.group) : definition.category === 'AKSESUAR' ? 'Aksesuar' : definition.category === 'YEDEK_PARCA' ? 'Yedek Parça' : definition.name, division.id, groupId!);
      const family = machineFamilyForType(product.group, type);
      const subId = cncChain?.subId ?? await ensureSubcategory(subcategoryCode(product), family?.label ?? product.sourceCategory, division.id, categoryId);
      const typeId = cncChain?.typeId ?? await ensureType(type, product.sourceCategory, division.id, subId);
      const placement = cncChain ? { groupId: cncChain.groupId ?? groupId, categoryId: cncChain.categoryId!, subId } : { groupId, categoryId, subId };
      const templateFields = cncChain ? [] : templateFieldsFor(type);
      // Only HM_ types are created by this import; pre-existing types (ABKANT_PRES…) only gain missing fields.
      if (templateFields.length && specTemplateFor(type) && type.startsWith('HM_')) refreshedTypes.set(`${division.id}:${type}`, { divisionId: division.id, type });
      for (const [index, { key, unit, group }] of templateFields.entries()) {
        const templateKey = `${division.id}:${type}:${key.toLocaleLowerCase('tr-TR')}`;
        if (!templateKeys.has(templateKey)) {
          await tx.insert(s.productSpecTemplates).values({ productTypeCode: type, divisionId: division.id, specKey: key,
            specGroupCode: group, specUnit: unit || null, defaultValue: null, sortOrder: index });
          templateKeys.add(templateKey); templates++;
        }
      }
      const code = productCode(product);
      const known = existingByCode.get(code);
      if (known) {
        if (known.stockCode !== code || !known.description?.includes(source) || known.deletedAt) throw new Error(`${code} kodu başka bir ürüne ait veya silinmiş`);
        const currentDivision = existingProducts.find(row => row.id === known.id)?.division;
        const protectedCard = product.group === 'CNC' || (currentDivision === 'CNC' && divisionOf(product) !== 'CNC');
        if (!protectedCard && (known.productGroupId !== groupId || known.categoryId !== categoryId || known.subcategoryId !== subId || known.productTypeId !== typeId)) {
          moved.push({ id: known.id, modelCode: code, before: { productGroupId: known.productGroupId, categoryId: known.categoryId, subcategoryId: known.subcategoryId, productTypeId: known.productTypeId }, after: { productGroupId: groupId, categoryId, subcategoryId: subId, productTypeId: typeId } });
          await tx.update(s.productModels).set({ productGroupId: groupId, categoryId, subcategoryId: subId, productTypeId: typeId }).where(eq(s.productModels.id, known.id));
        }
        skipped++;
        continue;
      }
      const brandKey = product.brand.toLocaleLowerCase('tr-TR');
      let brandId = brandIds.get(brandKey);
      if (!brandId) {
        let [brand] = await tx.select().from(s.brands).where(and(eq(s.brands.tenantId, tenantId), sql`lower(${s.brands.name}) = lower(${product.brand})`, isNull(s.brands.deletedAt)));
        const shared = (brandDivisions.get(brandKey)?.size ?? 0) > 1;
        if (!brand) [brand] = await tx.insert(s.brands).values({ tenantId, name: product.brand, divisionId: shared ? null : division.id }).returning();
        brandId = brand.id;
        brandIds.set(brandKey, brandId);
      }
      const fullName = [product.brand, product.model, product.title].filter(Boolean).join(' ').slice(0, 512);
      const description = `${product.summary}\nKaynak: ${product.sourceUrl}${product.technicalText ? `\nTeknik bilgi: ${product.technicalText}` : ''}`.slice(0, 4000);
      const [inserted] = await tx.insert(s.productModels).values({ tenantId, brandId, productGroupId: placement.groupId, categoryId: placement.categoryId,
        subcategoryId: placement.subId, productTypeId: typeId, modelCode: code, modelName: (product.model || product.title).slice(0, 255),
        catalogSources: [{ sourceId: product.sourceId, url: product.sourceUrl, capturedOn: snapshot.capturedOn, group: product.group, typeCode: type }], fullName, stockCode: code, imageUrl: product.imageUrl || null, description, isActive: true }).returning({ id: s.productModels.id });
      const specs = canonicalSpecs(type, product.specs).filter(spec => !spec.layout);
      if (specs.length) await tx.insert(s.productSpecs).values(specs.map((spec, sortOrder) => ({ tenantId, productModelId: inserted.id,
        specGroupId: specGroupIds.get(`${division.id}:${spec.group}`) ?? specGroupIds.get(`${division.id}:GENEL`), specKey: spec.key, specValue: spec.value,
        specUnit: spec.unit || null, sortOrder })));
      created++; specValues += specs.length;
    }
    const tombstoned: string[] = []; const specRewrites: Array<Record<string, unknown>> = []; const retiredTypes: string[] = []; const retiredTaxonomy: string[] = [];
    if (refreshTemplates) {
      // Settings only: retire scraped field names the canonical template replaced (tombstone, reversible).
      for (const { divisionId, type } of refreshedTypes.values()) {
        const fields = templateFieldsFor(type);
        const keep = new Map(fields.map((field, sortOrder) => [field.key.toLocaleLowerCase('tr-TR'), { ...field, sortOrder }]));
        const all = await tx.select().from(s.productSpecTemplates)
          .where(and(eq(s.productSpecTemplates.divisionId, divisionId), eq(s.productSpecTemplates.productTypeCode, type)));
        // Rows an admin added (keys never seen on the source pages) are left alone.
        const scraped = new Set(snapshot.products.filter(product => typeCode(product) === type)
          .flatMap(product => [...product.specs.map(spec => spec.key), ...product.fieldHints.map(hint => hint.key)])
          .concat((familyFields[type] ?? []).map(([key]) => key)).map(key => key.toLocaleLowerCase('tr-TR')));
        const rows = all.filter(row => !row.isDeleted && (scraped.has(row.specKey.toLocaleLowerCase('tr-TR')) || keep.has(row.specKey.toLocaleLowerCase('tr-TR'))));
        // A scraped row that differs only by case ("MAKS. İŞ PARÇASI AĞIRLIĞI") takes the canonical spelling, group, unit and order.
        for (const row of rows) {
          const field = keep.get(row.specKey.toLocaleLowerCase('tr-TR'));
          if (!field) continue;
          const next = { specKey: field.key, specGroupCode: field.group, specUnit: field.unit || null, sortOrder: field.sortOrder };
          if (row.specKey === next.specKey && row.specGroupCode === next.specGroupCode && row.specUnit === next.specUnit && row.sortOrder === next.sortOrder) continue;
          if (row.specKey !== next.specKey && all.some(other => other.id !== row.id && other.specKey === next.specKey)) continue; // unique (division,type,key)
          await tx.update(s.productSpecTemplates).set(next).where(eq(s.productSpecTemplates.id, row.id));
          specRewrites.push({ templateId: row.id, before: { specKey: row.specKey, specGroupCode: row.specGroupCode, specUnit: row.specUnit, sortOrder: row.sortOrder } });
        }
        const drop = rows.filter(row => !keep.has(row.specKey.toLocaleLowerCase('tr-TR')) || (row.specKey !== keep.get(row.specKey.toLocaleLowerCase('tr-TR'))!.key
          && all.some(other => other.id !== row.id && !other.isDeleted && other.specKey === keep.get(row.specKey.toLocaleLowerCase('tr-TR'))!.key))).map(row => row.id);
        if (drop.length) await tx.update(s.productSpecTemplates).set({ isDeleted: true }).where(inArray(s.productSpecTemplates.id, drop));
        tombstoned.push(...drop);
      }
      // Types left empty after accessories moved division (e.g. Mengeneler: Sac İşleme → Üniversal) are retired, never deleted.
      const placed = new Set(snapshot.products.map(product => `${divisionByCode.get(divisionOf(product))!.id}:${typeCode(product).toUpperCase()}`));
      const sourceTypes = new Set(snapshot.products.map(product => typeCode(product).toUpperCase()));
      const stale = (await tx.select({ id: s.productTypes.id, code: s.productTypes.code, divisionId: s.productTypes.divisionId }).from(s.productTypes)
        .where(and(sql`${s.productTypes.code} LIKE 'HM\_%'`, eq(s.productTypes.isActive, true),
          sql`NOT EXISTS (SELECT 1 FROM product_models m WHERE m.product_type_id = ${s.productTypes.id} AND m.deleted_at IS NULL)`)))
        .filter(row => row.divisionId && divisions.some(d => d.id === row.divisionId && normal(d.code) !== 'CNC')
          && sourceTypes.has(row.code.toUpperCase()) && !placed.has(`${row.divisionId}:${row.code.toUpperCase()}`));
      for (const row of stale) {
        await tx.update(s.productTypes).set({ isActive: false }).where(eq(s.productTypes.id, row.id));
        const drop = await tx.update(s.productSpecTemplates).set({ isDeleted: true }).where(and(eq(s.productSpecTemplates.divisionId, row.divisionId!),
          eq(s.productSpecTemplates.productTypeCode, row.code), eq(s.productSpecTemplates.isDeleted, false))).returning({ id: s.productSpecTemplates.id });
        tombstoned.push(...drop.map(r => r.id));
      }
      retiredTypes.push(...stale.map(row => row.id));
      // Imported values are renamed only while they still equal what was scraped; edited rows are left alone.
      for (const product of snapshot.products) {
        const known = existingByCode.get(productCode(product));
        if (!known || divisionOf(product) === 'CNC' || !specTemplateFor(typeCode(product))) continue;
        const divisionId = divisionByCode.get(divisionOf(product))!.id;
        const rows = await tx.select().from(s.productSpecs).where(and(eq(s.productSpecs.productModelId, known.id), isNull(s.productSpecs.deletedAt)));
        const mapped = canonicalSpecs(typeCode(product), product.specs);
        const consumed = new Set<string>();
        for (const [index, raw] of product.specs.entries()) {
          const row = rows.find(r => !consumed.has(r.id) && r.specKey === raw.key && r.specValue === raw.value);
          if (row) consumed.add(row.id);
          const next = mapped[index]!;
          if (!row || (!next.layout && !next.canonical)) continue;
          const groupId = specGroupIds.get(`${divisionId}:${next.group}`) ?? row.specGroupId;
          if (!next.layout && row.specKey === next.key && row.specValue === next.value && (row.specUnit ?? '') === next.unit && row.specGroupId === groupId) continue;
          specRewrites.push({ id: row.id, before: { specKey: row.specKey, specValue: row.specValue, specUnit: row.specUnit, specGroupId: row.specGroupId }, layout: next.layout });
          if (next.layout) await tx.update(s.productSpecs).set({ deletedAt: new Date() }).where(eq(s.productSpecs.id, row.id));
          else await tx.update(s.productSpecs).set({ specKey: next.key, specValue: next.value, specUnit: next.unit || null,
            specGroupId: groupId }).where(eq(s.productSpecs.id, row.id));
        }
      }
    }
    {
      // Import-made (HM_) subcategories/categories left empty by the moves above are deactivated, never deleted.
      const tenantDivisions = divisions.map(division => division.id);
      const subs = await tx.update(s.productSubcategories).set({ isActive: false }).where(and(sql`${s.productSubcategories.code} LIKE 'HM\_%'`,
        eq(s.productSubcategories.isActive, true), inArray(s.productSubcategories.divisionId, tenantDivisions),
        sql`NOT EXISTS (SELECT 1 FROM product_types t WHERE t.subcategory_id = ${s.productSubcategories.id} AND t.is_active)`,
        sql`NOT EXISTS (SELECT 1 FROM product_models m WHERE m.subcategory_id = ${s.productSubcategories.id} AND m.deleted_at IS NULL)`))
        .returning({ id: s.productSubcategories.id });
      const cats = await tx.update(s.productCategories).set({ isActive: false }).where(and(sql`${s.productCategories.code} LIKE 'HM\_%'`,
        eq(s.productCategories.isActive, true), inArray(s.productCategories.divisionId, tenantDivisions),
        sql`NOT EXISTS (SELECT 1 FROM product_subcategories x WHERE x.category_id = ${s.productCategories.id} AND x.is_active)`,
        sql`NOT EXISTS (SELECT 1 FROM product_models m WHERE m.category_id = ${s.productCategories.id} AND m.deleted_at IS NULL)`))
        .returning({ id: s.productCategories.id });
      retiredTaxonomy.push(...subs.map(row => row.id), ...cats.map(row => row.id));
    }
    await finishCatalogJournal(tx as unknown as DbClient, tenantId, beforeCatalog);
    const { AuditService } = await import('../shared/database/audit.service.js');
    const audit = new AuditService(tx as unknown as DbClient);
    await audit.write({ tenantId, actorUserId: userId, action: 'catalog.haksanmakina_imported', resourceType: 'tenant', resourceId: tenantId,
      newValues: { capturedOn: snapshot.capturedOn, created, skipped, templates, specValues, byGroup, moved, hierarchyMoves, matched, protectedSkips, excluded: snapshot.excluded, deferredLasers: snapshot.deferredLasers.length, tombstoned, specRewrites, retiredTypes, retiredTaxonomy } });
    return { mode: 'applied', capturedOn: snapshot.capturedOn, created, skipped, templates, specValues, byGroup, moved, hierarchyMoves, matched, protectedSkips, excluded: snapshot.excluded.length, deferredLasers: snapshot.deferredLasers.length, tombstonedTemplates: tombstoned.length, rewrittenSpecs: specRewrites.length, retiredTypes: retiredTypes.length, retiredTaxonomy: retiredTaxonomy.length };
  });
}

async function resolveTenantOperator(db: DbClient, tenantSlug: string) {
  const tenants = await db.select({ id: s.tenants.id }).from(s.tenants)
    .where(and(eq(s.tenants.slug, tenantSlug), eq(s.tenants.isActive, true), isNull(s.tenants.deletedAt))).limit(1);
  if (tenants.length !== 1) throw new Error('Otomatik aktarım için etkin tenant bulunamadı');
  const operators = await db.select({ id: s.users.id }).from(s.users)
    .innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id))
    .innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId))
    .where(and(eq(s.users.tenantId, tenants[0].id), eq(s.users.status, 'active'),
      isNull(s.users.deletedAt), eq(s.roles.code, 'super_admin')))
    .orderBy(asc(s.users.createdAt), asc(s.users.id)).limit(1);
  if (operators.length !== 1) throw new Error('Otomatik aktarım için etkin süper yönetici gerekli');
  return { tenantId: tenants[0].id, userId: operators[0].id };
}

if (require.main === module) {
  const tenantId = process.argv.find((arg) => arg.startsWith('--tenant='))?.slice(9);
  const userId = process.argv.find((arg) => arg.startsWith('--user='))?.slice(7);
  const apply = process.argv.includes('--apply');
  const fiberOnly = process.argv.includes('--fiber-laser-only');
  const tenantSlug = process.argv.find((arg) => arg.startsWith('--tenant-slug='))?.slice(14);
  if (apply && (tenantSlug ? Boolean(tenantId || userId) : !tenantId || !userId)) {
    throw new Error('Kullanım: --apply (--tenant-slug=<slug> | --tenant=<uuid> --user=<uuid>)');
  }
  const run = apply
    ? (async () => {
      const db = getDb();
      const operator = tenantSlug ? await resolveTenantOperator(db, tenantSlug) : { tenantId: tenantId!, userId: userId! };
      return importHaksanmakinaCatalog(db, operator.tenantId, operator.userId, true, fiberOnly, process.argv.includes('--refresh-templates'));
    })()
    : previewHaksanmakinaCatalog(fiberOnly);
  run
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Katalog aktarımı başarısız'); process.exitCode = 1; })
    .finally(() => apply ? closeDb() : undefined);
}
