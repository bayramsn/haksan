/** Tenant-scoped import of the supplied price workbook and verified showroom measurements. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { DbClient } from './client';

const specSchema = z.object({ key: z.string().min(1).max(255), value: z.string().max(2000), unit: z.string().max(64).default('') });
const priceSchema = z.object({ amount: z.string().regex(/^\d+(?:\.\d{1,4})?$/).nullable(), currency: z.string().min(1).max(8), status: z.string() });
const workbookSchema = z.object({ sourceFile: z.string(), sourceSha256: z.string(), version: z.string(), releaseDate: z.string(),
  products: z.array(z.object({ id: z.string(), sheet: z.string(), series: z.string(), modelCode: z.string().min(1).max(128),
    specs: z.array(specSchema), price: priceSchema, standardEquipment: z.object({ text: z.string() }).optional() })),
  options: z.array(z.object({ id: z.string(), name: z.string(), group: z.string(), pricesByProduct: z.record(z.string(), priceSchema) })),
  sheets: z.array(z.object({ name: z.string(), warnings: z.array(z.unknown()).optional() })).optional(), software: z.array(z.unknown()), warnings: z.array(z.unknown()).optional() });
const showroomSchema = z.object({ pending: z.array(z.object({ model: z.string().nullable().optional(), reason: z.string() })).optional(), products: z.array(z.object({ brand: z.string().min(1).max(128), model: z.string().min(1).max(128),
  title: z.string().optional(), group: z.string().optional(), notes: z.array(z.string()).optional(), warnings: z.array(z.string()).optional(), capacityConditions: z.unknown().optional(), optionalSpecs: z.unknown().optional(), typeCode: z.string().optional(), productTypeCode: z.string().optional(), sourceId: z.string().optional(),
  sourceSeriesId: z.string().optional(), matchKind: z.string().optional(), matchedSourceBrand: z.string().optional(),
  sourceUrls: z.array(z.string().url()).default([]), specs: z.array(specSchema), verificationStatus: z.string().optional() })) });
type Spec = z.infer<typeof specSchema>;
type Equipment = { title: string; description?: string; type: 'standart' | 'opsiyonel'; price?: string; currency?: string };
type Incoming = { identity: string; brand: string; model: string; title: string; series?: string; typeCode?: string; sourceId?: string;
  donorSourceId?: string; divisionCode?: string; matchedSourceBrand?: string; price?: string; currency?: string; specs: Spec[]; equipment: Equipment[]; urls: string[]; description: string; sourceLabel?: string; workbook: boolean; requiresSeries?: boolean };
const normal = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').toUpperCase().replace(/[^A-Z0-9]/g, '');
const blank = (value: string | null) => value === null || !value.trim() || /^[-—–]$/.test(value.trim());
const measurement = (value: string) => value.trim().toLocaleLowerCase('tr-TR').replace(/(\d),(?=\d)/g, '$1.').replace(/\s+/g, '').replace(/×/g, 'x');
const technicalAliases: Record<string, string> = { BUKMEBOYU: 'BUKMEUZUNLUGU', KESMEUZUNLUGU: 'KESMEBOYU', ANAMOTORGUCU: 'MOTORGUCU' };
const technicalKey = (key: string) => technicalAliases[normal(key)] ?? normal(key);
const moneyEqual = (left: string, right: string) => Number(left) === Number(right);
const generatedCode = (row: Incoming) => `SUP-${normal(row.brand).slice(0, 16)}-${normal(row.model).slice(0, 70)}-${createHash('sha256').update(row.identity).digest('hex').slice(0, 12)}`;
const familyType = (sheet: string) => /^(APEX|APHS|APEB|APES)/.test(sheet) ? 'ABKANT_PRES'
  : /^(HNC|MGH|HGL)$/.test(sheet) ? 'GIYOTIN_MAKAS'
  : /^(BPL H|BPS)$/.test(sheet) ? 'PLAZMA_KESIM'
  : sheet === 'BLT' ? 'fiber_lazer_boru_kesim'
  : /^(BLS PRO|BLP|BLU|BLE PRO|BLX|BLM|BLC)$/.test(sheet) ? 'fiber_lazer_kesim' : undefined;

export function workbookSpecs(specs: Spec[], sheet: string): Spec[] {
  const names: Record<string, string> = {
    LENGTH: /^(AP|APE)/.test(sheet) ? 'Bükme Boyu' : /^BL/.test(sheet) ? 'Çalışma Uzunluğu' : 'Kesme Boyu',
    LENGHT: 'Kesme Boyu', TONNAGE: 'Bükme Kuvveti', TON: 'Bükme Kuvveti',
    CUTTINGCAPACITY: 'Kesme Kalınlığı', MATERIALTHICKNESSCUTTINGCAPACITY: 'Kesme Kalınlığı',
    THICKNESS: 'Kesme Kalınlığı', WIDTH: 'Çalışma Genişliği', NETCUTTINGDIMENSION: 'Net Kesim Alanı',
  };
  return specs.map(spec => {
    const key = names[normal(spec.key)] ?? spec.key;
    const explicit = spec.value.match(/^([\d.,]+)\s*[- ]?\s*(TON|MM|KW)$/i);
    const length = spec.value.match(/^([\d.,]+)\s*-\s*LENGTH$/i);
    if (explicit) return { key, value: explicit[1], unit: explicit[2].toLowerCase() === 'kw' ? 'kW' : explicit[2].toLowerCase() };
    return { key, value: length?.[1] ?? spec.value, unit: spec.unit || (/^TON(?:NAGE)?$/i.test(spec.key) ? 'ton' : '') };
  });
}

export async function readSupplierCatalog(source: string = 'all') {
  const root = path.join(__dirname, 'seed', 'data');
  const technical = z.object({ unresolved: z.array(z.object({ workbookProductId: z.string(), reason: z.string(), sourceUrl: z.string().url().optional() })).default([]), products: z.array(z.object({ workbookProductId: z.string(), modelCode: z.string(), sheet: z.string(), sourceUrls: z.array(z.string().url()), specs: z.array(specSchema) })) })
    .parse(JSON.parse(await readFile(path.join(root, 'baykal-2026-technical.json'), 'utf8')));
  const incoming: Incoming[] = [];
  const deferred: Array<{ model: string; reason: string }> = [];
  const warnings: unknown[] = [];
  if (source === 'all' || source === 'baykal') {
    const book = workbookSchema.parse(JSON.parse(await readFile(path.join(root, 'baykal-2026-price-list.json'), 'utf8')));
    warnings.push(...technical.unresolved.map(item => ({ model: book.products.find(product => product.id === item.workbookProductId)?.modelCode, reason: item.reason, sourceUrl: item.sourceUrl })), ...(book.warnings ?? []), ...(book.sheets ?? []).flatMap(sheet => (sheet.warnings ?? []).map(warning => ({ sheet: sheet.name, warning }))));
    for (const product of book.products) {
      const verified = technical.products.find(row => row.workbookProductId === product.id);
      if (verified && (verified.modelCode !== product.modelCode || verified.sheet !== product.sheet)) throw new Error('Teknik kaynak model kimliği uyuşmuyor');
      const technicalSpecs = workbookSpecs(product.specs.filter(spec => !(['BLS 2560', 'BLU 2560'].includes(product.modelCode) && normal(spec.key) === 'LENGTH')), product.sheet);
      for (const spec of verified?.specs ?? []) {
        const previous = technicalSpecs.find(row => technicalKey(row.key) === technicalKey(spec.key));
        if (!previous) technicalSpecs.push(spec);
        else if (!previous.unit && measurement(previous.value) === measurement(spec.value)) previous.unit = spec.unit;
      }
      const text = product.standardEquipment?.text ?? '';
      const controller = text.match(/(ESA\s+S\s*\d+[^,\n]*?)(?:\s+Controller|,|$)|((?:Cybelec\s+)?Cyb?t?touch[^,\n]*?)(?:\s+Controller|,|$)|(BECKHOFF CNC CONTROL UNIT)|(Tecnos Cnc Control)/i);
      if (controller) technicalSpecs.push({ key: 'Kontrol Ünitesi', value: (controller[1] ?? controller[2] ?? controller[3] ?? controller[4]).trim(), unit: '' });
      const backgauge = text.match(/(?:X Backgauge\s*|)(\d+)\s*mm\s*(?:Backgauge|\(AC Motor\))/i);
      if (backgauge) technicalSpecs.push({ key: 'Arka Dayama Mesafesi', value: backgauge[1], unit: 'mm' });
      const throat = text.match(/(\d+)\s*mm Throat Gap/i);
      if (throat) technicalSpecs.push({ key: 'Boğaz Derinliği', value: throat[1], unit: 'mm' });
      const repeatedCode = book.products.filter(item => normal(item.modelCode) === normal(product.modelCode)).length > 1;
      const equipment: Equipment[] = [];
      if (product.standardEquipment?.text) equipment.push({ type: 'standart', title: 'Standart Donanım', description: product.standardEquipment.text });
      const applicableOptions = book.options.filter(option => option.pricesByProduct[product.id]);
      for (const option of applicableOptions) {
        const sameNames = applicableOptions.filter(other => normal(other.name) === normal(option.name));
        const sameGroups = sameNames.filter(other => other.group === option.group);
        const qualifiedName = `${option.name}${sameNames.length > 1 ? ` (${option.group}${sameGroups.length > 1 ? ` · ${option.id}` : ''})` : ''}`;
        const optionTitle = qualifiedName.length > 255 ? `${qualifiedName.slice(0, 240)} · ${createHash('sha256').update(option.id).digest('hex').slice(0, 12)}` : qualifiedName;
        const price = option.pricesByProduct[product.id];
        if (price && (price.status === 'on_request' || (price.status === 'priced' && price.amount !== null))) equipment.push({ type: 'opsiyonel', title: optionTitle,
          description: option.group, price: price.amount ?? undefined, currency: price.currency });
      }
      incoming.push({ identity: `baykal:${book.version}:${product.id}`, brand: 'BAYKAL', model: product.modelCode, title: `BAYKAL ${product.modelCode}${repeatedCode ? ` · ${product.sheet}` : ''}`,
        divisionCode: 'SAC_ISLEME', series: product.series, typeCode: familyType(product.sheet), price: product.price.status === 'priced' ? product.price.amount ?? undefined : undefined,
        currency: product.price.currency, requiresSeries: repeatedCode,
        specs: technicalSpecs, equipment, urls: ['https://www.baykal.com.tr/', ...(verified?.sourceUrls ?? [])], workbook: true,
        description: `Baykal V${book.version} fiyat listesi (${book.releaseDate}). EUR fiyatlar. EX-WORKS BURSA.`, sourceLabel: `Baykal V${book.version} (${book.releaseDate})` });
    }
    deferred.push({ model: `${book.software.length} yazılım satırı`, reason: 'Yazılımın uyumlu ürün eşleşmesi dosyada tanımlı değil' });
  }
  if (source === 'all' || source === 'showroom') {
    for (const file of ['showroom-2026-11-specs.json', 'showroom-2026-11-extra.json']) {
      const dataset = showroomSchema.parse(JSON.parse(await readFile(path.join(root, file), 'utf8')));
      deferred.push(...(dataset.pending ?? []).map(item => ({ model: item.model ?? 'Model kodu belirsiz', reason: item.reason })));
      for (const product of dataset.products) {
        if (!product.specs.length || product.verificationStatus === 'unverified') {
          deferred.push({ model: product.model, reason: 'Doğrulanmış teknik veri bekleniyor' }); continue;
        }
        const variant = product.matchKind === 'series_variant' || Boolean(product.sourceSeriesId);
        incoming.push({ identity: `showroom:${normal(product.brand)}:${normal(product.model)}`, brand: product.brand, model: product.model,
          title: product.title?.includes(product.model) ? product.title : `${product.brand} ${product.model} ${product.title ?? ''}`.trim(), divisionCode: product.group, typeCode: product.typeCode ?? product.productTypeCode,
          sourceId: variant ? undefined : product.sourceId, donorSourceId: product.sourceSeriesId ?? (variant ? product.sourceId : undefined),
          matchedSourceBrand: product.matchedSourceBrand, specs: product.specs, equipment: [], urls: product.sourceUrls, workbook: false,
          description: typeof product.capacityConditions === 'string' ? product.capacityConditions : '' });
      }
    }
  }
  const ids = new Set<string>();
  for (const row of incoming) {
    if (ids.has(row.identity)) throw new Error(`Yinelenen kaynak kimliği: ${row.identity}`);
    ids.add(row.identity);
  }
  return { incoming, deferred, warnings };
}

type Model = typeof import('./schema').productModels.$inferSelect;
type Brand = typeof import('./schema').brands.$inferSelect;
/** Exact source links and exact brand/model matching. Model spelling alone cannot collapse drive variants. */
export function supplierMatches(row: Incoming, models: Model[], brands: Brand[]) {
  const brandIds = new Set(brands.filter(brand => normal(brand.name) === normal(row.brand) ||
    Boolean(row.matchedSourceBrand && normal(brand.name) === normal(row.matchedSourceBrand))).map(brand => brand.id));
  const active = models.filter(model => !model.deletedAt && brandIds.has(model.brandId));
  const linked = active.filter(model => model.catalogSources.some(ref => ref.sourceId === row.identity));
  if (linked.length) return linked;
  if (row.sourceId) {
    const sourceMatches = active.filter(model => model.modelCode === `HM-${row.sourceId}` || model.catalogSources.some(ref => ref.sourceId === row.sourceId));
    if (sourceMatches.length) return sourceMatches;
  }
  const candidates = active.filter(model => [model.modelCode, model.modelName ?? ''].some(code => normal(code) === normal(row.model)));
  if (!row.workbook) return candidates;
  // Hydraulic, mild hybrid and hybrid products may share the exact printed model code.
  return row.requiresSeries ? candidates.filter(model => normal(model.series ?? '') === normal(row.series ?? '')) : candidates;
}

export async function importSupplierCatalog(db: DbClient, tenantId: string, userId: string, apply = false, source = 'all') {
  const s = require('./schema') as typeof import('./schema');
  const { canonicalSpecs } = require('./haksan-spec-templates') as typeof import('./haksan-spec-templates');
  z.string().uuid().parse(tenantId); z.string().uuid().parse(userId);
  const dataset = await readSupplierCatalog(source);
  return db.transaction(async tx => {
    const operators = await tx.select({ id: s.users.id }).from(s.users)
      .innerJoin(s.userRoles, eq(s.userRoles.userId, s.users.id)).innerJoin(s.roles, eq(s.roles.id, s.userRoles.roleId))
      .innerJoin(s.tenants, eq(s.tenants.id, s.users.tenantId)).where(and(eq(s.users.id, userId), eq(s.users.tenantId, tenantId),
        eq(s.users.status, 'active'), isNull(s.users.deletedAt), eq(s.tenants.isActive, true), isNull(s.tenants.deletedAt),
        eq(s.roles.code, 'super_admin'), or(eq(s.roles.tenantId, tenantId), isNull(s.roles.tenantId)))).limit(1);
    if (!operators.length) throw new Error('Etkin tenant süper yöneticisi gerekli');
    if (apply) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:supplier-catalog`},0))`);
    const models = await tx.select().from(s.productModels).where(eq(s.productModels.tenantId, tenantId));
    const brands = await tx.select().from(s.brands).where(and(eq(s.brands.tenantId, tenantId), isNull(s.brands.deletedAt)));
    const divisions = await tx.select().from(s.divisions).where(and(eq(s.divisions.tenantId, tenantId), eq(s.divisions.isActive, true), isNull(s.divisions.deletedAt)));
    const types = await tx.select().from(s.productTypes).where(eq(s.productTypes.isActive, true));
    const subs = await tx.select().from(s.productSubcategories).where(eq(s.productSubcategories.isActive, true));
    const categories = await tx.select().from(s.productCategories).where(eq(s.productCategories.isActive, true));
    const groups = await tx.select().from(s.productGroups).where(eq(s.productGroups.isActive, true));
    const currencies = await tx.select().from(s.currencies).where(eq(s.currencies.isActive, true));
    const equipmentTypes = await tx.select().from(s.equipmentTypes).where(eq(s.equipmentTypes.isActive, true));
    const specs = await tx.select().from(s.productSpecs).where(eq(s.productSpecs.tenantId, tenantId));
    const templates = await tx.select().from(s.productSpecTemplates);
    const specGroups = await tx.select().from(s.productSpecGroups).where(eq(s.productSpecGroups.isActive, true));
    const equipment = await tx.select().from(s.productEquipmentItems).where(eq(s.productEquipmentItems.tenantId, tenantId));
    const report = { mode: apply ? 'applied' : 'preview', products: dataset.incoming.length, created: 0, matched: 0, pricesFilled: 0,
      specsAdded: 0, specsFilled: 0, specGroupsAssigned: 0, templatesAdded: 0, equipmentAdded: 0, equipmentPricesFilled: 0, deferred: dataset.deferred, warnings: dataset.warnings,
      blocked: [] as Array<{ model: string; reason: string }>, conflicts: [] as Array<{ model: string; field: string; existing: string; incoming: string }> };
    for (const row of dataset.incoming) {
      const blocked = (reason: string) => report.blocked.push({ model: row.title, reason });
      const matches = supplierMatches(row, models, brands);
      if (matches.length > 1) { blocked('Birden çok mevcut kayıt eşleşti'); continue; }
      let model = matches[0];
      const donorCandidates = row.donorSourceId ? models.filter(item => !item.deletedAt && (item.modelCode === `HM-${row.donorSourceId}` ||
        item.catalogSources.some(ref => ref.sourceId === row.donorSourceId))) : [];
      if (donorCandidates.length > 1) { blocked('Seri sınıflandırması birden çok kayda eşleşti'); continue; }
      const donor = donorCandidates[0];
      const division = row.divisionCode ? divisions.find(item => item.code.toUpperCase() === row.divisionCode) : undefined;
      const typeCandidates = model?.productTypeId || donor?.productTypeId
        ? types.filter(item => item.id === (model?.productTypeId ?? donor?.productTypeId))
        : types.filter(item => normal(item.code) === normal(row.typeCode ?? '') && (division ? item.divisionId === division.id : divisions.some(owned => owned.id === item.divisionId)));
      const exactTypes = typeCandidates.filter(item => item.code === row.typeCode);
      const preferredTypes = exactTypes.length ? exactTypes : typeCandidates;
      const type = preferredTypes.length === 1 ? preferredTypes[0] : undefined;
      if (!type || !divisions.some(item => item.id === type.divisionId)) { blocked('Tenant bölümünde ürün tipi çözülemedi'); continue; }
      const catalogGroup = (row.sourceId ? model?.catalogSources.find(ref => ref.sourceId === row.sourceId)?.group : undefined)
        ?? (row.donorSourceId ? donor?.catalogSources.find(ref => ref.sourceId === row.donorSourceId)?.group : undefined)
        ?? (/^HM_KAYNAK/.test(type.code) ? 'KAYNAK' : row.divisionCode ?? divisions.find(item => item.id === type.divisionId)!.code);
      const sub = subs.find(item => item.id === type.subcategoryId);
      const category = categories.find(item => item.id === sub?.categoryId);
      const group = groups.find(item => item.id === category?.productGroupId);
      if (!model && (!sub || !category || !group || [sub, category, group].some(item => item.divisionId && item.divisionId !== type.divisionId))) {
        blocked('Etkin ürün sınıflandırma zinciri tamamlanmalı'); continue;
      }
      const currency = row.currency ? currencies.find(item => item.code === row.currency) : undefined;
      if (row.price !== undefined && !currency) { blocked(`${row.currency} para birimi bulunamadı`); continue; }
      if (!model) {
        const code = generatedCode(row);
        if (models.some(item => item.modelCode === code)) { blocked('Model kodu silinmiş veya farklı markaya ait kayıtta kullanılıyor'); continue; }
        report.created++;
        if (!apply) {
          model = { id: code, catalogSources: [], listPrice: row.price ?? null, currencyId: currency?.id ?? null } as unknown as Model;
        } else {
        let brand = brands.find(item => normal(item.name) === normal(row.brand));
        if (!brand) {
          [brand] = await tx.insert(s.brands).values({ tenantId, name: row.brand, divisionId: type.divisionId }).returning(); brands.push(brand);
        }
        [model] = await tx.insert(s.productModels).values({ tenantId, brandId: brand.id, modelCode: code, modelName: row.model,
          fullName: row.title.slice(0, 512), series: row.series?.slice(0, 128), productTypeId: type.id,
          productGroupId: group!.id, categoryId: category!.id, subcategoryId: sub!.id,
          currencyId: currency?.id, listPrice: row.price, description: row.description,
          catalogSources: row.urls.map(url => ({ sourceId: row.identity, url, capturedOn: '2026-11-07', group: catalogGroup, typeCode: type.code })) }).returning();
        models.push(model);
        }
      } else {
        report.matched++;
        if (row.price !== undefined) {
          if (blank(model.listPrice)) {
            if (!model.currencyId || model.currencyId === currency!.id) {
              report.pricesFilled++;
              if (apply) await tx.update(s.productModels).set({ listPrice: row.price, currencyId: currency!.id }).where(and(eq(s.productModels.id, model.id), eq(s.productModels.tenantId, tenantId)));
            } else blocked('Mevcut ürün para birimi farklı');
          } else if (!moneyEqual(model.listPrice!, row.price) || model.currencyId !== currency!.id) report.conflicts.push({ model: row.title, field: 'Fiyat / para birimi', existing: model.listPrice!, incoming: `${row.price} ${row.currency}` });
        }
        if (apply && row.urls.some(url => !model.catalogSources.some(ref => ref.sourceId === row.identity && ref.url === url))) {
          const refs = [...model.catalogSources, ...row.urls.filter(url => !model.catalogSources.some(ref => ref.sourceId === row.identity && ref.url === url)).map(url => ({ sourceId: row.identity, url, capturedOn: '2026-11-07', group: catalogGroup, typeCode: type.code }))];
          await tx.update(s.productModels).set({ catalogSources: refs }).where(and(eq(s.productModels.id, model.id), eq(s.productModels.tenantId, tenantId))); model.catalogSources = refs;
        }
      }
      const current = specs.filter(item => item.productModelId === model.id && !item.deletedAt);
      const incomingSpecs = row.workbook ? row.specs : canonicalSpecs(type.code, row.specs).flatMap((mapped, index) => {
        if (mapped.layout) return [];
        const original = row.specs[index];
        const conditionedKey = /[()²°]|N\s*\//i.test(original.key);
        return [{ key: conditionedKey ? original.key : mapped.key, value: original.value, unit: original.unit || mapped.unit }];
      });
      const { SPEC_GROUP_NAMES } = require('./haksan-spec-templates') as typeof import('./haksan-spec-templates');
      for (const spec of incomingSpecs.filter(item => !blank(item.value))) {
        const mapped = canonicalSpecs(type.code, [spec])[0];
        const groupCode = mapped.group ?? 'GENEL';
        let specGroup = specGroups.find(group => group.divisionId === type.divisionId && group.code === groupCode);
        if (!specGroup && apply) {
          [specGroup] = await tx.insert(s.productSpecGroups).values({ divisionId: type.divisionId, code: groupCode, name: SPEC_GROUP_NAMES[groupCode] ?? groupCode }).returning(); specGroups.push(specGroup);
        }
        const exactFields = current.filter(item => normal(item.specKey) === normal(spec.key));
        const known = exactFields.length ? exactFields : current.filter(item => technicalKey(item.specKey) === technicalKey(spec.key));
        if (known.length > 1) { blocked(`Birden çok teknik alan: ${spec.key}`); continue; }
        const editableKey = known[0]?.specKey ?? spec.key;
        const template = templates.find(item => item.divisionId === type.divisionId && item.productTypeCode === type.code && normal(item.specKey) === normal(editableKey));
        if (!template) {
          report.templatesAdded++;
          if (apply) {
            const [added] = await tx.insert(s.productSpecTemplates).values({ divisionId: type.divisionId, productTypeCode: type.code, specKey: editableKey, specUnit: spec.unit || null, specGroupCode: groupCode, sortOrder: templates.length }).returning(); templates.push(added);
          } else templates.push({ divisionId: type.divisionId, productTypeCode: type.code, specKey: editableKey } as typeof templates[number]);
        }
        if (known[0] && !known[0].specGroupId) {
          report.specGroupsAssigned++;
          if (apply && specGroup) { await tx.update(s.productSpecs).set({ specGroupId: specGroup.id }).where(and(eq(s.productSpecs.id, known[0].id), eq(s.productSpecs.tenantId, tenantId))); known[0].specGroupId = specGroup.id; }
        }
        if (known[0]) {
          if (known[0].deletedAt) continue;
          if (blank(known[0].specValue)) {
            report.specsFilled++;
            if (apply) { await tx.update(s.productSpecs).set({ specValue: spec.value, specUnit: spec.unit }).where(and(eq(s.productSpecs.id, known[0].id), eq(s.productSpecs.tenantId, tenantId))); known[0].specValue = spec.value; known[0].specUnit = spec.unit; }
          } else if (!known[0].specUnit && spec.unit && measurement(known[0].specValue) === measurement(spec.value)) {
            report.specsFilled++;
            if (apply) { await tx.update(s.productSpecs).set({ specUnit: spec.unit }).where(and(eq(s.productSpecs.id, known[0].id), eq(s.productSpecs.tenantId, tenantId))); known[0].specUnit = spec.unit; }
          } else if (measurement(`${known[0].specValue}${known[0].specUnit ?? ''}`) !== measurement(`${spec.value}${spec.unit}`)) report.conflicts.push({ model: row.title, field: spec.key, existing: `${known[0].specValue} ${known[0].specUnit ?? ''}`, incoming: `${spec.value} ${spec.unit}` });
        } else {
          report.specsAdded++;
          if (apply) {
            const [added] = await tx.insert(s.productSpecs).values({ tenantId, productModelId: model.id, specKey: spec.key,
              specValue: spec.value, specUnit: spec.unit, specGroupId: specGroup?.id, sortOrder: current.length }).returning(); specs.push(added); current.push(added);
          }
        }
      }
      for (const item of row.equipment) {
        const equipmentType = equipmentTypes.find(type => type.code === item.type);
        if (!equipmentType) { blocked(`Donanım tipi bulunamadı: ${item.type}`); continue; }
        const title = item.title.slice(0, 255);
        const found = equipment.filter(existing => existing.productModelId === model.id && normal(existing.title) === normal(title) && existing.equipmentTypeId === equipmentType.id);
        const optionCurrency = item.currency ? currencies.find(value => value.code === item.currency) : undefined;
        if (found.length) {
          if (found.length > 1) { blocked(`Birden çok donanım satırı: ${title}`); continue; }
          const existing = found[0];
          if (!existing.deletedAt && item.price !== undefined) {
            if (blank(existing.unitPrice) && optionCurrency && (!existing.currencyId || existing.currencyId === optionCurrency.id)) {
              report.equipmentPricesFilled++;
              if (apply) await tx.update(s.productEquipmentItems).set({ unitPrice: item.price, currencyId: optionCurrency.id })
                .where(and(eq(s.productEquipmentItems.id, existing.id), eq(s.productEquipmentItems.tenantId, tenantId)));
              existing.unitPrice = item.price; existing.currencyId = optionCurrency.id;
            } else if (existing.unitPrice === null || !moneyEqual(existing.unitPrice, item.price) || existing.currencyId !== optionCurrency?.id) {
              report.conflicts.push({ model: row.title, field: title, existing: existing.unitPrice ?? '', incoming: `${item.price} ${item.currency}` });
            }
          }
          continue;
        }
        if (item.price && !optionCurrency) { blocked(`Donanım para birimi bulunamadı: ${item.currency}`); continue; }
        report.equipmentAdded++;
        if (apply) {
          const [added] = await tx.insert(s.productEquipmentItems).values({ tenantId, productModelId: model.id, equipmentTypeId: equipmentType.id,
            title, description: [item.description, row.sourceLabel].filter(Boolean).join('\n'), unitPrice: item.price,
            currencyId: optionCurrency?.id, sortOrder: equipment.length }).returning(); equipment.push(added);
        }
      }
    }
    return report;
  });
}

if (require.main === module) {
  const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const source = argument('source') ?? 'all';
  if (!['all', 'baykal', 'showroom'].includes(source)) throw new Error('--source=all|baykal|showroom');
  const tenant = argument('tenant'); const user = argument('user'); const apply = process.argv.includes('--apply');
  if ((tenant && !user) || (!tenant && user) || (apply && !tenant)) throw new Error('--apply için --tenant=<uuid> --user=<uuid> gerekli');
  const run = tenant && user ? importSupplierCatalog((require('./client') as typeof import('./client')).getDb(), tenant, user, apply, source)
    : readSupplierCatalog(source).then(data => ({ mode: 'source-preview', products: data.incoming.length,
      technicalValues: data.incoming.reduce((sum, row) => sum + row.specs.length, 0), equipment: data.incoming.reduce((sum, row) => sum + row.equipment.length, 0), deferred: data.deferred, warnings: data.warnings }));
  run.then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(() => { console.error('Tedarikçi kataloğu aktarımı başarısız. Veri dosyasını ve veritabanı bağlantısını kontrol edin.'); process.exitCode = 1; })
    .finally(() => tenant ? (require('./client') as typeof import('./client')).closeDb() : undefined);
}
