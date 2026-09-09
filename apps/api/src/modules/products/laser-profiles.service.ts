import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  isSupportedLaserBrand, LASER_MODELS, LASER_POWERS, laserSelectionKey, laserSelectionSchema, laserTechnicalConfigurationSchema,
  resolveLaserProfile, type LaserSelection, type LaserSpec, type LaserTechnicalConfiguration,
} from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { brands, laserTechnicalProfiles, productModels, productSpecs } from '../../db/schema/products';
import { divisions } from '../../db/schema/tenants';
import { DB } from '../../shared/database/database.module';
import { AuditService } from '../../shared/database/audit.service';
import type { AuthContext } from '../../shared/security/auth.types';
import { assertCanUseResourceDivision } from '../../shared/utils/division-scope';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';

export interface LaserProfileScope { divisionId: string; brandId: string }
type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];

/** Only explicit values/unit edits come from the client; provenance stays server-owned. */
export function applyLaserSpecEdits(base: LaserTechnicalConfiguration, edits: LaserSpec[], options: { replaceAll?: boolean } = {}): LaserTechnicalConfiguration {
  const powerFields = base.specs.filter((spec) => spec.key === 'Lazer Gücü');
  if (powerFields.length !== 1 || powerFields[0].value !== String(base.selection.powerKw) || powerFields[0].unit !== 'kW') {
    throw new ValidationError('Teknik bilgi rezonatör gücü seçimiyle eşleşmiyor');
  }
  const keys = new Set<string>();
  for (const spec of edits) {
    if (keys.has(spec.key)) throw new ValidationError('Teknik alan birden fazla kez kullanılamaz');
    keys.add(spec.key);
  }
  if (options.replaceAll && !keys.has('Lazer Gücü')) throw new ValidationError('Rezonatör gücü alanı silinemez');
  const hidden = new Set(base.hiddenSpecKeys ?? []);
  if (options.replaceAll) for (const spec of base.specs) if (!keys.has(spec.key)) hidden.add(spec.key);
  for (const key of keys) hidden.delete(key);
  const current = new Map(base.specs.filter((spec) => !options.replaceAll || keys.has(spec.key)).map((spec) => [spec.key, spec]));
  for (const edit of edits) {
    const existing = current.get(edit.key);
    if (edit.key === 'Lazer Gücü' && (edit.value !== String(base.selection.powerKw) || edit.unit !== 'kW')) {
      throw new ValidationError('Rezonatör gücü seçim alanından değiştirilmelidir');
    }
    const sourceValue = existing?.sourceValue ?? existing?.value ?? '';
    const sourceUnit = existing?.sourceUnit ?? existing?.unit ?? '';
    const sourceGroupCode = existing?.sourceGroupCode ?? existing?.groupCode ?? 'GENEL';
    const groupCode = edit.groupCode ?? existing?.groupCode ?? 'GENEL';
    const isManual = !existing || edit.value !== sourceValue || (edit.unit ?? '') !== sourceUnit || groupCode !== sourceGroupCode;
    if (existing && existing.value === edit.value && (existing.unit ?? '') === (edit.unit ?? '') && (existing.groupCode ?? 'GENEL') === groupCode && Boolean(existing.isManual) === isManual) continue;
    current.set(edit.key, {
      key: edit.key, value: edit.value, unit: edit.unit,
      groupCode,
      source: existing?.source, sourceValue, sourceUnit, sourceGroupCode,
      isManual,
    });
  }
  if (current.size > 150 || hidden.size > 150) throw new ValidationError('Teknik profilde en fazla 150 alan veya gizlenen alan olabilir');
  return { ...base, ...(base.hiddenSpecKeys || hidden.size ? { hiddenSpecKeys: [...hidden] } : {}), specs: options.replaceAll ? edits.map((edit) => current.get(edit.key)!) : [...current.values()] };
}

/** Re-import refreshes source values while keeping a user's manual values, including deliberate blanks. */
export function mergeLaserReimport(source: LaserTechnicalConfiguration, existing?: LaserTechnicalConfiguration): LaserTechnicalConfiguration {
  if (!existing) return source;
  const hidden = new Set(existing.hiddenSpecKeys ?? []);
  const incoming = new Map(source.specs.filter((spec) => !hidden.has(spec.key)).map((spec) => [spec.key, spec]));
  for (const spec of existing.specs) {
    if (!spec.isManual || hidden.has(spec.key)) continue;
    const baseline = incoming.get(spec.key);
    incoming.set(spec.key, { ...spec, source: baseline?.source, sourceValue: baseline?.value ?? '', sourceUnit: baseline?.unit ?? '', sourceGroupCode: baseline?.groupCode ?? 'GENEL', isManual: true });
  }
  return { ...source, ...(existing.hiddenSpecKeys || hidden.size ? { hiddenSpecKeys: [...hidden] } : {}), specs: [...incoming.values()] };
}

@Injectable()
export class LaserProfilesService {
  constructor(@Inject(DB) private readonly db: DbClient, private readonly audit: AuditService) {}

  async assertScope(scope: { divisionId: string; brandId?: string }, actor: AuthContext) {
    assertCanUseResourceDivision(actor, 'products', scope.divisionId);
    const division = await this.db.query.divisions.findFirst({ where: and(
      eq(divisions.id, scope.divisionId), eq(divisions.tenantId, actor.tenantId),
      eq(divisions.isActive, true), isNull(divisions.deletedAt),
    ) });
    if (!division || division.code.toLowerCase() !== 'sac_isleme') {
      throw new ValidationError('Lazer teknik profili için Sac İşleme bölümü seçilmelidir');
    }
    if (!scope.brandId) return;
    const brand = await this.db.query.brands.findFirst({ where: and(
      eq(brands.id, scope.brandId), eq(brands.tenantId, actor.tenantId), isNull(brands.deletedAt),
    ) });
    if (!brand || (brand.divisionId && brand.divisionId !== scope.divisionId)) throw new NotFoundError('Bölüm markası');
    // This source catalog belongs to AORE. Never silently attach it to another manufacturer.
    if (brand.technicalCatalogCode !== 'AORE_LASER' && !isSupportedLaserBrand(brand.name)) {
      throw new ValidationError('Bu marka için AORE lazer teknik kataloğu seçilmelidir');
    }
  }

  async options(scope: { divisionId: string; brandId?: string }, actor: AuthContext) {
    await this.assertScope(scope, actor);
    const rows = scope.brandId ? await this.db.select({
      sourceModelCode: laserTechnicalProfiles.sourceModelCode,
      sizeLabel: sql<string>`${laserTechnicalProfiles.configuration}->>'sizeLabel'`,
    }).from(laserTechnicalProfiles).where(and(
      eq(laserTechnicalProfiles.tenantId, actor.tenantId), eq(laserTechnicalProfiles.divisionId, scope.divisionId),
      eq(laserTechnicalProfiles.brandId, scope.brandId), isNull(laserTechnicalProfiles.deletedAt),
    )) : [];
    const saved = new Map(rows.map((row) => [row.sourceModelCode, row.sizeLabel]));
    return {
      models: LASER_MODELS.map(({ fields: _fields, issues: _issues, ...model }) => ({
        ...model, sizeLabel: saved.get(model.code) ?? model.sizeLabel,
      })),
      powerOptions: LASER_POWERS, cabinOptions: ['open', 'closed'] as const,
    };
  }

  private condition(scope: LaserProfileScope, selection: LaserSelection, actor: AuthContext) {
    return and(eq(laserTechnicalProfiles.tenantId, actor.tenantId), eq(laserTechnicalProfiles.divisionId, scope.divisionId),
      eq(laserTechnicalProfiles.brandId, scope.brandId), eq(laserTechnicalProfiles.productTypeCode, selection.productTypeCode),
      eq(laserTechnicalProfiles.sourceModelCode, selection.sourceModelCode), eq(laserTechnicalProfiles.cabinType, selection.cabinType),
      eq(laserTechnicalProfiles.powerKw, selection.powerKw));
  }

  private canonical(selection: LaserSelection) {
    const parsed = laserSelectionSchema.safeParse(selection);
    if (!parsed.success || !LASER_MODELS.some((model) => model.code === selection.sourceModelCode)) {
      throw new ValidationError('Lazer seçimi kaynak kataloğuyla eşleşmiyor');
    }
    return resolveLaserProfile(parsed.data);
  }

  /**
   * A laser profile is the editable technical template for one exact sellable
   * combination. Keep product cards on that template while quote snapshots stay
   * immutable in quote item compatibility data.
   */
  private async syncMatchingProducts(
    tx: DbTransaction,
    scope: LaserProfileScope,
    configurations: LaserTechnicalConfiguration[],
    actor: AuthContext,
  ) {
    if (!configurations.length) return 0;
    const bySelection = new Map(configurations.map((configuration) => [laserSelectionKey(configuration.selection), configuration]));
    const rows = await tx.select({
      id: productModels.id,
      technicalConfiguration: productModels.technicalConfiguration,
    }).from(productModels).where(and(
      eq(productModels.tenantId, actor.tenantId),
      eq(productModels.brandId, scope.brandId),
      isNull(productModels.deletedAt),
    ));
    const productIdsBySelection = new Map<string, string[]>();
    for (const row of rows) {
      const parsed = laserTechnicalConfigurationSchema.safeParse(row.technicalConfiguration);
      if (!parsed.success) continue;
      const key = laserSelectionKey(parsed.data.selection);
      if (!bySelection.has(key)) continue;
      productIdsBySelection.set(key, [...(productIdsBySelection.get(key) ?? []), row.id]);
    }
    let synced = 0;
    const syncedProductIds: string[] = [];
    for (const [key, ids] of productIdsBySelection) {
      const configuration = bySelection.get(key);
      if (!configuration || !ids.length) continue;
      await tx.update(productModels).set({ technicalConfiguration: configuration }).where(and(
        eq(productModels.tenantId, actor.tenantId),
        inArray(productModels.id, ids),
      ));
      synced += ids.length;
      syncedProductIds.push(...ids);
    }
    if (syncedProductIds.length) {
      await tx.update(productSpecs).set({ deletedAt: new Date() }).where(and(
        eq(productSpecs.tenantId, actor.tenantId),
        inArray(productSpecs.productModelId, syncedProductIds),
        isNull(productSpecs.deletedAt),
      ));
    }
    return synced;
  }

  async resolve(scope: LaserProfileScope, selection: LaserSelection, actor: AuthContext): Promise<LaserTechnicalConfiguration> {
    await this.assertScope(scope, actor);
    const fallback = this.canonical(selection);
    const row = await this.db.query.laserTechnicalProfiles.findFirst({ where: and(this.condition(scope, selection, actor), isNull(laserTechnicalProfiles.deletedAt)) });
    return row ? { ...row.configuration, profileId: row.id } : fallback;
  }

  async save(scope: LaserProfileScope, selection: LaserSelection, specs: LaserSpec[], actor: AuthContext) {
    if (!actor.roles.includes('super_admin')) throw new ForbiddenError('Teknik profil yönetimi yalnızca Süper Admin tarafından yapılabilir');
    await this.assertScope(scope, actor);
    const fallback = this.canonical(selection);
    const result = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:${scope.divisionId}:${scope.brandId}:${laserSelectionKey(selection)}`}, 0))`);
      const existing = await tx.query.laserTechnicalProfiles.findFirst({ where: this.condition(scope, selection, actor) });
      const configuration = laserTechnicalConfigurationSchema.parse(applyLaserSpecEdits(existing?.configuration ?? fallback, specs, { replaceAll: true }));
      const values = { configuration, updatedBy: actor.userId, updatedAt: new Date(), deletedAt: null };
      const [saved] = existing
        ? await tx.update(laserTechnicalProfiles).set(values).where(eq(laserTechnicalProfiles.id, existing.id)).returning()
        : await tx.insert(laserTechnicalProfiles).values({ tenantId: actor.tenantId, ...scope, ...selection, ...values }).returning();
      const savedConfiguration = { ...saved.configuration, profileId: saved.id };
      const syncedProductCount = await this.syncMatchingProducts(tx, scope, [savedConfiguration], actor);
      return { ...savedConfiguration, syncedProductCount };
    });
    await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'laser_profile.updated', resourceType: 'laser_profile', resourceId: result.profileId!, newValues: { selection, fieldCount: result.specs.length, syncedProductCount: result.syncedProductCount } });
    return result;
  }

  /** Called only with server-retained, parsed preview values. */
  async importProfiles(scope: LaserProfileScope, configurations: LaserTechnicalConfiguration[], actor: AuthContext) {
    if (!actor.roles.includes('super_admin')) throw new ForbiddenError();
    await this.assertScope(scope, actor);
    let created = 0; let updated = 0;
    // Stable order prevents deadlocks between concurrent imports of overlapping profiles.
    const profiles = [...configurations].sort((a, b) => laserSelectionKey(a.selection).localeCompare(laserSelectionKey(b.selection)));
    let syncedProductCount = 0;
    await this.db.transaction(async (tx) => {
      const savedConfigurations: LaserTechnicalConfiguration[] = [];
      for (const source of profiles) {
        this.canonical(source.selection);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:${scope.divisionId}:${scope.brandId}:${laserSelectionKey(source.selection)}`}, 0))`);
        const existing = await tx.query.laserTechnicalProfiles.findFirst({ where: this.condition(scope, source.selection, actor) });
        const configuration = laserTechnicalConfigurationSchema.parse(mergeLaserReimport(source, existing?.configuration));
        savedConfigurations.push(configuration);
        const values = { configuration, updatedBy: actor.userId, updatedAt: new Date(), deletedAt: null };
        if (existing) { await tx.update(laserTechnicalProfiles).set(values).where(eq(laserTechnicalProfiles.id, existing.id)); updated++; }
        else { await tx.insert(laserTechnicalProfiles).values({ tenantId: actor.tenantId, ...scope, ...source.selection, ...values }); created++; }
      }
      syncedProductCount = await this.syncMatchingProducts(tx, scope, savedConfigurations, actor);
    });
    await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'laser_profile.imported', resourceType: 'laser_profile', resourceId: scope.brandId, newValues: { divisionId: scope.divisionId, created, updated, syncedProductCount } });
    return { ok: true, created, updated, imported: profiles.length, syncedProductCount };
  }
}
