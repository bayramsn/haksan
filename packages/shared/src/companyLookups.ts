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
  'Yerel Kargo',
  'Nakliye / Lojistik',
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

/**
 * İl → ilçe listesi — Türkiye'nin 81 ili ve 973 ilçesinin tamamı (resmî idari
 * bölünüş). Büyükşehir illerinde "Merkez" ilçe yoktur; onun yerine merkez
 * ilçeler (ör. Şahinbey / Şehitkamil) listelenir.
 *
 * Combobox aramasında kullanılır; listede olmayan bir değer yine serbest metin
 * olarak yazılabilir.
 */
export const DISTRICTS_BY_PROVINCE: Record<string, readonly string[]> = {
  Adana: [
    'Aladağ', 'Ceyhan', 'Çukurova', 'Feke', 'İmamoğlu', 'Karaisalı', 'Karataş', 'Kozan', 'Pozantı',
    'Saimbeyli', 'Sarıçam', 'Seyhan', 'Tufanbeyli', 'Yumurtalık', 'Yüreğir',
  ],
  Adıyaman: [
    'Merkez', 'Besni', 'Çelikhan', 'Gerger', 'Gölbaşı', 'Kâhta', 'Samsat', 'Sincik', 'Tut',
  ],
  Afyonkarahisar: [
    'Merkez', 'Başmakçı', 'Bayat', 'Bolvadin', 'Çay', 'Çobanlar', 'Dazkırı', 'Dinar', 'Emirdağ',
    'Evciler', 'Hocalar', 'İhsaniye', 'İscehisar', 'Kızılören', 'Sandıklı', 'Sinanpaşa', 'Sultandağı',
    'Şuhut',
  ],
  Ağrı: [
    'Merkez', 'Diyadin', 'Doğubayazıt', 'Eleşkirt', 'Hamur', 'Patnos', 'Taşlıçay', 'Tutak',
  ],
  Aksaray: [
    'Merkez', 'Ağaçören', 'Eskil', 'Gülağaç', 'Güzelyurt', 'Ortaköy', 'Sarıyahşi', 'Sultanhanı',
  ],
  Amasya: [
    'Merkez', 'Göynücek', 'Gümüşhacıköy', 'Hamamözü', 'Merzifon', 'Suluova', 'Taşova',
  ],
  Ankara: [
    'Akyurt', 'Altındağ', 'Ayaş', 'Bala', 'Beypazarı', 'Çamlıdere', 'Çankaya', 'Çubuk', 'Elmadağ',
    'Etimesgut', 'Evren', 'Gölbaşı', 'Güdül', 'Haymana', 'Kahramankazan', 'Kalecik', 'Keçiören',
    'Kızılcahamam', 'Mamak', 'Nallıhan', 'Polatlı', 'Pursaklar', 'Sincan', 'Şereflikoçhisar', 'Yenimahalle',
  ],
  Antalya: [
    'Akseki', 'Aksu', 'Alanya', 'Demre', 'Döşemealtı', 'Elmalı', 'Finike', 'Gazipaşa', 'Gündoğmuş',
    'İbradı', 'Kaş', 'Kemer', 'Kepez', 'Konyaaltı', 'Korkuteli', 'Kumluca', 'Manavgat', 'Muratpaşa',
    'Serik',
  ],
  Ardahan: [
    'Merkez', 'Çıldır', 'Damal', 'Göle', 'Hanak', 'Posof',
  ],
  Artvin: [
    'Merkez', 'Ardanuç', 'Arhavi', 'Borçka', 'Hopa', 'Kemalpaşa', 'Murgul', 'Şavşat', 'Yusufeli',
  ],
  Aydın: [
    'Efeler', 'Bozdoğan', 'Buharkent', 'Çine', 'Didim', 'Germencik', 'İncirliova', 'Karacasu',
    'Karpuzlu', 'Koçarlı', 'Köşk', 'Kuşadası', 'Kuyucak', 'Nazilli', 'Söke', 'Sultanhisar', 'Yenipazar',
  ],
  Balıkesir: [
    'Altıeylül', 'Ayvalık', 'Balya', 'Bandırma', 'Bigadiç', 'Burhaniye', 'Dursunbey', 'Edremit',
    'Erdek', 'Gömeç', 'Gönen', 'Havran', 'İvrindi', 'Karesi', 'Kepsut', 'Manyas', 'Marmara',
    'Savaştepe', 'Sındırgı', 'Susurluk',
  ],
  Bartın: [
    'Merkez', 'Amasra', 'Kurucaşile', 'Ulus',
  ],
  Batman: [
    'Merkez', 'Beşiri', 'Gercüş', 'Hasankeyf', 'Kozluk', 'Sason',
  ],
  Bayburt: [
    'Merkez', 'Aydıntepe', 'Demirözü',
  ],
  Bilecik: [
    'Merkez', 'Bozüyük', 'Gölpazarı', 'İnhisar', 'Osmaneli', 'Pazaryeri', 'Söğüt', 'Yenipazar',
  ],
  Bingöl: [
    'Merkez', 'Adaklı', 'Genç', 'Karlıova', 'Kiğı', 'Solhan', 'Yayladere', 'Yedisu',
  ],
  Bitlis: [
    'Merkez', 'Adilcevaz', 'Ahlat', 'Güroymak', 'Hizan', 'Mutki', 'Tatvan',
  ],
  Bolu: [
    'Merkez', 'Dörtdivan', 'Gerede', 'Göynük', 'Kıbrıscık', 'Mengen', 'Mudurnu', 'Seben', 'Yeniçağa',
  ],
  Burdur: [
    'Merkez', 'Ağlasun', 'Altınyayla', 'Bucak', 'Çavdır', 'Çeltikçi', 'Gölhisar', 'Karamanlı', 'Kemer',
    'Tefenni', 'Yeşilova',
  ],
  Bursa: [
    'Büyükorhan', 'Gemlik', 'Gürsu', 'Harmancık', 'İnegöl', 'İznik', 'Karacabey', 'Keles', 'Kestel',
    'Mudanya', 'Mustafakemalpaşa', 'Nilüfer', 'Orhaneli', 'Orhangazi', 'Osmangazi', 'Yenişehir', 'Yıldırım',
  ],
  Çanakkale: [
    'Merkez', 'Ayvacık', 'Bayramiç', 'Biga', 'Bozcaada', 'Çan', 'Eceabat', 'Ezine', 'Gelibolu',
    'Gökçeada', 'Lapseki', 'Yenice',
  ],
  Çankırı: [
    'Merkez', 'Atkaracalar', 'Bayramören', 'Çerkeş', 'Eldivan', 'Ilgaz', 'Kızılırmak', 'Korgun',
    'Kurşunlu', 'Orta', 'Şabanözü', 'Yapraklı',
  ],
  Çorum: [
    'Merkez', 'Alaca', 'Bayat', 'Boğazkale', 'Dodurga', 'İskilip', 'Kargı', 'Laçin', 'Mecitözü',
    'Oğuzlar', 'Ortaköy', 'Osmancık', 'Sungurlu', 'Uğurludağ',
  ],
  Denizli: [
    'Merkezefendi', 'Pamukkale', 'Acıpayam', 'Babadağ', 'Baklan', 'Bekilli', 'Beyağaç', 'Bozkurt',
    'Buldan', 'Çal', 'Çameli', 'Çardak', 'Çivril', 'Güney', 'Honaz', 'Kale', 'Sarayköy', 'Serinhisar',
    'Tavas',
  ],
  Diyarbakır: [
    'Bağlar', 'Bismil', 'Çermik', 'Çınar', 'Çüngüş', 'Dicle', 'Eğil', 'Ergani', 'Hani', 'Hazro',
    'Kayapınar', 'Kocaköy', 'Kulp', 'Lice', 'Silvan', 'Sur', 'Yenişehir',
  ],
  Düzce: [
    'Merkez', 'Akçakoca', 'Cumayeri', 'Çilimli', 'Gölyaka', 'Gümüşova', 'Kaynaşlı', 'Yığılca',
  ],
  Edirne: [
    'Merkez', 'Enez', 'Havsa', 'İpsala', 'Keşan', 'Lalapaşa', 'Meriç', 'Süloğlu', 'Uzunköprü',
  ],
  Elazığ: [
    'Merkez', 'Ağın', 'Alacakaya', 'Arıcak', 'Baskil', 'Karakoçan', 'Keban', 'Kovancılar', 'Maden',
    'Palu', 'Sivrice',
  ],
  Erzincan: [
    'Merkez', 'Çayırlı', 'İliç', 'Kemah', 'Kemaliye', 'Otlukbeli', 'Refahiye', 'Tercan', 'Üzümlü',
  ],
  Erzurum: [
    'Aziziye', 'Palandöken', 'Yakutiye', 'Aşkale', 'Çat', 'Hınıs', 'Horasan', 'İspir', 'Karaçoban',
    'Karayazı', 'Köprüköy', 'Narman', 'Oltu', 'Olur', 'Pasinler', 'Pazaryolu', 'Şenkaya', 'Tekman',
    'Tortum', 'Uzundere',
  ],
  Eskişehir: [
    'Odunpazarı', 'Tepebaşı', 'Alpu', 'Beylikova', 'Çifteler', 'Günyüzü', 'Han', 'İnönü', 'Mahmudiye',
    'Mihalgazi', 'Mihalıççık', 'Sarıcakaya', 'Seyitgazi', 'Sivrihisar',
  ],
  Gaziantep: [
    'Şahinbey', 'Şehitkamil', 'Araban', 'İslahiye', 'Karkamış', 'Nizip', 'Nurdağı', 'Oğuzeli', 'Yavuzeli',
  ],
  Giresun: [
    'Merkez', 'Alucra', 'Bulancak', 'Çamoluk', 'Çanakçı', 'Dereli', 'Doğankent', 'Espiye', 'Eynesil',
    'Görele', 'Güce', 'Keşap', 'Piraziz', 'Şebinkarahisar', 'Tirebolu', 'Yağlıdere',
  ],
  Gümüşhane: [
    'Merkez', 'Kelkit', 'Köse', 'Kürtün', 'Şiran', 'Torul',
  ],
  Hakkari: [
    'Merkez', 'Çukurca', 'Derecik', 'Şemdinli', 'Yüksekova',
  ],
  Hatay: [
    'Antakya', 'Defne', 'Altınözü', 'Arsuz', 'Belen', 'Dörtyol', 'Erzin', 'Hassa', 'İskenderun',
    'Kırıkhan', 'Kumlu', 'Payas', 'Reyhanlı', 'Samandağ', 'Yayladağı',
  ],
  Iğdır: [
    'Merkez', 'Aralık', 'Karakoyunlu', 'Tuzluca',
  ],
  Isparta: [
    'Merkez', 'Aksu', 'Atabey', 'Eğirdir', 'Gelendost', 'Gönen', 'Keçiborlu', 'Senirkent', 'Sütçüler',
    'Şarkikaraağaç', 'Uluborlu', 'Yalvaç', 'Yenişarbademli',
  ],
  İstanbul: [
    'Adalar', 'Arnavutköy', 'Ataşehir', 'Avcılar', 'Bağcılar', 'Bahçelievler', 'Bakırköy', 'Başakşehir',
    'Bayrampaşa', 'Beşiktaş', 'Beykoz', 'Beylikdüzü', 'Beyoğlu', 'Büyükçekmece', 'Çatalca', 'Çekmeköy',
    'Esenler', 'Esenyurt', 'Eyüpsultan', 'Fatih', 'Gaziosmanpaşa', 'Güngören', 'Kadıköy', 'Kağıthane',
    'Kartal', 'Küçükçekmece', 'Maltepe', 'Pendik', 'Sancaktepe', 'Sarıyer', 'Silivri', 'Sultanbeyli',
    'Sultangazi', 'Şile', 'Şişli', 'Tuzla', 'Ümraniye', 'Üsküdar', 'Zeytinburnu',
  ],
  İzmir: [
    'Aliağa', 'Balçova', 'Bayındır', 'Bayraklı', 'Bergama', 'Beydağ', 'Bornova', 'Buca', 'Çeşme',
    'Çiğli', 'Dikili', 'Foça', 'Gaziemir', 'Güzelbahçe', 'Karabağlar', 'Karaburun', 'Karşıyaka',
    'Kemalpaşa', 'Kınık', 'Kiraz', 'Konak', 'Menderes', 'Menemen', 'Narlıdere', 'Ödemiş', 'Seferihisar',
    'Selçuk', 'Tire', 'Torbalı', 'Urla',
  ],
  Kahramanmaraş: [
    'Dulkadiroğlu', 'Onikişubat', 'Afşin', 'Andırın', 'Çağlayancerit', 'Ekinözü', 'Elbistan', 'Göksun',
    'Nurhak', 'Pazarcık', 'Türkoğlu',
  ],
  Karabük: [
    'Merkez', 'Eflani', 'Eskipazar', 'Ovacık', 'Safranbolu', 'Yenice',
  ],
  Karaman: [
    'Merkez', 'Ayrancı', 'Başyayla', 'Ermenek', 'Kazımkarabekir', 'Sarıveliler',
  ],
  Kars: [
    'Merkez', 'Akyaka', 'Arpaçay', 'Digor', 'Kağızman', 'Sarıkamış', 'Selim', 'Susuz',
  ],
  Kastamonu: [
    'Merkez', 'Abana', 'Ağlı', 'Araç', 'Azdavay', 'Bozkurt', 'Cide', 'Çatalzeytin', 'Daday',
    'Devrekani', 'Doğanyurt', 'Hanönü', 'İhsangazi', 'İnebolu', 'Küre', 'Pınarbaşı', 'Seydiler',
    'Şenpazar', 'Taşköprü', 'Tosya',
  ],
  Kayseri: [
    'Kocasinan', 'Melikgazi', 'Talas', 'Akkışla', 'Bünyan', 'Develi', 'Felahiye', 'Hacılar', 'İncesu',
    'Özvatan', 'Pınarbaşı', 'Sarıoğlan', 'Sarız', 'Tomarza', 'Yahyalı', 'Yeşilhisar',
  ],
  Kırıkkale: [
    'Merkez', 'Bahşılı', 'Balışeyh', 'Çelebi', 'Delice', 'Karakeçili', 'Keskin', 'Sulakyurt', 'Yahşihan',
  ],
  Kırklareli: [
    'Merkez', 'Babaeski', 'Demirköy', 'Kofçaz', 'Lüleburgaz', 'Pehlivanköy', 'Pınarhisar', 'Vize',
  ],
  Kırşehir: [
    'Merkez', 'Akçakent', 'Akpınar', 'Boztepe', 'Çiçekdağı', 'Kaman', 'Mucur',
  ],
  Kilis: [
    'Merkez', 'Elbeyli', 'Musabeyli', 'Polateli',
  ],
  Kocaeli: [
    'İzmit', 'Başiskele', 'Çayırova', 'Darıca', 'Derince', 'Dilovası', 'Gebze', 'Gölcük', 'Kandıra',
    'Karamürsel', 'Kartepe', 'Körfez',
  ],
  Konya: [
    'Karatay', 'Meram', 'Selçuklu', 'Ahırlı', 'Akören', 'Akşehir', 'Altınekin', 'Beyşehir', 'Bozkır',
    'Cihanbeyli', 'Çeltik', 'Çumra', 'Derbent', 'Derebucak', 'Doğanhisar', 'Emirgazi', 'Ereğli',
    'Güneysınır', 'Hadim', 'Halkapınar', 'Hüyük', 'Ilgın', 'Kadınhanı', 'Karapınar', 'Kulu', 'Sarayönü',
    'Seydişehir', 'Taşkent', 'Tuzlukçu', 'Yalıhüyük', 'Yunak',
  ],
  Kütahya: [
    'Merkez', 'Altıntaş', 'Aslanapa', 'Çavdarhisar', 'Domaniç', 'Dumlupınar', 'Emet', 'Gediz',
    'Hisarcık', 'Pazarlar', 'Simav', 'Şaphane', 'Tavşanlı',
  ],
  Malatya: [
    'Battalgazi', 'Yeşilyurt', 'Akçadağ', 'Arapgir', 'Arguvan', 'Darende', 'Doğanşehir', 'Doğanyol',
    'Hekimhan', 'Kale', 'Kuluncak', 'Pütürge', 'Yazıhan',
  ],
  Manisa: [
    'Şehzadeler', 'Yunusemre', 'Ahmetli', 'Akhisar', 'Alaşehir', 'Demirci', 'Gölmarmara', 'Gördes',
    'Kırkağaç', 'Köprübaşı', 'Kula', 'Salihli', 'Sarıgöl', 'Saruhanlı', 'Selendi', 'Soma', 'Turgutlu',
  ],
  Mardin: [
    'Artuklu', 'Dargeçit', 'Derik', 'Kızıltepe', 'Mazıdağı', 'Midyat', 'Nusaybin', 'Ömerli', 'Savur',
    'Yeşilli',
  ],
  Mersin: [
    'Akdeniz', 'Mezitli', 'Toroslar', 'Yenişehir', 'Anamur', 'Aydıncık', 'Bozyazı', 'Çamlıyayla',
    'Erdemli', 'Gülnar', 'Mut', 'Silifke', 'Tarsus',
  ],
  Muğla: [
    'Menteşe', 'Bodrum', 'Dalaman', 'Datça', 'Fethiye', 'Kavaklıdere', 'Köyceğiz', 'Marmaris', 'Milas',
    'Ortaca', 'Seydikemer', 'Ula', 'Yatağan',
  ],
  Muş: [
    'Merkez', 'Bulanık', 'Hasköy', 'Korkut', 'Malazgirt', 'Varto',
  ],
  Nevşehir: [
    'Merkez', 'Acıgöl', 'Avanos', 'Derinkuyu', 'Gülşehir', 'Hacıbektaş', 'Kozaklı', 'Ürgüp',
  ],
  Niğde: [
    'Merkez', 'Altunhisar', 'Bor', 'Çamardı', 'Çiftlik', 'Ulukışla',
  ],
  Ordu: [
    'Altınordu', 'Akkuş', 'Aybastı', 'Çamaş', 'Çatalpınar', 'Çaybaşı', 'Fatsa', 'Gölköy', 'Gülyalı',
    'Gürgentepe', 'İkizce', 'Kabadüz', 'Kabataş', 'Korgan', 'Kumru', 'Mesudiye', 'Perşembe', 'Ulubey',
    'Ünye',
  ],
  Osmaniye: [
    'Merkez', 'Bahçe', 'Düziçi', 'Hasanbeyli', 'Kadirli', 'Sumbas', 'Toprakkale',
  ],
  Rize: [
    'Merkez', 'Ardeşen', 'Çamlıhemşin', 'Çayeli', 'Derepazarı', 'Fındıklı', 'Güneysu', 'Hemşin',
    'İkizdere', 'İyidere', 'Kalkandere', 'Pazar',
  ],
  Sakarya: [
    'Adapazarı', 'Erenler', 'Serdivan', 'Akyazı', 'Arifiye', 'Ferizli', 'Geyve', 'Hendek',
    'Karapürçek', 'Karasu', 'Kaynarca', 'Kocaali', 'Pamukova', 'Sapanca', 'Söğütlü', 'Taraklı',
  ],
  Samsun: [
    'Atakum', 'Canik', 'İlkadım', 'Alaçam', 'Asarcık', 'Ayvacık', 'Bafra', 'Çarşamba', 'Havza',
    'Kavak', 'Ladik', 'Ondokuzmayıs', 'Salıpazarı', 'Tekkeköy', 'Terme', 'Vezirköprü', 'Yakakent',
  ],
  Siirt: [
    'Merkez', 'Baykan', 'Eruh', 'Kurtalan', 'Pervari', 'Şirvan', 'Tillo',
  ],
  Sinop: [
    'Merkez', 'Ayancık', 'Boyabat', 'Dikmen', 'Durağan', 'Erfelek', 'Gerze', 'Saraydüzü', 'Türkeli',
  ],
  Sivas: [
    'Merkez', 'Akıncılar', 'Altınyayla', 'Divriği', 'Doğanşar', 'Gemerek', 'Gölova', 'Gürün', 'Hafik',
    'İmranlı', 'Kangal', 'Koyulhisar', 'Suşehri', 'Şarkışla', 'Ulaş', 'Yıldızeli', 'Zara',
  ],
  Şanlıurfa: [
    'Eyyübiye', 'Haliliye', 'Karaköprü', 'Akçakale', 'Birecik', 'Bozova', 'Ceylanpınar', 'Halfeti',
    'Harran', 'Hilvan', 'Siverek', 'Suruç', 'Viranşehir',
  ],
  Şırnak: [
    'Merkez', 'Beytüşşebap', 'Cizre', 'Güçlükonak', 'İdil', 'Silopi', 'Uludere',
  ],
  Tekirdağ: [
    'Süleymanpaşa', 'Çerkezköy', 'Çorlu', 'Ergene', 'Hayrabolu', 'Kapaklı', 'Malkara',
    'Marmaraereğlisi', 'Muratlı', 'Saray', 'Şarköy',
  ],
  Tokat: [
    'Merkez', 'Almus', 'Artova', 'Başçiftlik', 'Erbaa', 'Niksar', 'Pazar', 'Reşadiye', 'Sulusaray',
    'Turhal', 'Yeşilyurt', 'Zile',
  ],
  Trabzon: [
    'Ortahisar', 'Akçaabat', 'Araklı', 'Arsin', 'Beşikdüzü', 'Çarşıbaşı', 'Çaykara', 'Dernekpazarı',
    'Düzköy', 'Hayrat', 'Köprübaşı', 'Maçka', 'Of', 'Sürmene', 'Şalpazarı', 'Tonya', 'Vakfıkebir',
    'Yomra',
  ],
  Tunceli: [
    'Merkez', 'Çemişgezek', 'Hozat', 'Mazgirt', 'Nazımiye', 'Ovacık', 'Pertek', 'Pülümür',
  ],
  Uşak: [
    'Merkez', 'Banaz', 'Eşme', 'Karahallı', 'Sivaslı', 'Ulubey',
  ],
  Van: [
    'İpekyolu', 'Tuşba', 'Edremit', 'Bahçesaray', 'Başkale', 'Çaldıran', 'Çatak', 'Erciş', 'Gevaş',
    'Gürpınar', 'Muradiye', 'Özalp', 'Saray',
  ],
  Yalova: [
    'Merkez', 'Altınova', 'Armutlu', 'Çınarcık', 'Çiftlikköy', 'Termal',
  ],
  Yozgat: [
    'Merkez', 'Akdağmadeni', 'Aydıncık', 'Boğazlıyan', 'Çandır', 'Çayıralan', 'Çekerek', 'Kadışehri',
    'Saraykent', 'Sarıkaya', 'Sorgun', 'Şefaatli', 'Yenifakılı', 'Yerköy',
  ],
  Zonguldak: [
    'Merkez', 'Alaplı', 'Çaycuma', 'Devrek', 'Ereğli', 'Gökçebey', 'Kilimli', 'Kozlu',
  ],
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
  { code: 'incoming_call', label: 'Gelen Arama' },
  { code: 'outgoing_call', label: 'Giden Arama' },
  { code: 'customer_visit', label: 'Müşteri Ziyareti' },
  { code: 'online_meeting', label: 'Çevrimiçi Toplantı' },
  { code: 'showroom_meeting', label: 'Showroom Toplantısı' },
  { code: 'email', label: 'E-posta / Mail' },
  { code: 'whatsapp', label: 'WhatsApp' },
  { code: 'note', label: 'Yorum' },
] as const;

export type ActivityTypeCode = (typeof ACTIVITY_TYPE_OPTIONS)[number]['code'];

export const activityTypeLabel = (code: string) =>
  ACTIVITY_TYPE_OPTIONS.find((o) => o.code === code)?.label ?? code;

export const activityTypeCodeFromLabel = (label: string): ActivityTypeCode | undefined => {
  const exact = ACTIVITY_TYPE_OPTIONS.find((o) => o.label === label);
  if (exact) return exact.code;
  const legacy: Record<string, ActivityTypeCode> = {
    Çağrı: 'outgoing_call',
    Telefon: 'outgoing_call',
    'Telefon Görüşmesi': 'outgoing_call',
    'E-posta': 'email',
    Toplantı: 'showroom_meeting',
    Ziyaret: 'customer_visit',
    'Demo / Sunum': 'customer_visit',
    Not: 'note',
  };
  return legacy[label];
};

/** Stok / ürün kategorileri — seri no ile stok/sevkiyat takibi yapılan ana ürün sınıfları. */
export const STOCK_CATEGORY_CODES = ['TEZGAH', 'OPSIYONEL_DONANIM', 'YEDEK_PARCA', 'AKSESUAR', 'EVRAK', 'IDARI_MALZEME'] as const;
export type StockCategoryCode = (typeof STOCK_CATEGORY_CODES)[number];

export const STOCK_CATEGORY_LABELS: Record<StockCategoryCode, string> = {
  TEZGAH: 'Tezgahlar',
  OPSIYONEL_DONANIM: 'Opsiyonel Donanım',
  YEDEK_PARCA: 'Yedek Parça',
  AKSESUAR: 'Aksesuar',
  EVRAK: 'Evrak',
  IDARI_MALZEME: 'İdari Malzeme',
};

/** Stok kalemi kondisyonu — demo makineler satış/servis akışında ayrı izlenir. */
export const STOCK_CONDITION_CODES = ['new', 'used', 'demo'] as const;
export type StockConditionCode = (typeof STOCK_CONDITION_CODES)[number];

export const STOCK_CONDITION_LABELS: Record<StockConditionCode, string> = {
  new: 'Yeni',
  used: 'Kullanılmış',
  demo: 'Demo',
};

export const STOCK_CATEGORY_USAGE: Record<StockCategoryCode, { sales: boolean; service: boolean }> = {
  TEZGAH: { sales: true, service: false },
  OPSIYONEL_DONANIM: { sales: true, service: true },
  YEDEK_PARCA: { sales: true, service: true },
  AKSESUAR: { sales: true, service: true },
  EVRAK: { sales: false, service: false },
  IDARI_MALZEME: { sales: false, service: false },
};

export const stockCategoryForContext = (
  categoryCode: StockCategoryCode | string | undefined,
  context: 'sales' | 'service',
): boolean => {
  const usage = STOCK_CATEGORY_USAGE[(categoryCode as StockCategoryCode) ?? 'TEZGAH'];
  return context === 'sales' ? usage.sales : usage.service;
};
