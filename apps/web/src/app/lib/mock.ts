export type Role = "SuperAdmin" | "Admin" | "Sales" | "Service";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  active: boolean;
  avatarUrl?: string;
  purchaseApprovalLimit?: number;
  managerId?: string;
};

export type FirmType = "customer" | "supplier_customer" | "supplier";
export type CustomerSalesStatus = "potential" | "active_customer";

export type Customer = {
  id: string;
  type: "person" | "company";
  firmType: FirmType;
  salesStatus?: CustomerSalesStatus;
  companyGroupCode?: string;
  companyGroupName?: string;
  contactSourceCode?: string;
  sector?: string;
  name: string;
  contactPerson: string;
  phone: string;
  phone2?: string;
  fax?: string;
  email: string;
  email2?: string;
  city: string;
  district?: string;
  country?: string;
  address: string;
  taxOffice?: string;
  taxNumber: string;
  website?: string;
  wantedProduct: string;
  initialNote: string;
  source: string;
  status: "active" | "passive";
  createdAt: string;
};

export type Contact = {
  id: string;
  customerId: string;
  name: string;
  title: string;
  department: string;
  phone: string;
  phoneExtension?: string;
  mobilePhone?: string;
  otherPhone?: string;
  email: string;
  personalEmail?: string;
  otherEmail?: string;
  gender?: string;
  birthDate?: string;
  decisionRoleCode?: string;
  decisionRoleName?: string;
  hometown?: string;
  favoriteTeam?: string;
  knownIllness?: string;
  favoriteColor?: string;
  graduatedSchool?: string;
  politicalView?: string;
  isPrimary: boolean;
  note?: string;
};

export type SalesStage =
  | "lead"
  | "sales"
  | "call"
  | "visit"
  | "cancelled"
  | "quote"
  | "proforma"
  | "contract"
  | "commercial_invoice"
  | "customs_approved"
  | "stock_picking"
  | "shipping"
  | "installation"
  | "delivered"
  | "Lead"
  | "Initial Contact"
  | "Requirement Analysis"
  | "Offer Preparing"
  | "Offer Sent"
  | "Follow-up"
  | "Offer Approved"
  | "Proforma / Contract"
  | "Customs"
  | "Shipment"
  | "Installation"
  | "Completed"
  | "Lost";

export const SALES_STAGES: SalesStage[] = [
  "lead",
  "sales",
  "call",
  "visit",
  "cancelled",
  "quote",
  "proforma",
  "contract",
  "commercial_invoice",
  "customs_approved",
  "stock_picking",
  "shipping",
  "installation",
  "delivered",
];

export const SALES_STAGE_LABELS: Record<SalesStage, string> = {
  lead: "Lead",
  sales: "Satış",
  call: "Arama",
  visit: "Ziyaret",
  cancelled: "İptal",
  quote: "Teklif",
  proforma: "Proforma",
  contract: "Sözleşme",
  commercial_invoice: "Ticari Fatura",
  customs_approved: "Gümrük Onayı",
  stock_picking: "Stok Seçimi",
  shipping: "Sevkiyat",
  installation: "Kurulum",
  delivered: "Teslim Edildi",
  Lead: "Lead",
  "Initial Contact": "İlk Temas",
  "Requirement Analysis": "İhtiyaç Analizi",
  "Offer Preparing": "Teklif Hazırlanıyor",
  "Offer Sent": "Teklif Gönderildi",
  "Follow-up": "Takip",
  "Offer Approved": "Teklif Onaylandı",
  "Proforma / Contract": "Proforma / Sözleşme",
  Customs: "Gümrük",
  Shipment: "Sevkiyat",
  Installation: "Kurulum",
  Completed: "Tamamlandı",
  Lost: "Kaybedildi",
};

export const salesStageLabel = (stage: string) => SALES_STAGE_LABELS[stage as SalesStage] ?? stage;

export type SalesCase = {
  id: string;
  customerId: string;
  assignedUserId: string;
  department: string;
  requestedProduct: string;
  requestedModel: string;
  quantity: number;
  estimatedAmount: number;
  currency: "USD" | "EUR" | "TRY";
  stage: SalesStage;
  isOfferPrepared: boolean;
  isLost: boolean;
  lostReason?: string;
  competitor?: string;
  createdAt: string;
  closedAt?: string;
};

export type Activity = {
  id: string;
  salesCaseId: string;
  customerId: string;
  type: string;
  title: string;
  note: string;
  date: string;
  byUserId: string;
};

export type Offer = {
  id: string;
  salesCaseId: string;
  companyId?: string;
  quoteNo: string;
  revision: number;
  date: string;
  validityDays?: number;
  amount: number;
  currency: "USD" | "EUR" | "TRY";
  status: "Draft" | "Sent" | "Approved" | "Rejected";
  note: string;
};

export type DocumentItem = {
  id: string;
  salesCaseId: string;
  companyId?: string;
  type:
    | "Proforma"
    | "Contract"
    | "CommercialInvoice"
    | "AccountingInvoice"
    | "DeliveryForm"
    | "InstallationForm"
    | "Other";
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  size: string;
  fileId?: string;
  mimeType?: string;
};

export type Payment = {
  id: string;
  salesCaseId: string;
  customerId: string;
  paymentType: "received" | "expected";
  amount: number;
  currency: "USD" | "EUR" | "TRY";
  dueDate: string;
  paidDate?: string;
  status: "Pending" | "Paid" | "Overdue" | "Cancelled";
  note: string;
};

export type StockItem = {
  id: string;
  brand: string;
  counterType: string;
  counterModel: string;
  serialNumber: string;
  controlPanel: string;
  stockCode: string;
  warehouse: string;
  status: "Available" | "Reserved" | "Sold" | "Inactive";
};

export type ProductSpec = { key: string; value: string };

export type Product = {
  id: string;
  brand: string;
  productGroup?: string;
  productGroupCode?: string;
  model: string;
  modelName?: string;
  type: string;
  productTypeCode?: string;
  controlPanel: string;
  category: string;
  categoryCode?: string;
  subcategory?: string;
  subcategoryCode?: string;
  imageUrl: string;
  shortDescription: string;
  description: string;
  listPrice: number;
  cashPrice?: number;
  currency: "USD" | "EUR" | "TRY";
  vatRate?: number;
  originCountry?: string;
  hsCode?: string;
  stockCode?: string;
  specs: ProductSpec[];
  standardEquipment: string[];
  optionalEquipment: string[];
  // Bu ürünün muadili (eşdeğer) olarak işaretlenen başka bir ürünün id'si.
  muadilProductId?: string | null;
  status: "active" | "passive";
  pdfUrl?: string;
};

export const products: Product[] = [
  {
    id: "p1", brand: "Acme", model: "X-200", type: "Endüstriyel Sayaç", controlPanel: "CP-Pro",
    category: "Endüstriyel", imageUrl: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800",
    shortDescription: "Yüksek doğruluklu endüstriyel sayaç",
    description: "Acme X-200, ağır sanayi koşulları için tasarlanmış yüksek doğruluk sınıfı endüstriyel sayaçtır.",
    listPrice: 6000, currency: "EUR",
    specs: [
      { key: "Ölçüm Aralığı", value: "0 – 1000 m³/h" },
      { key: "Doğruluk", value: "±0.5%" },
      { key: "Çalışma Sıcaklığı", value: "-20°C / +80°C" },
      { key: "Bağlantı", value: "DN50 – DN300 Flanş" },
      { key: "Koruma Sınıfı", value: "IP67" },
      { key: "Güç", value: "24V DC" },
    ],
    standardEquipment: ["Dijital ekran", "Modbus RTU çıkışı", "Pals çıkışı", "Kalibrasyon sertifikası"],
    optionalEquipment: ["Kablosuz haberleşme modülü", "Yüksek sıcaklık seti", "Paslanmaz gövde"],
    status: "active",
  },
  {
    id: "p2", brand: "Acme", model: "X-100", type: "Hafif Sayaç", controlPanel: "CP-Lite",
    category: "Hafif", imageUrl: "https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?w=800",
    shortDescription: "Kompakt ve ekonomik hafif sayaç",
    description: "Acme X-100, küçük ve orta ölçekli tesisler için ekonomik bir çözüm sunar.",
    listPrice: 3200, currency: "EUR",
    specs: [
      { key: "Ölçüm Aralığı", value: "0 – 250 m³/h" },
      { key: "Doğruluk", value: "±1.0%" },
      { key: "Bağlantı", value: "DN25 – DN100" },
      { key: "Koruma Sınıfı", value: "IP65" },
    ],
    standardEquipment: ["LCD ekran", "Pals çıkışı", "Montaj seti"],
    optionalEquipment: ["Modbus modülü", "Sıcaklık sensörü"],
    status: "active",
  },
  {
    id: "p3", brand: "Acme", model: "X-300", type: "Yüksek Kapasite", controlPanel: "CP-Pro",
    category: "Yüksek Kapasite", imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800",
    shortDescription: "Büyük debiler için yüksek kapasite sayacı",
    description: "Acme X-300, yüksek hacimli proses hatları için tasarlanmıştır.",
    listPrice: 12500, currency: "EUR",
    specs: [
      { key: "Ölçüm Aralığı", value: "0 – 5000 m³/h" },
      { key: "Doğruluk", value: "±0.3%" },
      { key: "Bağlantı", value: "DN200 – DN600" },
      { key: "Koruma Sınıfı", value: "IP68" },
    ],
    standardEquipment: ["Dokunmatik ekran", "Modbus TCP", "Veri kayıt modülü"],
    optionalEquipment: ["GSM modem", "Çift yönlü ölçüm seti"],
    status: "active",
  },
  {
    id: "p5", brand: "Ecoca", model: "MT-208/500", type: "CNC Torna Tezgahı", controlPanel: "FANUC 0i-TF Plus",
    category: "CNC Torna", imageUrl: "https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?w=800",
    shortDescription: "8\" aynalı, 10 istasyon hidrolik taretli CNC torna",
    description: "Ecoca MT-208/500, MEEHANITE mukavemetli monoblok eğik bankolu döküm gövde, hidrostatik sürtünmeli kutu kızak ve FANUC 0i-TF Plus kontrol ünitesiyle hassas tornalama operasyonları için tasarlanmıştır.",
    listPrice: 68300, currency: "USD",
    specs: [
      { key: "Ayna Ölçüsü", value: "8\"" },
      { key: "Maks. Çevirme Kapasitesi", value: "Ø 525 mm" },
      { key: "Maks. Tornalama Çapı", value: "Ø 384 mm" },
      { key: "Maks. Tornalama Boyu", value: "500 mm" },
      { key: "Maks. Çubuk İşleme Çapı", value: "Ø 52 mm" },
      { key: "Fener Mili Devri", value: "4.800 dv/dk" },
      { key: "Fener Mili Motor Gücü", value: "22 kW" },
      { key: "Fener Mili Standardı", value: "A2-06" },
      { key: "Fener Mili Delik Çapı", value: "Ø 62 mm" },
      { key: "X / Z Eksen Hareketi", value: "185 / 537 mm" },
      { key: "X / Z Boşta İlerleme", value: "24.000 mm/dk" },
      { key: "Taret Tipi", value: "Hidrolik 10 İstasyon" },
      { key: "Maks. Kare Takım", value: "25 x 25 mm" },
      { key: "Karşı Punta Pinol Koniği", value: "MT-4" },
      { key: "Toplam Güç Gereksinimi", value: "30 kW" },
      { key: "Soğutma Sıvısı Tankı", value: "125 lt" },
      { key: "Tezgah Ağırlığı", value: "4.300 kg" },
    ],
    standardEquipment: [
      "FANUC 0i-TF Plus CNC Kontrol Ünitesi",
      "10,4\" LCD/TFT Renkli Ekran",
      "Ethernet & RS-232 Bağlantı",
      "CF Kart & USB Yuvası",
      "C-3 Kalitesinde Ön Gerilimli Vidalı Miller",
      "X, Z Eksenler Hidrostatik Kutu Kızak",
      "MEEHANITE Monoblok Eğik Banko Döküm Gövde",
      "Hidrolik 10 İstasyon Taret",
      "RENISHAW Tam Otomatik Takım Ölçme Kolu",
      "8\" (Ø200 mm) 3 Ayaklı Hidrolik Ayna",
      "Hidrolik Programlanabilir Karşı Punta",
      "Tam Kapalı Kabin & Güvenli Camlar",
      "Kabin İçi Aydınlatma & 3 Renkli Alarm Lambası",
      "Programlanabilir Merkezi Yağlama Sistemi",
      "Paslanmaz Teleskopik Kızak Koruyucu",
      "Bant Tipi Talaş Helezonu & Talaş Arabası",
      "El Çarkı (MPG)",
      "Elektrik Kabini Isı Dengeleme",
      "Yumuşak Ayak Seti (5 Takım)",
      "Sert Ayak / Döner Punta / Mors Konik Setleri",
      "1 Yıl Mekanik + 2 Yıl FANUC Garantisi",
    ],
    optionalEquipment: [],
    status: "active",
  },
  {
    id: "p6", brand: "LK", model: "MV-1050", type: "CNC Dik İşleme Merkezi", controlPanel: "MITSUBISHI M80",
    category: "CNC İşleme Merkezi", imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800",
    shortDescription: "1050 mm X eksenli, BT-40 12.000 dv/dk fener mili",
    description: "LK MV-1050, lineer kızak yapısı ve direkt aktarma 12.000 dv/dk fener miliyle yüksek hız ve hassasiyet sunan kompakt dik işleme merkezidir.",
    listPrice: 72000, currency: "USD",
    specs: [
      { key: "Tabla Ölçüsü", value: "1.250 x 600 mm" },
      { key: "T Slot", value: "18 x 100 x 5" },
      { key: "Tabla Yükleme Kapasitesi", value: "800 kg" },
      { key: "Tabla ~ Fener Mili Mesafesi", value: "150 ~ 760 mm" },
      { key: "X / Y / Z Eksen Hareketi", value: "1.050 / 600 / 610 mm" },
      { key: "X-Y Boşta İlerleme", value: "48.000 mm/dk" },
      { key: "Z Boşta İlerleme", value: "36.000 mm/dk" },
      { key: "Pozisyonlama Hassasiyeti", value: "0,017 / 300 mm" },
      { key: "Tekrarlama Hassasiyeti", value: "± 0,005 mm" },
      { key: "Fener Mili Standardı", value: "BT-40" },
      { key: "Fener Mili Devri", value: "12.000 dv/dk" },
      { key: "Fener Mili Aktarması", value: "Direkt" },
      { key: "Fener Mili Motor Gücü", value: "15 kW (20 hp)" },
      { key: "Takım Kapasitesi", value: "24 Adet (Kol Tipi)" },
      { key: "Maks. Takım Ağırlık / Boy / Çap", value: "7 kg / 250 mm / Ø75 (Ø150)" },
      { key: "Takım Değiştirme Süresi", value: "2,3 sn" },
      { key: "Toplam Güç", value: "380 V / 50 Hz / 30 kW" },
      { key: "Tezgah Ağırlığı", value: "6.000 kg" },
    ],
    standardEquipment: [
      "MITSUBISHI M80 CNC Kontrol Ünitesi",
      "15,4\" LCD/TFT Renkli Dokunmatik Ekran",
      "SSS (Super Smooth Surface) Fonksiyonu",
      "Diyalog Programlama, Türkçe Dil",
      "Ethernet & RS-232 Bağlantı",
      "SD Kart & USB Yuvası",
      "X, Y, Z Lineer Kızaklar",
      "C-3 Kalitesinde Vidalı Miller",
      "MEHANITE Hassas Döküm Gövde",
      "Tam Kapalı Kabin & Yıkama Sistemi",
      "Fener Mili Yağ Soğutma & Hava Perdeleme",
      "Fener Mili Ucundan Basınçlı Kesme Sıvısı",
      "Kabin İçi LED Aydınlatma x 2",
      "Programlanabilir Merkezi Yağlama",
      "Paslanmaz Teleskopik Kızak Koruyucu",
      "Vidalı Tip Talaş Helezonu & Talaş Arabası",
      "Takım Değiştirici Yedek Hava Deposu",
      "El Çarkı (MPG)",
      "Elektrik Kabini Isı Dengeleme",
      "3 Renkli Alarm Lambası",
      "Hava & Su Tabancası",
      "1 Yıl Mekanik + 2 Yıl MITSUBISHI Garantisi",
    ],
    optionalEquipment: [
      "Disk Tipi Bor Yağı – Kızak Yağı Ayırıcı (Oil Skimmer) — Promosyon",
    ],
    status: "active",
  },
  {
    id: "p7", brand: "Manford", model: "DL-2112", type: "Köprü Tipi CNC Dik İşleme Merkezi", controlPanel: "MITSUBISHI M80 (A)",
    category: "CNC İşleme Merkezi", imageUrl: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=800",
    shortDescription: "2.100 mm X eksenli köprü tipi (gantry) işleme merkezi",
    description: "Manford DL-2112, 2.000 x 1.100 mm tabla ölçüsü ve 4.000 kg tabla yükleme kapasitesi ile büyük kalıp ve parça işleme uygulamaları için tasarlanmış köprü tipi dik işleme merkezidir.",
    listPrice: 170000, currency: "USD",
    specs: [
      { key: "Tabla Ölçüsü", value: "2.000 x 1.100 mm" },
      { key: "T Slot", value: "22 x 150 x 7" },
      { key: "Tabla Yükleme Kapasitesi", value: "4.000 kg" },
      { key: "Kolonlar Arası Mesafe", value: "1.400 mm" },
      { key: "Tabla ~ Fener Mili Mesafesi", value: "100 ~ 900 mm" },
      { key: "X / Y / Z Eksen Hareketi", value: "2.100 / 1.220 / 800 mm" },
      { key: "X Boşta İlerleme", value: "12.000 mm/dk" },
      { key: "Y / Z Boşta İlerleme", value: "15.000 mm/dk" },
      { key: "Pozisyonlama Hassasiyeti", value: "± 0,005 / 300 mm" },
      { key: "Tekrarlama Hassasiyeti", value: "± 0,003 / 300 mm" },
      { key: "Fener Mili Standardı", value: "BT-40" },
      { key: "Fener Mili Devri", value: "10.000 dv/dk (Direkt)" },
      { key: "Fener Mili Motor Gücü", value: "15 kW (20 hp) AC Servo" },
      { key: "Takım Kapasitesi", value: "24 Adet (Kol Tipi)" },
      { key: "Maks. Takım Ağırlık / Boy / Çap", value: "8 kg / 300 mm / Ø125 (Ø250)" },
      { key: "Takım Değiştirme Süresi", value: "6,0 sn" },
      { key: "Toplam Güç", value: "380 V / 50 Hz / 30 kW" },
      { key: "Tezgah Ağırlığı", value: "15.500 kg" },
    ],
    standardEquipment: [
      "MITSUBISHI M80 (A) CNC Kontrol Ünitesi",
      "15,4\" LCD/TFT Renkli Dokunmatik Ekran",
      "10.000 dv/dk Direkt Aktarma Fener Mili",
      "SSS (Super Smooth Surface) Fonksiyonu",
      "Diyalog Programlama, Türkçe Dil",
      "Ethernet & RS-232 Bağlantı",
      "SD Kart & USB Yuvası",
      "X, Y, Z Lineer Kızaklar",
      "C-3 Kalitesinde Vidalı Miller",
      "MEHANITE Hassas Döküm Gövde",
      "Üzeri Açık Tam Kapalı Kabin",
      "Kabin İçi Yıkama & LED Aydınlatma",
      "Fener Mili Yağ Soğutma & Hava Perdeleme",
      "Fener Mili Çevresinden Hava ve Su Püskürtme",
      "Programlanabilir Merkezi Yağlama",
      "Paslanmaz Teleskopik Kızak Koruyucu",
      "Bant Tip Talaş Konveyörü & Talaş Arabası",
      "Takım Değiştirici Yedek Hava Deposu",
      "El Çarkı (MPG)",
      "Elektrik Kabini Isı Dengeleme",
      "3 Renkli Alarm Lambası",
      "Hava & Su Tabancası",
      "1 Yıl Mekanik + 2 Yıl MITSUBISHI Garantisi",
    ],
    optionalEquipment: [],
    status: "active",
  },
  {
    id: "p4", brand: "Beta", model: "B-50", type: "Endüstriyel Sayaç", controlPanel: "CP-Lite",
    category: "Endüstriyel", imageUrl: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=800",
    shortDescription: "Beta serisi giriş seviyesi endüstriyel sayaç",
    description: "Beta B-50, temel ölçüm ihtiyaçları için uygun maliyetli bir çözümdür.",
    listPrice: 2800, currency: "USD",
    specs: [
      { key: "Ölçüm Aralığı", value: "0 – 500 m³/h" },
      { key: "Doğruluk", value: "±1.5%" },
      { key: "Bağlantı", value: "DN50 – DN150" },
    ],
    standardEquipment: ["LCD ekran", "Pals çıkışı"],
    optionalEquipment: ["Modbus modülü"],
    status: "active",
  },
];

export type Machine = {
  id: string;
  customerId: string;
  salesCaseId: string;
  stockItemId: string;
  serialNumber: string;
  model: string;
  // Belge çıktıları (kurulum tutanağı / servis formu) için ürün ve CNC bilgileri.
  brand?: string;
  type?: string;
  controlUnit?: string;
  controlUnitSerial?: string;
  deliveryDate?: string;
  installationDate: string;
  warrantyStart: string;
  warrantyEnd: string;
  status: "Active" | "Out of Warranty" | "Decommissioned";
};

export type ServiceStage =
  | "Request Opened"
  | "Diagnosis"
  | "Quote Needed"
  | "Quote Sent"
  | "Approval"
  | "Scheduled"
  | "Service In Progress"
  | "Service Completed"
  | "Signed Form"
  | "Closed";

export type ServiceTimerStatus = "idle" | "running" | "paused" | "stopped";

export type ServiceHistoryItem = {
  id: string;
  text: string;
  createdAt: string;
  byUserId?: string;
};

export type ServiceOperation = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: "USD" | "EUR" | "TRY";
  createdAt?: string;
  byUserId?: string;
};

export type ServiceRequest = {
  id: string;
  machineId: string;
  customerId: string;
  assignedUserId: string;
  stage: ServiceStage;
  diagnosisNote: string;
  quoteRequired: boolean;
  serviceNote: string;
  createdAt: string;
  issueType?: string;
  priority?: "low" | "normal" | "high" | "critical";
  description?: string;
  complaints?: ServiceHistoryItem[];
  noteHistory?: ServiceHistoryItem[];
  activityHistory?: ServiceHistoryItem[];
  operations?: ServiceOperation[];
  timerStatus?: ServiceTimerStatus;
  timerStartedAt?: string;
  timerElapsedSeconds?: number;
  serviceHourlyRate?: number;
  serviceCurrency?: "USD" | "EUR" | "TRY";
};

export const users: User[] = [
  { id: "u1", name: "Ayşe Demir", email: "ayse@firma.com", role: "SuperAdmin", department: "Yönetim", active: true },
  { id: "u2", name: "Mehmet Kaya", email: "mehmet@firma.com", role: "Admin", department: "Satış", active: true },
  { id: "u3", name: "Elif Yılmaz", email: "elif@firma.com", role: "Sales", department: "Satış", active: true },
  { id: "u4", name: "Can Aksoy", email: "can@firma.com", role: "Sales", department: "Satış", active: true },
  { id: "u5", name: "Burak Öztürk", email: "burak@firma.com", role: "Service", department: "Servis", active: true },
  { id: "u6", name: "Selin Arslan", email: "selin@firma.com", role: "Service", department: "Servis", active: false },
];

export const departments = [
  { id: "d1", name: "Yönetim", manager: "Ayşe Demir", userCount: 1 },
  { id: "d2", name: "Satış", manager: "Mehmet Kaya", userCount: 3 },
  { id: "d3", name: "Servis", manager: "Burak Öztürk", userCount: 2 },
  { id: "d4", name: "Lojistik", manager: "—", userCount: 0 },
];

export const permissionsList = [
  "can_manage_users",
  "can_manage_roles",
  "can_manage_departments",
  "can_view_all_reports",
  "can_view_department_reports",
  "can_create_customer",
  "can_edit_customer",
  "can_create_sales_case",
  "can_edit_sales_case",
  "can_create_offer",
  "can_manage_stock",
  "can_manage_assets",
  "can_manage_service",
  "can_view_finance",
  "can_export_excel",
];

export const customers: Customer[] = [
  { id: "c1", type: "company", firmType: "customer", salesStatus: "active_customer", name: "Anadolu Tekstil A.Ş.", contactPerson: "Hakan Sezer", phone: "+90 212 555 0101", email: "hakan@anadolutekstil.com", city: "İstanbul", address: "Maslak Mah. No:12", taxNumber: "1234567890", wantedProduct: "Endüstriyel Sayaç", initialNote: "3 şubeli firma, hızlı dönüş istiyor", source: "Web", status: "active", createdAt: "2026-02-11" },
  { id: "c2", type: "company", firmType: "customer", salesStatus: "active_customer", name: "Ege Mermer Ltd.", contactPerson: "Pınar Akın", phone: "+90 232 555 0102", email: "info@egemermer.com", city: "İzmir", address: "Bornova OSB", taxNumber: "9876543210", wantedProduct: "Kontrol Paneli", initialNote: "Mevcut sistemi yenilemek istiyor", source: "Referans", status: "active", createdAt: "2026-03-04" },
  { id: "c3", type: "company", firmType: "supplier_customer", salesStatus: "active_customer", name: "Karadeniz Gıda", contactPerson: "Onur Çelik", phone: "+90 462 555 0103", email: "onur@kgida.com", city: "Trabzon", address: "Sanayi Sitesi", taxNumber: "5566778899", wantedProduct: "Sayaç + Panel", initialNote: "Bütçe henüz net değil", source: "Fuar", status: "active", createdAt: "2026-03-22" },
  { id: "c4", type: "person", firmType: "customer", salesStatus: "potential", name: "Osman Yıldız", contactPerson: "Osman Yıldız", phone: "+90 533 555 0104", email: "osman@gmail.com", city: "Ankara", address: "Çankaya", taxNumber: "—", wantedProduct: "Tek sayaç", initialNote: "Bireysel müşteri", source: "Telefon", status: "passive", createdAt: "2026-01-15" },
  { id: "c5", type: "company", firmType: "customer", salesStatus: "active_customer", name: "Marmara Lojistik", contactPerson: "Deniz Korkmaz", phone: "+90 216 555 0105", email: "deniz@marmaralojistik.com", city: "İstanbul", address: "Tuzla", taxNumber: "1122334455", wantedProduct: "Filo sayaçları", initialNote: "5+ adet talep", source: "LinkedIn", status: "active", createdAt: "2026-04-01" },
  { id: "c6", type: "company", firmType: "customer", salesStatus: "potential", name: "Çukurova İnşaat", contactPerson: "Sevgi Bakır", phone: "+90 322 555 0106", email: "sevgi@cukurovains.com", city: "Adana", address: "Seyhan", taxNumber: "9988776655", wantedProduct: "Endüstriyel panel", initialNote: "Şantiye projesi", source: "Web", status: "active", createdAt: "2026-04-18" },
  { id: "c7", type: "company", firmType: "supplier", name: "Acme Üretim GmbH", contactPerson: "Mark Weber", phone: "+49 40 555 0201", email: "mweber@acme.de", city: "Hamburg", address: "Industrieweg 22", taxNumber: "DE221334456", wantedProduct: "—", initialNote: "Ana CNC tedarikçisi", source: "Referans", status: "active", createdAt: "2025-09-10" },
  { id: "c8", type: "company", firmType: "supplier", name: "Beta Components Co.", contactPerson: "Lin Zhao", phone: "+886 2 555 0301", email: "lin@beta-components.tw", city: "Taipei", address: "Neihu District", taxNumber: "TW88775566", wantedProduct: "—", initialNote: "Yedek parça tedariki", source: "Fuar", status: "active", createdAt: "2025-11-04" },
  { id: "c9", type: "company", firmType: "supplier_customer", salesStatus: "potential", name: "İzmir Endüstri Otomasyon", contactPerson: "Mehmet Kaya", phone: "+90 232 555 0444", email: "mehmet@izmir-end.com", city: "İzmir", address: "Pınarbaşı OSB", taxNumber: "3344556677", wantedProduct: "CNC Makine", initialNote: "Hem ürün hem yedek parça temin", source: "LinkedIn", status: "active", createdAt: "2026-04-20" },
];

export const contacts: Contact[] = [
  { id: "k1", customerId: "c1", name: "Hakan Sezer", title: "Satın Alma Müdürü", department: "Satın Alma", phone: "+90 212 555 0101", email: "hakan@anadolutekstil.com", isPrimary: true },
  { id: "k2", customerId: "c1", name: "Elif Tunç", title: "Üretim Şefi", department: "Üretim", phone: "+90 212 555 0110", email: "elif@anadolutekstil.com", isPrimary: false },
  { id: "k3", customerId: "c2", name: "Pınar Akın", title: "Operasyon Direktörü", department: "Operasyon", phone: "+90 232 555 0102", email: "info@egemermer.com", isPrimary: true },
  { id: "k4", customerId: "c3", name: "Onur Çelik", title: "Genel Müdür", department: "Yönetim", phone: "+90 462 555 0103", email: "onur@kgida.com", isPrimary: true },
  { id: "k5", customerId: "c3", name: "Burcu Aydın", title: "Bakım Sorumlusu", department: "Bakım", phone: "+90 462 555 0120", email: "burcu@kgida.com", isPrimary: false },
  { id: "k6", customerId: "c5", name: "Deniz Korkmaz", title: "Filo Yöneticisi", department: "Lojistik", phone: "+90 216 555 0105", email: "deniz@marmaralojistik.com", isPrimary: true },
  { id: "k7", customerId: "c6", name: "Sevgi Bakır", title: "Proje Müdürü", department: "Proje", phone: "+90 322 555 0106", email: "sevgi@cukurovains.com", isPrimary: true },
  { id: "k8", customerId: "c7", name: "Mark Weber", title: "Sales Director", department: "Sales", phone: "+49 40 555 0201", email: "mweber@acme.de", isPrimary: true, note: "Ana muhatap" },
  { id: "k9", customerId: "c7", name: "Anna Schmidt", title: "Logistics", department: "Logistics", phone: "+49 40 555 0210", email: "anna@acme.de", isPrimary: false },
  { id: "k10", customerId: "c8", name: "Lin Zhao", title: "Account Manager", department: "Sales", phone: "+886 2 555 0301", email: "lin@beta-components.tw", isPrimary: true },
  { id: "k11", customerId: "c9", name: "Mehmet Kaya", title: "Genel Müdür", department: "Yönetim", phone: "+90 232 555 0444", email: "mehmet@izmir-end.com", isPrimary: true },
];

export const salesCases: SalesCase[] = [
  { id: "s1", customerId: "c1", assignedUserId: "u3", department: "Satış", requestedProduct: "Endüstriyel Sayaç", requestedModel: "X-200", quantity: 4, estimatedAmount: 24000, currency: "EUR", stage: "Offer Sent", isOfferPrepared: true, isLost: false, createdAt: "2026-02-12" },
  { id: "s2", customerId: "c2", assignedUserId: "u4", department: "Satış", requestedProduct: "Kontrol Paneli", requestedModel: "CP-Pro", quantity: 2, estimatedAmount: 14500, currency: "USD", stage: "Follow-up", isOfferPrepared: true, isLost: false, createdAt: "2026-03-05" },
  { id: "s3", customerId: "c3", assignedUserId: "u3", department: "Satış", requestedProduct: "Sayaç + Panel", requestedModel: "X-200 + CP-Lite", quantity: 1, estimatedAmount: 9800, currency: "EUR", stage: "Requirement Analysis", isOfferPrepared: false, isLost: false, createdAt: "2026-03-23" },
  { id: "s4", customerId: "c5", assignedUserId: "u4", department: "Satış", requestedProduct: "Filo Sayaçları", requestedModel: "X-100", quantity: 8, estimatedAmount: 32000, currency: "EUR", stage: "Offer Approved", isOfferPrepared: true, isLost: false, createdAt: "2026-04-02" },
  { id: "s5", customerId: "c6", assignedUserId: "u3", department: "Satış", requestedProduct: "Endüstriyel Panel", requestedModel: "CP-Pro", quantity: 3, estimatedAmount: 18000, currency: "USD", stage: "Proforma / Contract", isOfferPrepared: true, isLost: false, createdAt: "2026-04-19" },
  { id: "s6", customerId: "c1", assignedUserId: "u4", department: "Satış", requestedProduct: "Bakım Sayaçları", requestedModel: "X-200", quantity: 2, estimatedAmount: 12000, currency: "EUR", stage: "Lead", isOfferPrepared: false, isLost: false, createdAt: "2026-05-01" },
  { id: "s7", customerId: "c2", assignedUserId: "u3", department: "Satış", requestedProduct: "Yedek Parça Paketi", requestedModel: "—", quantity: 1, estimatedAmount: 4200, currency: "EUR", stage: "Lost", isOfferPrepared: true, isLost: true, lostReason: "Fiyat", competitor: "RakipFirma A", createdAt: "2026-02-20", closedAt: "2026-03-12" },
  { id: "s8", customerId: "c5", assignedUserId: "u4", department: "Satış", requestedProduct: "Sayaç X-300", requestedModel: "X-300", quantity: 5, estimatedAmount: 45000, currency: "EUR", stage: "Shipment", isOfferPrepared: true, isLost: false, createdAt: "2026-03-15" },
  { id: "s9", customerId: "c6", assignedUserId: "u3", department: "Satış", requestedProduct: "Demo Set", requestedModel: "X-100", quantity: 1, estimatedAmount: 3500, currency: "USD", stage: "Initial Contact", isOfferPrepared: false, isLost: false, createdAt: "2026-05-05" },
  { id: "s10", customerId: "c3", assignedUserId: "u4", department: "Satış", requestedProduct: "Komple Sistem", requestedModel: "X-200 + CP-Pro", quantity: 1, estimatedAmount: 22000, currency: "EUR", stage: "Completed", isOfferPrepared: true, isLost: false, createdAt: "2026-01-20", closedAt: "2026-04-25" },
];

export const activities: Activity[] = [
  { id: "a1", salesCaseId: "s1", customerId: "c1", type: "sales_case_created", title: "Satış kartı oluşturuldu", note: "Talep alındı", date: "2026-02-12 09:30", byUserId: "u3" },
  { id: "a2", salesCaseId: "s1", customerId: "c1", type: "phone_call", title: "Müşteri ile telefon görüşmesi", note: "Teknik detaylar netleştirildi", date: "2026-02-13 14:10", byUserId: "u3" },
  { id: "a3", salesCaseId: "s1", customerId: "c1", type: "offer_preparing", title: "Teklif hazırlanıyor", note: "Stok kontrol ediliyor", date: "2026-02-14 11:00", byUserId: "u3" },
  { id: "a4", salesCaseId: "s1", customerId: "c1", type: "offer_sent", title: "Teklif gönderildi", note: "Q-2026-0044, EUR", date: "2026-02-16 16:25", byUserId: "u3" },
  { id: "a5", salesCaseId: "s1", customerId: "c1", type: "visit", title: "Saha ziyareti", note: "Kurulum alanı incelendi", date: "2026-02-22 10:00", byUserId: "u3" },
];

export const offers: Offer[] = [
  { id: "o1", salesCaseId: "s1", quoteNo: "Q-2026-0044", revision: 0, date: "2026-02-16", amount: 24000, currency: "EUR", status: "Sent", note: "İlk teklif" },
  { id: "o2", salesCaseId: "s1", quoteNo: "Q-2026-0044", revision: 1, date: "2026-02-28", amount: 22500, currency: "EUR", status: "Sent", note: "Revize iskonto" },
  { id: "o3", salesCaseId: "s4", quoteNo: "Q-2026-0061", revision: 0, date: "2026-04-05", amount: 32000, currency: "EUR", status: "Approved", note: "Onaylı" },
  { id: "o4", salesCaseId: "s2", quoteNo: "Q-2026-0052", revision: 0, date: "2026-03-08", amount: 14500, currency: "USD", status: "Sent", note: "—" },
  { id: "o5", salesCaseId: "s5", quoteNo: "Q-2026-0070", revision: 0, date: "2026-04-22", amount: 18000, currency: "USD", status: "Approved", note: "Sözleşme aşamasında" },
];

export const documentsList: DocumentItem[] = [
  { id: "d1", salesCaseId: "s1", type: "Proforma", fileName: "PRO-Anadolu.pdf", uploadedBy: "u3", uploadedAt: "2026-02-17", size: "412 KB" },
  { id: "d2", salesCaseId: "s4", type: "Contract", fileName: "Sozlesme-Marmara.pdf", uploadedBy: "u4", uploadedAt: "2026-04-08", size: "1.2 MB" },
  { id: "d3", salesCaseId: "s5", type: "Proforma", fileName: "PRO-Cukurova.pdf", uploadedBy: "u3", uploadedAt: "2026-04-23", size: "508 KB" },
  { id: "d4", salesCaseId: "s8", type: "CommercialInvoice", fileName: "CI-Marmara-Shipment.pdf", uploadedBy: "u4", uploadedAt: "2026-04-30", size: "744 KB" },
  { id: "d5", salesCaseId: "s10", type: "InstallationForm", fileName: "Kurulum-Karadeniz.pdf", uploadedBy: "u5", uploadedAt: "2026-04-25", size: "318 KB" },
];

export const payments: Payment[] = [
  { id: "p1", salesCaseId: "s4", customerId: "c5", paymentType: "expected", amount: 16000, currency: "EUR", dueDate: "2026-05-20", status: "Pending", note: "Avans" },
  { id: "p2", salesCaseId: "s4", customerId: "c5", paymentType: "expected", amount: 16000, currency: "EUR", dueDate: "2026-06-15", status: "Pending", note: "Bakiye" },
  { id: "p3", salesCaseId: "s10", customerId: "c3", paymentType: "received", amount: 22000, currency: "EUR", dueDate: "2026-04-01", paidDate: "2026-04-02", status: "Paid", note: "Tamamlandı" },
  { id: "p4", salesCaseId: "s5", customerId: "c6", paymentType: "expected", amount: 9000, currency: "USD", dueDate: "2026-05-01", status: "Overdue", note: "Avans gecikti" },
  { id: "p5", salesCaseId: "s8", customerId: "c5", paymentType: "received", amount: 22500, currency: "EUR", dueDate: "2026-04-15", paidDate: "2026-04-15", status: "Paid", note: "İlk dilim" },
  { id: "p6", salesCaseId: "s8", customerId: "c5", paymentType: "expected", amount: 22500, currency: "EUR", dueDate: "2026-05-30", status: "Pending", note: "İkinci dilim" },
];

export const stockItems: StockItem[] = [
  { id: "st1", brand: "Acme", counterType: "Endüstriyel", counterModel: "X-200", serialNumber: "SN-200-0001", controlPanel: "CP-Pro", stockCode: "ACM-X200-001", warehouse: "İstanbul Ana Depo", status: "Available" },
  { id: "st2", brand: "Acme", counterType: "Endüstriyel", counterModel: "X-200", serialNumber: "SN-200-0002", controlPanel: "CP-Pro", stockCode: "ACM-X200-002", warehouse: "İstanbul Ana Depo", status: "Reserved" },
  { id: "st3", brand: "Acme", counterType: "Hafif", counterModel: "X-100", serialNumber: "SN-100-0010", controlPanel: "CP-Lite", stockCode: "ACM-X100-010", warehouse: "Ankara Şube", status: "Available" },
  { id: "st4", brand: "Acme", counterType: "Yüksek Kapasite", counterModel: "X-300", serialNumber: "SN-300-0003", controlPanel: "CP-Pro", stockCode: "ACM-X300-003", warehouse: "İstanbul Ana Depo", status: "Sold" },
  { id: "st5", brand: "Beta", counterType: "Endüstriyel", counterModel: "B-50", serialNumber: "SN-B50-0005", controlPanel: "CP-Lite", stockCode: "BET-B50-005", warehouse: "İzmir Depo", status: "Available" },
  { id: "st6", brand: "Acme", counterType: "Endüstriyel", counterModel: "X-200", serialNumber: "SN-200-0003", controlPanel: "CP-Pro", stockCode: "ACM-X200-003", warehouse: "İstanbul Ana Depo", status: "Inactive" },
];

export const machines: Machine[] = [
  { id: "m1", customerId: "c3", salesCaseId: "s10", stockItemId: "st4", serialNumber: "SN-300-0003", model: "X-300", installationDate: "2026-04-25", warrantyStart: "2026-04-25", warrantyEnd: "2028-04-25", status: "Active" },
  { id: "m2", customerId: "c1", salesCaseId: "s1", stockItemId: "st1", serialNumber: "SN-200-0001", model: "X-200", installationDate: "2025-11-12", warrantyStart: "2025-11-12", warrantyEnd: "2027-11-12", status: "Active" },
  { id: "m3", customerId: "c4", salesCaseId: "s7", stockItemId: "st5", serialNumber: "SN-B50-0005", model: "B-50", installationDate: "2024-05-08", warrantyStart: "2024-05-08", warrantyEnd: "2026-05-08", status: "Out of Warranty" },
];

export const serviceRequests: ServiceRequest[] = [
  {
    id: "sr1",
    machineId: "m1",
    customerId: "c3",
    assignedUserId: "u5",
    stage: "Diagnosis",
    diagnosisNote: "Sayaç hatalı okuma yapıyor",
    quoteRequired: false,
    serviceNote: "Saha ekibi yarın gidecek",
    createdAt: "2026-05-05",
    complaints: [{ id: "src1", text: "Sayaç değerleri günlük raporla uyuşmuyor.", createdAt: "2026-05-05 09:20", byUserId: "u5" }],
    noteHistory: [{ id: "srn1", text: "Müşteri arıza tekrar ederse video gönderecek.", createdAt: "2026-05-05 10:15", byUserId: "u5" }],
    activityHistory: [{ id: "sra1", text: "Servis talebi açıldı.", createdAt: "2026-05-05 09:20", byUserId: "u5" }],
    operations: [],
    timerStatus: "idle",
    timerElapsedSeconds: 0,
    serviceHourlyRate: 120,
    serviceCurrency: "USD",
  },
  {
    id: "sr2",
    machineId: "m2",
    customerId: "c1",
    assignedUserId: "u5",
    stage: "Scheduled",
    diagnosisNote: "Bakım talebi",
    quoteRequired: false,
    serviceNote: "Planlandı: 2026-05-18",
    createdAt: "2026-05-02",
    complaints: [{ id: "src2", text: "Periyodik bakım sonrası ses kontrolü isteniyor.", createdAt: "2026-05-02 13:40", byUserId: "u5" }],
    noteHistory: [{ id: "srn2", text: "Bakım seti sahaya götürülecek.", createdAt: "2026-05-02 14:05", byUserId: "u5" }],
    activityHistory: [{ id: "sra2", text: "Servis planlandı.", createdAt: "2026-05-02 14:10", byUserId: "u5" }],
    operations: [],
    timerStatus: "paused",
    timerElapsedSeconds: 5400,
    serviceHourlyRate: 120,
    serviceCurrency: "USD",
  },
  {
    id: "sr3",
    machineId: "m3",
    customerId: "c4",
    assignedUserId: "u6",
    stage: "Quote Sent",
    diagnosisNote: "Kart değişimi gerekli",
    quoteRequired: true,
    serviceNote: "Müşteri onayı bekleniyor",
    createdAt: "2026-05-08",
    complaints: [{ id: "src3", text: "Makine kontrol kartı aralıklı hata veriyor.", createdAt: "2026-05-08 11:10", byUserId: "u6" }],
    noteHistory: [{ id: "srn3", text: "Kart değişimi için servis teklifi gönderildi.", createdAt: "2026-05-08 15:30", byUserId: "u6" }],
    activityHistory: [{ id: "sra3", text: "Teklif müşteriye iletildi.", createdAt: "2026-05-08 15:30", byUserId: "u6" }],
    operations: [{ id: "sro1", description: "Kontrol kartı değişimi", quantity: 1, unitPrice: 450, currency: "USD", createdAt: "2026-05-08 15:35", byUserId: "u6" }],
    timerStatus: "idle",
    timerElapsedSeconds: 0,
    serviceHourlyRate: 120,
    serviceCurrency: "USD",
  },
  {
    id: "sr4",
    machineId: "m1",
    customerId: "c3",
    assignedUserId: "u5",
    stage: "Closed",
    diagnosisNote: "Yazılım güncellemesi",
    quoteRequired: false,
    serviceNote: "Tamamlandı",
    createdAt: "2026-04-12",
    complaints: [{ id: "src4", text: "Operatör ekranında eski sürüm uyarısı görülüyor.", createdAt: "2026-04-12 08:55", byUserId: "u5" }],
    noteHistory: [{ id: "srn4", text: "Yazılım güncellendi, test formu imzalandı.", createdAt: "2026-04-12 17:20", byUserId: "u5" }],
    activityHistory: [{ id: "sra4", text: "Servis kapatıldı.", createdAt: "2026-04-12 17:25", byUserId: "u5" }],
    operations: [{ id: "sro2", description: "Yazılım güncelleme", quantity: 1, unitPrice: 150, currency: "USD", createdAt: "2026-04-12 17:15", byUserId: "u5" }],
    timerStatus: "stopped",
    timerElapsedSeconds: 7200,
    serviceHourlyRate: 120,
    serviceCurrency: "USD",
  },
];

export const purchaseOrders = [
  { id: "po1", supplier: "Acme Üretim", model: "X-200", quantity: 10, expectedDate: "2026-05-25", status: "Onaylandı" },
  { id: "po2", supplier: "Beta Üretim", model: "B-50", quantity: 4, expectedDate: "2026-06-05", status: "Beklemede" },
  { id: "po3", supplier: "Acme Üretim", model: "X-300", quantity: 2, expectedDate: "2026-05-15", status: "Sevk Edildi" },
];

export const shipments = [
  { id: "sh1", salesCaseId: "s8", trackingNo: "TRK-009122", carrier: "DHL", origin: "Hamburg", destination: "İstanbul", status: "Yolda", eta: "2026-05-18" },
  { id: "sh2", salesCaseId: "s5", trackingNo: "TRK-009203", carrier: "UPS", origin: "Rotterdam", destination: "Adana", status: "Gümrükte", eta: "2026-05-22" },
  { id: "sh3", salesCaseId: "s10", trackingNo: "TRK-008940", carrier: "MNG", origin: "İstanbul", destination: "Trabzon", status: "Teslim Edildi", eta: "2026-04-24" },
];

export const installations = [
  { id: "in1", salesCaseId: "s10", customerId: "c3", technician: "Burak Öztürk", scheduledDate: "2026-04-25", status: "Tamamlandı" },
  { id: "in2", salesCaseId: "s8", customerId: "c5", technician: "Burak Öztürk", scheduledDate: "2026-05-22", status: "Planlandı" },
  { id: "in3", salesCaseId: "s5", customerId: "c6", technician: "Selin Arslan", scheduledDate: "2026-05-30", status: "Planlandı" },
];

export const deliveries = [
  { id: "dl1", salesCaseId: "s10", customerId: "c3", date: "2026-04-25", signedBy: "Onur Çelik", status: "Tamamlandı" },
  { id: "dl2", salesCaseId: "s8", customerId: "c5", date: "2026-05-20", signedBy: "—", status: "Bekliyor" },
];
