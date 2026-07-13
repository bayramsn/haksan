/**
 * Ülkeye göre il/ilçe (state-region / şehir) verisi.
 *
 * - Türkiye için mevcut 81 il (`PROVINCE_NAMES`) ve ilçe listesi
 *   (`DISTRICTS_BY_PROVINCE`) yeniden kullanılır.
 * - Başlıca ihracat/tedarik ülkeleri için başlıca eyalet/bölge → şehir verisi
 *   burada tutulur. Listede olmayan ülkeler (ör. "Diğer") ve verisi olmayan
 *   il/ilçe için combobox serbest metin girişine izin verir.
 *
 * Amaç: yeni firma eklenirken ülke seçimine göre İl ve İlçe önerileri gelsin.
 */
import { PROVINCE_NAMES } from "./geo";
import { DISTRICTS_BY_PROVINCE } from "@haksan/shared";

/** Yabancı ülkelerde: il (eyalet/bölge) → şehir (ilçe karşılığı) listesi. */
export const GEO_BY_COUNTRY: Record<string, Record<string, readonly string[]>> = {
  Almanya: {
    "Bavyera (Bayern)": ["München", "Nürnberg", "Augsburg", "Regensburg", "Würzburg", "Ingolstadt"],
    "Baden-Württemberg": ["Stuttgart", "Mannheim", "Karlsruhe", "Freiburg", "Heilbronn", "Ulm"],
    "Kuzey Ren-Vestfalya": ["Köln", "Düsseldorf", "Dortmund", "Essen", "Duisburg", "Bochum"],
    Hessen: ["Frankfurt", "Wiesbaden", "Kassel", "Darmstadt", "Offenbach"],
    Berlin: ["Berlin"],
    Hamburg: ["Hamburg"],
    "Aşağı Saksonya": ["Hannover", "Braunschweig", "Osnabrück", "Wolfsburg"],
    Saksonya: ["Dresden", "Leipzig", "Chemnitz"],
    "Rheinland-Pfalz": ["Mainz", "Ludwigshafen", "Koblenz"],
  },
  İtalya: {
    Lombardia: ["Milano", "Brescia", "Bergamo", "Monza", "Como", "Varese"],
    Piemonte: ["Torino", "Novara", "Alessandria", "Cuneo", "Asti"],
    Veneto: ["Venezia", "Verona", "Padova", "Vicenza", "Treviso"],
    "Emilia-Romagna": ["Bologna", "Modena", "Parma", "Reggio Emilia", "Rimini"],
    Toscana: ["Firenze", "Prato", "Pisa", "Livorno", "Arezzo"],
    Lazio: ["Roma", "Latina", "Frosinone"],
    Campania: ["Napoli", "Salerno", "Caserta"],
  },
  ABD: {
    California: ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento"],
    Texas: ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth"],
    "New York": ["New York City", "Buffalo", "Rochester", "Albany"],
    Illinois: ["Chicago", "Rockford", "Aurora"],
    Michigan: ["Detroit", "Grand Rapids", "Warren", "Ann Arbor"],
    Ohio: ["Cleveland", "Columbus", "Cincinnati", "Toledo"],
    Florida: ["Miami", "Orlando", "Tampa", "Jacksonville"],
    Pennsylvania: ["Philadelphia", "Pittsburgh", "Allentown"],
    "North Carolina": ["Charlotte", "Raleigh", "Greensboro"],
    Georgia: ["Atlanta", "Savannah", "Augusta"],
  },
  Çin: {
    Guangdong: ["Guangzhou", "Shenzhen", "Dongguan", "Foshan", "Zhongshan"],
    Zhejiang: ["Hangzhou", "Ningbo", "Wenzhou", "Taizhou"],
    Jiangsu: ["Nanjing", "Suzhou", "Wuxi", "Changzhou", "Nantong"],
    Shandong: ["Jinan", "Qingdao", "Yantai", "Weifang"],
    Şanghay: ["Shanghai"],
    Pekin: ["Beijing"],
    Fujian: ["Xiamen", "Fuzhou", "Quanzhou"],
    Liaoning: ["Shenyang", "Dalian", "Anshan"],
    Hebei: ["Shijiazhuang", "Tangshan"],
  },
  Japonya: {
    Tokyo: ["Tokyo"],
    Osaka: ["Osaka", "Sakai", "Higashiosaka"],
    Aichi: ["Nagoya", "Toyota", "Okazaki", "Kariya"],
    Kanagawa: ["Yokohama", "Kawasaki", "Sagamihara"],
    Hyogo: ["Kobe", "Himeji", "Amagasaki"],
    Shizuoka: ["Hamamatsu", "Shizuoka", "Fuji"],
    Ishikawa: ["Kanazawa", "Komatsu"],
    Fukuoka: ["Fukuoka", "Kitakyushu"],
    Gunma: ["Maebashi", "Ota"],
  },
  "Güney Kore": {
    Seul: ["Seoul"],
    Gyeonggi: ["Suwon", "Seongnam", "Ansan", "Bucheon", "Hwaseong"],
    Busan: ["Busan"],
    Incheon: ["Incheon"],
    Daegu: ["Daegu"],
    Gyeongnam: ["Changwon", "Gimhae", "Yangsan"],
    Ulsan: ["Ulsan"],
    Daejeon: ["Daejeon"],
    "Chungcheong (Kuzey)": ["Cheongju", "Chungju"],
  },
  Tayvan: {
    Taipei: ["Taipei"],
    "New Taipei": ["New Taipei"],
    Taoyuan: ["Taoyuan"],
    Taichung: ["Taichung", "Dali", "Fengyuan"],
    Tainan: ["Tainan"],
    Kaohsiung: ["Kaohsiung"],
    Hsinchu: ["Hsinchu"],
    Changhua: ["Changhua"],
  },
  İngiltere: {
    Londra: ["London"],
    "Greater Manchester": ["Manchester", "Salford", "Bolton"],
    "West Midlands": ["Birmingham", "Coventry", "Wolverhampton"],
    "West Yorkshire": ["Leeds", "Bradford", "Huddersfield"],
    Merseyside: ["Liverpool", "Birkenhead"],
    "Tyne and Wear": ["Newcastle", "Sunderland"],
    "South Yorkshire": ["Sheffield", "Rotherham"],
    İskoçya: ["Glasgow", "Edinburgh", "Aberdeen"],
    Galler: ["Cardiff", "Swansea"],
  },
  Fransa: {
    "Île-de-France": ["Paris", "Versailles", "Boulogne-Billancourt"],
    "Auvergne-Rhône-Alpes": ["Lyon", "Grenoble", "Saint-Étienne", "Clermont-Ferrand"],
    "Provence-Alpes-Côte d'Azur": ["Marseille", "Nice", "Toulon", "Aix-en-Provence"],
    Occitanie: ["Toulouse", "Montpellier", "Nîmes"],
    "Hauts-de-France": ["Lille", "Amiens", "Roubaix"],
    "Grand Est": ["Strasbourg", "Reims", "Metz", "Nancy", "Mulhouse"],
    "Nouvelle-Aquitaine": ["Bordeaux", "Limoges", "Poitiers"],
    "Pays de la Loire": ["Nantes", "Angers", "Le Mans"],
  },
  İspanya: {
    Madrid: ["Madrid", "Móstoles", "Alcalá de Henares"],
    Katalonya: ["Barcelona", "Girona", "Tarragona", "Sabadell"],
    "Bask Bölgesi": ["Bilbao", "San Sebastián", "Vitoria"],
    Valensiya: ["Valencia", "Alicante", "Castellón"],
    Endülüs: ["Sevilla", "Málaga", "Córdoba", "Granada"],
    Aragón: ["Zaragoza", "Huesca"],
    Galicia: ["Vigo", "A Coruña"],
  },
  Hollanda: {
    "Kuzey Hollanda": ["Amsterdam", "Haarlem", "Zaanstad"],
    "Güney Hollanda": ["Rotterdam", "Den Haag", "Leiden", "Delft"],
    "Kuzey Brabant": ["Eindhoven", "Tilburg", "Breda", "Den Bosch"],
    Utrecht: ["Utrecht", "Amersfoort"],
    Gelderland: ["Nijmegen", "Arnhem", "Apeldoorn"],
    Overijssel: ["Enschede", "Zwolle"],
    Limburg: ["Maastricht", "Venlo"],
  },
  İsviçre: {
    Zürih: ["Zürich", "Winterthur"],
    Cenevre: ["Genève"],
    Bern: ["Bern", "Biel"],
    Vaud: ["Lausanne", "Montreux"],
    "Basel-Stadt": ["Basel"],
    Ticino: ["Lugano", "Bellinzona"],
    "St. Gallen": ["St. Gallen"],
    Aargau: ["Aarau", "Baden"],
  },
  Avusturya: {
    Viyana: ["Wien"],
    "Yukarı Avusturya": ["Linz", "Wels", "Steyr"],
    Steiermark: ["Graz", "Leoben"],
    Tirol: ["Innsbruck", "Kufstein"],
    Salzburg: ["Salzburg"],
    Vorarlberg: ["Dornbirn", "Feldkirch"],
    Kärnten: ["Klagenfurt", "Villach"],
  },
  Polonya: {
    Mazowieckie: ["Warszawa", "Radom", "Płock"],
    Śląskie: ["Katowice", "Gliwice", "Sosnowiec", "Bielsko-Biała"],
    Małopolskie: ["Kraków", "Tarnów"],
    Wielkopolskie: ["Poznań", "Kalisz"],
    Dolnośląskie: ["Wrocław", "Wałbrzych"],
    Pomorskie: ["Gdańsk", "Gdynia"],
    Łódzkie: ["Łódź"],
  },
  Romanya: {
    Bükreş: ["București"],
    Cluj: ["Cluj-Napoca"],
    Timiș: ["Timișoara"],
    Iași: ["Iași"],
    Brașov: ["Brașov"],
    Constanța: ["Constanța"],
    Arad: ["Arad"],
    Sibiu: ["Sibiu"],
  },
};

/** Bir ülke için il (eyalet/bölge) öneri listesi. Türkiye → 81 il. */
export function provincesForCountry(country?: string | null): string[] {
  if (!country || country === "Türkiye") return PROVINCE_NAMES;
  const geo = GEO_BY_COUNTRY[country];
  if (!geo) return [];
  return Object.keys(geo);
}

/** Bir ülke + il için ilçe (şehir) öneri listesi. Türkiye → ilçe listesi. */
export function districtsForCountry(country: string | null | undefined, province: string): string[] {
  if (!country || country === "Türkiye") return [...(DISTRICTS_BY_PROVINCE[province] ?? [])];
  const geo = GEO_BY_COUNTRY[country];
  if (!geo || !province) return [];
  return [...(geo[province] ?? [])];
}

/** Ülke için hazır il/ilçe verisi var mı? (Yoksa serbest metin.) */
export function hasGeoData(country?: string | null): boolean {
  if (!country || country === "Türkiye") return true;
  return Boolean(GEO_BY_COUNTRY[country]);
}
