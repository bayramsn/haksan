import { resolveMediaUrl } from "../../lib/apiClient";
import type { CompanyAddressDTO, CompanyDTO } from "../../lib/services";
import type { CompanyAddress, Customer, CustomerSalesStatus, FirmType } from "./mock";

const VISIBLE_COMPANY_GROUP_CODES = new Set([
  "a_group",
  "b_group",
  "dealer_second_hand",
  "potential_cnc_customer",
]);

const COMPANY_ADDRESS_TYPES = new Set<CompanyAddress["addressType"]>([
  "office",
  "factory",
  "work_area",
  "shipping",
  "billing",
  "other",
]);

const relationType = (value?: string | null, fallback?: FirmType): FirmType =>
  value === "customer" || value === "supplier_customer" || value === "supplier" || value === "competitor"
    ? value
    : fallback ?? "customer";

const salesStatus = (value?: string | null, fallback?: CustomerSalesStatus): CustomerSalesStatus =>
  value === "active" ? "active_customer" : value === "potential" ? "potential" : fallback ?? "potential";

const finiteCoordinate = (value?: string | number | null): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const addressType = (value?: string | null): CompanyAddress["addressType"] =>
  value && COMPANY_ADDRESS_TYPES.has(value as CompanyAddress["addressType"])
    ? value as CompanyAddress["addressType"]
    : "office";

const normalizeAddress = (address: CompanyAddressDTO): CompanyAddress => ({
  id: address.id,
  addressType: addressType(address.addressType),
  country: address.country ?? "Türkiye",
  city: address.province ?? "",
  district: address.district ?? "",
  address: address.fullAddress ?? "",
  latitude: finiteCoordinate(address.latitude),
  longitude: finiteCoordinate(address.longitude),
  locationSource: address.locationSource ?? undefined,
  isDefault: Boolean(address.isDefault),
  isShipping: Boolean(address.isShipping),
  isBilling: Boolean(address.isBilling),
});

const primaryPhone = (company: CompanyDTO) => {
  if (company.primaryPhone) return company.primaryPhone;
  const phones = company.phones ?? [];
  return phones.find((phone) => phone.phoneType === "main")?.phone
    ?? phones.find((phone) => phone.isDefault)?.phone
    ?? phones[0]?.phone
    ?? "";
};

const secondaryPhone = (company: CompanyDTO) =>
  company.secondaryPhone
  ?? company.phones?.find((phone) => phone.phoneType === "secondary")?.phone
  ?? "";

const fax = (company: CompanyDTO) =>
  company.fax
  ?? company.phones?.find((phone) => phone.phoneType === "fax")?.phone
  ?? "";

const primaryEmail = (company: CompanyDTO) => {
  if (company.primaryEmail) return company.primaryEmail;
  const emails = company.emails ?? [];
  return emails.find((email) => email.emailType === "main")?.email
    ?? emails.find((email) => email.isDefault)?.email
    ?? emails[0]?.email
    ?? "";
};

const secondaryEmail = (company: CompanyDTO) =>
  company.secondaryEmail
  ?? company.emails?.find((email) => email.emailType === "secondary")?.email
  ?? "";

/**
 * Converts the companies API shape into the legacy UI domain model.
 *
 * `fallback` is intentionally optional: detail responses do not repeat every
 * joined lookup in older API versions, so a freshly fetched detail can retain
 * the relation/status labels already present on its list row.
 */
export function normalizeCompany(company: CompanyDTO, fallback?: Customer): Customer {
  const rawAddresses = company.addresses?.length
    ? company.addresses
    : company.primaryAddress
      ? [company.primaryAddress]
      : [];
  const primaryAddress = company.primaryAddress
    ?? rawAddresses.find((address) => address.isDefault)
    ?? rawAddresses[0];
  const addresses = rawAddresses.map(normalizeAddress);
  const companyGroups = (company.companyGroups?.length
    ? company.companyGroups
    : company.companyGroup
      ? [company.companyGroup]
      : [])
    .filter((group) => VISIBLE_COMPANY_GROUP_CODES.has(group.code));

  return {
    id: company.id,
    logoFileId: company.logoFileId ?? fallback?.logoFileId ?? null,
    logoUrl: resolveMediaUrl(company.logoUrl) || fallback?.logoUrl,
    companyNo: company.externalCompanyNo ?? fallback?.companyNo ?? "",
    type: company.companyType === "person" ? "person" : fallback?.type ?? "company",
    firmType: relationType(company.relationType?.code, fallback?.firmType),
    salesStatus: salesStatus(company.customerStatus?.code, fallback?.salesStatus),
    divisions: Array.isArray(company.divisions)
      ? company.divisions
          .filter((division): division is typeof division & { id: string } => Boolean(division.id))
          .map((division) => ({ id: division.id, code: division.code ?? null, name: division.name ?? "" }))
      : fallback?.divisions ?? [],
    companyGroupCode: companyGroups[0]?.code ?? fallback?.companyGroupCode ?? "",
    companyGroupName: companyGroups[0]?.name ?? fallback?.companyGroupName ?? "",
    companyGroupCodes: companyGroups.length
      ? companyGroups.map((group) => group.code).filter(Boolean)
      : fallback?.companyGroupCodes ?? [],
    companyGroupNames: companyGroups.length
      ? companyGroups.map((group) => group.name).filter(Boolean)
      : fallback?.companyGroupNames ?? [],
    contactSourceCode: company.contactSource?.code ?? fallback?.contactSourceCode ?? "",
    contactSourceText: company.contactSourceText ?? fallback?.contactSourceText ?? "",
    sector: company.sector ?? fallback?.sector ?? "",
    supplierCategoryCode: company.supplierCategoryCode ?? fallback?.supplierCategoryCode ?? undefined,
    name: company.legalTitle ?? company.shortName ?? fallback?.name ?? "—",
    shortName: company.shortName ?? fallback?.shortName ?? undefined,
    contactPerson: fallback?.contactPerson ?? "",
    phone: primaryPhone(company) || fallback?.phone || "",
    phone2: secondaryPhone(company) || fallback?.phone2 || "",
    fax: fax(company) || fallback?.fax || "",
    email: primaryEmail(company) || fallback?.email || "",
    email2: secondaryEmail(company) || fallback?.email2 || "",
    city: primaryAddress?.province ?? fallback?.city ?? "",
    district: primaryAddress?.district ?? fallback?.district ?? "",
    country: primaryAddress?.country ?? fallback?.country ?? "",
    address: primaryAddress?.fullAddress ?? fallback?.address ?? "",
    addresses: addresses.length ? addresses : fallback?.addresses ?? [],
    latitude: finiteCoordinate(primaryAddress?.latitude) ?? fallback?.latitude,
    longitude: finiteCoordinate(primaryAddress?.longitude) ?? fallback?.longitude,
    locationSource: primaryAddress?.locationSource ?? fallback?.locationSource ?? undefined,
    taxOffice: company.taxOffice ?? fallback?.taxOffice ?? "",
    taxNumber: company.taxNumber ?? fallback?.taxNumber ?? "",
    website: company.website ?? fallback?.website ?? "",
    wantedProduct: fallback?.wantedProduct ?? "",
    initialNote: company.notes ?? fallback?.initialNote ?? "",
    source: company.contactSource?.name ?? company.contactSourceText ?? fallback?.source ?? "",
    status: fallback?.status ?? "active",
    createdAt: company.createdAt?.slice(0, 10) ?? fallback?.createdAt ?? "",
    createdByUserId: company.createdByUser?.id ?? company.createdBy ?? fallback?.createdByUserId ?? null,
    createdByName: company.createdByUser?.fullName ?? fallback?.createdByName ?? null,
    createdByEmail: company.createdByUser?.email ?? fallback?.createdByEmail ?? null,
  };
}
