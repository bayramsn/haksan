import { describe, expect, it } from 'vitest';
import { assertRollbackSafe, planMachineTaxonomy, type TaxonomyChange, type TaxonomyState } from '../src/db/data-migrations/023_consolidate_machine_taxonomy';
import { matchesOptionalCompatibility } from '../src/modules/products/optional-compatibility';

function fixture(): TaxonomyState {
  return {
    divisions: [{ id: 'division', code: 'universal' }], groups: [{ id: 'group', code: 'UNIVERSAL', divisionId: 'division' }],
    categories: [{ id: 'category', code: 'TEZGAH', name: 'Tezgah', divisionId: 'division', productGroupId: 'group' }],
    subcategories: [{ id: 'radial', code: 'OLD_RADIAL', name: 'Radyal', divisionId: 'division', categoryId: 'category', isActive: true },
      { id: 'drill', code: 'OLD_DRILL', name: 'Matkap', divisionId: 'division', categoryId: 'category', isActive: true }],
    types: [{ id: 'radial-type', code: 'RADYAL_MATKAP', divisionId: 'division', subcategoryId: 'radial' },
      { id: 'drill-type', code: 'HM_UNIVERSAL_SUTUNLU_MATKAP_TEZGAHLARI', divisionId: 'division', subcategoryId: 'drill' }],
    models: [{ id: 'radial-model', tenantId: 'tenant', productGroupId: 'group', categoryId: 'category', subcategoryId: 'radial', productTypeId: 'radial-type', brandId: 'brand', listPrice: '100', fullName: 'Radial' },
      { id: 'drill-model', tenantId: 'tenant', productGroupId: 'group', categoryId: 'category', subcategoryId: 'drill', productTypeId: 'drill-type', brandId: 'brand', listPrice: '200' }],
    rules: [{ id: 'rule', tenantId: 'tenant', productModelId: 'equipment', productGroupId: null, categoryId: null, subcategoryId: 'radial', productTypeId: null, brandId: null, deletedAt: null }],
  };
}
function apply(state: TaxonomyState, changes: TaxonomyChange[]): TaxonomyState {
  const next = structuredClone(state);
  for (const change of changes) {
    const row = next[change.table].find(r => r.id === change.id);
    if (row) Object.assign(row, change.after); else next[change.table].push({ ...change.after });
  }
  return next;
}
function plan(state: TaxonomyState) {
  let i = 0;
  return planMachineTaxonomy(state, () => `new-${++i}`);
}

describe('machine taxonomy migration preflight and reconciliation', () => {
  it('consolidates drill families, preserves model details and IDs, deactivates unused old subcategories', () => {
    const state = fixture(); const next = apply(state, plan(state));
    expect(next.categories[0]?.name).toBe('Üniversal Tezgahlar');
    expect(next.types.map(t => t.id)).toEqual(state.types.map(t => t.id));
    expect(new Set(next.types.map(t => t.subcategoryId)).size).toBe(1);
    expect(next.models[0]?.listPrice).toBe('100');
    expect(next.models[0]?.fullName).toBe('Radial');
    expect(next.subcategories.filter(s => ['radial', 'drill'].includes(s.id)).every(s => !s.isActive)).toBe(true);
    expect(plan(next)).toEqual([]);
  });
  it('consolidates audited legacy machine category codes without changing their IDs or codes', () => {
    const state = fixture(); state.categories[0]!.code = 'universal_machine';
    const next = apply(state, plan(state));
    expect(next.categories[0]!.code).toBe('universal_machine');
    expect(next.categories[0]!.id).toBe('category');
    expect(next.categories[0]!.name).toBe('Üniversal Tezgahlar');
    expect(new Set(next.types.map(t => t.subcategoryId)).size).toBe(1);
    state.types[0]!.code = 'UNKNOWN_LEGACY_TYPE';
    expect(() => plan(state)).toThrow('Unknown machine type');
  });
  it('fails on unknown scoped machine types without any changes', () => {
    const state = fixture(); state.types[0]!.code = 'UNKNOWN_CUSTOM_MACHINE';
    expect(() => plan(state)).toThrow('Unknown machine type');
    expect(state.categories[0]?.name).toBe('Tezgah');
  });
  it('keeps old optional compatibility sets exact when two old subcategories merge', () => {
    const state = fixture(); const next = apply(state, plan(state));
    const rules = next.rules.filter(r => !r.deletedAt);
    expect(rules.every(r => !r.subcategoryId)).toBe(true);
    expect(rules.map(r => r.productTypeId)).toEqual(['radial-type']);
    expect(matchesOptionalCompatibility(rules as any, next.models[0] as any)).toBe(true);
    expect(matchesOptionalCompatibility(rules as any, next.models[1] as any)).toBe(false);
  });
  it('intersects an existing type constraint and retains brand restrictions', () => {
    const state = fixture();
    state.rules.push({ ...state.rules[0]!, id: 'brand-rule', subcategoryId: null, brandId: 'brand' },
      { ...state.rules[0]!, id: 'type-rule', subcategoryId: null, productTypeId: 'radial-type' });
    const next = apply(state, plan(state));
    const rules = next.rules.filter(r => !r.deletedAt);
    expect(rules.some(r => r.brandId === 'brand')).toBe(true);
    expect(rules.filter(r => r.productTypeId).map(r => r.productTypeId)).toEqual(['radial-type']);
    expect(matchesOptionalCompatibility(rules as any, { ...next.models[0], brandId: 'different' } as any)).toBe(false);
  });
  it('rejects losing compatibility for an untyped model', () => {
    const state = fixture();
    state.models.push({ ...state.models[0]!, id: 'untyped', productGroupId: null, categoryId: null, productTypeId: null });
    expect(() => plan(state)).toThrow('Compatibility would change');
  });
  it('leaves excluded non-machine categories untouched', () => {
    const state = fixture();
    state.categories.push({ id: 'welding', code: 'HM_KAYNAK_TEZGAH', divisionId: 'division', name: 'Tezgah' });
    state.subcategories.push({ id: 'welding-sub', code: 'WELDING', categoryId: 'welding', isActive: true });
    state.types.push({ id: 'welding-type', code: 'UNMAPPED_WELDER', subcategoryId: 'welding-sub' });
    const next = apply(state, plan(state));
    expect(next.categories.find(r => r.id === 'welding')).toEqual(state.categories.find(r => r.id === 'welding'));
    expect(next.types.find(r => r.id === 'welding-type')).toEqual(state.types.find(r => r.id === 'welding-type'));
  });
  it('deactivates empty obsolete scoped and shared subcategories while retaining referenced and excluded ones', () => {
    const state = fixture();
    state.categories.push({ id: 'inactive-category', code: 'CNC_MACHINE', divisionId: 'division', isActive: false });
    state.subcategories.push({ id: 'inactive-category-sub', code: 'LEGACY_EMPTY', divisionId: 'division', categoryId: 'inactive-category', isActive: true }, { id: 'old-empty', code: 'KAYIK', name: 'Kayık', divisionId: null, categoryId: 'category', isActive: true },
      { id: 'old-scoped-empty', code: 'OLD_EMPTY', divisionId: 'division', categoryId: 'category', isActive: true },
      { id: 'other-division', code: 'OTHER_SCOPE', divisionId: 'other-division', categoryId: 'category', isActive: true },
      { id: 'referenced-empty', code: 'OTHER_REF', divisionId: 'division', categoryId: 'category', isActive: true },
      { id: 'excluded-empty', code: 'WELDING', divisionId: 'division', categoryId: 'welding', isActive: true });
    state.models.push({ id: 'untyped-excluded', categoryId: null, subcategoryId: 'referenced-empty', productGroupId: null, productTypeId: null });
    const next = apply(state, plan(state));
    expect(next.subcategories.find(s => s.id === 'old-empty')!.isActive).toBe(false);
    expect(next.subcategories.find(s => s.id === 'old-scoped-empty')!.isActive).toBe(false);
    for (const id of ['other-division', 'referenced-empty', 'excluded-empty', 'inactive-category-sub']) {
      expect(next.subcategories.find(s => s.id === id)!.isActive).toBe(true);
    }
  });
  it('creates all agreed families and reuses case-insensitive existing family codes', () => {
    const state = fixture();
    state.subcategories.push({ id: 'existing-family', code: 'matkap', name: 'Eski', divisionId: 'division', categoryId: 'category', isActive: false, sortOrder: 99 });
    const next = apply(state, plan(state));
    expect(next.types.every(t => t.subcategoryId === 'existing-family')).toBe(true);
    expect(next.subcategories.filter(s => s.isActive).map(s => s.name)).toEqual(expect.arrayContaining(['Torna', 'Freze', 'Matkap', 'Taşlama', 'Testere', 'Pres', 'Planya', 'EDM']));
    expect(next.subcategories.filter(s => String(s.code).toUpperCase() === 'MATKAP')).toHaveLength(1);
  });
  it('infers global types from exact codes without assigning a wrong shared category group', () => {
    const state = fixture();
    state.categories[0]!.divisionId = null;
    state.categories[0]!.productGroupId = 'shared-cnc-group';
    state.groups.push({ id: 'shared-cnc-group', code: 'CNC', divisionId: 'cnc-division' });
    state.divisions.push({ id: 'cnc-division', code: 'cnc' });
    state.types.forEach(type => { type.divisionId = null; });
    const next = apply(state, plan(state));
    expect(next.types.every(t => next.subcategories.find(s => s.id === t.subcategoryId)?.divisionId === 'division')).toBe(true);
    expect(next.categories[0]!.name).toBe('Tezgah');
  });
  it('consolidates case-variant family records across shared and scoped main parents', () => {
    const state = fixture();
    state.categories.push({ id: 'shared-cat', code: 'TEZGAH', divisionId: null, productGroupId: null, isActive: true });
    state.subcategories.push({ id: 'canonical', code: 'MATKAP', name: 'Old', divisionId: 'division', categoryId: 'category', isActive: true },
      { id: 'case-duplicate', code: 'matkap', name: 'Other', divisionId: 'division', categoryId: 'shared-cat', isActive: true });
    state.types[0]!.subcategoryId = 'case-duplicate'; state.models[0]!.subcategoryId = 'case-duplicate'; state.models[0]!.categoryId = 'shared-cat';
    state.rules = [];
    const next = apply(state, plan(state));
    expect(next.types.every(t => t.subcategoryId === 'canonical')).toBe(true);
    expect(next.models.every(m => m.categoryId === 'category')).toBe(true);
    expect(next.subcategories.find(s => s.id === 'case-duplicate')!.isActive).toBe(false);
    expect(plan(next)).toEqual([]);
  });
  it('preserves explicitly excluded legacy welding and cleaning types under a main category', () => {
    const state = fixture();
    for (const code of ['FIBER_LAZER_KAYNAK', 'LAZER_TEMIZLEME']) {
      state.subcategories.push({ id: code, code, categoryId: 'category', divisionId: 'division', isActive: true });
      state.types.push({ id: code, code, subcategoryId: code, divisionId: 'division' });
      state.models.push({ id: code, tenantId: 'tenant', categoryId: 'category', subcategoryId: code, productTypeId: code, productGroupId: 'group' });
    }
    const next = apply(state, plan(state));
    expect(next.types.slice(-2)).toEqual(state.types.slice(-2));
    expect(next.models.slice(-2)).toEqual(state.models.slice(-2));
    expect(plan(next)).toEqual([]);
  });
  it('reactivates a referenced scoped main category and chooses it consistently over the shared branch', () => {
    const state = fixture(); state.categories[0]!.isActive = false;
    state.categories.push({ id: 'shared-cat', code: 'TEZGAH', divisionId: null, productGroupId: null, isActive: true });
    state.subcategories[0]!.categoryId = 'shared-cat';
    state.models[0]!.categoryId = 'shared-cat';
    const next = apply(state, plan(state));
    expect(next.categories[0]!.isActive).toBe(true);
    expect(next.models.every(m => m.categoryId === 'category')).toBe(true);
    expect(next.subcategories.filter(s => s.isActive).every(s => s.categoryId === 'category')).toBe(true);
    expect(plan(next)).toEqual([]);
  });
  it('records original audit timestamps and guards their exact roundtrip', () => {
    const state = fixture();
    const timestamp = new Date('2025-01-01T10:00:00.000Z');
    for (const table of ['categories', 'subcategories', 'types', 'models', 'rules'] as const) {
      state[table].forEach(row => { row.updatedAt = timestamp; });
    }
    const changes = plan(state);
    for (const change of changes.filter(c => c.before)) {
      expect(change.before!.updatedAt).toBe(timestamp.toISOString());
      expect(change.after.updatedAt).toBe(timestamp.toISOString());
    }
    const next = apply(state, changes);
    // PostgreSQL reads timestamp fields as Date objects after persistence.
    for (const table of ['categories', 'subcategories', 'types', 'models', 'rules'] as const) {
      next[table].forEach(row => { if (typeof row.updatedAt === 'string') row.updatedAt = new Date(row.updatedAt); });
    }
    expect(() => assertRollbackSafe(next, changes)).not.toThrow();
    next.models[0]!.updatedAt = new Date('2026-01-01T10:00:00.000Z');
    expect(() => assertRollbackSafe(next, changes)).toThrow('Rollback blocked');
  });
  it('guards persisted defaults on newly inserted rows before deleting them on rollback', () => {
    const state = fixture(); const changes = plan(state); const next = apply(state, changes);
    const inserted = changes.find(c => c.table === 'subcategories' && !c.before)!;
    // writeChange replaces an insertion payload with its full persisted row.
    inserted.after = { ...inserted.after, description: null, createdAt: '2025-01-01T10:00:00.000Z', updatedAt: '2025-01-01T10:00:00.000Z' };
    Object.assign(next.subcategories.find(r => r.id === inserted.id)!, inserted.after);
    expect(() => assertRollbackSafe(next, changes)).not.toThrow();
    next.subcategories.find(r => r.id === inserted.id)!.description = 'Later administrator note';
    expect(() => assertRollbackSafe(next, changes)).toThrow('Rollback blocked');
  });
  it('blocks rollback when a later reference would be cascaded or orphaned', () => {
    const state = fixture(); const changes = plan(state); const next = apply(state, changes);
    next.rules.push({ id: 'later-rule', subcategoryId: next.types[0]!.subcategoryId });
    expect(() => assertRollbackSafe(next, changes)).toThrow('Rollback blocked by new reference');
  });
  it('restores prior links from snapshot and rejects subsequent edits', () => {
    const state = fixture(); const changes = plan(state); const next = apply(state, changes);
    expect(() => assertRollbackSafe(next, changes)).not.toThrow();
    const restored = structuredClone(next);
    for (const change of [...changes].reverse()) {
      if (!change.before) restored[change.table] = restored[change.table].filter(r => r.id !== change.id);
      else Object.assign(restored[change.table].find(r => r.id === change.id)!, change.before);
    }
    expect(restored).toEqual(state);
    next.models[0]!.subcategoryId = 'manual-edit';
    expect(() => assertRollbackSafe(next, changes)).toThrow('Rollback blocked');
  });
  it('leaves every existing CNC row untouched', () => {
    const state = fixture();
    state.divisions = [{ id: 'division', code: 'cnc' }];
    state.groups = [{ id: 'group', code: 'CNC', divisionId: 'division' }];
    state.types = [{ id: 'radial-type', code: 'CNC_DIK_ISLEME_MERKEZI', divisionId: 'division', subcategoryId: 'radial' },
      { id: 'drill-type', code: 'CNC_TORNA', divisionId: 'division', subcategoryId: 'drill' }];
    expect(plan(state)).toEqual([]);
  });
});
