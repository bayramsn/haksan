import type {
  LeadAuthorityStatusCode,
  LeadBudgetStatusCode,
  LeadInsights,
  LeadPurchaseTimeframeCode,
  LeadTechnicalFitCode,
  ProcessCheck,
} from "../index";
export type Contact = {
  id: string;
  /** Kaynak CRM/Excel sistemindeki kalıcı kontak numarası. */
  contactNo?: string;
  /** Kontağın birincil firmasının kaynak sistem numarası. */
  companyNo?: string;
  customerId: string;
  companyIds?: string[];
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
  favoriteColor?: string;
  graduatedSchool?: string;
  isPrimary: boolean;
  note?: string;
  isBlacklisted?: boolean;
  blacklistReason?: string;
  createdAt: string;
  createdByUserId?: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
};
export type Customer = {
  id: string;
  logoFileId?: string | null;
  logoUrl?: string;
  /** Kaynak CRM/Excel sistemindeki kalıcı firma numarası. */
  companyNo?: string;
  type: "person" | "company";
  firmType: FirmType;
  salesStatus?: CustomerSalesStatus;
  /** Firmanın portföyünde olduğu bölümler (CNC / Üniversal / Sac İşleme). */
  divisions?: Array<{ id: string; code?: string | null; name: string }>;
  divisionId?: string;
  companyGroupCode?: string;
  companyGroupName?: string;
  companyGroupCodes?: string[];
  companyGroupNames?: string[];
  contactSourceCode?: string;
  contactSourceText?: string;
  sector?: string;
  /** Tedarikçinin sevkiyat rolü; yalnızca tedarikçi ilişkili firmalarda kullanılır. */
  supplierCategoryCode?: "transportation" | "logistics" | "manufacturer";
  name: string;
  /** Resmî unvanın belge metnindeki kısa karşılığı (örn. NORM İNOX METAL). */
  shortName?: string;
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
  addresses?: CompanyAddress[];
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
  createdByUserId?: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
};
export type Offer = {
  id: string;
  salesCaseId: string;
  companyId?: string;
  companyAddressId?: string;
  divisionId?: string;
  divisionCode?: string;
  divisionName?: string;
  businessLine?: "CNC" | "UNI" | "SACISLE";
  quoteNo: string;
  /** Teklifin ilk ana kalemindeki ürün kartı adı. */
  productName?: string;
  revision: number;
  date: string;
  validityDays?: number;
  amount: number;
  /** KDV hariç net ara toplam (indirim sonrası). Boşsa amount brüt kabul edilir. */
  subtotal?: number;
  /** Hesaplanan KDV tutarı. */
  vatTotal?: number;
  currency: "USD" | "EUR" | "TRY";
  status:
    | "Draft"
    | "Sent"
    | "Approved"
    | "Rejected"
    | "Pending Approval"
    | "Cancelled"
    | "Price Waiting"
    | "Budget Waiting"
    | "On Hold"
    | "Postponed";
  priceApprovalStatus?: 'not_required' | 'pending' | 'approved' | 'rejected';
  followUpAt?: string;
  statusNote?: string;
  note: string;
};
export type Product = {
  baseModelConfiguration?: BaseModelConfiguration | null;
  laserBaseConfiguration?: LaserBaseConfiguration | null;
  id: string;
  divisionId?: string;
  brand: string;
  brandId?: string;
  brandLogoFileId?: string | null;
  brandLogoUrl?: string;
  series?: string;
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
  listPrice?: number | null;
  cashPrice?: number | null;
  currency: "USD" | "EUR" | "TRY";
  vatRate?: number;
  originCountry?: string;
  hsCode?: string;
  stockCode?: string;
  specs: ProductSpec[];
  technicalConfiguration?: import('../index').LaserTechnicalConfiguration | null;
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
export type SalesCase = {
  id: string;
  /** Firma henüz bağlanmadıysa hızlı lead kartlarında boş string olur. */
  customerId: string;
  /** Tenant içindeki ticari bölüm kapsamı (CNC / Üniversal / Sac İşleme). */
  divisionId?: string;
  primaryContactId?: string;
  /** Firma ana kaydı oluşmadan önce satış kartında tutulan lead bağlamı. */
  leadContactName?: string;
  leadCompanyTitle?: string;
  leadContactValue?: string;
  leadContactMethodCode?: string;
  leadContactMethodName?: string;
  leadCity?: string;
  leadDistrict?: string;
  leadPhone?: string;
  leadEmail?: string;
  /** Firmanın alım niyeti — sıcak / beklemede / soğuk. */
  leadTemperature?: LeadTemperature;
  /** Lead havuzundaki günlük takip durumu. */
  leadFollowUpStatus?: LeadFollowUpStatus;
  /** Açıklanabilir beşli lead nitelendirme yüzeyi. */
  leadNeedSummary?: string;
  leadAuthorityStatus?: LeadAuthorityStatusCode;
  leadBudgetStatus?: LeadBudgetStatusCode;
  leadPurchaseTimeframe?: LeadPurchaseTimeframeCode;
  leadTechnicalFit?: LeadTechnicalFitCode;
  leadTechnicalNote?: string;
  /** Sunucunun CRM alanlarından deterministik olarak türettiği skorlar. */
  leadInsights?: LeadInsights;
  /** Satış ekibinin bir sonraki somut aksiyonu ve hedef zamanı. */
  nextAction?: string;
  nextActionAt?: string;
  externalSource?: string;
  externalKey?: string;
  externalUrl?: string;
  externalMetadata?: {
    boardName?: string | null;
    listName?: string | null;
    labels?: string | null;
    members?: string | null;
    trelloCardId?: string | null;
    candidate?: {
      companyTitle?: string;
      locationHint?: string;
      contactName?: string;
      phone?: string;
      email?: string;
    };
  };
  assignedUserId: string;
  department: string;
  requestedProduct: string;
  requestedModel: string;
  /** Fırsatta konuşulan makineler; fırsat firma bazlı olduğu için birden çok olabilir. */
  machines?: { id?: string; productModelId?: string; name: string; quantity: number }[];
  description?: string;
  quantity: number;
  estimatedAmount: number;
  currency: "USD" | "EUR" | "TRY";
  /** CRM tahmin olasılığı; 0–100 aralığında yüzde. */
  probability?: number;
  /** Satış ekibinin hedeflediği kapanış tarihi. */
  expectedCloseDate?: string;
  stage: SalesStage;
  qualificationStage: QualificationStage;
  qualificationNote?: string;
  requestedMachine?: string;
  contractTerms?: string;
  paymentTerms?: string;
  qualificationReadiness?: {
    stage: QualificationStage;
    nextStage: QualificationStage | null;
    ready: boolean;
    blockers: string[];
    /** Süreç adımları — `manualEditable` olanlar A+ alanında elle işaretlenir. */
    checks: ProcessCheck[];
    approvals: Partial<Record<OpportunityApprovalType, OpportunityApprovalStatus>>;
    /** Süreç sağlığı: aşamada bekleme, lead SLA aşımı ve takip aksiyonu durumu. */
    health?: {
      stageAgeDays: number | null;
      stageAgeLimitDays: number | null;
      rotting: boolean;
      leadStatus: LeadFollowUpStatus;
      leadSlaHours: number | null;
      leadStatusAgeHours: number | null;
      leadSlaBreached: boolean;
      contactAttemptCount: number;
      attemptLimitReached: boolean;
      firstContactAt: string | null;
      actionOverdue: boolean;
      actionMissing: boolean;
    };
  };
  /** Makine satışında ödeme vadesi (gün); sözleşme/ödeme planı varsayılanı. */
  paymentTermDays?: number;
  /** Lead aşamasında seçilen ticari ödeme yöntemi. */
  paymentMethod?: OpportunityPaymentMethod;
  isOfferPrepared: boolean;
  isLost: boolean;
  lostReasonCode?: string;
  lostReason?: string;
  lostCompanyName?: string;
  lostProductName?: string;
  lostUnmetConditions?: string;
  lostCompetitorId?: string;
  competitor?: string;
  lostCompetitorProductModel?: string;
  /** WIN/kazanılan fırsat kapatılırken seçilen gerekçe. */
  wonReason?: string;
  /** WIN anında satılan (onaylanmış) tekliflerin makineleri. */
  wonProductName?: string;
  createdAt: string;
  closedAt?: string;
};
export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  roleCodes?: string[];
  roleNames?: string[];
  divisionIds?: string[];
  department: string;
  departmentId?: string | null;
  /** Ünvan (CRM Alan Ayarları > Kullanıcı Ünvanları) — belge imza satırında yazar. */
  title?: string | null;
  active: boolean;
  avatarUrl?: string;
  purchaseApprovalLimit?: number;
  managerId?: string;
};
export type DocumentItem = {
  id: string;
  salesCaseId: string;
  /** Belgenin silme/güncelleme akışını belirleyen kalıcı kaynak türü. */
  source?: "uploaded_file" | "commercial_record" | "live_form";
  /** Proforma / sözleşme / fatura kaydının bağlı olduğu teklif. */
  quoteId?: string;
  companyId?: string;
  /** Kayıtlı firması olmayan hızlı proformada elle girilen unvan. */
  companyNameText?: string;
  /** Servis talebine bağlı ek (service kanban kartı). */
  serviceRequestId?: string;
  /** Kasa hareketine eklenen ödeme fişi / fatura dosyası. */
  paymentId?: string;
  /** Canlı teslim/kurulum formu kayıtları için üretilmiş doküman referansları. */
  deliveryId?: string;
  installationId?: string;
  installationData?: any;
  /** Kesinleşme anındaki firma, kontak, kalem ve şartların değişmez kopyası. */
  documentSnapshot?: Record<string, any>;
  type:
    | "Proforma"
    | "Contract"
    | "CommercialInvoice"
    | "AccountingInvoice"
    | "DeliveryForm"
    | "InstallationForm"
    | "ExternalQuote"
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
  /** Beklenen tahsilatın sözleşme planındaki ayrıntılı ödeme aracı. */
  plannedPaymentMethod?: OpportunityPaymentMethod;
  /** Durum güncellemesinin hangi backend tablosuna gideceğini belirler. */
  source?: "receivable" | "payment";
};
export type ProductSpec = { key: string; value: string; unit?: string; specUnit?: string; groupCode?: string; groupName?: string };
export type OpportunityPaymentMethod =
  | "undecided"
  | "cash"
  | "wire_transfer"
  | "promissory_note"
  | "term"
  | "installment"
  | "leasing"
  | "letter_of_credit"
  | "cheque";
export type FirmType = "customer" | "supplier_customer" | "supplier" | "competitor";
export type CustomerSalesStatus = "potential" | "active_customer";
export type CompanyAddress = {
  id?: string;
  addressType: "office" | "factory" | "work_area" | "shipping" | "billing" | "other";
  country: string;
  city?: string;
  district?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  locationSource?: string;
  isDefault?: boolean;
  isShipping?: boolean;
  isBilling?: boolean;
};
export type BaseModelConfiguration = import('../index').BaseModelConfiguration;
export type LaserBaseConfiguration = import('../index').LaserBaseConfiguration;
export type ProductAlternative = {
  id: string;
  brand: string;
  brandLogoUrl?: string;
  model: string;
  shortDescription: string;
  category: string;
  categoryCode?: string;
  type?: string;
  listPrice?: number | null;
  currency?: "USD" | "EUR" | "TRY";
};
export type LeadTemperature = "hot" | "waiting" | "cold" | "unknown";
export type LeadFollowUpStatus = "new" | "attempting" | "contacted" | "waiting" | "disqualified";
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
export type QualificationStage = "lead" | "c" | "b" | "a" | "a_plus" | "win" | "lost";
export type OpportunityApprovalType = "payment" | "customs" | "invoice" | "installation" | "win";
export type OpportunityApprovalStatus = "pending" | "approved" | "rejected";
export type Role = "SuperAdmin" | "Admin" | "Sales" | "Service";