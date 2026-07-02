/**
 * UI domain types + pipeline/shipment label constants.
 * İş verisi burada tutulmaz — tüm kayıtlar API / store üzerinden gelir.
 */
export type Role = "SuperAdmin" | "Admin" | "Sales" | "Service";

export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  roleCodes?: string[];
  roleNames?: string[];
  department: string;
  departmentId?: string | null;
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
  /** Kalıcı harita konumu (company_addresses.latitude/longitude) */
  latitude?: number;
  longitude?: number;
  locationSource?: string;
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
  isBlacklisted?: boolean;
  blacklistReason?: string;
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
  | "payment_plan"
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
  "call",
  "visit",
  "quote",
  "sales",
  "cancelled",
  "proforma",
  "contract",
  "payment_plan",
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
  payment_plan: "Ödeme Planı",
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
  result?: string;
  date: string;
  byUserId: string;
  createdByName?: string;
  files?: any[];
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
  /** KDV hariç net ara toplam (indirim sonrası). Boşsa amount brüt kabul edilir. */
  subtotal?: number;
  /** Hesaplanan KDV tutarı. */
  vatTotal?: number;
  currency: "USD" | "EUR" | "TRY";
  status: "Draft" | "Sent" | "Approved" | "Rejected" | "Pending Approval";
  priceApprovalStatus?: 'not_required' | 'pending' | 'approved' | 'rejected';
  note: string;
};

export type DocumentItem = {
  id: string;
  salesCaseId: string;
  /** Proforma / sözleşme / fatura kaydının bağlı olduğu teklif. */
  quoteId?: string;
  companyId?: string;
  /** Servis talebine bağlı ek (service kanban kartı). */
  serviceRequestId?: string;
  /** Canlı teslim/kurulum formu kayıtları için üretilmiş doküman referansları. */
  deliveryId?: string;
  installationId?: string;
  installationData?: any;
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
  /** Kasa yönü: "in" = giren (tahsilat), "out" = çıkan (tedarikçi/gider ödemesi). */
  direction: "in" | "out";
  amount: number;
  currency: "USD" | "EUR" | "TRY";
  dueDate: string;
  paidDate?: string;
  status: "Pending" | "Paid" | "Overdue" | "Cancelled";
  note: string;
  invoiceNo?: string;
  paymentMethod?: "bank_transfer" | "cash" | "credit_card" | "check" | "other";
  /** Durum güncellemesinin hangi backend tablosuna gideceğini belirler. */
  source?: "receivable" | "payment";
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
  status: "Available" | "Reserved" | "InTransit" | "Sold" | "Inactive";
  /** Seri no ile takip edilen CRM stok kategorisi. */
  categoryCode?: "TEZGAH" | "OPSIYONEL_DONANIM" | "YEDEK_PARCA" | "AKSESUAR" | "EVRAK" | "IDARI_MALZEME";
  category?: string;
  reservedCompanyId?: string;
  reservedCompanyName?: string;
  optionalHardware?: string;
  spareParts?: string;
  productId?: string;
  parentInventoryItemId?: string | null;
  loadingDate?: string;
  arrivalDate?: string;
  locationStatus?: string;
};

export type ProductSpec = { key: string; value: string };

export type ProductAlternative = {
  id: string;
  brand: string;
  model: string;
  shortDescription: string;
  category: string;
  categoryCode?: string;
  type?: string;
  listPrice?: number;
  currency?: "USD" | "EUR" | "TRY";
};

export type Product = {
  id: string;
  brand: string;
  productGroup?: string;
  productGroupCode?: string;
  model: string;
  modelName?: string;
  type: string;
  productTypeCode?: string;
  compatibleMachineTypeCode?: string | null;
  supplierCompanyId?: string | null;
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
  muadilProductIds?: string[];
  muadilProducts?: ProductAlternative[];
  optionalCompatibilityGroupCodes?: string[];
  optionalCompatibilityCategoryCodes?: string[];
  optionalCompatibilitySubcategoryCodes?: string[];
  optionalCompatibilityTypeCodes?: string[];
  optionalCompatibilityBrandIds?: string[];
  status: "active" | "passive";
  pdfUrl?: string;
};

export type Machine = {
  id: string;
  /** Cihazın satıştaki ilk müşterisi. Firma el değiştirse de referans için korunur. */
  initialCustomerId?: string;
  /** Cihazı bugün kullanan firma. Varsayılan olarak ilk müşteriyle aynıdır. */
  userCompanyId?: string;
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
  productModelId?: string;
  technicalSpecs?: ProductSpec[];
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

export type ServiceTicketType = "complaint" | "request" | "warranty_claim" | "question";
export type ServiceSource = "manual" | "phone" | "email" | "whatsapp" | "portal" | "web" | "qr";
export type ServiceWarrantyStatus = "draft" | "submitted" | "approved" | "rejected" | "rma_in_progress" | "closed";
export type ServiceWarrantyCoverage = "pending" | "approved" | "rejected";
export type ServiceWarrantySuggestion = "in_warranty" | "out_of_warranty" | "unknown";

export type ServiceComplaintStatus = "new" | "reviewing" | "converted" | "rejected";
export type ServiceComplaintSource = "qr" | "web" | "phone" | "whatsapp" | "email" | "manual";

export type ServiceComplaintIntake = {
  id: string;
  complaintNo: string;
  companyId?: string | null;
  customerDeviceId?: string | null;
  serviceTicketId?: string | null;
  source: ServiceComplaintSource;
  status: ServiceComplaintStatus;
  subject: string;
  description?: string | null;
  severity: "low" | "normal" | "high" | "critical";
  ticketType: ServiceTicketType;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  rejectionNote?: string | null;
  createdAt?: string;
  company?: { id: string; legalTitle?: string | null; shortName?: string | null } | null;
  machine?: {
    id: string;
    brand?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    warrantyStartDate?: string | null;
    warrantyEndDate?: string | null;
  } | null;
  warrantyStatusSuggestion?: ServiceWarrantySuggestion;
  callAssistant?: {
    callAssistantSuggestionId?: string | null;
    callEventId?: string | null;
  } | null;
  attachments?: Array<{
    id: string;
    fileId: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    documentTypeCode?: string | null;
    documentTypeName?: string | null;
    description?: string | null;
    createdAt?: string | null;
  }>;
  serviceTicket?: { id: string; ticketNo?: string | null; subject?: string | null } | null;
};

export type ServiceComplaintLink = {
  id: string;
  companyId?: string | null;
  customerDeviceId?: string | null;
  slug: string;
  title?: string | null;
  notes?: string | null;
  isActive: boolean;
  revokedAt?: string | null;
  publicPath?: string;
  qrPublicPath?: string;
  token?: string;
  company?: { id: string; legalTitle?: string | null; shortName?: string | null } | null;
  machine?: { id: string; brand?: string | null; model?: string | null; serialNumber?: string | null } | null;
};

export type ServiceWarrantyPart = {
  id?: string;
  productModelId?: string | null;
  inventoryItemId?: string | null;
  description: string;
  quantity: number;
  actionType: "replace" | "repair" | "return" | "investigate";
  source: "stock" | "supplier" | "customer" | "service";
  supplierRmaStatus?: string | null;
  chargeToCustomer: boolean;
  unitCost?: number | null;
  currency: "USD" | "EUR" | "TRY";
  notes?: string | null;
  product?: { id: string; model?: string | null; modelName?: string | null } | null;
  inventory?: { id: string; serialNumber?: string | null } | null;
};

export type ServiceWarrantyClaim = {
  id: string;
  serviceTicketId: string;
  companyId: string;
  customerDeviceId?: string | null;
  warrantyStartSnapshot?: string | null;
  warrantyEndSnapshot?: string | null;
  status: ServiceWarrantyStatus;
  coverageSuggestion: ServiceWarrantySuggestion;
  coverageDecision: ServiceWarrantyCoverage;
  failureCategory?: string | null;
  technicianAssessment?: string | null;
  managerDecisionNote?: string | null;
  decidedByUserId?: string | null;
  decidedAt?: string | null;
  rmaNo?: string | null;
  supplierName?: string | null;
  supplierRmaStatus?: string | null;
  costAmount?: number | null;
  costCurrency: "USD" | "EUR" | "TRY";
  customerChargeAmount?: number | null;
  customerChargeCurrency: "USD" | "EUR" | "TRY";
  parts?: ServiceWarrantyPart[];
};

export type ServiceRequest = {
  id: string;
  ticketNo?: string;
  machineId: string;
  customerId: string;
  contactId?: string;
  assignedUserId: string;
  stage: ServiceStage;
  diagnosisNote: string;
  quoteRequired: boolean;
  serviceNote: string;
  createdAt: string;
  issueType?: string;
  ticketType?: ServiceTicketType;
  source?: ServiceSource;
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
  serviceQuote?: ServiceQuoteForm | null;
  completionForm?: ServiceCompletionForm | null;
  closedAt?: string;
  warrantyClaim?: ServiceWarrantyClaim | null;
  sourceComplaint?: {
    id: string;
    complaintNo: string;
    source: ServiceComplaintSource;
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
  } | null;
};

export type ServiceQuoteItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type ServiceCompletionCheckStatus = "done" | "not_done" | "na";

export type ServiceCompletionCheckItem = {
  id: string;
  label: string;
  status: ServiceCompletionCheckStatus;
  note?: string;
  custom?: boolean;
};

export const SERVICE_COMPLETION_DEFAULT_CHECKS: { id: string; label: string }[] = [
  { id: "tezgah-montaji", label: "Tezgah Montajı" },
  { id: "tezgah-dengeye-alinmasi", label: "Tezgahın Dengeye Alınması" },
  { id: "elektrik-baglantisi", label: "Elektrik Bağlantısı" },
  { id: "yaglama-sistemi", label: "Yağlama Sistemi Kontrolü" },
  { id: "sogutma-sistemi", label: "Soğutma Sistemi Kontrolü" },
  { id: "hidrolik-sistemi", label: "Hidrolik Sistemi Kontrolü" },
  { id: "cnc-parametreleri", label: "Cnc Parametreleri Kontrolü" },
  { id: "ilk-calistirma", label: "Tezgahın İlk Çalıştırılması" },
  { id: "parametre-yedek", label: "Parametrelerin Yedeklenmesi" },
];

export type ServiceCompletionForm = {
  formNo?: string;
  teslimTarihi?: string;       // Tezgah Teslim Tarihi
  kurulumTarihi?: string;      // Tezgah Kurulum / Servis Tarihi
  tezgah?: { marka?: string; tip?: string; model?: string; seriNo?: string };
  cnc?: { marka?: string; model?: string; seriNo?: string; mainSw?: string };
  kullanici?: {
    firma?: string;
    ilgili?: string;
    adres?: string;
    telefon?: string;
    faks?: string;
    gsm?: string;
    eposta?: string;
  };
  checks: ServiceCompletionCheckItem[];
  yapilanIsler?: string;       // Serbest metin: yapılan işler özet
  notlar?: string;
  kurulumuYapan?: string;      // Servisi yapan teknisyen
  teslimAlan?: string;         // Tezgahı teslim alan / müşteri yetkilisi
  signedAt?: string;           // İmzalandığı / kapatıldığı an
  signedByUserId?: string;
};

export type ServiceQuoteForm = {
  quoteNo: string;
  date: string;
  validity: string;
  writerName: string;
  writerTitle?: string;
  writerEmail?: string;
  company: string;
  contact?: string;
  mobile?: string;
  phone?: string;
  address?: string;
  email?: string;
  subject: string;
  currency: "USD" | "EUR" | "TRY";
  vatRate: number;
  vatAmount: number;
  noteVariantKey: string;
  notes: string[];
  items: ServiceQuoteItem[];
  savedAt?: string;
};


export type ShipmentStatus = "Hazırlanıyor" | "Yolda" | "Gümrükte" | "Teslim Edildi";
export const SHIPMENT_STATUSES: ShipmentStatus[] = ["Hazırlanıyor", "Yolda", "Gümrükte", "Teslim Edildi"];
export type Shipment = {
  id: string;
  salesCaseId: string;
  senderCompanyId?: string;
  senderCompanyName?: string;
  /** Kayıtlı olmayan gönderici için elle girilen serbest-metin ad. */
  senderName?: string;
  carrierCompanyId?: string;
  carrierCompanyName?: string;
  transportMode?: "road" | "air" | "sea" | "local_cargo";
  productCategoryCode?: StockItem["categoryCode"];
  destinationWarehouseId?: string;
  destinationWarehouseName?: string;
  loadingDate?: string;
  trackingNo: string;
  carrier: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  eta: string;
  items?: Array<{
    id?: string;
    productModelId?: string;
    inventoryItemId?: string;
    description: string;
    serialNumber?: string;
    quantity?: number;
    packageCount?: number;
    palletCount?: number;
    packageLengthCm?: number;
    packageWidthCm?: number;
    packageHeightCm?: number;
    grossWeightKg?: number;
    packageNotes?: string;
  }>;
};

export type DeliveryStatus = "Bekliyor" | "Tamamlandı";
export const DELIVERY_STATUSES: DeliveryStatus[] = ["Bekliyor", "Tamamlandı"];

export type DeliveryFormFields = {
  formNo?: string;
  kurulumTarihi?: string;
  machineId?: string;
  tezgah?: { marka?: string; tip?: string; model?: string; seriNo?: string };
  cnc?: { marka?: string; model?: string; seriNo?: string; mainSw?: string };
  ilgili?: string;
  kurulumuYapan?: string;
  technicalSpecs?: ProductSpec[];
};

export type Delivery = {
  id: string;
  salesCaseId: string;
  customerId: string;
  shipmentId?: string;
  date: string;
  signedBy: string;
  status: DeliveryStatus;
  formData?: DeliveryFormFields;
};
