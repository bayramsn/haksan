import type { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import type { Tone } from '@/src/theme/theme';
import type { AuthTenant, AuthUser } from '@/src/api/endpoints';

/**
 * Modül kayıt defteri. Üç yer buradan besleniyor: Modüller ızgarası, "Daha
 * Fazla" listesi ve komut paleti. Bir modül BURAYA ancak ekranı yazıldığında
 * eklenir — ızgarada tıklanınca boş açılan kart olmasın.
 */
export type ModuleGroup = 'sales' | 'operations' | 'inventory' | 'finance' | 'insight';

export const groupTitles: Record<ModuleGroup, string> = {
  sales: 'Satış & CRM',
  operations: 'Operasyon',
  inventory: 'Stok & Ürün',
  finance: 'Finans',
  insight: 'Analiz & Belge',
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
    key: 'activities',
    title: 'Aktiviteler',
    icon: 'pulse-outline',
    tone: 'neutral',
    group: 'sales',
    route: '/(tabs)/modules/activities' as Href,
    permission: 'activities.read',
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
  return !entry.navKey || !tenant?.hiddenNavigationKeys.includes(entry.navKey);
}

/** Expo Router'ın parantezli ve parantezsiz path biçimlerini kabul eder. */
export function moduleForPath(pathname: string): ModuleEntry | null {
  const match = pathname.match(/\/(?:\(tabs\)\/)?modules\/([^/?#]+)/);
  if (!match?.[1]) return null;
  return modules.find((entry) => entry.key === match[1]) ?? null;
}

export function modulesByGroup(entries: ModuleEntry[] = modules): [ModuleGroup, ModuleEntry[]][] {
  const order: ModuleGroup[] = ['sales', 'operations', 'inventory', 'finance', 'insight'];
  return order
    .map((group) => [group, entries.filter((m) => m.group === group)] as [ModuleGroup, ModuleEntry[]])
    .filter(([, list]) => list.length > 0);
}
