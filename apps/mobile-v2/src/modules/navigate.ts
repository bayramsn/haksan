// @ts-ignore -- explicit extension lets the pure navigation policy run in node:test; Metro also resolves it.
import { createNavigationContext, supportsNavigationContext } from './navigationContext.ts';
import type { Href } from 'expo-router';
import type { NotificationTarget } from '@/src/api/endpoints';

/** Doğrulanmış yol metnini Href'e çevirir; rota birleşimi doğrudan `as` için fazla büyük. */
const toHref = (path: string) => path as unknown as Href;

const navRoutes: Record<string, string> = {
  dashboard: '/(tabs)/(home)',
  chat: '/chat',
  calendar: '/modules/calendar',
  tasks: '/modules/tasks',
  activities: '/modules/activities',
  customers: '/modules/companies',
  'sales-map': '/modules/company-map',
  contacts: '/modules/contacts',
  'sales-cases': '/modules/opportunities',
  kanban: '/modules/kanban',
  targets: '/modules/targets',
  'trade-fairs': '/modules/trade-fairs',
  references: '/modules/references',
  meta: '/modules/meta',
  offers: '/modules/quotes',
  proformas: '/modules/proformas',
  contracts: '/modules/contracts',
  documents: '/modules/documents',
  users: '/modules/users',
  roles: '/modules/roles',
  departments: '/modules/departments',
  payments: '/modules/payments',
  'accounting-invoices': '/modules/invoices',
  'customer-balances': '/modules/balances',
  'due-dates': '/modules/due-dates',
  'sales-price-list': '/modules/price-lists',
  'service-price-list': '/modules/service-price-list',
  products: '/modules/products',
  stock: '/modules/inventory',
  shipments: '/modules/shipments',
  'sales-orders': '/modules/sales-orders',
  'purchase-orders': '/modules/purchase-orders',
  installations: '/modules/installations',
  deliveries: '/modules/deliveries',
  machines: '/modules/customer-devices',
  'service-requests': '/modules/service-tickets',
  'service-kanban': '/modules/service-kanban',
  reports: '/modules/reports',
  settings: '/more/settings',
};

/** `önek:<id>` sorgusunu kayıt detayına çevirir (notifications.controller hedefleri). */
const recordRoutes: Record<string, { prefix: string; path: string }[]> = {
  'service-requests': [
    { prefix: 'complaint:', path: '/modules/service-complaints/' },
    { prefix: 'ticket:', path: '/modules/service-tickets/' },
  ],
  tasks: [{ prefix: 'task:', path: '/modules/tasks/' }],
  activities: [{ prefix: 'activity:', path: '/modules/activities/' }],
};

/** API push verisinin eski biçimi `{ nav, entityId }`: kayıt kimliğini detay sorgusuna çevirir. */
const pushRecordPrefix: Record<string, string> = { tasks: 'task:', 'service-requests': 'ticket:', activities: 'activity:' };

export function routeForNavigation(nav: string, query?: string, focus?: string): Href | null {
  const record = query ? recordRoutes[nav]?.find((entry) => query.startsWith(entry.prefix)) : undefined;
  if (record && query) {
    const safeId = safeRouteValue(query.slice(record.prefix.length));
    if (!safeId) return null;
    return toHref(`${record.path}${safeId}`);
  }
  // Haftalık satış/aktivite raporu mobilde Analitik sekmesinde.
  if (nav === 'reports' && query === 'weekly-sales') return toHref('/modules/reports?mode=analytics');
  if (nav === 'dashboard' && focus === 'targets') return toHref('/(tabs)/(home)?section=rapor&pane=hedefler');
  const route = navRoutes[nav];
  if (!route) return null;
  if (supportsNavigationContext(nav) && (query !== undefined || focus !== undefined)) {
    const action = createNavigationContext(nav, query, focus);
    if (!action) return toHref(route);
    return toHref(`${route}?navigationAction=${action}`);
  }
  return toHref(route);
}

/** Sunucunun çözdüğü bildirim hedefini gerçek native rotaya çevirir. */
export function routeForTarget(target: NotificationTarget | null): Href | null {
  if (!target) return null;
  switch (target.kind) {
    case 'company': {
      const companyId = safeRouteValue(target.companyId);
      if (!companyId) return null;
      return toHref(`/modules/companies/${companyId}`);
    }
    case 'opportunity': {
      const opportunityId = safeRouteValue(target.opportunityId);
      if (!opportunityId) return null;
      const activityId = target.activityId ? safeRouteValue(target.activityId) : null;
      const activity = activityId ? `?activityId=${activityId}` : '';
      return toHref(`/modules/opportunities/${opportunityId}${activity}`);
    }
    case 'navigate':
      return routeForNavigation(target.nav, target.query, target.focus);
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
  companies: '/modules/companies',
  contacts: '/modules/contacts',
  opportunities: '/modules/opportunities',
  quotes: '/modules/quotes',
  offers: '/modules/quotes',
  products: '/modules/products',
  inventory: '/modules/inventory',
  stock: '/modules/inventory',
  'service-tickets': '/modules/service-tickets',
  shipments: '/modules/shipments',
  'sales-orders': '/modules/sales-orders',
  'purchase-orders': '/modules/purchase-orders',
  payments: '/modules/payments',
  receivables: '/modules/receivables',
  invoices: '/modules/invoices',
  'accounting-invoices': '/modules/invoices',
  installations: '/modules/installations',
  'customer-devices': '/modules/customer-devices',
  machines: '/modules/customer-devices',
  'maintenance-plans': '/modules/maintenance-plans',
  activities: '/modules/activities',
  tasks: '/modules/tasks',
  'service-complaints': '/modules/service-complaints',
  proformas: '/modules/documents/proforma',
  contracts: '/modules/documents/contract',
  'commercial-invoices': '/modules/documents/invoice',
  chat: '/chat',
  conversations: '/chat',
};

const allowedNativePrefixes = ['/(tabs)', '/modules', '/chat', '/notifications', '/more', '/companies', '/opportunities', '/calendar'];

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
  return toHref(`/(auth)/reset-password?token=${encodeURIComponent(token)}`);
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

  path = path.replace(/^\/\(tabs\)(?=\/|$)/, '').replace(/^\/\((?:home|companies|opportunities|calendar|modules)\)(?=\/|$)/, '');
  if (!path) path = '/';
  if (path.startsWith('/app/')) path = path.slice('/app'.length);
  if (path === '/' || path === '/app') return toHref('/(tabs)/(home)');
  if (RESET_PASSWORD_PATHS.has(path.split(/[?#]/, 1)[0] ?? '')) return resetPasswordRoute(path);
  const cleanPath = path.split(/[?#]/, 1)[0] ?? '';
  const entityMatch = cleanPath.match(/^\/([^/]+)\/([^/]+)\/?$/);
  if (entityMatch) {
    const target = entityDetailRoutes[entityMatch[1] ?? ''];
    const id = safePathSegment(entityMatch[2]);
    if (target && !id) return null;
    if (target && id) return toHref(`${target}/${id}`);
  }
  if (allowedNativePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    // Serbest query/hash değerleri dış kaynaklardan native navigation state'ine
    // taşınmaz. Bildirimlerin izinli query'leri routeForTarget içinde üretilir.
    return toHref(path.split(/[?#]/, 1)[0] ?? path);
  }
  const nav = path.replace(/^\/+/, '').split(/[/?#]/)[0];
  if (!nav) return null;
  return routeForNavigation(nav);
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
      focus: typeof value.focus === 'string' ? value.focus : undefined,
    });
  }
  // Görev, takvim ve aktivite hatırlatmaları `kind` göndermiyor; eskiden dokununca hiçbir yere gitmiyordu.
  if (value.kind === undefined && typeof value.nav === 'string') {
    const prefix = pushRecordPrefix[value.nav];
    const entityId = typeof value.entityId === 'string' ? value.entityId : undefined;
    return routeForNavigation(value.nav, prefix && entityId ? `${prefix}${entityId}` : undefined);
  }
  return null;
}
