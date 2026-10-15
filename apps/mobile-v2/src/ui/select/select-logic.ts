type Option = { label: string; hint?: string | null };

export function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i');
}

/** Etiket ya da ipucunda geçen tüm kelimeler eşleşmeli ("ist kad" → İstanbul / Kadıköy). */
export function filterOptions<T extends Option>(options: T[], search: string): T[] {
  const words = normalizeSearch(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  return options.filter((option) => {
    const haystack = normalizeSearch(`${option.label} ${option.hint ?? ''}`);
    return words.every((word) => haystack.includes(word));
  });
}

export function hasExactOption(options: Option[], value: string): boolean {
  const target = normalizeSearch(value);
  return options.some((option) => normalizeSearch(option.label) === target);
}

export function provinceOptions(provinces: readonly string[]) {
  return [...provinces].sort((a, b) => a.localeCompare(b, 'tr')).map((name) => ({ id: name, label: name }));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Formların metin olarak tuttuğu tarih biçimi: `YYYY-AA-GG` ya da `YYYY-AA-GG SS:DD` (yerel saat). */
export function formatDateText(date: Date, mode: 'date' | 'datetime'): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return mode === 'date' ? day : `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDateText(value: string | null | undefined): Date | null {
  const match = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0));
  return date.getMonth() === Number(m) - 1 ? date : null;
}

/** Virgüllü listeyi tekilleştirerek böler (büyük/küçük harf duyarsız). */
export function splitTokens(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => {
      const key = normalizeSearch(token);
      if (!token || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function joinTokens(tokens: string[]): string {
  return splitTokens(tokens.join(',')).join(', ');
}

type AddressParts = {
  fullAddress?: string | null;
  street?: string | null;
  buildingNumber?: string | null;
  district?: string | null;
  province?: string | null;
  country?: string | null;
};

/** Firma adres kaydının tek satırlık metni; açık adres yoksa parçalardan kurulur. */
export function addressText(address: AddressParts): string {
  const full = address.fullAddress?.trim();
  if (full) return full;
  const street = [address.street, address.buildingNumber].map((part) => part?.trim()).filter(Boolean).join(' ');
  return [street, address.district, address.province, address.country].map((part) => part?.trim()).filter(Boolean).join(', ');
}

/** Boşları atar, Türkçe duyarsız tekilleştirir ve alfabetik sıralar (ör. kayıtlı kontrol üniteleri). */
export function distinctValues(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const key = normalizeSearch(value);
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'tr'));
}

/** Incoterms® 2020 teslim şekilleri. */
export const INCOTERMS = [
  { code: 'EXW', name: 'Ex Works · İş yerinde teslim' },
  { code: 'FCA', name: 'Free Carrier · Taşıyıcıya teslim' },
  { code: 'CPT', name: 'Carriage Paid To · Taşıma ödenmiş' },
  { code: 'CIP', name: 'Carriage and Insurance Paid · Taşıma ve sigorta ödenmiş' },
  { code: 'DAP', name: 'Delivered at Place · Belirlenen yerde teslim' },
  { code: 'DPU', name: 'Delivered at Place Unloaded · Boşaltılmış teslim' },
  { code: 'DDP', name: 'Delivered Duty Paid · Gümrük vergisi ödenmiş' },
  { code: 'FAS', name: 'Free Alongside Ship · Gemi doğrultusunda teslim' },
  { code: 'FOB', name: 'Free on Board · Gemide teslim' },
  { code: 'CFR', name: 'Cost and Freight · Masraflar ve navlun' },
  { code: 'CIF', name: 'Cost, Insurance and Freight · Masraflar, sigorta ve navlun' },
] as const;

type SerialCandidate = { product?: { id: string } | null; category?: { code: string } | null };

/** Web sevkiyat satırı: seri no seçenekleri kategoriye ve (seçiliyse) ürüne göre süzülür. */
export function matchesStockLine(item: SerialCandidate, filter: { categoryCode?: string | null; productModelId?: string | null }): boolean {
  if (filter.categoryCode && (item.category?.code ?? 'TEZGAH') !== filter.categoryCode) return false;
  if (filter.productModelId && item.product?.id !== filter.productModelId) return false;
  return true;
}
