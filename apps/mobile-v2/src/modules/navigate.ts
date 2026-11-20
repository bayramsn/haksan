import type { NotificationTarget } from '@/src/api/endpoints';
import type { AppRoute } from '@/src/navigation/pendingTargetPolicy';

const CHAT_MESSAGE_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const navRoutes: Record<string, string> = {
  dashboard: '/',
  chat: '/chat',
  calendar: '/calendar',
  customers: '/modules/companies',
  'sales-map': '/modules/company-map',
  contacts: '/modules/contacts',
  'sales-cases': '/modules/opportunities',
  kanban: '/modules/opportunities',
  offers: '/modules/quotes',
  documents: '/modules/documents',
  payments: '/modules/payments',
  'accounting-invoices': '/modules/invoices',
  'customer-balances': '/modules/balances',
  'due-dates': '/modules/due-dates',
  'sales-price-list': '/modules/price-lists',
  'service-price-list': '/modules/price-lists',
  products: '/modules/products',
  stock: '/modules/inventory',
  shipments: '/modules/shipments',
  'sales-orders': '/modules/sales-orders',
  'purchase-orders': '/modules/purchase-orders',
  installations: '/modules/installations',
  machines: '/modules/customer-devices',
  'service-requests': '/modules/service-tickets',
  'service-kanban': '/modules/service-tickets',
  reports: '/modules/reports',
  settings: '/more/settings',
};

export function isChatMessageTarget(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const segments = value.split(':');
  return segments.length === 2 && segments.every((segment) => CHAT_MESSAGE_ID.test(segment));
}

export function routeForNavigation(nav: string, query?: string): AppRoute | null {
  if (nav === 'chat' && query !== undefined) {
    const [conversation, message, ...extra] = query.split(':');
    const conversationId = safePathSegment(conversation);
    if (!conversationId || extra.length > 0) return null;
    if (message === undefined) return `/chat/${conversationId}`;
    if (!CHAT_MESSAGE_ID.test(message)) return null;
    return `/chat/${conversationId}?messageId=${message}`;
  }
  if (nav === 'service-requests' && query?.startsWith('complaint:')) {
    const complaintId = query.slice('complaint:'.length);
    const safeComplaintId = safeRouteValue(complaintId);
    if (!safeComplaintId) return null;
    return `/modules/service-complaints/${safeComplaintId}`;
  }
  const route = navRoutes[nav];
  if (!route) return null;
  return route;
}

/** Sunucunun çözdüğü bildirim hedefini gerçek native rotaya çevirir. */
export function routeForTarget(target: NotificationTarget | null): AppRoute | null {
  if (!target) return null;
  switch (target.kind) {
    case 'company': {
      const companyId = safeRouteValue(target.companyId);
      return companyId ? (`/modules/companies/${companyId}`) : null;
    }
    case 'opportunity': {
      const opportunityId = safeRouteValue(target.opportunityId);
      if (!opportunityId) return null;
      const activityId = target.activityId ? safeRouteValue(target.activityId) : null;
      const activity = activityId ? `?activityId=${activityId}` : '';
      return `/modules/opportunities/${opportunityId}${activity}`;
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



// pendingTargetPolicy.PROTECTED_ROOTS ile aynı liste; Node testleri bu saf
// modülleri bağımlılıksız yüklediği için içe aktarılmıyor.
const PROTECTED_ROOTS = new Set(['modules', 'chat', 'notifications', 'more', 'work', 'calendar']);

const RESET_PASSWORD_PATHS = new Set(['/reset-password', '/(auth)/reset-password']);

function resetPasswordRoute(path: string): AppRoute | null {
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
  return (`/(auth)/reset-password?token=${encodeURIComponent(token)}`);
}

/** Push veya dış bağlantıdan gelen yolu allowlist ile uygulama rotasına çevirir. */
export function routeForIncomingHref(
  raw: string | null | undefined,
  allowedHosts: readonly string[] = []
): AppRoute | null {
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
  if (path === '/' || path === '/app') return '/';
  if (RESET_PASSWORD_PATHS.has(path.split(/[?#]/, 1)[0] ?? '')) return resetPasswordRoute(path);
  const cleanPath = path.split(/[?#]/, 1)[0] ?? '';
  const entityMatch = cleanPath.match(/^\/([^/]+)\/([^/]+)\/?$/);
  if (entityMatch) {
    const target = entityDetailRoutes[entityMatch[1] ?? ''];
    const id = safePathSegment(entityMatch[2]);
    if (target && id) return `${target}/${id}`;
  }
  if (PROTECTED_ROOTS.has(cleanPath.split('/')[1] ?? '')) {
    // Serbest query/hash değerleri dış kaynaklardan native navigation state'ine
    // taşınmaz. Bildirimlerin izinli query'leri routeForTarget içinde üretilir.
    return cleanPath;
  }
  const nav = path.replace(/^\/+/, '').split(/[/?#]/)[0];
  if (!nav) return null;
  return routeForNavigation(nav);
}

/** Expo push `data` alanının iki sunucu kontratını da güvenle çözer. */
export function routeForPushData(data: unknown, allowedHosts: readonly string[] = []): AppRoute | null {
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
    if (value.nav === 'chat' && typeof value.conversationId === 'string') {
      const conversation = value.conversationId;
      if (conversation.includes(':')) return null;
      const message = typeof value.messageId === 'string' && CHAT_MESSAGE_ID.test(value.messageId) ? value.messageId : null;
      if (message) return routeForNavigation('chat', `${conversation}:${message}`);
      if (typeof value.query === 'string' && value.query.startsWith(`${conversation}:`)) return routeForNavigation('chat', value.query);
      return routeForNavigation('chat', conversation);
    }
    return routeForTarget({
      kind: 'navigate',
      nav: value.nav,
      query: typeof value.query === 'string' ? value.query : undefined,
    });
  }
  return null;
}
