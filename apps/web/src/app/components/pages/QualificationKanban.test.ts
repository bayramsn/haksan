import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./QualificationKanban.tsx", import.meta.url), "utf8");

describe("QualificationKanban LOST yeniden açma akışı", () => {
  it("LOST kart sürüklemesini normal derece geçişi yerine geri açma akışına yönlendirir", () => {
    expect(source).toContain('if (from === "lost")');
    expect(source).toContain("setPendingLostReopen(salesCase)");
    expect(source).toContain("await reopenCase(salesCase.id)");
  });

  it("kartta ve onay yüzeyinde anlaşılır Lead geri açma işlemi sunar", () => {
    expect(source).toContain("LOST kaydını yeniden aç");
    expect(source).toContain("Lead'e geri aç");
    expect(source).toContain("canReopenLost");
  });
});
