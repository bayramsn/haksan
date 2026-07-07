import type { ProductSpec } from "./mock";

// ---------------------------------------------------------------------------
// Teknik bilgi grupları
// ---------------------------------------------------------------------------

export type ProductSpecGroupCode =
  | "KAPASITE"
  | "TABLA"
  | "EKSENLER"
  | "FENER_MILI"
  | "KARSI_PUNTA"
  | "KARSI_AYNA"
  | "CANLI_TAKIM"
  | "MOTORLAR"
  | "TARET"
  | "TAKIM_DEGISTIRICI"
  | "GENEL";

export type ProductSpecGroup = {
  code: ProductSpecGroupCode;
  label: string;
  order: number;
};

export type GroupedProductSpec<T extends ProductSpec = ProductSpec> = {
  group: ProductSpecGroup;
  specs: T[];
};

// Genel sıralama, şablonu olmayan ürün tipleri için kullanılır; şablonu olan
// tezgahlarda grup sırası katalogdaki şablon sırasından gelir.
export const PRODUCT_SPEC_GROUPS: readonly ProductSpecGroup[] = [
  { code: "KAPASITE", label: "KAPASİTE", order: 5 },
  { code: "TABLA", label: "TABLA", order: 10 },
  { code: "EKSENLER", label: "EKSENLER", order: 20 },
  { code: "FENER_MILI", label: "FENER MİLİ", order: 30 },
  { code: "KARSI_PUNTA", label: "KARŞI PUNTA", order: 32 },
  { code: "KARSI_AYNA", label: "KARŞI AYNA", order: 34 },
  { code: "CANLI_TAKIM", label: "CANLI TAKIM", order: 36 },
  { code: "MOTORLAR", label: "MOTORLAR", order: 40 },
  { code: "TARET", label: "TARET", order: 45 },
  { code: "TAKIM_DEGISTIRICI", label: "TAKIM DEĞİŞTİRİCİ", order: 50 },
  { code: "GENEL", label: "GENEL", order: 60 },
];

const PRODUCT_SPEC_GROUP_BY_CODE = new Map(PRODUCT_SPEC_GROUPS.map((group) => [group.code, group]));
const PRODUCT_SPEC_GROUP_BY_LABEL = new Map(
  PRODUCT_SPEC_GROUPS.map((group) => [normalizeSpecKey(group.label), group]),
);

// ---------------------------------------------------------------------------
// Tezgah tipine göre teknik bilgi şablonları (Haksan katalog düzeni).
// value: sadece sayısal/metin değer; unit: sabit birim (kullanıcı değiştirmez).
// ---------------------------------------------------------------------------

export type MachineSpecTemplateEntry = {
  group: ProductSpecGroupCode;
  key: string;
  value: string;
  unit: string;
};

const entry = (
  group: ProductSpecGroupCode,
  key: string,
  value = "",
  unit = "",
): MachineSpecTemplateEntry => ({ group, key, value, unit });

const CNC_YATAY_TORNA_TEMPLATE_ENTRIES: readonly MachineSpecTemplateEntry[] = [
  entry("KAPASITE", "Ayna Ölçüsü", '10"', '"'),
  entry("KAPASITE", "Maks. Çevirme Kapasitesi", "Ø 545", "mm"),
  entry("KAPASITE", "Maks. Tornalama Çapı", "Ø 380", "mm"),
  entry("KAPASITE", "Maks. Tornalama Boyu", "1.000", "mm"),
  entry("KAPASITE", "Maks. Çubuk İşleme Çapı", "Ø 75", "mm"),
  entry("FENER_MILI", "Fener Mili Devri", "4.200", "dv/dk"),
  entry("FENER_MILI", "Fener Mili Motor Gücü", "15", "kw"),
  entry("FENER_MILI", "Fener Mili Standardı", "A2-08"),
  entry("FENER_MILI", "Fener Mili Delik Çapı", "Ø 92", "mm"),
  entry("FENER_MILI", "Fener Mili Ön Rulman Çapı", "Ø 130", "mm"),
  entry("KARSI_PUNTA", "Karşı Punta Pinol Çapı", "Ø 90", "mm"),
  entry("KARSI_PUNTA", "Karşı Punta Pinol Hareketi", "85", "mm"),
  entry("KARSI_PUNTA", "Karşı Punta Pinol Koniği", "MT-5"),
  entry("KARSI_PUNTA", "Karşı Punta Gövde Hareketi", "960", "mm"),
  entry("KARSI_AYNA", "Karşı Ayna Ölçüsü", "-"),
  entry("KARSI_AYNA", "Karşı Ayna Çubuk İşleme Çapı", "-", "mm"),
  entry("KARSI_AYNA", "Karşı Ayna Devri", "-", "dv/dk"),
  entry("KARSI_AYNA", "Karşı Ayna Motor Gücü", "-", "kw"),
  entry("CANLI_TAKIM", "Canlı Takım Devri", "-", "dv/dk"),
  entry("CANLI_TAKIM", "Canlı Takım Motor Gücü", "-", "kw"),
  entry("CANLI_TAKIM", "Bağlanabilir Canlı Takım Sayısı", "-", "Adet"),
  entry("CANLI_TAKIM", "Canlı Takım Tutucu Standardı", "-"),
  entry("EKSENLER", "X Eksen Hareketi", "200", "mm"),
  entry("EKSENLER", "Z Eksen Hareketi", "1.030", "mm"),
  entry("EKSENLER", "Y Eksen Hareketi", "-", "mm"),
  entry("EKSENLER", "Z-2 Eksen Hareketi", "-", "mm"),
  entry("EKSENLER", "X Eksen Boşta İlerleme Oranı", "20.000", "mm/dk"),
  entry("EKSENLER", "Z Eksen Boşta İlerleme Oranı", "20.000", "mm/dk"),
  entry("EKSENLER", "Y Eksen Boşta İlerleme Oranı", "-", "mm/dk"),
  entry("EKSENLER", "Z-2 Eksen Boşta İlerleme Oranı", "-", "mm/dk"),
  entry("EKSENLER", "X Eksen Motor Gücü", "2,5", "kw"),
  entry("EKSENLER", "Z Eksen Motor Gücü", "2,5", "kw"),
  entry("EKSENLER", "Y Eksen Motor Gücü", "-", "kw"),
  entry("EKSENLER", "Z-2 Eksen Motor Gücü", "-", "kw"),
  entry("TARET", "Taret Tipi", "Hidrolik Taret"),
  entry("TARET", "Taret İstasyon Sayısı", "10", "Adet"),
  entry("TARET", "Maks. Kare Takım Ölçüsü", "25x25", "mm"),
  entry("TARET", "Maks. Yuvarlak Takım Ölçüsü", "Ø 40", "mm"),
  entry("GENEL", "Toplam Güç Gereksinimi", "30", "kw"),
  entry("GENEL", "Toplam Hava Gereksinimi", "-", "bar"),
  entry("GENEL", "Soğutma Sıvısı Tank Kapasitesi", "125", "lt"),
  entry("GENEL", "Tezgahın Kapladığı Alan", "4.557 x 1.618 x 2.115", "mm"),
  entry("GENEL", "Tezgah Ağırlığı", "5.500", "kg"),
];

const CNC_DIK_TORNA_TEMPLATE_ENTRIES: readonly MachineSpecTemplateEntry[] = [
  entry("KAPASITE", "Tabla (Ayna) Çapı", '12"', '"'),
  entry("KAPASITE", "Maks. Çevirme Kapasitesi", "Ø 650", "mm"),
  entry("KAPASITE", "Maks. Tornalama Çapı", "Ø 550", "mm"),
  entry("KAPASITE", "Maks. Tornalama Boyu", "500", "mm"),
  entry("TABLA", "Maks. İş Parçası Ağırlığı", "500", "kg"),
  entry("TABLA", "Tabla (Fener Mili) Motor Gücü", "15/18,5", "kw"),
  entry("TABLA", "Tabla C Eksen İndeksleme Motor Gücü", "-", "kw"),
  entry("TABLA", "Tabla (Fener Mili) Devir Aralığı", "50 ~ 2.500", "dv/dk"),
  entry("TABLA", "Fener Mili Delik Standardı", "A2-08"),
  entry("TARET", "Taret Tipi", "Hidrolik Taret"),
  entry("TARET", "İstasyon Sayısı", "8", "Adet"),
  entry("TARET", "Maks. Takım Uzunluğu", "2,8", "sn"),
  entry("TARET", "Maks. Kare Takım Çapı", "25 x 25", "mm"),
  entry("TARET", "Maks. Yuvarlak Takım Çapı", "Ø 40", "mm"),
  entry("CANLI_TAKIM", "Canlı Takım Motor Gücü", "-", "kw"),
  entry("CANLI_TAKIM", "Canlı Takım Devri", "-", "dv/dk"),
  entry("CANLI_TAKIM", "Bağlanabilir Canlı Takım Sayısı", "-", "Adet"),
  entry("CANLI_TAKIM", "Canlı Takım Tutucu Standardı", "-"),
  entry("EKSENLER", "X Eksen Hareketi", "-40 / 350", "mm"),
  entry("EKSENLER", "Z Eksen Hareketi", "550", "mm"),
  entry("EKSENLER", "W Eksen Hareketi", "-", "mm"),
  entry("EKSENLER", "X Eksen Boşta İlerleme Oranı", "12.000", "mm/dk"),
  entry("EKSENLER", "Z Eksen Boşta İlerleme Oranı", "24.000", "mm/dk"),
  entry("EKSENLER", "X Eksen Motor Gücü", "1,6", "kw"),
  entry("EKSENLER", "Z Eksen Motor Gücü", "3,0", "kw"),
  entry("GENEL", "Toplam Güç Gereksinimi", "40", "kw"),
  entry("GENEL", "Toplam Hava Gereksinimi", "6", "bar"),
  entry("GENEL", "Soğutma Sıvısı Tank Kapasitesi", "300", "lt"),
  entry("GENEL", "Tezgah Ölçüleri", "2.850 x 2.000 x 3.100", "mm"),
  entry("GENEL", "Tezgah Ağırlığı", "6.000", "kg"),
];

const CNC_DIK_ISLEME_TEMPLATE_ENTRIES: readonly MachineSpecTemplateEntry[] = [
  entry("TABLA", "Tabla Ölçüsü", "1.750 x 700", "mm"),
  entry("TABLA", "T Slot Ölçü ve Sayısı", "18 x 125 x 5"),
  entry("TABLA", "Tabla Yükleme Kapasitesi", "1.500", "kg"),
  entry("TABLA", "Tabla ~ Fener Mili Ucu Arası Mesafe", "130 ~ 830", "mm"),
  entry("EKSENLER", "X Eksen Hareketi", "1.600", "mm"),
  entry("EKSENLER", "Y Eksen Hareketi", "700", "mm"),
  entry("EKSENLER", "Z Eksen Hareketi", "700", "mm"),
  entry("EKSENLER", "X Eksen Boşta İlerleme Hızı", "36.000", "mm/dk"),
  entry("EKSENLER", "Y Eksen Boşta İlerleme Hızı", "36.000", "mm/dk"),
  entry("EKSENLER", "Z Eksen Boşta İlerleme Hızı", "36.000", "mm/dk"),
  entry("EKSENLER", "X, Y, Z Eksen Kesme Hızı", "20.000", "mm/dk"),
  entry("EKSENLER", "X, Y, Z Eksen Pozisyonlama Hassasiyeti", "0,017 / 300", "mm"),
  entry("EKSENLER", "X, Y, Z Eksen Tekrarlama Hassasiyeti", "± 0,005", "mm"),
  entry("FENER_MILI", "Fener Mili Standardı", "BT-40"),
  entry("FENER_MILI", "Fener Mili Devri", "12.000", "dv/dk"),
  entry("FENER_MILI", "Fener Mili Aktarması", "Direkt"),
  entry("FENER_MILI", "Fener Mili Rulman Tipi", "Çelik"),
  entry("MOTORLAR", "Fener Mili Motor Gücü", "18,5", "kw"),
  entry("MOTORLAR", "Fener Mili Motor Tipi", "AC Servo"),
  entry("MOTORLAR", "X Eksen Motor Gücü", "4,0", "kw"),
  entry("MOTORLAR", "Y Eksen Motor Gücü", "4,0", "kw"),
  entry("MOTORLAR", "Z Eksen Motor Gücü", "4,0", "kw"),
  entry("MOTORLAR", "Soğutma Sistemi Motor Gücü", "0,75 kw x 2 Adet"),
  entry("TAKIM_DEGISTIRICI", "Takım Değiştirici Tipi", "Kol Tipi"),
  entry("TAKIM_DEGISTIRICI", "Takım Kapasitesi", "30", "Adet"),
  entry("TAKIM_DEGISTIRICI", "Maks. Takım Ağırlığı", "7", "kg"),
  entry("TAKIM_DEGISTIRICI", "Maks. Takım Uzunluğu", "300", "mm"),
  entry("TAKIM_DEGISTIRICI", "Maks. Takım Çapı", "Ø 75 / Ø 150", "mm"),
  entry("TAKIM_DEGISTIRICI", "Takım Değiştirme Süresi (Takımdan Takıma)", "1,4", "sn"),
  entry("GENEL", "Tezgah Hava Gereksinimi", "6", "bar (100 psi)"),
  entry("GENEL", "Toplam Güç Gereksinimi", "380 V/ 50 Hz. 30 kw"),
  entry("GENEL", "Tezgah Ölçüleri", "4.350 x 2.507 x 3.240", "mm"),
  entry("GENEL", "Tezgahın Kapladığı Alan", "5.950 x 3.530 x 3.240", "mm"),
  entry("GENEL", "Tezgah Ağırlığı", "8.860", "kg"),
];

const CNC_TAPPING_CENTER_TEMPLATE_ENTRIES: readonly MachineSpecTemplateEntry[] = [
  entry("TABLA", "Tabla Ölçüsü", "650 x 420", "mm"),
  entry("TABLA", "T Slot Ölçü ve Sayısı", "14 x 100 x 3"),
  entry("TABLA", "Tabla Yükleme Kapasitesi", "250", "kg"),
  entry("TABLA", "Tabla ~ Fener Mili Ucu Arası Mesafe", "180 ~ 530", "mm"),
  entry("EKSENLER", "X Eksen Hareketi", "510", "mm"),
  entry("EKSENLER", "Y Eksen Hareketi", "420", "mm"),
  entry("EKSENLER", "Z Eksen Hareketi", "350", "mm"),
  entry("EKSENLER", "X Eksen Boşta İlerleme Hızı", "48.000", "mm/dk"),
  entry("EKSENLER", "Y Eksen Boşta İlerleme Hızı", "48.000", "mm/dk"),
  entry("EKSENLER", "Z Eksen Boşta İlerleme Hızı", "48.000", "mm/dk"),
  entry("EKSENLER", "X, Y, Z Eksen Kesme Hızı", "20.000", "mm/dk"),
  entry("EKSENLER", "X, Y, Z Eksen Pozisyonlama Hassasiyeti", "0,017 / 300", "mm"),
  entry("EKSENLER", "X, Y, Z Eksen Tekrarlama Hassasiyeti", "± 0,005", "mm"),
  entry("FENER_MILI", "Fener Mili Standardı", "BT-30"),
  entry("FENER_MILI", "Fener Mili Devri", "12.000", "dv/dk"),
  entry("FENER_MILI", "Fener Mili Aktarması", "Direkt"),
  entry("FENER_MILI", "Fener Mili Rulman Tipi", "Çelik"),
  entry("MOTORLAR", "Fener Mili Motor Gücü", "5,5", "kw (7,5 hp)"),
  entry("MOTORLAR", "Fener Mili Motor Tipi", "AC Servo"),
  entry("MOTORLAR", "X Eksen Motor Gücü", "2,2", "kw"),
  entry("MOTORLAR", "Y Eksen Motor Gücü", "2,0", "kw"),
  entry("MOTORLAR", "Z Eksen Motor Gücü", "2,2", "kw"),
  entry("MOTORLAR", "Soğutma Sistemi Motor Gücü", "0,75 kw x 2 Adet"),
  entry("TAKIM_DEGISTIRICI", "Takım Değiştirici Tipi", "Taret Tipi"),
  entry("TAKIM_DEGISTIRICI", "Takım Kapasitesi", "21", "Adet"),
  entry("TAKIM_DEGISTIRICI", "Maks. Takım Ağırlığı", "3", "kg"),
  entry("TAKIM_DEGISTIRICI", "Maks. Takım Uzunluğu", "200", "mm"),
  entry("TAKIM_DEGISTIRICI", "Maks. Takım Çapı", "Ø 100 / Ø 140", "mm"),
  entry("TAKIM_DEGISTIRICI", "Takım Değiştirme Süresi (Takımdan Takıma)", "1,6", "sn"),
  entry("GENEL", "Tezgah Hava Gereksinimi", "6", "bar (100 psi)"),
  entry("GENEL", "Toplam Güç Gereksinimi", "380 V/ 50 Hz. 12 kw"),
  entry("GENEL", "Tezgah Ölçüleri", "2.600 x 4.100 x 2.400", "mm"),
  entry("GENEL", "Tezgahın Kapladığı Alan", "-", "mm"),
  entry("GENEL", "Tezgah Ağırlığı", "2.800", "kg"),
];

const CNC_BES_EKSEN_TEMPLATE_ENTRIES: readonly MachineSpecTemplateEntry[] = [
  entry("TABLA", "Tabla Ölçüsü", "Ø 350", "mm"),
  entry("TABLA", "T Slot Ölçü ve Sayısı", "12 H7 x 8 x 45°"),
  entry("TABLA", "Tabla Merkez Delik Çapı", "", "mm"),
  entry("TABLA", "Tabla Yükleme Kapasitesi", "1.000", "kg"),
  entry("TABLA", "Tabla ~ Fener Mili Ucu Arası Mesafe", "85 ~ 525", "mm"),
  entry("EKSENLER", "X,Y ve Z Eksen Hareketi", "800", "mm"),
  entry("EKSENLER", "A Eksen Dönüş Açısı", "500", "mm"),
  entry("EKSENLER", "C Eksen Dönüş Açısı", "610", "mm"),
  entry("EKSENLER", "X, Y ve Z Eksen Boşta İlerleme Hızı", "48.000", "mm/dk"),
  entry("EKSENLER", "X, Y, Z Eksen Kesme Hızı", "20.000", "mm/dk"),
  entry("EKSENLER", "X, Y, Z Eksen Pozisyonlama Hassasiyeti", "0,010", "mm"),
  entry("EKSENLER", "X, Y, Z Eksen Tekrarlama Hassasiyeti", "± 0,006", "mm"),
  entry("FENER_MILI", "Fener Mili Standardı", "BT-40"),
  entry("FENER_MILI", "Fener Mili Devri", "10.000", "dv/dk"),
  entry("FENER_MILI", "Fener Mili Aktarması", "Direkt"),
  entry("FENER_MILI", "Fener Mili Rulman Tipi", "Çelik"),
  entry("MOTORLAR", "Fener Mili Motor Gücü", "15", "kw (20 hp)"),
  entry("MOTORLAR", "Fener Mili Motor Tipi", "AC Servo"),
  entry("MOTORLAR", "X Eksen Motor Gücü", "2,0", "kw"),
  entry("MOTORLAR", "Y Eksen Motor Gücü", "2,0", "kw"),
  entry("MOTORLAR", "Z Eksen Motor Gücü", "3,5", "kw"),
  entry("MOTORLAR", "A Eksen Motor Gücü", "", "kw"),
  entry("MOTORLAR", "C Eksen Motor Gücü", "", "kw"),
  entry("TAKIM_DEGISTIRICI", "Takım Değiştirici Tipi", "Kol Tipi"),
  entry("TAKIM_DEGISTIRICI", "Takım Kapasitesi", "24", "Adet"),
  entry("TAKIM_DEGISTIRICI", "Maks. Takım Ağırlığı", "7", "kg"),
  entry("TAKIM_DEGISTIRICI", "Maks. Takım Uzunluğu", "300", "mm"),
  entry("TAKIM_DEGISTIRICI", "Maks. Takım Çapı", "Ø 75 / Ø 150", "mm"),
  entry("TAKIM_DEGISTIRICI", "Takım Değiştirme Süresi (Takımdan Takıma)", "1,8", "sn"),
  entry("GENEL", "Tezgah Hava Gereksinimi", "6", "bar (100 psi)"),
  entry("GENEL", "Toplam Güç Gereksinimi", "380 V/ 50 Hz. 30 kw"),
  entry("GENEL", "Tezgah Ölçüleri", "2.230 x 2.483 x 2.970", "mm"),
  entry("GENEL", "Tezgah Ağırlığı", "6.100", "kg"),
];

const CNC_KOPRU_TIPI_TEMPLATE_ENTRIES: readonly MachineSpecTemplateEntry[] = [
  entry("TABLA", "Tabla Ölçüsü", "2.000 x 1.100", "mm"),
  entry("TABLA", "T Slot Ölçü ve Sayısı", "22 x 150 x 7"),
  entry("TABLA", "Tabla Yükleme Kapasitesi", "4.000", "kg"),
  entry("TABLA", "Kolonlar Arası Mesafe", "1.400", "mm"),
  entry("TABLA", "Tabla ~ Fener Mili Ucu Arası Mesafe", "100 ~ 900", "mm"),
  entry("EKSENLER", "X Eksen Hareketi", "2.100", "mm"),
  entry("EKSENLER", "Y Eksen Hareketi", "1.220", "mm"),
  entry("EKSENLER", "Z Eksen Hareketi", "800", "mm"),
  entry("EKSENLER", "X Eksen Boşta İlerleme Hızı", "12.000", "mm/dk"),
  entry("EKSENLER", "Y Eksen Boşta İlerleme Hızı", "15.000", "mm/dk"),
  entry("EKSENLER", "Z Eksen Boşta İlerleme Hızı", "15.000", "mm/dk"),
  entry("EKSENLER", "X, Y, Z Eksen Kesme Hızı", "10.000", "mm/dk"),
  entry("EKSENLER", "X, Y, Z Eksen Pozisyonlama Hassasiyeti", "± 0,005 / 300", "mm"),
  entry("EKSENLER", "X, Y, Z Eksen Tekrarlama Hassasiyeti", "± 0,003 / 300", "mm"),
  entry("FENER_MILI", "Fener Mili Standardı", "BT-40"),
  entry("FENER_MILI", "Fener Mili Devri", "10.000", "dv/dk"),
  entry("FENER_MILI", "Fener Mili Aktarması", "Direk Aktarma"),
  entry("FENER_MILI", "Fener Mili Rulman Tipi", "Çelik"),
  entry("MOTORLAR", "Fener Mili Motor Gücü", "15", "kw"),
  entry("MOTORLAR", "Fener Mili Motor Tipi", "AC Servo"),
  entry("MOTORLAR", "X Eksen Motor Gücü", "9,0", "kw"),
  entry("MOTORLAR", "Y Eksen Motor Gücü", "4,5", "kw"),
  entry("MOTORLAR", "Z Eksen Motor Gücü", "4,5", "kw"),
  entry("MOTORLAR", "Soğutma Sistemi Motor Gücü", "0,75 kw x 2 Adet"),
  entry("TAKIM_DEGISTIRICI", "Takım Değiştirici Tipi", "Kol Tipi"),
  entry("TAKIM_DEGISTIRICI", "Takım Kapasitesi", "24", "Adet"),
  entry("TAKIM_DEGISTIRICI", "Maks. Takım Ağırlığı", "8", "kg"),
  entry("TAKIM_DEGISTIRICI", "Maks. Takım Uzunluğu", "300", "mm"),
  entry("TAKIM_DEGISTIRICI", "Maks. Takım Çapı", "Ø 125 / Ø 250", "mm"),
  entry("TAKIM_DEGISTIRICI", "Takım Değiştirme Süresi (Takımdan Takıma)", "6,0", "sn"),
  entry("GENEL", "Tezgah Hava Gereksinimi", "6", "bar (100 psi)"),
  entry("GENEL", "Toplam Güç Gereksinimi", "380 V/ 50 Hz. 30 kw"),
  entry("GENEL", "Tezgahın Kapladığı Alan", "6.455 x 3.640 x 3.820", "mm"),
  entry("GENEL", "Tezgah Ağırlığı", "15.500", "kg"),
];

// Tezgah dışı ürün tipleri (yedek parça, opsiyonel donanım, işçilik, aksesuar)
// bilinçli olarak şablonsuzdur; teknik alanları serbest metinle girilir.
export const MACHINE_SPEC_TEMPLATES: Record<string, readonly MachineSpecTemplateEntry[]> = {
  CNC_YATAY_TORNA_TEZGAHI: CNC_YATAY_TORNA_TEMPLATE_ENTRIES,
  CNC_DIK_TORNA_TEZGAHI: CNC_DIK_TORNA_TEMPLATE_ENTRIES,
  CNC_DIK_ISLEME_MERKEZ: CNC_DIK_ISLEME_TEMPLATE_ENTRIES,
  CNC_TAPPING_CENTER: CNC_TAPPING_CENTER_TEMPLATE_ENTRIES,
  CNC_5_EKSEN_ISLEME_MERKEZI: CNC_BES_EKSEN_TEMPLATE_ENTRIES,
  CNC_KOPRU_TIPI_ISLEME_MERKEZI: CNC_KOPRU_TIPI_TEMPLATE_ENTRIES,
};

// Eski verilerde geçen ürün tipi kodları güncel kodlara eşlenir.
const MACHINE_TYPE_ALIASES: Record<string, string> = {
  DIK_ISLEME_MERKEZI: "CNC_DIK_ISLEME_MERKEZ",
  KOPRU_TIPI_ISLEME_MERKEZI: "CNC_KOPRU_TIPI_ISLEME_MERKEZI",
  CNC_TORNA: "CNC_YATAY_TORNA_TEZGAHI",
};

const canonicalMachineTypeCode = (typeCode?: string | null) => {
  const upper = (typeCode ?? "").toLocaleUpperCase("tr-TR");
  return MACHINE_TYPE_ALIASES[upper] ?? upper;
};

export const machineSpecTemplateEntries = (typeCode?: string | null): readonly MachineSpecTemplateEntry[] =>
  MACHINE_SPEC_TEMPLATES[canonicalMachineTypeCode(typeCode)] ?? [];

const templateEntryToSpec = (item: MachineSpecTemplateEntry): ProductSpec => ({
  key: item.key,
  value: item.value,
  unit: item.unit,
  specUnit: item.unit,
  groupCode: item.group,
});

export const CNC_YATAY_TORNA_SPEC_DEFAULTS: readonly ProductSpec[] = CNC_YATAY_TORNA_TEMPLATE_ENTRIES.map(templateEntryToSpec);
export const CNC_DIK_TORNA_SPEC_DEFAULTS: readonly ProductSpec[] = CNC_DIK_TORNA_TEMPLATE_ENTRIES.map(templateEntryToSpec);
export const CNC_DIK_ISLEME_SPEC_DEFAULTS: readonly ProductSpec[] = CNC_DIK_ISLEME_TEMPLATE_ENTRIES.map(templateEntryToSpec);
export const CNC_TAPPING_CENTER_SPEC_DEFAULTS: readonly ProductSpec[] = CNC_TAPPING_CENTER_TEMPLATE_ENTRIES.map(templateEntryToSpec);
export const CNC_BES_EKSEN_SPEC_DEFAULTS: readonly ProductSpec[] = CNC_BES_EKSEN_TEMPLATE_ENTRIES.map(templateEntryToSpec);
export const CNC_KOPRU_TIPI_SPEC_DEFAULTS: readonly ProductSpec[] = CNC_KOPRU_TIPI_TEMPLATE_ENTRIES.map(templateEntryToSpec);

export const CNC_YATAY_TORNA_SPEC_TEMPLATE = CNC_YATAY_TORNA_SPEC_DEFAULTS.map((spec) => spec.key);
export const CNC_DIK_TORNA_SPEC_TEMPLATE = CNC_DIK_TORNA_SPEC_DEFAULTS.map((spec) => spec.key);
export const CNC_DIK_ISLEME_SPEC_TEMPLATE = CNC_DIK_ISLEME_SPEC_DEFAULTS.map((spec) => spec.key);
export const CNC_TAPPING_CENTER_SPEC_TEMPLATE = CNC_TAPPING_CENTER_SPEC_DEFAULTS.map((spec) => spec.key);
export const CNC_BES_EKSEN_SPEC_TEMPLATE = CNC_BES_EKSEN_SPEC_DEFAULTS.map((spec) => spec.key);
export const CNC_KOPRU_TIPI_SPEC_TEMPLATE = CNC_KOPRU_TIPI_SPEC_DEFAULTS.map((spec) => spec.key);

// Şablon dışında kalan, eski ürünlerde geçen alan adları (katalog birleşik listesi).
const LEGACY_SPEC_KEYS: readonly string[] = [
  "A Eksen Hareketi",
  "C Eksen Hareketi",
  "A Eksen Dönüş Açısı",
  "C Eksen Dönüş Açısı",
  "Döner Tabla Ölçüsü",
  "Fener Mili",
  "Güç Tüketimi",
  "Takım Değiştirici",
  "Takım Tutucu Standardı",
  "Tezgah Ölçüleri (Döner Kontrol Paneliyle Birlikte)",
  "X, Y ve Z Eksen Boşta İlerleme Hızı",
  "X, Y, Z Eksen Boşta İlerleme Oranı",
  "X, Y, Z Eksen Hareketi",
  "X, Z ve Z Eksen Boşta İlerleme Hızı",
  "X,Y ve Z Eksen Hareketi",
];

const SPEC_KEY_CATALOG = (() => {
  const seen = new Set<string>();
  const keys: string[] = [];
  const units = new Map<string, string>();
  for (const entries of Object.values(MACHINE_SPEC_TEMPLATES)) {
    for (const item of entries) {
      const norm = normalizeSpecKey(item.key);
      if (!seen.has(norm)) {
        seen.add(norm);
        keys.push(item.key);
      }
      if (item.unit && !units.has(norm)) units.set(norm, item.unit);
    }
  }
  for (const key of LEGACY_SPEC_KEYS) {
    const norm = normalizeSpecKey(key);
    if (!seen.has(norm)) {
      seen.add(norm);
      keys.push(key);
    }
  }
  return { keys, units };
})();

export const HAKSAN_CNC_SPEC_KEYS: readonly string[] = SPEC_KEY_CATALOG.keys;

export const specUnitForKey = (key: string): string =>
  SPEC_KEY_CATALOG.units.get(normalizeSpecKey(key)) ?? "";

export const HAKSAN_CNC_SPEC_VALUE_UNITS: readonly string[] = [
  "Ø",
  "mm",
  "cm",
  "m",
  "kg",
  "gr",
  "ton",
  "kw",
  "kW",
  "hp",
  "V",
  "Hz",
  "bar",
  "psi",
  "lt",
  "sn",
  "dk",
  "dv",
  "dv/dk",
  "rpm",
  "Adet",
  "°",
];

// ---------------------------------------------------------------------------
// Gruplama
// ---------------------------------------------------------------------------

const specGroupByCode = (code?: string | null) =>
  code ? PRODUCT_SPEC_GROUP_BY_CODE.get(code.toLocaleUpperCase("tr-TR") as ProductSpecGroupCode) : undefined;

const specGroupByLabel = (label?: string | null) =>
  label ? PRODUCT_SPEC_GROUP_BY_LABEL.get(normalizeSpecKey(label)) : undefined;

// Tip şablonu olmayan durumlar için anahtar-adı sezgisi.
export function productSpecGroupForKey(spec: ProductSpec | string): ProductSpecGroup {
  const value = typeof spec === "string" ? { key: spec, value: "" } : spec;
  const explicitGroup = specGroupByCode(value.groupCode) ?? specGroupByLabel(value.groupName);
  if (explicitGroup) return explicitGroup;

  const key = normalizeSpecKey(value.key);
  if (key.includes("karsi punta")) return PRODUCT_SPEC_GROUP_BY_CODE.get("KARSI_PUNTA")!;
  if (key.includes("karsi ayna")) return PRODUCT_SPEC_GROUP_BY_CODE.get("KARSI_AYNA")!;
  if (key.includes("canli takim")) return PRODUCT_SPEC_GROUP_BY_CODE.get("CANLI_TAKIM")!;
  if (key.includes("taret") || key.includes("istasyon")) return PRODUCT_SPEC_GROUP_BY_CODE.get("TARET")!;
  if (
    key.includes("cevirme kapasitesi") ||
    key.includes("tornalama capi") ||
    key.includes("tornalama boyu") ||
    key.includes("cubuk isleme capi") ||
    key.includes("ayna olcusu") ||
    key.includes("ayna capi")
  ) {
    return PRODUCT_SPEC_GROUP_BY_CODE.get("KAPASITE")!;
  }
  if (key.includes("tabla") || key.includes("is parcasi") || key.includes("kolonlar arasi")) {
    return PRODUCT_SPEC_GROUP_BY_CODE.get("TABLA")!;
  }
  if (
    key.includes("eksen") ||
    key.includes("pozisyonlama") ||
    key.includes("tekrarlama") ||
    key.includes("ilerleme") ||
    key.includes("hareketi")
  ) {
    return PRODUCT_SPEC_GROUP_BY_CODE.get("EKSENLER")!;
  }
  if (key === "fener mili motor tipi" || key.includes("motor tipi") || (key.includes("motor") && !key.includes("fener mili motor gucu"))) {
    return PRODUCT_SPEC_GROUP_BY_CODE.get("MOTORLAR")!;
  }
  if (key.includes("fener mili") || key.includes("spindle") || key.includes("rulman")) {
    return PRODUCT_SPEC_GROUP_BY_CODE.get("FENER_MILI")!;
  }
  if (key.includes("takim")) {
    return PRODUCT_SPEC_GROUP_BY_CODE.get("TAKIM_DEGISTIRICI")!;
  }
  return PRODUCT_SPEC_GROUP_BY_CODE.get("GENEL")!;
}

type MachineTemplateIndex = {
  groupByKey: Map<string, ProductSpecGroupCode>;
  groupOrder: ProductSpecGroupCode[];
};

const TEMPLATE_INDEX_CACHE = new Map<string, MachineTemplateIndex>();

const templateIndexFor = (typeCode?: string | null): MachineTemplateIndex => {
  const canonical = canonicalMachineTypeCode(typeCode);
  const cached = TEMPLATE_INDEX_CACHE.get(canonical);
  if (cached) return cached;
  const groupByKey = new Map<string, ProductSpecGroupCode>();
  const groupOrder: ProductSpecGroupCode[] = [];
  for (const item of MACHINE_SPEC_TEMPLATES[canonical] ?? []) {
    const norm = normalizeSpecKey(item.key);
    if (!groupByKey.has(norm)) groupByKey.set(norm, item.group);
    if (!groupOrder.includes(item.group)) groupOrder.push(item.group);
  }
  const index = { groupByKey, groupOrder };
  TEMPLATE_INDEX_CACHE.set(canonical, index);
  return index;
};

// Tezgah tipi biliniyorsa grup ataması ve grup sırası katalog şablonundan gelir.
export function productSpecGroupForTypeKey(
  typeCode: string | null | undefined,
  spec: ProductSpec | string,
): ProductSpecGroup {
  const value = typeof spec === "string" ? { key: spec, value: "" } : spec;
  const templateGroup = templateIndexFor(typeCode).groupByKey.get(normalizeSpecKey(value.key));
  if (templateGroup) return PRODUCT_SPEC_GROUP_BY_CODE.get(templateGroup)!;
  return productSpecGroupForKey(value);
}

export function groupProductSpecsForType<T extends ProductSpec>(
  typeCode: string | null | undefined,
  specs: readonly T[],
): GroupedProductSpec<T>[] {
  const { groupByKey, groupOrder } = templateIndexFor(typeCode);
  const buckets = new Map<ProductSpecGroupCode, T[]>();
  for (const spec of specs) {
    const code = groupByKey.get(normalizeSpecKey(spec.key)) ?? productSpecGroupForKey(spec).code;
    buckets.set(code, [...(buckets.get(code) ?? []), spec]);
  }
  const orderedCodes: ProductSpecGroupCode[] = [
    ...groupOrder,
    ...PRODUCT_SPEC_GROUPS.map((group) => group.code).filter((code) => !groupOrder.includes(code)),
  ];
  return orderedCodes
    .map((code) => ({ group: PRODUCT_SPEC_GROUP_BY_CODE.get(code)!, specs: buckets.get(code) ?? [] }))
    .filter((item) => item.specs.length > 0);
}

export function groupProductSpecs<T extends ProductSpec>(specs: readonly T[]): GroupedProductSpec<T>[] {
  return groupProductSpecsForType(undefined, specs);
}

// ---------------------------------------------------------------------------
// Anahtar normalizasyonu ve değer/birim ayrıştırma
// ---------------------------------------------------------------------------

const HAKSAN_CNC_SPEC_DEFAULTS: readonly ProductSpec[] = HAKSAN_CNC_SPEC_KEYS.map((key) => ({
  key,
  value: "",
  unit: specUnitForKey(key),
  specUnit: specUnitForKey(key),
}));

const SPEC_DEFAULTS: Record<string, readonly ProductSpec[]> = {
  CNC_YATAY_TORNA_TEZGAHI: CNC_YATAY_TORNA_SPEC_DEFAULTS,
  CNC_DIK_TORNA_TEZGAHI: CNC_DIK_TORNA_SPEC_DEFAULTS,
  CNC_DIK_ISLEME_MERKEZ: CNC_DIK_ISLEME_SPEC_DEFAULTS,
  CNC_TAPPING_CENTER: CNC_TAPPING_CENTER_SPEC_DEFAULTS,
  CNC_5_EKSEN_ISLEME_MERKEZI: CNC_BES_EKSEN_SPEC_DEFAULTS,
  CNC_KOPRU_TIPI_ISLEME_MERKEZI: CNC_KOPRU_TIPI_SPEC_DEFAULTS,
};

function normalizeSpecKey(value: string) {
  const normalized = value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const aliases: Record<string, string> = {
    "x y z kesme hizi": "x y z eksen kesme hizi",
    "pozisyonlama hassasiyeti": "x y z eksen pozisyonlama hassasiyeti",
    "tekrarlama hassasiyeti": "x y z eksen tekrarlama hassasiyeti",
    "maksimum takim agirligi": "maks takim agirligi",
    "maksimum takim uzunlugu": "maks takim uzunlugu",
    "maksimum takim capi": "maks takim capi",
    "takim degistirme suresi": "takim degistirme suresi takimdan takima",
    "hava gereksinimi": "tezgah hava gereksinimi",
    "kapladigi alan": "tezgahin kapladigi alan",
    "agirlik": "tezgah agirligi",
    "a eksen hareketi": "a eksen donus acisi",
    "c eksen hareketi": "c eksen donus acisi",
    "doner tabla olcusu": "tabla olcusu",
  };
  return aliases[normalized] ?? normalized;
}

export const normalizeProductSpecKey = normalizeSpecKey;

const SPEC_VALUE_UNIT_PATTERNS: RegExp[] = [
  /^(.+?)\s+(bar\s*\(.+\))$/i,
  /^(.+?)\s+(kw\s*\(.+\))$/i,
  /^(.+?)\s+(mm\/dk|dv\/dk|mm|kg|kw|hp|lt|adet|sn|bar|psi)$/i,
  /^(.+?)(\")$/,
];

const splitSpecValueUnit = (value?: string | null): Pick<ProductSpec, "value" | "unit"> => {
  const text = (value ?? "").trim();
  if (!text || text === "-") return { value: text, unit: "" };
  for (const pattern of SPEC_VALUE_UNIT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1] && match?.[2]) {
      return { value: match[1].trim(), unit: match[2].trim() };
    }
  }
  return { value: text, unit: "" };
};

const normalizeSpecUnit = (spec: ProductSpec): ProductSpec => {
  const explicitUnit = spec.unit ?? spec.specUnit;
  if (explicitUnit !== undefined) {
    return { ...spec, value: spec.value ?? "", unit: explicitUnit, specUnit: explicitUnit };
  }
  const parts = splitSpecValueUnit(spec.value);
  return { ...spec, ...parts, specUnit: parts.unit };
};

const splitTriplet = (value: string, separator: RegExp): string[] => {
  const unit = value.match(/\s([a-zA-ZçğıöşüÇĞİÖŞÜ.\/]+)$/)?.[1] ?? "";
  return value
    .replace(/\s+[a-zA-ZçğıöşüÇĞİÖŞÜ.\/]+$/, "")
    .split(separator)
    .map((part) => `${part.trim()}${unit ? ` ${unit}` : ""}`)
    .filter(Boolean);
};

const pushAxisValues = (
  target: ProductSpec[],
  keys: readonly string[],
  values: readonly string[],
) => {
  if (values.length === 1) {
    for (const key of keys) target.push({ key, value: values[0] });
    return;
  }
  keys.forEach((key, index) => {
    if (values[index]) target.push({ key, value: values[index] });
  });
};

function expandLegacyMachiningCenterSpecs(specs: ProductSpec[]): ProductSpec[] {
  const expanded: ProductSpec[] = [];

  for (const spec of specs) {
    const key = normalizeSpecKey(spec.key);
    if (key === "x y z eksen hareketi" || key === "x y ve z eksen hareketi") {
      const [x, y, z] = splitTriplet(spec.value, /\s*[x×]\s*/i);
      pushAxisValues(expanded, ["X Eksen Hareketi", "Y Eksen Hareketi", "Z Eksen Hareketi"], [x, y, z].filter(Boolean));
      continue;
    }
    if (
      key === "x y z eksen bosta ilerleme orani" ||
      key === "x y z eksen bosta ilerleme hizi" ||
      key === "x y ve z eksen bosta ilerleme hizi"
    ) {
      const [x, y, z] = splitTriplet(spec.value, /\s*\/\s*/);
      pushAxisValues(expanded, ["X Eksen Boşta İlerleme Hızı", "Y Eksen Boşta İlerleme Hızı", "Z Eksen Boşta İlerleme Hızı"], [x, y, z].filter(Boolean));
      continue;
    }
    if (key === "takim tutucu standardi") {
      const [standard, drive] = spec.value.split(/\s*\/\s*/, 2);
      if (standard) expanded.push({ key: "Fener Mili Standardı", value: standard.trim() });
      if (drive) expanded.push({ key: "Fener Mili Aktarması", value: drive.trim() });
      continue;
    }
    if (key === "takim degistirici") {
      const [type, capacity] = spec.value.split(/\s*-\s*/, 2);
      if (type) expanded.push({ key: "Takım Değiştirici Tipi", value: type.trim() });
      if (capacity) {
        expanded.push({
          key: "Takım Kapasitesi",
          value: capacity.replace(/\s*takım kapasiteli$/i, " Adet").trim(),
        });
      }
      continue;
    }
    expanded.push({ ...spec });
  }

  return expanded;
}

// ---------------------------------------------------------------------------
// Şablon + mevcut değer birleştirme
// ---------------------------------------------------------------------------

export function productSpecDefaults(typeCode?: string | null): readonly ProductSpec[] {
  return SPEC_DEFAULTS[canonicalMachineTypeCode(typeCode)] ?? [];
}

export function productSpecTemplate(typeCode?: string | null): readonly string[] {
  return productSpecDefaults(typeCode).map((spec) => spec.key);
}

export function mergeSpecsWithTemplate(specs: ProductSpec[], keys: readonly string[]): ProductSpec[] {
  return mergeSpecsWithDefaults(specs, keys.map((key) => ({ key, value: "" })));
}

export function mergeSpecsWithDefaults(
  specs: ProductSpec[],
  defaults: readonly ProductSpec[],
): ProductSpec[] {
  const normalizedSpecs = specs.map(normalizeSpecUnit);
  const normalizedDefaults = defaults.map(normalizeSpecUnit);
  if (!normalizedDefaults.length) return normalizedSpecs.map((spec) => ({ ...spec }));

  const used = new Set<number>();
  const templated = normalizedDefaults.map((defaultSpec) => {
    const normalized = normalizeSpecKey(defaultSpec.key);
    const index = normalizedSpecs.findIndex(
      (spec, specIndex) => !used.has(specIndex) && normalizeSpecKey(spec.key) === normalized,
    );
    if (index >= 0) {
      used.add(index);
      const existing = normalizedSpecs[index];
      // Birim şablondan gelir ve sabittir; şablonda birim yoksa mevcut korunur.
      const templateUnit = (defaultSpec.unit ?? defaultSpec.specUnit ?? "").trim();
      const unit = templateUnit || (existing.unit ?? existing.specUnit ?? "");
      return {
        key: defaultSpec.key,
        value: existing.value?.trim() ? existing.value : defaultSpec.value,
        unit,
        specUnit: unit,
        groupCode: defaultSpec.groupCode ?? existing.groupCode,
        groupName: defaultSpec.groupName ?? existing.groupName,
      };
    }
    return { ...defaultSpec };
  });
  const custom = normalizedSpecs.filter(
    (spec, index) =>
      !used.has(index) &&
      !normalizedDefaults.some((defaultSpec) => normalizeSpecKey(defaultSpec.key) === normalizeSpecKey(spec.key)) &&
      (spec.key.trim() || spec.value.trim()),
  );
  return [...templated, ...custom];
}

export function allCatalogProductSpecs(specs: ProductSpec[] = [], emptyValue = ""): ProductSpec[] {
  return mergeSpecsWithDefaults(specs, HAKSAN_CNC_SPEC_DEFAULTS).map((spec) => ({
    key: spec.key,
    value: spec.value?.trim() ? spec.value : emptyValue,
    unit: spec.unit ?? spec.specUnit ?? "",
    specUnit: spec.unit ?? spec.specUnit ?? "",
    groupCode: spec.groupCode,
    groupName: spec.groupName,
  }));
}

export function specsForProductType(typeCode: string | undefined, specs: ProductSpec[]): ProductSpec[] {
  const normalizedType = canonicalMachineTypeCode(typeCode);
  // 5 eksen katalog şablonu birleşik eksen anahtarları kullandığı için
  // legacy açılımı uygulanmaz; diğer işleme merkezlerinde eski birleşik
  // değerler tekil eksen alanlarına açılır.
  const source = [
    "CNC_DIK_ISLEME_MERKEZ",
    "CNC_TAPPING_CENTER",
    "CNC_KOPRU_TIPI_ISLEME_MERKEZI",
  ].includes(normalizedType)
    ? expandLegacyMachiningCenterSpecs(specs)
    : specs;
  return mergeSpecsWithDefaults(source, productSpecDefaults(normalizedType));
}

// Tüm tezgah şablonlarının + legacy anahtarların birleşik kümesi (normalize).
const ALL_KNOWN_MACHINE_SPEC_KEYS = new Set(HAKSAN_CNC_SPEC_KEYS.map(normalizeSpecKey));

/**
 * Seçili tip şablonuna ait OLMAYAN ama başka bir tezgah/katalog alanına ait olan
 * spec'leri eler. Seçili tipin alanları ve hiçbir katalog şablonunda bulunmayan
 * gerçekten özel (dolu) alanlar korunur. Bir ürünün specs'i başka tezgah
 * tiplerinden alan taşısa bile yalnızca seçili tipin alanları kalır.
 */
export function dropForeignMachineSpecs(typeCode: string | undefined, specs: ProductSpec[]): ProductSpec[] {
  const templateDefaults = productSpecDefaults(typeCode);
  if (!templateDefaults.length) return specs;
  const selectedKeys = new Set(templateDefaults.map((spec) => normalizeSpecKey(spec.key)));
  return specs.filter((spec) => {
    const key = normalizeSpecKey(spec.key);
    if (selectedKeys.has(key)) return true;
    if (ALL_KNOWN_MACHINE_SPEC_KEYS.has(key)) return false;
    return Boolean(spec.key.trim() || spec.value.trim());
  });
}

/** `specsForProductType` + yabancı tezgah alanlarının elenmesi: yalnızca seçili tipin teknik alanları. */
export function specsForProductTypeStrict(typeCode: string | undefined, specs: ProductSpec[]): ProductSpec[] {
  return specsForProductType(typeCode, dropForeignMachineSpecs(typeCode, specs));
}
