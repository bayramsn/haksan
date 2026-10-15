import type { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { navigationVisibilityKeyFor } from '@haksan/shared';
import type { Tone } from '@/src/theme/theme';
import type { AuthTenant, AuthUser } from '@/src/api/endpoints';

/**
 * Modül kayıt defteri: Modüller ekranı ve modül yığınındaki erişim kapısı
 * buradan beslenir. Bir modül BURAYA ancak ekranı yazıldığında eklenir;
 * `key` aynı zamanda `app/(tabs)/modules/<key>` klasörüdür.
 */
export type ModuleGroup = 'general' | 'sales' | 'sales-ops' | 'operations' | 'service' | 'admin';

type ModuleGroupMeta = {
  key: ModuleGroup;
  title: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
};

/** Web kenar menüsü (`NAVIGATION_GROUPS`) sırası; son grup web kullanıcı menüsündeki yönetim sayfaları. */
export const moduleGroups: ModuleGroupMeta[] = [
  { key: 'general', title: 'Genel', hint: 'Takvim, görev ve saha planı', icon: 'today-outline' },
  { key: 'sales', title: 'Satış', hint: 'Firma, fırsat ve hedefler', icon: 'trending-up-outline' },
  { key: 'sales-ops', title: 'Satış Operasyonu', hint: 'Kontak, teklif ve ticari belgeler', icon: 'document-text-outline' },
  { key: 'operations', title: 'Operasyon', hint: 'Ürün, stok, finans ve sevkiyat', icon: 'layers-outline' },
  { key: 'service', title: 'Servis', hint: 'Makine, kurulum ve servis süreçleri', icon: 'construct-outline' },
  { key: 'admin', title: 'Rapor & Yönetim', hint: 'Raporlar, kullanıcılar ve yetkiler', icon: 'shield-checkmark-outline' },
];

export const groupTitles = Object.fromEntries(moduleGroups.map((group) => [group.key, group.title])) as Record<ModuleGroup, string>;

export type ModuleEntry = {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  group: ModuleGroup;
  route: Href;
  /** Sunucudaki izin kodu. Yoksa herkese açık. Sunucu ayrıca kendi kontrolünü yapar. */
  permission?: string;
  /** Birleşik modüller için bu izinlerden en az biri yeterlidir. */
  permissionsAny?: string[];
  /** Web sayfa anahtarı; kiracı görünürlüğü `navigationVisibilityKeyFor` ile çözülür. */
  navKey?: string;
  /** Web `MGMT_KEYS`: izinden bağımsız yalnız admin/super_admin görür. */
  adminOnly?: boolean;
};

type ModuleSeed = Omit<ModuleEntry, 'route'>;

const seeds: ModuleSeed[] = [
  { key: 'calendar', title: 'Takvim', icon: 'calendar-number-outline', tone: 'info', group: 'general', permission: 'calendar.read', navKey: 'calendar' },
  { key: 'tasks', title: 'Görevler', icon: 'checkbox-outline', tone: 'success', group: 'general', permission: 'tasks.read', navKey: 'tasks' },
  { key: 'activities', title: 'Aktiviteler', icon: 'pulse-outline', tone: 'neutral', group: 'general', permission: 'activities.read' },
  { key: 'trade-fairs', title: 'Fuar', icon: 'storefront-outline', tone: 'info', group: 'general', permission: 'trade_fairs.read', navKey: 'trade-fairs' },

  { key: 'companies', title: 'Firmalar', icon: 'business-outline', tone: 'info', group: 'sales', permission: 'companies.read', navKey: 'customers' },
  { key: 'opportunities', title: 'Fırsatlar', icon: 'briefcase-outline', tone: 'stage', group: 'sales', permission: 'opportunities.read', navKey: 'sales-cases' },
  { key: 'kanban', title: 'Fırsat Kanbanı', icon: 'albums-outline', tone: 'stage', group: 'sales', permission: 'opportunities.read', navKey: 'kanban' },
  { key: 'targets', title: 'Hedefler', icon: 'flag-outline', tone: 'success', group: 'sales' },
  {
    key: 'meta',
    title: 'Meta Merkezi',
    icon: 'megaphone-outline',
    tone: 'info',
    group: 'sales',
    permissionsAny: ['meta.read', 'meta_campaigns.read', 'meta_messages.read'],
    navKey: 'meta',
  },
  { key: 'references', title: 'Referanslar', icon: 'ribbon-outline', tone: 'stage', group: 'sales', permission: 'brands.read', navKey: 'references' },

  { key: 'contacts', title: 'Kontaklar', icon: 'people-outline', tone: 'info', group: 'sales-ops', permission: 'contacts.read', navKey: 'contacts' },
  { key: 'company-map', title: 'Firma Haritası', icon: 'map-outline', tone: 'success', group: 'sales-ops', permission: 'companies.read', navKey: 'sales-map' },
  { key: 'quotes', title: 'Teklifler', icon: 'document-text-outline', tone: 'warning', group: 'sales-ops', permission: 'quotes.read', navKey: 'offers' },
  {
    key: 'documents',
    title: 'Ticari Belgeler',
    icon: 'folder-open-outline',
    tone: 'warning',
    group: 'sales-ops',
    permissionsAny: ['proformas.read', 'contracts.read', 'commercial_invoices.read', 'files.read'],
    navKey: 'documents',
  },
  { key: 'proformas', title: 'Proformalar', icon: 'document-attach-outline', tone: 'info', group: 'sales-ops', permission: 'proformas.read', navKey: 'proformas' },
  { key: 'contracts', title: 'Sözleşmeler', icon: 'document-lock-outline', tone: 'stage', group: 'sales-ops', permission: 'contracts.read', navKey: 'contracts' },
  { key: 'price-lists', title: 'Satış Fiyat Listesi', icon: 'list-outline', tone: 'warning', group: 'sales-ops', permission: 'price_lists.read', navKey: 'sales-price-list' },
  { key: 'sales-orders', title: 'Satış Siparişleri', icon: 'receipt-outline', tone: 'success', group: 'sales-ops', permission: 'sales_orders.read' },

  { key: 'products', title: 'Ürünler', icon: 'pricetag-outline', tone: 'stage', group: 'operations', permission: 'products.read', navKey: 'products' },
  { key: 'inventory', title: 'Stoklar', icon: 'cube-outline', tone: 'info', group: 'operations', permission: 'inventory.read', navKey: 'stock' },
  { key: 'purchase-orders', title: 'Satın Alma', icon: 'cart-outline', tone: 'neutral', group: 'operations', permission: 'purchase_orders.read' },
  { key: 'payments', title: 'Ödemeler & Kasa', icon: 'swap-vertical-outline', tone: 'info', group: 'operations', permission: 'payments.read', navKey: 'payments' },
  { key: 'receivables', title: 'Tahsilatlar', icon: 'wallet-outline', tone: 'success', group: 'operations', permission: 'receivables.read' },
  {
    key: 'invoices',
    title: 'Muhasebe Faturaları',
    icon: 'document-outline',
    tone: 'warning',
    group: 'operations',
    permission: 'accounting_invoices.read',
    navKey: 'accounting-invoices',
  },
  { key: 'balances', title: 'Cari Rapor', icon: 'scale-outline', tone: 'stage', group: 'operations', permission: 'receivables.read', navKey: 'customer-balances' },
  { key: 'due-dates', title: 'Vade Takvimi', icon: 'calendar-outline', tone: 'destructive', group: 'operations', permission: 'payments.read', navKey: 'due-dates' },
  { key: 'shipments', title: 'Sevkiyat', icon: 'car-outline', tone: 'info', group: 'operations', permission: 'shipments.read', navKey: 'shipments' },

  { key: 'customer-devices', title: 'Makineler', icon: 'hardware-chip-outline', tone: 'neutral', group: 'service', permission: 'customer_devices.read', navKey: 'machines' },
  { key: 'installations', title: 'Kurulumlar', icon: 'hammer-outline', tone: 'info', group: 'service', permission: 'installations.read', navKey: 'installations' },
  { key: 'deliveries', title: 'Teslimat Kayıtları', icon: 'clipboard-outline', tone: 'info', group: 'service', permission: 'shipments.read', navKey: 'deliveries' },
  {
    key: 'service-tickets',
    title: 'Servis Talepleri',
    icon: 'construct-outline',
    tone: 'destructive',
    group: 'service',
    permission: 'service_tickets.read',
    navKey: 'service-requests',
  },
  { key: 'service-kanban', title: 'Servis Kanbanı', icon: 'grid-outline', tone: 'destructive', group: 'service', permission: 'service_tickets.read', navKey: 'service-kanban' },
  {
    key: 'service-complaints',
    title: 'Şikayet Kutusu',
    icon: 'chatbox-ellipses-outline',
    tone: 'warning',
    group: 'service',
    permission: 'service_tickets.read',
    navKey: 'service-requests',
  },
  { key: 'maintenance-plans', title: 'Bakım Planları', icon: 'build-outline', tone: 'success', group: 'service', permission: 'service_tickets.read' },
  {
    key: 'service-price-list',
    title: 'Servis Fiyat Listesi',
    icon: 'receipt-outline',
    tone: 'warning',
    group: 'service',
    permission: 'price_lists.read',
    navKey: 'service-price-list',
  },

  { key: 'reports', title: 'Raporlar', icon: 'stats-chart-outline', tone: 'stage', group: 'admin', permission: 'reports.read', navKey: 'reports' },
  { key: 'users', title: 'Kullanıcılar', icon: 'person-circle-outline', tone: 'info', group: 'admin', permission: 'users.read', navKey: 'users', adminOnly: true },
  { key: 'roles', title: 'Roller & Yetkiler', icon: 'shield-checkmark-outline', tone: 'stage', group: 'admin', permission: 'roles.read', navKey: 'roles', adminOnly: true },
  {
    key: 'departments',
    title: 'Departmanlar',
    icon: 'git-network-outline',
    tone: 'neutral',
    group: 'admin',
    permission: 'departments.read',
    navKey: 'departments',
    adminOnly: true,
  },
];

/** Rota anahtardan türetilir; katalog ile klasör yapısı ayrışamaz. */
const moduleHref = (key: string) => `/(tabs)/modules/${key}` as unknown as Href;

export const modules: ModuleEntry[] = seeds.map((seed) => ({ ...seed, route: moduleHref(seed.key) }));

function hasPermission(user: AuthUser | null, permission: string): boolean {
  if (!user) return false;
  if (user.roles.includes('super_admin')) return true;
  return user.permissions?.includes(permission) ?? false;
}

function isAdmin(user: AuthUser | null): boolean {
  return Boolean(user?.roles.some((role) => role === 'admin' || role === 'super_admin'));
}

/**
 * Kart görünürlüğü ile doğrudan deep-link erişimini aynı kurala bağlar.
 * Web `canAccessNavKey` + `isNavigationAreaEnabled` ile aynı: admin her modülü
 * görür, yönetim modülleri yalnız admine; kanban/proforma/teslimat gibi alt
 * sayfalar bağlı oldukları menü alanı gizlenince gizlenir.
 */
export function canAccessModule(
  user: AuthUser | null,
  tenant: AuthTenant | null,
  entry: ModuleEntry
): boolean {
  if (entry.adminOnly && !isAdmin(user)) return false;
  const permitted =
    isAdmin(user) ||
    (entry.permissionsAny?.length
      ? entry.permissionsAny.some((permission) => hasPermission(user, permission))
      : entry.permission
        ? hasPermission(user, entry.permission)
        : Boolean(user));
  if (!permitted) return false;
  const visibilityKey = entry.navKey ? navigationVisibilityKeyFor(entry.navKey) : null;
  return !visibilityKey || !tenant?.hiddenNavigationKeys.includes(visibilityKey);
}

/** Expo Router'ın parantezli ve parantezsiz path biçimlerini kabul eder. */
export function moduleForPath(pathname: string): ModuleEntry | null {
  const match = pathname.match(/\/(?:\(tabs\)\/)?modules\/([^/?#]+)/);
  if (!match?.[1]) return null;
  return modules.find((entry) => entry.key === match[1]) ?? null;
}

export function modulesByGroup(entries: ModuleEntry[] = modules): [ModuleGroupMeta, ModuleEntry[]][] {
  return moduleGroups
    .map((group) => [group, entries.filter((m) => m.group === group.key)] as [ModuleGroupMeta, ModuleEntry[]])
    .filter(([, list]) => list.length > 0);
}

/** Arama: modül adı ya da grup adı eşleşirse (ör. "servis" tüm Servis grubunu getirir). */
export function matchesModuleSearch(entry: ModuleEntry, term: string): boolean {
  const needle = term.trim().toLocaleLowerCase('tr');
  if (!needle) return true;
  return [entry.title, groupTitles[entry.group]].some((text) => text.toLocaleLowerCase('tr').includes(needle));
}
