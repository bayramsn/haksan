import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { CompanyWebsiteLookupInput, CompanyWebsiteLookupResult } from '@haksan/shared';
import { CompanyWebsiteLookupError } from '../../shared/utils/errors';

const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 7_000;

type WebsiteFacts = {
  siteName?: string;
  address?: string;
  city?: string;
  district?: string;
  country?: string;
  zipCode?: string;
  phone?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  structured: boolean;
};

export type FetchedWebsitePage = { url: string; html: string };
export type WebsitePageFetcher = (url: string) => Promise<FetchedWebsitePage>;

const compact = (value?: string | null, max = 1000) =>
  value?.replace(/\s+/g, ' ').trim().slice(0, max) || undefined;

const decodeHtmlEntities = (value: string) =>
  value.replace(/&(#x?[0-9a-f]+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized === 'amp') return '&';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'nbsp') return ' ';
    const hex = normalized.startsWith('#x');
    const raw = normalized.replace(/^#x?/, '');
    const codePoint = Number.parseInt(raw, hex ? 16 : 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
  });

const visibleText = (html: string) =>
  decodeHtmlEntities(
    html
      .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?\s*>|<\/(p|div|li|section|article|address|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 250_000);

const normalizeMatchText = (value: string) =>
  value
    .toLocaleLowerCase('tr-TR')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİI]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜ]/g, 'u')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const COMPANY_SUFFIXES = new Set([
  'anonim', 'limited', 'ltd', 'sti', 'sirketi', 'sanayi', 'san', 'ticaret', 'tic',
  'ithalat', 'ihracat', 'pazarlama', 'makina', 'makine', 've', 'co', 'corp', 'inc',
  'yed', 'yedek', 'par', 'parca', 'dis',
]);

export const companyNameCoverage = (companyName: string, pageText: string) => {
  const expected = Array.from(new Set(normalizeMatchText(companyName).split(' ')))
    .filter((token) => token.length >= 2 && !COMPANY_SUFFIXES.has(token));
  if (!expected.length) return 0;
  const actual = new Set(normalizeMatchText(pageText).split(' '));
  return expected.filter((token) => actual.has(token)).length / expected.length;
};

const parseIpv4 = (address: string) => {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
};

export const isPublicNetworkAddress = (address: string) => {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(normalized) === 4) {
    const parts = parseIpv4(normalized);
    if (!parts) return false;
    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    // Dokümantasyon/benchmark/geleceğe ayrılmış ağlar da dış site olarak kabul edilmez.
    if ((a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && b === 51 && c === 100)) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (isIP(normalized) === 6) {
    if (normalized === '::' || normalized === '::1') return false;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return false;
    if (/^fe[89ab]/.test(normalized) || normalized.startsWith('ff')) return false;
    if (normalized.startsWith('2001:db8') || normalized.startsWith('::ffff:')) return false;
    return true;
  }
  return false;
};

/** Her yönlendirmede yeniden çağrılır; localhost/özel ağ/metadata SSRF'ini engeller. */
export const assertSafeCompanyWebsiteUrl = async (rawUrl: string) => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new CompanyWebsiteLookupError('Web sitesi adresi geçerli değil', { reason: 'INVALID_URL' });
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new CompanyWebsiteLookupError('Yalnızca standart HTTPS firma siteleri incelenebilir', { reason: 'UNSAFE_URL' });
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(host) || !host.includes('.') || /(^|\.)(localhost|local|internal|home|lan)$/.test(host)) {
    throw new CompanyWebsiteLookupError('Bu web sitesi güvenli dış ağ adresi değil', { reason: 'UNSAFE_HOST' });
  }

  const addresses: Array<{ address: string }> = await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length || addresses.some((row) => !isPublicNetworkAddress(row.address))) {
    throw new CompanyWebsiteLookupError('Firma sitesine güvenli bağlantı kurulamadı', { reason: 'UNSAFE_DNS' });
  }
  url.hash = '';
  return url;
};

const readLimitedHtml = async (response: Response) => {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
    throw new CompanyWebsiteLookupError('Firma sitesi sayfası izin verilen boyutu aşıyor', { reason: 'PAGE_TOO_LARGE' });
  }
  if (!response.body) throw new CompanyWebsiteLookupError('Firma sitesi boş yanıt verdi', { reason: 'EMPTY_PAGE' });

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new CompanyWebsiteLookupError('Firma sitesi sayfası izin verilen boyutu aşıyor', { reason: 'PAGE_TOO_LARGE' });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const charset = response.headers.get('content-type')?.match(/charset=([^;\s]+)/i)?.[1]?.replace(/["']/g, '') || 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
};

export const fetchCompanyWebsitePage: WebsitePageFetcher = async (rawUrl) => {
  let nextUrl = rawUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const safeUrl = await assertSafeCompanyWebsiteUrl(nextUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(safeUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9',
          'User-Agent': 'Haksan-CRM-ERP/1.0 (company-contact-verifier)',
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirect === MAX_REDIRECTS) {
          throw new CompanyWebsiteLookupError('Firma sitesi çok fazla yönlendirme yaptı', { reason: 'REDIRECT_LIMIT' });
        }
        nextUrl = new URL(location, safeUrl).toString();
        continue;
      }
      if (!response.ok) {
        throw new CompanyWebsiteLookupError('Firma sitesi şu anda yanıt vermiyor', { reason: 'HTTP_ERROR' });
      }
      const contentType = response.headers.get('content-type')?.toLowerCase() || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        throw new CompanyWebsiteLookupError('Firma sitesi HTML sayfası döndürmedi', { reason: 'INVALID_CONTENT_TYPE' });
      }
      return { url: safeUrl.toString(), html: await readLimitedHtml(response) };
    } catch (error) {
      if (error instanceof CompanyWebsiteLookupError) throw error;
      throw new CompanyWebsiteLookupError('Firma sitesine zamanında ulaşılamadı', { reason: 'NETWORK_ERROR' });
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new CompanyWebsiteLookupError('Firma sitesi incelenemedi', { reason: 'LOOKUP_FAILED' });
};

const stringValue = (value: unknown, max = 1000) => (typeof value === 'string' ? compact(value, max) : undefined);
const numberValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const jsonLdNodes = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) return value.flatMap(jsonLdNodes);
  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  return [row, ...jsonLdNodes(row['@graph'])];
};

const isOrganizationNode = (row: Record<string, unknown>) => {
  const types = Array.isArray(row['@type']) ? row['@type'] : [row['@type']];
  return types.some((value) => typeof value === 'string' && /(organization|business|corporation|store|factory|manufacturer)/i.test(value));
};

const factsFromJsonLd = (html: string): WebsiteFacts => {
  const facts: WebsiteFacts = { structured: false };
  const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    if (match[1].length > 100_000) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeHtmlEntities(match[1]).trim());
    } catch {
      continue;
    }
    for (const row of jsonLdNodes(parsed).filter(isOrganizationNode)) {
      facts.structured = true;
      facts.siteName = stringValue(row.name, 255) ?? facts.siteName;
      facts.phone = stringValue(row.telephone, 64) ?? facts.phone;
      const rawEmail = stringValue(row.email, 254)?.replace(/^mailto:/i, '');
      if (rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) facts.email = rawEmail;

      const address = row.address;
      if (typeof address === 'string') {
        facts.address = compact(address);
      } else if (address && typeof address === 'object') {
        const addressRow = address as Record<string, unknown>;
        const street = stringValue(addressRow.streetAddress);
        facts.district = stringValue(addressRow.addressLocality, 64) ?? facts.district;
        facts.city = stringValue(addressRow.addressRegion, 64) ?? facts.city;
        facts.zipCode = stringValue(addressRow.postalCode, 16) ?? facts.zipCode;
        const rawCountry = addressRow.addressCountry;
        facts.country = typeof rawCountry === 'object' && rawCountry
          ? stringValue((rawCountry as Record<string, unknown>).name, 64) ?? stringValue((rawCountry as Record<string, unknown>)['@id'], 64) ?? facts.country
          : stringValue(rawCountry, 64) ?? facts.country;
        facts.address = compact([street, facts.district, facts.city, facts.zipCode, facts.country].filter(Boolean).join(', ')) ?? facts.address;
      }

      const geo = row.geo;
      if (geo && typeof geo === 'object') {
        const geoRow = geo as Record<string, unknown>;
        const latitude = numberValue(geoRow.latitude);
        const longitude = numberValue(geoRow.longitude);
        if (latitude != null && latitude >= -90 && latitude <= 90) facts.latitude = latitude;
        if (longitude != null && longitude >= -180 && longitude <= 180) facts.longitude = longitude;
      }
    }
  }
  return facts;
};

const titleFromHtml = (html: string) => {
  const og = html.match(/<meta[^>]+(?:property|name)=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return compact(decodeHtmlEntities(og ?? title ?? '').replace(/<[^>]+>/g, ' '), 255);
};

const plainContactFacts = (html: string): WebsiteFacts => {
  const text = visibleText(html);
  const lines = text.split('\n');
  const addressMatch = lines
    .map((line) => line.match(/(?:^|\b)(adres|address|merkez adresi|head office)\s*[:\-]\s*(.{5,})/i))
    .find((match) => match != null);
  const email = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  const phones = text.match(/(?:\+?\d[\d\s()./-]{7,}\d)/g) ?? [];
  const phone = phones.find((candidate) => {
    const digits = candidate.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  });
  return {
    structured: false,
    siteName: titleFromHtml(html),
    address: addressMatch ? compact(addressMatch[2]) : undefined,
    phone: compact(phone, 64),
    email: email?.slice(0, 254),
  };
};

export const extractCompanyWebsiteFacts = (page: FetchedWebsitePage): WebsiteFacts => {
  const structured = factsFromJsonLd(page.html);
  const plain = plainContactFacts(page.html);
  return {
    ...plain,
    ...Object.fromEntries(Object.entries(structured).filter(([, value]) => value !== undefined)),
    structured: structured.structured,
  } as WebsiteFacts;
};

const contactLinks = (page: FetchedWebsitePage) => {
  const links: string[] = [];
  const root = new URL(page.url);
  for (const match of page.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = normalizeMatchText(`${match[1]} ${match[2].replace(/<[^>]+>/g, ' ')}`);
    if (!/(iletisim|contact|contact us|ulasim|bize ulasin|locations|subeler)/.test(label)) continue;
    try {
      const candidate = new URL(decodeHtmlEntities(match[1]), root);
      if (candidate.protocol !== 'https:' || candidate.hostname !== root.hostname) continue;
      candidate.hash = '';
      if (!links.includes(candidate.toString())) links.push(candidate.toString());
    } catch {
      // Bozuk href firma incelemesini durdurmaz.
    }
  }
  return links.slice(0, 2);
};

const mergeFacts = (base: WebsiteFacts, next: WebsiteFacts): WebsiteFacts => ({
  siteName: next.siteName ?? base.siteName,
  address: next.address ?? base.address,
  city: next.city ?? base.city,
  district: next.district ?? base.district,
  country: next.country ?? base.country,
  zipCode: next.zipCode ?? base.zipCode,
  phone: next.phone ?? base.phone,
  email: next.email ?? base.email,
  latitude: next.latitude ?? base.latitude,
  longitude: next.longitude ?? base.longitude,
  structured: base.structured || next.structured,
});

export const inspectOfficialCompanyWebsite = async (
  query: CompanyWebsiteLookupInput,
  website: string,
  discoveredViaOsm: boolean,
  fetchPage: WebsitePageFetcher = fetchCompanyWebsitePage,
): Promise<CompanyWebsiteLookupResult> => {
  const normalizedWebsite = await assertSafeCompanyWebsiteUrl(website);
  const rootPage = await fetchPage(normalizedWebsite.toString());
  const pages = [rootPage];
  for (const link of contactLinks(rootPage)) {
    try {
      pages.push(await fetchPage(link));
    } catch {
      // Ana sayfa okunabildiyse tek bir bozuk iletişim sayfası tüm öneriyi düşürmez.
    }
  }

  let facts: WebsiteFacts = { structured: false };
  for (const page of pages) facts = mergeFacts(facts, extractCompanyWebsiteFacts(page));
  const searchableText = pages.map((page) => `${extractCompanyWebsiteFacts(page).siteName ?? ''} ${visibleText(page.html)}`).join(' ');
  const nameCoverage = companyNameCoverage(query.q, searchableText);
  const normalizedPageText = normalizeMatchText(searchableText);
  const cityMatches = query.city ? normalizedPageText.includes(normalizeMatchText(query.city)) : false;
  const districtMatches = query.district ? normalizedPageText.includes(normalizeMatchText(query.district)) : false;
  const score = Math.min(100, Math.round(
    (discoveredViaOsm ? 30 : 20) +
    nameCoverage * 45 +
    (facts.address ? 12 : 0) +
    (facts.structured ? 8 : 0) +
    (cityMatches ? 3 : 0) +
    (districtMatches ? 2 : 0),
  ));
  const confidence = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';
  const warnings: string[] = [];
  if (confidence === 'low') warnings.push('Firma adı ile site içeriği yeterince güçlü eşleşmedi; bilgileri kaydetmeden önce kontrol edin.');
  if (!facts.address) warnings.push('Sitede okunabilir bir adres bulunamadı.');
  if (facts.latitude == null || facts.longitude == null) warnings.push('Sitede yapılandırılmış kesin koordinat bulunamadı.');
  if (!facts.phone && !facts.email) warnings.push('Sitede yapılandırılmış telefon veya e-posta bulunamadı.');

  const officialWebsite = new URL('/', rootPage.url).toString();
  return {
    officialWebsite,
    siteName: facts.siteName,
    confidence,
    confidenceScore: score,
    matchReason: discoveredViaOsm
      ? 'Firma adı, harita kaydı ve resmî site içeriği birlikte karşılaştırıldı.'
      : 'Girilen web sitesi ile firma adı ve iletişim bilgileri karşılaştırıldı.',
    sourceUrls: pages.map((page) => page.url).slice(0, 4),
    suggestion: {
      website: officialWebsite,
      address: facts.address,
      city: facts.city,
      district: facts.district,
      country: facts.country,
      zipCode: facts.zipCode,
      phone: facts.phone,
      email: facts.email,
      latitude: facts.latitude,
      longitude: facts.longitude,
    },
    warnings,
  };
};
