import { normalizeTr, PROVINCE_NAMES } from "./geo";

// Her il, il merkezinin bulunduğu coğrafi bölgeye göre gruplanır.
export const OPPORTUNITY_REGIONS: Record<string, readonly string[]> = {
  Marmara: ["Balıkesir", "Bilecik", "Bursa", "Çanakkale", "Edirne", "İstanbul", "Kırklareli", "Kocaeli", "Sakarya", "Tekirdağ", "Yalova"],
  Ege: ["Afyonkarahisar", "Aydın", "Denizli", "İzmir", "Kütahya", "Manisa", "Muğla", "Uşak"],
  Akdeniz: ["Adana", "Antalya", "Burdur", "Hatay", "Isparta", "Kahramanmaraş", "Mersin", "Osmaniye"],
  "İç Anadolu": ["Aksaray", "Ankara", "Çankırı", "Eskişehir", "Karaman", "Kayseri", "Kırıkkale", "Kırşehir", "Konya", "Nevşehir", "Niğde", "Sivas", "Yozgat"],
  Karadeniz: ["Amasya", "Artvin", "Bartın", "Bayburt", "Bolu", "Çorum", "Düzce", "Giresun", "Gümüşhane", "Karabük", "Kastamonu", "Ordu", "Rize", "Samsun", "Sinop", "Tokat", "Trabzon", "Zonguldak"],
  "Doğu Anadolu": ["Ağrı", "Ardahan", "Bingöl", "Bitlis", "Elazığ", "Erzincan", "Erzurum", "Hakkari", "Iğdır", "Kars", "Malatya", "Muş", "Tunceli", "Van"],
  "Güneydoğu Anadolu": ["Adıyaman", "Batman", "Diyarbakır", "Gaziantep", "Kilis", "Mardin", "Siirt", "Şanlıurfa", "Şırnak"],
};

const regionByCity = new Map(Object.entries(OPPORTUNITY_REGIONS).flatMap(([region, cities]) =>
  cities.map((city) => [normalizeTr(city), region] as const)));
const canonicalCities = new Map(PROVINCE_NAMES.map((city) => [normalizeTr(city), city]));

export function opportunityCity(opportunity: { leadCity?: string }, company?: { city?: string }) {
  const city = company?.city?.trim() || opportunity.leadCity?.trim() || "";
  return canonicalCities.get(normalizeTr(city)) ?? city;
}

export function opportunityRegion(city: string) {
  return regionByCity.get(normalizeTr(city)) ?? "";
}

export function matchesOpportunityLocation(actualCity: string, city: string, region: string) {
  return (city === "all" || normalizeTr(actualCity) === normalizeTr(city))
    && (region === "all" || opportunityRegion(actualCity) === region);
}
