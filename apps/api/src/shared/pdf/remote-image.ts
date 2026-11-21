import { lookup, type LookupAddress } from 'node:dns';
import { get } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
const MAX_EMBEDDED_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;
const SAFE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// Ürün görsellerinin çoğu kurumsal sitede (https://www.haksanmakina.com.tr/...). Tarayıcıdaki
// "Yazdır" bunları doğrudan yükler; ağsız Chromium yükleyemez. Sunucu bu yüzden görseli
// kendisi çekip data URL olarak gömer. SSRF: yalnız https/443, yönlendirme izlenmez ve
// bağlanılan her adres (DNS çözümünden sonra, bağlantı anında) iç ağ dışında olmalı.
const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  // ::ffff:a.b.c.d (IPv4'e eşlenmiş) BlockList'te zaten yukarıdaki IPv4 kurallarıyla denetlenir.
  ['::', 127], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, prefix, 'ipv6');

export const isPublicAddress = (address: string, family: number) => !blocked.check(address, family === 6 ? 'ipv6' : 'ipv4');

const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    const list = (addresses ?? []) as LookupAddress[];
    if (error || !list.length || list.some((a) => !isPublicAddress(a.address, a.family))) {
      return callback(error ?? new Error('Görsel adresi iç ağa çözülüyor'), '', 4);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

const REMOTE_TIMEOUT_MS = 8_000;
const MAX_REMOTE_IMAGES = 30;
// Belge başına toplam indirme tavanı: 30 görsel × 10 MB paralel indirilince süreç belleği tükeniyordu.
const MAX_REMOTE_TOTAL_BYTES = 25 * 1024 * 1024;

/** Dış görseli data URL'ye çevirir; kurala uymayan ya da alınamayan görselde undefined. */
export function fetchRemoteImage(src: string, budget = { left: MAX_REMOTE_TOTAL_BYTES }): Promise<string | undefined> {
  let url: URL;
  try { url = new URL(src); } catch { return Promise.resolve(undefined); }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) return Promise.resolve(undefined);
  // Host IP ise Node `lookup`'ı hiç çağırmaz; iç ağ süzgeci burada elle uygulanır.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(host);
  if (family && !isPublicAddress(host, family)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const req = get(url, { lookup: publicOnlyLookup, headers: { accept: 'image/*' } }, (res) => {
      const mime = String(res.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
      if (res.statusCode !== 200 || !SAFE_IMAGE_MIME_TYPES.has(mime) || Number(res.headers['content-length'] ?? 0) > MAX_EMBEDDED_PRODUCT_IMAGE_BYTES) {
        req.destroy();
        return resolve(undefined);
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        budget.left -= chunk.length;
        if (size > MAX_EMBEDDED_PRODUCT_IMAGE_BYTES || budget.left < 0) { req.destroy(); resolve(undefined); } else chunks.push(chunk);
      });
      res.on('end', () => resolve(size ? `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}` : undefined));
      res.on('error', () => resolve(undefined));
    });
    const deadline = setTimeout(() => req.destroy(), REMOTE_TIMEOUT_MS);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', () => resolve(undefined));
  });
}

/** Belgedeki https <img> kaynaklarını gömer; alınamayan görsel olduğu gibi kalır (Chromium boş basar). */
export async function inlineRemoteImages(html: string): Promise<string> {
  const sources = [...new Set([...html.matchAll(/<img[^>]+src="(https:\/\/[^"]+)"/gi)].map((m) => m[1]))].slice(0, MAX_REMOTE_IMAGES);
  if (!sources.length) return html;
  // ponytail: önbellek yok; aynı görsel her belgede yeniden çekilir, yük artarsa LRU eklenir.
  const budget = { left: MAX_REMOTE_TOTAL_BYTES };
  const encoded = await Promise.all(sources.map(async (src) => [src, await fetchRemoteImage(src.replace(/&amp;/g, '&'), budget)] as const));
  return encoded.reduce((out, [src, data]) => (data ? out.split(`src="${src}"`).join(`src="${data}"`) : out), html);
}
