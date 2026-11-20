/** Read-only mapping report: source snapshot vs existing CRM products. Writes nothing to the database.
 *  Local:  npx tsx src/db/report-catalog-mapping.ts --tenant=<uuid> [--out=dir]
 *  Prod:   node dist/db/report-catalog-mapping.js --tenant=<uuid> --out=/tmp   (read-only session) */
import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { machineFamilyForType } from '@haksan/shared';
import { closeDb, getDb, type DbClient } from './client';
import { matchKey, matchSourceCard, resolveMatch, type ExistingProduct } from './catalog-matching';
import { readFile } from 'node:fs/promises';
import { haksanDivision, haksanTypeCode } from './haksan-catalog-classification';
import { loadExistingProducts, readMatchDecisions, readSnapshot } from './import-haksanmakina-catalog';

// Rows whose type has no division but a CNC machine type are still existing CNC records.
const isExistingCnc = (row: { division: string | null; typeCode?: string | null }) =>
  row.division === 'CNC' || (!!row.typeCode && !!machineFamilyForType('CNC', row.typeCode));

export async function buildCatalogMappingReport(db: DbClient, tenantId: string) {
  // The taxonomy migration (023) stops on these; they must be typed before deploy.
  const untyped = (await db.execute(sql`SELECT m.model_code, g.code AS group_code FROM product_models m
    JOIN product_groups g ON g.id = m.product_group_id WHERE m.tenant_id = ${tenantId} AND m.deleted_at IS NULL
    AND m.product_type_id IS NULL AND upper(g.code) IN ('UNIVERSAL', 'SAC_ISLEME')`)).rows as Array<{ model_code: string; group_code: string }>;
  return mappingReport(tenantId, await loadExistingProducts(db, tenantId), untyped);
}

/** Same report from an exported product list (production is read with a narrow read-only query, never dumped). */
export async function mappingReport(tenantId: string, existing: ExistingProduct[], untyped: Array<{ model_code: string; group_code: string }>) {
  const snapshot = await readSnapshot();
  const decisions = await readMatchDecisions();
  const rows = snapshot.products.map(product => {
    const division = haksanDivision(product);
    const type = haksanTypeCode(product);
    const match = matchSourceCard(product, existing);
    const plan = resolveMatch(match, division, decisions[product.sourceId], existing);
    const linked = plan.action === 'link' ? plan.existing : undefined;
    const status = plan.action === 'create' ? 'yeni' : plan.action === 'blocked' ? 'belirsiz'
      : plan.action === 'skip' ? (decisions[product.sourceId] === 'skip' ? 'karar_atla' : 'korunan_cnc') : match.status === 'source' ? 'eslesen_kaynak' : 'eslesen_model';
    // Moves are proposals only; existing CNC rows are never moved.
    const move = linked && !isExistingCnc(linked) && (linked.division !== division || (linked.typeCode ?? '').toUpperCase() !== type.toUpperCase())
      ? `${linked.division ?? '-'}/${linked.typeCode ?? '-'} → ${division}/${type}` : '';
    return { sourceId: product.sourceId, sourceUrl: product.sourceUrl, group: product.group, sourceCategory: product.sourceCategory,
      brand: product.brand, model: product.model, title: product.title, division, family: machineFamilyForType(product.group, type)?.label ?? '',
      type, status, existing: linked?.modelCode ?? (match.status === 'possible' ? match.candidates.map(c => c.modelCode).join(' | ') : ''),
      move, specs: product.specs.length };
  });
  const groups = new Map<string, string[]>();
  for (const row of existing) {
    if (row.modelCode.startsWith('HM-')) continue;
    const k = `${matchKey(row.brand)}:${matchKey(row.modelName || row.modelCode)}`;
    groups.set(k, [...(groups.get(k) ?? []), row.modelCode]);
  }
  const duplicates = [...groups.values()].filter(codes => codes.length > 1);
  const cncAudit = existing.filter(isExistingCnc).map(row => ({ modelCode: row.modelCode, brand: row.brand, typeCode: row.typeCode,
    family: row.typeCode ? machineFamilyForType('CNC', row.typeCode)?.label ?? 'CNC ailesi dışında' : 'tip yok', action: 'dokunulmuyor' }));
  const count = (status: string) => rows.filter(row => row.status === status).length;
  return {
    capturedOn: snapshot.capturedOn, tenantId,
    summary: { kaynak: rows.length, yeni: count('yeni'), eslesen_kaynak: count('eslesen_kaynak'), eslesen_model: count('eslesen_model'),
      korunan_cnc: count('korunan_cnc'), belirsiz: count('belirsiz'), tasinacak_oneri: rows.filter(row => row.move).length,
      mukerrer_mevcut: duplicates.length, tipsiz_makine: untyped.length, cnc_mevcut: cncAudit.length, kapsam_disi: snapshot.excluded.length, lazer_hex_hattina: snapshot.deferredLasers.length },
    rows, duplicates, cncAudit, untyped, excluded: snapshot.excluded,
    deferredLasers: snapshot.deferredLasers.map(p => ({ sourceId: p.sourceId, brand: p.brand, title: p.title })),
  };
}

// Scraped text starting with = + - @ would run as an Excel formula.
const csvCell = (value: unknown) => `"${String(value ?? '').replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`;

async function main() {
  const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const tenantId = arg('tenant');
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error('--tenant=<uuid> gerekli');
  const exported = arg('existing');
  const report = exported
    ? await (async () => { const file = JSON.parse(await readFile(exported, 'utf8'));
      return mappingReport(tenantId, file.existing ?? [], file.untyped ?? []); })()
    : await getDb().transaction(async tx => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      return buildCatalogMappingReport(tx as unknown as DbClient, tenantId);
    });
  const out = path.resolve(arg('out') ?? '.');
  const base = path.join(out, `catalog-mapping-${report.capturedOn}`);
  await writeFile(`${base}.json`, JSON.stringify(report, null, 2));
  const columns = Object.keys(report.rows[0] ?? {}) as Array<keyof (typeof report.rows)[number]>;
  await writeFile(`${base}.csv`, '﻿' + [columns.join(';'), ...report.rows.map(row => columns.map(c => csvCell(row[c])).join(';'))].join('\n'));
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Rapor: ${base}.json / .csv`);
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(closeDb);
