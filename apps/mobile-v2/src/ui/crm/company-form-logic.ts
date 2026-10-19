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
  /** Web CreateCustomerDialog adres rolleri (birincil adres). */
  addressIsDefault: boolean;
  addressIsShipping: boolean;
  addressIsBilling: boolean;
  /** Web `additionalAddresses` — birincil dışındaki adresler. */
  additionalAddresses: AdditionalAddressDraft[];
  taxOffice: string;
  taxNumber: string;
  notes: string;
};

export type AddressRoleKey = 'isDefault' | 'isShipping' | 'isBilling';

export type AdditionalAddressDraft = {
  key: string;
  id?: string;
  addressType: AddressTypeCode;
  country: string;
  city: string;
  district: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
  isShipping: boolean;
  isBilling: boolean;
};

let addressKey = 0;
export function emptyAdditionalAddress(): AdditionalAddressDraft {
  addressKey += 1;
  return {
    key: `addr-${Date.now()}-${addressKey}`,
    addressType: 'factory',
    country: 'Türkiye',
    city: '',
    district: '',
    address: '',
    latitude: null,
    longitude: null,
    isDefault: false,
    isShipping: false,
    isBilling: false,
  };
}

/** Web `normalizeAddressRoles` — her rol en fazla bir adreste. */
export function normalizeAddressRoles<T extends { isDefault?: boolean; isShipping?: boolean; isBilling?: boolean }>(
  addresses: T[]
): T[] {
  const claimed = new Set<AddressRoleKey>();
  return addresses.map((address) => {
    const next = { ...address };
    for (const role of ['isDefault', 'isShipping', 'isBilling'] as const) {
      const selected = Boolean(address[role]) && !claimed.has(role);
      next[role] = selected;
      if (selected) claimed.add(role);
    }
    return next;
  });
}

/** Web `toggleAddressRole` — seçilen adrese verir, diğerlerinden alır. */
export function toggleAddressRole<T extends { isDefault?: boolean; isShipping?: boolean; isBilling?: boolean }>(
  addresses: T[],
  role: AddressRoleKey,
  selectedIndex: number
): T[] {
  const shouldSelect = !addresses[selectedIndex]?.[role];
  return addresses.map((address, index) => ({
    ...address,
    [role]: shouldSelect && index === selectedIndex,
  }));
}

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
  addressIsDefault: true,
  addressIsShipping: true,
  addressIsBilling: true,
  additionalAddresses: [],
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

function addressHasContent(row: { city: string; district: string; address: string }) {
  return Boolean(row.city.trim() || row.district.trim() || row.address.trim());
}

function toApiAddress(row: {
  id?: string;
  addressType: AddressTypeCode;
  country: string;
  city: string;
  district: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
  isShipping: boolean;
  isBilling: boolean;
}) {
  return {
    ...(row.id ? { id: row.id } : {}),
    addressType: row.addressType,
    country: text(row.country) ?? 'Türkiye',
    province: text(row.city),
    district: text(row.district),
    fullAddress: text(row.address),
    latitude: row.latitude != null && row.longitude != null ? row.latitude : undefined,
    longitude: row.latitude != null && row.longitude != null ? row.longitude : undefined,
    isDefault: row.isDefault,
    isShipping: row.isShipping,
    isBilling: row.isBilling,
  };
}

/** Birincil + ek adresler → API `addresses[]` (rol normalize edilmiş). */
export function collectCompanyAddresses(form: CompanyFormState) {
  const primary = {
    addressType: form.addressType,
    country: form.country,
    city: form.city,
    district: form.district,
    address: form.address,
    latitude: form.latitude,
    longitude: form.longitude,
    isDefault: form.addressIsDefault,
    isShipping: form.addressIsShipping,
    isBilling: form.addressIsBilling,
  };
  const rows = [
    ...(addressHasContent(primary) ? [primary] : []),
    ...form.additionalAddresses.filter(addressHasContent).map((row) => ({
      id: row.id,
      addressType: row.addressType,
      country: row.country,
      city: row.city,
      district: row.district,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      isDefault: row.isDefault,
      isShipping: row.isShipping,
      isBilling: row.isBilling,
    })),
  ];
  if (!rows.length) return undefined;
  return normalizeAddressRoles(rows).map(toApiAddress);
}

/** İrtibat şekli: serbest metin yazıldıysa kod gönderilmez (sunucu ikisini birden reddeder). */
function contactSource(form: CompanyFormState) {
  const contactSourceText = text(form.contactSourceText);
  return { contactSourceCode: contactSourceText ? undefined : text(form.contactSourceCode), contactSourceText };
}

/** Web store.addCustomer gövdesi. */
export function buildCompanyCreateBody(form: CompanyFormState) {
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
    addresses: collectCompanyAddresses(form),
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

function addressesChanged(initial: CompanyFormState, form: CompanyFormState) {
  if (
    changedPrimaryAddress(initial, form) ||
    initial.additionalAddresses.length !== form.additionalAddresses.length
  ) {
    return true;
  }
  return form.additionalAddresses.some((row, index) => {
    const prev = initial.additionalAddresses[index];
    if (!prev) return true;
    return (
      prev.id !== row.id ||
      prev.addressType !== row.addressType ||
      prev.country !== row.country ||
      prev.city !== row.city ||
      prev.district !== row.district ||
      prev.address !== row.address ||
      prev.latitude !== row.latitude ||
      prev.longitude !== row.longitude ||
      prev.isDefault !== row.isDefault ||
      prev.isShipping !== row.isShipping ||
      prev.isBilling !== row.isBilling
    );
  });
}

function changedPrimaryAddress(initial: CompanyFormState, form: CompanyFormState) {
  return (
    initial.addressType !== form.addressType ||
    initial.country !== form.country ||
    initial.city !== form.city ||
    initial.district !== form.district ||
    initial.address !== form.address ||
    initial.latitude !== form.latitude ||
    initial.longitude !== form.longitude ||
    initial.addressIsDefault !== form.addressIsDefault ||
    initial.addressIsShipping !== form.addressIsShipping ||
    initial.addressIsBilling !== form.addressIsBilling
  );
}

/**
 * Düzenleme: yalnız değişen alanlar gönderilir. Adres listesi değiştiyse web
 * gibi tam `addresses[]` replace (ek adres ekle/sil/rol).
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

  if (addressesChanged(initial, form)) {
    patch.addresses = collectCompanyAddresses(form) ?? [];
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
    id?: string;
    addressType: string;
    country: string | null;
    province: string | null;
    district: string | null;
    fullAddress: string | null;
    latitude: string | number | null;
    longitude: string | number | null;
    isDefault: boolean;
    isShipping?: boolean;
    isBilling?: boolean;
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
  const ordered = [...detail.addresses];
  const primaryIndex = Math.max(
    0,
    ordered.findIndex((row) => row.isDefault),
  );
  const address = ordered[primaryIndex] ?? ordered[0];
  const additionalAddresses = ordered
    .filter((_, index) => index !== primaryIndex)
    .map((row) => {
      const draft = emptyAdditionalAddress();
      return {
        ...draft,
        id: row.id,
        addressType: (ADDRESS_TYPE_OPTIONS.some((option) => option.value === row.addressType)
          ? row.addressType
          : 'factory') as AddressTypeCode,
        country: row.country || 'Türkiye',
        city: row.province ?? '',
        district: row.district ?? '',
        address: row.fullAddress ?? '',
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        isDefault: row.isDefault,
        isShipping: row.isShipping ?? false,
        isBilling: row.isBilling ?? false,
      };
    });
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
    addressIsDefault: address?.isDefault ?? true,
    addressIsShipping: address?.isShipping ?? true,
    addressIsBilling: address?.isBilling ?? true,
    additionalAddresses,
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
