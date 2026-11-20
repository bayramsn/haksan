/** Technical templates for Haksan Makina source types (Settings → Teknik Bilgi).
 *  The site prints the same field under many spellings; each canonical field lists the
 *  normalized spellings it absorbs. Unmatched values stay on the product, never in the template.
 *  CNC and laser types are deliberately absent: their templates are owned elsewhere. */
import { haksanNormal } from './haksan-catalog-classification';

export type SpecField = { group: string; key: string; unit: string; match?: RegExp };
const f = (group: string, key: string, unit: string, match?: RegExp): SpecField => ({ group, key, unit, match });

export const SPEC_GROUP_NAMES: Record<string, string> = {
  KAPASITE: 'Kapasite', TABLA: 'Tabla', EKSENLER: 'Eksenler', FENER_MILI: 'Fener Mili', KARSI_PUNTA: 'Karşı Punta',
  VIDA: 'Vida Açma', BUKME: 'Bükme', KESME: 'Kesme', HIZLAR: 'Hızlar', ELEKTRIK: 'Elektrik', KAYNAK: 'Kaynak',
  MOTORLAR: 'Motorlar', GENEL: 'Genel',
};

// Shared tail; type fields are matched first so e.g. Abkant "UZUNLUK" becomes Bükme Uzunluğu.
const common = [
  f('GENEL', 'Paket Ölçüleri', 'mm', /PAKET.*(OLCU|EBAT|BOYUT)/),
  f('GENEL', 'Makine Ölçüleri', 'mm', /OLCULER|EBATLAR|BOYUTLAR|MAKIN[AE]_(OLCU|EBAT)|DIS_BOYUT|TEZGAHIN_BOYUT|TEZGAH_OLCU|^OLCU/),
  f('GENEL', 'Makine Uzunluğu', 'mm', /^(UZUNLUK|DERINLIK|BOY|MAKIN[AE]_UZUNLUGU)(_MM)?$/),
  f('GENEL', 'Makine Genişliği', 'mm', /^(GEN[IS]+LIK|MAKIN[AE]_GENISLIGI)(_MM)?$/),
  f('GENEL', 'Makine Yüksekliği', 'mm', /^(YUKSEKLIK|MAKIN[AE]_YUKSEKLIGI|H_MAKINENIN_YUKSEKLIGI)(_MM)?$/),
  // Part or load weights are not the machine's weight.
  f('GENEL', 'Makine Ağırlığı', 'kg', /^(?!.*(PARCA|YUK|PAKET)).*AGIRLI/),
  f('GENEL', 'Menşei', '', /MENSEI/),
];
const motor = f('MOTORLAR', 'Ana Motor Gücü', 'kW', /^MOTOR_GUC|ANA_MOTOR_GUC|^ANA_MOTOR$|MIL_MOTORU|^MOTOR_KW$|^MOTOR_GUCU_DEVRI/);

const torna = [
  f('KAPASITE', 'Banko Üstü Çevirme Çapı', 'mm', /BANKO_(USTU|UZERI)|^(MAX_)?CEVIRME_CAPI$/),
  f('KAPASITE', 'Suport Üstü Çevirme Çapı', 'mm', /S[UO]PORT_(USTU|UZERI)|ARABA_UZERI_CAP/),
  f('KAPASITE', 'Köprü Boşluğunda Çevirme Çapı', 'mm', /KOPR.*BOSLU|ARA_PARCA_CIKINCA/),
  f('KAPASITE', 'Puntalar Arası Mesafe', 'mm', /PUNTALAR_ARASI|MERKEZLER_ARASI/),
  f('KAPASITE', 'Banko Genişliği', 'mm', /BANKO_GENISLIGI/),
  f('KAPASITE', 'Maks. İş Parçası Ağırlığı', 'kg', /IS_?PARCASI_AGIRLI|ISPARCASI_AGIRLI/),
  f('FENER_MILI', 'Fener Mili Delik Çapı', 'mm', /FENER_MILI_DELIK|MIL_DELIK_CAPI/),
  f('FENER_MILI', 'Fener Mili Koniği', '', /FENER_MILI_(MORSU|KONIGI)|^MIL_(MORSU|KONIGI)/),
  f('FENER_MILI', 'Fener Mili Ucu', '', /^FENER_MILI(_UCU)?$|^MIL_UCU/),
  f('FENER_MILI', 'Fener Mili Devir Aralığı', 'd/dk', /DEVIR|MIL_HIZ|IS_MILI_DEVIR/),
  f('EKSENLER', 'Enine Suport Hareketi', 'mm', /(ENINE|CAPRAZ)_S[UO]PORT_HAREKETI$|CAPRAZ_SUPORT_HAREKETI|MAKS_(ENINE|CAPRAZ)_(S[UO]PORT_)?HAREKET/),
  f('EKSENLER', 'Üst Suport Hareketi', 'mm', /UST_S[UO]PORT/),
  f('EKSENLER', 'Boyuna İlerleme Aralığı', 'mm/dev', /BOYUNA.*ILERLEME|ARABA.*(ILERLEME|HAREKET_HIZI)|UZUNLAMASINA/),
  f('EKSENLER', 'Enine İlerleme Aralığı', 'mm/dev', /ENINE.*(ILERLEME|HIZI)|CAPRAZ.*(HIZI|BESLEME)/),
  f('EKSENLER', 'Maks. Takım Ölçüsü', 'mm', /TAKIM_OLCU|KATER_OLCU/),
  f('VIDA', 'Metrik Diş Aralığı', 'mm', /METRI[CK]/),
  f('VIDA', 'Inch Diş Aralığı', 'TPI', /INCH|WHITWORTH/),
  f('VIDA', 'Modül Diş Aralığı', 'mod', /MODUL/),
  f('VIDA', 'Diametral Diş Aralığı', 'DP', /DIAMET|^DP_/),
  f('KARSI_PUNTA', 'Karşı Punta Pinol Hareketi', 'mm', /PINOL_HAREKET|KOVAN_HAREKET|PUNTA_MILI_HAREKET|PUNTA_STROKU/),
  f('KARSI_PUNTA', 'Karşı Punta Pinol Koniği', '', /PINOL_(MORSU|KONIGI|UCU)|PUNTA_KONIGI/),
  f('KARSI_PUNTA', 'Karşı Punta Pinol Çapı', 'mm', /PINOL_CAPI|PUNTA_MIL_OLCU/),
  motor,
  f('MOTORLAR', 'Seri Hareket Motor Gücü', 'kW', /RAPID/),
];
const rovelver = [
  f('KAPASITE', 'Pens ile Maks. Tornalama Çapı (Yuvarlak)', 'mm', /PENS.*YUVARLAK/),
  f('KAPASITE', 'Pens ile Maks. Tornalama Çapı (Altıgen)', 'mm', /PENS.*ALTI_KOSE/),
  f('KAPASITE', 'Pens ile Maks. Tornalama Çapı (Kare)', 'mm', /PENS.*KARE/),
  f('KAPASITE', 'Ayna ile Maks. Tornalama Çapı', 'mm', /AYNA_ILE/),
  f('FENER_MILI', 'İş Mili Yüksekliği', 'mm', /IS_MILI_YUKSEKLI/),
  f('FENER_MILI', 'İş Mili Devirleri', 'd/dk', /DEVIR/),
  f('EKSENLER', 'El Suport Açısı', '°', /EL_SPORT_ACISI/),
  f('EKSENLER', 'El Suport Hareketi', 'mm', /EL_SPORT_HAREKETI/),
  f('EKSENLER', 'Çap Suport Hareketi', 'mm', /CAP_SPORT/),
  f('EKSENLER', 'Revolver Başlık Hareketi', 'mm', /BASLIK_HAREKETI/),
  f('EKSENLER', 'Revolver Başlık Delik Çapı', 'mm', /BASLIK_DELIK/),
  f('EKSENLER', 'Düşey Kesici Hareketi', 'mm', /DUSEY_KESICI/),
  motor,
];
const freze = [
  f('TABLA', 'Tabla Ölçüsü', 'mm', /TABLA_(OLCUSU|EBAT)/),
  f('TABLA', 'T Kanal Ölçüsü', '', /T_?KANAL/),
  f('TABLA', 'Fener Mili Ucu – Tabla Arası Mesafe', 'mm', /UCU.*TABLA|IS_MILI.*TABLA_ARASI|TABLA_ARASI_MESAFE/),
  f('TABLA', 'Fener Mili – Kolon Arası Mesafe', 'mm', /(KOLON|SUTUN)_ARASI/),
  f('TABLA', 'Tabla Dönüş Açısı', '°', /TABLA_DONUS/),
  f('EKSENLER', 'X Eksen Hareketi', 'mm', /X_EKSEN_HAREKET/),
  f('EKSENLER', 'Y Eksen Hareketi', 'mm', /Y_EKSEN_HAREKET/),
  f('EKSENLER', 'Z Eksen Hareketi', 'mm', /Z_EKSEN_HAREKET(I)?($|_MANUEL)/),
  f('EKSENLER', 'Ram Hareketi', 'mm', /RAM_HAREKET/),
  f('EKSENLER', 'Kafa Ön-Arka Hareketi', 'mm', /KAFA_ON_ARKA/),
  f('EKSENLER', 'Tabla İlerleme Hızları', 'mm/dk', /TABLA_ILERLEME|SERI_HAREKET|Z_EKSEN_HAREKET_HIZI/),
  f('FENER_MILI', 'Fener Mili Ucu', '', /FENER_MILI_UCU$|(YATAY|DIKEY)_FENER_MILI_UCU/),
  f('FENER_MILI', 'Fener Mili Devir Aralığı', 'd/dk', /FENER_MILI_(HIZI|DEVIR)|^DEVIR$/),
  f('FENER_MILI', 'Pinol Hareketi', 'mm', /PINOL_HAREKET|FENER_MILI_HAREKET/),
  f('FENER_MILI', 'Pinol Çapı', 'mm', /PINOL_CAPI|FENER_MILI_CAPI/),
  f('FENER_MILI', 'Fener Mili Besleme Oranı', 'mm/dev', /BESLEME_ORANI/),
  f('FENER_MILI', 'Kafa Sağ-Sol Dönüş Açısı', '°', /KAFA_SAG_SOL/),
  f('FENER_MILI', 'Kafa Dönüş Açısı', '°', /KAFA.*DONU|KOC_KAFA/),
  f('KAPASITE', 'Delme Kapasitesi', 'mm', /DELME_KAPASITESI/),
  f('KAPASITE', 'Frezeleme Kapasitesi', 'mm', /FREZELEME_KAPASITESI/),
  f('MOTORLAR', 'Fener Mili Motor Gücü', 'kW', /FENER_MILI_MOTOR|^MOTOR_GUCU$|ANA_MOTOR/),
  f('MOTORLAR', 'İlerleme Motor Gücü', 'kW', /Z_EKSEN_MOTOR|ILERLEME_MOTOR/),
  f('MOTORLAR', 'Soğutma Motor Gücü', 'kW', /SOGUTMA_MOTOR/),
];
const matkap = [
  f('KAPASITE', 'Delme Kapasitesi', 'mm', /DELME_KAPASITESI|^KAPASITE|CELIGE|^CELIK$/),
  f('KAPASITE', 'Kılavuz Çekme Kapasitesi', 'mm', /KILAVUZ_CEKME_KAPASITESI|DIS_CEKME/),
  f('KAPASITE', 'Delme Kursu', 'mm', /MIL_INIS|DELME_(KURSU|DERINLIK)|KOVAN_HAREKETI/),
  f('KAPASITE', 'Kol Uzunluğu', 'mm', /KOL_UZUNLU/),
  f('FENER_MILI', 'Fener Mili Koniği', '', /PINOL_UCU|MORS|IS_MILI_KONIGI|FENER_MILI_OLCUSU|SPINDLE_TAPER/),
  f('FENER_MILI', 'Devir Aralığı', 'd/dk', /DEVIR|MIL_HIZ|MOTOR_HIZI|KILAVUZ_CEKME_HIZI/),
  f('TABLA', 'Fener Mili Ucu – Alt Tabla Arası Mesafe', 'mm', /ALT_TABLA_ARASI/),
  f('TABLA', 'Alt Tabla Ölçüsü', 'mm', /ALT_TABLA($|_OLCU)|ALT_KAIDE|ALT_AYAK/),
  f('TABLA', 'Tabla Ölçüsü', 'mm', /CALISMA_TABLA|TABLA_(OLCU|ALANI|KULLANIM)|WORKTABLE_SIZE/),
  f('TABLA', 'T Kanal Ölçüsü', '', /T_?KANAL/),
  f('TABLA', 'Fener Mili Ucu – Tabla Arası Mesafe', 'mm', /(MIL|MILI)_(UCU_)?(ILE_)?TABLA|MANDREN|IS_MILI_TABLA/),
  f('TABLA', 'Fener Mili – Sütun Arası Mesafe', 'mm', /SUTUN_ARASI|SUTUN_MILI|MERKEZ_SUTUN|ILE_SUTUN/),
  f('TABLA', 'Sütun Çapı', 'mm', /SUTUN_CAPI|KOLON_CAPI|COLUMN_DIAMETER/),
  f('MOTORLAR', 'Motor Gücü', 'kW', /MOTOR_GUC|ANA_MOTOR/),
  f('ELEKTRIK', 'Çalışma Gerilimi', 'V', /VOLTAJ|ELEKTRIK/),
];
const taslama = [
  f('TABLA', 'Tabla Ölçüsü', 'mm', /TABLA_(OLCUSU|EBAT)/),
  f('TABLA', 'Tabla Çapı', 'mm', /TABLA_CAPI/),
  f('KAPASITE', 'Maks. Parça Yüksekliği', 'mm', /PARCA_YUKSEKLI/),
  f('KAPASITE', 'Min. Parça Boyutu', 'mm', /MIN_PARCA/),
  f('KAPASITE', 'Taş Ölçüsü', 'mm', /TAS_(OLCU|CAPI)/),
  f('KAPASITE', 'Başlık Sayısı', 'adet', /BASLIK_SAYISI/),
  f('KAPASITE', 'Vakumlu Çalışma Alanı', 'mm', /VAKUMLU/),
  f('MOTORLAR', 'Vakum Gücü', 'kW', /VAKUM_GUCU/),
  f('MOTORLAR', 'Toz Emme Kapasitesi', 'm³/h', /TOZ_EMME/),
  f('MOTORLAR', 'Motor Gücü', 'kW', /MOTOR_GUC|TOPLAM_GUC/),
];
const testere = [
  f('KESME', 'Kesim Açısı', '°', /KESIM_ACI/),
  f('KESME', 'Kesme Kapasitesi 90°', 'mm', /90|KAPASITESI_0$/),
  f('KESME', 'Kesme Kapasitesi 45°', 'mm', /45/),
  f('KESME', 'Kesme Kapasitesi 60°', 'mm', /60/),
  f('KESME', 'Testere Ölçüsü', 'mm', /SERIT_OLCU|TESTERE_BICAGI|^TESTERE$/),
  f('KESME', 'Testere Devri', 'm/dk', /TESTERE_DEVRI|^HIZ$|^KADEME$/),
  f('KESME', 'Kafa İniş / Besleme', '', /KAFA_INIS/),
  motor,
  f('ELEKTRIK', 'Gerilim', 'V', /GERILIM/),
  f('ELEKTRIK', 'Frekans', 'Hz', /FREKANS/),
];
const pres = [
  f('KAPASITE', 'Pres Kapasitesi', 'ton', /BASMA_GUCU|BASINC_TONAJI|^KAPASITE$/),
  f('KAPASITE', 'Vuruş Sayısı', 'vuruş/dk', /VURUS|STROK_SAYISI|DAKIKADAKI_STROK/),
  f('KAPASITE', 'Strok', 'mm', /STROK|^KURS$/),
  f('KAPASITE', 'Maks. Çalışma Basıncı', 'bar', /CALISMA_BASINCI/),
  f('TABLA', 'Tabla Ölçüsü', 'mm', /TABLA_(EBA|OLCU)/),
  f('TABLA', 'Tabla – Koç Arası Mesafe', 'mm', /TABLA_(VE_)?KOC/),
  f('TABLA', 'Boğaz Derinliği', 'mm', /BOGAZ/),
  f('TABLA', 'Tabla Delik Çapı', 'mm', /TABLA_DELIK/),
  f('TABLA', 'Koç Delik Çapı', 'mm', /KOC_DELIK/),
  f('TABLA', 'Kolonlar Arası Mesafe', 'mm', /KOLONLAR_ARASI/),
  f('TABLA', 'T Kanal Ölçüsü', '', /T_?KANAL/),
  f('HIZLAR', 'İniş Hızı', 'mm/s', /INIS_HIZI/),
  f('HIZLAR', 'Çalışma Hızı', 'mm/s', /^IS_HIZI$/),
  f('HIZLAR', 'Geri Dönüş Hızı', 'mm/s', /GERI_DONUS/),
  f('GENEL', 'Piston Kol Çapı', 'mm', /PISTON/),
  f('GENEL', 'Gövde Yapısı', '', /GOVDE/),
  motor,
  f('MOTORLAR', 'Motor Devri', 'd/dk', /MOTOR_DEVRI/),
];
const planya = [
  f('KAPASITE', 'Kurs Boyu', 'mm', /KURS_BOYU/),
  f('KAPASITE', 'Koç Devri', 'strok/dk', /KOC_DEVRI/),
  f('KAPASITE', 'Koç Eğim Açısı', '°', /KOC_EGIM/),
  f('KAPASITE', 'Maks. Parça Ağırlığı', 'kg', /PARCA_AGIRLI/),
  f('TABLA', 'Tabla – Koç Arası Mesafe', 'mm', /TABLA_VE_KOC/),
  f('TABLA', 'Divizör Tabla Çapı', 'mm', /DIVIZOR_TABLA/),
  f('TABLA', 'Divizör Dönüş Hassasiyeti', '', /DIVIZOR_DONUS/),
  f('TABLA', 'Tabla Dönerliği', '°', /TABLA_DONERLI/),
  f('EKSENLER', 'X Eksen Hareketi', 'mm', /BOYUNA_X/),
  f('EKSENLER', 'Y Eksen Hareketi', 'mm', /ENINE_Y/),
  f('EKSENLER', 'Otomatik Besleme', '', /OTOMATIK_BESLEME/),
  f('EKSENLER', 'Takım Tutucu Dönüş Açısı', '°', /TAKIM_TUTUCU/),
  motor,
  f('MOTORLAR', 'Ana Motor Devri', 'd/dk', /ANA_MOTOR_DEVRI/),
];
const edm = [
  f('TABLA', 'Tabla Ölçüsü', 'mm', /TABLA_(EBAT|OLCU)/),
  f('TABLA', 'Maks. İş Parçası Ağırlığı', 'kg', /IS_PARCASI_AGIRLI/),
  f('EKSENLER', 'X / Y Eksen Hareketi', 'mm', /X_Y_EKSEN/),
  f('EKSENLER', 'Z Eksen Hareketi', 'mm', /Z_EKSEN/),
  f('EKSENLER', 'Kafa Servo Hareketi', 'mm', /KAFA_SERVO/),
  f('EKSENLER', 'Kafa Dönme Hareketi', '°', /KAFA_DONME/),
  f('KAPASITE', 'Delme Hızı', 'mm/dk', /DELME_HIZI/),
  f('KAPASITE', 'Elektrot Çapı', 'mm', /ELECTROD|ELEKTROT/),
  f('ELEKTRIK', 'Maks. İşleme Akımı', 'A', /AKIM/),
  f('ELEKTRIK', 'Maks. Güç', 'kVA', /VERILEN_GUC/),
  f('GENEL', 'Tank Kapasitesi', 'L', /TANK/),
  f('GENEL', 'Su Basıncı', 'bar', /SU_BASINCI/),
];
const abkant = [
  f('BUKME', 'Bükme Uzunluğu', 'mm', /^UZUNLU|BUKME_UZUNLU|^CALISMA_BOYU$/),
  f('BUKME', 'Bükme Kalınlığı', 'mm', /BUKME_KALINLI/),
  f('BUKME', 'Bükme Kuvveti', 'ton', /^BASINC$|BASKI_TONAJI|BUKME_GUCU/),
  f('BUKME', 'Ayaklar Arası Mesafe', 'mm', /AYAKLAR_ARASI/),
  f('BUKME', 'Boğaz Derinliği', 'mm', /BOGAZ/),
  f('BUKME', 'Ayarlanabilir Strok', 'mm', /AYARLANABILIR_STROK/),
  f('BUKME', 'Strok', 'mm', /STROK|KURSU/),
  f('BUKME', 'Çene Açıklığı', 'mm', /CENE_ACIKLI/),
  f('BUKME', 'Tabla Genişliği', 'mm', /TABLA_GENISLI/),
  f('BUKME', 'Ayak Genişliği', 'mm', /AYAK_GENISLI/),
  f('BUKME', 'Alt Çene Yüksekliği', 'mm', /ALT_CENE/),
  f('HIZLAR', 'İniş Hızı', 'mm/s', /INIS|INME_HIZI/),
  f('HIZLAR', 'Bükme Hızı', 'mm/s', /^BASMA$|BUKME_HIZI/),
  f('HIZLAR', 'Kalkış Hızı', 'mm/s', /KALKIS/),
  f('EKSENLER', 'X Ekseni', 'mm', /^X_?EKSENI$/),
  f('EKSENLER', 'R Ekseni', 'mm', /^R_?EKSENI$/),
  f('EKSENLER', 'Z Ekseni', '', /^Z_?EKSENI$/),
  f('EKSENLER', 'Arka Dayama Mesafesi', 'mm', /DAYAMA(_MESAFE|_ACIKLI|_UZUNLU|$)/),
  f('EKSENLER', 'Eksen Hareket Hızı', 'mm/s', /HAREKET_HIZI|^HIZ$/),
  f('EKSENLER', 'Pozisyon Hassasiyeti', 'mm', /POZISYON/),
  f('EKSENLER', 'Kontrol Ünitesi', '', /KONTROL_TIPI/),
  f('EKSENLER', 'Kontrol Edilen Eksenler', '', /KONTROL_EDILEBILEN/),
  f('MOTORLAR', 'Motor Gücü', 'kW', /^MOTOR_GUCU$/),
  f('MOTORLAR', 'Yağ Tankı Kapasitesi', 'L', /YAG_(DEPO|TANK)/),
];
const giyotin = [
  f('KESME', 'Kesme Boyu', 'mm', /KESME_(BOYU|UZUNLUK)|^CALISMA_BOYU|^TABLA_BOYU$/),
  f('KESME', 'Kesme Kalınlığı', 'mm', /KESME_KALINLI|^KAPASITE/),
  f('KESME', 'Kesme Kapasitesi', '', /KESME_KAPASITESI/),
  f('KESME', 'Kesme Açısı', '°', /KESME_ACISI/),
  f('KESME', 'Köşe Açısı', '°', /KOSE_ACISI/),
  f('KESME', 'Strok Sayısı', 'strok/dk', /STROK/),
  f('KESME', 'Baskı Sayısı', 'adet', /BASKI_SAYISI/),
  f('KESME', 'Arka Dayama Açıklığı', 'mm', /ARKA_DAYAMA_(ACIKLI|UZUNLU)/),
  f('KESME', 'Üst Bıçak', '', /UST_BICAK/),
  f('KESME', 'Alt Bıçak', '', /ALT_BICAK/),
  f('KESME', 'Tabla Ölçüsü', 'mm', /TABLA_EBAT|TABLE_DIMENSIONS/),
  f('MOTORLAR', 'Motor Gücü', 'kW', /^MOTOR_(GUCU|KW)$/),
  f('MOTORLAR', 'Arka Dayama Motoru', 'kW', /ARKA_DAYAMA_MOTOR/),
  f('MOTORLAR', 'Yağ Tankı Kapasitesi', 'L', /YAG_TANK/),
];
const boruBukme = [
  f('BUKME', 'Maks. Boru Çapı', 'mm', /BORU_CAPI/),
  f('BUKME', 'Maks. Boru Et Kalınlığı', 'mm', /ET_KALINLI/),
  f('BUKME', 'Maks. Büküm Yarıçapı', 'mm', /BUKUM_YARICAP/),
  f('BUKME', 'Maks. Büküm Açısı', '°', /BUKUM_DERECE|BENDING_ANGLE/),
  f('BUKME', 'Büküm Hızı', '°/sn', /BUKUM_HIZI/),
  f('BUKME', 'Çalışma Uzunluğu', 'mm', /CALISMA_(UZUNLU|BOYU)/),
  f('BUKME', 'Kapasite', 'mm', /^KAPASITE/),
  f('MOTORLAR', 'Motor Gücü', 'kW', /MOTOR_GUC/),
];
const kaynak = [
  f('ELEKTRIK', 'Şebeke Gerilimi', 'V', /SEBEKE_GERILIMI/),
  f('ELEKTRIK', 'Şebekeden Çekilen Güç', 'kVA', /GIRIS_GUCU|SEBEKEDEN_CEKILEN_GUC/),
  f('ELEKTRIK', 'Şebekeden Çekilen Akım', 'A', /PRIMER_AKIM|SEBEKEDEN_CEKILEN_AKIM/),
  f('ELEKTRIK', 'Sigorta', 'A', /SIGORTA/),
  f('KAYNAK', 'Akım Ayar Aralığı', 'A', /AKIM_AYAR/),
  f('KAYNAK', 'Kaynak Akımı (%60)', 'A', /60_REJIM|ANMA_KAYNAK_AKIMI/),
  f('KAYNAK', 'Kaynak Akımı (%40)', 'A', /40_REJIM/),
  f('KAYNAK', 'Açık Devre Gerilimi', 'V', /ACIK_DEVRE/),
  f('KAYNAK', 'Gerilim Kademe Sayısı', 'adet', /KADEME_SAYISI/),
  f('KAYNAK', 'Tel Çapı (Çelik)', 'mm', /CELIK_VE_ALASIMSIZ|^TEL_CAPI$/),
  f('KAYNAK', 'Tel Çapı (Alüminyum)', 'mm', /^ALUMINYUM$/),
  f('KAYNAK', 'Tel Çapı (Özlü)', 'mm', /OZLU/),
  f('KAYNAK', 'Elektrot Çapı', 'mm', /ELEKTRO[DT]_CAPI/),
  f('KAYNAK', 'Elektrot Tipi', '', /ELEKTROT_TIPI/),
  f('KAYNAK', 'Tel Sürme Hızı', 'm/dk', /TEL_SURME_HIZI/),
  f('KAYNAK', 'Tel Sürme Makarası', '', /TEL_SURME_MAKARA/),
  f('KAYNAK', 'Torç Soğutma', '', /TORC_SOGUTMA|SOGUTMA_GUCU/),
  f('GENEL', 'Koruma Sınıfı', '', /KORUMA_SINIFI/),
  f('GENEL', 'İzolasyon Sınıfı', '', /IZOLASYON/),
];
const lazerKaynak = [
  f('KAYNAK', 'Lazer Gücü', 'W', /CIKIS_GUCU|^GUC$/),
  f('KAYNAK', 'Dalga Boyu', 'nm', /DALGA_BOYU/),
  f('KAYNAK', 'Çalışma Modu', '', /CALISMA_MODU/),
  f('KAYNAK', 'Salınım Genişliği', 'mm', /SALINIM/),
  f('KAYNAK', 'Kaynak Hızı', 'mm/s', /KAYNAK_HIZI/),
  f('KAYNAK', 'Kaynak Dikişi Toleransı', 'mm', /DIKIS/),
  f('KAYNAK', 'Çalışma Fonksiyonları', '', /FONKSIYON/),
  f('KAYNAK', 'Parametre Hafızası', '', /HAFIZA/),
  f('GENEL', 'Soğutma Tipi', '', /SOGUTMA_(TIPI|YONTEMI)/),
  f('GENEL', 'Çalışma Sıcaklığı', '°C', /SICAKLIK/),
  f('GENEL', 'Port Tipi', '', /PORT_TIPI/),
  f('ELEKTRIK', 'Çalışma Gerilimi', 'V', /VOLTAJ/),
];
const kompresor = [
  f('KAPASITE', 'Çalışma Basıncı', 'bar', /BASINC/),
  f('KAPASITE', 'Depo Hacmi', 'L', /DEPO|TANK/),
  f('KAPASITE', 'Hava Debisi', 'L/dk', /DEBI|HAVA_VERIMI/),
  motor,
];
const tasima = [
  f('KAPASITE', 'Taşıma Kapasitesi', 'kg', /(TASIMA|KALDIRMA)_KAPASITESI/),
  f('KAPASITE', 'Maks. Kaldırma Yüksekliği', 'mm', /KALDIRMA_YUKSEKLI/),
  f('KAPASITE', 'Min. Çatal Yüksekliği', 'mm', /CATAL_YUKSEKLI/),
  f('KAPASITE', 'Çatal Genişliği', 'mm', /CATAL_GENISLI/),
  f('KAPASITE', 'Çatal Uzunluğu', 'mm', /CATAL_UZUNLU/),
  f('GENEL', 'Çalışma Tipi', '', /CALISMA_TIPI/),
  f('GENEL', 'Tekerlek Yapısı', '', /TEKERLEK/),
];
const sacKapasite = [
  f('KAPASITE', 'Kapasite', 'mm', /^KAPASITE|KESME_KAPASITE|KESME_KALINLI/),
  f('KAPASITE', 'Kesme Çapı', 'mm', /KESME_CAPI/),
  f('KAPASITE', 'Delme Kapasitesi', 'mm', /DELME/),
  f('KAPASITE', 'Büküm Açısı', '°', /BENDING_ANGLE|ACI/),
  f('KAPASITE', 'Çalışma Boyu', 'mm', /CALISMA_BOYU/),
  f('KAPASITE', 'Boru Çapı', 'mm', /BORU_CAPI/),
  motor,
];
const plazma = [
  f('EKSENLER', 'X Ekseni', 'mm', /^X_?EKSENI$/),
  f('EKSENLER', 'Y Ekseni', 'mm', /^Y_?EKSENI$/),
  f('EKSENLER', 'Pozisyonlama Hızı', 'm/dk', /POZISYON_?LAMA_HIZI/),
  f('EKSENLER', 'Mekanik Hassasiyet', 'mm', /HASSASIYET/),
];
const mengene = [f('KAPASITE', 'Çene Genişliği', 'mm', /CENE?L?_GENISLI/), f('KAPASITE', 'Açma Mesafesi', 'mm', /ACMA_MESAFE|ACILMA_MESAFE/),
  f('KAPASITE', 'Çene Yüksekliği', 'mm', /CENE_YUKSEKLI/)];

const templates: Array<[RegExp, SpecField[]]> = [
  [/^HM_UNIVERSAL_(UNIVERSAL|MASAUSTU)_TORNA|^UNIVERSAL_TORNA$/, torna],
  [/^HM_UNIVERSAL_ROVELVER/, rovelver],
  [/^HM_UNIVERSAL_(KALIPCI|UNIVERSAL|MATKAP)_FREZE|^UNIVERSAL_FREZE$/, freze],
  [/^HM_UNIVERSAL_(MASAUSTU|SUTUNLU|SANZIMANLI|RADYAL)_MATKAP|^HM_UNIVERSAL_KILAVUZ|^RADYAL_MATKAP$|^HM_HIRDAVAT_MANYETIK_MATKAP/, matkap],
  [/^HM_UNIVERSAL_(ALET_BILEME|SATIH_TASLAMA|DONER_TABLALI|ZIMPARA)|^SATIH_TASLAMA$|^HM_HIRDAVAT_TAS_MOTOR/, taslama],
  [/^HM_UNIVERSAL_SERIT_TESTERE|^HM_SAC_ISLEME_DAIRE_TESTERE/, testere],
  [/^HM_UNIVERSAL_H_TIPI|^HM_SAC_ISLEME_(EKSANTRIK|CNC_PANC)/, pres],
  [/^HM_UNIVERSAL_DIK_PLANYA/, planya],
  [/^HM_UNIVERSAL_(ELEKTRO|DELIK_DELME)_EREZYON/, edm],
  [/^ABKANT_PRES$/, abkant],
  [/^GIYOTIN_MAKAS$|^HM_SAC_ISLEME_(HIDROLIK_KOSE|KOMBINE)/, giyotin],
  [/^HM_SAC_ISLEME_BORU_PROFIL|^SILINDIR_MAKINESI$/, boruBukme],
  [/^HM_SAC_ISLEME_(CAKA|KORDON|DAIRE_KESME|KURTAGZI)/, sacKapasite],
  [/^PLAZMA_KESIM$/, plazma],
  [/^HM_KAYNAK_LAZER/, lazerKaynak],
  [/^HM_KAYNAK_/, kaynak],
  [/^HM_HAVA_/, kompresor],
  [/^HM_TASIMA_/, tasima],
  [/^HM_HIRDAVAT_MENGENE/, mengene],
];

/** Fields for a type, or undefined when the type keeps its existing template (CNC, laser, plain accessories). */
export function specTemplateFor(typeCode: string): SpecField[] | undefined {
  const fields = templates.find(([pattern]) => pattern.test(typeCode))?.[1];
  return fields ? [...fields, ...common] : undefined;
}

const headerKeys = /^(TEKNIK_(BILGILER|OZELLIKLER)|TEZGAH_OZELLIKLERI|OZELLIK_TECHNICAL_SPECIFICATION|KAPASITE_CAPACITY|NOT|DIM|WEIGHT|[A-Z])$|^(GENEL_OZELLIKLERI|STANDART_DONANIM_)/;
/** Table titles and one-letter drawing labels are layout, not values. Long keys are equipment prose (kept in the description). */
export function isLayoutSpec(key: string, value: string): boolean {
  const k = haksanNormal(key);
  return !k || headerKeys.test(k) || key.length > 80 || /^(BIRIM|DEGER|-)$/i.test(value.trim());
}

/** Value without the template's unit suffix ("1250 MM" + mm → "1250"); other text is left as printed. */
export function stripUnit(value: string, unit: string): string {
  if (!unit) return value.trim();
  const escaped = unit.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return value.trim().replace(new RegExp(`\\s*${escaped}\\.?$`, 'i'), '').trim();
}

export function canonicalSpecs(typeCode: string, specs: ReadonlyArray<{ key: string; value: string; unit: string }>) {
  const fields = specTemplateFor(typeCode);
  const used = new Set<string>();
  // Same length and order as the source rows, so callers can pair each result with what was scraped.
  return specs.map(spec => {
    if (isLayoutSpec(spec.key, spec.value)) return { key: spec.key, value: spec.value, unit: spec.unit, group: 'GENEL', canonical: false, layout: true };
    const k = haksanNormal(spec.key);
    const field = fields?.find(candidate => !used.has(candidate.key) && candidate.match?.test(k));
    if (!field) return { key: spec.key, value: spec.value, unit: spec.unit, group: 'GENEL', canonical: false, layout: false };
    used.add(field.key);
    const value = stripUnit(spec.value, field.unit);
    // "1.5 HP" under a kW field keeps its own unit instead of reading "1.5 HP kW".
    const ownUnit = /\d\s*[A-Za-zÇĞİÖŞÜçğıöşü°%/]+\.?$/.test(value);
    return { key: field.key, value, unit: ownUnit ? '' : field.unit, group: field.group, canonical: true, layout: false };
  });
}
