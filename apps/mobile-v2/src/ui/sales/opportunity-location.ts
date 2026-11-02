/** Web `lib/opportunityLocation.ts` ile aynı: her il, il merkezinin coğrafi bölgesine göre gruplanır. */
export const OPPORTUNITY_REGIONS: Record<string, readonly string[]> = {
  Marmara: ['Balıkesir', 'Bilecik', 'Bursa', 'Çanakkale', 'Edirne', 'İstanbul', 'Kırklareli', 'Kocaeli', 'Sakarya', 'Tekirdağ', 'Yalova'],
  Ege: ['Afyonkarahisar', 'Aydın', 'Denizli', 'İzmir', 'Kütahya', 'Manisa', 'Muğla', 'Uşak'],
  Akdeniz: ['Adana', 'Antalya', 'Burdur', 'Hatay', 'Isparta', 'Kahramanmaraş', 'Mersin', 'Osmaniye'],
  'İç Anadolu': ['Aksaray', 'Ankara', 'Çankırı', 'Eskişehir', 'Karaman', 'Kayseri', 'Kırıkkale', 'Kırşehir', 'Konya', 'Nevşehir', 'Niğde', 'Sivas', 'Yozgat'],
  Karadeniz: ['Amasya', 'Artvin', 'Bartın', 'Bayburt', 'Bolu', 'Çorum', 'Düzce', 'Giresun', 'Gümüşhane', 'Karabük', 'Kastamonu', 'Ordu', 'Rize', 'Samsun', 'Sinop', 'Tokat', 'Trabzon', 'Zonguldak'],
  'Doğu Anadolu': ['Ağrı', 'Ardahan', 'Bingöl', 'Bitlis', 'Elazığ', 'Erzincan', 'Erzurum', 'Hakkari', 'Iğdır', 'Kars', 'Malatya', 'Muş', 'Tunceli', 'Van'],
  'Güneydoğu Anadolu': ['Adıyaman', 'Batman', 'Diyarbakır', 'Gaziantep', 'Kilis', 'Mardin', 'Siirt', 'Şanlıurfa', 'Şırnak'],
};

// company-map/geo.ts normalizeTr ile aynı; node:test bu dosyayı alias çözmeden yükler.
const TR_MAP: Record<string, string> = { ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u' };
const normalizeTr = (value: string) =>
  value.trim().replace(/[çÇğĞıİöÖşŞüÜ]/g, (m) => TR_MAP[m] ?? m).toLowerCase().replace(/[^a-z0-9]/g, '');

const PROVINCE_NAMES = Object.values(OPPORTUNITY_REGIONS).flat().sort((a, b) => a.localeCompare(b, 'tr'));
const regionByCity = new Map(
  Object.entries(OPPORTUNITY_REGIONS).flatMap(([region, cities]) => cities.map((city) => [normalizeTr(city), region] as const))
);
const canonicalCities = new Map(PROVINCE_NAMES.map((city) => [normalizeTr(city), city]));

/** Firma adresi önce gelir; firmaya dönüşmemiş fırsatta lead ili kullanılır. */
export function opportunityCity(opportunity: { leadCity?: string | null }, companyCity?: string | null): string {
  const city = companyCity?.trim() || opportunity.leadCity?.trim() || '';
  return canonicalCities.get(normalizeTr(city)) ?? city;
}

export function opportunityRegion(city: string): string {
  return regionByCity.get(normalizeTr(city)) ?? '';
}

/** `null` = süzgeç yok. */
export function matchesOpportunityLocation(actualCity: string, city: string | null, region: string | null): boolean {
  return (!city || normalizeTr(actualCity) === normalizeTr(city)) && (!region || opportunityRegion(actualCity) === region);
}

export function regionCities(region: string | null): string[] {
  return region ? [...(OPPORTUNITY_REGIONS[region] ?? [])].sort((a, b) => a.localeCompare(b, 'tr')) : PROVINCE_NAMES;
}
