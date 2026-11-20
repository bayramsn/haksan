const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const toBase64 = (bytes: Uint8Array): string => {
  const parts: string[] = [];
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const bits = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    parts.push(BASE64[(bits >>> 18) & 63], BASE64[(bits >>> 12) & 63],
      i + 1 < bytes.length ? BASE64[(bits >>> 6) & 63] : '=', i + 2 < bytes.length ? BASE64[bits & 63] : '=');
    if (parts.length >= 8192) { chunks.push(parts.join('')); parts.length = 0; }
  }
  if (parts.length) chunks.push(parts.join(''));
  return chunks.join('');
};

/** Embed images before invoking WKWebView/Android printing, so the PDF is self contained. */
export async function inlinePrintImages(html: string): Promise<string> {
  const sources = [...new Set([...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]))];
  const inlined = new Map<string, string>();
  await Promise.all(sources.map(async (source) => {
    if (source.startsWith('data:image/')) return;
    const url = source.replace(/&amp;/g, '&');
    if (!/^https?:\/\//i.test(url)) throw new Error('PDF görselinin adresi geçersiz.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (!response.ok || !mime || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) {
        throw new Error('PDF görselleri CRM sunucusundan yüklenemedi.');
      }
      if (Number(response.headers.get('content-length') ?? 0) > 5 * 1024 * 1024) throw new Error('PDF görseli çok büyük.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length) throw new Error('PDF görseli boş.');
      if (bytes.length > 5 * 1024 * 1024) throw new Error('PDF görseli çok büyük.');
      inlined.set(source, `data:${mime};base64,${toBase64(bytes)}`);
    } finally {
      clearTimeout(timer);
    }
  }));
  return html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/gi, (match, start, source, end) =>
    inlined.has(source) ? `${start}${inlined.get(source)}${end}` : match,
  );
}
