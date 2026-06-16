/**
 * Coğrafi yardımcılar — satış haritası (yakındaki firmalar) için.
 *
 * Firmalarda GPS koordinatı tutulmuyor; yalnızca il (city) / ilçe (district)
 * metni var. Bu yüzden firmalar, yerleşik Türkiye il merkez koordinatları
 * tablosuyla haritaya yaklaşık olarak yerleştirilir (çevrimdışı, anahtarsız).
 *
 * Aynı ildeki firmaların üst üste binmemesi için firma id'sine göre küçük,
 * deterministik bir sapma (jitter ~±4 km) uygulanır. Bu nedenle harita
 * üzerindeki konum "şehir merkezine göre yaklaşık"tır; gerçek navigasyon için
 * `openDirections` firmanın adres metnini kullanır.
 */

export type LatLng = { lat: number; lng: number };

/** Türkçe karakterleri sadeleştirip küçük harfe indirger (eşleştirme anahtarı). */
const TR_MAP: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
};
export const normalizeTr = (s?: string | null): string =>
  (s ?? "")
    .trim()
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (m) => TR_MAP[m] ?? m)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// 81 il merkez koordinatları (yaklaşık ondalık derece).
const PROVINCES: Array<[string, number, number]> = [
  ["Adana", 37.0, 35.321], ["Adıyaman", 37.764, 38.278], ["Afyonkarahisar", 38.757, 30.539],
  ["Ağrı", 39.719, 43.051], ["Amasya", 40.653, 35.833], ["Ankara", 39.933, 32.859],
  ["Antalya", 36.897, 30.713], ["Artvin", 41.183, 41.819], ["Aydın", 37.848, 27.846],
  ["Balıkesir", 39.649, 27.886], ["Bilecik", 40.142, 29.979], ["Bingöl", 38.885, 40.498],
  ["Bitlis", 38.401, 42.108], ["Bolu", 40.736, 31.606], ["Burdur", 37.721, 30.29],
  ["Bursa", 40.188, 29.06], ["Çanakkale", 40.156, 26.414], ["Çankırı", 40.601, 33.616],
  ["Çorum", 40.55, 34.955], ["Denizli", 37.776, 29.086], ["Diyarbakır", 37.914, 40.23],
  ["Edirne", 41.677, 26.556], ["Elazığ", 38.681, 39.227], ["Erzincan", 39.75, 39.5],
  ["Erzurum", 39.904, 41.267], ["Eskişehir", 39.776, 30.521], ["Gaziantep", 37.066, 37.383],
  ["Giresun", 40.913, 38.389], ["Gümüşhane", 40.46, 39.481], ["Hakkari", 37.575, 43.741],
  ["Hatay", 36.202, 36.16], ["Isparta", 37.764, 30.553], ["Mersin", 36.812, 34.641],
  ["İstanbul", 41.008, 28.978], ["İzmir", 38.423, 27.143], ["Kars", 40.602, 43.097],
  ["Kastamonu", 41.388, 33.782], ["Kayseri", 38.731, 35.485], ["Kırklareli", 41.735, 27.225],
  ["Kırşehir", 39.146, 34.161], ["Kocaeli", 40.766, 29.916], ["Konya", 37.872, 32.493],
  ["Kütahya", 39.424, 29.984], ["Malatya", 38.355, 38.31], ["Manisa", 38.614, 27.43],
  ["Kahramanmaraş", 37.575, 36.937], ["Mardin", 37.312, 40.735], ["Muğla", 37.215, 28.363],
  ["Muş", 38.746, 41.491], ["Nevşehir", 38.624, 34.714], ["Niğde", 37.966, 34.679],
  ["Ordu", 40.984, 37.879], ["Rize", 41.025, 40.523], ["Sakarya", 40.78, 30.403],
  ["Samsun", 41.292, 36.331], ["Siirt", 37.929, 41.94], ["Sinop", 42.027, 35.153],
  ["Sivas", 39.748, 37.018], ["Tekirdağ", 40.978, 27.511], ["Tokat", 40.314, 36.554],
  ["Trabzon", 41.005, 39.727], ["Tunceli", 39.107, 39.548], ["Şanlıurfa", 37.168, 38.793],
  ["Uşak", 38.683, 29.408], ["Van", 38.494, 43.38], ["Yozgat", 39.82, 34.808],
  ["Zonguldak", 41.456, 31.798], ["Aksaray", 38.369, 34.029], ["Bayburt", 40.255, 40.224],
  ["Karaman", 37.181, 33.215], ["Kırıkkale", 39.846, 33.515], ["Batman", 37.881, 41.132],
  ["Şırnak", 37.519, 42.455], ["Bartın", 41.638, 32.337], ["Ardahan", 41.111, 42.702],
  ["Iğdır", 39.92, 44.045], ["Yalova", 40.655, 29.277], ["Karabük", 41.204, 32.628],
  ["Kilis", 36.718, 37.121], ["Osmaniye", 37.075, 36.247], ["Düzce", 40.838, 31.163],
];

/** İl/ilçe adı → merkez koordinatı (normalize edilmiş anahtarla). */
const CENTROIDS: Record<string, LatLng> = PROVINCES.reduce((acc, [name, lat, lng]) => {
  acc[normalizeTr(name)] = { lat, lng };
  return acc;
}, {} as Record<string, LatLng>);

const EXACT_FIRM_COORDS: Record<string, LatLng> = {
  "0f8d8632-6b0a-4f3d-9a56-61b70e7a1001": { lat: 41.04833, lng: 28.89556 },
  "0f8d8632-6b0a-4f3d-9a56-61b70e7a1002": { lat: 41.04083, lng: 28.9075 },
};

/** Türkiye geneli varsayılan görünüm merkezi (konum izni yoksa). */
export const TURKEY_CENTER: LatLng = { lat: 39.0, lng: 35.2 };

/** İd'den deterministik küçük sapma — aynı ildeki firmaların üst üste binmemesi için. */
const jitter = (seed: string): LatLng => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const a = (h & 0xff) / 255 - 0.5;
  const b = ((h >> 8) & 0xff) / 255 - 0.5;
  return { lat: a * 0.08, lng: b * 0.08 }; // ~±4.4 km
};

/** Bir firmanın yaklaşık harita konumu; il/ilçe tanınmazsa null. */
export const coordsForCity = (city?: string | null, district?: string | null, seed = ""): LatLng | null => {
  const exact = EXACT_FIRM_COORDS[seed];
  if (exact) return exact;
  const base = CENTROIDS[normalizeTr(city)] ?? CENTROIDS[normalizeTr(district)] ?? null;
  if (!base) return null;
  const j = jitter(seed);
  return { lat: base.lat + j.lat, lng: base.lng + j.lng };
};

/** Görüntülenecek il adları (Türkçe alfabetik) — manuel konum seçimi için. */
export const PROVINCE_NAMES: string[] = PROVINCES.map(([name]) => name).sort((a, b) => a.localeCompare(b, "tr"));

/** İl adından tam merkez koordinatı (jitter'sız); tanınmazsa null. */
export const centroidForProvince = (name?: string | null): LatLng | null =>
  CENTROIDS[normalizeTr(name)] ?? null;

/** İki nokta arası kuş uçuşu mesafe (km). */
export const haversineKm = (a: LatLng, b: LatLng): number => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

const joinAddress = (parts: Array<string | undefined | null>) =>
  parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" ").trim();

/** Adres metnini Google Haritalar'da arama olarak açar. */
export const openInMaps = (parts: Array<string | undefined | null>): boolean => {
  const q = joinAddress(parts);
  if (!q) return false;
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, "_blank", "noopener");
  return true;
};

/** Adres metnine yol tarifi (directions) açar — navigasyon için gerçek adres kullanılır. */
export const openDirections = (parts: Array<string | undefined | null>): boolean => {
  const q = joinAddress(parts);
  if (!q) return false;
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`, "_blank", "noopener");
  return true;
};
