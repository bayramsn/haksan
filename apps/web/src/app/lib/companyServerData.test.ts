import { describe, expect, it } from "vitest";
import {
  buildCompanyListParams,
  companyDirectoryViewAfterSave,
  companyQueryKeys,
  uniqueCompanyDetailIds,
} from "./companyServerData";
import { clampServerPage, normalizeTotalPages, serverScopeKey } from "./serverPagination";

describe("company server directory params", () => {
  it("aktif filtreleri backend sözleşmesine ve 12 kayıtlık sayfaya çevirir", () => {
    expect(buildCompanyListParams({
      page: 3,
      search: "  torna  ",
      relationType: "supplier",
      salesStatus: "active_customer",
      divisionId: "division-1",
      city: "İstanbul",
      sector: "Metal",
      supplierCategoryCode: "transportation",
      sortMode: "name_desc",
    })).toEqual({
      page: 3,
      pageSize: 12,
      search: "torna",
      relationTypeCode: "supplier",
      customerStatusCode: "active",
      divisionId: "division-1",
      city: "İstanbul",
      sector: "Metal",
      supplierCategoryCode: "transportation",
      sortBy: "name",
      sortDir: "desc",
    });
  });

  it("query key içinde kullanıcı, tenant, bölüm ve departman scope'unu taşır", () => {
    const scope = serverScopeKey("division-1", "department-2", "tenant-3", "user-4");
    const key = companyQueryKeys.list(scope, buildCompanyListParams({ page: 1 }));
    expect(key).toContainEqual({
      tenant: "tenant-3",
      user: "user-4",
      division: "division-1",
      department: "department-2",
    });
  });

  it("firma tipi değişince kullanıcıyı yeni sekmeye taşır ve gizleyebilecek filtreleri temizler", () => {
    expect(companyDirectoryViewAfterSave("customer", "competitor")).toEqual({
      relationType: "competitor",
      salesStatus: "all",
      supplierCategoryCode: "all",
      page: 1,
    });
    expect(companyDirectoryViewAfterSave("competitor", "competitor")).toBeNull();
  });

  it("fırsat kartı detay isteklerini boş kimliklerden arındırıp tekilleştirir", () => {
    expect(uniqueCompanyDetailIds(["company-2", "", null, "company-1", "company-2", undefined]))
      .toEqual(["company-1", "company-2"]);
  });
});

describe("server pagination guards", () => {
  it("geçersiz meta ve taşan sayfayı güvenli aralığa çeker", () => {
    expect(normalizeTotalPages(0)).toBe(1);
    expect(normalizeTotalPages("4")).toBe(4);
    expect(clampServerPage(8, 3)).toBe(3);
    expect(clampServerPage(Number.NaN, 3)).toBe(1);
  });
});
