/**
 * UI domain types + pipeline/shipment label constants.
 * İş verisi burada tutulmaz — tüm kayıtlar API / store üzerinden gelir.
 */
export type Role = "SuperAdmin" | "Admin" | "Sales" | "Service";

export type User = {
  id: string;
  name: string;
  email: string;
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
  /** KDV hariç net ara toplam (indirim sonrası). Boşsa amount brüt kabul edilir. */
  subtotal?: number;
  /** Hesaplanan KDV tutarı. */
  vatTotal?: number;
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
  /** Kasa yönü: "in" = giren (tahsilat), "out" = çıkan (tedarikçi/gider ödemesi). */
  direction: "in" | "out";
  amount: number;
  currency: "USD" | "EUR" | "TRY";
  dueDate: string;
  paidDate?: string;
  status: "Pending" | "Paid" | "Overdue" | "Cancelled";
  note: string;
  invoiceNo?: string;
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
  status: "Available" | "Reserved" | "Sold" | "Inactive";
  /** TEZGAH = satış; YEDEK_PARCA / AKSESUAR = satış + servis */
  categoryCode?: "TEZGAH" | "AKSESUAR" | "YEDEK_PARCA";
  category?: string;
  reservedCompanyId?: string;
  reservedCompanyName?: string;
  optionalHardware?: string;
  spareParts?: string;
  productId?: string;
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


export type ShipmentStatus = "Hazırlanıyor" | "Yolda" | "Gümrükte" | "Teslim Edildi";
export const SHIPMENT_STATUSES: ShipmentStatus[] = ["Hazırlanıyor", "Yolda", "Gümrükte", "Teslim Edildi"];
export type Shipment = {
  id: string;
  salesCaseId: string;
  trackingNo: string;
  carrier: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  eta: string;
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
