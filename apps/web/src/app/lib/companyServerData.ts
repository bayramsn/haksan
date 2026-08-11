import { keepPreviousData, type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth";
import {
  companyService,
  type CompanyDTO,
  type CompanySummaryDTO,
  type Paginated,
} from "../../lib/services";
import type { Customer, CustomerSalesStatus, FirmType } from "./mock";
import { normalizeCompany } from "./companyNormalizer";
import { DEFAULT_SERVER_PAGE_SIZE, serverScopeKey } from "./serverPagination";

export type CompanySortMode = "default" | "name_asc" | "name_desc" | "created_desc" | "created_asc";

export interface CompanyDirectoryFilters {
  page: number;
  search?: string;
  relationType?: "all" | FirmType;
  salesStatus?: "all" | CustomerSalesStatus;
  divisionId?: string;
  city?: string;
  sector?: string;
  supplierCategoryCode?: "all" | "transportation" | "logistics";
  sortMode?: CompanySortMode;
}

export interface CompanyListParams extends Record<string, string | number | undefined> {
  page: number;
  pageSize: number;
  search?: string;
  relationTypeCode?: FirmType;
  customerStatusCode?: "active" | "potential";
  divisionId?: string;
  city?: string;
  sector?: string;
  supplierCategoryCode?: "transportation" | "logistics";
  sortBy?: "name" | "createdAt";
  sortDir?: "asc" | "desc";
}

export interface CompanyQueryScope {
  tenant: string;
  user: string;
  division: string;
  department: string;
}

export function companyDirectoryViewAfterSave(previous: FirmType, next: FirmType) {
  if (previous === next) return null;
  return {
    relationType: next,
    salesStatus: "all" as const,
    supplierCategoryCode: "all" as const,
    page: 1,
  };
}

export const EMPTY_COMPANY_SUMMARY: CompanySummaryDTO = {
  total: 0,
  byRelation: {},
  byStatus: {},
  cities: [],
  sectors: [],
};

export function buildCompanyListParams(filters: CompanyDirectoryFilters): CompanyListParams {
  const search = filters.search?.trim();
  const relationTypeCode = filters.relationType && filters.relationType !== "all"
    ? filters.relationType
    : undefined;
  const customerStatusCode = filters.salesStatus === "active_customer"
    ? "active"
    : filters.salesStatus === "potential"
      ? "potential"
      : undefined;
  const supplierCategoryCode = filters.supplierCategoryCode && filters.supplierCategoryCode !== "all"
    ? filters.supplierCategoryCode
    : undefined;

  let sortBy: CompanyListParams["sortBy"];
  let sortDir: CompanyListParams["sortDir"];
  switch (filters.sortMode) {
    case "name_asc":
      sortBy = "name";
      sortDir = "asc";
      break;
    case "name_desc":
      sortBy = "name";
      sortDir = "desc";
      break;
    case "created_asc":
      sortBy = "createdAt";
      sortDir = "asc";
      break;
    case "created_desc":
    case "default":
    case undefined:
      sortBy = "createdAt";
      sortDir = "desc";
      break;
  }

  return {
    page: Math.max(1, Math.floor(filters.page)),
    pageSize: DEFAULT_SERVER_PAGE_SIZE,
    search: search || undefined,
    relationTypeCode,
    customerStatusCode,
    divisionId: filters.divisionId && filters.divisionId !== "all" ? filters.divisionId : undefined,
    city: filters.city && filters.city !== "all" ? filters.city : undefined,
    sector: filters.sector && filters.sector !== "all" ? filters.sector : undefined,
    supplierCategoryCode,
    sortBy,
    sortDir,
  };
}

export const companyQueryKeys = {
  all: ["companies"] as const,
  lists: () => ["companies", "list"] as const,
  list: (scope: CompanyQueryScope, params: CompanyListParams) => ["companies", "list", scope, params] as const,
  summaries: () => ["companies", "summary"] as const,
  summary: (scope: CompanyQueryScope, divisionId?: string) => ["companies", "summary", scope, divisionId ?? "all"] as const,
  details: () => ["companies", "detail"] as const,
  detail: (scope: CompanyQueryScope, id: string) => ["companies", "detail", scope, id] as const,
};

export function useCompanyDirectory(filters: CompanyDirectoryFilters) {
  const { user, activeDivision, activeDepartment } = useAuth();
  const scope = serverScopeKey(activeDivision, activeDepartment, user?.tenantId, user?.id);
  const params = buildCompanyListParams(filters);

  return useQuery({
    queryKey: companyQueryKeys.list(scope, params),
    queryFn: ({ signal }) => companyService.list(params, { signal }),
    placeholderData: keepPreviousData,
    select: (response): Paginated<Customer> => ({
      ...response,
      data: response.data.map((company) => normalizeCompany(company)),
    }),
  });
}

export function useCompanySummary(divisionId?: string) {
  const { user, activeDivision, activeDepartment } = useAuth();
  const scope = serverScopeKey(activeDivision, activeDepartment, user?.tenantId, user?.id);
  const selectedDivision = divisionId && divisionId !== "all" ? divisionId : undefined;

  return useQuery({
    queryKey: companyQueryKeys.summary(scope, selectedDivision),
    queryFn: ({ signal }) => companyService.summary(
      selectedDivision ? { divisionId: selectedDivision } : undefined,
      { signal },
    ),
  });
}

export function useCompanyDetail(companyId?: string | null, fallback?: Customer) {
  const { user, activeDivision, activeDepartment } = useAuth();
  const scope = serverScopeKey(activeDivision, activeDepartment, user?.tenantId, user?.id);

  return useQuery({
    queryKey: companyId
      ? companyQueryKeys.detail(scope, companyId)
      : [...companyQueryKeys.details(), scope, "none"],
    queryFn: ({ signal }) => companyService.get(companyId as string, { signal }),
    enabled: Boolean(companyId),
    select: (company) => normalizeCompany(company, fallback),
  });
}

export function uniqueCompanyDetailIds(companyIds: Array<string | null | undefined>): string[] {
  return Array.from(new Set(companyIds.filter((id): id is string => Boolean(id?.trim())))).sort();
}

/**
 * Hydrates the companies represented by opportunity cards without restoring
 * the old global full-directory download. Detail requests stay identity scoped,
 * share the regular company detail cache and are capped at eight in flight.
 */
export function useCompanyCardDetails(
  companyIds: Array<string | null | undefined>,
  fallbacks: Customer[] = [],
) {
  const { user, activeDivision, activeDepartment } = useAuth();
  const queryClient = useQueryClient();
  const scope = serverScopeKey(activeDivision, activeDepartment, user?.tenantId, user?.id);
  const ids = uniqueCompanyDetailIds(companyIds);
  const fallbackById = new Map(fallbacks.map((company) => [company.id, company]));

  return useQuery({
    queryKey: [...companyQueryKeys.details(), "opportunity-card-set", scope, ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }): Promise<CompanyDTO[]> => {
      const companies: CompanyDTO[] = [];
      let cursor = 0;
      const worker = async () => {
        while (cursor < ids.length) {
          const id = ids[cursor++];
          try {
            const company = await companyService.get(id, { signal });
            companies.push(company);
            queryClient.setQueryData(companyQueryKeys.detail(scope, id), company);
          } catch (error) {
            if (signal.aborted) throw error;
            // One inaccessible or deleted company must not hide the addresses
            // of every other visible opportunity card.
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(8, ids.length) }, () => worker()),
      );
      return companies;
    },
    select: (companies): Record<string, Customer> => Object.fromEntries(
      companies.map((company) => [company.id, normalizeCompany(company, fallbackById.get(company.id))]),
    ),
  });
}

/**
 * Explicit full-directory loader for screens whose purpose inherently requires
 * every visible company (currently the map views). It is intentionally a hook,
 * not part of the global store, so sensitive company rows are downloaded only
 * when the user opens such a screen and are still isolated by auth identity.
 */
export function useExplicitFullCompanyDirectory(purpose: string) {
  const { user, activeDivision, activeDepartment } = useAuth();
  const scope = serverScopeKey(activeDivision, activeDepartment, user?.tenantId, user?.id);

  return useQuery({
    queryKey: [...companyQueryKeys.all, "explicit-full-directory", purpose, scope],
    queryFn: async ({ signal }): Promise<Customer[]> => {
      const pageSize = 200;
      const first = await companyService.list(
        { page: 1, pageSize, sortBy: "name", sortDir: "asc" },
        { signal },
      );
      const totalPages = Math.max(1, Number(first.meta?.totalPages ?? 1));
      const remaining = totalPages > 1
        ? await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, index) =>
              companyService.list(
                { page: index + 2, pageSize, sortBy: "name", sortDir: "asc" },
                { signal },
              ),
            ),
          )
        : [];
      return [first, ...remaining]
        .flatMap((page) => page.data)
        .map((company) => normalizeCompany(company));
    },
  });
}

export async function fetchFreshCompany(
  queryClient: QueryClient,
  scope: CompanyQueryScope,
  company: Customer,
): Promise<Customer> {
  const detail = await queryClient.fetchQuery({
    queryKey: companyQueryKeys.detail(scope, company.id),
    queryFn: ({ signal }) => companyService.get(company.id, { signal }),
    staleTime: 0,
  });
  return normalizeCompany(detail, company);
}
