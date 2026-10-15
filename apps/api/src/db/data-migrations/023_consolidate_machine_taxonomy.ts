import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { MACHINE_FAMILIES, isExcludedMachineType, isMainMachineCategory, machineCategoryLabel, machineFamilyForType, machineGroupCode } from '@haksan/shared';
import type { DbClient } from '../client';
import * as s from '../schema';
import { matchesOptionalCompatibility } from '../../modules/products/optional-compatibility';

const ID = '023_consolidate_machine_taxonomy';
// User decision 2026-10-13: existing CNC records stay exactly as they are.
const KEEP = 'CNC';
const tables = {
  categories: s.productCategories,
  subcategories: s.productSubcategories,
  types: s.productTypes,
  models: s.productModels,
  rules: s.productOptionalEquipmentCompatibilities,
};
type Table = keyof typeof tables;
type Row = { id: string; [key: string]: unknown };
export type TaxonomyState = Record<Table | 'groups' | 'divisions', Row[]>;
export type TaxonomyChange = { table: Table; id: string; before: Row | null; after: Row };
const mainCategory = (row: Row | undefined) => !!row && isMainMachineCategory(String(row.code));
const values = (rows: Row[], dimension: string) => new Set(rows.map(r => r[dimension]).filter(Boolean));
const dimensions = ['productGroupId', 'categoryId', 'subcategoryId', 'productTypeId', 'brandId'] as const;

/** Pure preflight: build every change and verify compatibility before the first write. */
export function planMachineTaxonomy(state: TaxonomyState, newId: () => string = randomUUID): TaxonomyChange[] {
  const changes: TaxonomyChange[] = [];
  const next = structuredClone(state);
  const get = (table: keyof TaxonomyState, id: unknown) => state[table].find(r => r.id === id);
  const change = (table: Table, row: Row, patch: Record<string, unknown>) => {
    if (!Object.keys(patch).some(key => row[key] !== patch[key])) return;
    // Data reconciliation preserves audit timestamps; supplying this explicitly also
    // suppresses Drizzle's $onUpdate during both migration and rollback.
    const originalUpdatedAt = row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt;
    const auditedPatch = row.updatedAt === undefined ? patch : { ...patch, updatedAt: originalUpdatedAt };
    const current = next[table].find(r => r.id === row.id)!;
    Object.assign(current, auditedPatch);
    const existing = changes.find(c => c.table === table && c.id === row.id);
    if (existing) {
      for (const key of Object.keys(auditedPatch)) {
        if (!(key in existing.before!)) existing.before![key] = row[key] instanceof Date ? (row[key] as Date).toISOString() : row[key];
      }
      Object.assign(existing.after, auditedPatch);
    } else changes.push({ table, id: row.id,
      before: { id: row.id, ...Object.fromEntries(Object.keys(auditedPatch).map(key => [key,
        row[key] instanceof Date ? (row[key] as Date).toISOString() : row[key]])) }, after: { id: row.id, ...auditedPatch } });
  };
  const categoryGroup = (category: Row, type?: Row) => {
    const explicit = machineGroupCode(String(get('divisions', type?.divisionId ?? category.divisionId)?.code ?? ''));
    if (explicit) return explicit;
    if (!type) return machineGroupCode(String(get('groups', category.productGroupId)?.code ?? ''));
    const modelGroups = new Set(state.models.filter(model => model.productTypeId === type.id)
      .map(model => machineGroupCode(String(get('groups', model.productGroupId)?.code ?? ''))).filter(Boolean));
    if (modelGroups.size > 1) throw new Error(`Machine type ${type.id} is shared across multiple groups`);
    if (modelGroups.size === 1) return [...modelGroups][0];
    const mappedGroups = (Object.keys(MACHINE_FAMILIES) as Array<keyof typeof MACHINE_FAMILIES>)
      .filter(group => machineFamilyForType(group, String(type.code)));
    if (mappedGroups.length !== 1) throw new Error(`Cannot resolve group for machine type ${type.id}`);
    return mappedGroups[0];
  };
  const divisionForGroup = (group: string) => {
    const rows = state.divisions.filter(row => machineGroupCode(String(row.code)) === group);
    const active = rows.filter(row => row.isActive !== false);
    const candidates = active.length ? active : rows;
    if (candidates.length !== 1) throw new Error(`Ambiguous or missing division for ${group}`);
    return candidates[0]!.id;
  };
  const targets = new Map<string, { type: Row; category: Row; group: NonNullable<ReturnType<typeof machineGroupCode>>; family: NonNullable<ReturnType<typeof machineFamilyForType>>; divisionId: string }>();
  for (const type of state.types) {
    if (isExcludedMachineType(String(type.code))) continue;
    const sub = get('subcategories', type.subcategoryId);
    const category = get('categories', sub?.categoryId);
    if (!mainCategory(category)) continue;
    const group = categoryGroup(category!, type);
    if (!group || group === KEEP) continue;
    const family = machineFamilyForType(group, String(type.code));
    if (!family) throw new Error(`Unknown machine type ${group}/${type.code} (${type.id}); taxonomy migration aborted`);
    const divisionId = String(type.divisionId ?? category!.divisionId ?? divisionForGroup(group));
    if (!divisionId) throw new Error(`Missing division for machine type ${type.id}`);
    targets.set(type.id, { type, category: category!, group, family, divisionId });
  }
  // A scoped machine model without an unambiguous mapped type must never be silently skipped.
  for (const model of state.models) {
    const category = get('categories', model.categoryId);
    const group = machineGroupCode(String(get('groups', model.productGroupId)?.code ?? ''));
    if (!group || group === KEEP || !mainCategory(category) || isExcludedMachineType(String(get('types', model.productTypeId)?.code ?? ''))) continue;
    const target = targets.get(String(model.productTypeId));
    if (!target || target.group !== group) throw new Error(`Unmapped machine model ${model.id}; taxonomy migration aborted`);
  }
  // Production has historical main branches and case-variant families. Choose
  // one active main parent per concrete division, keeping every original code/ID.
  const referencedMainCategories = new Set([...targets.values()].map(target => target.category.id));
  for (const target of targets.values()) {
    const candidates = state.categories.filter(row => mainCategory(row) && (row.isActive !== false || referencedMainCategories.has(row.id))
      && (!row.divisionId || row.divisionId === target.divisionId)
      && (!row.productGroupId || machineGroupCode(String(get('groups', row.productGroupId)?.code ?? '')) === target.group));
    const scoped = candidates.filter(row => row.divisionId === target.divisionId);
    if (scoped.length > 1) throw new Error(`Ambiguous main category for ${target.group}`);
    if (scoped[0]) target.category = scoped[0];
  }
  const scopes = new Map<string, { category: Row; group: keyof typeof MACHINE_FAMILIES; divisionId: string }>();
  for (const target of targets.values()) scopes.set(`${target.divisionId}:${target.category.id}`, target);
  for (const category of state.categories.filter(row => mainCategory(row) && row.isActive !== false)) {
    const group = categoryGroup(category);
    if (group && group !== KEEP && category.divisionId) scopes.set(`${category.divisionId}:${category.id}`, { category, group, divisionId: String(category.divisionId) });
  }
  const familyIds = new Map<string, string>();
  for (const scope of scopes.values()) {
    const { category, group, divisionId } = scope;
    if (category.divisionId) change('categories', category, { name: machineCategoryLabel(group), isActive: true });
    for (const [sortOrder, family] of MACHINE_FAMILIES[group].entries()) {
      const matches = next.subcategories.filter(row => row.divisionId === divisionId && String(row.code).toUpperCase() === family.code.toUpperCase());
      if (matches.some(row => row.categoryId && !mainCategory(get('categories', row.categoryId)))) {
        throw new Error(`Family ${family.code} has conflicting category in division ${divisionId}`);
      }
      // Prefer the concrete main parent, then canonical uppercase code; duplicates
      // remain available for rollback and are deactivated only after references move.
      matches.sort((a, b) => Number(b.categoryId === category.id) - Number(a.categoryId === category.id)
        || Number(b.code === family.code) - Number(a.code === family.code) || a.id.localeCompare(b.id));
      let sub = matches[0];
      if (!sub) {
        sub = { id: newId(), code: family.code, name: family.label, divisionId, categoryId: category.id, isActive: true, sortOrder };
        next.subcategories.push(sub);
        changes.push({ table: 'subcategories', id: sub.id, before: null, after: { ...sub } });
      } else {
        const original = get('subcategories', sub.id);
        if (original) change('subcategories', original, { name: family.label, categoryId: category.id, isActive: true, sortOrder });
      }
      familyIds.set(`${divisionId}:${category.id}:${family.code}`, sub.id);
    }
  }
  const oldSubIds = new Set<string>();
  for (const target of targets.values()) {
    const { type, category, family, divisionId } = target;
    if (type.subcategoryId) oldSubIds.add(String(type.subcategoryId));
    const sub = { id: familyIds.get(`${divisionId}:${category.id}:${family.code}`)! };
    change('types', type, { subcategoryId: sub.id });
    for (const model of state.models.filter(row => row.productTypeId === type.id)) {
      if (model.categoryId && !mainCategory(get('categories', model.categoryId))) continue;
      change('models', model, { subcategoryId: sub.id, categoryId: category.id });
    }
  }
  const movedSubIds = new Set([...oldSubIds].filter(id => changes.some(c => c.table === 'types' && c.before?.subcategoryId === id)));
  const ruleOwners = new Set(state.rules.filter(r => !r.deletedAt && movedSubIds.has(String(r.subcategoryId)))
    .map(r => `${r.tenantId}:${r.productModelId}`));
  for (const owner of ruleOwners) {
    const rules = state.rules.filter(r => !r.deletedAt && `${r.tenantId}:${r.productModelId}` === owner);
    const allowedSubs = values(rules, 'subcategoryId');
    const allowedTypes = values(rules, 'productTypeId');
    const typeIds = state.types.filter(type => allowedSubs.has(type.subcategoryId)
      && (!allowedTypes.size || allowedTypes.has(type.id))).map(type => type.id);
    if (!typeIds.length) throw new Error(`Compatibility ${owner} has no exact type intersection; migration aborted`);
    const first = rules[0]!;
    const replacement: Row[] = [];
    for (const dimension of dimensions.filter(d => d !== 'subcategoryId' && d !== 'productTypeId')) {
      for (const value of values(rules, dimension)) replacement.push({ id: newId(), tenantId: first.tenantId, productModelId: first.productModelId,
        productGroupId: null, categoryId: null, subcategoryId: null, productTypeId: null, brandId: null, deletedAt: null, [dimension]: value });
    }
    for (const typeId of typeIds) replacement.push({ id: newId(), tenantId: first.tenantId, productModelId: first.productModelId,
      productGroupId: null, categoryId: null, subcategoryId: null, productTypeId: typeId, brandId: null, deletedAt: null });
    for (const model of state.models.filter(m => m.tenantId === first.tenantId && !m.deletedAt)) {
      const afterModel = next.models.find(m => m.id === model.id)!;
      if (matchesOptionalCompatibility(rules as any, model as any) !== matchesOptionalCompatibility(replacement as any, afterModel as any)) {
        throw new Error(`Compatibility would change for equipment ${first.productModelId}, machine ${model.id}; migration aborted`);
      }
    }
    for (const rule of rules) change('rules', rule, { deletedAt: new Date().toISOString() });
    for (const rule of replacement) {
      next.rules.push(rule);
      changes.push({ table: 'rules', id: rule.id, before: null, after: rule });
    }
  }
  const canonicalSubIds = new Set(familyIds.values());
  const affectedCategoryIds = new Set([...scopes.values()].map(scope => scope.category.id));
  const obsoleteSubIds = new Set([...movedSubIds, ...state.subcategories
    .filter(row => row.isActive !== false && affectedCategoryIds.has(String(row.categoryId))
      && !canonicalSubIds.has(row.id)
      && (!row.divisionId || [...scopes.values()].some(scope => scope.category.id === row.categoryId && scope.divisionId === row.divisionId)))
    .map(row => row.id)]);
  for (const id of obsoleteSubIds) {
    if (next.types.some(t => t.subcategoryId === id) || next.models.some(m => m.subcategoryId === id)
      || next.rules.some(r => !r.deletedAt && r.subcategoryId === id)) continue;
    const row = get('subcategories', id)!;
    change('subcategories', row, { isActive: false });
  }
  return changes;
}

async function readState(db: DbClient): Promise<TaxonomyState> {
  return { categories: await db.select().from(s.productCategories), subcategories: await db.select().from(s.productSubcategories),
    types: await db.select().from(s.productTypes), models: await db.select().from(s.productModels),
    rules: await db.select().from(s.productOptionalEquipmentCompatibilities), groups: await db.select().from(s.productGroups),
    divisions: await db.select().from(s.divisions) };
}

const snapshotDdl = sql`CREATE TABLE IF NOT EXISTS public.__machine_taxonomy_snapshots (
  migration_id text PRIMARY KEY, changes jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), rolled_back_at timestamptz
)`;
async function writeChange(db: DbClient, change: TaxonomyChange, restoring = false) {
  const table = tables[change.table];
  const row = restoring ? change.before : change.after;
  if (!row) { await db.delete(table).where(eq(table.id, change.id)); return; }
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    (key === 'deletedAt' || key === 'createdAt' || key === 'updatedAt') && typeof value === 'string' ? new Date(value) : value]));
  const { id: _id, ...patch } = normalized;
  // Preserve PostgreSQL microseconds: JS Date only retains milliseconds.
  // Audit timestamps never change in this reconciliation, including rollback.
  if ('updatedAt' in patch) patch.updatedAt = sql`${table.updatedAt}`;
  if (!restoring && !change.before) {
    const [persisted] = await db.insert(table).values(normalized as any).returning();
    if (!persisted) throw new Error(`Missing persisted taxonomy row: ${change.table}/${change.id}`);
    // Snapshot database defaults as well: rollback must detect a later description,
    // soft deletion or audit edit before deleting a newly created family/rule.
    change.after = JSON.parse(JSON.stringify(persisted)) as Row;
  } else await db.update(table).set(patch as any).where(eq(table.id, change.id));
}

/** Runner owns the transaction; locks keep edits out between preflight and reconciliation. */
export async function up(db: DbClient): Promise<void> {
  await db.execute(snapshotDdl);
  await db.execute(sql`LOCK TABLE product_categories, product_subcategories, product_types, product_models,
    product_optional_equipment_compatibilities, product_groups, divisions IN SHARE ROW EXCLUSIVE MODE`);
  const previous = await db.execute(sql`SELECT migration_id FROM public.__machine_taxonomy_snapshots WHERE migration_id = ${ID} AND rolled_back_at IS NULL`);
  if (previous.rows.length) return;
  const changes = planMachineTaxonomy(await readState(db));
  for (const change of changes) await writeChange(db, change);
  await db.execute(sql`INSERT INTO public.__machine_taxonomy_snapshots (migration_id, changes) VALUES (${ID}, ${JSON.stringify(changes)}::jsonb)
    ON CONFLICT (migration_id) DO UPDATE SET changes = excluded.changes, applied_at = now(), rolled_back_at = NULL`);
}

/** Run inside a transaction. Refuses to overwrite edits made since migration. */
export async function down(db: DbClient): Promise<void> {
  await db.execute(snapshotDdl);
  await db.execute(sql`LOCK TABLE product_categories, product_subcategories, product_types, product_models,
    product_optional_equipment_compatibilities, product_groups, divisions IN SHARE ROW EXCLUSIVE MODE`);
  const result = await db.execute(sql`SELECT changes FROM public.__machine_taxonomy_snapshots WHERE migration_id = ${ID} AND rolled_back_at IS NULL FOR UPDATE`);
  if (!result.rows.length) return;
  const changes = result.rows[0]!.changes as TaxonomyChange[];
  const state = await readState(db);
  assertRollbackSafe(state, changes);
  for (const change of [...changes].reverse()) await writeChange(db, change, true);
  await db.execute(sql`UPDATE public.__machine_taxonomy_snapshots SET rolled_back_at = now() WHERE migration_id = ${ID}`);
  await db.execute(sql`DELETE FROM public.__data_migrations WHERE id = ${ID}`);
}

export function assertRollbackSafe(state: TaxonomyState, changes: TaxonomyChange[]): void {
  for (const change of changes.filter(c => c.table === 'subcategories' && !c.before)) {
    for (const table of ['types', 'models', 'rules'] as const) {
      if (state[table].some(row => row.subcategoryId === change.id && !changes.some(c => c.table === table && c.id === row.id))) {
        throw new Error(`Rollback blocked by new reference: ${table}/${change.id}`);
      }
    }
  }
  for (const change of changes) {
    const row = state[change.table].find(r => r.id === change.id);
    if (!row || Object.entries(change.after).some(([key, value]) => {
      const actual = row[key] instanceof Date ? (row[key] as Date).toISOString() : row[key];
      return actual !== value;
    })) throw new Error(`Rollback blocked by subsequent edit: ${change.table}/${change.id}`);
  }
}
