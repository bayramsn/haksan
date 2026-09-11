/** Explicit operator-run, tenant-scoped catalog import. No automatic deploy-time business writes. */
import 'reflect-metadata';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  LASER_AUXILIARY_MODELS, LASER_MODELS, LASER_POWERS, LASER_SOURCE_REVISION,
  laserSelectionKey, laserTechnicalConfigurationSchema, productCreateSchema, resolveLaserProfile,
  type LaserTechnicalConfiguration,
} from '@haksan/shared';
import { closeDb, getDb, type DbClient } from './client';
import * as s from './schema';
import type { AuthContext } from '../shared/security/auth.types';
import { AuditService } from '../shared/database/audit.service';
import { nextRecordNo } from '../shared/utils/record-sequence';
import { LaserProfilesService } from '../modules/products/laser-profiles.service';
import { ProductsService } from '../modules/products/products.service';
import { catalogProductSpecs } from './hexlaser-product-specs';
import {
  canonicalLaserVariantSelection, hexlaserCuttingVariants, hexlaserLegacyVariantCode,
} from './hexlaser-product-variants';

const chunk = <T>(items: readonly T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

const cuttingProfiles = () => LASER_MODELS.flatMap((model) => (['open', 'closed'] as const).flatMap((cabinType) =>
  LASER_POWERS.map((powerKw) => laserTechnicalConfigurationSchema.parse(resolveLaserProfile({
    sourceModelCode: model.code, series: model.series, productTypeCode: model.productTypeCode, cabinType, powerKw,
  })))));

/**
 * Kabin/güç profilleri tümüyle saklanır (teklif satırındaki güç seçicisi bunları çözer) ama
 * ürün kartı model başına tektir: kart, modelin kanonik profilinden doğar.
 */
const canonicalConfigurations = (profiles: readonly LaserTechnicalConfiguration[]) => {
  const bySelection = new Map(profiles.map((configuration) => [laserSelectionKey(configuration.selection), configuration]));
  return LASER_MODELS.map((model) => {
    const configuration = bySelection.get(laserSelectionKey(canonicalLaserVariantSelection(model)));
    if (!configuration) throw new Error(`Lazer profili eksik: ${model.code}`);
    return configuration;
  });
};

/** Kaç varyant kartının teklif, fırsat veya stok kaydına bağlı olduğu — birleştirmenin etki alanı. */
async function countProductLinks(db: DbClient, productIds: readonly string[]) {
  const linked = new Set<string>();
  for (const batch of chunk(productIds, 500)) {
    const rows = await Promise.all([
      db.select({ id: s.quoteItems.productModelId }).from(s.quoteItems).where(inArray(s.quoteItems.productModelId, batch)),
      db.select({ id: s.opportunityProducts.productModelId }).from(s.opportunityProducts).where(inArray(s.opportunityProducts.productModelId, batch)),
      db.select({ id: s.inventoryItems.productModelId }).from(s.inventoryItems).where(inArray(s.inventoryItems.productModelId, batch)),
    ]);
    for (const row of rows.flat()) if (row.id) linked.add(row.id);
  }
  return linked.size;
}

export async function importHexlaserCatalog(db: DbClient, tenantId: string, userId: string, apply = false) {
  const [operator] = await db.select({ id: s.users.id }).from(s.users)
    .innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id)).innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId))
    .where(and(eq(s.users.id, userId), eq(s.users.tenantId, tenantId), eq(s.users.status, 'active'), isNull(s.users.deletedAt), eq(s.roles.code, 'super_admin'))).limit(1);
  if (!operator) throw new Error('An active super administrator in the explicit tenant is required');
  const [division] = await db.select().from(s.divisions).where(and(eq(s.divisions.tenantId, tenantId), sql`lower(${s.divisions.code}) = 'sac_isleme'`, eq(s.divisions.isActive, true), isNull(s.divisions.deletedAt)));
  if (!division) throw new Error('Sac İşleme division is missing');
  const cuttingSources = LASER_MODELS.map((model) => ({ code: model.code, series: model.series, productTypeCode: model.productTypeCode,
    sizeLabel: model.sizeLabel, sourceNotes: model.issues.map((issue) => issue.message), specs: catalogProductSpecs(model.fields, model.code) }));
  const auxiliarySources = LASER_AUXILIARY_MODELS.map((model) => ({ code: model.code, series: model.code.match(/^[A-Z]+/)?.[0] ?? '', productTypeCode: model.kind === 'welding' ? 'FIBER_LAZER_KAYNAK' : 'LAZER_TEMIZLEME', sizeLabel: `${model.powerKw} kW`, sourceNotes: model.sourceNotes ?? [], specs: model.specs }));
  const sourceModels = [...cuttingSources, ...auxiliarySources];
  const sourceProfiles = cuttingProfiles();
  const variants = hexlaserCuttingVariants(canonicalConfigurations(sourceProfiles));
  const existing = await db.select({
    id: s.productModels.id, code: s.productModels.modelCode, fullName: s.productModels.fullName,
    modelName: s.productModels.modelName, description: s.productModels.description,
    brandId: s.productModels.brandId, technicalConfiguration: s.productModels.technicalConfiguration,
    deletedAt: s.productModels.deletedAt,
  }).from(s.productModels).where(eq(s.productModels.tenantId, tenantId));
  const existingCodes = new Set(existing.filter((item) => !item.deletedAt).map((item) => item.code));
  // Eski sürüm model başına 14 kabin/güç kartı açmıştı; bunlar tek karta indirilir.
  const legacyVariants = existing.filter((item) => !item.deletedAt
    && LASER_MODELS.some((model) => hexlaserLegacyVariantCode(model.code, item.code)));
  const linkedLegacyVariants = legacyVariants.length ? await countProductLinks(db, legacyVariants.map((item) => item.id)) : 0;
  // Birleşmeden doğacak model kartı "yeni kart" değildir; mevcut varyantlardan biri hayatta kalır.
  const survivingCodes = new Set([...existingCodes,
    ...LASER_MODELS.filter((model) => legacyVariants.some((item) => hexlaserLegacyVariantCode(model.code, item.code))).map((model) => model.code)]);
  const plan = { division: division.name, brand: 'HEXLASER', supplier: 'AORE', sourceRevision: LASER_SOURCE_REVISION,
    cuttingModels: LASER_MODELS.length, auxiliaryModels: LASER_AUXILIARY_MODELS.length,
    profiles: sourceProfiles.length, cuttingVariants: variants.length,
    mergeVariantProducts: legacyVariants.length, linkedVariantProducts: linkedLegacyVariants,
    createProducts: variants.filter((variant) => !survivingCodes.has(variant.modelCode)).length
      + auxiliarySources.filter((model) => !existingCodes.has(model.code)).length,
    preserveProducts: variants.filter((variant) => survivingCodes.has(variant.modelCode)).length
      + auxiliarySources.filter((model) => existingCodes.has(model.code)).length };
  if (!apply) return { mode: 'preview', ...plan };
  return db.transaction(async (tx) => {
    const dbTx = tx as unknown as DbClient;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${tenantId}:hexlaser-catalog-import`}, 0))`);
    const audit = new AuditService(dbTx);
    const actor: AuthContext = { userId, tenantId, email: '', roles: ['super_admin'], permissions: new Set(['divisions.view_all']),
      divisionIds: [division.id], primaryDivisionId: division.id, activeDivisionId: division.id, canViewAllDivisions: true,
      departmentIds: [], primaryDepartmentId: null, activeDepartmentId: null, accessScopes: [] };
    const profileService = new LaserProfilesService(dbTx, audit);
    const products = new ProductsService(dbTx, audit, profileService);
    const [relation] = await tx.select().from(s.companyRelationTypes).where(eq(s.companyRelationTypes.code, 'supplier'));
    const [status] = await tx.select().from(s.companyStatuses).where(eq(s.companyStatuses.code, 'active'));
    if (!relation || !status) throw new Error('Supplier relation and active status must exist');
    const suppliers = await tx.select().from(s.companies).where(and(eq(s.companies.tenantId, tenantId), isNull(s.companies.deletedAt), sql`lower(trim(${s.companies.legalTitle})) in ('aore', 'aore laser')`));
    if (suppliers.length > 1) throw new Error('AORE supplier match is ambiguous');
    let supplier = suppliers[0];
    if (!supplier) {
      const externalCompanyNo = await nextRecordNo(dbTx, tenantId, 'company');
      [supplier] = await tx.insert(s.companies).values({ tenantId, externalCompanyNo, legalTitle: 'AORE', shortName: 'AORE', relationTypeId: relation.id,
        customerStatusId: status.id, supplierCategoryCode: 'manufacturer',
        notes: 'HEXLASER ürünlerinin tedarikçisi. Kullanıcının sağladığı AORE Technical Parameters.xlsx ve Haksan 2025 kataloğundan oluşturuldu; resmi vergi/unvan bilgileri kaynakta verilmemiştir.',
        sourceMetadata: { catalog: LASER_SOURCE_REVISION }, createdBy: userId, updatedBy: userId }).returning();
      await audit.write({ tenantId, actorUserId: userId, action: 'company.created', resourceType: 'company', resourceId: supplier.id, newValues: { name: 'AORE', source: LASER_SOURCE_REVISION } });
    }
    const [supplierRelation] = await tx.select().from(s.companyRelationTypes).where(eq(s.companyRelationTypes.id, supplier.relationTypeId!));
    if (!supplierRelation || !['supplier', 'supplier_customer'].includes(supplierRelation.code)) throw new Error('Existing AORE company is not a supplier; no business record was overwritten');
    await tx.insert(s.companyDivisions).values({ tenantId, companyId: supplier.id, divisionId: division.id, addedByUserId: userId }).onConflictDoNothing();
    let brand = await tx.query.brands.findFirst({ where: and(eq(s.brands.tenantId, tenantId), sql`lower(${s.brands.name}) = 'hexlaser'`, isNull(s.brands.deletedAt)) });
    if (brand) {
      if (brand.divisionId && brand.divisionId !== division.id) throw new Error('Existing HEXLASER brand belongs to another division');
      if (brand.supplierCompanyId && brand.supplierCompanyId !== supplier.id) throw new Error('Existing HEXLASER supplier differs; no supplier relationship was overwritten');
      [brand] = await tx.update(s.brands).set({ supplierCompanyId: supplier.id, technicalCatalogCode: 'AORE_LASER' }).where(eq(s.brands.id, brand.id)).returning();
    } else {
      brand = await products.createBrand({ name: 'HEXLASER', isOwned: true, divisionId: division.id, supplierCompanyId: supplier.id, technicalCatalogCode: 'AORE_LASER' }, actor);
    }
    if (!brand) throw new Error('Brand setup failed');
    const ensure = async (table: any, code: string, name: string, parent: Record<string, string> = {}) => {
      const [row] = await tx.select().from(table).where(and(eq(table.code, code), eq(table.divisionId, division.id)));
      if (row) {
        if (row.isActive === false || Object.entries(parent).some(([key, value]) => row[key] && row[key] !== value)) throw new Error(`Existing ${code} taxonomy requires review`);
        if (Object.entries(parent).some(([key]) => !row[key])) await tx.update(table).set(parent).where(eq(table.id, row.id));
        return row;
      }
      const [created] = await tx.insert(table).values({ code, name, divisionId: division.id, ...parent }).returning() as any[];
      await audit.write({ tenantId, actorUserId: userId, action: 'lookup.created', resourceType: 'catalog_lookup', resourceId: created.id, newValues: { code, name, divisionId: division.id } });
      return created;
    };
    const group = await ensure(s.productGroups, 'SAC_ISLEME', 'Sac İşleme');
    const category = await ensure(s.productCategories, 'TEZGAH', 'Tezgah', { productGroupId: group.id });
    const types = [
      ['FIBER_LAZER_KESIM', 'Sac Lazer Kesim', 'LAZER_KESIM'],
      ['BORU_LAZER_KESIM', 'Boru/Profil Lazer Kesim', 'BORU_PROFIL_LAZER_KESIM'],
      ['FIBER_LAZER_KAYNAK', 'Fiber Lazer Kaynak', 'LAZER_KAYNAK'],
      ['LAZER_TEMIZLEME', 'Lazer Temizleme', 'LAZER_TEMIZLEME'],
    ];
    const typeToSub = new Map<string, string>();
    const typeIds = new Map<string, string>();
    const typeSubcategoryIds = new Map<string, string>();
    for (const [code, name, subCode] of types) {
      // Preserve a previously established type's correct parent chain.
      const [knownType] = await tx.select().from(s.productTypes).where(and(eq(s.productTypes.code, code), eq(s.productTypes.divisionId, division.id)));
      let sub;
      if (knownType?.subcategoryId) {
        [sub] = await tx.select().from(s.productSubcategories).where(eq(s.productSubcategories.id, knownType.subcategoryId));
        if (!sub || sub.divisionId !== division.id) throw new Error(`Existing ${code} parent chain requires review`);
        if (sub.categoryId !== category.id) {
          const [oldCategory] = sub.categoryId ? await tx.select().from(s.productCategories).where(eq(s.productCategories.id, sub.categoryId)) : [];
          if (oldCategory && (oldCategory.code !== 'TEZGAH' || oldCategory.divisionId)) throw new Error(`Existing ${code} parent category requires review`);
          await tx.update(s.productSubcategories).set({ categoryId: category.id }).where(eq(s.productSubcategories.id, sub.id));
        }
      } else sub = await ensure(s.productSubcategories, subCode, name, { categoryId: category.id });
      const type = await ensure(s.productTypes, code, name, { subcategoryId: sub.id });
      typeToSub.set(code, sub.code);
      typeIds.set(code, type.id);
      typeSubcategoryIds.set(code, sub.id);
    }
    const profileResult = await profileService.importProfiles({ divisionId: division.id, brandId: brand.id }, sourceProfiles, actor);
    let createdTemplateFields = 0;
    const templateKeys = new Set<string>();
    for (const model of sourceModels) for (const spec of model.specs) {
      const key = `${model.productTypeCode}:${spec.key}`;
      if (templateKeys.has(key)) continue;
      templateKeys.add(key);
      const [known] = await tx.select({ id: s.productSpecTemplates.id }).from(s.productSpecTemplates).where(and(eq(s.productSpecTemplates.divisionId, division.id), eq(s.productSpecTemplates.productTypeCode, model.productTypeCode), eq(s.productSpecTemplates.specKey, spec.key)));
      if (!known) {
        await tx.insert(s.productSpecTemplates).values({ divisionId: division.id, productTypeCode: model.productTypeCode, specKey: spec.key, specGroupCode: spec.groupCode ?? 'GENEL', specUnit: spec.unit || null, defaultValue: null, sortOrder: createdTemplateFields });
        createdTemplateFields++;
      }
    }
    const storedProfiles = await tx.select({ id: s.laserTechnicalProfiles.id, configuration: s.laserTechnicalProfiles.configuration })
      .from(s.laserTechnicalProfiles).where(and(
        eq(s.laserTechnicalProfiles.tenantId, tenantId), eq(s.laserTechnicalProfiles.divisionId, division.id),
        eq(s.laserTechnicalProfiles.brandId, brand.id), isNull(s.laserTechnicalProfiles.deletedAt),
      ));
    const storedConfigurations = storedProfiles.map((row) => laserTechnicalConfigurationSchema.parse({ ...row.configuration, profileId: row.id }));
    const profileBySelection = new Map(storedConfigurations.map((configuration) => [laserSelectionKey(configuration.selection), configuration]));
    const cuttingVariants = hexlaserCuttingVariants(canonicalConfigurations(storedConfigurations));
    if (storedConfigurations.length !== sourceProfiles.length) throw new Error('Lazer profil seti eksik; ürün varyantları oluşturulmadı');

    const currentProducts = await tx.select().from(s.productModels).where(eq(s.productModels.tenantId, tenantId));
    const currentByCode = new Map(currentProducts.map((product) => [product.modelCode, product]));
    const pendingSpecs: Array<typeof s.productSpecs.$inferInsert> = [];
    const variantDescription = (configuration: LaserTechnicalConfiguration) =>
      `${configuration.sizeLabel}\nKabin ve rezonatör gücü teklif satırında seçilir; güce bağlı teknik bilgiler orada yeniden çözülür.\nKaynak: AORE Technical Parameters.xlsx ve Haksan 2025 kataloğu. Fiyat kaynakta belirtilmemiştir.`;

    let mergedVariantProducts = 0;
    // Kabin/güç varyant kartlarını model başına tek karta indir. Silme YOK: teklif, sipariş,
    // stok ve servis kayıtları bu kartlara bağlı olduğu için fazlalıklar soft-delete edilir,
    // geçmiş belgeler okunmaya devam eder.
    for (const model of LASER_MODELS) {
      const legacy = currentProducts.filter((product) => !product.deletedAt && hexlaserLegacyVariantCode(model.code, product.modelCode));
      if (!legacy.length) continue;
      if (legacy.some((product) => product.brandId !== brand.id)) throw new Error(`${model.code} varyant kartları başka markaya ait; içe aktarma geri alındı`);
      const canonicalKey = laserSelectionKey(canonicalLaserVariantSelection(model));
      const survivor = currentByCode.get(model.code)
        ?? legacy.find((product) => {
          const saved = laserTechnicalConfigurationSchema.safeParse(product.technicalConfiguration);
          return saved.success && laserSelectionKey(saved.data.selection) === canonicalKey;
        })
        ?? legacy[0];
      for (const product of legacy) {
        if (product.id === survivor.id) continue;
        await tx.update(s.productModels).set({ deletedAt: new Date() }).where(eq(s.productModels.id, product.id));
        currentByCode.delete(product.modelCode);
        mergedVariantProducts++;
      }
      if (survivor.modelCode !== model.code) {
        // (tenant_id, model_code) unique kısıtı silinmiş satırları da kapsıyor: kodu tutan
        // soft-delete edilmiş bir kart varsa yeniden adlandırma patlar. Yazmadan önce söyle.
        const holder = currentProducts.find((product) => product.modelCode === model.code && product.id !== survivor.id);
        if (holder) throw new Error(`${model.code} kodu silinmiş bir üründe duruyor (${holder.id}); birleştirme geri alındı`);
        currentByCode.delete(survivor.modelCode);
        await tx.update(s.productModels).set({ modelCode: model.code }).where(eq(s.productModels.id, survivor.id));
        currentByCode.set(model.code, { ...survivor, modelCode: model.code });
      }
    }

    let repairedProducts = 0;

    let createdProducts = 0; let preservedProducts = 0;
    const variantsToCreate: typeof cuttingVariants = [];
    for (const variant of cuttingVariants) {
      const known = currentByCode.get(variant.modelCode);
      if (!known) { variantsToCreate.push(variant); continue; }
      if (known.brandId !== brand.id || known.deletedAt) throw new Error(`Existing model code ${variant.modelCode} conflicts; import rolled back`);
      const saved = laserTechnicalConfigurationSchema.safeParse(known.technicalConfiguration);
      if (saved.success && laserSelectionKey(saved.data.selection) !== laserSelectionKey(variant.configuration.selection)) {
        throw new Error(`Existing ${variant.modelCode} technical selection conflicts; import rolled back`);
      }
      if (!saved.success) {
        await tx.update(s.productModels).set({ technicalConfiguration: variant.configuration }).where(eq(s.productModels.id, known.id));
        await tx.update(s.productSpecs).set({ deletedAt: new Date() }).where(and(
          eq(s.productSpecs.tenantId, tenantId), eq(s.productSpecs.productModelId, known.id), isNull(s.productSpecs.deletedAt),
        ));
        repairedProducts++;
      }
      preservedProducts++;
    }

    const [usd] = await tx.select({ id: s.currencies.id }).from(s.currencies).where(eq(s.currencies.code, 'USD')).limit(1);
    if (!usd) throw new Error('USD currency is missing');
    for (const batch of chunk(variantsToCreate, 100)) {
      const inserted = await tx.insert(s.productModels).values(batch.map((variant) => ({
        tenantId, brandId: brand.id, series: variant.model.series,
        productGroupId: group.id, categoryId: category.id,
        subcategoryId: typeSubcategoryIds.get(variant.model.productTypeCode)!, productTypeId: typeIds.get(variant.model.productTypeCode)!,
        supplierCompanyId: supplier.id, modelCode: variant.modelCode, modelName: variant.modelName,
        fullName: variant.fullName, currencyId: usd.id, vatRate: '20',
        description: variantDescription(variant.configuration), technicalConfiguration: variant.configuration,
      }))).returning({ id: s.productModels.id, modelCode: s.productModels.modelCode });
      createdProducts += inserted.length;
    }

    for (const model of auxiliarySources) {
      const typeLabel = types.find(([code]) => code === model.productTypeCode)![1];
      const fullName = `${model.code} ${typeLabel}`;
      const known = currentByCode.get(model.code);
      if (known) {
        if (known.brandId !== brand.id || known.deletedAt) throw new Error(`Existing model code ${model.code} conflicts; import rolled back`);
        if (known.fullName === `HEXLASER ${fullName}`) {
          await tx.update(s.productModels).set({ fullName }).where(eq(s.productModels.id, known.id));
          repairedProducts++;
        }
        preservedProducts++; continue;
      }
      const product = await products.create(productCreateSchema.parse({ brandId: brand.id, divisionId: division.id, series: model.series, productGroupCode: 'SAC_ISLEME', categoryCode: 'TEZGAH', subcategoryCode: typeToSub.get(model.productTypeCode), productTypeCode: model.productTypeCode,
        supplierCompanyId: supplier.id, modelCode: model.code, fullName, description: `${model.sizeLabel}\nKaynak: AORE Technical Parameters.xlsx ve Haksan 2025 kataloğu. Fiyat kaynakta belirtilmemiştir.${model.sourceNotes.length ? `\nKaynak notları: ${[...new Set(model.sourceNotes)].join(' ')}` : ''}` }), actor);
      const specMap = new Map(model.specs.map((spec) => [spec.key, spec]));
      for (const [sortOrder, spec] of [...specMap.values()].entries()) pendingSpecs.push({ tenantId, productModelId: product.id, specKey: spec.key, specValue: spec.value, specUnit: spec.unit ?? null, sortOrder });
      createdProducts++;
    }
    for (const batch of chunk(pendingSpecs, 1000)) if (batch.length) await tx.insert(s.productSpecs).values(batch);
    await audit.write({ tenantId, actorUserId: userId, action: 'catalog.hexlaser_imported', resourceType: 'brand', resourceId: brand.id, newValues: { ...plan, createdProducts, preservedProducts, mergedVariantProducts, repairedProducts, supplierId: supplier.id } });
    return { mode: 'applied', ...plan, brandId: brand.id, supplierId: supplier.id, createdProducts, preservedProducts, mergedVariantProducts, repairedProducts, createdTemplateFields, profileResult };
  });
}

if (require.main === module) {
  const tenantId = process.argv.find((arg) => arg.startsWith('--tenant='))?.slice(9);
  const userId = process.argv.find((arg) => arg.startsWith('--user='))?.slice(7);
  if (!tenantId || !userId) throw new Error('Use --tenant=<uuid> --user=<uuid> [--apply]. Default is read-only preview.');
  importHexlaserCatalog(getDb(), tenantId, userId, process.argv.includes('--apply'))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Catalog import failed'); process.exitCode = 1; })
    .finally(closeDb);
}
