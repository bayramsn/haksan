import { describe, expect, it } from "vitest";
import { inMonth, monthQuery, parseMonthQuery } from "./monthQuery";

describe("monthQuery", () => {
  it("round-trips a month and a year bucket", () => {
    expect(parseMonthQuery(monthQuery("2026-03"))).toEqual({ month: "2026-03", text: "" });
    expect(parseMonthQuery(monthQuery("2026"))).toEqual({ month: "2026", text: "" });
  });

  it("leaves free text alone and drops a malformed bucket", () => {
    expect(parseMonthQuery("Torna")).toEqual({ month: null, text: "Torna" });
    expect(parseMonthQuery(undefined)).toEqual({ month: null, text: "" });
    expect(parseMonthQuery("month:bozuk")).toEqual({ month: null, text: "" });
  });

  it("matches dates by prefix only", () => {
    expect(inMonth("2026-03-14", "2026-03")).toBe(true);
    expect(inMonth("2026-04-01", "2026-03")).toBe(false);
    expect(inMonth("2026-04-01", "2026")).toBe(true);
    expect(inMonth(undefined, "2026")).toBe(false);
    expect(inMonth(undefined, null)).toBe(true);
  });
});
