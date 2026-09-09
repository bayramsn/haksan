/** Product taxonomy IDs must be resolved inside the selected division and parent family. */
export type ImportLookupRow = { id: string; code: string; name: string; divisionId?: string | null; parentId?: string | null };
export type ImportTaxonomy = { productGroups: ImportLookupRow[]; productCategories: ImportLookupRow[]; productSubcategories: ImportLookupRow[]; productTypes: ImportLookupRow[]; productSpecGroups: ImportLookupRow[]; equipmentTypes: ImportLookupRow[]; currencies: ImportLookupRow[] };
export const importCode = (value: string) => value.trim().toLocaleUpperCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '_');

export function legacyTypeDivision(code: string): string | undefined {
  const value = importCode(code);
  if (value.startsWith('CNC_') || ['DIK_ISLEME_MERKEZI', 'KOPRU_TIPI_ISLEME_MERKEZI'].includes(value)) return 'CNC';
  if (value.startsWith('UNIVERSAL_') || ['RADYAL_MATKAP', 'SATIH_TASLAMA'].includes(value)) return 'UNIVERSAL';
  if (['ABKANT_PRES', 'SILINDIR_MAKINESI', 'GIYOTIN_MAKAS', 'FIBER_LAZER_KESIM', 'BORU_LAZER_KESIM', 'PLAZMA_KESIM'].includes(value)) return 'SAC_ISLEME';
  return undefined;
}

export function scopeImportTaxonomy(all: ImportTaxonomy, divisionId: string, groupCode: string, establishedTypeIds: Set<string> = new Set()): ImportTaxonomy {
  const inDivision = (row: ImportLookupRow) => !row.divisionId || row.divisionId === divisionId;
  const preferred = (rows: ImportLookupRow[]) => [...rows].sort((a, b) => Number(b.divisionId === divisionId) - Number(a.divisionId === divisionId) || a.id.localeCompare(b.id));
  const groups = all.productGroups.filter((row) => row.divisionId === divisionId || (!row.divisionId && importCode(row.code) === groupCode));
  const childRows = (rows: ImportLookupRow[], parents: ImportLookupRow[]) => rows.filter((row) => inDivision(row) && (!row.parentId || parents.some((parent) => parent.id === row.parentId)));
  const categories = childRows(all.productCategories, groups);
  const subcategories = childRows(all.productSubcategories, categories);
  const types = childRows(all.productTypes, subcategories).filter((type) => {
    if (type.divisionId) return true;
    const family = legacyTypeDivision(type.code);
    if (family) return family === groupCode;
    const subcategory = subcategories.find((row) => row.id === type.parentId);
    const category = categories.find((row) => row.id === subcategory?.parentId);
    const group = groups.find((row) => row.id === category?.parentId);
    return !!(subcategory?.divisionId || category?.divisionId || group || establishedTypeIds.has(type.id));
  });
  return { ...all, productGroups: preferred(groups), productCategories: preferred(categories), productSubcategories: preferred(subcategories), productTypes: preferred(types), productSpecGroups: preferred(all.productSpecGroups.filter(inDivision)) };
}

/** A shared legacy parent and its division copy represent the same code within this already-scoped tree. */
export function importChildren(rows: ImportLookupRow[], parent: ImportLookupRow | undefined, parents: ImportLookupRow[]): ImportLookupRow[] {
  if (!parent) return rows.filter((row) => !row.parentId);
  return rows.filter((row) => !row.parentId || row.parentId === parent.id || parents.some((candidate) => candidate.id === row.parentId && importCode(candidate.code) === importCode(parent.code)));
}
