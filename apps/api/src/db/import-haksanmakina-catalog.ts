/** Operator-run import of the public Haksan Makina product snapshots. */
import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { closeDb, getDb, type DbClient } from './client';
import * as s from './schema';
import { AuditService } from '../shared/database/audit.service';

const source = 'https://www.haksanmakina.com.tr/';
const groups = {
  UNIVERSAL: { name: 'Talaşlı İmalat Makinaları', division: 'UNIVERSAL', category: 'TEZGAH' },
  SAC_ISLEME: { name: 'Sac İşleme Makinaları', division: 'SAC_ISLEME', category: 'TEZGAH' },
  KAYNAK: { name: 'Kaynak Teknolojileri', division: 'SAC_ISLEME', category: 'TEZGAH' },
  HAVA: { name: 'Hava Üretim Teknolojileri', division: 'SAC_ISLEME', category: 'TEZGAH' },
  TASIMA: { name: 'Taşıma ve Kaldırma Ekipmanları', division: 'SAC_ISLEME', category: 'TEZGAH' },
  AYDINLATMA: { name: 'Endüstriyel Aydınlatma', division: 'SAC_ISLEME', category: 'AKSESUAR' },
  HIRDAVAT: { name: 'Hırdavat ve Makina Ekipmanları', division: 'SAC_ISLEME', category: 'AKSESUAR' },
  YEDEK_PARCA: { name: 'Makina Yedek Parçaları', division: 'SAC_ISLEME', category: 'YEDEK_PARCA' },
} as const;

const productSchema = z.object({
  sourceId: z.string().regex(/^\d+$/),
  sourceUrl: z.string().url().startsWith(source),
  group: z.enum(['UNIVERSAL', 'SAC_ISLEME', 'KAYNAK', 'HAVA', 'TASIMA', 'AYDINLATMA', 'HIRDAVAT', 'YEDEK_PARCA']),
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

const normal = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'I').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const productCode = (product: Product) => `HM-${product.sourceId}`;
const typeCode = (product: Product) => {
  if (product.group === 'SAC_ISLEME') {
    if (/fiber/i.test(product.title) && /boru kesim/i.test(product.sourceCategory)) return 'fiber_lazer_boru_kesim';
    if (/fiber/i.test(product.title)) return 'fiber_lazer_kesim';
    if (/abkant/i.test(product.sourceCategory)) return 'ABKANT_PRES';
    if (/giyotin/i.test(product.sourceCategory)) return 'GIYOTIN_MAKAS';
    if (/silindir kıvırma/i.test(product.sourceCategory)) return 'SILINDIR_MAKINESI';
  }
  return `HM_${product.group}_${normal(product.sourceCategory)}`.slice(0, 64);
};
const subcategoryCode = (product: Product) => {
  const type = typeCode(product);
  if (type === 'fiber_lazer_kesim' || type === 'fiber_lazer_boru_kesim') return 'sac_kesme';
  if (type === 'ABKANT_PRES' || type === 'SILINDIR_MAKINESI') return 'SAC_BUKME';
  if (type === 'GIYOTIN_MAKAS') return 'SAC_KESME';
  return `HM_${product.group}_${normal(product.sourceCategory)}`.slice(0, 64);
};
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
const snapshotPath = path.join(__dirname, 'seed', 'data', 'haksanmakina', 'products.json');
const fiberSnapshotPath = path.join(__dirname, 'seed', 'data', 'haksanmakina', 'fiber-laser-products.json');

async function readSnapshot(fiberOnly = false) {
  const snapshot = snapshotSchema.parse(JSON.parse(await readFile(fiberOnly ? fiberSnapshotPath : snapshotPath, 'utf8')));
  if (snapshot.errors.length) throw new Error(`Kaynak taramasında ${snapshot.errors.length} hata var; eksik katalog aktarılmadı`);
  const ids = new Set<string>();
  for (const product of snapshot.products) {
    if (ids.has(product.sourceId)) throw new Error(`Yinelenen kaynak kimliği: ${product.sourceId}`);
    ids.add(product.sourceId);
    if (fiberOnly) {
      if (product.group !== 'SAC_ISLEME' || !/fiber/i.test(product.title)) throw new Error(`Fiber lazer kesim dışında ürün: ${product.sourceUrl}`);
    } else if (/\bCNC\b/i.test(`${product.title} ${product.model} ${product.sourceCategory}`)) throw new Error(`CNC ürün aktarım dışında: ${product.sourceUrl}`);
  }
  return snapshot;
}

export async function importHaksanmakinaCatalog(db: DbClient, tenantId: string, userId: string, apply = false, fiberOnly = false) {
  const snapshot = await readSnapshot(fiberOnly);
  const byGroup = Object.fromEntries(Object.keys(groups).map((code) => [code, snapshot.products.filter((p) => p.group === code).length]));
  const brandDivisions = new Map<string, Set<string>>();
  for (const product of snapshot.products) {
    const key = product.brand.toLocaleLowerCase('tr-TR');
    const used = brandDivisions.get(key) ?? new Set<string>();
    used.add(groups[product.group].division);
    brandDivisions.set(key, used);
  }
  const plannedFields = new Set(snapshot.products.flatMap((product) => {
    const type = typeCode(product);
    const definition = groups[product.group];
    return [...product.specs.map((spec) => spec.key), ...product.fieldHints.map((field) => field.key),
      ...(familyFields[type] ?? []).map(([key]) => key)].map((key) => `${definition.division}:${type}:${key.toLocaleLowerCase('tr-TR')}`);
  }));
  if (!apply) return { mode: 'preview', capturedOn: snapshot.capturedOn, products: snapshot.products.length, byGroup,
    technicalValues: snapshot.products.reduce((total, product) => total + product.specs.length, 0),
    technicalFields: plannedFields.size, productTypes: new Set(snapshot.products.map(typeCode)).size };

  const [tenant] = await db.select({ id: s.tenants.id }).from(s.tenants).where(eq(s.tenants.id, tenantId));
  if (!tenant) throw new Error('Belirtilen tenant bulunamadı');
  const [operator] = await db.select({ id: s.users.id }).from(s.users)
    .innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id))
    .innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId))
    .where(and(eq(s.users.id, userId), eq(s.users.tenantId, tenantId), eq(s.users.status, 'active'), isNull(s.users.deletedAt), eq(s.roles.code, 'super_admin'))).limit(1);
  if (!operator) throw new Error('Aktarım için etkin bir süper yönetici gerekli');
  const divisions = await db.select().from(s.divisions).where(and(eq(s.divisions.tenantId, tenantId), eq(s.divisions.isActive, true), isNull(s.divisions.deletedAt)));
  const divisionByCode = new Map(divisions.map((row) => [normal(row.code), row]));
  for (const code of ['UNIVERSAL', 'SAC_ISLEME']) if (!divisionByCode.has(code)) throw new Error(`${code} bölümü bulunamadı`);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${tenantId}:haksanmakina-catalog-import`}, 0))`);
    // Existing fiber models use a legacy product-group/category branch. Reuse
    // that branch so imported source series appear alongside those models.
    const [fiberHierarchy] = fiberOnly ? await tx.select({
      groupId: s.productModels.productGroupId,
      categoryId: s.productModels.categoryId,
      subcategoryId: s.productModels.subcategoryId,
    }).from(s.productModels)
      .innerJoin(s.productTypes, eq(s.productTypes.id, s.productModels.productTypeId))
      .where(and(eq(s.productModels.tenantId, tenantId), eq(s.productTypes.code, 'fiber_lazer_kesim'), isNull(s.productModels.deletedAt)))
      .limit(1) : [];
    if (fiberOnly && (!fiberHierarchy?.groupId || !fiberHierarchy.categoryId || !fiberHierarchy.subcategoryId)) {
      throw new Error('Fiber lazer kesim için mevcut CRM ürün hiyerarşisi bulunamadı');
    }
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
    const ensureSubcategory = async (code: string, name: string, divisionId: string, categoryId: string) => {
      const key = `subcategory:${divisionId}:${code}`;
      if (lookupByKey.has(key)) return lookupByKey.get(key)!.id;
      let [row] = await tx.select().from(s.productSubcategories).where(and(eq(s.productSubcategories.code, code), eq(s.productSubcategories.divisionId, divisionId)));
      if (!row) [row] = await tx.insert(s.productSubcategories).values({ code, name, divisionId, categoryId }).returning();
      else if (row.categoryId && row.categoryId !== categoryId) throw new Error(`${code} alt kategorisi başka kategoriye bağlı`);
      if (!row.isActive) throw new Error(`Pasif ürün alt kategorisi: ${code}`);
      lookupByKey.set(key, row);
      return row.id;
    };
    const ensureType = async (code: string, name: string, divisionId: string, subcategoryId: string) => {
      const key = `type:${divisionId}:${code}`;
      if (lookupByKey.has(key)) return lookupByKey.get(key)!.id;
      let [row] = await tx.select().from(s.productTypes).where(and(eq(s.productTypes.code, code), eq(s.productTypes.divisionId, divisionId)));
      if (!row) [row] = await tx.insert(s.productTypes).values({ code, name, divisionId, subcategoryId }).returning();
      else if (row.subcategoryId && row.subcategoryId !== subcategoryId) throw new Error(`${code} tipi başka alt kategoriye bağlı`);
      if (!row.isActive) throw new Error(`Pasif ürün tipi: ${code}`);
      lookupByKey.set(key, row);
      return row.id;
    };
    const specGroupIds = new Map<string, string>();
    for (const division of [divisionByCode.get('UNIVERSAL')!, divisionByCode.get('SAC_ISLEME')!]) {
      for (const code of ['GENEL', 'BUKME', 'KESME', 'MOTORLAR', 'TABLA', 'KAPASITE']) {
        let [row] = await tx.select().from(s.productSpecGroups).where(and(eq(s.productSpecGroups.code, code), eq(s.productSpecGroups.divisionId, division.id)));
        if (!row) [row] = await tx.insert(s.productSpecGroups).values({ code, name: code, divisionId: division.id }).returning();
        specGroupIds.set(`${division.id}:${code}`, row.id);
      }
    }
    const existing = await tx.select({ id: s.productModels.id, modelCode: s.productModels.modelCode, stockCode: s.productModels.stockCode,
      description: s.productModels.description, deletedAt: s.productModels.deletedAt }).from(s.productModels).where(eq(s.productModels.tenantId, tenantId));
    const existingByCode = new Map(existing.map((row) => [row.modelCode, row]));
    const brandIds = new Map<string, string>();
    const templateKeys = new Set((await tx.select({ type: s.productSpecTemplates.productTypeCode, key: s.productSpecTemplates.specKey, divisionId: s.productSpecTemplates.divisionId }).from(s.productSpecTemplates))
      .map((row) => `${row.divisionId}:${row.type}:${row.key.toLocaleLowerCase('tr-TR')}`));
    let created = 0; let skipped = 0; let templates = 0; let specValues = 0;
    for (const product of snapshot.products) {
      const definition = groups[product.group];
      const division = divisionByCode.get(definition.division)!;
      const groupId = fiberHierarchy?.groupId ?? await ensureGroup(product.group, definition.name, division.id);
      const categoryCode = product.group === 'UNIVERSAL' || product.group === 'SAC_ISLEME'
        ? definition.category : `HM_${product.group}_${definition.category}`;
      const categoryId = fiberHierarchy?.categoryId ?? await ensureCategory(categoryCode, definition.category === 'TEZGAH' ? 'Tezgah' : definition.category === 'AKSESUAR' ? 'Aksesuar' : 'Yedek Parça', division.id, groupId);
      const subCode = subcategoryCode(product);
      const subId = fiberHierarchy?.subcategoryId ?? await ensureSubcategory(subCode, product.sourceCategory, division.id, categoryId);
      const type = typeCode(product);
      const typeId = await ensureType(type, product.sourceCategory, division.id, subId);
      const templateFields = [...product.specs.map((spec) => [spec.key, spec.unit] as [string, string]),
        ...product.fieldHints.map((field) => [field.key, field.unit] as [string, string]), ...(familyFields[type] ?? [])];
      for (const [index, [key, unit]] of templateFields.entries()) {
        const templateKey = `${division.id}:${type}:${key.toLocaleLowerCase('tr-TR')}`;
        if (!templateKeys.has(templateKey)) {
          await tx.insert(s.productSpecTemplates).values({ productTypeCode: type, divisionId: division.id, specKey: key,
            specGroupCode: specGroupCode(key), specUnit: unit || null, defaultValue: null, sortOrder: index });
          templateKeys.add(templateKey); templates++;
        }
      }
      const code = productCode(product);
      const known = existingByCode.get(code);
      if (known) {
        if (known.stockCode !== code || !known.description?.includes(source) || known.deletedAt) throw new Error(`${code} kodu başka bir ürüne ait veya silinmiş`);
        skipped++;
        continue;
      }
      const brandKey = product.brand.toLocaleLowerCase('tr-TR');
      let brandId = brandIds.get(brandKey);
      if (!brandId) {
        let [brand] = await tx.select().from(s.brands).where(and(eq(s.brands.tenantId, tenantId), sql`lower(${s.brands.name}) = lower(${product.brand})`, isNull(s.brands.deletedAt)));
        const shared = (brandDivisions.get(brandKey)?.size ?? 0) > 1;
        if (!brand) [brand] = await tx.insert(s.brands).values({ tenantId, name: product.brand, divisionId: shared ? null : division.id }).returning();
        if (brand.divisionId && (brand.divisionId !== division.id || shared)) {
          [brand] = await tx.update(s.brands).set({ divisionId: null }).where(eq(s.brands.id, brand.id)).returning();
        }
        brandId = brand.id;
        brandIds.set(brandKey, brandId);
      }
      const fullName = [product.brand, product.model, product.title].filter(Boolean).join(' ').slice(0, 512);
      const description = `${product.summary}\nKaynak: ${product.sourceUrl}${product.technicalText ? `\nTeknik bilgi: ${product.technicalText}` : ''}`.slice(0, 4000);
      const [inserted] = await tx.insert(s.productModels).values({ tenantId, brandId, productGroupId: groupId, categoryId,
        subcategoryId: subId, productTypeId: typeId, modelCode: code, modelName: (product.model || product.title).slice(0, 255),
        fullName, stockCode: code, imageUrl: product.imageUrl || null, description, isActive: true }).returning({ id: s.productModels.id });
      if (product.specs.length) await tx.insert(s.productSpecs).values(product.specs.map((spec, sortOrder) => ({ tenantId, productModelId: inserted.id,
        specGroupId: specGroupIds.get(`${division.id}:${specGroupCode(spec.key)}`) ?? specGroupIds.get(`${division.id}:GENEL`), specKey: spec.key, specValue: spec.value,
        specUnit: spec.unit || null, sortOrder })));
      created++; specValues += product.specs.length;
    }
    const audit = new AuditService(tx as unknown as DbClient);
    await audit.write({ tenantId, actorUserId: userId, action: 'catalog.haksanmakina_imported', resourceType: 'tenant', resourceId: tenantId,
      newValues: { capturedOn: snapshot.capturedOn, created, skipped, templates, specValues, byGroup } });
    return { mode: 'applied', capturedOn: snapshot.capturedOn, created, skipped, templates, specValues, byGroup };
  });
}

if (require.main === module) {
  const tenantId = process.argv.find((arg) => arg.startsWith('--tenant='))?.slice(9);
  const userId = process.argv.find((arg) => arg.startsWith('--user='))?.slice(7);
  const apply = process.argv.includes('--apply');
  const fiberOnly = process.argv.includes('--fiber-laser-only');
  if (apply && (!tenantId || !userId)) throw new Error('Kullanım: --tenant=<uuid> --user=<uuid> --apply');
  importHaksanmakinaCatalog(getDb(), tenantId ?? '', userId ?? '', apply, fiberOnly)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Katalog aktarımı başarısız'); process.exitCode = 1; })
    .finally(closeDb);
}
