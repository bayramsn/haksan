import { describe, expect, it } from "vitest";
import { compareSortValues, nextSort, type SortValue } from "./sortable-table";

const order = (values: SortValue[], dir: "asc" | "desc") => [...values].sort((a, b) => compareSortValues(a, b, dir));

describe("liste kolon sıralaması", () => {
  it("metni Türkçe ve sayı duyarlı sıralar, boşu iki yönde de sona atar", () => {
    const values = ["Zeta", "", "MV-1050", "çelik", null, "MV-850", "Ceylan"];
    expect(order(values, "asc").slice(0, 5)).toEqual(["Ceylan", "çelik", "MV-850", "MV-1050", "Zeta"]);
    expect(order(values, "desc").slice(0, 5)).toEqual(["Zeta", "MV-1050", "MV-850", "çelik", "Ceylan"]);
  });

  it("sayı ve tarihi büyüklüğe göre sıralar", () => {
    expect(order([85000, undefined, 9000], "asc")).toEqual([9000, 85000, undefined]);
    const [a, b] = [new Date("2026-01-02"), new Date("2026-03-04")];
    expect(order([b, a], "asc")).toEqual([a, b]);
  });

  it("aynı başlık yönü çevirir, yeni başlık artandan başlar", () => {
    expect(nextSort(null, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "desc" }, "brand")).toEqual({ key: "brand", dir: "asc" });
  });
});
