/**
 * Ekran hiyerarşisi: sekme kökü → (Modüller) → liste → detay. Saf mantık;
 * node:test doğrudan import ettiği için alias/React kullanılmaz.
 */

/** Alt sekme çubuğundaki kökler; geri oku yalnız bunların dışında çizilir. */
export const TAB_ROOT_PATHS: ReadonlySet<string> = new Set(['/', '/companies', '/opportunities', '/calendar', '/modules']);

export function isTabRootPath(pathname: string): boolean {
  return TAB_ROOT_PATHS.has(pathname);
}

/** Geçmiş yoksa (bildirim, derin bağlantı) bir üst seviye: detay → liste → Modüller → Ana Sayfa. */
export function parentPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'modules') {
    if (parts.length > 2) return `/modules/${parts[1]}`;
    return parts.length === 2 ? '/modules' : '/';
  }
  if (parts[0] === 'modal') return '/';
  return parts.length > 1 ? `/${parts.slice(0, -1).join('/')}` : '/';
}
