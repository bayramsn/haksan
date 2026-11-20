import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { LASER_MODELS, LASER_POWERS, laserBaseFamilyCode, laserTechnicalConfigurationSchema, type LaserBaseConfiguration } from '@haksan/shared';
import type { DbClient } from '../client';
import * as s from '../schema';

const ID = '024_laser_series_base_models';
const ddl = sql`CREATE TABLE IF NOT EXISTS public.__laser_base_snapshots (migration_id text PRIMARY KEY, changes jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), rolled_back_at timestamptz)`;
type Change = { table: 'models' | 'sets' | 'values'; id: string; before: Record<string, unknown> | null; after: Record<string, unknown> };
const tables = { models: s.productModels, sets: s.productOptionSets, values: s.productOptionValues };
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

/** Source profiles remain internal; selling cards become one per series/brand. No quote rows are changed. */
export async function up(db: DbClient, tenantId?: string): Promise<void> {
  await db.execute(ddl);
  await db.execute(sql`LOCK TABLE product_models, product_option_sets, product_option_values IN SHARE ROW EXCLUSIVE MODE`);
  const done = await db.execute(sql`SELECT 1 FROM public.__laser_base_snapshots WHERE migration_id = ${ID} AND rolled_back_at IS NULL`);

  const products = await db.select().from(s.productModels).where(and(isNull(s.productModels.deletedAt), tenantId ? eq(s.productModels.tenantId, tenantId) : undefined));
  const groups = new Map<string, typeof products>();
  for (const product of products) {
    if (product.catalogHidden || product.laserBaseConfiguration || !product.technicalConfiguration) continue;
    const parsed = laserTechnicalConfigurationSchema.safeParse(product.technicalConfiguration);
    if (!parsed.success) throw new Error(`Invalid laser source configuration: ${product.id}`);
    const model = LASER_MODELS.find(m => m.code === parsed.data.selection.sourceModelCode);
    if (!model || model.series !== parsed.data.selection.series) throw new Error(`Unmapped laser source model: ${product.id}`);
    const key = `${product.tenantId}:${product.brandId}:${laserBaseFamilyCode(model)}`;
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  // Public AORE catalog already has series cards. Attach configurable metadata in place.
  for (const product of products) {
    if (product.catalogHidden || product.laserBaseConfiguration || product.technicalConfiguration) continue;
    const label = product.modelName ?? product.fullName;
    const match = label.match(/^(?:AORE\s+)?([A-Z]{1,3})(?:\s+Serisi)$/i);
    if (!match || !product.productTypeId) continue;
    const brand = await db.query.brands.findFirst({ where: eq(s.brands.id, product.brandId) });
    if (!/^(?:AORE|HEX\s?LASER)$/i.test(brand?.name ?? '')) continue;
    if (!/fiber|laser|lazer/i.test(String((await db.query.productTypes.findFirst({ where: eq(s.productTypes.id, product.productTypeId!) }))?.code ?? ''))) continue;
    const familyCode = match[1]!.toUpperCase();
    if (!LASER_MODELS.some(model => laserBaseFamilyCode(model) === familyCode)) continue;
    const key = `${product.tenantId}:${product.brandId}:${familyCode}`;
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  if (!groups.size && done.rows.length) return;
  const saved = await db.execute(sql`SELECT changes FROM public.__laser_base_snapshots WHERE migration_id = ${ID} AND rolled_back_at IS NULL`);
  const changes: Change[] = saved.rows.length ? saved.rows[0]!.changes as Change[] : [];
  const capture = (table: Change['table'], before: unknown, after: { id: string }) => changes.push({ table, id: after.id, before: before ? json(before) : null, after: json(after) });
  for (const sources of groups.values()) {
    const first = sources.find(row => !row.technicalConfiguration) ?? sources[0]!;
    if (sources.some(row => row.productGroupId !== first.productGroupId || row.categoryId !== first.categoryId || row.productTypeId !== first.productTypeId || row.currencyId !== first.currencyId)) throw new Error(`Ambiguous laser family taxonomy/currency: ${first.id}`);
    const selection = first.technicalConfiguration?.selection ?? (() => {
      const family = (first.modelName ?? first.fullName).match(/([A-Z]{1,3})\s+Serisi/i)![1]!.toUpperCase();
      const model = LASER_MODELS.find(m => laserBaseFamilyCode(m) === family)!;
      return { series: model.series, sourceModelCode: model.code, productTypeCode: model.productTypeCode };
    })();
    const familyCode = laserBaseFamilyCode({ series: selection.series, code: selection.sourceModelCode });
    const models = LASER_MODELS.filter(model => laserBaseFamilyCode(model) === familyCode);
    const baseConfiguration: LaserBaseConfiguration = { familyCode, series: selection.series, productTypeCode: selection.productTypeCode, sourceModelCodes: models.map(model => model.code) };
    const code = `LASER-BASE-${familyCode}-${first.brandId.slice(0, 8)}`;
    // Generated codes are immutable and tenant-unique, including soft archived rows.
    const holder = await db.query.productModels.findFirst({ where: and(eq(s.productModels.tenantId, first.tenantId), eq(s.productModels.modelCode, code)) });
    if (holder) throw new Error(`Laser base code already exists: ${code}`);
    const name = `${familyCode === 'GR_PRO' ? 'GR Pro' : familyCode} Serisi`;
    const [base] = !first.technicalConfiguration
      ? await db.update(s.productModels).set({ laserBaseConfiguration: baseConfiguration, updatedAt: sql`${s.productModels.updatedAt}` }).where(eq(s.productModels.id, first.id)).returning()
      : await db.insert(s.productModels).values({
      tenantId: first.tenantId, brandId: first.brandId, series: selection.series,
      productGroupId: first.productGroupId, categoryId: first.categoryId, subcategoryId: first.subcategoryId, productTypeId: first.productTypeId,
      supplierCompanyId: first.supplierCompanyId, currencyId: first.currencyId, vatRate: first.vatRate,
      modelCode: code, modelName: name, fullName: name, imageUrl: first.imageUrl,
      description: 'Baz seri modeli. Tabla/kapasite, lazer gücü ve kabin opsiyonel donanımlardan seçilir. Baz fiyat ve opsiyon farkları ayrıca tanımlanmalıdır.',
      laserBaseConfiguration: baseConfiguration, technicalConfiguration: null, listPrice: null, cashPrice: null,
    }).returning();
    capture('models', !first.technicalConfiguration ? first : null, base!);
    for (const [index, kind] of (['table', 'power', 'cabin'] as const).entries()) {
      const [set] = await db.insert(s.productOptionSets).values({ tenantId: first.tenantId, productModelId: base!.id, configurationKind: kind, name: kind === 'table' ? (selection.productTypeCode === 'BORU_LAZER_KESIM' ? 'Boru kapasitesi / uzunluk' : 'Tabla Boyutu') : kind === 'power' ? 'Rezonatör Gücü' : 'Kabin', sortOrder: index }).returning();
      capture('sets', null, set!);
      const choices = kind === 'table' ? models.map(model => ({ value: `${model.code} · ${model.sizeLabel}`, sourceModelCode: model.code }))
        : kind === 'power' ? LASER_POWERS.filter(power => models.some(m => power >= m.powerMin && power <= m.powerMax)).map(powerKw => ({ value: `${powerKw} kW`, powerKw }))
        : [{ value: 'Açık Kabin', cabinType: 'open' as const }, { value: 'Kapalı Kabin', cabinType: 'closed' as const }];
      for (const [sortOrder, choice] of choices.entries()) {
        const [value] = await db.insert(s.productOptionValues).values({ tenantId: first.tenantId, optionSetId: set!.id, ...choice, currencyId: first.currencyId, priceDelta: null, sortOrder }).returning();
        capture('values', null, value!);
      }
    }
    for (const source of sources) {
      if (source.id === base!.id) continue;
      const [archived] = await db.update(s.productModels).set({ catalogHidden: true, updatedAt: sql`${s.productModels.updatedAt}` }).where(eq(s.productModels.id, source.id)).returning();
      capture('models', source, archived!);
    }
  }
  await db.execute(sql`INSERT INTO public.__laser_base_snapshots (migration_id, changes) VALUES (${ID}, ${JSON.stringify(changes)}::jsonb) ON CONFLICT (migration_id) DO UPDATE SET changes = excluded.changes, applied_at = now(), rolled_back_at = NULL`);
}

/** Refuses to remove edited bases/options or products referenced after consolidation. Run in one transaction. */
export async function down(db: DbClient): Promise<void> {
  await db.execute(ddl);
  await db.execute(sql`LOCK TABLE product_models, product_option_sets, product_option_values, quote_items, inventory_items IN SHARE ROW EXCLUSIVE MODE`);
  const result = await db.execute(sql`SELECT changes FROM public.__laser_base_snapshots WHERE migration_id = ${ID} AND rolled_back_at IS NULL FOR UPDATE`);
  if (!result.rows.length) return;
  const changes = result.rows[0]!.changes as Change[];
  const references = await db.execute(sql`SELECT n.nspname AS schema, c.relname AS table, a.attname AS column FROM pg_constraint f
    JOIN pg_class c ON c.oid = f.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = f.conkey[1]
    WHERE f.contype = 'f' AND f.confrelid = 'product_models'::regclass AND array_length(f.conkey, 1) = 1`);
  for (const change of changes) {
    const table = tables[change.table];
    const [current] = await db.select().from(table).where(eq(table.id, change.id));
    if (!isDeepStrictEqual(json(current), change.after)) throw new Error(`Laser rollback blocked by subsequent edit: ${change.table}/${change.id}`);
    if (!change.before && change.table === 'models') {
      for (const reference of references.rows as Array<{ schema: string; table: string; column: string }>) {
        const expectedIds = reference.table === 'product_option_sets' ? changes.filter(c => c.table === 'sets').map(c => c.id) : [];
        const refRows = await db.execute(sql`SELECT id FROM ${sql.identifier(reference.schema)}.${sql.identifier(reference.table)} WHERE ${sql.identifier(reference.column)} = ${change.id}`);
        if (refRows.rows.some(row => !expectedIds.includes(String(row.id)))) throw new Error(`Laser rollback blocked by new reference: ${reference.table}/${change.id}`);
      }
      const refs = await db.execute(sql`SELECT 1 FROM quote_items WHERE product_model_id = ${change.id} UNION ALL SELECT 1 FROM inventory_items WHERE product_model_id = ${change.id} LIMIT 1`);
      if (refs.rows.length) throw new Error(`Laser rollback blocked by new commercial reference: ${change.id}`);
      const sets = await db.select({ id: s.productOptionSets.id }).from(s.productOptionSets).where(eq(s.productOptionSets.productModelId, change.id));
      if (sets.some(set => !changes.some(c => c.table === 'sets' && c.id === set.id))) throw new Error(`Laser rollback blocked by new option group: ${change.id}`);
    }
    if (!change.before && change.table === 'sets') {
      const values = await db.select({ id: s.productOptionValues.id }).from(s.productOptionValues).where(eq(s.productOptionValues.optionSetId, change.id));
      if (values.some(value => !changes.some(c => c.table === 'values' && c.id === value.id))) throw new Error(`Laser rollback blocked by new option value: ${change.id}`);
    }
  }
  for (const change of [...changes].reverse()) {
    const table = tables[change.table];
    if (!change.before) await db.delete(table).where(eq(table.id, change.id));
    else {
      // Archival changed one boolean only. Preserve exact database timestamp precision.
      await db.update(s.productModels).set({ catalogHidden: Boolean(change.before.catalogHidden), laserBaseConfiguration: change.before.laserBaseConfiguration as LaserBaseConfiguration | null, updatedAt: sql`${s.productModels.updatedAt}` }).where(eq(s.productModels.id, change.id));
    }
  }
  await db.execute(sql`UPDATE public.__laser_base_snapshots SET rolled_back_at = now() WHERE migration_id = ${ID}`);
  await db.execute(sql`DELETE FROM public.__data_migrations WHERE id = ${ID}`);
}
