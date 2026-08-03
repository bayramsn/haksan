export const NAVIGATION_VISIBILITY_KEYS = [
  'dashboard',
  'chat',
  'calendar',
  'call-assistant',
  'customers',
  'leads',
  'sales-cases',
  'references',
  'contacts',
  'sales-map',
  'offers',
  'documents',
  'sales-price-list',
  'products',
  'stock',
  'payments',
  'accounting-invoices',
  'customer-balances',
  'due-dates',
  'shipments',
  'machines',
  'installations',
  'service-requests',
  'service-kanban',
  'service-price-list',
] as const;

export type NavigationVisibilityKey = (typeof NAVIGATION_VISIBILITY_KEYS)[number];

const NAVIGATION_VISIBILITY_KEY_SET = new Set<string>(NAVIGATION_VISIBILITY_KEYS);

const NAVIGATION_VISIBILITY_ALIASES: Readonly<Record<string, NavigationVisibilityKey>> = {
  kanban: 'sales-cases',
  proformas: 'documents',
  contracts: 'documents',
  deliveries: 'installations',
};

/** Maps internal/legacy page names to the tenant-configurable navigation area. */
export function navigationVisibilityKeyFor(navKey: string): NavigationVisibilityKey | null {
  if (NAVIGATION_VISIBILITY_KEY_SET.has(navKey)) return navKey as NavigationVisibilityKey;
  return NAVIGATION_VISIBILITY_ALIASES[navKey] ?? null;
}

/** Management pages are always enabled; configurable areas honor the tenant setting. */
export function isNavigationAreaEnabled(
  navKey: string,
  hiddenKeys: readonly NavigationVisibilityKey[] | null | undefined,
): boolean {
  const visibilityKey = navigationVisibilityKeyFor(navKey);
  return visibilityKey === null || !hiddenKeys?.includes(visibilityKey);
}

export const NAVIGATION_GROUPS = [
  {
    group: 'Genel',
    items: [
      { key: 'dashboard', label: 'Gösterge Paneli' },
      { key: 'chat', label: 'Sohbet' },
      { key: 'calendar', label: 'Takvim' },
      { key: 'call-assistant', label: 'Çağrı Asistanı' },
    ],
  },
  {
    group: 'Satış',
    items: [
      { key: 'customers', label: 'Firmalar' },
      { key: 'leads', label: 'Leadler' },
      { key: 'sales-cases', label: 'Fırsatlar' },
      { key: 'references', label: 'Referanslar' },
    ],
  },
  {
    group: 'Satış Operasyonu',
    items: [
      { key: 'contacts', label: 'Kontaklar' },
      { key: 'sales-map', label: 'Firma Haritası' },
      { key: 'offers', label: 'Teklifler' },
      { key: 'documents', label: 'Ticari Belge Merkezi' },
      { key: 'sales-price-list', label: 'Satış Fiyat Listesi' },
    ],
  },
  {
    group: 'Operasyon',
    items: [
      { key: 'products', label: 'Ürünler' },
      { key: 'stock', label: 'Stok' },
      { key: 'payments', label: 'Ödemeler & Kasa' },
      { key: 'accounting-invoices', label: 'Muhasebe Faturaları' },
      { key: 'customer-balances', label: 'Cari Rapor' },
      { key: 'due-dates', label: 'Vade Takvimi' },
      { key: 'shipments', label: 'Sevkiyat' },
    ],
  },
  {
    group: 'Servis',
    items: [
      { key: 'machines', label: 'Makineler' },
      { key: 'installations', label: 'Kurulum' },
      { key: 'service-requests', label: 'Servis Talepleri' },
      { key: 'service-kanban', label: 'Servis Kanban' },
      { key: 'service-price-list', label: 'Servis Fiyat Listesi' },
    ],
  },
] as const;
