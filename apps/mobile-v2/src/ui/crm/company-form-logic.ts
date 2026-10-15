/** Web CreateCustomerDialog / EditCustomerDialog form kuralları; saf mantık. */

export type FirmTypeCode = 'customer' | 'supplier' | 'supplier_customer' | 'competitor';
export type SupplierCategory = 'manufacturer' | 'transportation' | 'logistics';
export type SalesStatus = 'active_customer' | 'potential';
export type AddressTypeCode = 'office' | 'factory' | 'work_area' | 'shipping' | 'billing' | 'other';

export const FIRM_TYPE_OPTIONS: { value: FirmTypeCode; label: string }[] = [
  { value: 'customer', label: 'Müşteri' },
  { value: 'supplier', label: 'Tedarikçi' },
  { value: 'supplier_customer', label: 'Müşteri + Tedarikçi' },
  { value: 'competitor', label: 'Rakip' },
];

export const SUPPLIER_CATEGORY_OPTIONS: { value: SupplierCategory; label: string; helper: string }[] = [
  { value: 'manufacturer', label: 'Makine üreticisi', helper: 'Makine ve ekipman üretimi' },
  { value: 'transportation', label: 'Nakliye', helper: 'Karayolu, deniz veya hava taşımacılığı' },
  { value: 'logistics', label: 'Lojistik', helper: 'Kargo, depolama ve dağıtım hizmeti' },
];

export const SALES_STATUS_OPTIONS: { value: SalesStatus; label: string }[] = [
  { value: 'active_customer', label: 'Cari' },
  { value: 'potential', label: 'Potansiyel' },
];

export const ADDRESS_TYPE_OPTIONS: { value: AddressTypeCode; label: string }[] = [
  { value: 'office', label: 'Ofis' },
  { value: 'factory', label: 'Fabrika' },
  { value: 'work_area', label: 'Çalışma Alanı' },
  { value: 'shipping', label: 'Sevkiyat' },
  { value: 'billing', label: 'Fatura' },
  { value: 'other', label: 'Diğer' },
];

/** Web COMPANY_GROUP_OPTIONS: sunucu listesi gelmezse yedek ve görünür kod filtresi. */
export const COMPANY_GROUP_FALLBACK = [
  { code: 'a_group', name: 'A Grubu (Sıcak/Büyük)' },
  { code: 'b_group', name: 'B Grubu (Orta)' },
  { code: 'dealer_second_hand', name: 'Bayi / 2. Elci' },
  { code: 'potential_cnc_customer', name: 'Potansiyel CNC Müşterisi' },
];
export const COMPANY_GROUP_CODES = new Set(COMPANY_GROUP_FALLBACK.map((row) => row.code));

export const CONTACT_SOURCE_FALLBACK = [
  { code: 'maktek_2024_fair', name: 'MAKTEK 2024 / Fuar' },
  { code: 'musiad_expo', name: 'MÜSİAD Expo' },
  { code: 'harun_aslanbay_reference', name: 'Harun Aslanbay (Referans)' },
  { code: 'website_inbound_call', name: 'Web Sitesi / Gelen Çağrı' },
  { code: 'cold_call_field', name: 'Soğuk Arama / Saha' },
  { code: 'visit', name: 'Ziyaret' },
];

/** Web BUSINESS_UNIT_CODES: "Bağlı Bulunduğu Birim" yalnız iş birimlerini listeler. */
export const BUSINESS_UNIT_CODES = new Set(['cnc', 'universal', 'sac_isleme']);

export type CompanyFormState = {
  companyType: 'company' | 'person';
  firmType: FirmTypeCode;
  supplierCategoryCode: SupplierCategory | '';
  salesStatus: SalesStatus | '';
  divisionIds: string[];
  companyGroupCode: string;
  contactSourceCode: string;
  contactSourceText: string;
  sector: string;
  legalTitle: string;
  shortName: string;
  phone: string;
  phone2: string;
  fax: string;
  email: string;
  email2: string;
  website: string;
  addressType: AddressTypeCode;
  country: string;
  city: string;
  district: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  taxOffice: string;
  taxNumber: string;
  notes: string;
};

export const EMPTY_COMPANY_FORM: CompanyFormState = {
  companyType: 'company',
  firmType: 'customer',
  supplierCategoryCode: '',
  salesStatus: 'potential',
  divisionIds: [],
  companyGroupCode: '',
  contactSourceCode: '',
  contactSourceText: '',
  sector: '',
  legalTitle: '',
  shortName: '',
  phone: '',
  phone2: '',
  fax: '',
  email: '',
  email2: '',
  website: '',
  addressType: 'office',
  country: 'Türkiye',
  city: '',
  district: '',
  address: '',
  latitude: null,
  longitude: null,
  taxOffice: '',
  taxNumber: '',
  notes: '',
};

export const needsSupplierCategory = (firmType: FirmTypeCode) => firmType === 'supplier' || firmType === 'supplier_customer';

export type CompanyFormErrors = Partial<Record<'legalTitle' | 'supplierCategoryCode' | 'divisionIds', string>>;

/** Web submit sırası ve metinleri. */
export function validateCompanyForm(form: CompanyFormState): CompanyFormErrors {
  const errors: CompanyFormErrors = {};
  if (!form.legalTitle.trim()) errors.legalTitle = 'Firma ünvanı zorunludur';
  if (needsSupplierCategory(form.firmType) && !form.supplierCategoryCode) errors.supplierCategoryCode = 'Tedarikçi türü seçiniz';
  if (form.divisionIds.length === 0) errors.divisionIds = 'Bağlı bulunduğu birimi seçiniz';
  return errors;
}

const text = (value: string) => value.trim() || undefined;

/** İrtibat şekli: serbest metin yazıldıysa kod gönderilmez (sunucu ikisini birden reddeder). */
function contactSource(form: CompanyFormState) {
  const contactSourceText = text(form.contactSourceText);
  return { contactSourceCode: contactSourceText ? undefined : text(form.contactSourceCode), contactSourceText };
}

/** Web store.addCustomer gövdesi. */
export function buildCompanyCreateBody(form: CompanyFormState) {
  const hasAddress = Boolean(form.address.trim() || form.city.trim() || form.district.trim());
  const hasCoordinates = form.latitude != null && form.longitude != null;
  const name = form.legalTitle.trim();
  return {
    companyType: form.companyType,
    legalTitle: name,
    shortName: form.companyType === 'person' ? name : text(form.shortName),
    sector: text(form.sector),
    supplierCategoryCode: needsSupplierCategory(form.firmType) && form.supplierCategoryCode ? form.supplierCategoryCode : undefined,
    taxOffice: text(form.taxOffice),
    taxNumber: text(form.taxNumber),
    website: text(form.website),
    primaryPhone: text(form.phone),
    secondaryPhone: text(form.phone2),
    fax: text(form.fax),
    primaryEmail: text(form.email),
    secondaryEmail: text(form.email2),
    addresses: hasAddress
      ? [
          {
            addressType: form.addressType,
            country: text(form.country) ?? 'Türkiye',
            province: text(form.city),
            district: text(form.district),
            fullAddress: text(form.address),
            latitude: hasCoordinates ? form.latitude! : undefined,
            longitude: hasCoordinates ? form.longitude! : undefined,
            isDefault: true,
            isShipping: true,
            isBilling: true,
          },
        ]
      : undefined,
    notes: text(form.notes),
    relationTypeCode: form.firmType,
    customerStatusCode: form.salesStatus === 'active_customer' ? ('active' as const) : ('potential' as const),
    companyGroupCodes: form.companyGroupCode ? [form.companyGroupCode] : undefined,
    divisionIds: form.divisionIds.length ? form.divisionIds : undefined,
    ...contactSource(form),
  };
}

const nullable = (value: string) => value.trim() || null;
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((item) => b.includes(item));

/**
 * Düzenleme: yalnız değişen alanlar gönderilir; başka kullanıcının aynı anda
 * yaptığı değişiklik ezilmez. Adres değişikliği tek satır `address` yamasıdır
 * (sunucu gönderilmeyen adres alanlarını korur).
 */
export function buildCompanyUpdatePatch(initial: CompanyFormState, form: CompanyFormState): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const changed = <K extends keyof CompanyFormState>(key: K) => initial[key] !== form[key];

  if (changed('companyType')) patch.companyType = form.companyType;
  if (changed('legalTitle')) patch.legalTitle = form.legalTitle.trim();
  if (changed('shortName')) patch.shortName = nullable(form.shortName);
  if (changed('sector')) patch.sector = nullable(form.sector);
  if (changed('firmType')) patch.relationTypeCode = form.firmType;
  if (changed('supplierCategoryCode') || (changed('firmType') && !needsSupplierCategory(form.firmType))) {
    patch.supplierCategoryCode = needsSupplierCategory(form.firmType) && form.supplierCategoryCode ? form.supplierCategoryCode : null;
  }
  if (changed('salesStatus') && form.salesStatus) {
    patch.customerStatusCode = form.salesStatus === 'active_customer' ? 'active' : 'potential';
  }
  if (!sameList(initial.divisionIds, form.divisionIds)) patch.divisionIds = form.divisionIds;
  if (changed('companyGroupCode')) patch.companyGroupCodes = form.companyGroupCode ? [form.companyGroupCode] : [];
  if (changed('contactSourceCode') || changed('contactSourceText')) {
    const contactSourceText = form.contactSourceText.trim();
    patch.contactSourceCode = contactSourceText ? null : form.contactSourceCode.trim() || null;
    patch.contactSourceText = contactSourceText || null;
  }
  if (changed('phone')) patch.primaryPhone = nullable(form.phone);
  if (changed('phone2')) patch.secondaryPhone = nullable(form.phone2);
  if (changed('fax')) patch.fax = nullable(form.fax);
  if (changed('email')) patch.primaryEmail = nullable(form.email);
  if (changed('email2')) patch.secondaryEmail = nullable(form.email2);
  if (changed('website')) patch.website = nullable(form.website);
  if (changed('taxOffice')) patch.taxOffice = nullable(form.taxOffice);
  if (changed('taxNumber')) patch.taxNumber = nullable(form.taxNumber);
  if (changed('notes')) patch.notes = nullable(form.notes);

  const address: Record<string, unknown> = {};
  if (changed('city')) address.province = form.city.trim() || undefined;
  if (changed('district')) address.district = form.district.trim() || undefined;
  if (changed('address')) address.fullAddress = form.address.trim() || undefined;
  if (changed('latitude') || changed('longitude')) {
    if (form.latitude != null && form.longitude != null) {
      address.latitude = form.latitude;
      address.longitude = form.longitude;
    }
  }
  if (Object.keys(address).length > 0 || changed('country')) {
    // Şemadaki `country` varsayılanı ('Türkiye') mevcut ülkeyi ezmesin diye her zaman gönderilir.
    patch.address = { ...address, country: form.country.trim() || 'Türkiye' };
  }
  return patch;
}

type DetailLike = {
  companyType: string;
  relationTypeId: string | null;
  customerStatusId: string | null;
  supplierCategoryCode?: string | null;
  contactSourceId?: string | null;
  contactSourceText?: string | null;
  sector: string | null;
  legalTitle: string;
  shortName: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  website: string | null;
  notes: string | null;
  addresses: {
    addressType: string;
    country: string | null;
    province: string | null;
    district: string | null;
    fullAddress: string | null;
    latitude: string | number | null;
    longitude: string | number | null;
    isDefault: boolean;
  }[];
  phones: { phoneType: string; phone: string; isDefault?: boolean }[];
  emails: { emailType: string; email: string; isDefault?: boolean }[];
  divisions: { id: string }[];
  companyGroups: { code: string }[];
};

type LookupLike = { id: string; code: string };

const codeOf = (rows: LookupLike[] | undefined, id: string | null | undefined) =>
  (id && rows?.find((row) => row.id === id)?.code) || '';

const toNumber = (value: string | number | null | undefined) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** `GET /companies/:id` ham satırını forma çevirir (kimlik → kod eşlemesi lookup listelerinden). */
export function companyFormFromDetail(
  detail: DetailLike,
  lookups: { relationTypes?: LookupLike[]; statuses?: LookupLike[]; contactSources?: LookupLike[] },
): CompanyFormState {
  const relation = codeOf(lookups.relationTypes, detail.relationTypeId);
  const status = codeOf(lookups.statuses, detail.customerStatusId);
  const address = detail.addresses.find((row) => row.isDefault) ?? detail.addresses[0];
  const phone = (type: string) => detail.phones.find((row) => row.phoneType === type)?.phone ?? '';
  const email = (type: string) => detail.emails.find((row) => row.emailType === type)?.email ?? '';
  const supplier = detail.supplierCategoryCode;
  return {
    companyType: detail.companyType === 'person' ? 'person' : 'company',
    firmType: (['customer', 'supplier', 'supplier_customer', 'competitor'] as string[]).includes(relation)
      ? (relation as FirmTypeCode)
      : 'customer',
    supplierCategoryCode: supplier === 'manufacturer' || supplier === 'transportation' || supplier === 'logistics' ? supplier : '',
    salesStatus: status === 'active' ? 'active_customer' : status === 'potential' ? 'potential' : '',
    divisionIds: detail.divisions.map((division) => division.id),
    companyGroupCode: detail.companyGroups[0]?.code ?? '',
    contactSourceCode: codeOf(lookups.contactSources, detail.contactSourceId),
    contactSourceText: detail.contactSourceText ?? '',
    sector: detail.sector ?? '',
    legalTitle: detail.legalTitle,
    shortName: detail.shortName ?? '',
    phone: phone('main') || detail.phones.find((row) => row.isDefault)?.phone || '',
    phone2: phone('secondary'),
    fax: phone('fax'),
    email: email('main') || detail.emails.find((row) => row.isDefault)?.email || '',
    email2: email('secondary'),
    website: detail.website ?? '',
    addressType: (ADDRESS_TYPE_OPTIONS.some((option) => option.value === address?.addressType)
      ? address?.addressType
      : 'office') as AddressTypeCode,
    country: address?.country || 'Türkiye',
    city: address?.province ?? '',
    district: address?.district ?? '',
    address: address?.fullAddress ?? '',
    latitude: toNumber(address?.latitude),
    longitude: toNumber(address?.longitude),
    taxOffice: detail.taxOffice ?? '',
    taxNumber: detail.taxNumber ?? '',
    notes: detail.notes ?? '',
  };
}

/** Web CompanyWebsiteLookup.onApply: yalnız boş alanlar doldurulur. */
export function applyWebsiteSuggestion(
  form: CompanyFormState,
  suggestion: {
    website: string;
    address?: string;
    city?: string;
    district?: string;
    country?: string;
    phone?: string;
    email?: string;
    latitude?: number;
    longitude?: number;
  },
): CompanyFormState {
  return {
    ...form,
    website: form.website.trim() || suggestion.website,
    address: form.address.trim() || suggestion.address || '',
    city: form.city.trim() || suggestion.city || '',
    district: form.district.trim() || suggestion.district || '',
    country: form.country.trim() || suggestion.country || 'Türkiye',
    phone: form.phone.trim() || suggestion.phone || '',
    email: form.email.trim() || suggestion.email || '',
    latitude: form.latitude ?? suggestion.latitude ?? null,
    longitude: form.longitude ?? suggestion.longitude ?? null,
  };
}
