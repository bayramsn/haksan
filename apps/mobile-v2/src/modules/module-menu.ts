import { NAVIGATION_GROUPS, navigationVisibilityKeyFor } from '@haksan/shared';

type MenuEntry = { key: string; title: string; navKey?: string; group: string };
export const MODULE_MENU_GROUPS = [...NAVIGATION_GROUPS.map((group) => group.group), 'Yönetim'];
const EXTRA_GROUPS: Record<string, string> = {
  general: 'Genel', sales: 'Satış', 'sales-ops': 'Satış Operasyonu', catalog: 'Operasyon',
  finance: 'Operasyon', logistics: 'Operasyon', service: 'Servis', admin: 'Yönetim',
};

function placement(entry: MenuEntry) {
  if (entry.group === 'admin') return { group: 'Yönetim', order: Infinity, title: entry.title };
  const key = navigationVisibilityKeyFor(entry.navKey ?? entry.key);
  for (const group of NAVIGATION_GROUPS) {
    const index = group.items.findIndex((item) => item.key === key);
    const item = group.items[index];
    if (item) {
      return { group: group.group, order: index, title: entry.navKey === item.key ? item.label : entry.title };
    }
  }
  return { group: EXTRA_GROUPS[entry.group] ?? 'Yönetim', order: Infinity, title: entry.title };
}

/** Input is already access-filtered; preserve every mobile entry and its original route. */
export function buildModuleMenu<T extends MenuEntry>(entries: readonly T[], search = ''): { title: string; entries: T[] }[] {
  const needle = search.trim().toLocaleLowerCase('tr');
  const placed = entries.map((entry) => ({ entry, ...placement(entry) }));
  return MODULE_MENU_GROUPS.map((title) => ({
    title,
    entries: placed.filter((item) => item.group === title && (!needle ||
      [item.entry.title, item.title, title].some((text) => text.toLocaleLowerCase('tr').includes(needle))))
      .sort((a, b) => a.order - b.order)
      .map((item) => ({ ...item.entry, title: item.title })),
  })).filter((group) => group.entries.length > 0);
}
