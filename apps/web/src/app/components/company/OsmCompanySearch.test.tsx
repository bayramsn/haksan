import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OsmCompanySearch", () => {
  it("firma formunun içinde ikinci form veya submit düğmesi oluşturmaz", () => {
    const source = readFileSync(new URL("./OsmCompanySearch.tsx", import.meta.url), "utf8");

    expect(source).not.toMatch(/<form(?:\s|>)/);
    expect(source).toContain('role="search"');
    expect(source).toContain('type="button"');
    expect(source).not.toContain('type="submit"');
    expect(source).toContain("event.stopPropagation()");
  });
});
