/** Web Contacts.tsx liste parametreleri; saf mantık (RN bağımlılığı yok). */

export type ContactSortValue = 'all' | 'name-asc' | 'name-desc' | 'createdAt-asc';
export type ContactTab = 'all' | 'primary';

export const CONTACT_SORT_OPTIONS: { value: ContactSortValue; label: string }[] = [
  { value: 'all', label: 'En yeni kayıt' },
  { value: 'name-asc', label: 'Ad (A-Z)' },
  { value: 'name-desc', label: 'Ad (Z-A)' },
  { value: 'createdAt-asc', label: 'En eski kayıt' },
];

export type ContactFilters = {
  search: string;
  tab: ContactTab;
  blacklistOnly: boolean;
  divisionId: string;
  department: string | null;
  companyId: string | null;
  sort: ContactSortValue;
};

export const DEFAULT_CONTACT_FILTERS: ContactFilters = {
  search: '',
  tab: 'all',
  blacklistOnly: false,
  divisionId: 'all',
  department: null,
  companyId: null,
  sort: 'all',
};

export function contactSort(value: ContactSortValue): { sortBy: 'name' | 'createdAt'; sortDir: 'asc' | 'desc' } {
  const [sortBy, sortDir] = (value === 'all' ? 'createdAt-desc' : value).split('-') as ['name' | 'createdAt', 'asc' | 'desc'];
  return { sortBy, sortDir };
}

export function buildContactQuery(filters: ContactFilters) {
  const search = filters.search.trim();
  return {
    ...(search ? { search } : {}),
    ...(filters.companyId ? { companyId: filters.companyId } : {}),
    ...(filters.department ? { department: filters.department } : {}),
    ...(filters.tab === 'primary' ? { isPrimary: true } : {}),
    ...(filters.blacklistOnly ? { isBlacklisted: true } : {}),
    ...(filters.divisionId !== 'all' ? { divisionId: filters.divisionId } : {}),
    ...contactSort(filters.sort),
  };
}

/** `/exports/contacts` boolean'ları metin olarak bekler (web exportParams). */
export function buildContactExportParams(filters: ContactFilters): Record<string, string> {
  const query = buildContactQuery(filters);
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = String(value);
  }
  return params;
}

export function activeContactFilterCount(filters: ContactFilters): number {
  return [filters.department, filters.companyId, filters.sort !== 'all' ? filters.sort : null, filters.blacklistOnly ? 'b' : null].filter(
    Boolean,
  ).length;
}
