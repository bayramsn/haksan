/** Explicit operator-run, tenant-scoped catalog import. No automatic deploy-time business writes. */
import 'reflect-metadata';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { LASER_AUXILIARY_MODELS, LASER_MODELS, LASER_POWERS, LASER_SOURCE_REVISION, laserTechnicalConfigurationSchema, productCreateSchema, resolveLaserProfile } from '@haksan/shared';
import { closeDb, getDb, type DbClient } from './client';
import * as s from './schema';
import type { AuthContext } from '../shared/security/auth.types';
import { AuditService } from '../shared/database/audit.service';
import { nextRecordNo } from '../shared/utils/record-sequence';
import { LaserProfilesService } from '../modules/products/laser-profiles.service';
import { ProductsService } from '../modules/products/products.service';
import { catalogProductSpecs } from './hexlaser-product-specs';

export async function importHexlaserCatalog(db: DbClient, tenantId: string, userId: string, apply = false) {
  const [operator] = await db.select({ id: s.users.id }).from(s.users)
    .innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id)).innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId))
    .where(and(eq(s.users.id, userId), eq(s.users.tenantId, tenantId), eq(s.users.status, 'active'), isNull(s.users.deletedAt), eq(s.roles.code, 'super_admin'))).limit(1);
  if (!operator) throw new Error('An active super administrator in the explicit tenant is required');
  const [division] = await db.select().from(s.divisions).where(and(eq(s.divisions.tenantId, tenantId), sql`lower(${s.divisions.code}) = 'sac_isleme'`, eq(s.divisions.isActive, true), isNull(s.divisions.deletedAt)));
  if (!division) throw new Error('Sac İşleme division is missing');
  const sourceModels = [...LASER_MODELS.map((model) => ({ code: model.code, series: model.series, productTypeCode: model.productTypeCode,
    sizeLabel: model.sizeLabel, sourceNotes: model.issues.map((issue) => issue.message), specs: catalogProductSpecs(model.fields, model.code) })),
    ...LASER_AUXILIARY_MODELS.map((model) => ({ code: model.code, series: model.code.match(/^[A-Z]+/)?.[0] ?? '', productTypeCode: model.kind === 'welding' ? 'FIBER_LAZER_KAYNAK' : 'LAZER_TEMIZLEME', sizeLabel: `${model.powerKw} kW`, sourceNotes: model.sourceNotes ?? [], specs: model.specs }))];
  const existing = await db.select({ code: s.productModels.modelCode, brandId: s.productModels.brandId, deletedAt: s.productModels.deletedAt }).from(s.productModels).where(eq(s.productModels.tenantId, tenantId));
  const plan = { division: division.name, brand: 'HEXLASER', supplier: 'AORE', sourceRevision: LASER_SOURCE_REVISION,
    cuttingModels: LASER_MODELS.length, auxiliaryModels: LASER_AUXILIARY_MODELS.length,
    profiles: LASER_MODELS.length * LASER_POWERS.length * 2,
    createProducts: sourceModels.filter((model) => !existing.some((item) => item.code === model.code)).length,
    preserveProducts: sourceModels.filter((model) => existing.some((item) => item.code === model.code)).length };
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
      await ensure(s.productTypes, code, name, { subcategoryId: sub.id });
      typeToSub.set(code, sub.code);
    }
    const profiles = LASER_MODELS.flatMap((model) => (['open', 'closed'] as const).flatMap((cabinType) => LASER_POWERS.map((powerKw) => laserTechnicalConfigurationSchema.parse(resolveLaserProfile({ sourceModelCode: model.code, series: model.series, productTypeCode: model.productTypeCode, cabinType, powerKw })))));
    const profileResult = await profileService.importProfiles({ divisionId: division.id, brandId: brand.id }, profiles, actor);
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
    let createdProducts = 0; let preservedProducts = 0; let repairedProductNames = 0;
    for (const model of sourceModels) {
      const typeLabel = types.find(([code]) => code === model.productTypeCode)![1];
      const fullName = `${model.code} ${typeLabel}`;
      const known = await tx.query.productModels.findFirst({ where: and(eq(s.productModels.tenantId, tenantId), eq(s.productModels.modelCode, model.code)) });
      if (known) {
        if (known.brandId !== brand.id || known.deletedAt) throw new Error(`Existing model code ${model.code} conflicts; import rolled back`);
        // İlk katalog aktarımı marka adını hem full_name'e hem liste sunumuna
        // ekledi. Yalnızca tam olarak o üretilmiş değer hâlâ duruyorsa düzelt;
        // kullanıcı tarafından değiştirilmiş ürün adlarına dokunma.
        if (known.fullName === `HEXLASER ${fullName}`) {
          await tx.update(s.productModels).set({ fullName }).where(eq(s.productModels.id, known.id));
          repairedProductNames++;
        }
        preservedProducts++; continue;
      }
      const product = await products.create(productCreateSchema.parse({ brandId: brand.id, divisionId: division.id, series: model.series, productGroupCode: 'SAC_ISLEME', categoryCode: 'TEZGAH', subcategoryCode: typeToSub.get(model.productTypeCode), productTypeCode: model.productTypeCode,
        supplierCompanyId: supplier.id, modelCode: model.code, fullName, description: `${model.sizeLabel}\nKaynak: AORE Technical Parameters.xlsx ve Haksan 2025 kataloğu. Güç ve kabin seçimi ürünün teknik bilgilerinden yapılır. Fiyat kaynakta belirtilmemiştir.${model.sourceNotes.length ? `\nKaynak notları: ${[...new Set(model.sourceNotes)].join(' ')}` : ''}` }), actor);
      const specMap = new Map(model.specs.map((spec) => [spec.key, spec]));
      if (specMap.size) await tx.insert(s.productSpecs).values([...specMap.values()].map((spec, sortOrder) => ({ tenantId, productModelId: product.id, specKey: spec.key, specValue: spec.value, specUnit: spec.unit ?? null, sortOrder, createdBy: userId, updatedBy: userId })));
      createdProducts++;
    }
    await audit.write({ tenantId, actorUserId: userId, action: 'catalog.hexlaser_imported', resourceType: 'brand', resourceId: brand.id, newValues: { ...plan, createdProducts, preservedProducts, repairedProductNames, supplierId: supplier.id } });
    return { mode: 'applied', ...plan, brandId: brand.id, supplierId: supplier.id, createdProducts, preservedProducts, repairedProductNames, createdTemplateFields, profileResult };
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
