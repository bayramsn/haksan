/**
 * Satış haritası coğrafi yardımcıları (web lib/geo.ts + SalesMap.tsx ile aynı
 * kurallar). Koordinatı olmayan firma il/ilçe merkezine yaklaşık yerleşir;
 * aynı ildeki firmalar üst üste binmesin diye id'ye bağlı küçük sapma uygulanır.
 */

export type LatLng = { lat: number; lng: number };

const TR_MAP: Record<string, string> = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i',
  ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
};

export function normalizeTr(value?: string | null): string {
  return (value ?? '')
    .trim()
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (match) => TR_MAP[match] ?? match)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const PROVINCES: [string, number, number][] = [
  ['Adana', 37.0, 35.321], ['Adıyaman', 37.764, 38.278], ['Afyonkarahisar', 38.757, 30.539],
  ['Ağrı', 39.719, 43.051], ['Amasya', 40.653, 35.833], ['Ankara', 39.933, 32.859],
  ['Antalya', 36.897, 30.713], ['Artvin', 41.183, 41.819], ['Aydın', 37.848, 27.846],
  ['Balıkesir', 39.649, 27.886], ['Bilecik', 40.142, 29.979], ['Bingöl', 38.885, 40.498],
  ['Bitlis', 38.401, 42.108], ['Bolu', 40.736, 31.606], ['Burdur', 37.721, 30.29],
  ['Bursa', 40.188, 29.06], ['Çanakkale', 40.156, 26.414], ['Çankırı', 40.601, 33.616],
  ['Çorum', 40.55, 34.955], ['Denizli', 37.776, 29.086], ['Diyarbakır', 37.914, 40.23],
  ['Edirne', 41.677, 26.556], ['Elazığ', 38.681, 39.227], ['Erzincan', 39.75, 39.5],
  ['Erzurum', 39.904, 41.267], ['Eskişehir', 39.776, 30.521], ['Gaziantep', 37.066, 37.383],
  ['Giresun', 40.913, 38.389], ['Gümüşhane', 40.46, 39.481], ['Hakkari', 37.575, 43.741],
  ['Hatay', 36.202, 36.16], ['Isparta', 37.764, 30.553], ['Mersin', 36.812, 34.641],
  ['İstanbul', 41.008, 28.978], ['İzmir', 38.423, 27.143], ['Kars', 40.602, 43.097],
  ['Kastamonu', 41.388, 33.782], ['Kayseri', 38.731, 35.485], ['Kırklareli', 41.735, 27.225],
  ['Kırşehir', 39.146, 34.161], ['Kocaeli', 40.766, 29.916], ['Konya', 37.872, 32.493],
  ['Kütahya', 39.424, 29.984], ['Malatya', 38.355, 38.31], ['Manisa', 38.614, 27.43],
  ['Kahramanmaraş', 37.575, 36.937], ['Mardin', 37.312, 40.735], ['Muğla', 37.215, 28.363],
  ['Muş', 38.746, 41.491], ['Nevşehir', 38.624, 34.714], ['Niğde', 37.966, 34.679],
  ['Ordu', 40.984, 37.879], ['Rize', 41.025, 40.523], ['Sakarya', 40.78, 30.403],
  ['Samsun', 41.292, 36.331], ['Siirt', 37.929, 41.94], ['Sinop', 42.027, 35.153],
  ['Sivas', 39.748, 37.018], ['Tekirdağ', 40.978, 27.511], ['Tokat', 40.314, 36.554],
  ['Trabzon', 41.005, 39.727], ['Tunceli', 39.107, 39.548], ['Şanlıurfa', 37.168, 38.793],
  ['Uşak', 38.683, 29.408], ['Van', 38.494, 43.38], ['Yozgat', 39.82, 34.808],
  ['Zonguldak', 41.456, 31.798], ['Aksaray', 38.369, 34.029], ['Bayburt', 40.255, 40.224],
  ['Karaman', 37.181, 33.215], ['Kırıkkale', 39.846, 33.515], ['Batman', 37.881, 41.132],
  ['Şırnak', 37.519, 42.455], ['Bartın', 41.638, 32.337], ['Ardahan', 41.111, 42.702],
  ['Iğdır', 39.92, 44.045], ['Yalova', 40.655, 29.277], ['Karabük', 41.204, 32.628],
  ['Kilis', 36.718, 37.121], ['Osmaniye', 37.075, 36.247], ['Düzce', 40.838, 31.163],
];

const CENTROIDS: Record<string, LatLng> = Object.fromEntries(
  PROVINCES.map(([name, lat, lng]) => [normalizeTr(name), { lat, lng }]),
);

export const TURKEY_CENTER: LatLng = { lat: 39.0, lng: 35.2 };

export const PROVINCE_NAMES: string[] = PROVINCES.map(([name]) => name).sort((a, b) => a.localeCompare(b, 'tr'));

function jitter(seed: string): LatLng {
  let hash = 0;
  for (let index = 0; index < seed.length; index++) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  const a = (hash & 0xff) / 255 - 0.5;
  const b = ((hash >> 8) & 0xff) / 255 - 0.5;
  return { lat: a * 0.08, lng: b * 0.08 };
}

export function centroidForProvince(name?: string | null): LatLng | null {
  return CENTROIDS[normalizeTr(name)] ?? null;
}

export function coordsForCity(city?: string | null, district?: string | null, seed = ''): LatLng | null {
  const base = CENTROIDS[normalizeTr(city)] ?? CENTROIDS[normalizeTr(district)] ?? null;
  if (!base) return null;
  const offset = jitter(seed);
  return { lat: base.lat + offset.lat, lng: base.lng + offset.lng };
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type FirmType = 'customer' | 'supplier_customer' | 'supplier' | 'competitor';
export type LocationQuality = 'exact' | 'street' | 'area' | 'fallback';

const EXACT_SOURCES = new Set(['manual', 'verified', 'osm_exact']);

export function isExactLocationSource(source?: string | null): boolean {
  return EXACT_SOURCES.has(source ?? '');
}

export function locationQualityFor(source?: string | null): LocationQuality {
  if (isExactLocationSource(source)) return 'exact';
  if (source === 'osm_street') return 'street';
  if (source === 'osm_area') return 'area';
  return 'fallback';
}

export const LOCATION_QUALITY_LABELS: Record<LocationQuality, string> = {
  exact: 'Doğrulanmış tam pin',
  street: 'Sokak/cadde yaklaşık',
  area: 'İlçe/şehir yaklaşık',
  fallback: 'Şehir/ilçe merkezi',
};

export function osmSourceFor(matchQuality: 'exact' | 'street' | 'area'): 'osm_exact' | 'osm_street' | 'osm_area' {
  return matchQuality === 'exact' ? 'osm_exact' : matchQuality === 'street' ? 'osm_street' : 'osm_area';
}

export function firmTypeOf(code: string | null | undefined): FirmType {
  return code === 'supplier' || code === 'supplier_customer' || code === 'competitor' ? code : 'customer';
}

export type DirectoryRowLike = {
  id: string;
  legalTitle: string;
  shortName: string | null;
  relationType: { code: string } | null;
  primaryAddress: {
    province: string | null;
    district: string | null;
    latitude: string | number | null;
    longitude: string | number | null;
    locationSource?: string | null;
  } | null;
};

export type MappedFirm<T> = {
  row: T;
  id: string;
  name: string;
  city: string | null;
  district: string | null;
  firmType: FirmType;
  pos: LatLng;
  hasDbPin: boolean;
  locationQuality: LocationQuality;
  distanceKm: number | null;
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Konum çözüm sırası: DB koordinatı → il/ilçe merkezi; ikisi de yoksa haritada yok. */
export function mapFirms<T extends DirectoryRowLike>(rows: T[], userPos: LatLng | null): MappedFirm<T>[] {
  const result: MappedFirm<T>[] = [];
  for (const row of rows) {
    const address = row.primaryAddress;
    const lat = toNumber(address?.latitude);
    const lng = toNumber(address?.longitude);
    const dbPos = lat != null && lng != null ? { lat, lng } : null;
    const pos = dbPos ?? coordsForCity(address?.province, address?.district, row.id);
    if (!pos) continue;
    result.push({
      row,
      id: row.id,
      name: row.shortName || row.legalTitle,
      city: address?.province ?? null,
      district: address?.district ?? null,
      firmType: firmTypeOf(row.relationType?.code),
      pos,
      hasDbPin: Boolean(dbPos),
      locationQuality: dbPos ? locationQualityFor(address?.locationSource) : 'fallback',
      distanceKm: userPos ? haversineKm(userPos, pos) : null,
    });
  }
  return result;
}

export type MapRadius = 'all' | '50' | '100' | '250' | '500';

/** Web: arama varken yarıçap uygulanmaz; konum varsa mesafeye göre sıralanır. */
export function filterFirms<T>(
  firms: MappedFirm<T>[],
  filters: { firmType: 'all' | FirmType; radius: MapRadius; search: string },
): MappedFirm<T>[] {
  const term = filters.search.trim().toLocaleLowerCase('tr-TR');
  const maxKm = filters.radius === 'all' ? Infinity : Number(filters.radius);
  return firms
    .filter((firm) => filters.firmType === 'all' || firm.firmType === filters.firmType)
    .filter((firm) => Boolean(term) || firm.distanceKm == null || firm.distanceKm <= maxKm)
    .filter((firm) =>
      !term ||
      firm.name.toLocaleLowerCase('tr-TR').includes(term) ||
      (firm.city ?? '').toLocaleLowerCase('tr-TR').includes(term) ||
      (firm.district ?? '').toLocaleLowerCase('tr-TR').includes(term),
    )
    .sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      return a.name.localeCompare(b.name, 'tr');
    });
}

/** Tam pini olmayan firmalar (OSM ile düzeltme önerisi listesi). */
export function firmsWithoutExactPin<T extends DirectoryRowLike>(
  rows: T[],
  filters: { firmType: 'all' | FirmType; search: string },
  limit = 12,
): T[] {
  const term = filters.search.trim().toLocaleLowerCase('tr-TR');
  return rows
    .filter((row) => {
      const address = row.primaryAddress;
      return toNumber(address?.latitude) == null || toNumber(address?.longitude) == null || !isExactLocationSource(address?.locationSource);
    })
    .filter((row) => filters.firmType === 'all' || firmTypeOf(row.relationType?.code) === filters.firmType)
    .filter((row) => {
      if (!term) return true;
      const name = (row.shortName || row.legalTitle).toLocaleLowerCase('tr-TR');
      return (
        name.includes(term) ||
        (row.primaryAddress?.province ?? '').toLocaleLowerCase('tr-TR').includes(term) ||
        (row.primaryAddress?.district ?? '').toLocaleLowerCase('tr-TR').includes(term)
      );
    })
    .sort((a, b) => (a.shortName || a.legalTitle).localeCompare(b.shortName || b.legalTitle, 'tr'))
    .slice(0, limit);
}

/**
 * Ziyaret rotası: en yakın komşu sezgiseli. Başlangıç kullanıcı konumu (yoksa
 * ilk durak); toplam km yalnız kullanıcı konumu biliniyorsa ondan başlar.
 */
export function planRoute<T extends { pos: LatLng }>(stops: T[], start: LatLng | null): { ordered: T[]; totalKm: number } {
  if (stops.length === 0) return { ordered: [], totalKm: 0 };
  const remaining = [...stops];
  const ordered: T[] = [];
  let cursor: LatLng = start ?? remaining[0]!.pos;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestKm = Infinity;
    for (let index = 0; index < remaining.length; index++) {
      const km = haversineKm(cursor, remaining[index]!.pos);
      if (km < bestKm) {
        bestKm = km;
        bestIndex = index;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next!);
    cursor = next!.pos;
  }
  let totalKm = 0;
  let previous: LatLng | null = start;
  for (const stop of ordered) {
    if (previous) totalKm += haversineKm(previous, stop.pos);
    previous = stop.pos;
  }
  return { ordered, totalKm };
}

const coord = (point: LatLng) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;

/** Web ile aynı Google Haritalar çok duraklı rota adresi. */
export function googleRouteUrl(points: LatLng[]): string | null {
  if (points.length === 0) return null;
  return `https://www.google.com/maps/dir/${points.map(coord).join('/')}`;
}

/** Apple Haritalar: başlangıç + ardışık varış noktaları (`daddr` ... `+to:` ...). */
export function appleRouteUrl(points: LatLng[], hasStart: boolean): string | null {
  if (points.length === 0) return null;
  const [first, ...rest] = points;
  if (hasStart && rest.length > 0) {
    return `http://maps.apple.com/?saddr=${coord(first!)}&daddr=${rest.map(coord).join('+to:')}&dirflg=d`;
  }
  return `http://maps.apple.com/?daddr=${points.map(coord).join('+to:')}&dirflg=d`;
}

export function directionsUrl(point: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coord(point)}`;
}
