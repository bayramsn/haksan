/**
 * Tedarikçi lazer fiyat listesini (FOB USD alış maliyeti) HEX LASER baz kartlarının
 * model × güç matrisine yazar. Önizleme salt-okunurdur; `--apply` yalnız maliyet,
 * konteyner ve üretim süresini günceller, CRM'de girilen satış fiyatına dokunmaz.
 *
 *   node --import tsx src/db/import-laser-price-list.ts --file=<xlsx> [--tenant=<uuid> --apply]
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { HEX2026_REVISION, hexConfigurationForPriceModel, laserOptionCosts, parseLaserPriceList, type LaserBaseConfiguration, type LaserPriceListSheet } from '@haksan/shared';
import { closeDb, getDb, type DbClient } from './client';
import * as s from './schema';
import { cellToText, loadXlsxWorkbook } from '../shared/utils/spreadsheet-import';

export async function readPriceListSheets(buffer: Buffer): Promise<LaserPriceListSheet[]> {
  const workbook = await loadXlsxWorkbook(buffer);
  return workbook.worksheets.map((worksheet) => {
    const rows: string[][] = [];
    for (let r = 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      rows.push(Array.from({ length: worksheet.columnCount }, (_, c) => cellToText(row.getCell(c + 1).value)));
    }
    return { name: worksheet.name, rows };
  });
}

export async function importLaserPriceList(db: DbClient, tenantId: string, buffer: Buffer, apply: boolean) {
  const sourceRevision = `laser-price-list-${createHash('sha256').update(buffer).digest('hex').slice(0, 12)}`;
  const sheets = await readPriceListSheets(buffer);
  const parsed = parseLaserPriceList(sheets);
  const optionCosts = laserOptionCosts(sheets, parsed);
  const bases = await db.select({ id: s.productModels.id, configuration: s.productModels.laserBaseConfiguration })
    .from(s.productModels)
    .where(and(eq(s.productModels.tenantId, tenantId), isNull(s.productModels.deletedAt), sql`${s.productModels.laserBaseConfiguration} ->> 'sourceRevision' = ${HEX2026_REVISION}`));
  const baseBySeries = new Map<string, string>();
  for (const base of bases) {
    const series = (base.configuration as LaserBaseConfiguration | null)?.series;
    if (series && !baseBySeries.has(series)) baseBySeries.set(series, base.id);
  }
  const [usd] = await db.select({ id: s.currencies.id }).from(s.currencies).where(eq(s.currencies.code, 'USD')).limit(1);
  if (!usd) throw new Error('USD para birimi tanımlı değil');

  const unmatched: string[] = [];
  const missingBase = new Set<string>();
  const rows = parsed.prices.flatMap((price) => {
    const hex = hexConfigurationForPriceModel(price.priceModelCode, price.powerKw);
    if (!hex) { unmatched.push(`${price.priceModelCode}@${price.powerKw}kW`); return []; }
    const productModelId = baseBySeries.get(hex.series);
    if (!productModelId) { missingBase.add(hex.series); return []; }
    return [{
      tenantId, productModelId, sourceModelCode: hex.sourceModelCode, priceModelCode: price.priceModelCode,
      powerKw: price.powerKw, costPrice: String(price.costUsd), costCurrencyId: usd.id,
      container: price.container ?? null, leadTimeDays: price.leadTimeDays ?? null,
      sourceRevision, sourceCell: `${price.sheet}!${price.cell}`.slice(0, 64),
    }];
  });

  const existing = await db.select({
    productModelId: s.productConfigurationPrices.productModelId,
    sourceModelCode: s.productConfigurationPrices.sourceModelCode,
    powerKw: s.productConfigurationPrices.powerKw,
    costPrice: s.productConfigurationPrices.costPrice,
  }).from(s.productConfigurationPrices).where(eq(s.productConfigurationPrices.tenantId, tenantId));
  const key = (row: { productModelId: string; sourceModelCode: string; powerKw: number }) => `${row.productModelId}|${row.sourceModelCode}|${Number(row.powerKw)}`;
  const current = new Map(existing.map((row) => [key(row), row.costPrice]));
  const summary = {
    sourceRevision,
    priceCells: parsed.prices.length,
    insert: rows.filter((row) => !current.has(key(row))).length,
    updateCost: rows.filter((row) => current.has(key(row)) && Number(current.get(key(row))) !== Number(row.costPrice)).length,
    unchanged: rows.filter((row) => current.has(key(row)) && Number(current.get(key(row))) === Number(row.costPrice)).length,
    unmatchedModels: [...new Set(unmatched.map((item) => item.split('@')[0]))],
    seriesWithoutBaseCard: [...missingBase],
    accessories: parsed.accessories.length,
    optionCosts: optionCosts.costs.length,
    issues: [...parsed.issues, ...optionCosts.issues],
    applied: false,
  };
  if (!apply || !rows.length) return summary;

  const options = { pricedConfigurationValues: 0, createdPowerValues: 0 };
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.insert(s.productConfigurationPrices).values(row).onConflictDoUpdate({
        target: [s.productConfigurationPrices.productModelId, s.productConfigurationPrices.sourceModelCode, s.productConfigurationPrices.powerKw],
        set: {
          priceModelCode: row.priceModelCode, costPrice: row.costPrice, costCurrencyId: row.costCurrencyId,
          container: row.container, leadTimeDays: row.leadTimeDays, sourceRevision: row.sourceRevision,
          sourceCell: row.sourceCell, deletedAt: null, updatedAt: new Date(),
        },
      });
    }
    // Teklifte model/güç/kabin seçilebilsin: bu seçeneklerin ek fiyatı 0'dır (fiyat matristen gelir)
    // ve güç seçenekleri matristeki güçlerden oluşur. Elle girilmiş ek fiyatlara dokunulmaz.
    for (const productModelId of new Set(rows.map((row) => row.productModelId))) {
      const sets = await tx.select().from(s.productOptionSets).where(and(eq(s.productOptionSets.productModelId, productModelId), eq(s.productOptionSets.tenantId, tenantId), isNull(s.productOptionSets.deletedAt)));
      for (const set of sets.filter((entry) => entry.configurationKind)) {
        const priced = await tx.update(s.productOptionValues).set({ priceDelta: '0', currencyId: usd.id, updatedAt: new Date() })
          .where(and(eq(s.productOptionValues.optionSetId, set.id), isNull(s.productOptionValues.priceDelta), isNull(s.productOptionValues.deletedAt)))
          .returning({ id: s.productOptionValues.id });
        options.pricedConfigurationValues += priced.length;
      }
      const powerSet = sets.find((entry) => entry.configurationKind === 'power');
      if (!powerSet) continue;
      const existingPowers = await tx.select({ powerKw: s.productOptionValues.powerKw }).from(s.productOptionValues)
        .where(and(eq(s.productOptionValues.optionSetId, powerSet.id), isNull(s.productOptionValues.deletedAt)));
      const powers = [...new Set(rows.filter((row) => row.productModelId === productModelId).map((row) => row.powerKw))].sort((a, b) => a - b);
      for (const [sortOrder, powerKw] of powers.entries()) {
        if (existingPowers.some((value) => Number(value.powerKw) === powerKw)) continue;
        await tx.insert(s.productOptionValues).values({ tenantId, optionSetId: powerSet.id, value: `${String(powerKw).replace('.', ',')} kW`, powerKw, priceDelta: '0', currencyId: usd.id, sortOrder });
        options.createdPowerValues++;
      }
    }
  });
  const extras = await db.transaction((tx) => importAccessoriesAndOptions(tx as unknown as DbClient, tenantId, usd.id, sourceRevision, parsed, optionCosts.costs, baseBySeries));
  return { ...summary, ...options, ...extras, applied: true };
}

const slug = (text: string) => text.toLocaleLowerCase('tr-TR')
  .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);

/**
 * PARÇALAR sayfası → HEX LASER aksesuar kartları (Sac İşleme › Aksesuar › Lazer Aksesuarları);
 * pah kesim ve yükleme dipnotları → ilgili baz kartın opsiyonu. Maliyet product_cost_prices'a,
 * satış fiyatı (liste fiyatı / ek fiyat) CRM'de girilir; aktarım satış fiyatına dokunmaz.
 */
async function importAccessoriesAndOptions(
  db: DbClient, tenantId: string, usdId: string, sourceRevision: string,
  parsed: ReturnType<typeof parseLaserPriceList>, optionCosts: ReturnType<typeof laserOptionCosts>['costs'], baseBySeries: Map<string, string>,
) {
  const result = { accessoriesCreated: 0, accessoryCosts: 0, optionValuesCreated: 0, optionCostsWritten: 0, optionCostsSkipped: [] as string[] };
  const upsertCost = async (target: { productModelId: string } | { optionValueId: string }, costUsd: number, sourceCell: string) => {
    const values = { tenantId, ...target, costPrice: String(costUsd), costCurrencyId: usdId, sourceRevision, sourceCell: sourceCell.slice(0, 64) };
    await db.insert(s.productCostPrices).values(values).onConflictDoUpdate({
      target: 'productModelId' in target ? s.productCostPrices.productModelId : s.productCostPrices.optionValueId,
      set: { costPrice: values.costPrice, costCurrencyId: usdId, sourceRevision, sourceCell: values.sourceCell, deletedAt: null, updatedAt: new Date() },
    });
  };

  if (parsed.accessories.length) {
    const [division] = await db.select().from(s.divisions).where(and(eq(s.divisions.tenantId, tenantId), sql`lower(${s.divisions.code}) = 'sac_isleme'`, isNull(s.divisions.deletedAt)));
    const [brand] = await db.select().from(s.brands).where(and(eq(s.brands.tenantId, tenantId), sql`upper(replace(${s.brands.name}, ' ', '')) = 'HEXLASER'`, isNull(s.brands.deletedAt)));
    const [group] = division ? await db.select().from(s.productGroups).where(and(eq(s.productGroups.divisionId, division.id), eq(s.productGroups.code, 'SAC_ISLEME'))) : [];
    if (!division || !brand || !group) throw new Error('Aksesuarlar için Sac İşleme bölümü, SAC_ISLEME grubu ve HEX LASER markası gerekli (önce HEX aktarımını çalıştırın)');
    const [category] = (await db.select().from(s.productCategories).where(and(eq(s.productCategories.divisionId, division.id), eq(s.productCategories.code, 'AKSESUAR'))))
      .concat(await db.insert(s.productCategories).values({ code: 'AKSESUAR', name: 'Aksesuar', divisionId: division.id, productGroupId: group.id }).onConflictDoNothing().returning());
    const [subcategory] = (await db.select().from(s.productSubcategories).where(and(eq(s.productSubcategories.categoryId, category!.id), eq(s.productSubcategories.code, 'LAZER_AKSESUAR'))))
      .concat(await db.insert(s.productSubcategories).values({ code: 'LAZER_AKSESUAR', name: 'Lazer Aksesuarları', divisionId: division.id, categoryId: category!.id }).onConflictDoNothing().returning());
    for (const accessory of parsed.accessories) {
      const modelCode = `HEX-AKS-${slug(accessory.name)}`.toUpperCase().slice(0, 128);
      let [card] = await db.select({ id: s.productModels.id }).from(s.productModels).where(and(eq(s.productModels.tenantId, tenantId), eq(s.productModels.modelCode, modelCode), isNull(s.productModels.deletedAt)));
      if (!card) {
        [card] = await db.insert(s.productModels).values({
          tenantId, brandId: brand.id, productGroupId: group.id, categoryId: category!.id, subcategoryId: subcategory!.id,
          modelCode, modelName: accessory.name, fullName: accessory.name, currencyId: usdId,
        }).returning({ id: s.productModels.id });
        result.accessoriesCreated++;
      }
      await upsertCost({ productModelId: card!.id }, accessory.costUsd, `${accessory.sheet}!${accessory.cell}`);
      result.accessoryCosts++;
    }
  }

  const labelOf = (code: string, power?: { operator: '<=' | '='; kw: number }) =>
    power ? `${code} · ${power.operator === '<=' ? '≤' : ''}${String(power.kw).replace('.', ',')} kW` : code;
  for (const cost of optionCosts) {
    const anyPower = parsed.prices.find((price) => price.priceModelCode === cost.priceModelCode)?.powerKw ?? cost.power?.kw ?? 0;
    const hex = hexConfigurationForPriceModel(cost.priceModelCode, anyPower);
    const productModelId = hex && baseBySeries.get(hex.series);
    if (!hex || !productModelId) { result.optionCostsSkipped.push(`${cost.label} / ${cost.priceModelCode}`); continue; }
    const sets = await db.select().from(s.productOptionSets).where(and(eq(s.productOptionSets.productModelId, productModelId), eq(s.productOptionSets.tenantId, tenantId), eq(s.productOptionSets.name, cost.label), isNull(s.productOptionSets.deletedAt)));
    const set = sets[0] ?? (await db.insert(s.productOptionSets).values({ tenantId, productModelId, name: cost.label, configurationKind: null, sortOrder: 10 }).returning())[0]!;
    const value = labelOf(hex.sourceModelCode, cost.power);
    let [optionValue] = await db.select({ id: s.productOptionValues.id }).from(s.productOptionValues).where(and(eq(s.productOptionValues.optionSetId, set.id), eq(s.productOptionValues.value, value), isNull(s.productOptionValues.deletedAt)));
    if (!optionValue) {
      [optionValue] = await db.insert(s.productOptionValues).values({ tenantId, optionSetId: set.id, value, priceDelta: null, currencyId: usdId, sortOrder: 0 }).returning({ id: s.productOptionValues.id });
      result.optionValuesCreated++;
    }
    await upsertCost({ optionValueId: optionValue!.id }, cost.costUsd, `${cost.sheet}!${cost.cell}`);
    result.optionCostsWritten++;
  }
  return result;
}

if (require.main === module) {
  const file = process.argv.find((arg) => arg.startsWith('--file='))?.slice(7);
  const tenantId = process.argv.find((arg) => arg.startsWith('--tenant='))?.slice(9);
  const apply = process.argv.includes('--apply');
  if (!file || !tenantId) throw new Error('Kullanım: --file=<fiyat listesi.xlsx> --tenant=<uuid> [--apply]');
  importLaserPriceList(getDb(), tenantId, readFileSync(file), apply)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Fiyat listesi aktarımı başarısız'); process.exitCode = 1; })
    .finally(() => closeDb());
}
