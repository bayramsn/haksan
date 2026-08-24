import type { Href } from 'expo-router';
import type { NotificationTarget } from '@/src/api/endpoints';

const navRoutes: Record<string, string> = {
  dashboard: '/(tabs)',
  chat: '/(tabs)/chat',
  calendar: '/(tabs)/modules/calendar',
  customers: '/(tabs)/modules/companies',
  'sales-map': '/(tabs)/modules/company-map',
  contacts: '/(tabs)/modules/contacts',
  'sales-cases': '/(tabs)/modules/opportunities',
  kanban: '/(tabs)/modules/opportunities',
  offers: '/(tabs)/modules/quotes',
  documents: '/(tabs)/modules/documents',
  payments: '/(tabs)/modules/payments',
  'accounting-invoices': '/(tabs)/modules/invoices',
  'customer-balances': '/(tabs)/modules/balances',
  'due-dates': '/(tabs)/modules/due-dates',
  'sales-price-list': '/(tabs)/modules/price-lists',
  'service-price-list': '/(tabs)/modules/price-lists',
  products: '/(tabs)/modules/products',
  stock: '/(tabs)/modules/inventory',
  shipments: '/(tabs)/modules/shipments',
  'sales-orders': '/(tabs)/modules/sales-orders',
  'purchase-orders': '/(tabs)/modules/purchase-orders',
  installations: '/(tabs)/modules/installations',
  machines: '/(tabs)/modules/customer-devices',
  'service-requests': '/(tabs)/modules/service-tickets',
  'service-kanban': '/(tabs)/modules/service-tickets',
  reports: '/(tabs)/modules/reports',
  settings: '/(tabs)/more/settings',
};

export function routeForNavigation(nav: string, query?: string): Href | null {
  if (nav === 'service-requests' && query?.startsWith('complaint:')) {
    const complaintId = query.slice('complaint:'.length);
    const safeComplaintId = safeRouteValue(complaintId);
    return safeComplaintId ? (`/(tabs)/modules/service-complaints/${safeComplaintId}`) as Href : null;
  }
  const route = navRoutes[nav];
  return route ? (route as Href) : null;
}

/** Sunucunun çözdüğü bildirim hedefini gerçek native rotaya çevirir. */
export function routeForTarget(target: NotificationTarget | null): Href | null {
  if (!target) return null;
  switch (target.kind) {
    case 'company': {
      const companyId = safeRouteValue(target.companyId);
      return companyId ? (`/(tabs)/modules/companies/${companyId}` as Href) : null;
    }
    case 'opportunity': {
      const opportunityId = safeRouteValue(target.opportunityId);
      if (!opportunityId) return null;
      const activityId = target.activityId ? safeRouteValue(target.activityId) : null;
      const activity = activityId ? `?activityId=${activityId}` : '';
      return `/(tabs)/modules/opportunities/${opportunityId}${activity}` as Href;
    }
    case 'navigate':
      return routeForNavigation(target.nav, target.query);
    default:
      return null;
  }
}

function safeRouteValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256 || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return encodeURIComponent(trimmed);
}

function safePathSegment(value: string | undefined): string | null {
  if (!value || /%2f|%5c/i.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) return null;
    return safeRouteValue(decoded);
  } catch {
    return null;
  }
}

const entityDetailRoutes: Record<string, string> = {
  companies: '/(tabs)/modules/companies',
  contacts: '/(tabs)/modules/contacts',
  opportunities: '/(tabs)/modules/opportunities',
  quotes: '/(tabs)/modules/quotes',
  offers: '/(tabs)/modules/quotes',
  products: '/(tabs)/modules/products',
  inventory: '/(tabs)/modules/inventory',
  stock: '/(tabs)/modules/inventory',
  'service-tickets': '/(tabs)/modules/service-tickets',
  shipments: '/(tabs)/modules/shipments',
  'sales-orders': '/(tabs)/modules/sales-orders',
  'purchase-orders': '/(tabs)/modules/purchase-orders',
  payments: '/(tabs)/modules/payments',
  receivables: '/(tabs)/modules/receivables',
  invoices: '/(tabs)/modules/invoices',
  'accounting-invoices': '/(tabs)/modules/invoices',
  installations: '/(tabs)/modules/installations',
  'customer-devices': '/(tabs)/modules/customer-devices',
  machines: '/(tabs)/modules/customer-devices',
  'maintenance-plans': '/(tabs)/modules/maintenance-plans',
  activities: '/(tabs)/modules/activities',
  'service-complaints': '/(tabs)/modules/service-complaints',
  proformas: '/(tabs)/modules/documents/proforma',
  contracts: '/(tabs)/modules/documents/contract',
  'commercial-invoices': '/(tabs)/modules/documents/invoice',
  chat: '/(tabs)/chat',
  conversations: '/(tabs)/chat',
};

const allowedNativePrefixes = ['/(tabs)', '/modules/', '/chat/', '/notifications', '/more/'];

const RESET_PASSWORD_PATHS = new Set(['/reset-password', '/(auth)/reset-password']);

function resetPasswordRoute(path: string): Href | null {
  const hashless = path.split('#', 1)[0] ?? '';
  const queryStart = hashless.indexOf('?');
  const pathname = queryStart >= 0 ? hashless.slice(0, queryStart) : hashless;
  if (!RESET_PASSWORD_PATHS.has(pathname)) return null;

  const params = new URLSearchParams(queryStart >= 0 ? hashless.slice(queryStart + 1) : '');
  const keys = [...params.keys()];
  const tokens = [...params.getAll('token'), ...params.getAll('resetToken')];
  // Reset bağlantısında yalnızca tek bir token kabul edilir. Uzunluk ve kontrol
  // karakteri sınırı, URL'nin navigation state'ini şişirmesini de engeller.
  if (keys.some((key) => key !== 'token' && key !== 'resetToken') || new Set(keys).size !== 1 || tokens.length !== 1) return null;
  const token = tokens[0];
  if (!token || token.length > 2048 || /[\u0000-\u001f\u007f\s]/.test(token)) return null;
  return (`/(auth)/reset-password?token=${encodeURIComponent(token)}`) as Href;
}

/** Push veya dış bağlantıdan gelen yolu allowlist ile uygulama rotasına çevirir. */
export function routeForIncomingHref(
  raw: string | null | undefined,
  allowedHosts: readonly string[] = []
): Href | null {
  if (!raw) return null;
  let path = raw.trim();
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
      const url = new URL(path);
      const scheme = url.protocol.replace(':', '').toLowerCase();
      if (scheme !== 'haksan') {
        if (scheme !== 'https') return null;
        if (!allowedHosts.map((host) => host.toLowerCase()).includes(url.hostname.toLowerCase())) return null;
        path = `${url.pathname}${url.search}`;
      } else {
        // `haksan://companies/123` ve `haksan:///companies/123` biçimlerini
        // aynı kanonik yola indirger. Kimlik bilgisi/port taşıyan URL reddedilir.
        if (url.username || url.password || url.port) return null;
        path = `${url.hostname ? `/${url.hostname}` : ''}${url.pathname}${url.search}`;
      }
    }
  } catch {
    return null;
  }

  if (path.startsWith('/app/')) path = path.slice('/app'.length);
  if (path === '/' || path === '/app') return '/(tabs)' as Href;
  if (RESET_PASSWORD_PATHS.has(path.split(/[?#]/, 1)[0] ?? '')) return resetPasswordRoute(path);
  const cleanPath = path.split(/[?#]/, 1)[0] ?? '';
  const entityMatch = cleanPath.match(/^\/([^/]+)\/([^/]+)\/?$/);
  if (entityMatch) {
    const target = entityDetailRoutes[entityMatch[1] ?? ''];
    const id = safePathSegment(entityMatch[2]);
    if (target && id) return `${target}/${id}` as Href;
  }
  if (allowedNativePrefixes.some((prefix) => path === prefix || path.startsWith(prefix))) {
    // Serbest query/hash değerleri dış kaynaklardan native navigation state'ine
    // taşınmaz. Bildirimlerin izinli query'leri routeForTarget içinde üretilir.
    return path.split(/[?#]/, 1)[0] as Href;
  }
  const nav = path.replace(/^\/+/, '').split(/[/?#]/)[0];
  return nav ? routeForNavigation(nav) : null;
}

/** Expo push `data` alanının iki sunucu kontratını da güvenle çözer. */
export function routeForPushData(data: unknown, allowedHosts: readonly string[] = []): Href | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (typeof value.href === 'string') return routeForIncomingHref(value.href, allowedHosts);
  if (value.kind === 'company' && typeof value.companyId === 'string') {
    return routeForTarget({ kind: 'company', companyId: value.companyId });
  }
  if (value.kind === 'opportunity' && typeof value.opportunityId === 'string') {
    return routeForTarget({
      kind: 'opportunity',
      opportunityId: value.opportunityId,
      activityId: typeof value.activityId === 'string' ? value.activityId : undefined,
    });
  }
  if (value.kind === 'navigate' && typeof value.nav === 'string') {
    return routeForTarget({
      kind: 'navigate',
      nav: value.nav,
      query: typeof value.query === 'string' ? value.query : undefined,
    });
  }
  return null;
}
