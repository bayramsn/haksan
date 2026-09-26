import { describe, expect, it, vi } from "vitest";
import { hydrateQuoteProductReferences, quoteLineCatalog } from "./quoteProductReferences";

describe("existing quote product references", () => {
  it("loads each omitted reference once, including options, without mutating the catalog", async () => {
    const catalog = [{ id: "current" }];
    const legacy = { id: "legacy", categoryCode: "TEZGAH", listPrice: 123, technicalConfiguration: { powerKw: 6 } };
    const load = vi.fn(async () => legacy);
    const hydrated = await hydrateQuoteProductReferences(catalog, [
      { productModelId: "current" }, { productModelId: "legacy" }, { productModelId: "legacy" }, { productModelId: null },
    ], load);
    expect(load).toHaveBeenCalledExactlyOnceWith("legacy");
    expect(hydrated).toEqual([legacy]);
    expect(catalog).toEqual([{ id: "current" }]);
    expect(quoteLineCatalog(catalog, legacy)).toEqual([...catalog, legacy]);
    expect(quoteLineCatalog(catalog)).toBe(catalog);
  });

  it("fails loading if a scoped reference is denied instead of silently saving incomplete lines", async () => {
    await expect(hydrateQuoteProductReferences([], [{ productModelId: "denied" }], async () => {
      throw new Error("Forbidden");
    })).rejects.toThrow("Forbidden");
  });

  it("does not duplicate a selected product already in the catalog", () => {
    const catalog = [{ id: "current" }];
    expect(quoteLineCatalog(catalog, catalog[0])).toBe(catalog);
  });
});
