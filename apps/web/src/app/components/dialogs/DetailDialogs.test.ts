import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CompanyDetailDialog firma notları", () => {
  it("firma notunu satır sonlarını ve uzun kelimeleri koruyarak gösterir", () => {
    const source = readFileSync(new URL("./DetailDialogs.tsx", import.meta.url), "utf8");

    expect(source).toContain('aria-label="Firma notları"');
    expect(source).toContain("customer.initialNote?.trim()");
    expect(source).toContain("whitespace-pre-wrap");
    expect(source).toContain("break-words");
    expect(source).toContain("Bu firma için henüz not eklenmemiş.");
  });
});
