/** Additive source-backed technical repair. Never modifies prices, taxonomy or nonblank manual values. */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { HEX2026_SERIES, type BaseModelConfiguration } from '@haksan/shared';
import type { DbClient } from './client';
import * as s from './schema';
import { readSnapshot } from './import-haksanmakina-catalog';
import { canonicalSpecs, SPEC_GROUP_NAMES } from './haksan-spec-templates';
import { guardCatalogReferences } from './catalog-reference-guard';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { haksanDivision } from './haksan-catalog-classification';
type Spec = { key: string; value: string; unit: string; group?: string };
const keyOf = (key: string) => key.trim().toLocaleLowerCase('tr-TR');
const measurementText = (spec: Spec) => `${spec.value} ${spec.unit ?? ''}`.toLocaleLowerCase('tr-TR').replace(/(\d),(?=\d)/g, '$1.').replace(/\s+/g, '').replace(/×/g, 'x');
const isBlank = (value: string) => !value.trim() || /^(?:-|—|–|n\/a)$/i.test(value.trim());
export function planMissingTechnical(existing: Spec[], incoming: Spec[]) {
  const additions: Spec[] = [], fills: Spec[] = [], conflicts: Spec[] = [];
  const seen = new Map(existing.map(spec => [keyOf(spec.key), spec]));
  for (const spec of incoming) {
    if (isBlank(spec.value)) continue;
    const previous = seen.get(keyOf(spec.key));
    if (!previous) { additions.push(spec); seen.set(keyOf(spec.key), spec); }
    else if (isBlank(previous.value)) { fills.push(spec); seen.set(keyOf(spec.key), spec); }
    else if (measurementText(previous) !== measurementText(spec)) conflicts.push(spec);
  }
  return { additions, fills, conflicts };
}
export function invariantTechnical(configurations: Spec[][], excludedKeys: string[] = []) {
  const excluded = new Set(excludedKeys.map(keyOf));
  return (configurations[0] ?? []).filter(spec => !excluded.has(keyOf(spec.key)) && configurations.every(rows => rows.some(row => keyOf(row.key) === keyOf(spec.key) && row.value === spec.value && row.unit === spec.unit)));
}
export function verifiedHexInvariant(series: typeof HEX2026_SERIES[number]): Spec[] {
  const configurations = series.configurations.map(config => config.fields.filter(field => field.verification === 'verified' && !field.powerBranches?.length)
    .map(field => ({ key: field.key, value: field.rawValue, unit: '', group: /Motor Gücü/.test(field.key) ? 'MOTORLAR' : 'GENEL' })));
  // Capacity and selectable power are configuration facts even when the PDF prints the same range.
  return invariantTechnical(configurations).filter(spec => !/Lazer Gücü|Çalışma Alanı|Konvansiyonel Düz Kesim|Boru.*(Uzunluğu|Çapı)|Ekipman Boyutu|Kabin/i.test(spec.key));
}
const TABLES = ['product_spec_groups', 'product_spec_templates', 'product_models', 'product_specs', 'product_option_sets', 'product_option_values'] as const;
type Change = { table: string; id: string; before: Record<string, unknown> | null; after: Record<string, unknown> };
async function raw(db: DbClient, table: string, id: string) {
  return (await db.execute(sql`SELECT to_jsonb(t) AS row FROM ${sql.identifier(table)} t WHERE id=${id}::uuid`)).rows[0]?.row as Record<string, unknown>;
}
async function assertOperator(db: DbClient, tenantId: string, userId: string) {
  const rows = await db.select({ id: s.users.id }).from(s.users).innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id)).innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId))
    .where(and(eq(s.users.id, userId), eq(s.users.tenantId, tenantId), eq(s.users.status, 'active'), isNull(s.users.deletedAt), eq(s.roles.code, 'super_admin'))).limit(1);
  if (!rows.length) throw new Error('Active tenant super administrator required');
}
const enrichedSpecSchema = z.object({ key: z.string().min(1).max(255), value: z.string().max(2000), unit: z.string().max(64) });
const enrichedSnapshotSchema = z.object({ products: z.array(z.object({ sourceId: z.string().regex(/^\d+$/), sourceUrl: z.string().url().startsWith('https://www.haksanmakina.com.tr/'), specs: z.array(enrichedSpecSchema).max(200),
  extractionWarnings: z.array(z.string()).optional(),
  technicalConfigurations: z.array(z.object({ sourceModelCode: z.string().min(1).max(128), specs: z.array(enrichedSpecSchema).max(200), sourceUrl: z.string().url().optional(), verificationStatus: z.literal('source_verified') })).max(100).optional() })).min(1) });
export async function backfillCatalogTechnical(db: DbClient, tenantId: string, userId: string, apply = false, enrichedSnapshotPath?: string) {
  await assertOperator(db, tenantId, userId);
  const snapshot = await readSnapshot();
  const enriched = enrichedSnapshotPath ? enrichedSnapshotSchema.parse(JSON.parse(await readFile(enrichedSnapshotPath, 'utf8'))) : undefined;
  if (enriched) {
    const ids = new Set<string>();
    for (const product of enriched.products) {
      if (ids.has(product.sourceId)) throw new Error(`Duplicate enriched source: ${product.sourceId}`);
      ids.add(product.sourceId);
      const original = [...snapshot.products, ...snapshot.deferredLasers, ...snapshot.excluded].find(row => row.sourceId === product.sourceId);
      if (!original || original.sourceUrl !== product.sourceUrl) throw new Error(`Unknown enriched source: ${product.sourceId}`);
    }
  }
  const run = async (client: DbClient) => {
    const allDivisions = await client.select().from(s.divisions);
    const divisions = allDivisions.filter(division => division.tenantId === tenantId && !division.deletedAt);
    const modelRows = await client.select({ model: s.productModels, typeCode: s.productTypes.code, typeDivisionId: s.productTypes.divisionId, groupDivisionId: s.productGroups.divisionId })
      .from(s.productModels).innerJoin(s.productTypes, eq(s.productTypes.id, s.productModels.productTypeId))
      .leftJoin(s.productGroups, eq(s.productGroups.id, s.productModels.productGroupId))
      .where(and(eq(s.productModels.tenantId, tenantId), isNull(s.productModels.deletedAt)));
    const models = modelRows.map(row => {
      const source = snapshot.products.find(source => row.model.modelCode === `HM-${source.sourceId}` || row.model.catalogSources.some(ref => ref.sourceId === source.sourceId && ref.url === source.sourceUrl));
      const owned = divisions.find(division => division.id === row.groupDivisionId) ?? divisions.find(division => division.id === row.typeDivisionId)
        ?? (source ? divisions.find(division => division.code.toUpperCase() === haksanDivision(source)) : undefined)
        ?? (row.model.laserBaseConfiguration ? divisions.find(division => division.code.toUpperCase() === 'SAC_ISLEME') : undefined);
      const protectedCnc = [row.groupDivisionId, row.typeDivisionId].some(id => allDivisions.find(division => division.id === id)?.code.toUpperCase() === 'CNC') || Boolean(source && haksanDivision(source) === 'CNC');
      return { ...row, divisionId: owned?.id ?? null, protectedCnc };
    });
    const specs = await client.select().from(s.productSpecs).where(and(eq(s.productSpecs.tenantId, tenantId), isNull(s.productSpecs.deletedAt)));
    const templates = await client.select().from(s.productSpecTemplates);
    const groups = await client.select().from(s.productSpecGroups);
    const optionSets = await client.select().from(s.productOptionSets).where(and(eq(s.productOptionSets.tenantId, tenantId), isNull(s.productOptionSets.deletedAt)));
    const optionValues = await client.select().from(s.productOptionValues).where(and(eq(s.productOptionValues.tenantId, tenantId), isNull(s.productOptionValues.deletedAt)));
    const previous = apply ? (await client.execute(sql`SELECT changes FROM public.__technical_backfill_journal WHERE tenant_id=${tenantId}::uuid AND rolled_back_at IS NULL FOR UPDATE`)).rows[0]?.changes : [];
    const changes = (previous ?? []) as Change[];
    const capture = async (table: string, id: string, before: Record<string, unknown> | null) => {
      const after = await raw(client, table, id); if (JSON.stringify(before) === JSON.stringify(after)) return;
      const known = changes.find(row => row.table === table && row.id === id); if (known) known.after = after; else changes.push({ table, id, before, after });
    };
    const report = { mode: apply ? 'applied' : 'preview', sourceProducts: snapshot.products.length, matchedProducts: 0, protectedCncSkipped: 0, addedSpecs: 0, filledSpecs: 0, addedTemplates: 0, updatedConfigurations: 0,
      disabledTemplates: [] as { modelCode: string; key: string }[], reactivatedTemplates: 0, addedOptionValues: 0, archivedOptionValues: 0, extractionWarnings: [] as { sourceId: string; warnings: string[] }[], blockedConfigurations: [] as { modelCode: string; sourceModelCode: string; keys: string[] }[],
      missingSources: [] as string[], emptySources: [] as string[], uncanonicalFields: [] as { sourceId: string; key: string }[], preservedConflicts: [] as { modelCode: string; key: string }[] };
    const sourceFor = (model: typeof s.productModels.$inferSelect) => snapshot.products.find(source => model.modelCode === `HM-${source.sourceId}` || model.catalogSources.some(ref => ref.sourceId === source.sourceId && ref.url === source.sourceUrl));
    const incomingFor = (model: typeof s.productModels.$inferSelect, type: string): Spec[] => {
      const source = sourceFor(model); if (!source) return [];
      const enrichment = enriched?.products.find(row => row.sourceId === source.sourceId);
      if (enrichment?.extractionWarnings?.length) return [];
      const values = canonicalSpecs(type, enrichment?.specs ?? source.specs).filter(spec => !spec.layout);
      for (const spec of values.filter(spec => !spec.canonical)) report.uncanonicalFields.push({ sourceId: source.sourceId, key: spec.key });
      return values;
    };
    for (const { model, typeCode, divisionId, protectedCnc } of models) {
      if (protectedCnc) { report.protectedCncSkipped++; continue; }
      if (!divisionId) {
        if (sourceFor(model) || model.baseModelConfiguration || model.laserBaseConfiguration) throw new Error(`Product division unresolved: ${model.modelCode}`);
        continue;
      }
      const source = sourceFor(model);
      const sourceEnrichment = source ? enriched?.products.find(row => row.sourceId === source.sourceId) : undefined;
      if (sourceEnrichment?.extractionWarnings?.length) report.extractionWarnings.push({ sourceId: source!.sourceId, warnings: sourceEnrichment.extractionWarnings });
      let incoming = source ? incomingFor(model, typeCode) : [];
      let nextConfig: BaseModelConfiguration | undefined;
      if (model.baseModelConfiguration) {
        const configuration = model.baseModelConfiguration;
        const expandedSources = new Set<string>();
        const configurations = configuration.configurations.flatMap(config => {
          const sourceModel = models.find(row => row.model.id === config.sourceProductId);
          const source = sourceModel ? sourceFor(sourceModel.model) : undefined;
          const enrichment = source ? enriched?.products.find(row => row.sourceId === source.sourceId) : undefined;
          const explicit = enrichment?.extractionWarnings?.length ? undefined : enrichment?.technicalConfigurations;
          if (explicit?.length && !explicit.some(row => row.sourceModelCode === config.sourceModelCode)) {
            const owned = source ? canonicalSpecs(sourceModel!.typeCode, source.specs).filter(spec => !spec.layout) : [];
            const manual = config.specs.filter(spec => spec.key !== 'Standart Donanım' && !isBlank(spec.value) && !owned.some(row => keyOf(row.key) === keyOf(spec.key) && row.value === spec.value && row.unit === spec.unit));
            if (manual.length) { report.blockedConfigurations.push({ modelCode: model.modelCode, sourceModelCode: config.sourceModelCode, keys: manual.map(row => row.key) }); return [config]; }
          }
          if (explicit?.length && expandedSources.has(config.sourceProductId)) return [];
          if (explicit?.length) { expandedSources.add(config.sourceProductId); return explicit.map(row => {
            const existing = configuration.configurations.find(previous => previous.sourceProductId === config.sourceProductId && previous.sourceModelCode === row.sourceModelCode);
            // An aggregate model's stored values are not assigned to every variant.
            const retained = existing?.specs ?? config.specs.filter(spec => spec.key === 'Standart Donanım');
            const values = canonicalSpecs(sourceModel!.typeCode, row.specs).filter(spec => !spec.layout);
            const plan = planMissingTechnical(retained, values);
            return { ...config, sourceModelCode: row.sourceModelCode, specs: [...retained.map(spec => plan.fills.find(fill => keyOf(fill.key) === keyOf(spec.key)) ?? spec), ...plan.additions] };
          }); }
          const values = sourceModel ? incomingFor(sourceModel.model, sourceModel.typeCode) : [];
          const plan = planMissingTechnical(config.specs, values);
          return [{ ...config, specs: [...config.specs.map(spec => plan.fills.find(fill => keyOf(fill.key) === keyOf(spec.key)) ?? spec), ...plan.additions] }];
        });
        const allKeys = [...new Set(configurations.flatMap(config => config.specs.map(spec => spec.key)))];
        const invariant = invariantTechnical(configurations.map(config => config.specs));
        const variableSpecKeys = allKeys.filter(key => !invariant.some(spec => spec.key === key));
        nextConfig = { ...configuration, sourceModelCodes: configurations.map(row => row.sourceModelCode), configurations, variableSpecKeys };
        // Empty manual configuration metadata cannot justify replacing existing product values.
        if (!configurations.length) { nextConfig = configuration; incoming = []; }
        if (configurations.length > 1) {
          const mappedSets = optionSets.filter(set => set.productModelId === model.id && optionValues.some(value => value.optionSetId === set.id && value.sourceModelCode && configuration.sourceModelCodes.includes(value.sourceModelCode)));
          if (mappedSets.length > 1) throw new Error(`Ambiguous configuration option sets: ${model.modelCode}`);
          let set = mappedSets[0] ?? optionSets.find(set => set.productModelId === model.id && set.name === 'Makine Konfigürasyonu');
          if (apply && !set) { const [row] = await client.insert(s.productOptionSets).values({ tenantId, productModelId: model.id, name: 'Makine Konfigürasyonu', configurationKind: null }).returning(); set = row; optionSets.push(row); await capture('product_option_sets', row.id, null); }
          const nextCodes = new Set(configurations.map(config => config.sourceModelCode));
          const obsolete = set ? optionValues.filter(value => value.optionSetId === set!.id && value.sourceModelCode && configuration.sourceModelCodes.includes(value.sourceModelCode) && !nextCodes.has(value.sourceModelCode)) : [];
          report.archivedOptionValues += obsolete.length;
          if (apply) for (const value of obsolete) {
            const before = await raw(client, 'product_option_values', value.id);
            await client.update(s.productOptionValues).set({ deletedAt: sql`now()`, updatedAt: sql`${s.productOptionValues.updatedAt}` }).where(eq(s.productOptionValues.id, value.id));
            await capture('product_option_values', value.id, before);
          }
          for (const [index, config] of configurations.entries()) {
            if (set && optionValues.some(value => value.optionSetId === set.id && value.sourceModelCode === config.sourceModelCode)) continue;
            if (config.sourceModelCode.length > 64) throw new Error(`Source model exceeds option code limit: ${config.sourceModelCode}`);
            report.addedOptionValues++;
            if (apply) { const [row] = await client.insert(s.productOptionValues).values({ tenantId, optionSetId: set!.id, sourceModelCode: config.sourceModelCode, value: config.sourceModelCode, priceDelta: null, currencyId: model.currencyId, sortOrder: index }).returning(); optionValues.push(row); await capture('product_option_values', row.id, null); }
          }
        }
        if (configurations.length) incoming = invariant;
        if (JSON.stringify(nextConfig) !== JSON.stringify(configuration)) {
          report.updatedConfigurations++;
          if (apply) { const before = await raw(client, 'product_models', model.id); await client.update(s.productModels).set({ baseModelConfiguration: nextConfig, updatedAt: sql`${s.productModels.updatedAt}` }).where(eq(s.productModels.id, model.id)); await capture('product_models', model.id, before); }
        }
      } else if (model.laserBaseConfiguration?.sourceRevision === 'hexlaser-2026-v1') {
        const series = HEX2026_SERIES.find(row => row.series === model.series);
        if (series) incoming = verifiedHexInvariant(series);
      } else if (sourceEnrichment?.technicalConfigurations && sourceEnrichment.technicalConfigurations.length > 1 && !sourceEnrichment.extractionWarnings?.length) {
        incoming = [...incoming, ...sourceEnrichment.technicalConfigurations.flatMap(config => canonicalSpecs(typeCode, config.specs).filter(spec => !spec.layout).map(spec => ({ ...spec, key: `${config.sourceModelCode} — ${spec.key}` })))];
        if (incoming.some(spec => spec.key.length > 255)) throw new Error(`Labeled technical field exceeds limit: ${model.modelCode}`);
      }
      if (!source && !model.baseModelConfiguration && !model.laserBaseConfiguration) continue;
      report.matchedProducts++;
      if (!incoming.length) report.emptySources.push(model.modelCode);
      const current = specs.filter(row => row.productModelId === model.id);
      const plan = planMissingTechnical(current.map(row => ({ key: row.specKey, value: row.specValue, unit: row.specUnit ?? '' })), incoming);
      report.addedSpecs += plan.additions.length; report.filledSpecs += plan.fills.length;
      report.preservedConflicts.push(...plan.conflicts.map(spec => ({ modelCode: model.modelCode, key: spec.key })));
      // Existing imported fields must be editable too; a missing template used to hide persisted values.
      const editableFields = [...incoming, ...current.map(row => ({ key: row.specKey, value: row.specValue, unit: row.specUnit ?? '', group: groups.find(group => group.id === row.specGroupId)?.code ?? 'GENEL' }))];
      for (const spec of editableFields) {
        const template = templates.find(row => row.divisionId === divisionId && row.productTypeCode === typeCode && keyOf(row.specKey) === keyOf(spec.key))
          ?? templates.find(row => row.divisionId === null && row.isActive && !row.isDeleted && row.productTypeCode === typeCode && keyOf(row.specKey) === keyOf(spec.key));
        if (template && (template.isDeleted || !template.isActive)) {
          if (incoming.some(value => keyOf(value.key) === keyOf(spec.key))) {
            report.reactivatedTemplates++;
            if (apply) { const before = await raw(client, 'product_spec_templates', template.id); await client.update(s.productSpecTemplates).set({ isDeleted: false, isActive: true, updatedAt: sql`${s.productSpecTemplates.updatedAt}` }).where(eq(s.productSpecTemplates.id, template.id)); await capture('product_spec_templates', template.id, before); }
            template.isDeleted = false; template.isActive = true;
          } else report.disabledTemplates.push({ modelCode: model.modelCode, key: spec.key });
        }
        if (!template) {
          report.addedTemplates++;
          if (apply) { const [row] = await client.insert(s.productSpecTemplates).values({ divisionId, productTypeCode: typeCode, specKey: spec.key, specUnit: spec.unit || null, specGroupCode: spec.group ?? 'GENEL', sortOrder: templates.length }).returning(); templates.push(row); await capture('product_spec_templates', row.id, null); }
          else templates.push({ divisionId, productTypeCode: typeCode, specKey: spec.key } as typeof templates[number]);
        }
      }
      if (!apply) continue;
      for (const spec of [...plan.additions, ...plan.fills]) {
        const groupCode = spec.group ?? 'GENEL';
        let group = groups.find(row => row.divisionId === divisionId && row.code === groupCode);
        if (!group) { const [row] = await client.insert(s.productSpecGroups).values({ divisionId, code: groupCode, name: SPEC_GROUP_NAMES[groupCode] ?? groupCode }).returning(); group = row; groups.push(row); await capture('product_spec_groups', row.id, null); }
        const existing = current.find(row => keyOf(row.specKey) === keyOf(spec.key));
        if (existing) { const before = await raw(client, 'product_specs', existing.id); await client.update(s.productSpecs).set({ specValue: spec.value, specUnit: spec.unit || null, specGroupId: group.id, updatedAt: sql`${s.productSpecs.updatedAt}` }).where(eq(s.productSpecs.id, existing.id)); await capture('product_specs', existing.id, before); }
        else { const [row] = await client.insert(s.productSpecs).values({ tenantId, productModelId: model.id, specKey: spec.key, specValue: spec.value, specUnit: spec.unit || null, specGroupId: group.id, sortOrder: current.length + plan.additions.indexOf(spec) }).returning(); await capture('product_specs', row.id, null); }
      }
    }
    report.missingSources = snapshot.products.filter(source => !models.some(row => sourceFor(row.model)?.sourceId === source.sourceId)).map(source => source.sourceId);
    if (apply) await client.execute(sql`INSERT INTO public.__technical_backfill_journal (tenant_id,changes) VALUES (${tenantId}::uuid,${JSON.stringify(changes)}::jsonb) ON CONFLICT (tenant_id) DO UPDATE SET changes=excluded.changes,rolled_back_at=NULL`);
    return report;
  };
  if (!apply) return run(db);
  return db.transaction(async tx => {
    const client = tx as unknown as DbClient;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId + ':technical-backfill'},0))`);
    for (const table of TABLES) await tx.execute(sql`LOCK TABLE ${sql.identifier(table)} IN SHARE ROW EXCLUSIVE MODE`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS public.__technical_backfill_journal (tenant_id uuid PRIMARY KEY,changes jsonb NOT NULL,rolled_back_at timestamptz)`);
    return run(client);
  });
}
export async function rollbackCatalogTechnical(db: DbClient, tenantId: string, apply = false) {
  if (!(await db.execute(sql`SELECT to_regclass('public.__technical_backfill_journal') AS relation`)).rows[0]?.relation) return { mode: 'preview', changes: 0 };
  if (!apply) return { mode: 'preview', changes: Number((await db.execute(sql`SELECT jsonb_array_length(changes) AS n FROM public.__technical_backfill_journal WHERE tenant_id=${tenantId}::uuid AND rolled_back_at IS NULL`)).rows[0]?.n ?? 0) };
  return db.transaction(async tx => {
    const client = tx as unknown as DbClient;
    for (const table of TABLES) await tx.execute(sql`LOCK TABLE ${sql.identifier(table)} IN SHARE ROW EXCLUSIVE MODE`);
    const changes = ((await tx.execute(sql`SELECT changes FROM public.__technical_backfill_journal WHERE tenant_id=${tenantId}::uuid AND rolled_back_at IS NULL FOR UPDATE`)).rows[0]?.changes ?? []) as Change[];
    for (const change of changes) { if (!TABLES.includes(change.table as typeof TABLES[number])) throw new Error('Invalid backfill rollback table'); if (JSON.stringify(await raw(client, change.table, change.id)) !== JSON.stringify(change.after)) throw new Error(`Rollback blocked by subsequent edit: ${change.table}/${change.id}`); }
    for (const change of changes.filter(row => !row.before)) await guardCatalogReferences(client, change.table, change.id, changes);
    for (const change of changes.filter(row => row.before)) {
      const assignments = sql.join(Object.keys(change.before!).filter(key => key !== 'id').map(key => sql`${sql.identifier(key)}=restored.${sql.identifier(key)}`), sql`, `);
      await tx.execute(sql`UPDATE ${sql.identifier(change.table)} t SET ${assignments} FROM jsonb_populate_record(NULL::${sql.identifier(change.table)},${JSON.stringify(change.before)}::jsonb) restored WHERE t.id=${change.id}::uuid`);
    }
    for (const table of [...TABLES].reverse()) for (const change of changes.filter(row => row.table === table && !row.before)) await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE id=${change.id}::uuid`);
    await tx.execute(sql`UPDATE public.__technical_backfill_journal SET rolled_back_at=now() WHERE tenant_id=${tenantId}::uuid`);
    return { mode: 'rolled_back', changes: changes.length };
  });
}
