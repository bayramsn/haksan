/** Firma formu combobox seçenekleri — frontend dropdown'lar ve doğrulama için. */

export const COMPANY_SECTOR_OPTIONS = [
  'Otomotiv Yan Sanayi',
  'Kalıp ve Model',
  'Havacılık ve Savunma',
  'Mobilya',
  'Beyaz Eşya',
  'Enerji',
  'Medikal',
  'Eğitim',
  'Makine İmalat',
  'Metal İşleme',
  'Plastik Enjeksiyon',
  'Denizcilik',
  'İnşaat / Yapı',
  'Gıda',
  'Tekstil',
  'Sac İşleme',
  'CNC Atölye',
  'Diğer',
] as const;

export const COUNTRY_OPTIONS = [
  'Türkiye',
  'Almanya',
  'İtalya',
  'Çin',
  'Tayvan',
  'Japonya',
  'Güney Kore',
  'ABD',
  'İngiltere',
  'Fransa',
  'Hollanda',
  'İspanya',
  'Avusturya',
  'İsviçre',
  'Polonya',
  'Romanya',
  'Bulgaristan',
  'Yunanistan',
  'Azerbaycan',
  'Diğer',
] as const;

/** İl → ilçe listesi (başlıca sanayi illeri; diğerleri combobox ile serbest giriş). */
export const DISTRICTS_BY_PROVINCE: Record<string, readonly string[]> = {
  İstanbul: [
    'Adalar', 'Arnavutköy', 'Ataşehir', 'Avcılar', 'Bağcılar', 'Bahçelievler', 'Bakırköy', 'Başakşehir',
    'Bayrampaşa', 'Beşiktaş', 'Beykoz', 'Beylikdüzü', 'Beyoğlu', 'Büyükçekmece', 'Çatalca', 'Çekmeköy',
    'Esenler', 'Esenyurt', 'Eyüpsultan', 'Fatih', 'Gaziosmanpaşa', 'Güngören', 'Kadıköy', 'Kağıthane',
    'Kartal', 'Küçükçekmece', 'Maltepe', 'Pendik', 'Sancaktepe', 'Sarıyer', 'Silivri', 'Sultanbeyli',
    'Sultangazi', 'Şile', 'Şişli', 'Tuzla', 'Ümraniye', 'Üsküdar', 'Zeytinburnu',
  ],
  Ankara: [
    'Akyurt', 'Altındağ', 'Ayaş', 'Bala', 'Beypazarı', 'Çamlıdere', 'Çankaya', 'Çubuk', 'Elmadağ',
    'Etimesgut', 'Evren', 'Gölbaşı', 'Güdül', 'Haymana', 'Kahramankazan', 'Kalecik', 'Keçiören',
    'Kızılcahamam', 'Mamak', 'Nallıhan', 'Polatlı', 'Pursaklar', 'Sincan', 'Şereflikoçhisar', 'Yenimahalle',
  ],
  İzmir: [
    'Aliağa', 'Balçova', 'Bayındır', 'Bayraklı', 'Bergama', 'Beydağ', 'Bornova', 'Buca', 'Çeşme',
    'Çiğli', 'Dikili', 'Foça', 'Gaziemir', 'Güzelbahçe', 'Karabağlar', 'Karaburun', 'Karşıyaka',
    'Kemalpaşa', 'Kınık', 'Kiraz', 'Konak', 'Menderes', 'Menemen', 'Narlıdere', 'Ödemiş', 'Seferihisar',
    'Selçuk', 'Tire', 'Torbalı', 'Urla',
  ],
  Bursa: [
    'Büyükorhan', 'Gemlik', 'Gürsu', 'Harmancık', 'İnegöl', 'İznik', 'Karacabey', 'Keles', 'Kestel',
    'Mudanya', 'Mustafakemalpaşa', 'Nilüfer', 'Orhaneli', 'Orhangazi', 'Osmangazi', 'Yenişehir', 'Yıldırım',
  ],
  Kocaeli: [
    'Başiskele', 'Çayırova', 'Darıca', 'Derince', 'Dilovası', 'Gebze', 'Gölcük', 'İzmit', 'Kandıra',
    'Karamürsel', 'Kartepe', 'Körfez',
  ],
  Gaziantep: [
    'Araban', 'İslahiye', 'Karkamış', 'Nizip', 'Nurdağı', 'Oğuzeli', 'Şahinbey', 'Şehitkamil', 'Yavuzeli',
  ],
  Kayseri: [
    'Akkışla', 'Bünyan', 'Develi', 'Felahiye', 'Hacılar', 'İncesu', 'Kocasinan', 'Melikgazi', 'Özvatan',
    'Pınarbaşı', 'Sarıoğlan', 'Sarız', 'Talas', 'Tomarza', 'Yahyalı', 'Yeşilhisar',
  ],
  Adana: ['Çukurova', 'Sarıçam', 'Seyhan', 'Yüreğir', 'Ceyhan', 'Kozan', 'İmamoğlu'],
  Konya: ['Karatay', 'Meram', 'Selçuklu', 'Ereğli', 'Akşehir'],
  Antalya: ['Kepez', 'Muratpaşa', 'Konyaaltı', 'Alanya', 'Manavgat', 'Serik'],
  Manisa: ['Yunusemre', 'Şehzadeler', 'Akhisar', 'Salihli', 'Turgutlu'],
  Denizli: ['Merkezefendi', 'Pamukkale', 'Çivril', 'Honaz'],
  Eskişehir: ['Odunpazarı', 'Tepebaşı'],
  Sakarya: ['Adapazarı', 'Serdivan', 'Erenler', 'Arifiye', 'Hendek'],
  Tekirdağ: ['Çorlu', 'Çerkezköy', 'Kapaklı', 'Süleymanpaşa'],
  Mersin: ['Akdeniz', 'Mezitli', 'Toroslar', 'Yenişehir', 'Tarsus'],
};

export const TAX_OFFICE_OPTIONS = [
  'İstanbul - Boğaziçi',
  'İstanbul - Büyük Mükellefler',
  'İstanbul - Kadıköy',
  'İstanbul - Mecidiyeköy',
  'İstanbul - Ümraniye',
  'İstanbul - Beyoğlu',
  'İstanbul - Bakırköy',
  'İstanbul - Pendik',
  'Ankara - Çankaya',
  'Ankara - Veraset ve Harçlar',
  'Ankara - Ulus',
  'Bursa - Osmangazi',
  'Bursa - Nilüfer',
  'İzmir - Konak',
  'İzmir - Bornova',
  'Kocaeli - İzmit',
  'Gaziantep - Şahinbey',
  'Kayseri - Melikgazi',
  'Adana - Seyhan',
  'Konya - Selçuklu',
  'Antalya - Muratpaşa',
  'Manisa - Yunusemre',
  'Denizli - Pamukkale',
  'Eskişehir - Tepebaşı',
  'Sakarya - Adapazarı',
  'Tekirdağ - Çorlu',
  'Mersin - Akdeniz',
  'Diğer',
] as const;

export const ACTIVITY_TYPE_OPTIONS = [
  { code: 'call', label: 'Telefon' },
  { code: 'visit', label: 'Ziyaret' },
  { code: 'email', label: 'E-posta / Mail' },
  { code: 'meeting', label: 'Toplantı' },
  { code: 'demo', label: 'Demo / Sunum' },
  { code: 'note', label: 'Not' },
] as const;

export type ActivityTypeCode = (typeof ACTIVITY_TYPE_OPTIONS)[number]['code'];

export const activityTypeLabel = (code: string) =>
  ACTIVITY_TYPE_OPTIONS.find((o) => o.code === code)?.label ?? code;

export const activityTypeCodeFromLabel = (label: string): ActivityTypeCode | undefined => {
  const exact = ACTIVITY_TYPE_OPTIONS.find((o) => o.label === label);
  if (exact) return exact.code;
  const legacy: Record<string, ActivityTypeCode> = {
    Çağrı: 'call',
    'E-posta': 'email',
    Toplantı: 'meeting',
    Ziyaret: 'visit',
    Not: 'note',
  };
  return legacy[label];
};

/** Stok / ürün kategorileri — tezgah yalnızca satış, yedek parça ve aksesuar satış + servis. */
export const STOCK_CATEGORY_CODES = ['TEZGAH', 'AKSESUAR', 'YEDEK_PARCA'] as const;
export type StockCategoryCode = (typeof STOCK_CATEGORY_CODES)[number];

export const STOCK_CATEGORY_LABELS: Record<StockCategoryCode, string> = {
  TEZGAH: 'Tezgahlar',
  AKSESUAR: 'Aksesuar',
  YEDEK_PARCA: 'Yedek Parça',
};

export const STOCK_CATEGORY_USAGE: Record<StockCategoryCode, { sales: boolean; service: boolean }> = {
  TEZGAH: { sales: true, service: false },
  AKSESUAR: { sales: true, service: true },
  YEDEK_PARCA: { sales: true, service: true },
};

export const stockCategoryForContext = (
  categoryCode: StockCategoryCode | string | undefined,
  context: 'sales' | 'service',
): boolean => {
  const usage = STOCK_CATEGORY_USAGE[(categoryCode as StockCategoryCode) ?? 'TEZGAH'];
  return context === 'sales' ? usage.sales : usage.service;
};
