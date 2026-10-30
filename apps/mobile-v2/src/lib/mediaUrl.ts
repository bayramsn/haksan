/**
 * API göreli medya yolunu (`/companies/media/:id`, `/products/media/:id`) mutlak
 * URL'e çevirir — `Image` göreli yolu yükleyemez, sessizce boş kutu gösterir.
 * `/api/v1/...` ile başlayan yol zaten sürümlü olduğu için yalnız origin'e
 * eklenir. Web `resolveMediaUrlAgainstBase` ile aynı kural.
 */
export function resolveMediaUrl(ref: string | null | undefined, baseUrl: string): string | null {
  const clean = ref?.trim();
  if (!clean) return null;
  if (/^(https?:|data:|blob:)/i.test(clean)) return clean;
  if (!clean.startsWith('/')) return clean;
  const base = baseUrl.replace(/\/+$/, '');
  if (/^\/api\/v\d+\//i.test(clean)) return `${base.replace(/\/api\/v\d+$/i, '')}${clean}`;
  return `${base}${clean}`;
}
