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

describe('remote option completion guards', () => {
  it('rejects invalid pagination rather than silently hiding later matches', async () => {
    const { remoteOptionHasNext } = await import('./remoteOptionPagination');
    expect(remoteOptionHasNext({ data: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 } }, 1)).toBe(false);
    expect(() => remoteOptionHasNext({ data: [], meta: { page: 1, pageSize: 25, total: 50, totalPages: 2 } }, 1)).toThrow('doğrulanamadı');
    expect(() => remoteOptionHasNext({ data: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 } }, 2)).toThrow('doğrulanamadı');
  });
  it('allows creation only after a successful exhaustive settled search', async () => {
    const { canCreateRemoteOption } = await import('./remoteOptionPagination');
    const ready = { query: 'Yeni', debouncedQuery: 'Yeni', success: true, fetching: false, error: false, hasNext: false, labels: [] };
    expect(canCreateRemoteOption(ready)).toBe(true);
    for (const change of [{ debouncedQuery: '' }, { success: false }, { fetching: true }, { error: true }, { hasNext: true }, { labels: ['YENİ'] }]) {
      expect(canCreateRemoteOption({ ...ready, ...change })).toBe(false);
    }
  });
});
