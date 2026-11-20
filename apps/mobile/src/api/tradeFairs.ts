import { api } from './apiClient';
import { qs } from './qs';
import type { Paginated } from './services';

export type TradeFairFilters = { fairName?: string; q?: string; province?: string; metByUserId?: string };
export type TradeFairRecord = {
  id: string; fairName: string; companyName: string; contactName: string; contactTitle: string | null;
  mobilePhone: string | null; email: string | null; country: string; province: string | null; district: string | null;
  productCategory: string | null; productType: string | null; notes: string | null;
  contacted: boolean; contactMethod: string | null; contactDate: string | null; contactNotes: string | null;
  offerSent: boolean; customerConverted: boolean; metByUserId: string | null; metByName: string | null;
  visitorCount: number; createdAt: string;
};
export type TradeFairSummary = {
  fairs: Array<{ name: string; total: number; lastAt: string }>;
  byUser: Array<{ userId: string | null; fullName: string | null; meetings: number; people: number }>;
};
/** Web geo.ts ile aynı 81 il. Yabancı ülkelerden kayıtlar şehir filtresi kaldırılarak görülebilir. */
export const TRADE_FAIR_PROVINCES: readonly string[] = ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"];

export const tradeFairsService = {
  list: (filters: TradeFairFilters & { page?: number; pageSize?: number } = {}) => api.get<Paginated<TradeFairRecord>>(`/trade-fairs${qs(filters)}`),
  summary: (fairName?: string) => api.get<TradeFairSummary>(`/trade-fairs/summary${qs({ fairName })}`),
  staff: () => api.get<Array<{ id: string; fullName: string }>>('/trade-fairs/staff'),
};
/** Listeyle aynı dört filtre, tüm eşleşen kayıtları dışa aktarır; sayfa sınırı uygulanmaz. */
export function tradeFairExportPath(filters: TradeFairFilters): string {
  return `/exports/trade-fairs${qs({ fairName: filters.fairName, q: filters.q, province: filters.province, metByUserId: filters.metByUserId })}`;
}
