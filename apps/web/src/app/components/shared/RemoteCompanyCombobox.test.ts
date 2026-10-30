import { describe, expect, it } from "vitest";
import type { CompanyDTO } from "../../../lib/services";
import { mergeRemoteCompanyOptions, REMOTE_COMPANY_PAGE_SIZE } from "./RemoteCompanyCombobox";

const company = (id: string, legalTitle: string): CompanyDTO => ({
  id,
  legalTitle,
  createdAt: "2026-08-10T00:00:00.000Z",
});

describe("RemoteCompanyCombobox", () => {
  it("ilk arama sayfasını 25 kayıtla sınırlar", () => {
    expect(REMOTE_COMPANY_PAGE_SIZE).toBe(25);
  });

  it("sayfada olmayan seçili firmayı başa hydrate eder", () => {
    const options = mergeRemoteCompanyOptions(
      [company("page-1", "Sayfadaki Firma")],
      company("selected", "Seçili Eski Firma"),
    );
    expect(options.map((option) => option.value)).toEqual(["selected", "page-1"]);
  });

  it("seçili firma zaten sayfadaysa mükerrer seçenek üretmez", () => {
    const options = mergeRemoteCompanyOptions(
      [company("selected", "Güncel Ünvan")],
      company("selected", "Eski Ünvan"),
    );
    expect(options).toHaveLength(1);
    expect(options[0]?.label).toBe("Güncel Ünvan");
  });
});
