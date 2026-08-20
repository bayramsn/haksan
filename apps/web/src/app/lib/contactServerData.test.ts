import { describe, expect, it } from "vitest";
import {
  CONTACT_PAGE_SIZE,
  buildContactListParams,
  contactQueryKeys,
  normalizeServerContact,
} from "./contactServerData";

describe("contact server data", () => {
  it("12 kayıtlık sunucu sayfası için arama, filtre ve sıralama parametrelerini üretir", () => {
    expect(buildContactListParams({
      page: 3,
      search: "  ayşe  ",
      companyId: "company-1",
      department: "Satış",
      primaryOnly: true,
      divisionId: "division-1",
      sortBy: "name",
      sortDir: "asc",
    })).toEqual({
      page: 3,
      pageSize: CONTACT_PAGE_SIZE,
      search: "ayşe",
      companyId: "company-1",
      department: "Satış",
      isPrimary: "true",
      divisionId: "division-1",
      sortBy: "name",
      sortDir: "asc",
    });
  });

  it("all filtrelerini API sorgusundan çıkarır", () => {
    expect(buildContactListParams({
      page: 0,
      search: " ",
      companyId: "all",
      department: "all",
      primaryOnly: false,
      divisionId: "all",
      sortBy: "createdAt",
      sortDir: "desc",
    })).toMatchObject({
      page: 1,
      pageSize: 12,
      search: undefined,
      companyId: undefined,
      department: undefined,
      isPrimary: undefined,
      divisionId: undefined,
    });
  });

  it("query key'lerinde aktif iş alanı ve departmanı ayırır", () => {
    const params = buildContactListParams({
      page: 1,
      search: "",
      companyId: "all",
      department: "all",
      primaryOnly: false,
      divisionId: "all",
      sortBy: "createdAt",
      sortDir: "desc",
    });
    const firstScope = { tenantId: "tenant-a", userId: "user-a", activeDivision: "division-a", activeDepartment: "department-a" };
    const secondScope = { ...firstScope, activeDepartment: "department-b" };
    const first = contactQueryKeys.list(firstScope, params);
    const second = contactQueryKeys.list(secondScope, params);

    expect(first).not.toEqual(second);
    expect(first).toContainEqual(firstScope);
  });

  it("summary cache'ini seçili iş alanına göre ayırır", () => {
    const scope = { tenantId: "tenant-a", userId: "user-a", activeDivision: "all", activeDepartment: "department-a" };
    expect(contactQueryKeys.summary(scope, "division-a"))
      .not.toEqual(contactQueryKeys.summary(scope, "division-b"));
  });

  it("aynı filtreyi farklı kullanıcı ve tenant cache'lerinde ayırır", () => {
    const base = { activeDivision: "all", activeDepartment: "department-a" };
    expect(contactQueryKeys.summary({ ...base, tenantId: "tenant-a", userId: "user-a" }, "all"))
      .not.toEqual(contactQueryKeys.summary({ ...base, tenantId: "tenant-b", userId: "user-b" }, "all"));
  });

  it("satırdaki companyLinks birincil firmasını liste görünümüne taşır", () => {
    const contact = normalizeServerContact({
      id: "contact-1",
      fullName: "Ayşe Yılmaz",
      companyId: "hidden-company",
      company: { id: "company-2", legalTitle: "İkincil AŞ", shortName: null },
      companyLinks: [
        { id: "company-2", legalTitle: "İkincil AŞ", shortName: null, isPrimary: false },
        { id: "company-1", legalTitle: "Haksan Makina AŞ", shortName: "Haksan", externalCompanyNo: "F-10", isPrimary: true },
      ],
      createdAt: "2026-08-10T09:00:00.000Z",
    });

    expect(contact.customerId).toBe("company-1");
    expect(contact.firm).toMatchObject({ id: "company-1", name: "Haksan", companyNo: "F-10" });
    expect(contact.companyIds).toEqual(expect.arrayContaining(["company-1", "company-2"]));
    expect(contact.createdAt).toBe("2026-08-10");
  });
});
