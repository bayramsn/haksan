/** Public CRM image paths include the versioned API prefix; print assets are separate. */
export const printMediaUrl = (url: unknown, origin: string): string => {
  const clean = String(url ?? '').trim();
  if (!clean) return '';
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(clean)) return clean;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^\/api\/v\d+\//.test(clean)) return `${origin}${clean}`;
  if (clean.startsWith('/')) return `${origin}/api/v1${clean}`;
  throw new Error('PDF görselinin adresi geçersiz.');
};
