import { describe, expect, it } from "vitest";
import type { CompanyDTO } from "../../lib/services";
import { normalizeCompany } from "./companyNormalizer";

const company = (patch: Partial<CompanyDTO> = {}): CompanyDTO => ({
  id: "company-1",
  legalTitle: "Haksan Test A.Ş.",
  createdAt: "2026-08-10T09:30:00.000Z",
  ...patch,
});

describe("normalizeCompany", () => {
  it("liste DTO'sunu store ile aynı UI alanlarına dönüştürür", () => {
    const normalized = normalizeCompany(company({
      companyType: "person",
      externalCompanyNo: "F-42",
      relationType: { code: "supplier_customer", name: "Tedarikçi + Müşteri" },
      customerStatus: { code: "active", name: "Aktif" },
      supplierCategoryCode: "logistics",
      divisions: [{ id: "division-1", code: "cnc", name: "CNC" }],
      companyGroups: [
        { id: "group-1", code: "a_group", name: "A Grubu" },
        { id: "group-2", code: "hidden", name: "Gizli" },
      ],
      primaryAddress: {
        id: "address-1",
        addressType: "factory",
        country: "Türkiye",
        province: "İstanbul",
        district: "Ümraniye",
        fullAddress: "Dudullu OSB",
        latitude: "41.02",
        longitude: "29.14",
        isDefault: true,
      },
      primaryPhone: "+90 212 000 00 00",
      primaryEmail: "info@example.com",
      createdByUser: { id: "user-1", fullName: "Test Kullanıcı", email: "test@example.com" },
    }));

    expect(normalized).toMatchObject({
      id: "company-1",
      companyNo: "F-42",
      type: "person",
      firmType: "supplier_customer",
      salesStatus: "active_customer",
      supplierCategoryCode: "logistics",
      city: "İstanbul",
      district: "Ümraniye",
      latitude: 41.02,
      longitude: 29.14,
      phone: "+90 212 000 00 00",
      email: "info@example.com",
      companyGroupCodes: ["a_group"],
      createdAt: "2026-08-10",
      createdByName: "Test Kullanıcı",
    });
  });

  it("detay DTO'sunda telefon/e-posta/adresi türetir ve eksik lookup'ları fallback'ten korur", () => {
    const fallback = normalizeCompany(company({
      relationType: { code: "competitor", name: "Rakip" },
      customerStatus: { code: "potential", name: "Potansiyel" },
    }));
    const detail = normalizeCompany(company({
      phones: [{ phone: "555 000 00 00", phoneType: "main" }],
      emails: [{ email: "detail@example.com", isDefault: true }],
      addresses: [{ province: "Ankara", fullAddress: "OSTİM", isDefault: true }],
    }), fallback);

    expect(detail.firmType).toBe("competitor");
    expect(detail.salesStatus).toBe("potential");
    expect(detail.phone).toBe("555 000 00 00");
    expect(detail.email).toBe("detail@example.com");
    expect(detail.city).toBe("Ankara");
    expect(detail.address).toBe("OSTİM");
  });
});
