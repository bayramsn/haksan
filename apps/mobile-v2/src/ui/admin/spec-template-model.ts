// Teknik bilgi çalışma sayfasının saf mantığı (web ProductSpecTemplatesCard: buildDraftRows,
// saveWorkbook doğrulaması, sıralama). Katalog önerileri web'e özgü olduğundan yalnız DB satırları.

export type SpecRowLike = {
  id: string;
  productTypeCode: string;
  specKey: string;
  specGroupCode: string | null;
  defaultValue: string | null;
  specUnit: string | null;
  specOptions: string[] | null;
  divisionId: string | null;
  sortOrder: number;
  isActive: boolean;
  isDeleted: boolean;
};

export type SpecDraftRow = {
  clientId: string;
  id?: string;
  divisionId?: string | null;
  specKey: string;
  groupCode: string;
  defaultValue: string;
  unit: string;
  specOptions: string[];
  isActive: boolean;
  isDeleted: boolean;
};

export const DEFAULT_SPEC_GROUP = 'GENEL';

/** Web `normalizeProductSpecKey` eşdeğeri: büyük/küçük harf, aksan ve boşluk farkını yok sayar. */
export const normalizeSpecKey = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ');

export const foldTypeCode = (code?: string | null) =>
  String(code ?? '')
    .trim()
    .toLocaleUpperCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/İ/g, 'I')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const sameTypeCode = (a?: string | null, b?: string | null) => foldTypeCode(a) === foldTypeCode(b);

/** Aynı alan hem ortak hem bölüm kaydında varsa bölüm kaydı kazanır; sıralama `sortOrder`. */
export function buildSpecDraft(typeCode: string, rows: SpecRowLike[]): SpecDraftRow[] {
  const byKey = new Map<string, SpecRowLike>();
  rows
    .filter((row) => sameTypeCode(row.productTypeCode, typeCode))
    .forEach((row) => {
      const key = normalizeSpecKey(row.specKey);
      const existing = byKey.get(key);
      if (!existing || (!existing.divisionId && row.divisionId)) byKey.set(key, row);
    });
  return [...byKey.values()]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((row) => ({
      clientId: row.id,
      id: row.id,
      divisionId: row.divisionId,
      specKey: row.specKey,
      groupCode: row.specGroupCode ?? DEFAULT_SPEC_GROUP,
      defaultValue: row.defaultValue ?? '',
      unit: row.specUnit ?? '',
      specOptions: row.specOptions ?? [],
      isActive: row.isActive !== false,
      isDeleted: row.isDeleted === true,
    }));
}

export function specTemplateStats(typeCode: string, rows: SpecRowLike[]) {
  const draft = buildSpecDraft(typeCode, rows).filter((row) => !row.isDeleted);
  return { total: draft.length, active: draft.filter((row) => row.isActive).length, groups: new Set(draft.map((row) => row.groupCode)).size };
}

export function validateSpecDraft(rows: SpecDraftRow[]): string | null {
  const names = rows.filter((row) => row.isActive && !row.isDeleted).map((row) => normalizeSpecKey(row.specKey));
  if (names.some((name) => !name)) return 'Teknik bilgi adı boş bırakılamaz';
  if (new Set(names).size !== names.length) return 'Aynı teknik bilgi adı birden fazla kez kullanılamaz';
  return null;
}

/** Web `saveWorkbook` gövdesi: boşaltılan değer/birim açıkça null gider. */
export function specDraftToBatch(typeCode: string, divisionId: string | null, rows: SpecDraftRow[]) {
  return {
    productTypeCode: typeCode,
    divisionId,
    pruneMissing: true,
    items: rows.map((row, index) => ({
      id: row.id,
      productTypeCode: typeCode,
      specKey: row.specKey.trim(),
      specGroupCode: row.groupCode,
      defaultValue: row.defaultValue.trim() || null,
      specUnit: row.unit.trim() || null,
      specOptions: row.specOptions.length ? row.specOptions : null,
      divisionId: row.divisionId ?? divisionId ?? null,
      sortOrder: index,
      isActive: row.isActive,
      isDeleted: row.isDeleted,
    })),
  };
}

/** Görünen (silinmemiş) satırlar arasında bir adım taşır; hedef satırın grubunu alır. */
export function moveSpecRow(rows: SpecDraftRow[], clientId: string, direction: -1 | 1): SpecDraftRow[] {
  const visible = rows.filter((row) => !row.isDeleted);
  const index = visible.findIndex((row) => row.clientId === clientId);
  const target = visible[index + direction];
  if (index < 0 || !target) return rows;
  const next = rows.filter((row) => row.clientId !== clientId);
  const source = rows.find((row) => row.clientId === clientId);
  if (!source) return rows;
  const targetIndex = next.findIndex((row) => row.clientId === target.clientId);
  next.splice(direction === 1 ? targetIndex + 1 : targetIndex, 0, { ...source, groupCode: target.groupCode });
  return next;
}

export function groupSpecRows(rows: SpecDraftRow[]) {
  const groups: { groupCode: string; rows: SpecDraftRow[] }[] = [];
  rows.forEach((row) => {
    const last = groups[groups.length - 1];
    if (last && last.groupCode === row.groupCode) last.rows.push(row);
    else groups.push({ groupCode: row.groupCode, rows: [row] });
  });
  return groups;
}

export const parseSpecOptions = (value: string) =>
  [...new Set(value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean))].slice(0, 20);

/* ------------------------------------------------ teknik bilgi içe aktarma (web TechnicalImportDialog) */

export type ImportMatchStatus = 'exact' | 'normalized' | 'review' | 'unmatched';
export type ImportRowLike = {
  rowNumber: number;
  sheetName: string;
  section: string;
  sourceKey: string;
  sourceValue: string;
  sourceUnit: string;
  targetKey: string;
  targetGroupCode: string;
  targetUnit: string;
  matchStatus: ImportMatchStatus;
  include: boolean;
};
export type ImportFilter = 'all' | 'review' | 'unmatched';

export const IMPORT_STATUS_META: Record<ImportMatchStatus, { label: string; tone: 'success' | 'info' | 'warning' | 'destructive' }> = {
  exact: { label: 'Tam eşleşme', tone: 'success' },
  normalized: { label: 'İsimle eşleşti', tone: 'info' },
  review: { label: 'Onay gerekli', tone: 'warning' },
  unmatched: { label: 'Eşleşmedi', tone: 'destructive' },
};

export const TECHNICAL_IMPORT_MAX_BYTES = 10 * 1024 * 1024;

export const importRowKey = (row: Pick<ImportRowLike, 'sheetName' | 'rowNumber'>) => `${row.sheetName}:${row.rowNumber}`;

export function filterImportRows<T extends ImportRowLike>(rows: T[], filter: ImportFilter, search: string): T[] {
  const query = search.trim().toLocaleLowerCase('tr-TR');
  return rows.filter((row) => {
    if (filter === 'review' && row.matchStatus !== 'review') return false;
    if (filter === 'unmatched' && row.matchStatus !== 'unmatched') return false;
    if (!query) return true;
    return [row.section, row.sourceKey, row.sourceValue, row.targetKey].join(' ').toLocaleLowerCase('tr-TR').includes(query);
  });
}

export function importCounts(rows: ImportRowLike[]) {
  return {
    total: rows.length,
    ready: rows.filter((row) => row.include && row.targetKey).length,
    review: rows.filter((row) => row.matchStatus === 'review').length,
    unmatched: rows.filter((row) => row.matchStatus === 'unmatched').length,
  };
}

/** Web'de sistem alanı değiştirildiğinde uygulanan yama. */
export function retargetImportRow<T extends ImportRowLike>(
  row: T,
  targetKey: string,
  fields: { key: string; groupCode?: string; unit?: string }[]
): T {
  const field = fields.find((item) => item.key === targetKey);
  return {
    ...row,
    targetKey,
    targetGroupCode: field?.groupCode ?? DEFAULT_SPEC_GROUP,
    targetUnit: field?.unit ?? row.sourceUnit,
    matchStatus: targetKey ? 'review' : 'unmatched',
    include: Boolean(targetKey),
  };
}

export const isTechnicalImportFile = (name: string) => /\.(xlsx|csv)$/i.test(name.trim());

/** Yeni ürün tipi kodu: ad → BÜYÜK_HARF_ALT_ÇİZGİ (web `normalizeDepartmentCode` benzeri). */
export const typeCodeFromName = (name: string) => foldTypeCode(name).slice(0, 64);
