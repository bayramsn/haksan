export type ImportLookupRow = {
  id: string; code: string; name: string; divisionId?: string | null; isActive?: boolean;
  productGroupId?: string | null; categoryId?: string | null; subcategoryId?: string | null; productTypeIds?: string[];
};
export type LookupCsvDraft = {
  row: number; name: string; code: string; description?: string; province?: string; division: string;
  parent?: string; types?: string; isActive?: boolean; sortOrder?: number; skip?: boolean;
};
export type LookupImportContext = {
  divisionId: string; divisions: Array<{ id: string; code: string; name: string }>; scoped: boolean;
  existing: ImportLookupRow[]; parents: ImportLookupRow[]; productTypes: ImportLookupRow[];
  parentField?: 'productGroupId' | 'categoryId' | 'subcategoryId'; defaultParentId?: string; isSpecGroup: boolean;
};
export const normalizeLookupText = (value: string) => value.trim().toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[\s-]+/g, '_');

export function parseLookupCsv(text: string): LookupCsvDraft[] {
  const input = text.replace(/^\uFEFF/, '');
  const firstLine = input.split(/\r?\n/)[0] ?? '';
  const delimiter = firstLine.includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') { if (quoted && input[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && ch === delimiter) { row.push(cell); cell = ''; }
    else if (!quoted && ch === '\n') { row.push(cell.replace(/\r$/, '')); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (quoted) throw new Error('CSV dosyasında kapanmamış tırnak var.');
  row.push(cell.replace(/\r$/, '')); if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length > 501) throw new Error('Tek aktarımda en fazla 500 kayıt olabilir.');
  const headers = (rows.shift() ?? []).map(normalizeLookupText);
  const index = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const nameIdx = index('ad', 'name', 'adi');
  if (nameIdx < 0) throw new Error('Ad sütunu zorunludur.');
  const value = (values: string[], ...names: string[]) => values[index(...names)]?.trim() ?? '';
  const parentIdx = headers.findIndex((header) => header.startsWith('bagli_oldugu_') || ['ust_kayit', 'parent', 'parent_code'].includes(header));
  const typesIdx = index('urun_tipleri', 'product_types');
  return rows.map((values, i) => {
    const sort = value(values, 'sira', 'sort_order', 'sortorder');
    return {
      row: i + 2, name: values[nameIdx]?.trim() ?? '', code: value(values, 'sistem_kodu', 'kod', 'code'),
      description: index('aciklama', 'description') >= 0 ? value(values, 'aciklama', 'description') : undefined,
      province: index('il', 'province') >= 0 ? value(values, 'il', 'province') : undefined,
      division: value(values, 'bolum', 'division'), parent: parentIdx >= 0 ? values[parentIdx]?.trim() ?? '' : undefined,
      types: typesIdx >= 0 ? values[typesIdx]?.trim() ?? '' : undefined,
      isActive: index('durum', 'status', 'active', 'aktif') >= 0 ? !['pasif', 'false', '0', 'hayir', 'passive'].includes(normalizeLookupText(value(values, 'durum', 'status', 'active', 'aktif'))) : undefined,
      sortOrder: sort ? Number(sort) : undefined,
    };
  });
}

function matchRows(rows: ImportLookupRow[], query: string, divisionId: string) {
  const normalized = normalizeLookupText(query);
  const matches = rows.filter((row) => row.id === query || normalizeLookupText(row.code) === normalized || normalizeLookupText(row.name) === normalized);
  const exact = matches.filter((row) => row.divisionId === divisionId);
  return exact.length ? exact : matches.filter((row) => !row.divisionId);
}

export function previewLookupCsv(drafts: LookupCsvDraft[], context: LookupImportContext) {
  return drafts.map((draft) => {
    const errors: string[] = [];
    if (!draft.name.trim()) errors.push('Ad zorunludur.');
    if (draft.name.length > 255 || draft.code.length > 64 || (draft.description?.length ?? 0) > 2000) errors.push('Alan uzunluk sınırı aşıldı.');
    if (draft.sortOrder !== undefined && (!Number.isInteger(draft.sortOrder) || draft.sortOrder < 0)) errors.push('Sıra sıfır veya pozitif tam sayı olmalıdır.');
    if (context.scoped && !context.divisionId) errors.push('Önce ayar bölümünü seçin.');
    if (context.scoped && draft.division) {
      const selected = context.divisions.find((division) => division.id === draft.division || normalizeLookupText(division.code) === normalizeLookupText(draft.division) || normalizeLookupText(division.name) === normalizeLookupText(draft.division));
      if (!selected) errors.push(`Bilinmeyen bölüm: ${draft.division}`);
      else if (selected.id !== context.divisionId) errors.push('Dosyanın bölümü seçili ayar bölümüyle farklı.');
    }
    const candidates = matchRows(context.existing, draft.code || draft.name, context.divisionId);
    const existing = candidates.length === 1 ? candidates[0] : undefined;
    if (candidates.length > 1) errors.push('Birden çok kayıt eşleşti; sistem kodunu belirtin.');
    if (context.scoped && existing && !existing.divisionId) errors.push('Ortak kayıt eşleşti; ortak kaydı düzenleyin veya ayrı bir sistem kodu kullanın.');
    if (drafts.some((other) => other.row !== draft.row && !other.skip && normalizeLookupText(other.code || other.name) === normalizeLookupText(draft.code || draft.name))) errors.push('Dosyada tekrarlanan kod/ad var.');
    let parentId: string | null | undefined;
    if (context.parentField) {
      if (draft.parent === undefined) parentId = existing?.[context.parentField] ?? context.defaultParentId;
      else if (['', 'tumu', 'ortak', 'bagimsiz'].includes(normalizeLookupText(draft.parent))) parentId = null;
      else {
        const found = matchRows(context.parents.filter((parent) => parent.isActive !== false), draft.parent, context.divisionId);
        if (found.length !== 1) errors.push(`Üst kayıt ${found.length ? 'birden çok kayıtla eşleşti' : 'bulunamadı'}: ${draft.parent}`);
        else parentId = found[0].id;
      }
      if (parentId === undefined && !existing) errors.push('Bağlı olduğu üst kaydı belirtin.');
    }
    let productTypeIds: string[] | undefined;
    if (context.isSpecGroup) {
      productTypeIds = draft.types === undefined ? existing?.productTypeIds ?? [] : [];
      if (draft.types && !['tum_tipler', 'tumu'].includes(normalizeLookupText(draft.types))) {
        for (const name of draft.types.split(/[,;]/).map((part) => part.trim()).filter(Boolean)) {
          const found = matchRows(context.productTypes.filter((type) => type.isActive !== false), name, context.divisionId);
          if (found.length !== 1) errors.push(`Ürün tipi eşleşmedi: ${name}`);
          else productTypeIds.push(found[0].id);
        }
      }
    }
    return {
      draft, existingId: existing?.id, errors, action: draft.skip ? 'skip' as const : existing ? 'update' as const : 'create' as const,
      body: { name: draft.name.trim(), code: existing ? undefined : draft.code || undefined, description: draft.description,
        province: draft.province || undefined, divisionId: context.scoped ? context.divisionId : undefined,
        parentId, productTypeIds, isActive: draft.isActive, sortOrder: draft.sortOrder },
    };
  });
}
