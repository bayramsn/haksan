import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'geocode:';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'HaksanCRM-Mobile/1.0 (contact@haksanmakina.com.tr)';

export type LatLng = { latitude: number; longitude: number };

/** Ücretsiz OpenStreetMap Nominatim geocoding — API key gerekmez */
export async function geocodeAddress(query: string): Promise<LatLng | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;

  const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
  if (cached) {
    try {
      return JSON.parse(cached) as LatLng;
    } catch {
      // ignore corrupt cache
    }
  }

  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=tr`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data[0]) return null;
    const coord = { latitude: Number(data[0].lat), longitude: Number(data[0].lon) };
    if (!Number.isFinite(coord.latitude)) return null;
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(coord));
    return coord;
  } catch {
    return null;
  }
}

export function companyGeoQuery(item: Record<string, unknown>): string {
  const parts = [
    item.city,
    item.district,
    item.province,
    item.addressCity,
    item.addressStreet,
    item.legalTitle,
    'Türkiye',
  ]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean);
  return parts.slice(0, 4).join(', ');
}

const CITY_COORDS: Record<string, LatLng> = {
  istanbul: { latitude: 41.01, longitude: 28.98 },
  ankara: { latitude: 39.93, longitude: 32.85 },
  izmir: { latitude: 38.42, longitude: 27.14 },
  bursa: { latitude: 40.19, longitude: 29.06 },
  antalya: { latitude: 36.9, longitude: 30.7 },
  kocaeli: { latitude: 40.77, longitude: 29.96 },
  gaziantep: { latitude: 37.07, longitude: 37.38 },
};

/** Şehir adından yaklaşık koordinat (Nominatim başarısız olursa) */
export function fallbackCoords(item: Record<string, unknown>, index: number): LatLng {
  const city = String(item.city ?? item.addressCity ?? item.province ?? '').toLowerCase();
  for (const [name, c] of Object.entries(CITY_COORDS)) {
    if (city.includes(name)) {
      const jitter = (index % 7) * 0.012;
      return { latitude: c.latitude + jitter * 0.3, longitude: c.longitude + jitter * 0.5 };
    }
  }
  const base = CITY_COORDS.istanbul;
  const ring = (index % 20) * 0.08;
  return { latitude: base.latitude + ring * 0.2, longitude: base.longitude + ring * 0.15 };
}
