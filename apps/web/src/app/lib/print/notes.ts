// Teklif / proforma alt not setleri. Bunlar sabit şablon metinleridir; örnek PDF
// (layout referansı) ile aynı yapıda kalır, {{ALICI}} / {{YIL}} ve üst bilgiler
// her işlemde müşteri, teklif ve ürün verisinden doldurulur.

/** Satış teklifi alt notu: 3 bölümlü (Ödeme / Teslimat / Garanti). */
export interface QuoteNoteVariant {
  key: string;
  label: string;
  odeme: string[];
  teslimat: string[];
  garanti: string[];
}

/** Düz "NOTLAR" listesi (servis teklifleri ve proformalar). */
export interface FlatNoteVariant {
  key: string;
  label: string;
  notlar: string[];
}

export const QUOTE_NOTE_VARIANTS: QuoteNoteVariant[] = [
  {
    key: "ihracat",
    label: "İhracat Adrese Teslim",
    odeme: [
      "Teklifimiz tamamı nakit ödemeye göre düzenlenmiştir,",
      "Teklifimiz DAP/Saraybosna şekilde düzenlenmiş olup, Tezgahın İstanbul-Saraybosna karayolu taşıma ve sigortası, gümrük müşavirlik hizmetleri fiyatımıza dahildir. Bosna-Hersek gümrüğünde çıkabilecek gümrük vergileri fiyat teklifimize dahil edilmemiştir.",
    ],
    teslimat: [
      "Tezgâh İstanbul gümrüksüz bölgede sevkiyata hazırdır, sipariş halinde derhal ihracat işlemleri başlatılıp sevkiyat gerçekleştirilecektir,",
      "Tezgâh Saraybosna'da kamyon üzeri teslim edilecektir. Tezgahın kamyondan indirilmesi ile ilgili vinç/forklift organizasyonu alıcı firma tarafından karşılanacaktır.",
      "Tezgâh palet üzerinde, yol şartlarına uygun olarak ambalajlanmış vaziyette sevk edilecektir,",
    ],
    garanti: [
      "Tezgâhın güvenlik ve elektrik donanımı CE normlarına uygun olarak üretilmiştir,",
      "Tezgâhın üretim hatalarına karşı mekanik aksam garantisi 1 (bir) yıldır,",
      "Tezgâhın kontrol ünitesi 2(iki) yıl üretim hatalarına karşı MITSUBISHI/Türkiye garantisi kapsamındadır,",
      "Tezgâhın garantisi kurulumuna müteakip başlayacaktır,",
      "Tezgâhın teslimatından sonra en geç 2 (iki) gün içerisinde, HAKSAN MAKİNA teknik personeli tarafından tezgâhın kurulumu gerçekleştirilecektir,",
    ],
  },
  {
    key: "millilestirilmis",
    label: "Tezgah Millileştirilmiş",
    odeme: [
      "Teklifimiz, tamamı nakit/leasing aracılığı ile ödemeye göre düzenlenmiştir,",
      "Teklifimize tezgâhın cari orandaki %{{KDV_ORANI}} K.D.V.'si dahil edilmemiştir, Leasing aracılığı ile yapılan alımlarda K.D.V oranı %1 olarak tahakkuk ettirilir,",
      "Teklifimiz Millileştirilmiş teslim şeklinde düzenlenmiş olup, tezgâhın ithalatı ile ilgili masraf ve vergiler (Gümrük Vergisi, Liman Masrafları, Ardiye Giderleri, Gümrükleme Ücreti, İlave Gümrük Vergisi) fiyat teklifimize dahil edilmiştir.",
    ],
    teslimat: [
      "Tezgâhın teslimi kesin siparişten 90 (±10) gün sonra gerçekleştirilecektir,",
      "Tezgâh HAKSAN MAKİNA/Hadımköy antreposundan teslim edilecek olup, tezgahın İstanbul içi karayolu taşıma ve sigortası alıcı firma tarafından karşılanacaktır,",
      "Tezgâh palet üzerinde, yol şartlarına uygun olarak ambalajlanmış vaziyette sevk edilecektir,",
    ],
    garanti: [
      "Tezgâhın güvenlik ve elektrik donanımı CE normlarına uygun olarak üretilmiştir,",
      "Tezgâhın üretim hatalarına karşı mekanik aksam garantisi 1 (bir) yıldır,",
      "Tezgâhın kontrol ünitesi 2(iki) yıl üretim hatalarına karşı FANUC/Türkiye garantisi kapsamındadır,",
      "Tezgâhın garantisi kurulumuna müteakip başlayacaktır,",
      "Tezgâhın teslimatından sonra en geç 2 (iki) gün içerisinde, HAKSAN MAKİNA teknik personeli tarafından tezgâhın kurulumu gerçekleştirilecektir,",
      "Tezgâhın ile eğitim ve demo çalışması 2 (iki) gün süre ile HAKSAN MAKİNA teknik personeli tarafından yapılacaktır.",
    ],
  },
  {
    key: "cif-istanbul",
    label: "Tezgah CİF İstanbul",
    odeme: [
      "Teklifimiz, tamamı nakit/leasing aracılığı ile ödemeye göre düzenlenmiştir,",
      "Teklifimize tezgâhın cari orandaki %{{KDV_ORANI}} K.D.V.'si dahil edilmemiştir, Leasing aracılığı ile yapılan alımlarda K.D.V oranı %1 olarak tahakkuk ettirilir,",
      "Teklifimiz C.I.F/İstanbul teslim şeklinde düzenlenmiş olup, tezgahın ithalatı ile ilgili masraf ve vergiler (Gümrük Vergisi, Liman Masrafları, Ardiye Giderleri, Gümrükleme Ücreti, İlave Gümrük Vergisi) fiyat teklifimize dahil değildir. Tezgâh antrepo’dan devir edilecektir,",
    ],
    teslimat: [
      "Tezgâhın teslimi kesin siparişten 90 (±10) gün sonra gerçekleştirilecektir,",
      "Tezgâh HAKSAN MAKİNA/Hadımköy antreposundan teslim edilecek olup, tezgahın İstanbul içi karayolu taşıma ve sigortası alıcı firma tarafından karşılanacaktır,",
      "Tezgâh palet üzerinde, yol şartlarına uygun olarak ambalajlanmış vaziyette sevk edilecektir,",
    ],
    garanti: [
      "Tezgâhın güvenlik ve elektrik donanımı CE normlarına uygun olarak üretilmiştir,",
      "Tezgâhın üretim hatalarına karşı mekanik aksam garantisi 1 (bir) yıldır,",
      "Tezgâhın kontrol ünitesi 2(iki) yıl üretim hatalarına karşı FANUC/Türkiye garantisi kapsamındadır,",
      "Tezgâhın garantisi kurulumuna müteakip başlayacaktır,",
      "Tezgâhın teslimatından sonra en geç 2 (iki) gün içerisinde, HAKSAN MAKİNA teknik personeli tarafından tezgâhın kurulumu gerçekleştirilecektir,",
      "Tezgâhın ile eğitim ve demo çalışması 2 (iki) gün süre ile HAKSAN MAKİNA teknik personeli tarafından yapılacaktır.",
    ],
  },
  {
    key: "gumruk",
    label: "Gümrük Teklif",
    odeme: [
      "Teklifimiz, tamamı nakit/leasing aracılığı ile ödemeye göre düzenlenmiştir,",
      "Teklifimize tezgâhın cari orandaki %{{KDV_ORANI}} K.D.V.'si dahil edilmemiştir, Leasing aracılığı ile yapılan alımlarda K.D.V oranı %1 olarak tahakkuk ettirilir,",
      "Teklifimiz Gümrük teslim şeklinde düzenlenmiş olup, tezgâhın ithalatı ile ilgili masraf ve vergiler (Gümrük Vergisi, Liman Masrafları, Ardiye Giderleri, Gümrükleme Ücreti, İlave Gümrük Vergisi) fiyat teklifimize dahil değildir; gümrükleme işlemleri alıcı firma tarafından yürütülecektir.",
    ],
    teslimat: [
      "Tezgâhın teslimi kesin siparişten 90 (±10) gün sonra gerçekleştirilecektir,",
      "Tezgâh İstanbul gümrüğünde teslim edilecek olup, gümrük sonrası karayolu taşıma ve sigortası alıcı firma tarafından karşılanacaktır,",
      "Tezgâh palet üzerinde, yol şartlarına uygun olarak ambalajlanmış vaziyette sevk edilecektir,",
    ],
    garanti: [
      "Tezgâhın güvenlik ve elektrik donanımı CE normlarına uygun olarak üretilmiştir,",
      "Tezgâhın üretim hatalarına karşı mekanik aksam garantisi 1 (bir) yıldır,",
      "Tezgâhın kontrol ünitesi 2(iki) yıl üretim hatalarına karşı FANUC/Türkiye garantisi kapsamındadır,",
      "Tezgâhın garantisi kurulumuna müteakip başlayacaktır,",
      "Tezgâhın teslimatından sonra en geç 2 (iki) gün içerisinde, HAKSAN MAKİNA teknik personeli tarafından tezgâhın kurulumu gerçekleştirilecektir,",
      "Tezgâhın ile eğitim ve demo çalışması 2 (iki) gün süre ile HAKSAN MAKİNA teknik personeli tarafından yapılacaktır.",
    ],
  },
  {
    key: "isletme-teslim",
    label: "İşletme Teslim",
    odeme: [
      "Teklifimiz, tamamı nakit/leasing aracılığı ile ödemeye göre düzenlenmiştir,",
      "Teklifimize tezgâhın cari orandaki %{{KDV_ORANI}} K.D.V.'si dahil edilmemiştir, Leasing aracılığı ile yapılan alımlarda K.D.V oranı %1 olarak tahakkuk ettirilir,",
      "Teklifimiz İşletme Teslim şeklinde düzenlenmiş olup, tezgâhın ithalatı ile ilgili masraf ve vergiler ile alıcı firma işletmesine kadar karayolu taşıma ve sigortası fiyat teklifimize dahil edilmiştir.",
    ],
    teslimat: [
      "Tezgâhın teslimi kesin siparişten 90 (±10) gün sonra gerçekleştirilecektir,",
      "Tezgâh alıcı firmanın işletmesinde kamyon üzeri teslim edilecektir; tezgâhın kamyondan indirilmesi ile ilgili vinç/forklift organizasyonu alıcı firma tarafından karşılanacaktır,",
      "Tezgâh palet üzerinde, yol şartlarına uygun olarak ambalajlanmış vaziyette sevk edilecektir,",
    ],
    garanti: [
      "Tezgâhın güvenlik ve elektrik donanımı CE normlarına uygun olarak üretilmiştir,",
      "Tezgâhın üretim hatalarına karşı mekanik aksam garantisi 1 (bir) yıldır,",
      "Tezgâhın kontrol ünitesi 2(iki) yıl üretim hatalarına karşı FANUC/Türkiye garantisi kapsamındadır,",
      "Tezgâhın garantisi kurulumuna müteakip başlayacaktır,",
      "Tezgâhın teslimatından sonra en geç 2 (iki) gün içerisinde, HAKSAN MAKİNA teknik personeli tarafından tezgâhın kurulumu gerçekleştirilecektir,",
      "Tezgâhın ile eğitim ve demo çalışması 2 (iki) gün süre ile HAKSAN MAKİNA teknik personeli tarafından yapılacaktır.",
    ],
  },
  {
    key: "fob",
    label: "F.O.B Teslim",
    odeme: [
      "Teklifimiz tamamı nakit ödemeye göre düzenlenmiştir,",
      "Teklifimiz F.O.B teslim şeklinde düzenlenmiş olup, yükleme limanına kadar olan taşıma ve yükleme masrafları fiyatımıza dahildir; navlun, sigorta ve varış ülkesindeki gümrük vergileri fiyat teklifimize dahil edilmemiştir.",
    ],
    teslimat: [
      "Tezgâhın teslimi kesin siparişten 90 (±10) gün sonra gerçekleştirilecektir,",
      "Tezgâh yükleme limanında gemi üzerinde (F.O.B) teslim edilecektir,",
      "Tezgâh palet üzerinde, yol şartlarına uygun olarak ambalajlanmış vaziyette sevk edilecektir,",
    ],
    garanti: [
      "Tezgâhın güvenlik ve elektrik donanımı CE normlarına uygun olarak üretilmiştir,",
      "Tezgâhın üretim hatalarına karşı mekanik aksam garantisi 1 (bir) yıldır,",
      "Tezgâhın kontrol ünitesi 2(iki) yıl üretim hatalarına karşı üretici firma/Türkiye garantisi kapsamındadır,",
      "Tezgâhın garantisi kurulumuna müteakip başlayacaktır,",
    ],
  },
];

export const SERVICE_NOTE_VARIANTS: FlatNoteVariant[] = [
  {
    key: "teknik-servis",
    label: "Teknik Servis",
    notlar: [
      "Montaj Teklifimize dahil değildir. Haksan Makina Tarafından Gerçekleştirileceği takdirde, Makina Başında geçirilen her bir saat için ilave 3.000 TL + KDV Teknik Servis Hizmet Bedeli tarafınıza fatura edilecektir,",
      "Ödeme teklif onayından sonra %50 nakit/havale, kalanı teslimden en geç 30 gün sonra havale şeklindedir,",
      "Teklifimize dahil olmayan, yeni tespit edilmiş arızaların onarımı/parça değişimi müşteri onayına istinaden yapılacaktır,",
      "Fiyatlarımıza ürünlerin cari orandaki K.D.V.’leri dahil değildir,",
      "Ürünlerin teslimi kesin siparişten 7 (±3) gün sonra gerçekleştirilecektir,",
      "Sipariş için teklif onayı ve ödeme dekontunu servis@haksancnc.com.tr adresine gönderilmelidir.",
    ],
  },
  {
    key: "periyodik-bakim",
    label: "Periyodik Bakım",
    notlar: [
      "Fiyatlarımıza %20 KDV dahil değildir.",
      "Sözleşme kapsamında 1 yıl içerisinde her bir makinaya 2 (iki) defa bakım yapılacaktır.",
      "Periyodik Bakım esnasında tespit edilen arızaların onarım ve yedek parça fiyatları teklifimize dahil değildir.",
      "Bakım sürecince tezgahlarda kullanılacak yağ, bor yağı, filtre vs. sarf malzemeler fiyata dahil edilmemiştir.",
      "Ödeme şekli, %50 sözleşme esnasında nakit, kalan bakiye en geç 60 gün sonra tahsil edilecektir,",
      "Teklif onayı, kaşeli ve imzalı olarak servis@haksancnc.com.tr mail adresinden tarafımıza gönderilmesi ile servis planlaması yapılıp sözleşme hazırlanacaktır.",
    ],
  },
  {
    key: "sokum-kurulum",
    label: "Tezgah Söküm Kurulum",
    notlar: [
      "Söküm/Kurulum süresince Makina Başında geçirilen her bir saat için ilave 1.700 TL + KDV Teknik Servis Hizmet Bedeli tarafınıza fatura edilecektir,",
      "Ödeme teklif onayından sonra %50 nakit/havale, kalanı teslimden en geç 30 gün sonra havale şeklindedir,",
      "Teklifimize dahil olmayan, Tezgahların söküm/kurulumu yeni teklif hazırlanarak müşteri onayına istinaden yapılacaktır,",
      "Fiyatlarımıza %20 K.D.V. dahil değildir,",
      "Teknik Servis randevusunun oluşturulabilmesi için teklif onayı ve ödeme dekontu servis@haksancnc.com.tr adresine gönderilmelidir.",
    ],
  },
  {
    key: "egitim",
    label: "Tezgah Eğitim",
    notlar: [
      "Eğitim Haksan Makina Teknik Servis Personeli tarafından verilecektir,",
      "Ödeme teklif onayından sonra %50 nakit/havale, kalanı eğitimden en geç 30 gün sonra havale şeklindedir,",
      "Fiyatlarımıza %20 K.D.V. dahil değildir,",
      "Teklif onayınıza istinaden Eğitim randevusu oluşturularak tarafınıza bildirilecektir,",
      "Eğitim randevusu için teklif onayı ve ödeme dekontunu servis@haksancnc.com.tr adresine gönderilmelidir.",
    ],
  },
];

export const PROFORMA_NOTE_VARIANTS: FlatNoteVariant[] = [
  {
    key: "cif-istanbul",
    label: "Tezgah CİF İstanbul",
    notlar: [
      "Proforma toplam bedelinin tamamı devir sonrası ithalat öncesi peşin tahsil edilecektir,",
      "Proforma fatura C.I.F./İstanbul teslim şeklinde düzenlenmiş olup, fiyatımıza tezgâhın ithalatı ile ilgili masraf ve vergiler (Gümrük Vergisi, Liman Masrafları, Ardiye Giderleri, Gümrükleme Ücreti, İlave Gümrük Vergisi) dahil edilmemiştir. Tezgâh Antrepodan devredilecektir.",
      "Proforma Fatura bedeline tezgâhın cari orandaki %{{KDV_ORANI}} K.D.V.'si dahil edilmemiştir.",
      "Tezgâh antrepoda devir işlemleri için hazırdır, gümrük işlemleri sonrasında derhal teslim edilecektir,",
      "Tezgâh HAKSAN MAKİNA/Hadımköy antreposundan teslim edilecek olup, tezgâhın İstanbul içi karayolu taşıma ve sigortası alıcı firma tarafından karşılanacaktır,",
      "Tezgâh uluslararası CE standartlarına uygundur.",
      "Tezgâhın üretim yılı {{YIL}} olup, yeni ve kullanılmamıştır,",
      "Tezgâh ile birlikte çalışması için zorunlu olanlar dışında aksam ve aksesuar bulunmamaktadır,",
      "Tezgâh tüm üretim hatalarına karşı 1 (bir) yıl üretici firma garantisi kapsamındadır, kontrol ünitesi 2 (iki) yıl Uluslararası MITSUBISHI garantisi kapsamındadır,",
      "Tezgâh yol şartlarına uygun ambalajlanmış olarak sevk edilecektir.",
    ],
  },
  {
    key: "isletme-teslim",
    label: "İşletme Teslim",
    notlar: [
      "Proforma fatura İşletme teslim şeklinde düzenlenmiş olup, fiyatımıza tezgâhın ithalatı ile ilgili masraf ve vergiler (Gümrük Vergisi, Liman Masrafları, Ardiye Giderleri, Gümrükleme Ücreti, İlave Gümrük Vergisi) dahil edilmiştir,",
      "Proforma Fatura bedeline tezgâhın cari orandaki %{{KDV_ORANI}} K.D.V.'si dahil edilmemiştir. Leasing aracılığı ile yapılan işlemlerde K.D.V. %1 olarak tahakkuk edilmektedir,",
      "Tezgâhın teslimi kesin siparişten sonra derhal gerçekleştirilecektir,",
      "Tezgâh ödeme işlemleri sonrasında {{ALICI}} tesislerine teslim edilecek olup, tezgâhın İstanbul içi karayolu taşıması HAKSAN MAKİNA tarafından karşılanacaktır,",
      "Tezgâh uluslararası CE standartlarına uygundur.",
      "Tezgâhın üretim yılı {{YIL}} olup, yeni ve kullanılmamıştır,",
      "Tezgâh ile birlikte çalışması için zorunlu olanlar dışında aksam ve aksesuar bulunmamaktadır,",
      "Tezgâh tüm üretim hatalarına karşı 1 (bir) yıl üretici firma garantisi kapsamındadır,",
      "Kontrol ünitesi 2 (iki) yıl Uluslararası MITSUBISHI garantisi kapsamındadır,",
      "Tezgâh yol şartlarına uygun ambalajlanmış olarak sevk edilecektir.",
    ],
  },
];

/** {{ALICI}} / {{YIL}} yer tutucularını belge verisiyle doldurur. */
export const fillNotePlaceholders = (
  notlar: string[],
  ctx: { alici?: string; yil?: string | number; kdvOrani?: string | number }
): string[] =>
  notlar.map((n) =>
    n
      .replace(/\{\{ALICI\}\}/g, ctx.alici?.trim() || "alıcı firma")
      .replace(/\{\{YIL\}\}/g, String(ctx.yil ?? new Date().getFullYear()))
      .replace(/\{\{KDV_ORANI\}\}/g, String(ctx.kdvOrani ?? 20))
  );

/**
 * Daha önce kaydedilmiş şart metinlerindeki sabit %10/%20 KDV ifadesini,
 * belgedeki ana ürünün seçili KDV oranına uyarlar. Leasing için geçen %1'e ve
 * millileştirme/gümrük hesabına dokunmaz.
 */
export const applyVatRateToNotes = (notlar: string[], kdvOrani?: string | number): string[] => {
  const rate = Number(kdvOrani);
  if (!Number.isFinite(rate) || rate <= 0) return notlar;
  return fillNotePlaceholders(notlar, { kdvOrani: rate }).map((note) =>
    note.replace(/%(?:10|20)(?=\s*K\.?\s*D\.?\s*V\.?)/giu, `%${rate}`)
  );
};

/** Teklif teslim şekli şablonlarını proforma seçeneklerinde ayırt etmek için ön ek. */
export const QUOTE_VARIANT_PREFIX = "teklif:";

const normalizeBlock = (s: string): string =>
  s
    .replace(/\{\{KDV_ORANI\}\}/g, "{{KDV_ORANI}}")
    .replace(/%(?:10|20)(?=\s*K\.?\s*D\.?\s*V\.?)/giu, "%{{KDV_ORANI}}")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();

/**
 * Kayıtlı ödeme/teslimat/garanti metinlerini QUOTE_NOTE_VARIANTS ile karşılaştırıp
 * birebir eşleşen teslim şekli şablonunun anahtarını döndürür (yoksa "").
 * Hem teklif formunda ön seçim, hem proformada otomatik tespit için kullanılır.
 */
export function matchQuoteNoteVariantKey(payment: string, delivery: string, warranty: string): string {
  const p = normalizeBlock(payment);
  const d = normalizeBlock(delivery);
  const w = normalizeBlock(warranty);
  if (!p && !d && !w) return "";
  return (
    QUOTE_NOTE_VARIANTS.find(
      (v) =>
        normalizeBlock(v.odeme.join("\n")) === p &&
        normalizeBlock(v.teslimat.join("\n")) === d &&
        normalizeBlock(v.garanti.join("\n")) === w
    )?.key ?? ""
  );
}

/** Proforma yazdırma menüsü: mevcut 2 düz proforma şablonu + teklifteki 3 teslim şekli. */
export const PROFORMA_NOTE_OPTIONS: { key: string; label: string; group: "proforma" | "teslim" }[] = [
  ...PROFORMA_NOTE_VARIANTS.map((v) => ({ key: v.key, label: v.label, group: "proforma" as const })),
  ...QUOTE_NOTE_VARIANTS.map((v) => ({ key: `${QUOTE_VARIANT_PREFIX}${v.key}`, label: v.label, group: "teslim" as const })),
];

/**
 * Bir proforma not anahtarını ({@link PROFORMA_NOTE_OPTIONS}) düz not satırlarına çözer.
 * `teklif:` ön ekli anahtarlar teklif teslim şeklinin ödeme+teslimat+garanti maddelerini
 * tek listede birleştirir; diğerleri düz proforma şablonudur. Eşleşme yoksa null.
 */
export function resolveProformaNotes(
  variantKey: string | undefined,
  ctx: { alici?: string; yil?: string | number; kdvOrani?: string | number }
): string[] | null {
  if (!variantKey) return null;
  if (variantKey.startsWith(QUOTE_VARIANT_PREFIX)) {
    const v = QUOTE_NOTE_VARIANTS.find((x) => x.key === variantKey.slice(QUOTE_VARIANT_PREFIX.length));
    if (!v) return null;
    return fillNotePlaceholders([...v.odeme, ...v.teslimat, ...v.garanti], ctx);
  }
  const v = PROFORMA_NOTE_VARIANTS.find((x) => x.key === variantKey);
  if (!v) return null;
  return fillNotePlaceholders(v.notlar, ctx);
}
