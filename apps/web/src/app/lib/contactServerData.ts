import type { QueryClient } from "@tanstack/react-query";
import type { Contact } from "./mock";
import { contactService, type Paginated } from "../../lib/services";

export const CONTACT_PAGE_SIZE = 12;
export const CONTACT_QUERY_ROOT = ["contacts-server"] as const;

export type ContactQueryScope = {
  tenantId: string;
  userId: string;
  activeDivision: string;
  activeDepartment: string | null;
};

export type ContactSort = {
  sortBy: "createdAt" | "name";
  sortDir: "asc" | "desc";
};

export type ContactListFilters = ContactSort & {
  page: number;
  search: string;
  companyId: string;
  department: string;
  primaryOnly: boolean;
  divisionId: string;
};

export type ContactCompanySummary = {
  id: string;
  name: string;
  legalTitle: string;
  shortName?: string;
  companyNo?: string;
  city?: string;
  isPrimary: boolean;
};

export type ServerContact = Contact & {
  firm: ContactCompanySummary | null;
  companyLinks: ContactCompanySummary[];
};

type ContactCompanyDto = {
  id?: unknown;
  companyId?: unknown;
  legalTitle?: unknown;
  shortName?: unknown;
  externalCompanyNo?: unknown;
  city?: unknown;
  province?: unknown;
  isPrimary?: unknown;
};

const text = (value: unknown) => String(value ?? "").trim();

const normalizeCompany = (value: ContactCompanyDto | null | undefined): ContactCompanySummary | null => {
  const id = text(value?.id ?? value?.companyId);
  if (!id) return null;
  const legalTitle = text(value?.legalTitle);
  const shortName = text(value?.shortName);
  return {
    id,
    name: shortName || legalTitle || "İsimsiz firma",
    legalTitle,
    shortName: shortName || undefined,
    companyNo: text(value?.externalCompanyNo) || undefined,
    city: text(value?.city ?? value?.province) || undefined,
    isPrimary: Boolean(value?.isPrimary),
  };
};

/** API contact DTO'sunu legacy form/detail bileşenlerinin beklediği güvenli şekle dönüştürür. */
export function normalizeServerContact(value: any): ServerContact {
  const rawCompanyLinks: ContactCompanyDto[] = Array.isArray(value?.companyLinks) ? value.companyLinks : [];
  const linkedCompanies: ContactCompanySummary[] = rawCompanyLinks
    .map((company: ContactCompanyDto) => normalizeCompany(company))
    .filter((company: ContactCompanySummary | null): company is ContactCompanySummary => Boolean(company));
  const embeddedCompany = normalizeCompany(value?.company);
  const primaryCompany =
    linkedCompanies.find((company) => company.isPrimary)
    ?? embeddedCompany
    ?? linkedCompanies[0]
    ?? null;
  const companyLinks = primaryCompany && !linkedCompanies.some((company) => company.id === primaryCompany.id)
    ? [primaryCompany, ...linkedCompanies]
    : linkedCompanies;
  const companyIds = Array.from(new Set([
    text(value?.companyId),
    primaryCompany?.id ?? "",
    ...companyLinks.map((company) => company.id),
  ].filter(Boolean)));

  return {
    id: text(value?.id),
    contactNo: text(value?.externalContactNo),
    companyNo: primaryCompany?.companyNo ?? "",
    customerId: primaryCompany?.id ?? text(value?.companyId),
    companyIds,
    name: text(value?.fullName),
    title: text(value?.title),
    department: text(value?.department),
    phone: text(value?.workPhone ?? value?.mobilePhone),
    phoneExtension: text(value?.phoneExtension),
    mobilePhone: text(value?.mobilePhone),
    otherPhone: text(value?.otherPhone),
    email: text(value?.workEmail ?? value?.personalEmail ?? value?.otherEmail),
    personalEmail: text(value?.personalEmail),
    otherEmail: text(value?.otherEmail),
    gender: text(value?.gender),
    birthDate: text(value?.birthDate).slice(0, 10),
    decisionRoleCode: text(value?.decisionRole?.code),
    decisionRoleName: text(value?.decisionRole?.name),
    hometown: text(value?.hometown),
    favoriteTeam: text(value?.favoriteTeam),
    favoriteColor: text(value?.favoriteColor),
    graduatedSchool: text(value?.graduatedSchool),
    isPrimary: Boolean(value?.isPrimary),
    note: text(value?.notes),
    isBlacklisted: Boolean(value?.isBlacklisted),
    blacklistReason: text(value?.blacklistReason),
    createdAt: text(value?.createdAt).slice(0, 10),
    createdByUserId: text(value?.createdByUser?.id ?? value?.createdBy) || null,
    createdByName: text(value?.createdByUser?.fullName ?? value?.createdByUser?.name) || null,
    createdByEmail: text(value?.createdByUser?.email) || null,
    firm: primaryCompany,
    companyLinks,
  };
}

export function buildContactListParams(filters: ContactListFilters) {
  return {
    page: Math.max(1, filters.page),
    pageSize: CONTACT_PAGE_SIZE,
    search: filters.search.trim() || undefined,
    companyId: filters.companyId !== "all" ? filters.companyId : undefined,
    department: filters.department !== "all" ? filters.department : undefined,
    isPrimary: filters.primaryOnly ? "true" : undefined,
    divisionId: filters.divisionId !== "all" ? filters.divisionId : undefined,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  } satisfies Record<string, string | number | undefined>;
}

export const contactQueryKeys = {
  root: CONTACT_QUERY_ROOT,
  list: (scope: ContactQueryScope, params: ReturnType<typeof buildContactListParams>) =>
    [...CONTACT_QUERY_ROOT, "list", scope, params] as const,
  summary: (scope: ContactQueryScope, divisionId: string) =>
    [...CONTACT_QUERY_ROOT, "summary", scope, divisionId] as const,
  companyContacts: (scope: ContactQueryScope, companyId: string) =>
    [...CONTACT_QUERY_ROOT, "company", scope, companyId] as const,
};

export async function loadAllCompanyContacts(companyId: string, signal?: AbortSignal): Promise<{ data: ServerContact[]; total: number }> {
  const pageSize = 200;
  const first = await contactService.list({ companyId, page: 1, pageSize }, { signal });
  const totalPages = Math.max(1, Number(first.meta?.totalPages ?? 1));
  const remaining = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          contactService.list({ companyId, page: index + 2, pageSize }, { signal })
        )
      )
    : [];
  const pages: Paginated<any>[] = [first, ...remaining];
  return {
    data: pages.flatMap((page) => page.data).map(normalizeServerContact),
    total: Number(first.meta?.total ?? first.data.length),
  };
}

export function invalidateContactQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: CONTACT_QUERY_ROOT });
}
