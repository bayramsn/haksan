const SERIAL_PATTERN = /^[\p{L}\p{N}._/\-: ]{1,100}$/u;

/** QR/barkod içinden yalnız seri numarasını çıkarır; rota veya dış URL açmaz. */
export function parseInventoryCode(raw: string): string | null {
  let candidate = raw.normalize('NFKC').trim();
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      candidate = url.searchParams.get('serial')?.trim() || '';
    } catch {
      return null;
    }
  } else {
    candidate = candidate.replace(/^(?:SN|SERIAL)\s*[:#-]\s*/i, '').trim();
  }
  return SERIAL_PATTERN.test(candidate) ? candidate : null;
}
