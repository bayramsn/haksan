import type { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import type { Tone } from '@/src/theme/theme';
import type { AuthTenant, AuthUser } from '@/src/api/endpoints';

/**
 * Modül kayıt defteri. Üç yer buradan besleniyor: Modüller ızgarası, "Daha
 * Fazla" listesi ve komut paleti. Bir modül BURAYA ancak ekranı yazıldığında
 * eklenir — ızgarada tıklanınca boş açılan kart olmasın.
 */
export type ModuleGroup = 'sales' | 'operations' | 'inventory' | 'finance' | 'insight' | 'admin';

export const groupTitles: Record<ModuleGroup, string> = {
  sales: 'Satış & CRM',
  operations: 'Operasyon',
  inventory: 'Stok & Ürün',
  finance: 'Finans',
  insight: 'Analiz & Belge',
  admin: 'Yönetim',
};

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
  /** Web tenant ayarlarındaki görünürlük anahtarı. */
  navKey?: string;
  /** Web `MGMT_KEYS`: izinden bağımsız yalnız admin/super_admin görür. */
  adminOnly?: boolean;
};

export const modules: ModuleEntry[] = [
  {
    key: 'companies',
    title: 'Firmalar',
    icon: 'business-outline',
    tone: 'info',
    group: 'sales',
    route: '/(tabs)/modules/companies' as Href,
    permission: 'companies.read',
    navKey: 'customers',
  },
  {
    key: 'company-map',
    title: 'Firma Haritası',
    icon: 'map-outline',
    tone: 'success',
    group: 'sales',
    route: '/(tabs)/modules/company-map' as Href,
    permission: 'companies.read',
    navKey: 'sales-map',
  },
  {
    key: 'contacts',
    title: 'Kontaklar',
    icon: 'people-outline',
    tone: 'info',
    group: 'sales',
    route: '/(tabs)/modules/contacts' as Href,
    permission: 'contacts.read',
    navKey: 'contacts',
  },
  {
    key: 'opportunities',
    title: 'Fırsatlar',
    icon: 'briefcase-outline',
    tone: 'stage',
    group: 'sales',
    route: '/(tabs)/modules/opportunities' as Href,
    permission: 'opportunities.read',
    navKey: 'sales-cases',
  },
  {
    key: 'kanban',
    title: 'Fırsat Kanbanı',
    icon: 'albums-outline',
    tone: 'stage',
    group: 'sales',
    route: '/(tabs)/modules/kanban' as Href,
    permission: 'opportunities.read',
    navKey: 'kanban',
  },
  {
    key: 'targets',
    title: 'Hedefler',
    icon: 'flag-outline',
    tone: 'success',
    group: 'sales',
    route: '/(tabs)/modules/targets' as Href,
  },
  {
    key: 'quotes',
    title: 'Teklifler',
    icon: 'document-text-outline',
    tone: 'warning',
    group: 'sales',
    route: '/(tabs)/modules/quotes' as Href,
    permission: 'quotes.read',
    navKey: 'offers',
  },
  {
    key: 'tasks',
    title: 'Görevler',
    icon: 'checkbox-outline',
    tone: 'success',
    group: 'sales',
    route: '/(tabs)/modules/tasks' as Href,
    permission: 'tasks.read',
    navKey: 'tasks',
  },
  {
    key: 'activities',
    title: 'Aktiviteler',
    icon: 'pulse-outline',
    tone: 'neutral',
    group: 'sales',
    route: '/(tabs)/modules/activities' as Href,
    permission: 'activities.read',
  },
  {
    key: 'trade-fairs',
    title: 'Fuar',
    icon: 'storefront-outline',
    tone: 'info',
    group: 'sales',
    route: '/(tabs)/modules/trade-fairs' as Href,
    permission: 'trade_fairs.read',
    navKey: 'trade-fairs',
  },
  {
    key: 'references',
    title: 'Referanslar',
    icon: 'ribbon-outline',
    tone: 'stage',
    group: 'sales',
    route: '/(tabs)/modules/references' as Href,
    permission: 'brands.read',
    navKey: 'references',
  },
  {
    key: 'meta',
    title: 'Meta Merkezi',
    icon: 'megaphone-outline',
    tone: 'info',
    group: 'sales',
    route: '/(tabs)/modules/meta' as Href,
    permissionsAny: ['meta.read', 'meta_campaigns.read', 'meta_messages.read'],
    navKey: 'meta',
  },

  {
    key: 'service-tickets',
    title: 'Servis Talepleri',
    icon: 'construct-outline',
    tone: 'destructive',
    group: 'operations',
    route: '/(tabs)/modules/service-tickets' as Href,
    permission: 'service_tickets.read',
    navKey: 'service-requests',
  },
  {
    key: 'service-kanban',
    title: 'Servis Kanbanı',
    icon: 'grid-outline',
    tone: 'destructive',
    group: 'operations',
    route: '/(tabs)/modules/service-kanban' as Href,
    permission: 'service_tickets.read',
    navKey: 'service-kanban',
  },
  {
    key: 'service-price-list',
    title: 'Servis Fiyat Listesi',
    icon: 'receipt-outline',
    tone: 'warning',
    group: 'operations',
    route: '/(tabs)/modules/service-price-list' as Href,
    permission: 'price_lists.read',
    navKey: 'service-price-list',
  },
  {
    key: 'service-complaints',
    title: 'Gelen Şikayetler',
    icon: 'chatbox-ellipses-outline',
    tone: 'warning',
    group: 'operations',
    route: '/(tabs)/modules/service-complaints' as Href,
    permission: 'service_tickets.read',
    navKey: 'service-requests',
  },
  {
    key: 'installations',
    title: 'Kurulumlar',
    icon: 'hammer-outline',
    tone: 'info',
    group: 'operations',
    route: '/(tabs)/modules/installations' as Href,
    permission: 'installations.read',
    navKey: 'installations',
  },
  {
    key: 'shipments',
    title: 'Sevkiyatlar',
    icon: 'car-outline',
    tone: 'info',
    group: 'operations',
    route: '/(tabs)/modules/shipments' as Href,
    permission: 'shipments.read',
    navKey: 'shipments',
  },
  {
    key: 'maintenance-plans',
    title: 'Bakım Planları',
    icon: 'build-outline',
    tone: 'success',
    group: 'operations',
    route: '/(tabs)/modules/maintenance-plans' as Href,
    permission: 'service_tickets.read',
  },
  {
    key: 'customer-devices',
    title: 'Makine Parkı',
    icon: 'hardware-chip-outline',
    tone: 'neutral',
    group: 'operations',
    route: '/(tabs)/modules/customer-devices' as Href,
    permission: 'customer_devices.read',
    navKey: 'machines',
  },

  {
    key: 'inventory',
    title: 'Stoklar',
    icon: 'cube-outline',
    tone: 'info',
    group: 'inventory',
    route: '/(tabs)/modules/inventory' as Href,
    permission: 'inventory.read',
    navKey: 'stock',
  },
  {
    key: 'products',
    title: 'Ürünler',
    icon: 'pricetag-outline',
    tone: 'stage',
    group: 'inventory',
    route: '/(tabs)/modules/products' as Href,
    permission: 'products.read',
    navKey: 'products',
  },
  {
    key: 'price-lists',
    title: 'Fiyat Listeleri',
    icon: 'list-outline',
    tone: 'warning',
    group: 'inventory',
    route: '/(tabs)/modules/price-lists' as Href,
    permission: 'price_lists.read',
    navKey: 'sales-price-list',
  },
  {
    key: 'sales-orders',
    title: 'Satış Siparişleri',
    icon: 'receipt-outline',
    tone: 'success',
    group: 'inventory',
    route: '/(tabs)/modules/sales-orders' as Href,
    permission: 'sales_orders.read',
  },
  {
    key: 'purchase-orders',
    title: 'Satın Alma',
    icon: 'cart-outline',
    tone: 'neutral',
    group: 'inventory',
    route: '/(tabs)/modules/purchase-orders' as Href,
    permission: 'purchase_orders.read',
  },

  {
    key: 'receivables',
    title: 'Tahsilatlar',
    icon: 'wallet-outline',
    tone: 'success',
    group: 'finance',
    route: '/(tabs)/modules/receivables' as Href,
    permission: 'receivables.read',
  },
  {
    key: 'payments',
    title: 'Ödemeler & Kasa',
    icon: 'swap-vertical-outline',
    tone: 'info',
    group: 'finance',
    route: '/(tabs)/modules/payments' as Href,
    permission: 'payments.read',
    navKey: 'payments',
  },
  {
    key: 'invoices',
    title: 'Faturalar',
    icon: 'document-outline',
    tone: 'warning',
    group: 'finance',
    route: '/(tabs)/modules/invoices' as Href,
    permission: 'accounting_invoices.read',
    navKey: 'accounting-invoices',
  },
  {
    key: 'balances',
    title: 'Cari Rapor',
    icon: 'scale-outline',
    tone: 'stage',
    group: 'finance',
    route: '/(tabs)/modules/balances' as Href,
    permission: 'receivables.read',
    navKey: 'customer-balances',
  },
  {
    key: 'due-dates',
    title: 'Vade Takvimi',
    icon: 'calendar-outline',
    tone: 'destructive',
    group: 'finance',
    route: '/(tabs)/modules/due-dates' as Href,
    permission: 'receivables.read',
    navKey: 'due-dates',
  },

  {
    key: 'calendar',
    title: 'Takvim',
    icon: 'calendar-number-outline',
    tone: 'info',
    group: 'insight',
    route: '/(tabs)/modules/calendar' as Href,
    permission: 'calendar.read',
    navKey: 'calendar',
  },
  {
    key: 'reports',
    title: 'Raporlar',
    icon: 'stats-chart-outline',
    tone: 'stage',
    group: 'insight',
    route: '/(tabs)/modules/reports' as Href,
    permission: 'reports.read',
    navKey: 'reports',
  },
  {
    key: 'documents',
    title: 'Ticari Belgeler',
    icon: 'folder-open-outline',
    tone: 'warning',
    group: 'insight',
    route: '/(tabs)/modules/documents' as Href,
    permissionsAny: ['proformas.read', 'contracts.read', 'commercial_invoices.read', 'files.read'],
    navKey: 'documents',
  },
  {
    key: 'proformas',
    title: 'Proformalar',
    icon: 'document-attach-outline',
    tone: 'info',
    group: 'insight',
    route: '/(tabs)/modules/proformas' as Href,
    permission: 'proformas.read',
  },
  {
    key: 'contracts',
    title: 'Sözleşmeler',
    icon: 'document-lock-outline',
    tone: 'stage',
    group: 'insight',
    route: '/(tabs)/modules/contracts' as Href,
    permission: 'contracts.read',
  },

  {
    key: 'users',
    title: 'Kullanıcılar',
    icon: 'person-circle-outline',
    tone: 'info',
    group: 'admin',
    route: '/(tabs)/modules/users' as Href,
    permission: 'users.read',
    navKey: 'users',
    adminOnly: true,
  },
  {
    key: 'roles',
    title: 'Roller & Yetkiler',
    icon: 'shield-checkmark-outline',
    tone: 'stage',
    group: 'admin',
    route: '/(tabs)/modules/roles' as Href,
    permission: 'roles.read',
    navKey: 'roles',
    adminOnly: true,
  },
  {
    key: 'departments',
    title: 'Departmanlar',
    icon: 'git-network-outline',
    tone: 'neutral',
    group: 'admin',
    route: '/(tabs)/modules/departments' as Href,
    permission: 'departments.read',
    navKey: 'departments',
    adminOnly: true,
  },
];

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
 * Web `canAccessNavKey` ile aynı: admin her modülü görür, yönetim modülleri yalnız admine.
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
  return !entry.navKey || !tenant?.hiddenNavigationKeys.includes(entry.navKey);
}

/** Expo Router'ın parantezli ve parantezsiz path biçimlerini kabul eder. */
export function moduleForPath(pathname: string): ModuleEntry | null {
  const match = pathname.match(/\/(?:\(tabs\)\/)?modules\/([^/?#]+)/);
  if (!match?.[1]) return null;
  return modules.find((entry) => entry.key === match[1]) ?? null;
}

export function modulesByGroup(entries: ModuleEntry[] = modules): [ModuleGroup, ModuleEntry[]][] {
  const order: ModuleGroup[] = ['sales', 'operations', 'inventory', 'finance', 'insight', 'admin'];
  return order
    .map((group) => [group, entries.filter((m) => m.group === group)] as [ModuleGroup, ModuleEntry[]])
    .filter(([, list]) => list.length > 0);
}
