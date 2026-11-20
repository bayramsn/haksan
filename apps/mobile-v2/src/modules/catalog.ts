import type { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { NAVIGATION_GROUPS, type NavigationVisibilityKey } from '@haksan/shared';
import type { Tone } from '@/src/theme/theme';
import type { AuthTenant, AuthUser } from '@/src/api/endpoints';

/**
 * Modül kayıt defteri: rota, izin ve tenant görünürlüğü. Modüller ekranının
 * düzeni burada değil, webMenu() ile web menüsünden gelir.
 */
export type ModuleEntry = {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  route: Href;
  /** Sunucudaki izin kodu. Yoksa herkese açık. Sunucu ayrıca kendi kontrolünü yapar. */
  permission?: string;
  /** Birleşik modüller için bu izinlerden en az biri yeterlidir. */
  permissionsAny?: string[];
  /** Web tenant ayarlarındaki görünürlük anahtarı. */
  navKey?: string;
  navKeysAny?: string[];
  /**
   * Web menüsünde kendi satırı olmayan sayfa; webdeki gibi bu ana sayfanın
   * içinden açılır (ör. Tahsilatlar → Ödemeler & Kasa).
   */
  parent?: string;
};

export const modules: ModuleEntry[] = [
  {
    key: 'trade-fairs', title: 'Fuar', icon: 'people-outline', tone: 'neutral', route: '/modules/trade-fairs' as Href,
    permission: 'trade_fairs.read', navKey: 'trade-fairs',
  },
  {
    key: 'references', title: 'Referanslar', icon: 'ribbon-outline', tone: 'success', route: '/modules/references' as Href,
    permission: 'companies.read', navKey: 'references',
  },
  {
    key: 'companies',
    title: 'Firmalar',
    icon: 'business-outline',
    tone: 'info',
    route: '/modules/companies' as Href,
    permission: 'companies.read',
    navKey: 'customers',
  },
  {
    key: 'company-map',
    title: 'Firma Haritası',
    icon: 'map-outline',
    tone: 'success',
    route: '/modules/company-map' as Href,
    permission: 'companies.read',
    navKey: 'sales-map',
  },
  {
    key: 'contacts',
    title: 'Kontaklar',
    icon: 'people-outline',
    tone: 'info',
    route: '/modules/contacts' as Href,
    permission: 'contacts.read',
    navKey: 'contacts',
  },
  {
    key: 'opportunities',
    title: 'Fırsat',
    icon: 'briefcase-outline',
    tone: 'stage',
    route: '/modules/opportunities' as Href,
    permission: 'opportunities.read',
    navKey: 'sales-cases',
  },
  // Called by webMenu/mobileMenu, canAccessModule, TodayScreen access('quotes').
  // PDF is prepared on the server; mobile only drafts via API and shares ready PDFs.
  {
    key: 'quotes',
    title: 'Teklifler',
    icon: 'document-text-outline',
    tone: 'warning',
    route: '/modules/quotes' as Href,
    permission: 'quotes.read',
    navKey: 'offers',
  },
  {
    key: 'tasks',
    title: 'Görevler',
    icon: 'checkbox-outline',
    tone: 'success',
    route: '/modules/tasks' as Href,
    permission: 'tasks.read',
    navKey: 'tasks',
  },
  {
    key: 'activities',
    title: 'Aktiviteler',
    icon: 'pulse-outline',
    tone: 'neutral',
    route: '/modules/activities' as Href,
    permission: 'activities.read',
    parent: 'opportunities',
  },

  {
    key: 'service-tickets',
    title: 'Servis Talepleri',
    icon: 'construct-outline',
    tone: 'destructive',
    route: '/modules/service-tickets' as Href,
    permission: 'service_tickets.read',
    navKeysAny: ['service-requests', 'service-kanban'],
  },
  {
    key: 'service-complaints',
    title: 'Gelen Şikayetler',
    icon: 'chatbox-ellipses-outline',
    tone: 'warning',
    route: '/modules/service-complaints' as Href,
    permission: 'service_tickets.read',
    navKeysAny: ['service-requests', 'service-kanban'],
    parent: 'service-tickets',
  },
  {
    key: 'installations',
    title: 'Kurulum',
    icon: 'hammer-outline',
    tone: 'info',
    route: '/modules/installations' as Href,
    permission: 'installations.read',
    navKey: 'installations',
  },
  {
    key: 'shipments',
    title: 'Sevkiyat',
    icon: 'car-outline',
    tone: 'info',
    route: '/modules/shipments' as Href,
    permission: 'shipments.read',
    navKey: 'shipments',
  },
  {
    key: 'maintenance-plans',
    title: 'Bakım Planları',
    icon: 'build-outline',
    tone: 'success',
    route: '/modules/maintenance-plans' as Href,
    permission: 'service_tickets.read',
    parent: 'customer-devices',
  },
  {
    key: 'customer-devices',
    title: 'Makineler',
    icon: 'hardware-chip-outline',
    tone: 'neutral',
    route: '/modules/customer-devices' as Href,
    permission: 'customer_devices.read',
    navKey: 'machines',
  },

  {
    key: 'inventory',
    title: 'Stok',
    icon: 'cube-outline',
    tone: 'info',
    route: '/modules/inventory' as Href,
    permission: 'inventory.read',
    navKey: 'stock',
  },
  {
    key: 'products',
    title: 'Ürünler',
    icon: 'pricetag-outline',
    tone: 'stage',
    route: '/modules/products' as Href,
    permission: 'products.read',
    navKey: 'products',
  },
  {
    key: 'price-lists',
    title: 'Fiyat Listeleri',
    icon: 'list-outline',
    tone: 'warning',
    route: '/modules/price-lists' as Href,
    permission: 'price_lists.read',
    navKeysAny: ['sales-price-list', 'service-price-list'],
  },
  {
    key: 'sales-orders',
    title: 'Satış Siparişleri',
    icon: 'receipt-outline',
    tone: 'success',
    route: '/modules/sales-orders' as Href,
    permission: 'sales_orders.read',
    parent: 'quotes',
  },
  {
    key: 'purchase-orders',
    title: 'Satın Alma',
    icon: 'cart-outline',
    tone: 'neutral',
    route: '/modules/purchase-orders' as Href,
    permission: 'purchase_orders.read',
    parent: 'inventory',
  },

  {
    key: 'receivables',
    title: 'Tahsilatlar',
    icon: 'wallet-outline',
    tone: 'success',
    route: '/modules/receivables' as Href,
    permission: 'receivables.read',
    parent: 'payments',
  },
  {
    key: 'payments',
    title: 'Ödemeler & Kasa',
    icon: 'swap-vertical-outline',
    tone: 'info',
    route: '/modules/payments' as Href,
    permission: 'payments.read',
    navKey: 'payments',
  },
  {
    key: 'invoices',
    title: 'Muhasebe Faturaları',
    icon: 'document-outline',
    tone: 'warning',
    route: '/modules/invoices' as Href,
    permission: 'accounting_invoices.read',
    navKey: 'accounting-invoices',
  },
  {
    key: 'balances',
    title: 'Cari Rapor',
    icon: 'scale-outline',
    tone: 'stage',
    route: '/modules/balances' as Href,
    permission: 'receivables.read',
    navKey: 'customer-balances',
  },
  {
    key: 'due-dates',
    title: 'Vade Takvimi',
    icon: 'calendar-outline',
    tone: 'destructive',
    route: '/modules/due-dates' as Href,
    permission: 'receivables.read',
    navKey: 'due-dates',
  },

  {
    key: 'calendar',
    title: 'Takvim',
    icon: 'calendar-number-outline',
    tone: 'info',
    route: '/calendar' as Href,
    permission: 'calendar.read',
    navKey: 'calendar',
  },
  {
    key: 'reports',
    title: 'Raporlar',
    icon: 'stats-chart-outline',
    tone: 'stage',
    route: '/modules/reports' as Href,
    permission: 'reports.read',
    navKey: 'reports',
  },
  {
    key: 'documents',
    title: 'Ticari Belge Merkezi',
    icon: 'folder-open-outline',
    tone: 'warning',
    route: '/modules/documents' as Href,
    permissionsAny: ['proformas.read', 'contracts.read', 'commercial_invoices.read', 'files.read'],
    navKey: 'documents',
  },
];

function hasPermission(user: AuthUser | null, permission: string): boolean {
  if (!user) return false;
  if (user.roles.includes('super_admin')) return true;
  return user.permissions?.includes(permission) ?? false;
}

/** Kart görünürlüğü ile doğrudan deep-link erişimini aynı kurala bağlar. */
export function canAccessModule(
  user: AuthUser | null,
  tenant: AuthTenant | null,
  entry: ModuleEntry
): boolean {
  const permitted = entry.permissionsAny?.length
    ? entry.permissionsAny.some((permission) => hasPermission(user, permission))
    : entry.permission
      ? hasPermission(user, entry.permission)
      : Boolean(user);
  if (!permitted) return false;
  // Alt sayfa, tenant ana sayfayı gizlediyse onunla birlikte gizlenir (yetki ayrı kalır).
  const parent = entry.parent ? modules.find((candidate) => candidate.key === entry.parent) : undefined;
  if (parent && !tenantShows(tenant, parent)) return false;
  return tenantShows(tenant, entry);
}

function tenantShows(tenant: AuthTenant | null, entry: ModuleEntry): boolean {
  if (entry.navKeysAny?.length) return entry.navKeysAny.some((key) => !tenant?.hiddenNavigationKeys.includes(key));
  return !entry.navKey || !tenant?.hiddenNavigationKeys.includes(entry.navKey);
}

/** Expo Router'ın parantezli ve parantezsiz path biçimlerini kabul eder. */
export function moduleForPath(pathname: string): ModuleEntry | null {
  const match = pathname.match(/\/(?:\(tabs\)\/)?modules\/([^/?#]+)/);
  if (!match?.[1]) return null;
  return modules.find((entry) => entry.key === match[1]) ?? null;
}

type MenuTarget = {
  /** Katalogdaki modül; yetki ve görünürlük kontrolü ondan gelir. */
  module?: string;
  route?: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

/**
 * Web menüsündeki her satırın mobildeki karşılığı. Ad ve sıra webden
 * (`NAVIGATION_GROUPS`) okunur; burada yalnız hedef ekran durur. `null` olanlar
 * bilinçli olarak yalnız webde (yönetim ekranları).
 */
const WEB_MENU_TARGETS: Record<NavigationVisibilityKey, MenuTarget | null> = {
  dashboard: { route: '/', icon: 'home-outline' },
  chat: { route: '/chat', icon: 'chatbubbles-outline' },
  calendar: { module: 'calendar', route: '/calendar' },
  tasks: { module: 'tasks' },
  'trade-fairs': { module: 'trade-fairs' },
  customers: { module: 'companies' },
  'sales-cases': { module: 'opportunities' },
  meta: null,
  references: { module: 'references' },
  contacts: { module: 'contacts' },
  'sales-map': { module: 'company-map' },
  offers: { module: 'quotes' },
  documents: { module: 'documents' },
  'sales-price-list': { module: 'price-lists', route: '/modules/price-lists?kind=sales' },
  products: { module: 'products' },
  stock: { module: 'inventory' },
  payments: { module: 'payments' },
  'accounting-invoices': { module: 'invoices' },
  'customer-balances': { module: 'balances' },
  'due-dates': { module: 'due-dates' },
  shipments: { module: 'shipments' },
  machines: { module: 'customer-devices' },
  installations: { module: 'installations' },
  'service-requests': { module: 'service-tickets', route: '/modules/service-tickets?view=list' },
  'service-kanban': { module: 'service-tickets', route: '/modules/service-tickets?view=board', icon: 'albums-outline' },
  'service-price-list': { module: 'price-lists', route: '/modules/price-lists?kind=service' },
};

// route düz string: tipli rota birleşimi bu ifadelerde TS2590 veriyor; router'a verirken `as Href`.
export type MenuItem = { key: string; title: string; icon: keyof typeof Ionicons.glyphMap; route: string };
export type MenuGroup = { title: string; items: MenuItem[] };

/** Modüller ekranı: web menüsüyle aynı grup, ad ve sıra; yetkisi olmayan satır görünmez. */
export function webMenu(user: AuthUser | null, tenant: AuthTenant | null): MenuGroup[] {
  const hidden = tenant?.hiddenNavigationKeys ?? [];
  const groups: MenuGroup[] = NAVIGATION_GROUPS.map((group) => ({
    title: group.group,
    items: group.items.flatMap((item): MenuItem[] => {
      const target = WEB_MENU_TARGETS[item.key];
      if (!target || hidden.includes(item.key)) return [];
      const entry = target.module ? modules.find((candidate) => candidate.key === target.module) : undefined;
      if (target.module && (!entry || !canAccessModule(user, tenant, entry))) return [];
      if (!target.module && !user) return [];
      const icon = target.icon ?? entry?.icon ?? 'ellipse-outline';
      return [{ key: item.key, title: item.label, icon, route: target.route ?? (entry!.route as string) }];
    }),
  }));
  // Web'de Raporlar menünün altında ayrı durur; mobilde son grup.
  const reports = modules.find((entry) => entry.key === 'reports')!;
  groups.push({ title: 'Raporlar', items: canAccessModule(user, tenant, reports) ? [{ key: 'reports', title: reports.title, icon: reports.icon, route: reports.route as string }] : [] });
  return groups.filter((group) => group.items.length > 0);
}

/** Ana sayfanın içinden açılan alt sayfalar (webdeki sekme/bağlantı karşılığı). */
export function childPages(parent: string, user: AuthUser | null, tenant: AuthTenant | null): ModuleEntry[] {
  return modules.filter((entry) => entry.parent === parent && canAccessModule(user, tenant, entry));
}

/** Mobile presentation only; web menu, permissions and view-specific routes stay intact. */
const MOBILE_GROUPS = [
  { title: 'Satış ve Müşteriler', keys: ['trade-fairs', 'customers', 'sales-cases', 'references', 'contacts', 'sales-map', 'offers', 'documents', 'sales-price-list'] },
  { title: 'Saha ve Servis', keys: ['machines', 'installations', 'service-requests', 'service-kanban', 'service-price-list'] },
  { title: 'Operasyon ve Stok', keys: ['shipments', 'products', 'stock'] },
  { title: 'Finans', keys: ['payments', 'accounting-invoices', 'customer-balances', 'due-dates'] },
  { title: 'Yönetim ve Raporlar', keys: ['dashboard', 'chat', 'calendar', 'tasks', 'reports'] },
];

export function mobileMenu(user: AuthUser | null, tenant: AuthTenant | null): MenuGroup[] {
  const available = new Map(webMenu(user, tenant).flatMap(group => group.items).map(item => [item.key, item]));
  return MOBILE_GROUPS.map(group => ({
    title: group.title,
    items: group.keys.flatMap(key => {
      const item = available.get(key);
      return item ? [item] : [];
    }),
  })).filter(group => group.items.length > 0);
}
