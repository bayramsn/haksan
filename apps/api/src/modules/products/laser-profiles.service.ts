import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  LASER_MODELS, LASER_POWERS, laserSelectionKey, laserSelectionSchema, laserTechnicalConfigurationSchema,
  resolveLaserProfile, type LaserSelection, type LaserSpec, type LaserTechnicalConfiguration,
} from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { brands, laserTechnicalProfiles } from '../../db/schema/products';
import { divisions } from '../../db/schema/tenants';
import { DB } from '../../shared/database/database.module';
import { AuditService } from '../../shared/database/audit.service';
import type { AuthContext } from '../../shared/security/auth.types';
import { assertCanUseResourceDivision } from '../../shared/utils/division-scope';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';

export interface LaserProfileScope { divisionId: string; brandId: string }

/** Only explicit values/unit edits come from the client; provenance stays server-owned. */
export function applyLaserSpecEdits(base: LaserTechnicalConfiguration, edits: LaserSpec[]): LaserTechnicalConfiguration {
  const powerFields = base.specs.filter((spec) => spec.key === 'Lazer Gücü');
  if (powerFields.length !== 1 || powerFields[0].value !== String(base.selection.powerKw) || powerFields[0].unit !== 'kW') {
    throw new ValidationError('Teknik bilgi rezonatör gücü seçimiyle eşleşmiyor');
  }
  const keys = new Set<string>();
  for (const spec of edits) {
    if (keys.has(spec.key)) throw new ValidationError('Teknik alan birden fazla kez kullanılamaz');
    keys.add(spec.key);
  }
  const current = new Map(base.specs.map((spec) => [spec.key, spec]));
  for (const edit of edits) {
    const existing = current.get(edit.key);
    if (edit.key === 'Lazer Gücü' && (edit.value !== String(base.selection.powerKw) || edit.unit !== 'kW')) {
      throw new ValidationError('Rezonatör gücü seçim alanından değiştirilmelidir');
    }
    const sourceValue = existing?.sourceValue ?? existing?.value ?? '';
    const sourceUnit = existing?.sourceUnit ?? existing?.unit;
    const isManual = !existing || edit.value !== sourceValue || (edit.unit ?? '') !== (sourceUnit ?? '');
    if (existing && existing.value === edit.value && (existing.unit ?? '') === (edit.unit ?? '') && Boolean(existing.isManual) === isManual) continue;
    current.set(edit.key, {
      key: edit.key, value: edit.value, unit: edit.unit,
      groupCode: existing?.groupCode ?? edit.groupCode ?? 'GENEL',
      source: existing?.source, sourceValue, sourceUnit,
      isManual,
    });
  }
  if (current.size > 150) throw new ValidationError('Teknik profilde en fazla 150 alan olabilir');
  return { ...base, specs: [...current.values()] };
}

/** Re-import refreshes source values while keeping a user's manual values, including deliberate blanks. */
export function mergeLaserReimport(source: LaserTechnicalConfiguration, existing?: LaserTechnicalConfiguration): LaserTechnicalConfiguration {
  if (!existing) return source;
  const incoming = new Map(source.specs.map((spec) => [spec.key, spec]));
  for (const spec of existing.specs) {
    if (!spec.isManual) continue;
    const baseline = incoming.get(spec.key);
    incoming.set(spec.key, { ...spec, source: baseline?.source, sourceValue: baseline?.value ?? '', sourceUnit: baseline?.unit, isManual: true });
  }
  return { ...source, specs: [...incoming.values()] };
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
    if (!/\baore\b/i.test(brand.name)) throw new ValidationError('Bu lazer teknik kataloğu AORE markasına aittir');
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
      const configuration = laserTechnicalConfigurationSchema.parse(applyLaserSpecEdits(existing?.configuration ?? fallback, specs));
      const values = { configuration, updatedBy: actor.userId, updatedAt: new Date(), deletedAt: null };
      const [saved] = existing
        ? await tx.update(laserTechnicalProfiles).set(values).where(eq(laserTechnicalProfiles.id, existing.id)).returning()
        : await tx.insert(laserTechnicalProfiles).values({ tenantId: actor.tenantId, ...scope, ...selection, ...values }).returning();
      return { ...saved.configuration, profileId: saved.id };
    });
    await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'laser_profile.updated', resourceType: 'laser_profile', resourceId: result.profileId!, newValues: { selection, fieldCount: result.specs.length } });
    return result;
  }

  /** Called only with server-retained, parsed preview values. */
  async importProfiles(scope: LaserProfileScope, configurations: LaserTechnicalConfiguration[], actor: AuthContext) {
    if (!actor.roles.includes('super_admin')) throw new ForbiddenError();
    await this.assertScope(scope, actor);
    let created = 0; let updated = 0;
    // Stable order prevents deadlocks between concurrent imports of overlapping profiles.
    const profiles = [...configurations].sort((a, b) => laserSelectionKey(a.selection).localeCompare(laserSelectionKey(b.selection)));
    await this.db.transaction(async (tx) => {
      for (const source of profiles) {
        this.canonical(source.selection);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:${scope.divisionId}:${scope.brandId}:${laserSelectionKey(source.selection)}`}, 0))`);
        const existing = await tx.query.laserTechnicalProfiles.findFirst({ where: this.condition(scope, source.selection, actor) });
        const configuration = laserTechnicalConfigurationSchema.parse(mergeLaserReimport(source, existing?.configuration));
        const values = { configuration, updatedBy: actor.userId, updatedAt: new Date(), deletedAt: null };
        if (existing) { await tx.update(laserTechnicalProfiles).set(values).where(eq(laserTechnicalProfiles.id, existing.id)); updated++; }
        else { await tx.insert(laserTechnicalProfiles).values({ tenantId: actor.tenantId, ...scope, ...source.selection, ...values }); created++; }
      }
    });
    await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'laser_profile.imported', resourceType: 'laser_profile', resourceId: scope.brandId, newValues: { divisionId: scope.divisionId, created, updated } });
    return { ok: true, created, updated, imported: profiles.length };
  }
}
