/** One-use process-memory handoffs. Only the random id enters navigation URLs;
 * no customer text is persisted to disk, URLs, analytics, or restored state. */
export type NavigationContext = { nav: string; query?: string; focus?: string };
const ALLOWED: Record<string, readonly string[]> = {
  products: [], documents: [], 'accounting-invoices': [], contacts: [], 'sales-map': [], offers: ['open', 'pending', 'expired', 'won', 'lost'], stock: ['reserved', 'available', 'low'],
  payments: ['overdue', 'pending', 'upcoming', 'paid'], shipments: ['pending', 'delivered'],
  'service-requests': ['open', 'late', 'sla', 'scheduled'],
  'sales-cases': ['open', 'won', 'lost', 'today', 'sla_risk', 'uncontacted', 'unassigned', 'no_action'],
};
let identity: string | null = null;
let revision: () => string = () => '';
let randomBytes: (bytes: Uint8Array) => Uint8Array = (bytes) => globalThis.crypto.getRandomValues(bytes);
const pending = new Map<string, { scope: string; expires: number; context: NavigationContext }>();
export function bindNavigationContext(scope: string | null, getRevision: () => string = () => '', random?: (bytes: Uint8Array) => Uint8Array) {
  if (identity !== scope) pending.clear();
  identity = scope; revision = getRevision;
  if (random) randomBytes = random;
}
export function supportsNavigationContext(nav: string) { return Object.hasOwn(ALLOWED, nav); }
export function createNavigationContext(nav: string, query?: string, focus?: string): string | null {
  if (!identity || !supportsNavigationContext(nav)) return null;
  if (query !== undefined && (query.length > 1000 || /[\u0000-\u001f\u007f]/.test(query))) return null;
  if (focus && !ALLOWED[nav]?.includes(focus)) return null;
  const now = Date.now();
  for (const [key, entry] of pending) if (entry.expires <= now) pending.delete(key);
  if (pending.size >= 100) pending.delete(pending.keys().next().value!);
  let bytes: Uint8Array;
  try { bytes = randomBytes(new Uint8Array(16)); } catch { return null; }
  const id = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
  pending.set(id, { scope: `${identity}:${revision()}`, expires: now + 30 * 60_000, context: { nav, ...(query !== undefined ? { query } : {}), ...(focus ? { focus } : {}) } });
  return id;
}
export function consumeNavigationContext(id: string, nav: string): NavigationContext | null {
  const entry = pending.get(id); pending.delete(id);
  if (!entry || !identity || entry.expires <= Date.now() || entry.scope !== `${identity}:${revision()}` || entry.context.nav !== nav) return null;
  return entry.context;
}

export function navigationMonth(query?: string): { search: string; from?: string; to?: string } {
  if (!query?.startsWith('month:')) return { search: query ?? '' };
  const bucket = query.slice(6).trim();
  if (!/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(bucket)) return { search: '' };
  const year = Number(bucket.slice(0, 4)), month = bucket.length === 7 ? Number(bucket.slice(5)) : null;
  const lastDay = new Date(Date.UTC(year, month ?? 12, 0)).getUTCDate();
  return { search: '', from: `${year}-${String(month ?? 1).padStart(2, '0')}-01`, to: `${year}-${String(month ?? 12).padStart(2, '0')}-${lastDay}` };
}

export function navigationPreset(nav: string, focus?: string): string | null {
  const presets: Record<string, Record<string, string>> = {
    offers: { won: 'approved', lost: 'closed', open: 'sent', pending: 'sent', expired: 'sent' },
    payments: { overdue: 'Overdue', paid: 'Paid', pending: 'Pending', upcoming: 'Pending' },
    stock: { reserved: 'reserved', available: 'available' }, shipments: { delivered: 'delivered' },
  };
  return presets[nav]?.[focus ?? ''] ?? null;
}
