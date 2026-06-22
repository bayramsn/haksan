/**
 * Mobil modül kayıt defteri — web `Layout.tsx` NAV gruplarının ve rol/izin
 * bazlı görünürlüğünün (`canSee`) yansıması. Her modül anahtarı, ekran
 * kayıt defterindeki (`screens.ts`) bir bileşene karşılık gelir; henüz
 * yazılmamış modüller placeholder gösterir.
 */
export type ModuleItem = { key: string; label: string; roles?: string[] };
export type ModuleGroup = { group: string; items: ModuleItem[] };

const MGMT_KEYS = new Set<string>(['users', 'roles', 'departments', 'settings']);

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    group: 'Genel',
    items: [
      { key: 'dashboard', label: 'Gösterge Paneli' },
      { key: 'chat', label: 'Sohbet' },
      { key: 'calendar', label: 'Takvim' },
    ],
  },
  {
    group: 'Satış',
    items: [
      { key: 'customers', label: 'Firmalar', roles: ['sales', 'service', 'finance'] },
      { key: 'contacts', label: 'Kontaklar', roles: ['sales', 'service'] },
      { key: 'sales-cases', label: 'Satış Kartları', roles: ['sales'] },
      { key: 'offers', label: 'Teklifler', roles: ['sales', 'finance'] },
      { key: 'proformas', label: 'Proformalar', roles: ['sales', 'finance'] },
      { key: 'contracts', label: 'Sözleşmeler', roles: ['sales', 'finance'] },
      { key: 'sales-price-list', label: 'Satış Fiyat Listesi', roles: ['sales'] },
    ],
  },
  {
    group: 'Operasyon',
    items: [
      { key: 'products', label: 'Ürünler', roles: ['sales', 'service', 'stock'] },
      { key: 'stock', label: 'Stok', roles: ['stock'] },
      { key: 'purchase-orders', label: 'Satın Alma', roles: ['stock', 'finance'] },
      { key: 'payments', label: 'Ödemeler & Kasa', roles: ['finance'] },
      { key: 'accounting-invoices', label: 'Muhasebe Faturaları', roles: ['finance', 'sales'] },
      { key: 'customer-balances', label: 'Cari Rapor', roles: ['finance'] },
      { key: 'due-dates', label: 'Vade Takvimi', roles: ['finance'] },
      { key: 'shipments', label: 'Sevkiyat', roles: ['stock'] },
      { key: 'deliveries', label: 'Teslimat', roles: ['stock', 'service'] },
    ],
  },
  {
    group: 'Servis',
    items: [
      { key: 'machines', label: 'Makineler', roles: ['service', 'stock'] },
      { key: 'installations', label: 'Kurulum', roles: ['service'] },
      { key: 'service-requests', label: 'Servis Talepleri', roles: ['service'] },
      { key: 'service-kanban', label: 'Servis Kanban', roles: ['service'] },
      { key: 'service-price-list', label: 'Servis Fiyat Listesi', roles: ['service'] },
    ],
  },
  {
    group: 'Raporlar',
    items: [{ key: 'reports', label: 'Raporlar', roles: ['sales', 'finance'] }],
  },
  {
    group: 'Yönetim',
    items: [
      { key: 'users', label: 'Kullanıcılar' },
      { key: 'roles', label: 'Roller' },
      { key: 'departments', label: 'Departmanlar' },
      { key: 'settings', label: 'Ayarlar' },
    ],
  },
];

/** Web `canSee` ile birebir: admin her şeyi, readonly yönetim hariç her şeyi, diğerleri rolüne göre. */
export function canSeeModule(item: ModuleItem, hasRole: (code: string) => boolean): boolean {
  if (hasRole('admin') || hasRole('super_admin')) return true;
  if (hasRole('readonly')) return !MGMT_KEYS.has(item.key);
  // Yönetim grubu yalnız admin/super_admin (yukarıda döndü).
  if (MGMT_KEYS.has(item.key)) return false;
  if (!item.roles) return true;
  return item.roles.some((r) => hasRole(r));
}
